import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { vi } from "vitest";

vi.mock("@mariozechner/pi-coding-agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mariozechner/pi-coding-agent")>();
  const actualWithOptionalSettings = actual as typeof actual & {
    Settings?: { init?: (options?: { cwd?: string; agentDir?: string }) => Promise<unknown> };
  };
  const settingsValues = () =>
    ((globalThis as Record<string, unknown>).__piLoomHarnessSettingsValues as Record<string, unknown> | undefined) ??
    {};

  class MockHarnessSession {
    options: Record<string, unknown>;
    state = { messages: [] as Array<Record<string, unknown>> };
    listeners: Array<(event: unknown) => void> = [];
    pendingPromptResolve: (() => void) | null = null;
    messageDelivered = false;
    agent = {
      waitForIdle: async () => {
        globalThis.__piLoomHarnessCalls?.push({ type: "agentWaitForIdle" });
        await this.runHook("agentWaitForIdle");
      },
    };
    modelRegistry = {
      find: (provider: string, modelId: string) => {
        globalThis.__piLoomHarnessCalls?.push({ type: "modelRegistryFind", provider, modelId });
        return { provider, id: modelId, reasoning: true };
      },
    };

    constructor(options: Record<string, unknown>) {
      this.options = options;
    }

    currentOutcome() {
      return globalThis.__piLoomHarnessOutcome ?? { stopReason: "stop", text: "session runtime ok" };
    }

    async runHook(phase: "prompt" | "sessionWaitForIdle" | "agentWaitForIdle" | "abort", promptText?: string) {
      await globalThis.__piLoomHarnessHook?.({
        phase,
        promptText,
        sessionOptions: this.options,
        env: { ...process.env },
        outcome: this.currentOutcome(),
        emitEvent: (event) => this.emitEvent(event),
      });
    }

    emitEvent(event: unknown) {
      globalThis.__piLoomHarnessCalls?.push({ type: "emitEvent", event });
      for (const listener of this.listeners) {
        listener(event);
      }
    }

    emitAssistantMessage(outcome = this.currentOutcome()) {
      if (this.messageDelivered) return;
      this.messageDelivered = true;
      const usage = {
        input: outcome.usage?.input ?? 0,
        output: outcome.usage?.output ?? 0,
        cacheRead: outcome.usage?.cacheRead ?? 0,
        cacheWrite: outcome.usage?.cacheWrite ?? 0,
        totalTokens:
          outcome.usage?.totalTokens ??
          (outcome.usage?.input ?? 0) +
            (outcome.usage?.output ?? 0) +
            (outcome.usage?.cacheRead ?? 0) +
            (outcome.usage?.cacheWrite ?? 0),
      };
      const message = {
        role: "assistant",
        stopReason: outcome.stopReason ?? "stop",
        errorMessage: outcome.errorMessage,
        usage,
        content: outcome.text ? [{ type: "text", text: outcome.text }] : [],
      };
      this.state.messages.push(message);
      this.emitEvent({ type: "message_end", message });
    }

    async bindExtensions(bindings: Record<string, unknown>) {
      globalThis.__piLoomHarnessCalls?.push({ type: "bindExtensions", bindings });
    }

    getAllToolNames() {
      return globalThis.__piLoomHarnessToolNames ?? ["read", "ticket_read", "ticket_write", "ralph_read"];
    }

    getAllTools() {
      return this.getAllToolNames().map((name) => ({ name }));
    }

    async setActiveToolsByName(toolNames: string[]) {
      globalThis.__piLoomHarnessCalls?.push({ type: "setActiveTools", toolNames });
    }

    async setModel(model: unknown) {
      globalThis.__piLoomHarnessCalls?.push({ type: "setModel", model });
    }

    subscribe(listener: (event: unknown) => void) {
      this.listeners.push(listener);
      return () => {
        this.listeners = this.listeners.filter((candidate) => candidate !== listener);
      };
    }

    async prompt(text: string) {
      globalThis.__piLoomHarnessCalls?.push({ type: "prompt", text, env: { ...process.env } });
      const outcome = this.currentOutcome();
      await this.runHook("prompt", text);
      if (outcome.waitForAbort) {
        return new Promise<void>((resolve) => {
          this.pendingPromptResolve = resolve;
        });
      }
      if (!outcome.deferAssistantUntilSessionIdle) {
        this.emitAssistantMessage(outcome);
      }
    }

    async waitForIdle() {
      globalThis.__piLoomHarnessCalls?.push({ type: "sessionWaitForIdle" });
      await this.runHook("sessionWaitForIdle");
      if (this.currentOutcome().deferAssistantUntilSessionIdle) {
        this.emitAssistantMessage(this.currentOutcome());
      }
    }

    async abort() {
      globalThis.__piLoomHarnessCalls?.push({ type: "abort" });
      await this.runHook("abort");
      this.emitAssistantMessage({
        stopReason: "aborted",
        errorMessage: this.currentOutcome().errorMessage ?? "Aborted",
        text: "",
      });
      this.pendingPromptResolve?.();
      this.pendingPromptResolve = null;
    }

    async dispose() {
      globalThis.__piLoomHarnessCalls?.push({ type: "dispose" });
    }
  }

  return {
    ...actual,
    createAgentSession: vi.fn(async (options: Record<string, unknown>) => {
      globalThis.__piLoomHarnessCalls?.push({ type: "createAgentSession", options });
      return { session: new MockHarnessSession(options) };
    }),
    SessionManager: {
      ...actual.SessionManager,
      inMemory: vi.fn((cwd?: string) => {
        globalThis.__piLoomHarnessCalls?.push({ type: "sessionManagerInMemory", cwd });
        return { cwd };
      }),
    },
    Settings: {
      ...(actualWithOptionalSettings.Settings ?? {}),
      isolated: vi.fn((overrides?: Record<string, unknown>) => ({ __settings: true, overrides: overrides ?? {} })),
      init: vi.fn(async (options?: { cwd?: string; agentDir?: string }) => {
        globalThis.__piLoomHarnessCalls?.push({ type: "settingsInit", options });
        return actualWithOptionalSettings.Settings?.init
          ? actualWithOptionalSettings.Settings.init(options)
          : { ...options, __settings: true };
      }),
    },
    settings: {
      get: vi.fn((key: string) => settingsValues()[key]),
    },
    SETTINGS_SCHEMA: {
      extensions: {},
      disabledExtensions: {},
      "async.enabled": {},
    },
  };
});

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPlanStore } from "#plans/domain/store.js";
import { findEntityByDisplayId } from "#storage/entities.js";
import { createEntityId } from "#storage/ids.js";
import { openWorkspaceStorage, openWorkspaceStorageSync } from "#storage/workspace.js";
import { createTicketStore } from "#ticketing/domain/store.js";
import { buildRalphDashboard } from "../domain/dashboard.js";
import { hasTrustedPostIteration } from "../domain/loop.js";
import type { RalphLaunchDescriptor, RalphRunState } from "../domain/models.js";
import { renderLaunchDescriptor, renderLaunchPrompt } from "../domain/render.js";
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
} from "../domain/runtime.js";
import { createRalphStore } from "../domain/store.js";
import { clearFakeHarnessState, createFakeHarnessPackage, resetFakeHarnessState } from "./helpers/fake-harness.js";

