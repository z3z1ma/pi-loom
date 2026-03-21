import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findEntityByDisplayId } from "@pi-loom/pi-storage/storage/entities.js";
import { openWorkspaceStorage } from "@pi-loom/pi-storage/storage/workspace.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRalphDashboard } from "../extensions/domain/dashboard.js";
import { hasTrustedPostIteration } from "../extensions/domain/loop.js";
import type { RalphLaunchDescriptor, RalphRunState } from "../extensions/domain/models.js";
import { renderLaunchDescriptor, renderLaunchPrompt } from "../extensions/domain/render.js";
import {
  buildParentSessionRuntimeEnv,
  captureParentHarnessSpawnEnv,
  PI_PARENT_HARNESS_ARGV1_ENV,
  PI_PARENT_HARNESS_EXEC_ARGV_ENV,
  PI_PARENT_HARNESS_EXEC_PATH_ENV,
  PI_PARENT_HARNESS_PACKAGE_ROOT_ENV,
  PI_PARENT_SESSION_ADDITIONAL_EXTENSION_PATHS_ENV,
  PI_PARENT_SESSION_CWD_ENV,
  PI_PARENT_SESSION_DISABLE_EXTENSION_DISCOVERY_ENV,
  PI_PARENT_SESSION_MODEL_ID_ENV,
  PI_PARENT_SESSION_MODEL_PROVIDER_ENV,
  resolveRalphExtensionRoot,
  runRalphLaunch,
} from "../extensions/domain/runtime.js";
import { createRalphStore } from "../extensions/domain/store.js";
import { clearFakeHarnessState, createFakeHarnessPackage, resetFakeHarnessState } from "./helpers/fake-harness.js";

