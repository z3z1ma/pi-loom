import { PI_PARENT_HARNESS_PACKAGE_ROOT_ENV } from "@pi-loom/pi-ralph-wiggum/extensions/domain/runtime.js";
import { createRalphStore } from "@pi-loom/pi-ralph-wiggum/extensions/domain/store.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearFakeHarnessState,
  createFakeHarnessPackage,
  resetFakeHarnessState,
} from "../../pi-ralph-wiggum/__tests__/helpers/fake-harness.js";
import { createSeededGitWorkspace } from "../../pi-storage/__tests__/helpers/git-fixture.js";
import { scheduleManagerLoop, waitForManagerUpdate } from "../extensions/domain/manager-runtime.js";
import { createManagerStore } from "../extensions/domain/manager-store.js";

function createGitWorkspace(): { cwd: string; cleanup: () => void } {
  return createSeededGitWorkspace({ prefix: "pi-chief-runtime-smoke-" });
}

function parseLaunchPrompt(prompt: string): { runId: string; iterationId: string } {
  const runId = /Execute one bounded Ralph iteration for run (\S+) using/.exec(prompt)?.[1];
  const iterationId = /Iteration:\s+\d+\s+\(([^)]+)\)/.exec(prompt)?.[1];
  if (!runId || !iterationId) {
    throw new Error(`Unable to parse Ralph launch prompt:\n${prompt}`);
  }
  return { runId, iterationId };
}

describe("chief manager session-runtime smoke", () => {
  let fakeHarnessRoot: string;
  let cleanupFakeHarness: (() => void) | undefined;

  beforeEach(() => {
    resetFakeHarnessState();
    const fakeHarness = createFakeHarnessPackage();
    fakeHarnessRoot = fakeHarness.root;
    cleanupFakeHarness = fakeHarness.cleanup;
  });

  afterEach(() => {
    clearFakeHarnessState();
    cleanupFakeHarness?.();
    cleanupFakeHarness = undefined;
  });

  it("durably advances a scheduled manager pass through the real Ralph session runtime", async () => {
    const { cwd, cleanup } = createGitWorkspace();
    try {
      const managerStore = createManagerStore(cwd);
      const manager = await managerStore.createManagerAsync({ title: "Smoke Manager" });
      const initialUpdatedAt = manager.state.updatedAt;
      let lastPrompt = "";
      let checkpointIterationId = "";

      globalThis.__piLoomHarnessOutcome = {
        deferAssistantUntilSessionIdle: true,
        text: "manager smoke pass complete",
      };
      globalThis.__piLoomHarnessHook = async ({ phase, promptText, sessionOptions, emitEvent }) => {
        if (phase === "prompt") {
          lastPrompt = promptText ?? "";
          return;
        }
        if (phase !== "sessionWaitForIdle") {
          return;
        }

        const { runId, iterationId } = parseLaunchPrompt(lastPrompt);
        checkpointIterationId = iterationId;
        const sessionCwd = typeof sessionOptions?.cwd === "string" ? sessionOptions.cwd : cwd;
        await createRalphStore(sessionCwd).appendIterationAsync(runId, {
          id: iterationId,
          status: "accepted",
          summary: "Manager smoke iteration checkpointed through fake harness.",
          workerSummary: "Session waitForIdle delivered the durable Ralph checkpoint.",
          decision: {
            kind: "pause",
            reason: "operator_requested",
            summary: "Pause after the smoke manager pass.",
            decidedAt: new Date().toISOString(),
            decidedBy: "runtime",
            blockingRefs: [],
          },
        });
        await createManagerStore(sessionCwd).recordManagerStepAsync(manager.state.managerId, {
          status: "active",
          summary: "Manager durable state updated from the real session runtime path.",
        });
        emitEvent({
          type: "tool_call_end",
          toolCall: { id: "tool-manager-record", name: "manager_record" },
        });
      };

      scheduleManagerLoop(cwd, manager.state.managerId, {
        [PI_PARENT_HARNESS_PACKAGE_ROOT_ENV]: fakeHarnessRoot,
      });

      const startedAt = Date.now();
      const updated = await waitForManagerUpdate(cwd, manager.state.managerId, {
        timeoutMs: 15_000,
        pollIntervalMs: 2_000,
      });
      const elapsedMs = Date.now() - startedAt;
      const run = await createRalphStore(cwd).readRunAsync(manager.state.ralphRunId);
      const callTypes = (globalThis.__piLoomHarnessCalls ?? []).map((call) => (call as { type?: string }).type);

      expect(updated.state.status).toBe("active");
      expect(updated.state.summary).toBe("Manager durable state updated from the real session runtime path.");
      expect(updated.state.updatedAt).not.toBe(initialUpdatedAt);
      expect(elapsedMs).toBeLessThan(2_000);
      expect(run.state.postIteration).toMatchObject({
        iterationId: checkpointIterationId,
        status: "accepted",
        decision: expect.objectContaining({ kind: "pause" }),
      });
      expect(callTypes).toContain("prompt");
      expect(callTypes).toContain("sessionWaitForIdle");
      expect(callTypes).not.toContain("agentWaitForIdle");
    } finally {
      cleanup();
    }
  }, 90_000);
});