function createTicketBoundScope(ticketId = "rt-0456", planId = "plan-123", specChangeId = "spec-789") {
  return {
    mode: "execute" as const,
    specChangeId,
    planId,
    ticketId,
    roadmapItemIds: [],
    initiativeIds: [],
    researchIds: [],
    critiqueIds: [],
    docIds: [],
  };
}

function seedRuntimeLinkedEntity(
  workspace: string,
  kind: "plan" | "ticket" | "spec_change",
  displayId: string,
  title: string,
) {
  const { storage, identity } = openWorkspaceStorageSync(workspace);
  const timestamp = new Date().toISOString();
  const attributes =
    kind === "plan"
      ? { state: { planId: displayId, status: "active", title } }
      : kind === "ticket"
        ? {
            record: {
              summary: {
                id: displayId,
                title,
                status: "open",
                storedStatus: "open",
                priority: "medium",
                type: "task",
                createdAt: timestamp,
                updatedAt: timestamp,
                deps: [],
                links: [],
                initiativeIds: [],
                researchIds: [],
                tags: [],
                parent: null,
                closed: false,
                archived: false,
                archivedAt: null,
                ref: `ticket:${displayId}`,
              },
              journal: [],
              attachments: [],
              checkpoints: [],
              children: [],
              blockers: [],
              ticket: {
                closed: false,
                archived: false,
                archivedAt: null,
                ref: `ticket:${displayId}`,
                frontmatter: {
                  id: displayId,
                  title,
                  status: "open",
                  priority: "medium",
                  type: "task",
                  "created-at": timestamp,
                  "updated-at": timestamp,
                  tags: [],
                  deps: [],
                  links: [],
                  "initiative-ids": [],
                  "research-ids": [],
                  parent: null,
                  assignee: null,
                  acceptance: [],
                  labels: [],
                  risk: "medium",
                  "review-status": "none",
                  "external-refs": [],
                },
                body: {
                  summary: `${title} summary`,
                  context: `${title} context`,
                  plan: `${title} plan`,
                  notes: "",
                  verification: `${title} verification`,
                  journalSummary: "",
                },
              },
            },
          }
        : { record: { summary: { id: displayId, status: "active" } }, state: { title } };

  storage.db
    .prepare(
      `
        INSERT INTO entities (id, kind, space_id, owning_repository_id, display_id, title, summary, status, version, tags_json, attributes_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      createEntityId(kind, identity.space.id, displayId, `${kind}:${displayId}`),
      kind,
      identity.space.id,
      null,
      displayId,
      title,
      `${title} summary`,
      "active",
      1,
      JSON.stringify([]),
      JSON.stringify(attributes),
      timestamp,
      timestamp,
    );
}

function seedRuntimeLinkedEntities(workspace: string) {
  seedRuntimeLinkedEntity(workspace, "plan", "plan-123", "Default plan");
  seedRuntimeLinkedEntity(workspace, "ticket", "rt-0456", "Default ticket");
  seedRuntimeLinkedEntity(workspace, "spec_change", "spec-789", "Default spec");
}

async function recordBoundTicketActivity(
  workspace: string,
  ticketId: string,
  options: {
    status?: "open" | "in_progress" | "review";
    journalText?: string;
    verificationText?: string;
    close?: boolean;
  } = {},
): Promise<void> {
  const ticketStore = createTicketStore(workspace);
  if (options.status) {
    await ticketStore.updateTicketAsync(ticketId, { status: options.status });
  }
  if (options.journalText) {
    await ticketStore.addJournalEntryAsync(ticketId, "progress", options.journalText);
  }
  if (options.verificationText) {
    await ticketStore.addJournalEntryAsync(ticketId, "verification", options.verificationText);
  }
  if (options.close) {
    await ticketStore.closeTicketAsync(ticketId, options.verificationText ?? "Verified during bounded iteration.");
  }
}

describe("ralph runtime session execution", () => {
  let fakeHarnessRoot: string;
  let cleanupFakeHarness: (() => void) | undefined;

  beforeEach(() => {
    resetFakeHarnessState();
    delete (globalThis as Record<string, unknown>).__piLoomHarnessSettingsValues;
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

    expect(extensionRoot).toBe(resolve("."));
  });

  it("renders launch packet refs without attempting repo-path translation", () => {
    const launch: RalphLaunchDescriptor = {
      runId: "run-123",
      iterationId: "iter-001",
      iteration: 1,
      createdAt: "2026-03-15T14:33:00.000Z",
      runtime: "session",
      ticketRef: "rt-0456",
      planRef: "plan-123",
      packetRef: "ralph-run:run-123:packet",
      launchRef: "ralph-run:run-123:launch",
      resume: true,
      instructions: [],
    };

    expect(renderLaunchDescriptor("/tmp/different-root", launch)).toContain("Packet ref: ralph-run:run-123:packet");
    expect(renderLaunchDescriptor("/tmp/different-root", launch)).toContain(
      "Packet read call: ralph_read ticketRef=rt-0456 planRef=plan-123 mode=packet",
    );
    const prompt = renderLaunchPrompt("/tmp/different-root", launch);
    expect(prompt).toContain(
      "Execute one bounded Ralph iteration for managed run run-123 using ralph-run:run-123:packet.",
    );
    expect(prompt).toContain("Call ralph_read ticketRef=rt-0456 planRef=plan-123 mode=packet.");
    expect(prompt).toContain(
      "Use the exact ticketRef/planRef from this launch when reading Ralph packet state; do not derive alternate refs from the run id or packet ref.",
    );
    expect(prompt).toContain(
      "Record durable progress through the bound ticket ledger: update ticket status, body, journal, checkpoints, or other ticket-backed evidence as needed.",
    );
    expect(prompt).toContain(
      "Leave durable ticket activity for iterationId=iter-001; Ralph will reconcile the latest bounded iteration from the ticket after exit.",
    );
  });

  it("preserves exact bound ticket and long plan refs in launch guidance while keeping ticket-only guidance truthful", () => {
    const workspace = mkdtempSync(join(tmpdir(), "pi-ralph-launch-guidance-"));
    try {
      seedRuntimeLinkedEntities(workspace);
      const store = createRalphStore(workspace);
      const longPlanRef = "plan-production-readiness-rollout-phase-7-with-cross-region-cutover-checklist";
      seedRuntimeLinkedEntity(workspace, "plan", longPlanRef, "Production readiness rollout");

      const boundRun = store.createRun({
        title: "Long plan-bound launch",
        objective: "Keep bound refs exact in worker guidance.",
        scope: createTicketBoundScope("rt-0456", longPlanRef),
      });
      const prepared = store.prepareLaunch(boundRun.state.runId, { focus: "Verify prompt guidance" });

      expect(prepared.launch.planRef).toBe(longPlanRef);
      expect(prepared.launch.ticketRef).toBe("rt-0456");
      expect(renderLaunchPrompt(workspace, prepared.launch)).toContain(
        `Call ralph_read ticketRef=rt-0456 planRef=${longPlanRef} mode=packet.`,
      );

      const ticketOnlyLaunch: RalphLaunchDescriptor = {
        runId: "ticket-only-run",
        iterationId: "iter-001",
        iteration: 1,
        createdAt: "2026-03-20T12:00:00.000Z",
        runtime: "session",
        ticketRef: "rt-0456",
        planRef: null,
        packetRef: "ralph-run:ticket-only-run:packet",
        launchRef: "ralph-run:ticket-only-run:launch",
        resume: false,
        instructions: [],
      };

      expect(renderLaunchPrompt(workspace, ticketOnlyLaunch)).toContain(
        "Call ralph_read ticketRef=rt-0456 mode=packet.",
      );
      expect(renderLaunchPrompt(workspace, ticketOnlyLaunch)).toContain("Plan ref: (none)");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
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

  it("infers the workspace root as an extension path when the cwd package manifest declares pi extensions", async () => {
    const forwarded = await buildParentSessionRuntimeEnv({
      env: {
        [PI_PARENT_HARNESS_PACKAGE_ROOT_ENV]: fakeHarnessRoot,
      },
      cwd: process.cwd(),
    });

    expect(forwarded).toMatchObject({
      [PI_PARENT_HARNESS_PACKAGE_ROOT_ENV]: fakeHarnessRoot,
      [PI_PARENT_SESSION_CWD_ENV]: process.cwd(),
      [PI_PARENT_SESSION_ADDITIONAL_EXTENSION_PATHS_ENV]: JSON.stringify([process.cwd()]),
    });
  });

  it("executes launches through a harness session runtime with the requested model context", async () => {
    (globalThis as Record<string, unknown>).__piLoomHarnessSettingsValues = {
      extensions: ["."],
      disabledExtensions: [],
    };
    const launch: RalphLaunchDescriptor = {
      runId: "run-session",
      iterationId: "iter-001",
      iteration: 1,
      createdAt: "2026-03-20T12:00:00.000Z",
      runtime: "session",
      ticketRef: "rt-0456",
      planRef: "plan-123",
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
        expect.objectContaining({ type: "settingsInit", options: { cwd: "/workspace/project" } }),
        expect.objectContaining({ type: "modelRegistryFind", provider: "anthropic", modelId: "claude-test" }),
        expect.objectContaining({
          type: "setModel",
          model: expect.objectContaining({ provider: "anthropic", id: "claude-test" }),
        }),
        expect.objectContaining({ type: "bindExtensions" }),
        expect.objectContaining({
          type: "setActiveTools",
          toolNames: expect.arrayContaining(["ralph_read", "ticket_read", "ticket_write"]),
        }),
      ]),
    );
    expect(createCall?.options).toMatchObject({
      cwd: "/workspace/project",
      sessionManager: expect.any(Object),
      settings: {
        __settings: true,
        overrides: expect.objectContaining({ extensions: ["."], disabledExtensions: [], "async.enabled": false }),
      },
    });
    expect(createCall?.options).not.toHaveProperty("additionalExtensionPaths");
    expect(createCall?.options).not.toHaveProperty("disableExtensionDiscovery");
    expect(createCall?.options).not.toHaveProperty("resourceLoader");
  });

  it("allows concurrent session launches to reach session creation without a global queue", async () => {
    const firstLaunch: RalphLaunchDescriptor = {
      runId: "run-lock-first",
      iterationId: "iter-001",
      iteration: 1,
      createdAt: "2026-03-20T12:00:00.000Z",
      runtime: "session",
      ticketRef: "rt-0456",
      planRef: "plan-123",
      packetRef: "ralph-run:run-lock-first:packet",
      launchRef: "ralph-run:run-lock-first:launch",
      resume: false,
      instructions: [],
    };
    const secondLaunch: RalphLaunchDescriptor = {
      runId: "run-lock-second",
      iterationId: "iter-001",
      iteration: 1,
      createdAt: "2026-03-20T12:01:00.000Z",
      runtime: "session",
      ticketRef: "rt-0456",
      planRef: "plan-123",
      packetRef: "ralph-run:run-lock-second:packet",
      launchRef: "ralph-run:run-lock-second:launch",
      resume: false,
      instructions: [],
    };
    const firstAbort = new AbortController();
    const secondAbort = new AbortController();

    const firstPromise = runRalphLaunch("/workspace/project", firstLaunch, firstAbort.signal, undefined, {
      [PI_PARENT_HARNESS_PACKAGE_ROOT_ENV]: fakeHarnessRoot,
    });

    await Promise.resolve();
    await Promise.resolve();

    const secondPromise = runRalphLaunch("/workspace/project", secondLaunch, secondAbort.signal, undefined, {
      [PI_PARENT_HARNESS_PACKAGE_ROOT_ENV]: fakeHarnessRoot,
    });

    let queuedCreateCount = 0;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      queuedCreateCount = (globalThis.__piLoomHarnessCalls ?? []).filter(
        (entry): entry is { type: string } =>
          typeof entry === "object" && entry !== null && (entry as { type?: string }).type === "createAgentSession",
      ).length;
      if (queuedCreateCount === 2) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    expect(queuedCreateCount).toBe(2);

    await expect(firstPromise).resolves.toMatchObject({ status: "completed" });
    await expect(secondPromise).resolves.toMatchObject({ status: "completed" });
  });

  it("uses task-like SDK session construction even when extension env is forwarded", async () => {
    (globalThis as Record<string, unknown>).__piLoomHarnessSettingsValues = {
      extensions: ["."],
      disabledExtensions: [],
    };
    const launch: RalphLaunchDescriptor = {
      runId: "run-session-extensions",
      iterationId: "iter-001",
      iteration: 1,
      createdAt: "2026-03-20T12:00:00.000Z",
      runtime: "session",
      ticketRef: "rt-0456",
      planRef: "plan-123",
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

    expect(createCall?.options).toMatchObject({
      cwd: nestedCwd,
      sessionManager: expect.any(Object),
      settings: {
        __settings: true,
        overrides: expect.objectContaining({
          extensions: expect.arrayContaining([".", nestedCwd, externalExtension]),
          disabledExtensions: [],
          "async.enabled": false,
        }),
      },
    });
    expect(globalThis.__piLoomHarnessCalls).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "settingsInit", options: { cwd: nestedCwd } })]),
    );
    expect(createCall?.options).not.toHaveProperty("additionalExtensionPaths");
    expect(createCall?.options).not.toHaveProperty("disableExtensionDiscovery");
    expect(createCall?.options).not.toHaveProperty("resourceLoader");
  });

  it("supports pi-mono style harness sdk settingsManager construction", async () => {
    const piHarness = createFakeHarnessPackage({ shape: "pi" });
    try {
      const launch: RalphLaunchDescriptor = {
        runId: "run-session-pi-mono",
        iterationId: "iter-001",
        iteration: 1,
        createdAt: "2026-03-20T12:00:00.000Z",
        runtime: "session",
        ticketRef: "rt-0456",
        planRef: "plan-123",
        packetRef: "ralph-run:run-session-pi-mono:packet",
        launchRef: "ralph-run:run-session-pi-mono:launch",
        resume: false,
        instructions: [],
      };

      const result = await runRalphLaunch("/workspace/project", launch, undefined, undefined, {
        [PI_PARENT_HARNESS_PACKAGE_ROOT_ENV]: piHarness.root,
      });

      expect(result).toMatchObject({
        command: join(piHarness.root, "index.mjs"),
        exitCode: 0,
        output: "session runtime ok",
      });

      const createCall = globalThis.__piLoomHarnessCalls?.find(
        (entry): entry is { type: string; options: Record<string, unknown> } =>
          typeof entry === "object" && entry !== null && (entry as { type?: string }).type === "createAgentSession",
      );

      expect(globalThis.__piLoomHarnessCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "settingsManagerCreate", cwd: "/workspace/project" }),
          expect.objectContaining({ type: "sessionManagerInMemory", cwd: "/workspace/project" }),
        ]),
      );
      expect(createCall?.options).toMatchObject({
        cwd: "/workspace/project",
        sessionManager: expect.any(Object),
        settingsManager: expect.objectContaining({ __settingsManager: true }),
      });
      expect(createCall?.options).not.toHaveProperty("settings");
    } finally {
      piHarness.cleanup();
    }
  });

  it("fails fast when forwarded extensions do not provide Ralph worker tools", async () => {
    const launch: RalphLaunchDescriptor = {
      runId: "run-session-missing-tools",
      iterationId: "iter-001",
      iteration: 1,
      createdAt: "2026-03-20T12:00:00.000Z",
      runtime: "session",
      ticketRef: "rt-0456",
      planRef: "plan-123",
      packetRef: "ralph-run:run-session-missing-tools:packet",
      launchRef: "ralph-run:run-session-missing-tools:launch",
      resume: false,
      instructions: [],
    };

    globalThis.__piLoomHarnessToolNames = ["read"];
    const result = await runRalphLaunch("/workspace/project", launch, undefined, undefined, {
      [PI_PARENT_HARNESS_PACKAGE_ROOT_ENV]: fakeHarnessRoot,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("missing required tools: ralph_read, ticket_read, ticket_write");
  });

  it("forwards full upstream newSession options through headless extension bindings", async () => {
    const launch: RalphLaunchDescriptor = {
      runId: "run-session-new-session",
      iterationId: "iter-001",
      iteration: 1,
      createdAt: "2026-03-20T12:00:00.000Z",
      runtime: "session",
      ticketRef: "rt-0456",
      planRef: "plan-123",
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
      ticketRef: "rt-0456",
      planRef: "plan-123",
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
      errorMessage: "Harness session failed before updating the ticket ledger.",
    };

    const launch: RalphLaunchDescriptor = {
      runId: "run-error",
      iterationId: "iter-001",
      iteration: 1,
      createdAt: "2026-03-20T12:00:00.000Z",
      runtime: "session",
      ticketRef: "rt-0456",
      planRef: "plan-123",
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
      stderr: "Harness session failed before updating the ticket ledger.",
    });
  });

  it("waits for session idle before returning the assistant message", async () => {
    globalThis.__piLoomHarnessOutcome = {
      deferAssistantUntilSessionIdle: true,
      text: "session idle delivered the ticket update",
    };

    const launch: RalphLaunchDescriptor = {
      runId: "run-session-idle",
      iterationId: "iter-001",
      iteration: 1,
      createdAt: "2026-03-20T12:00:00.000Z",
      runtime: "session",
      ticketRef: "rt-0456",
      planRef: "plan-123",
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
      output: "session idle delivered the ticket update",
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
      ticketRef: "rt-0456",
      planRef: "plan-123",
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

  it("recognizes trusted durable iteration state by iteration id", () => {
    const workspace = mkdtempSync(join(tmpdir(), "pi-ralph-trusted-checkpoint-"));
    try {
      seedRuntimeLinkedEntities(workspace);
      const store = createRalphStore(workspace);
      const run = store.createRun({
        title: "Trusted iteration detection",
        objective: "Recognize complete durable iteration state for a bounded iteration.",
        scope: createTicketBoundScope(),
      });
      const prepared = store.prepareLaunch(run.state.runId, { focus: "Check the iteration helper." });
      const updated = store.appendIteration(run.state.runId, {
        id: prepared.launch.iterationId,
        status: "accepted",
        summary: "Iteration state landed.",
        workerSummary: "Durable ticket-backed iteration state persisted.",
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

  it("keeps the launched iteration trusted after a later iteration updates postIteration", () => {
    const workspace = mkdtempSync(join(tmpdir(), "pi-ralph-duplicate-checkpoint-"));
    try {
      seedRuntimeLinkedEntities(workspace);
      const store = createRalphStore(workspace);
      const run = store.createRun({
        title: "Duplicate iteration trust",
        objective: "Keep trust bound to the launched iteration id.",
        scope: createTicketBoundScope(),
      });

      const prepared = store.prepareLaunch(run.state.runId, { focus: "Record the launched iteration state." });
      const launchedIterationId = prepared.launch.iterationId;

      store.appendIteration(run.state.runId, {
        id: launchedIterationId,
        status: "accepted",
        summary: "Initial iteration state landed.",
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

      const duplicateIteration = store.appendIteration(run.state.runId, {
        id: launchedIterationId,
        status: "accepted",
        summary: "Duplicate iteration update refreshed the same iteration.",
        workerSummary: "The launched iteration kept its explicit decision.",
      });

      store.appendIteration(run.state.runId, {
        id: laterIterationId,
        status: "reviewing",
        summary: "A later iteration now owns postIteration.",
        workerSummary: "This newer iteration should not break trust in the launched iteration.",
      });

      const finalRun = store.readRun(run.state.runId);

      expect(finalRun.state.postIteration).toMatchObject({ iterationId: laterIterationId, status: "reviewing" });
      expect(duplicateIteration.iterations.find((iteration) => iteration.id === launchedIterationId)).toMatchObject({
        summary: "Duplicate iteration update refreshed the same iteration.",
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
    seedRuntimeLinkedEntities(workspace);
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
      scope: createTicketBoundScope(),
    });

    vi.setSystemTime(new Date("2026-03-16T09:01:00.000Z"));
    const reviewed = store.appendIteration(created.state.runId, {
      status: "reviewing",
      focus: "Record verifier evidence",
      summary: "Verifier blocked launch pending operator review.",
      verifier: {
        sourceKind: "test",
        sourceRef: "ralph/__tests__/runtime.test.ts",
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
      `Ralph run ${created.state.runId} is waiting for operator and cannot launch until that gate is cleared.`,
    );
  }, 90000);
});

describe("ralph loop policy enforcement", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "pi-ralph-loop-runtime-"));
    seedRuntimeLinkedEntities(workspace);
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(workspace, { recursive: true, force: true });
  });

  it("keeps live session transcript out of resumed Ralph launch instructions", async () => {
    const store = createRalphStore(workspace);
    const run = store.createRun({
      title: "Existing Ralph Run",
      objective: "Resume from durable state only.",
      policySnapshot: { verifierRequired: false },
      scope: createTicketBoundScope(),
    });
    const firstLaunch = store.prepareLaunch(run.state.runId, { focus: "Seed the first bounded iteration" });
    store.appendIteration(run.state.runId, {
      id: firstLaunch.launch.iterationId,
      status: "accepted",
      summary: "Persist the first bounded iteration state before resuming.",
      decision: {
        kind: "continue",
        reason: "unknown",
        summary: "Resume from durable state on the next iteration.",
        decidedAt: new Date().toISOString(),
        decidedBy: "policy",
        blockingRefs: [],
      },
    });

    const runtimeSpy = vi.spyOn(await import("../domain/runtime.js"), "runRalphLaunch");
    runtimeSpy.mockImplementationOnce(async (_cwd, launch) => {
      expect(launch.instructions).toEqual([
        "Primary objective for the next bounded iteration: tighten verifier freshness",
      ]);
      expect(launch.instructions.join("\n")).not.toContain("This transcript should stay out of the durable resume");
      expect(launch.resume).toBe(true);
      expect(launch.iterationId).toBe("iter-002");

      await recordBoundTicketActivity(workspace, launch.ticketRef, {
        status: "in_progress",
        journalText: "Accepted resumed iteration.",
      });

      return {
        command: "pi",
        args: ["session-runtime"],
        exitCode: 0,
        output: "ok",
        stderr: "",
        usage: { measured: true, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
        status: "completed",
      };
    });

    const result = await import("../domain/loop.js").then(({ executeRalphLoop }) =>
      executeRalphLoop(
        {
          cwd: workspace,
          sessionManager: {
            getBranch: () => [
              {
                type: "message",
                message: {
                  role: "user",
                  content: [{ type: "text", text: "This transcript should stay out of the durable resume." }],
                },
              },
            ],
          },
        } as unknown as ExtensionContext,
        {
          ref: run.state.runId,
          prompt: "tighten verifier freshness",
          iterations: 1,
        },
      ),
    );

    expect(result.created).toBe(false);
    expect(result.run.iterations.at(-1)).toMatchObject({
      id: "iter-002",
      decision: { kind: "continue" },
    });
    runtimeSpy.mockRestore();
  });

  it("halts the run when a bounded iteration exceeds the configured runtime limit", async () => {
    vi.useFakeTimers();
    const store = createRalphStore(workspace);
    const run = store.createRun({
      title: "Runtime bounded Ralph Run",
      objective: "Abort when the runtime limit is exceeded.",
      policySnapshot: { verifierRequired: false, maxRuntimeMinutes: 1 },
      scope: createTicketBoundScope(),
    });

    const runtimeSpy = vi.spyOn(await import("../domain/runtime.js"), "runRalphLaunch");
    runtimeSpy.mockImplementationOnce(async (_cwd, _launch, signal, _onUpdate, _extraEnv, onEvent) => {
      await onEvent?.({ type: "launch_state", state: "running", at: new Date().toISOString() });
      return await new Promise((resolve) => {
        signal?.addEventListener(
          "abort",
          () => {
            resolve({
              command: "pi",
              args: ["session-runtime"],
              exitCode: 1,
              output: "",
              stderr: "Aborted",
              usage: { measured: false, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
              status: "cancelled",
            });
          },
          { once: true },
        );
      });
    });

    const { executeRalphLoop } = await import("../domain/loop.js");
    const loopPromise = executeRalphLoop(
      {
        cwd: workspace,
        sessionManager: { getBranch: () => [] },
      } as unknown as ExtensionContext,
      { ref: run.state.runId, prompt: "do work", iterations: 1 },
    );
    await vi.advanceTimersByTimeAsync(60_001);
    await vi.advanceTimersByTimeAsync(2_001);
    const result = await loopPromise;

    expect(result.run.state.latestDecision).toMatchObject({ kind: "halt", reason: "timeout_exceeded" });
    expect(result.run.state.status).toBe("halted");
    expect(result.run.runtimeArtifacts.at(-1)).toMatchObject({ status: "failed" });
    expect(result.run.iterations.at(-1)).toMatchObject({
      id: "iter-001",
      decision: { kind: "halt", reason: "timeout_exceeded" },
    });
    runtimeSpy.mockRestore();
  });

  it("applies a rerun policy snapshot for an existing bound run before enforcing runtime limits", async () => {
    const boundWorkspace = mkdtempSync(join(tmpdir(), "pi-ralph-loop-bound-policy-"));
    try {
      const store = createRalphStore(boundWorkspace);
      const ticketStore = createTicketStore(boundWorkspace);
      const planStore = createPlanStore(boundWorkspace);
      const ticket = await ticketStore.createTicketAsync({ title: "Bound ticket" });
      const plan = await planStore.createPlan({
        title: "Bound plan",
        sourceTarget: { kind: "workspace", ref: "." },
      });
      await planStore.linkPlanTicket(plan.state.planId, { ticketId: ticket.summary.id, role: "implementation" });
      const run = store.createRun({
        title: "Bound Ralph Run",
        objective: "Update durable policy before rerunning an existing bound run.",
        policySnapshot: { mode: "balanced", verifierRequired: false, maxRuntimeMinutes: 5 },
        scope: {
          ...createTicketBoundScope(ticket.summary.id, plan.state.planId),
          specChangeId: null,
        },
      });

      const runtimeSpy = vi.spyOn(await import("../domain/runtime.js"), "runRalphLaunch");
      runtimeSpy.mockImplementationOnce(async (_cwd, _launch, signal, _onUpdate, _extraEnv, onEvent) => {
        await onEvent?.({ type: "launch_state", state: "running", at: new Date().toISOString() });
        return await new Promise((resolve) => {
          signal?.addEventListener(
            "abort",
            () => {
              resolve({
                command: "pi",
                args: ["session-runtime"],
                exitCode: 1,
                output: "",
                stderr: "Aborted",
                usage: { measured: false, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
                status: "cancelled",
              });
            },
            { once: true },
          );
        });
      });

      const { executeRalphLoop } = await import("../domain/loop.js");
      vi.useFakeTimers();
      const loopPromise = executeRalphLoop(
        {
          cwd: boundWorkspace,
          sessionManager: { getBranch: () => [] },
        } as unknown as ExtensionContext,
        {
          ticketRef: ticket.summary.id,
          planRef: plan.state.planId,
          prompt: "rerun with stricter timeout",
          iterations: 1,
          policySnapshot: { mode: "strict", verifierRequired: false, maxRuntimeMinutes: 1 },
        },
      );
      await vi.advanceTimersByTimeAsync(60_001);
      await vi.advanceTimersByTimeAsync(2_001);
      const result = await loopPromise;

      expect(result.created).toBe(false);
      expect(result.run.state.latestDecision).toMatchObject({ kind: "halt", reason: "timeout_exceeded" });
      expect(result.run.state.policySnapshot).toMatchObject({
        mode: "strict",
        maxRuntimeMinutes: 1,
        verifierRequired: false,
      });
      expect(createRalphStore(boundWorkspace).readRun(run.state.runId).state.policySnapshot).toMatchObject({
        mode: "strict",
        maxRuntimeMinutes: 1,
        verifierRequired: false,
      });
      runtimeSpy.mockRestore();
    } finally {
      rmSync(boundWorkspace, { recursive: true, force: true });
    }
  }, 15000);

  it("reruns a halted runtime-failure loop by preparing a fresh bounded iteration", async () => {
    vi.useFakeTimers();
    const store = createRalphStore(workspace);
    const run = store.createRun({
      title: "Rerunnable halted Ralph Run",
      objective: "Resume after a runtime-induced halt.",
      policySnapshot: { verifierRequired: false, maxRuntimeMinutes: 1 },
      scope: createTicketBoundScope(),
    });

    const runtimeSpy = vi.spyOn(await import("../domain/runtime.js"), "runRalphLaunch");
    runtimeSpy
      .mockImplementationOnce(async (_cwd, _launch, signal, _onUpdate, _extraEnv, onEvent) => {
        await onEvent?.({ type: "launch_state", state: "running", at: new Date().toISOString() });
        return await new Promise((resolve) => {
          signal?.addEventListener(
            "abort",
            () => {
              resolve({
                command: "pi",
                args: ["session-runtime"],
                exitCode: 1,
                output: "",
                stderr: "Aborted",
                usage: { measured: false, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
                status: "cancelled",
              });
            },
            { once: true },
          );
        });
      })
      .mockImplementationOnce(async (_cwd, launch) => {
        await recordBoundTicketActivity(workspace, launch.ticketRef, {
          status: "in_progress",
          journalText: "Fresh rerun ticket activity landed.",
        });

        return {
          command: "pi",
          args: ["session-runtime"],
          exitCode: 0,
          output: "rerun ok",
          stderr: "",
          usage: { measured: true, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
          status: "completed",
        };
      });

    const { executeRalphLoop } = await import("../domain/loop.js");
    const firstLoop = executeRalphLoop(
      {
        cwd: workspace,
        sessionManager: { getBranch: () => [] },
      } as unknown as ExtensionContext,
      { ref: run.state.runId, prompt: "do work", iterations: 1 },
    );
    await vi.advanceTimersByTimeAsync(60_001);
    await vi.advanceTimersByTimeAsync(2_001);
    const firstResult = await firstLoop;

    expect(firstResult.run.state.status).toBe("halted");
    expect(firstResult.run.iterations.at(-1)?.id).toBe("iter-001");

    const secondResult = await executeRalphLoop(
      {
        cwd: workspace,
        sessionManager: { getBranch: () => [] },
      } as unknown as ExtensionContext,
      {
        ref: run.state.runId,
        prompt: "try again",
        iterations: 1,
        policySnapshot: { mode: "strict", verifierRequired: false, maxRuntimeMinutes: 2 },
      },
    );

    expect(secondResult.steps).toHaveLength(1);
    expect(secondResult.steps[0]).toMatchObject({ iterationId: "iter-002", finalDecision: "continue" });
    expect(secondResult.run.iterations.at(-1)).toMatchObject({ id: "iter-002", status: "accepted" });
    expect(secondResult.run.state.status).toBe("active");
    expect(secondResult.run.state.policySnapshot).toMatchObject({
      mode: "strict",
      maxRuntimeMinutes: 2,
      verifierRequired: false,
    });
    runtimeSpy.mockRestore();
  });

  it("honors late ticket activity during the grace window instead of writing missing-ticket-activity failure state", async () => {
    vi.useFakeTimers();
    const store = createRalphStore(workspace);
    const run = store.createRun({
      title: "Timeout grace Ralph Run",
      objective: "Keep late ticket activity truthful when timeout fires first.",
      policySnapshot: { verifierRequired: false, maxRuntimeMinutes: 1 },
      scope: createTicketBoundScope(),
    });

    const runtimeSpy = vi.spyOn(await import("../domain/runtime.js"), "runRalphLaunch");
    runtimeSpy.mockImplementationOnce(async (_cwd, launch, signal, _onUpdate, _extraEnv, onEvent) => {
      await onEvent?.({ type: "launch_state", state: "running", at: new Date().toISOString() });
      return await new Promise((resolve) => {
        signal?.addEventListener(
          "abort",
          async () => {
            await recordBoundTicketActivity(workspace, launch.ticketRef, {
              status: "in_progress",
              journalText: "Ticket activity landed during timeout shutdown.",
            });
            resolve({
              command: "pi",
              args: ["session-runtime"],
              exitCode: 1,
              output: "",
              stderr: "Timed out",
              usage: { measured: false, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
              status: "failed",
            });
          },
          { once: true },
        );
      });
    });

    const { executeRalphLoop } = await import("../domain/loop.js");
    const loopPromise = executeRalphLoop(
      {
        cwd: workspace,
        sessionManager: { getBranch: () => [] },
      } as unknown as ExtensionContext,
      { ref: run.state.runId, prompt: "do work", iterations: 1 },
    );
    await vi.advanceTimersByTimeAsync(60_001);
    await vi.advanceTimersByTimeAsync(2_001);
    const result = await loopPromise;

    expect(result.run.runtimeArtifacts.at(-1)).toMatchObject({ missingTicketActivity: false, status: "failed" });
    expect(result.run.iterations.at(-1)).toMatchObject({
      id: "iter-001",
      status: "accepted",
      decision: { kind: "halt", reason: "timeout_exceeded" },
    });
    runtimeSpy.mockRestore();
  });

  it("halts the run when runtime token usage exceeds the configured budget", async () => {
    const store = createRalphStore(workspace);
    const run = store.createRun({
      title: "Budget bounded Ralph Run",
      objective: "Stop when token usage exceeds budget.",
      policySnapshot: { verifierRequired: false, tokenBudget: 100 },
      scope: createTicketBoundScope(),
    });

    const runtimeSpy = vi.spyOn(await import("../domain/runtime.js"), "runRalphLaunch");
    runtimeSpy.mockImplementationOnce(async (_cwd, launch) => {
      await recordBoundTicketActivity(workspace, launch.ticketRef, {
        status: "in_progress",
        journalText: "Ticket activity recorded before the policy audit.",
      });

      return {
        command: "pi",
        args: ["session-runtime"],
        exitCode: 0,
        output: "ok",
        stderr: "",
        usage: { measured: true, input: 40, output: 70, cacheRead: 0, cacheWrite: 0, totalTokens: 110 },
        status: "completed",
      };
    });

    const { executeRalphLoop } = await import("../domain/loop.js");
    const result = await executeRalphLoop(
      {
        cwd: workspace,
        sessionManager: { getBranch: () => [] },
      } as unknown as ExtensionContext,
      { ref: run.state.runId, prompt: "do work", iterations: 1 },
    );

    expect(result.run.state.latestDecision).toMatchObject({ kind: "halt", reason: "budget_exceeded" });
    expect(result.run.state.status).toBe("halted");
    expect(result.run.runtimeArtifacts.at(-1)).toMatchObject({
      usage: { totalTokens: 110 },
    });
    expect(result.run.iterations.at(-1)).toMatchObject({
      id: "iter-001",
      status: "accepted",
      decision: { kind: "halt", reason: "budget_exceeded" },
    });
    runtimeSpy.mockRestore();
  });

  it("treats missing usage plus missing ticket activity as runtime failure, not runtime_unavailable", async () => {
    const store = createRalphStore(workspace);
    const run = store.createRun({
      title: "No-activity usage gap Ralph Run",
      objective: "Keep missing ticket activity as the primary failure signal.",
      policySnapshot: { verifierRequired: false, tokenBudget: 100 },
      scope: createTicketBoundScope(),
    });

    const runtimeSpy = vi.spyOn(await import("../domain/runtime.js"), "runRalphLaunch");
    runtimeSpy.mockImplementationOnce(async () => ({
      command: "pi",
      args: ["session-runtime"],
      exitCode: 0,
      output: "",
      stderr: "",
      usage: { measured: false, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
      status: "completed",
      events: [{ type: "launch_state", state: "running", at: new Date().toISOString() }],
    }));

    const { executeRalphLoop } = await import("../domain/loop.js");
    const result = await executeRalphLoop(
      {
        cwd: workspace,
        sessionManager: { getBranch: () => [] },
      } as unknown as ExtensionContext,
      { ref: run.state.runId, prompt: "do work", iterations: 1 },
    );

    expect(result.run.state.latestDecision).toMatchObject({ kind: "halt", reason: "runtime_failure" });
    expect(result.run.state.latestDecision?.summary).not.toContain("token usage");
    expect(result.run.runtimeArtifacts.at(-1)).toMatchObject({ missingTicketActivity: true });
    expect(result.run.iterations.at(-1)).toMatchObject({
      id: "iter-001",
      status: "failed",
      decision: { kind: "halt", reason: "runtime_failure" },
    });
    runtimeSpy.mockRestore();
  });
});