describe("ralph runtime session execution", () => {
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

  it("resolves the Ralph extension root from the package, not the caller workspace", () => {
    const extensionRoot = resolveRalphExtensionRoot();

    expect(extensionRoot.replace(/\\/g, "/")).toMatch(/\/packages\/pi-ralph-wiggum$/);
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
    const prompt = renderLaunchPrompt("/tmp/different-root", launch);
    expect(prompt).toContain("Execute one bounded Ralph iteration for run run-123 using ralph-run:run-123:packet.");
    expect(prompt).toContain(
      "Persist status, verifier evidence, critique references, and the continuation decision through `ralph_checkpoint` using iterationId=iter-001.",
    );
    expect(prompt).toContain(
      "Call ralph_checkpoint ref=run-123 iterationId=iter-001 once with the complete bounded-iteration outcome.",
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
        runtime: "/workspace/ralph-storage/run-123/runtime.json",
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

  it("resolves the parent harness package root from a symlinked CLI entry path", () => {
    const launcherDir = mkdtempSync(join(tmpdir(), "pi-ralph-harness-launcher-"));

    try {
      const resolvedHarnessRoot = realpathSync(fakeHarnessRoot);
      const symlinkedEntry = join(launcherDir, "omp");
      symlinkSync(join(fakeHarnessRoot, "index.mjs"), symlinkedEntry);

      const forwarded = captureParentHarnessSpawnEnv(
        {
          [PI_PARENT_HARNESS_EXEC_PATH_ENV]: "/usr/local/bin/node",
          [PI_PARENT_HARNESS_EXEC_ARGV_ENV]: JSON.stringify(["--import", "tsx"]),
        },
        {
          argv1: symlinkedEntry,
        },
      );

      expect(forwarded).toMatchObject({
        [PI_PARENT_HARNESS_PACKAGE_ROOT_ENV]: resolvedHarnessRoot,
        [PI_PARENT_HARNESS_ARGV1_ENV]: symlinkedEntry,
      });
    } finally {
      rmSync(launcherDir, { recursive: true, force: true });
    }
  });

  it("builds parent session env from PATH-discoverable omp when the package-root env is missing", async () => {
    const pathRoot = mkdtempSync(join(tmpdir(), "pi-ralph-harness-path-"));

    try {
      const resolvedHarnessRoot = realpathSync(fakeHarnessRoot);
      const binDir = join(pathRoot, "bin");
      mkdirSync(binDir);
      symlinkSync(join(fakeHarnessRoot, "index.mjs"), join(binDir, "omp"));

      const forwarded = await buildParentSessionRuntimeEnv({
        env: {
          PATH: binDir,
        },
        model: { provider: "anthropic", id: "claude-test" },
      });

      expect(forwarded).toMatchObject({
        [PI_PARENT_HARNESS_PACKAGE_ROOT_ENV]: resolvedHarnessRoot,
        [PI_PARENT_SESSION_MODEL_PROVIDER_ENV]: "anthropic",
        [PI_PARENT_SESSION_MODEL_ID_ENV]: "claude-test",
      });
    } finally {
      rmSync(pathRoot, { recursive: true, force: true });
    }
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

  it("captures explicit parent extension configuration for nested launches", async () => {
    const parentCwd = "/workspace/parent";
    const externalExtension = "/opt/shared/pi-extension";
    const hookPath = "./hooks/guard.ts";

    const forwarded = await buildParentSessionRuntimeEnv({
      env: {
        [PI_PARENT_HARNESS_PACKAGE_ROOT_ENV]: fakeHarnessRoot,
      },
      cwd: parentCwd,
      argv: ["-e", ".", "--hook", hookPath, "--extension", externalExtension, "--no-extensions"],
      model: { provider: "anthropic", id: "claude-test" },
    });

    expect(forwarded).toMatchObject({
      [PI_PARENT_HARNESS_PACKAGE_ROOT_ENV]: fakeHarnessRoot,
      [PI_PARENT_SESSION_CWD_ENV]: parentCwd,
      [PI_PARENT_SESSION_ADDITIONAL_EXTENSION_PATHS_ENV]: JSON.stringify([
        parentCwd,
        join(parentCwd, "hooks/guard.ts"),
        externalExtension,
      ]),
      [PI_PARENT_SESSION_DISABLE_EXTENSION_DISCOVERY_ENV]: "1",
      [PI_PARENT_SESSION_MODEL_PROVIDER_ENV]: "anthropic",
      [PI_PARENT_SESSION_MODEL_ID_ENV]: "claude-test",
    });
  });

  it("rebuilds forwarded parent extension configuration from inherited env", async () => {
    const parentCwd = "/workspace/outer";
    const currentCwd = "/workspace/current";
    const externalExtension = "/opt/shared/pi-extension";

    const forwarded = await buildParentSessionRuntimeEnv({
      env: {
        [PI_PARENT_HARNESS_PACKAGE_ROOT_ENV]: fakeHarnessRoot,
        [PI_PARENT_SESSION_CWD_ENV]: parentCwd,
        [PI_PARENT_SESSION_ADDITIONAL_EXTENSION_PATHS_ENV]: JSON.stringify([parentCwd, externalExtension]),
        [PI_PARENT_SESSION_DISABLE_EXTENSION_DISCOVERY_ENV]: "1",
      },
      cwd: currentCwd,
      argv: ["-e", "/should/not/be/used"],
    });

    expect(forwarded).toMatchObject({
      [PI_PARENT_HARNESS_PACKAGE_ROOT_ENV]: fakeHarnessRoot,
      [PI_PARENT_SESSION_CWD_ENV]: currentCwd,
      [PI_PARENT_SESSION_ADDITIONAL_EXTENSION_PATHS_ENV]: JSON.stringify([currentCwd, externalExtension]),
      [PI_PARENT_SESSION_DISABLE_EXTENSION_DISCOVERY_ENV]: "1",
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

    const result = await runRalphLaunch("/workspace/project", launch, undefined, undefined, {
      [PI_PARENT_HARNESS_PACKAGE_ROOT_ENV]: fakeHarnessRoot,
      [PI_PARENT_SESSION_MODEL_PROVIDER_ENV]: "anthropic",
      [PI_PARENT_SESSION_MODEL_ID_ENV]: "claude-test",
    });

    expect(result).toMatchObject({
      command: join(fakeHarnessRoot, "index.mjs"),
      args: ["run-session", "iter-001", "launch"],
      exitCode: 0,
      output: "session runtime ok",
      stderr: "",
    });

    const createCall = globalThis.__piLoomHarnessCalls?.find(
      (entry): entry is { type: string; options: Record<string, unknown> } =>
        typeof entry === "object" && entry !== null && (entry as { type?: string }).type === "createAgentSession",
    );

    expect(globalThis.__piLoomHarnessCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "modelRegistryFind", provider: "anthropic", modelId: "claude-test" }),
        expect.objectContaining({
          type: "setModel",
          model: expect.objectContaining({ provider: "anthropic", id: "claude-test" }),
        }),
        expect.objectContaining({ type: "bindExtensions" }),
      ]),
    );
    expect((globalThis.__piLoomHarnessCalls ?? []).map((entry) => (entry as { type?: string }).type)).not.toContain(
      "setActiveTools",
    );
    expect(createCall?.options.model).toEqual({ provider: "anthropic", id: "claude-test" });
  });

  it("forwards parent extension paths and discovery policy through DefaultResourceLoader when available", async () => {
    const launch: RalphLaunchDescriptor = {
      runId: "run-session-extensions",
      iterationId: "iter-001",
      iteration: 1,
      createdAt: "2026-03-20T12:00:00.000Z",
      runtime: "session",
      packetRef: "ralph-run:run-session-extensions:packet",
      launchRef: "ralph-run:run-session-extensions:launch",
      resume: false,
      instructions: [],
    };
    const nestedCwd = "/workspace/nested-worktree";
    const externalExtension = "/opt/shared/pi-extension";

    const result = await runRalphLaunch(nestedCwd, launch, undefined, undefined, {
      [PI_PARENT_HARNESS_PACKAGE_ROOT_ENV]: fakeHarnessRoot,
      [PI_PARENT_SESSION_CWD_ENV]: "/workspace/parent-worktree",
      [PI_PARENT_SESSION_ADDITIONAL_EXTENSION_PATHS_ENV]: JSON.stringify([
        "/workspace/parent-worktree",
        externalExtension,
      ]),
      [PI_PARENT_SESSION_DISABLE_EXTENSION_DISCOVERY_ENV]: "1",
    });

    expect(result.exitCode).toBe(0);
    const createCall = globalThis.__piLoomHarnessCalls?.find(
      (entry): entry is { type: string; options: Record<string, unknown> } =>
        typeof entry === "object" && entry !== null && (entry as { type?: string }).type === "createAgentSession",
    );

    expect(globalThis.__piLoomHarnessCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "resourceLoaderConstructed",
          options: expect.objectContaining({
            cwd: nestedCwd,
            additionalExtensionPaths: [nestedCwd, externalExtension],
            noExtensions: true,
          }),
        }),
        expect.objectContaining({
          type: "resourceLoaderReload",
          options: expect.objectContaining({
            cwd: nestedCwd,
            additionalExtensionPaths: [nestedCwd, externalExtension],
            noExtensions: true,
          }),
        }),
      ]),
    );
    expect(createCall?.options).toMatchObject({
      cwd: nestedCwd,
      resourceLoader: expect.objectContaining({
        options: expect.objectContaining({
          cwd: nestedCwd,
          additionalExtensionPaths: [nestedCwd, externalExtension],
          noExtensions: true,
        }),
      }),
    });
    expect(createCall?.options).not.toHaveProperty("additionalExtensionPaths");
    expect(createCall?.options).not.toHaveProperty("disableExtensionDiscovery");
  });

  it("forwards full upstream newSession options through headless extension bindings", async () => {
    const launch: RalphLaunchDescriptor = {
      runId: "run-session-new-session",
      iterationId: "iter-001",
      iteration: 1,
      createdAt: "2026-03-20T12:00:00.000Z",
      runtime: "session",
      packetRef: "ralph-run:run-session-new-session:packet",
      launchRef: "ralph-run:run-session-new-session:launch",
      resume: false,
      instructions: [],
    };
    const setup = vi.fn(async () => {});

    const result = await runRalphLaunch("/workspace/project", launch, undefined, undefined, {
      [PI_PARENT_HARNESS_PACKAGE_ROOT_ENV]: fakeHarnessRoot,
    });

    expect(result.exitCode).toBe(0);
    const bindCall = globalThis.__piLoomHarnessCalls?.find(
      (
        entry,
      ): entry is {
        type: string;
        bindings: { commandContextActions: { newSession: (options?: unknown) => Promise<unknown> } };
      } => typeof entry === "object" && entry !== null && (entry as { type?: string }).type === "bindExtensions",
    );

    expect(bindCall).toBeDefined();
    if (!bindCall) {
      throw new Error("Expected bindExtensions call");
    }
    await expect(
      bindCall.bindings.commandContextActions.newSession({
        parentSession: "/sessions/parent.jsonl",
        setup,
      }),
    ).resolves.toEqual({ cancelled: false });
    expect(globalThis.__piLoomHarnessCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "newSession",
          options: expect.objectContaining({
            parentSession: "/sessions/parent.jsonl",
            setup,
          }),
        }),
      ]),
    );
  });

  it("surfaces tool execution events from the harness session runtime", async () => {
    const launch: RalphLaunchDescriptor = {
      runId: "run-events",
      iterationId: "iter-001",
      iteration: 1,
      createdAt: "2026-03-20T12:00:00.000Z",
      runtime: "session",
      packetRef: "ralph-run:run-events:packet",
      launchRef: "ralph-run:run-events:launch",
      resume: false,
      instructions: [],
    };
    const events: unknown[] = [];

    globalThis.__piLoomHarnessHook = async ({ phase, emitEvent }) => {
      if (phase !== "prompt") {
        return;
      }
      emitEvent({
        type: "tool_call_start",
        toolCall: { id: "tool-001", name: "read" },
      });
      emitEvent({
        type: "tool_call_end",
        toolCall: { id: "tool-001", name: "read" },
      });
    };

    const result = await runRalphLaunch(
      "/workspace/project",
      launch,
      undefined,
      undefined,
      {
        [PI_PARENT_HARNESS_PACKAGE_ROOT_ENV]: fakeHarnessRoot,
      },
      (event) => {
        events.push(event);
      },
    );

    expect(result.exitCode).toBe(0);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool_execution",
          phase: "start",
          toolName: "read",
          toolCallId: "tool-001",
        }),
        expect.objectContaining({
          type: "tool_execution",
          phase: "end",
          toolName: "read",
          toolCallId: "tool-001",
        }),
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

    const result = await runRalphLaunch("/workspace/project", launch, undefined, undefined, {
      [PI_PARENT_HARNESS_PACKAGE_ROOT_ENV]: fakeHarnessRoot,
    });

    expect(result).toMatchObject({
      exitCode: 1,
      output: "",
      stderr: "Harness session failed before checkpointing.",
    });
  });

  it("waits for session-level idle completion before reading the assistant result", async () => {
    globalThis.__piLoomHarnessOutcome = {
      deferAssistantUntilSessionIdle: true,
      text: "session idle delivered the checkpoint",
    };

    const launch: RalphLaunchDescriptor = {
      runId: "run-session-idle",
      iterationId: "iter-001",
      iteration: 1,
      createdAt: "2026-03-20T12:00:00.000Z",
      runtime: "session",
      packetRef: "ralph-run:run-session-idle:packet",
      launchRef: "ralph-run:run-session-idle:launch",
      resume: false,
      instructions: [],
    };

    const result = await runRalphLaunch("/workspace/project", launch, undefined, undefined, {
      [PI_PARENT_HARNESS_PACKAGE_ROOT_ENV]: fakeHarnessRoot,
    });

    expect(result).toMatchObject({
      exitCode: 0,
      output: "session idle delivered the checkpoint",
      stderr: "",
    });
    expect(globalThis.__piLoomHarnessCalls).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "sessionWaitForIdle" })]),
    );
    const callTypes = (globalThis.__piLoomHarnessCalls ?? []).map((call) => (call as { type?: string }).type);
    expect(callTypes.indexOf("sessionWaitForIdle")).toBeGreaterThan(callTypes.indexOf("prompt"));
    expect(callTypes).not.toContain("agentWaitForIdle");
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
    const resultPromise = runRalphLaunch("/workspace/project", launch, abortController.signal, undefined, {
      [PI_PARENT_HARNESS_PACKAGE_ROOT_ENV]: fakeHarnessRoot,
    });

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
      stderr: expect.stringContaining("Aborted"),
    });
    const callTypes = (globalThis.__piLoomHarnessCalls ?? []).map((call) => (call as { type?: string }).type);
    expect(callTypes.includes("abort") || !callTypes.includes("prompt")).toBe(true);
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

  it("keeps the launched iteration trusted after a later checkpoint updates postIteration", () => {
    const workspace = mkdtempSync(join(tmpdir(), "pi-ralph-duplicate-checkpoint-"));
    try {
      const store = createRalphStore(workspace);
      const run = store.createRun({
        title: "Duplicate checkpoint trust",
        objective: "Keep trust bound to the launched iteration id.",
      });

      const prepared = store.prepareLaunch(run.state.runId, { focus: "Checkpoint the launched iteration." });
      const launchedIterationId = prepared.launch.iterationId;

      store.appendIteration(run.state.runId, {
        id: launchedIterationId,
        status: "accepted",
        summary: "Initial checkpoint landed.",
        workerSummary: "The launched iteration recorded its outcome.",
        decision: {
          kind: "continue",
          reason: "unknown",
          summary: "A later step can continue.",
          decidedAt: new Date().toISOString(),
          decidedBy: "runtime",
          blockingRefs: [],
        },
      });

      const resumed = store.resumeRun(run.state.runId, { focus: "Prepare the next iteration." });
      const laterIterationId = resumed.launch?.iterationId;
      expect(laterIterationId).toBeTruthy();
      if (!laterIterationId) {
        throw new Error("Expected a later iteration id after resume.");
      }

      const duplicateCheckpoint = store.appendIteration(run.state.runId, {
        id: launchedIterationId,
        status: "accepted",
        summary: "Duplicate checkpoint refreshed the same iteration.",
        workerSummary: "The launched iteration kept its explicit decision.",
      });

      store.appendIteration(run.state.runId, {
        id: laterIterationId,
        status: "reviewing",
        summary: "A later iteration now owns postIteration.",
        workerSummary: "This newer checkpoint should not break trust in the launched iteration.",
      });

      const finalRun = store.readRun(run.state.runId);

      expect(finalRun.state.postIteration).toMatchObject({ iterationId: laterIterationId, status: "reviewing" });
      expect(duplicateCheckpoint.iterations.find((iteration) => iteration.id === launchedIterationId)).toMatchObject({
        summary: "Duplicate checkpoint refreshed the same iteration.",
        decision: expect.objectContaining({ kind: "continue" }),
      });
      expect(hasTrustedPostIteration(finalRun, launchedIterationId)).toBe(true);
      expect(hasTrustedPostIteration(finalRun, laterIterationId)).toBe(false);
      expect(hasTrustedPostIteration(finalRun, "iter-999")).toBe(false);
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
        sourceRef: "packages/pi-ralph-wiggum/__tests__/runtime.test.ts",
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
