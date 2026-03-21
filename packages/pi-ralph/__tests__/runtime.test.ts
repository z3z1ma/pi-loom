import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findEntityByDisplayId } from "@pi-loom/pi-storage/storage/entities.js";
import { openWorkspaceStorage } from "@pi-loom/pi-storage/storage/workspace.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRalphDashboard } from "../extensions/domain/dashboard.js";
import type { RalphLaunchDescriptor, RalphRunState } from "../extensions/domain/models.js";
import { hasTrustedPostIteration } from "../extensions/domain/loop.js";
import { renderLaunchDescriptor, renderLaunchPrompt } from "../extensions/domain/render.js";
import {
  buildParentSessionRuntimeEnv,
  captureParentHarnessSpawnEnv,
  PI_PARENT_HARNESS_ARGV1_ENV,
  PI_PARENT_HARNESS_EXEC_ARGV_ENV,
  PI_PARENT_HARNESS_EXEC_PATH_ENV,
  PI_PARENT_HARNESS_PACKAGE_ROOT_ENV,
  PI_PARENT_SESSION_MODEL_ID_ENV,
  PI_PARENT_SESSION_MODEL_PROVIDER_ENV,
  resolveRalphExtensionRoot,
  runRalphLaunch,
} from "../extensions/domain/runtime.js";
import { createRalphStore } from "../extensions/domain/store.js";

declare global {
  // eslint-disable-next-line no-var
  var __piLoomHarnessCalls: unknown[] | undefined;
  // eslint-disable-next-line no-var
  var __piLoomHarnessOutcome:
    | {
        stopReason?: string;
        text?: string;
        errorMessage?: string;
        waitForAbort?: boolean;
      }
    | undefined;
}

