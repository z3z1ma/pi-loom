import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRalphDashboard } from "../extensions/domain/dashboard.js";
import type { RalphLaunchDescriptor, RalphRunState } from "../extensions/domain/models.js";
import { renderLaunchDescriptor, renderLaunchPrompt } from "../extensions/domain/render.js";
import { getPiSpawnCommand, resolvePiCliScript, resolveRalphExtensionRoot } from "../extensions/domain/runtime.js";
import { createRalphStore } from "../extensions/domain/store.js";

describe("ralph runtime spawn resolution", () => {
  it("resolves the Ralph extension root from the package, not the caller workspace", () => {
    const extensionRoot = resolveRalphExtensionRoot();

    expect(extensionRoot.replace(/\\/g, "/")).toMatch(/\/packages\/pi-ralph$/);
  });

  it("renders stored repo-relative launch packet paths without re-relativizing them", () => {
    const launch: RalphLaunchDescriptor = {
      runId: "run-123",
      iterationId: "iter-001",
      iteration: 1,
      createdAt: "2026-03-15T14:33:00.000Z",
      runtime: "subprocess",
      packetPath: ".loom/ralph/run-123/packet.md",
      launchPath: ".loom/ralph/run-123/launch.json",
      resume: true,
      instructions: [],
    };

    expect(renderLaunchDescriptor("/tmp/different-root", launch)).toContain("Packet: .loom/ralph/run-123/packet.md");
    expect(renderLaunchPrompt("/tmp/different-root", launch)).toContain(
      "Execute one bounded Ralph iteration for run run-123 using .loom/ralph/run-123/packet.md.",
    );
  });

  it("normalizes dashboard artifact paths to repo-relative values", () => {
    const dashboard = buildRalphDashboard(
      {
        critiqueLinks: [],
        latestDecision: null,
        waitingFor: "operator",
      } as unknown as RalphRunState,
      {
        id: "run-123",
        title: "Repo hygiene",
        status: "active",
        phase: "executing",
        updatedAt: "2026-03-15T14:33:00.000Z",
        iterationCount: 2,
        policyMode: "balanced",
        decision: null,
        waitingFor: "operator",
        objectiveSummary: "Normalize stored paths",
        path: "/workspace/.loom/ralph/run-123",
      },
      [],
      {
        dir: "/workspace/.loom/ralph/run-123",
        state: "/workspace/.loom/ralph/run-123/state.json",
        packet: "/workspace/.loom/ralph/run-123/packet.md",
        run: "/workspace/.loom/ralph/run-123/run.md",
        iterations: "/workspace/.loom/ralph/run-123/iterations.jsonl",
        launch: "/workspace/.loom/ralph/run-123/launch.json",
      },
      ["pending", "running", "reviewing", "accepted", "rejected", "failed", "cancelled"],
      ["not_run", "pass", "concerns", "fail"],
    );

    expect(dashboard.packetPath).toBe(".loom/ralph/run-123/packet.md");
    expect(dashboard.runPath).toBe(".loom/ralph/run-123/run.md");
    expect(dashboard.launchPath).toBe(".loom/ralph/run-123/launch.json");
  });

  it("reuses the current script entrypoint when running under a JS runtime", () => {
    const command = getPiSpawnCommand(["--mode", "json"], {
      execPath: "/usr/local/bin/node",
      argv1: "/custom-fork/dist/omp-cli.js",
      existsSync: (filePath) => filePath === "/custom-fork/dist/omp-cli.js",
    });

    expect(command).toEqual({
      command: "/usr/local/bin/node",
      args: ["/custom-fork/dist/omp-cli.js", "--mode", "json"],
    });
  });

  it("reuses the current executable when running as a standalone binary", () => {
    const command = getPiSpawnCommand(["--mode", "json"], {
      execPath: "/opt/tools/omp",
      argv1: "resume ralph run",
      existsSync: () => false,
    });

    expect(command).toEqual({
      command: "/opt/tools/omp",
      args: ["--mode", "json"],
    });
  });

  it("falls back to the package bin script when only package metadata is available", () => {
    const packageJsonPath = "/pkg/package.json";
    const packageJson = JSON.stringify({ bin: { pi: "dist/cli.js" } });

    expect(
      resolvePiCliScript({
        execPath: "/usr/local/bin/node",
        argv1: "resume from packet",
        existsSync: (filePath) => filePath === "/pkg/dist/cli.js",
        readFileSync: (filePath) => {
          if (filePath !== packageJsonPath) {
            throw new Error(`Unexpected path ${filePath}`);
          }
          return packageJson;
        },
        resolvePackageJson: () => packageJsonPath,
      }),
    ).toBe("/pkg/dist/cli.js");
  });

  it("falls back to the pi command when no script path can be resolved", () => {
    const command = getPiSpawnCommand(["--mode", "json", "--no-session"], {
      execPath: "/usr/local/bin/node",
      argv1: "resume from packet",
      existsSync: () => false,
      readFileSync: () => {
        throw new Error("package metadata unavailable");
      },
      resolvePackageJson: () => {
        throw new Error("package metadata unavailable");
      },
    });

    expect(command).toEqual({
      command: "pi",
      args: ["--mode", "json", "--no-session"],
    });
  });
});

describe("ralph review-state gating", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "pi-ralph-runtime-"));
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(workspace, { recursive: true, force: true });
  });

  it("keeps reviewing runs gated when iteration verifier evidence is blocking", () => {
    const store = createRalphStore(workspace);

    vi.setSystemTime(new Date("2026-03-16T09:00:00.000Z"));
    const created = store.createRun({
      title: "Verifier-blocked review",
      objective: "Keep launch safety truthful while a verifier blocker is active.",
      policySnapshot: {
        verifierRequired: true,
        critiqueRequired: false,
      },
    });

    vi.setSystemTime(new Date("2026-03-16T09:01:00.000Z"));
    const reviewed = store.appendIteration(created.state.runId, {
      status: "reviewing",
      focus: "Record verifier evidence",
      summary: "Verifier blocked launch pending operator review.",
      verifier: {
        sourceKind: "test",
        sourceRef: "packages/pi-ralph/__tests__/runtime.test.ts",
        verdict: "fail",
        blocker: true,
        summary: "Runtime safety checks failed.",
      },
    });

    expect(reviewed.state.status).toBe("waiting_for_review");
    expect(reviewed.state.phase).toBe("reviewing");
    expect(reviewed.state.waitingFor).toBe("operator");
    expect(reviewed.launch.packetPath).toBe(`.loom/ralph/${created.state.runId}/packet.md`);
    expect(() => store.prepareLaunch(created.state.runId)).toThrow(
      "Ralph run verifier-blocked-review is waiting for operator and cannot launch until that gate is cleared.",
    );
  }, 90000);
});
