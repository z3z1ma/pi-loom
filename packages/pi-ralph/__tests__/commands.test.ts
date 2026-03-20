import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { createRalphStore } from "../extensions/domain/store.js";
import { handleRalphCommand } from "../extensions/commands/ralph.js";
import { runRalphLaunch } from "../extensions/domain/runtime.js";

vi.mock("../extensions/domain/runtime.js", () => ({
  runRalphLaunch: vi.fn(),
}));

function createTempWorkspace(): { cwd: string; cleanup: () => void } {
  const cwd = mkdtempSync(join(tmpdir(), "pi-ralph-command-"));
  return {
    cwd,
    cleanup: () => rmSync(cwd, { recursive: true, force: true }),
  };
}

function createContext(cwd: string): ExtensionCommandContext {
  return {
    cwd,
    hasUI: false,
    ui: { notify() {} },
    sessionManager: {
      getBranch: () => [
        { type: "message", message: { role: "user", content: [{ type: "text", text: "We need a robust retry loop." }] } },
        { type: "message", message: { role: "assistant", content: [{ type: "text", text: "Let's shape the bounded iterations carefully." }] } },
      ],
    },
  } as unknown as ExtensionCommandContext;
}

describe("/ralph command", () => {
  it("runs the requested number of bounded iterations from a prompt", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    const runRalphLaunchMock = vi.mocked(runRalphLaunch);
    runRalphLaunchMock.mockReset();
    try {
      runRalphLaunchMock
        .mockImplementationOnce(async (_cwd, launch) => {
          createRalphStore(cwd).appendIteration(launch.runId, {
            id: launch.iterationId,
            status: "accepted",
            summary: "Completed the first bounded iteration.",
            workerSummary: "Left durable state for the next iteration.",
            decision: {
              kind: "continue",
              reason: "unknown",
              summary: "Run another bounded iteration.",
              decidedAt: new Date().toISOString(),
              decidedBy: "runtime",
              blockingRefs: [],
            },
          });
          return { command: "pi", args: ["--mode", "json"], exitCode: 0, output: "iteration one", stderr: "" };
        })
        .mockImplementationOnce(async (_cwd, launch) => {
          createRalphStore(cwd).appendIteration(launch.runId, {
            id: launch.iterationId,
            status: "accepted",
            summary: "Completed the second bounded iteration.",
            workerSummary: "Left durable state again.",
            decision: {
              kind: "continue",
              reason: "unknown",
              summary: "Stop because the command-level iteration budget was reached.",
              decidedAt: new Date().toISOString(),
              decidedBy: "runtime",
              blockingRefs: [],
            },
          });
          return { command: "pi", args: ["--mode", "json"], exitCode: 0, output: "iteration two", stderr: "" };
        });

      const result = await handleRalphCommand("x2 investigate bounded loops", createContext(cwd));
      expect(runRalphLaunchMock).toHaveBeenCalledTimes(2);
      expect(result).toContain("Iterations executed this call: 2");
      expect(result).toContain("Latest output:");
      expect(result).toContain("iteration two");
    } finally {
      cleanup();
    }
  });

  it("seeds a new run from the current conversation context plus the prompt", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    const runRalphLaunchMock = vi.mocked(runRalphLaunch);
    runRalphLaunchMock.mockReset();
    try {
      runRalphLaunchMock.mockImplementationOnce(async (_cwd, launch) => {
        createRalphStore(cwd).appendIteration(launch.runId, {
          id: launch.iterationId,
          status: "accepted",
          summary: "Completed the seeded bounded iteration.",
          workerSummary: "Durable checkpoint stored.",
          decision: {
            kind: "continue",
            reason: "unknown",
            summary: "The operator can decide whether to continue.",
            decidedAt: new Date().toISOString(),
            decidedBy: "runtime",
            blockingRefs: [],
          },
        });
        return { command: "pi", args: ["--mode", "json"], exitCode: 0, output: "seeded iteration", stderr: "" };
      });

      await handleRalphCommand("shape the initial run carefully", createContext(cwd));
      const runs = await createRalphStore(cwd).listRunsAsync({});
      expect(runs).toHaveLength(1);
      const run = await createRalphStore(cwd).readRunAsync(runs[0]?.id ?? "");
      expect(run.state.objective).toContain("Operator prompt:");
      expect(run.state.objective).toContain("shape the initial run carefully");
      expect(run.state.objective).toContain("user: We need a robust retry loop.");
      expect(run.state.objective).toContain("assistant: Let's shape the bounded iterations carefully.");
    } finally {
      cleanup();
    }
  });
});