function createFakeHarnessPackage(): string {
  const root = mkdtempSync(join(tmpdir(), "pi-loom-harness-"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify(
      {
        name: "@oh-my-pi/pi-coding-agent",
        type: "module",
        main: "./index.mjs",
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(root, "index.mjs"),
    `
class FakeSession {
  constructor(options) {
    this.options = options;
    this.agent = { waitForIdle: async () => {} };
    this.state = { messages: [] };
    this.listeners = [];
    this.pendingPromptResolve = null;
    this.modelRegistry = {
      find(provider, modelId) {
        globalThis.__piLoomHarnessCalls.push({ type: "modelRegistryFind", provider, modelId });
        return { provider, id: modelId, reasoning: true };
      },
    };
  }

  async bindExtensions() {
    globalThis.__piLoomHarnessCalls.push({ type: "bindExtensions" });
  }

  getAllTools() {
    return [{ name: "read" }, { name: "ralph_checkpoint" }, { name: "manager_record" }];
  }

  async setActiveToolsByName(toolNames) {
    globalThis.__piLoomHarnessCalls.push({ type: "setActiveTools", toolNames });
  }

  async setModel(model) {
    globalThis.__piLoomHarnessCalls.push({ type: "setModel", model });
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((candidate) => candidate !== listener);
    };
  }

  async prompt(text) {
    globalThis.__piLoomHarnessCalls.push({ type: "prompt", text, env: { ...process.env } });
    const outcome = globalThis.__piLoomHarnessOutcome ?? { stopReason: "stop", text: "session runtime ok" };
    if (outcome.waitForAbort) {
      return new Promise((resolve) => {
        this.pendingPromptResolve = resolve;
      });
    }
    const message = {
      role: "assistant",
      stopReason: outcome.stopReason ?? "stop",
      errorMessage: outcome.errorMessage,
      content: outcome.text ? [{ type: "text", text: outcome.text }] : [],
    };
    this.state.messages.push(message);
    for (const listener of this.listeners) {
      listener({ type: "message_end", message });
    }
  }

  async abort() {
    globalThis.__piLoomHarnessCalls.push({ type: "abort" });
    const outcome = globalThis.__piLoomHarnessOutcome ?? {};
    const message = {
      role: "assistant",
      stopReason: "aborted",
      errorMessage: outcome.errorMessage ?? "Aborted",
      content: [],
    };
    this.state.messages.push(message);
    for (const listener of this.listeners) {
      listener({ type: "message_end", message });
    }
    this.pendingPromptResolve?.();
    this.pendingPromptResolve = null;
  }

  async dispose() {
    globalThis.__piLoomHarnessCalls.push({ type: "dispose" });
  }
}

export const SessionManager = {
  inMemory(cwd) {
    globalThis.__piLoomHarnessCalls.push({ type: "sessionManagerInMemory", cwd });
    return { cwd };
  },
};

export async function createAgentSession(options) {
  globalThis.__piLoomHarnessCalls.push({ type: "createAgentSession", options });
  return { session: new FakeSession(options) };
}
`,
  );
  return root;
}

describe("ralph runtime session execution", () => {
  let fakeHarnessRoot: string;

  beforeEach(() => {
    globalThis.__piLoomHarnessCalls = [];
    globalThis.__piLoomHarnessOutcome = undefined;
    fakeHarnessRoot = createFakeHarnessPackage();
  });

  afterEach(() => {
    delete globalThis.__piLoomHarnessCalls;
    delete globalThis.__piLoomHarnessOutcome;
    rmSync(fakeHarnessRoot, { recursive: true, force: true });
  });

  it("resolves the Ralph extension root from the package, not the caller workspace", () => {
    const extensionRoot = resolveRalphExtensionRoot();

    expect(extensionRoot.replace(/\\/g, "/")).toMatch(/\/packages\/pi-ralph$/);
  });

  it("renders launch packet refs without attempting repo-path translation", () => {
    const launch: RalphLaunchDescriptor = {
      runId: "run-123",
      iterationId: "iter-001",
      iteration: 1,
      createdAt: "2026-03-15T14:33:00.000Z",
      runtime: "session",
      packetRef: "ralph-run:run-123:packet",
      launchRef: "ralph-run:run-123:launch",
      resume: true,
      instructions: [],
    };

    expect(renderLaunchDescriptor("/tmp/different-root", launch)).toContain("Packet ref: ralph-run:run-123:packet");
    expect(renderLaunchPrompt("/tmp/different-root", launch)).toContain(
      "Execute one bounded Ralph iteration for run run-123 using ralph-run:run-123:packet.",
    );
  });

  it("projects dashboard artifact refs from the run id", () => {
    const dashboard = buildRalphDashboard(
      {
        runId: "run-123",
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
        objectiveSummary: "Normalize stored refs",
        runRef: "ralph-run:run-123",
      },
      [],
      {
        dir: "/workspace/ralph-storage/run-123",
        state: "/workspace/ralph-storage/run-123/state.json",
        packet: "/workspace/ralph-storage/run-123/packet.md",
        run: "/workspace/ralph-storage/run-123/run.md",
        iterations: "/workspace/ralph-storage/run-123/iterations.jsonl",
        launch: "/workspace/ralph-storage/run-123/launch.json",
      },
      ["pending", "running", "reviewing", "accepted", "rejected", "failed", "cancelled"],
      ["not_run", "pass", "concerns", "fail"],
    );

    expect(dashboard.packetRef).toBe("ralph-run:run-123:packet");
    expect(dashboard.runRef).toBe("ralph-run:run-123:run");
    expect(dashboard.launchRef).toBe("ralph-run:run-123:launch");
  });

  it("captures parent harness package root and process metadata", () => {
    const forwarded = captureParentHarnessSpawnEnv(
      {
        [PI_PARENT_HARNESS_EXEC_PATH_ENV]: "/usr/local/bin/node",
        [PI_PARENT_HARNESS_EXEC_ARGV_ENV]: JSON.stringify(["--import", "tsx"]),
        [PI_PARENT_HARNESS_ARGV1_ENV]: "/original/bin/omp.js",
        [PI_PARENT_HARNESS_PACKAGE_ROOT_ENV]: fakeHarnessRoot,
      },
      {
        execPath: "/background-runtime/node",
        execArgv: ["--experimental-strip-types"],
        argv1: "/background-runtime/session-runner.ts",
      },
    );

    expect(forwarded).toEqual({
      [PI_PARENT_HARNESS_EXEC_PATH_ENV]: "/usr/local/bin/node",
      [PI_PARENT_HARNESS_EXEC_ARGV_ENV]: JSON.stringify(["--import", "tsx"]),
      [PI_PARENT_HARNESS_ARGV1_ENV]: "/original/bin/omp.js",
      [PI_PARENT_HARNESS_PACKAGE_ROOT_ENV]: fakeHarnessRoot,
    });
  });

  it("builds parent session env including model metadata", async () => {
    const forwarded = await buildParentSessionRuntimeEnv({
      env: {
        [PI_PARENT_HARNESS_PACKAGE_ROOT_ENV]: fakeHarnessRoot,
      },
      model: { provider: "anthropic", id: "claude-test" },
    });

    expect(forwarded).toMatchObject({
      [PI_PARENT_HARNESS_PACKAGE_ROOT_ENV]: fakeHarnessRoot,
      [PI_PARENT_SESSION_MODEL_PROVIDER_ENV]: "anthropic",
      [PI_PARENT_SESSION_MODEL_ID_ENV]: "claude-test",
    });
  });

  it("executes launches through a harness session runtime with the requested model context", async () => {
    const launch: RalphLaunchDescriptor = {
      runId: "run-session",
      iterationId: "iter-001",
      iteration: 1,
      createdAt: "2026-03-20T12:00:00.000Z",
      runtime: "session",
      packetRef: "ralph-run:run-session:packet",
      launchRef: "ralph-run:run-session:launch",
      resume: false,
      instructions: [],
    };

    const result = await runRalphLaunch(
      "/workspace/project",
      launch,
      undefined,
      undefined,
      {
        [PI_PARENT_HARNESS_PACKAGE_ROOT_ENV]: fakeHarnessRoot,
        [PI_PARENT_SESSION_MODEL_PROVIDER_ENV]: "anthropic",
        [PI_PARENT_SESSION_MODEL_ID_ENV]: "claude-test",
      },
    );

    expect(result).toMatchObject({
      command: join(fakeHarnessRoot, "index.mjs"),
      args: ["run-session", "iter-001", "launch"],
      exitCode: 0,
      output: "session runtime ok",
      stderr: "",
    });

    expect(globalThis.__piLoomHarnessCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "modelRegistryFind", provider: "anthropic", modelId: "claude-test" }),
        expect.objectContaining({ type: "setModel", model: expect.objectContaining({ provider: "anthropic", id: "claude-test" }) }),
        expect.objectContaining({ type: "bindExtensions" }),
        expect.objectContaining({ type: "setActiveTools", toolNames: ["read", "ralph_checkpoint", "manager_record"] }),
      ]),
    );
  });

  it("surfaces assistant errors from the harness session runtime", async () => {
    globalThis.__piLoomHarnessOutcome = {
      stopReason: "error",
      errorMessage: "Harness session failed before checkpointing.",
    };

    const launch: RalphLaunchDescriptor = {
      runId: "run-error",
      iterationId: "iter-001",
      iteration: 1,
      createdAt: "2026-03-20T12:00:00.000Z",
      runtime: "session",
      packetRef: "ralph-run:run-error:packet",
      launchRef: "ralph-run:run-error:launch",
      resume: false,
      instructions: [],
    };

    const result = await runRalphLaunch(
      "/workspace/project",
      launch,
      undefined,
      undefined,
      {
        [PI_PARENT_HARNESS_PACKAGE_ROOT_ENV]: fakeHarnessRoot,
      },
    );

    expect(result).toMatchObject({
      exitCode: 1,
      output: "",
      stderr: "Harness session failed before checkpointing.",
    });
  });

  it("aborts an in-flight harness session when the caller aborts", async () => {
    globalThis.__piLoomHarnessOutcome = {
      waitForAbort: true,
      errorMessage: "Aborted by test signal.",
    };

    const launch: RalphLaunchDescriptor = {
      runId: "run-abort",
      iterationId: "iter-001",
      iteration: 1,
      createdAt: "2026-03-20T12:00:00.000Z",
      runtime: "session",
      packetRef: "ralph-run:run-abort:packet",
      launchRef: "ralph-run:run-abort:launch",
      resume: false,
      instructions: [],
    };

    const abortController = new AbortController();
    const resultPromise = runRalphLaunch(
      "/workspace/project",
      launch,
      abortController.signal,
      undefined,
      {
        [PI_PARENT_HARNESS_PACKAGE_ROOT_ENV]: fakeHarnessRoot,
      },
    );

    for (let attempt = 0; attempt < 10; attempt += 1) {
      if ((globalThis.__piLoomHarnessCalls ?? []).some((call) => (call as { type?: string }).type === "prompt")) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    abortController.abort();

    await expect(resultPromise).resolves.toMatchObject({
      exitCode: 1,
      output: "",
      stderr: "Aborted by test signal.",
    });
    expect(globalThis.__piLoomHarnessCalls).toEqual(expect.arrayContaining([expect.objectContaining({ type: "abort" })]));
  });

  it("recognizes trusted durable checkpoints by iteration id", () => {
    const workspace = mkdtempSync(join(tmpdir(), "pi-ralph-trusted-checkpoint-"));
    try {
      const store = createRalphStore(workspace);
      const run = store.createRun({
        title: "Trusted checkpoint detection",
        objective: "Recognize a complete durable checkpoint for a bounded iteration.",
      });
      const prepared = store.prepareLaunch(run.state.runId, { focus: "Check the iteration helper." });
      const updated = store.appendIteration(run.state.runId, {
        id: prepared.launch.iterationId,
        status: "accepted",
        summary: "Checkpoint landed.",
        workerSummary: "Durable checkpoint persisted.",
        decision: {
          kind: "pause",
          reason: "operator_requested",
          summary: "Pause after a complete iteration.",
          decidedAt: new Date().toISOString(),
          decidedBy: "runtime",
          blockingRefs: [],
        },
      });

      expect(hasTrustedPostIteration(updated, prepared.launch.iterationId)).toBe(true);
      expect(hasTrustedPostIteration(updated, "iter-999")).toBe(false);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
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

  it("keeps reviewing runs gated when iteration verifier evidence is blocking", async () => {
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
    expect(reviewed.launch.packetRef).toBe(`ralph-run:${created.state.runId}:packet`);

    const { storage, identity } = await openWorkspaceStorage(workspace);
    const runEntity = await findEntityByDisplayId(storage, identity.space.id, "ralph_run", created.state.runId);
    expect(runEntity?.attributes).toEqual(
      expect.objectContaining({
        state: expect.objectContaining({
          runId: created.state.runId,
          waitingFor: "operator",
          nextIterationId: null,
          postIteration: expect.objectContaining({
            iterationId: "iter-001",
            status: "reviewing",
          }),
        }),
      }),
    );
    expect(runEntity?.attributes).not.toHaveProperty("record");

    const readback = store.readRun(created.state.runId);
    expect(readback.iterations).toHaveLength(1);
    expect(readback.iterations[0]).toMatchObject({ id: "iter-001", status: "reviewing" });
    expect(readback.state.waitingFor).toBe("operator");
    expect(readback.launch).toMatchObject({
      iterationId: "iter-001",
      runtime: "descriptor_only",
      packetRef: `ralph-run:${created.state.runId}:packet`,
    });

    expect(() => store.prepareLaunch(created.state.runId)).toThrow(
      "Ralph run verifier-blocked-review is waiting for operator and cannot launch until that gate is cleared.",
    );
  }, 90000);
});
