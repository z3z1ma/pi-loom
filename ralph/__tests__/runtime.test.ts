import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlanStore } from "#plans/domain/store.js";
import { createSeededGitWorkspace, createSeededParentGitWorkspace } from "#storage/__tests__/helpers/git-fixture.js";
import { findEntityByDisplayId } from "#storage/entities.js";
import { createEntityId } from "#storage/ids.js";
import {
  PI_LOOM_RUNTIME_REPOSITORY_ID_ENV,
  PI_LOOM_RUNTIME_SPACE_ID_ENV,
  PI_LOOM_RUNTIME_WORKTREE_ID_ENV,
} from "#storage/runtime-scope.js";
import { selectActiveScope } from "#storage/scope.js";
import {
  closeAllWorkspaceStorage,
  openRepositoryWorkspaceStorage,
  openWorkspaceStorage,
  openWorkspaceStorageSync,
} from "#storage/workspace.js";
import { createTicketStore } from "#ticketing/domain/store.js";
import { hasTrustedPostIteration } from "../domain/loop.js";
import type { RalphLaunchDescriptor } from "../domain/models.js";
import { renderLaunchDescriptor, renderLaunchPrompt } from "../domain/render.js";
import { PI_RALPH_HARNESS_PACKAGE_ROOT_ENV, resolveRalphExtensionRoot, runRalphLaunch } from "../domain/runtime.js";
import { createRalphStore } from "../domain/store.js";

function createTicketBoundScope(
  ticketId = "rt-0456",
  planId = "plan-123",
  specChangeId = "spec-789",
  repositoryId: string | null = null,
) {
  return {
    mode: "execute" as const,
    repositoryId,
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

function createLaunch(overrides: Partial<RalphLaunchDescriptor> = {}): RalphLaunchDescriptor {
  return {
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
    ...overrides,
  };
}

function createFakeHarnessPackage(shape: "pi" | "omp" = "omp") {
  const root = mkdtempSync(join(tmpdir(), `pi-loom-ralph-${shape}-`));
  const packageName = shape === "omp" ? "@oh-my-pi/pi-coding-agent" : "@mariozechner/pi-coding-agent";
  const binName = shape;
  const binPath = join(root, "bin", `${binName}.js`);
  const packageJsonPath = join(root, "package.json");
  mkdirSync(join(root, "bin"), { recursive: true });
  writeFileSync(
    packageJsonPath,
    JSON.stringify(
      {
        name: packageName,
        version: "0.0.0-test",
        type: "commonjs",
        bin: {
          [binName]: `bin/${binName}.js`,
        },
      },
      null,
      2,
    ),
  );
  writeFileSync(
    binPath,
    `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function now() {
  return new Date().toISOString();
}

function append(filePath, record) {
  fs.appendFileSync(filePath, JSON.stringify(record) + "\\n");
}

function usage(values) {
  return {
    input: values.input || 0,
    output: values.output || 0,
    cacheRead: values.cacheRead || 0,
    cacheWrite: values.cacheWrite || 0,
    totalTokens: values.totalTokens || (values.input || 0) + (values.output || 0) + (values.cacheRead || 0) + (values.cacheWrite || 0),
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  const scenario = process.env.PI_RALPH_TEST_SCENARIO || "success";
  const sessionDir = argValue("--session-dir");
  if (!sessionDir) {
    process.stderr.write("missing --session-dir\\n");
    process.exit(1);
    return;
  }
  fs.mkdirSync(sessionDir, { recursive: true });
  const filePath = path.join(sessionDir, now().replace(/[:.]/g, "-") + "_test.jsonl");
  append(filePath, {
    type: "session",
    version: 3,
    id: "test-session",
    timestamp: now(),
    cwd: process.cwd(),
  });

  process.on("SIGTERM", () => {
    if (scenario === "slow_abort") {
      append(filePath, {
        type: "message",
        timestamp: now(),
        message: {
          role: "assistant",
          content: [],
          errorMessage: "Aborted by test signal.",
          stopReason: "aborted",
        },
      });
      process.exit(0);
      return;
    }
    process.exit(143);
  });

  if (scenario === "assistant_error") {
    append(filePath, {
      type: "message",
      timestamp: now(),
      message: {
        role: "assistant",
        content: [],
        errorMessage: "Harness session failed before updating the ticket ledger.",
        stopReason: "error",
        usage: usage({ input: 5, output: 0 }),
      },
    });
    process.exit(0);
    return;
  }

  if (scenario === "slow_abort") {
    await delay(30_000);
    process.exit(0);
    return;
  }

  append(filePath, {
    type: "message",
    timestamp: now(),
    message: {
      role: "assistant",
      content: [{ type: "toolCall", id: "tool-001", name: "ticket_write" }],
      usage: usage({ input: 10, output: 1, totalTokens: 11 }),
      stopReason: "toolUse",
    },
  });
  append(filePath, {
    type: "message",
    timestamp: now(),
    message: {
      role: "toolResult",
      toolCallId: "tool-001",
      toolName: "ticket_write",
      content: [{ type: "text", text: "updated ticket" }],
      isError: false,
    },
  });
  append(filePath, {
    type: "message",
    timestamp: now(),
    message: {
      role: "assistant",
      content: [{ type: "text", text: process.env.PI_RALPH_TEST_OUTPUT || "session runtime ok" }],
      usage: usage({ input: 20, output: 30, cacheRead: 4, totalTokens: 54 }),
      stopReason: "stop",
    },
  });
  process.exit(0);
})();
`,
  );
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
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
    repositoryId?: string;
    status?: "open" | "in_progress" | "review";
    journalText?: string;
    verificationText?: string;
    close?: boolean;
  } = {},
): Promise<void> {
  const ticketStore = createTicketStore(
    workspace,
    options.repositoryId ? { repositoryId: options.repositoryId } : undefined,
  );
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
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length > 0) {
      cleanups.pop()?.();
    }
  });

  it("resolves the Ralph extension root from the package, not the caller workspace", () => {
    expect(resolveRalphExtensionRoot()).toBe(resolve("."));
  });

  it("renders launch packet refs without attempting repo-path translation", () => {
    const launch = createLaunch({ resume: true });

    expect(renderLaunchDescriptor("/workspace/project", launch)).toContain("Packet ref: ralph-run:run-session:packet");
    expect(renderLaunchDescriptor("/workspace/project", launch)).toContain(
      "Packet read call: ralph_read ticketRef=rt-0456 planRef=plan-123 mode=packet",
    );
    expect(renderLaunchPrompt("/workspace/project", launch)).toContain(
      "Use the exact ticketRef/planRef from this launch when reading Ralph packet state; do not derive alternate refs from the run id or packet ref.",
    );
  });

  it("executes launches through a subprocess harness and tails JSONL output", async () => {
    const fakeHarness = createFakeHarnessPackage("omp");
    cleanups.push(fakeHarness.cleanup);
    const updates: string[] = [];
    const events: Array<{ type: string; phase?: string; toolName?: string; state?: string }> = [];

    const result = await runRalphLaunch(
      process.cwd(),
      createLaunch(),
      undefined,
      (text) => updates.push(text),
      {
        [PI_RALPH_HARNESS_PACKAGE_ROOT_ENV]: fakeHarness.root,
        PI_RALPH_TEST_SCENARIO: "success",
        PI_RALPH_TEST_OUTPUT: "bounded ticket update landed",
      },
      (event) => {
        events.push(event);
      },
    );

    expect(result).toMatchObject({
      command: process.execPath,
      exitCode: 0,
      output: "bounded ticket update landed",
      stderr: "",
      status: "completed",
      usage: { measured: true, input: 30, output: 31, cacheRead: 4, cacheWrite: 0, totalTokens: 65 },
    });
    expect(result.args).toEqual(
      expect.arrayContaining([
        expect.stringContaining("bin/omp.js"),
        "-e",
        resolve("."),
        "--mode=json",
        "--session-dir",
      ]),
    );
    expect(updates).toEqual(["bounded ticket update landed"]);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "launch_state", state: "queued" }),
        expect.objectContaining({ type: "launch_state", state: "running" }),
        expect.objectContaining({ type: "tool_execution", phase: "start", toolName: "ticket_write" }),
        expect.objectContaining({ type: "tool_execution", phase: "end", toolName: "ticket_write" }),
        expect.objectContaining({ type: "assistant_message" }),
      ]),
    );
  });

  it("resolves the pi binary when the current harness package is pi-mono shaped", async () => {
    const fakeHarness = createFakeHarnessPackage("pi");
    cleanups.push(fakeHarness.cleanup);

    const result = await runRalphLaunch(process.cwd(), createLaunch(), undefined, undefined, {
      [PI_RALPH_HARNESS_PACKAGE_ROOT_ENV]: fakeHarness.root,
      PI_RALPH_TEST_SCENARIO: "success",
    });

    expect(result.exitCode).toBe(0);
    expect(result.args[0]).toContain("bin/pi.js");
  });

  it("surfaces assistant errors from the subprocess session log", async () => {
    const fakeHarness = createFakeHarnessPackage("omp");
    cleanups.push(fakeHarness.cleanup);

    const result = await runRalphLaunch(process.cwd(), createLaunch(), undefined, undefined, {
      [PI_RALPH_HARNESS_PACKAGE_ROOT_ENV]: fakeHarness.root,
      PI_RALPH_TEST_SCENARIO: "assistant_error",
    });

    expect(result.exitCode).toBe(0);
    expect(result.status).toBe("failed");
    expect(result.stderr).toContain("Harness session failed before updating the ticket ledger.");
  });

  it("aborts an in-flight subprocess harness when the caller aborts", async () => {
    const fakeHarness = createFakeHarnessPackage("omp");
    cleanups.push(fakeHarness.cleanup);
    const abortController = new AbortController();

    const resultPromise = runRalphLaunch(process.cwd(), createLaunch(), abortController.signal, undefined, {
      [PI_RALPH_HARNESS_PACKAGE_ROOT_ENV]: fakeHarness.root,
      PI_RALPH_TEST_SCENARIO: "slow_abort",
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    abortController.abort();

    await expect(resultPromise).resolves.toMatchObject({
      exitCode: 0,
      output: "",
      stderr: expect.stringContaining("Aborted"),
      status: "cancelled",
    });
  });
});

describe("ralph trusted iteration handling", () => {
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

  it("propagates repository-targeted runtime scope into session launches and runtime artifacts", async () => {
    const workspace = createSeededParentGitWorkspace({
      prefix: "pi-ralph-runtime-scope-",
      repositories: [
        { name: "service-a", remoteUrl: "git@github.com:example/service-a.git" },
        { name: "service-b", remoteUrl: "git@github.com:example/service-b.git" },
      ],
    });
    const loomRoot = mkdtempSync(join(tmpdir(), "pi-ralph-runtime-scope-state-"));
    process.env.PI_LOOM_ROOT = loomRoot;

    try {
      const { identity } = await openWorkspaceStorage(workspace.cwd);
      const serviceA = identity.repositories.find(
        (repository) =>
          repository.displayName === "service-a" || repository.remoteUrls.some((url) => url.includes("service-a")),
      );
      expect(serviceA).toBeDefined();
      if (!serviceA) {
        throw new Error("Missing service-a repository identity");
      }

      const { identity: scopedIdentity } = await openRepositoryWorkspaceStorage(workspace.cwd, {
        repositoryId: serviceA.id,
      });
      process.env[PI_LOOM_RUNTIME_SPACE_ID_ENV] = scopedIdentity.space.id;
      process.env[PI_LOOM_RUNTIME_REPOSITORY_ID_ENV] = serviceA.id;
      process.env[PI_LOOM_RUNTIME_WORKTREE_ID_ENV] = scopedIdentity.worktree.id;

      const ticketStore = createTicketStore(workspace.cwd, { repositoryId: serviceA.id });
      const ticket = await ticketStore.createTicketAsync({
        title: "Scoped Ralph runtime ticket",
        summary: "Keep Ralph runtime launches pinned to service-a.",
        plan: "Run one bounded iteration with explicit runtime scope.",
        verification: "Inspect runtime artifact scope.",
      });

      const planStore = createPlanStore(workspace.cwd, { repositoryId: serviceA.id });
      const plan = await planStore.createPlan({
        title: "Scoped Ralph runtime plan",
        summary: "Exercise the Ralph runtime scope contract.",
        sourceTarget: { kind: "workspace", ref: "service-a" },
      });
      await planStore.linkPlanTicket(plan.state.planId, { ticketId: ticket.summary.id, role: "execution" });

      const runtimeSpy = vi.spyOn(await import("../domain/runtime.js"), "runRalphLaunch");
      runtimeSpy.mockImplementationOnce(async (_cwd, launch, _signal, _onUpdate, extraEnv) => {
        expect(launch.ticketRef).toBe(ticket.summary.id);
        expect(extraEnv).toMatchObject({
          [PI_LOOM_RUNTIME_SPACE_ID_ENV]: scopedIdentity.space.id,
          [PI_LOOM_RUNTIME_REPOSITORY_ID_ENV]: serviceA.id,
          [PI_LOOM_RUNTIME_WORKTREE_ID_ENV]: scopedIdentity.worktree.id,
        });

        await ticketStore.updateTicketAsync(ticket.summary.id, { status: "in_progress" });
        await ticketStore.addJournalEntryAsync(
          ticket.summary.id,
          "progress",
          "Recorded iter-001 runtime scope propagation through Ralph session launch.",
        );

        return {
          command: "pi",
          args: ["session-runtime"],
          exitCode: 0,
          output: "scoped runtime ok",
          stderr: "",
          usage: { measured: true, input: 4, output: 6, cacheRead: 0, cacheWrite: 0, totalTokens: 10 },
          status: "completed",
        };
      });

      const { executeRalphLoop } = await import("../domain/loop.js");
      const result = await executeRalphLoop(
        {
          cwd: workspace.cwd,
          sessionManager: { getBranch: () => [] },
        } as unknown as ExtensionContext,
        { ticketRef: ticket.summary.id, planRef: plan.state.planId, iterations: 1 },
      );

      expect(result.run.state.scope).toMatchObject({ repositoryId: serviceA.id, ticketId: ticket.summary.id });
      expect(result.run.runtimeArtifacts.at(-1)).toMatchObject({
        runtimeScope: {
          spaceId: scopedIdentity.space.id,
          repositoryId: serviceA.id,
          worktreeId: scopedIdentity.worktree.id,
        },
      });

      const { storage, identity: readIdentity } = await openWorkspaceStorage(workspace.cwd);
      const runEntity = await findEntityByDisplayId(
        storage,
        readIdentity.space.id,
        "ralph_run",
        result.run.state.runId,
      );
      expect(runEntity).toMatchObject({ owningRepositoryId: serviceA.id });
      runtimeSpy.mockRestore();
    } finally {
      delete process.env[PI_LOOM_RUNTIME_SPACE_ID_ENV];
      delete process.env[PI_LOOM_RUNTIME_REPOSITORY_ID_ENV];
      delete process.env[PI_LOOM_RUNTIME_WORKTREE_ID_ENV];
      delete process.env.PI_LOOM_ROOT;
      rmSync(loomRoot, { recursive: true, force: true });
      workspace.cleanup();
    }
  }, 120000);

  it("creates reads and lists a repository-bound run from a parent workspace without runtime scope env", async () => {
    const workspace = createSeededParentGitWorkspace({
      prefix: "pi-ralph-parent-workspace-",
      repositories: [
        { name: "service-a", remoteUrl: "git@github.com:example/service-a.git" },
        { name: "service-b", remoteUrl: "git@github.com:example/service-b.git" },
      ],
    });
    const loomRoot = mkdtempSync(join(tmpdir(), "pi-ralph-parent-workspace-state-"));
    const previousRuntimeEnv = {
      root: process.env.PI_LOOM_ROOT,
      spaceId: process.env[PI_LOOM_RUNTIME_SPACE_ID_ENV],
      repositoryId: process.env[PI_LOOM_RUNTIME_REPOSITORY_ID_ENV],
      worktreeId: process.env[PI_LOOM_RUNTIME_WORKTREE_ID_ENV],
    };
    process.env.PI_LOOM_ROOT = loomRoot;
    delete process.env[PI_LOOM_RUNTIME_SPACE_ID_ENV];
    delete process.env[PI_LOOM_RUNTIME_REPOSITORY_ID_ENV];
    delete process.env[PI_LOOM_RUNTIME_WORKTREE_ID_ENV];

    try {
      const { identity } = await openWorkspaceStorage(workspace.cwd);
      const serviceA = identity.repositories.find(
        (repository) =>
          repository.displayName === "service-a" || repository.remoteUrls.some((url) => url.includes("service-a")),
      );
      const serviceB = identity.repositories.find(
        (repository) =>
          repository.displayName === "service-b" || repository.remoteUrls.some((url) => url.includes("service-b")),
      );
      expect(serviceA).toBeDefined();
      expect(serviceB).toBeDefined();
      if (!serviceA || !serviceB) {
        throw new Error("Missing seeded repository identities");
      }

      const ticketStore = createTicketStore(workspace.cwd, { repositoryId: serviceA.id });
      const ticket = await ticketStore.createTicketAsync({
        title: "Parent workspace Ralph ticket",
        summary: "Bind Ralph to service-a without pre-scoped runtime env.",
        plan: "Create and read the Ralph run from the ambiguous parent workspace.",
        verification: "Inspect the run scope and owning repository attribution.",
      });

      const planStore = createPlanStore(workspace.cwd, { repositoryId: serviceA.id });
      const plan = await planStore.createPlan({
        title: "Parent workspace Ralph plan",
        summary: "Exercise Ralph control-path creation from the parent workspace.",
        sourceTarget: { kind: "workspace", ref: "service-a" },
      });
      await planStore.linkPlanTicket(plan.state.planId, { ticketId: ticket.summary.id, role: "execution" });

      const { ensureRalphRun } = await import("../domain/loop.js");
      const created = await ensureRalphRun(
        {
          cwd: workspace.cwd,
          sessionManager: { getBranch: () => [] },
        } as unknown as ExtensionContext,
        { ticketRef: ticket.summary.id, planRef: plan.state.planId },
      );

      expect(created.created).toBe(true);
      expect(created.run.state.scope).toMatchObject({
        repositoryId: serviceA.id,
        planId: plan.state.planId,
        ticketId: ticket.summary.id,
      });
      expect(created.run.state.scope.repositoryId).not.toBe(serviceB.id);

      const parentStore = createRalphStore(workspace.cwd);
      const reread = await parentStore.readRunAsync(created.run.state.runId);
      expect(reread.state.scope.repositoryId).toBe(serviceA.id);

      const listed = await parentStore.listRunsAsync();
      expect(listed.map((run) => run.id)).toContain(created.run.summary.id);

      const { storage, identity: readIdentity } = await openWorkspaceStorage(workspace.cwd);
      const runEntity = await findEntityByDisplayId(
        storage,
        readIdentity.space.id,
        "ralph_run",
        created.run.state.runId,
      );
      expect(runEntity).toMatchObject({ owningRepositoryId: serviceA.id });
      expect(created.run.runtimeArtifacts).toHaveLength(0);
    } finally {
      if (previousRuntimeEnv.root === undefined) {
        delete process.env.PI_LOOM_ROOT;
      } else {
        process.env.PI_LOOM_ROOT = previousRuntimeEnv.root;
      }
      if (previousRuntimeEnv.spaceId === undefined) {
        delete process.env[PI_LOOM_RUNTIME_SPACE_ID_ENV];
      } else {
        process.env[PI_LOOM_RUNTIME_SPACE_ID_ENV] = previousRuntimeEnv.spaceId;
      }
      if (previousRuntimeEnv.repositoryId === undefined) {
        delete process.env[PI_LOOM_RUNTIME_REPOSITORY_ID_ENV];
      } else {
        process.env[PI_LOOM_RUNTIME_REPOSITORY_ID_ENV] = previousRuntimeEnv.repositoryId;
      }
      if (previousRuntimeEnv.worktreeId === undefined) {
        delete process.env[PI_LOOM_RUNTIME_WORKTREE_ID_ENV];
      } else {
        process.env[PI_LOOM_RUNTIME_WORKTREE_ID_ENV] = previousRuntimeEnv.worktreeId;
      }
      rmSync(loomRoot, { recursive: true, force: true });
      workspace.cleanup();
    }
  }, 120000);

  it("keeps concurrent repository-bound launches scoped per repository from an ambiguous parent workspace", async () => {
    const workspace = createSeededParentGitWorkspace({
      prefix: "pi-ralph-parent-concurrent-",
      repositories: [
        { name: "service-a", remoteUrl: "git@github.com:example/service-a.git" },
        { name: "service-b", remoteUrl: "git@github.com:example/service-b.git" },
      ],
    });
    const loomRoot = mkdtempSync(join(tmpdir(), "pi-ralph-parent-concurrent-state-"));
    const previousRuntimeEnv = {
      root: process.env.PI_LOOM_ROOT,
      spaceId: process.env[PI_LOOM_RUNTIME_SPACE_ID_ENV],
      repositoryId: process.env[PI_LOOM_RUNTIME_REPOSITORY_ID_ENV],
      worktreeId: process.env[PI_LOOM_RUNTIME_WORKTREE_ID_ENV],
    };
    process.env.PI_LOOM_ROOT = loomRoot;
    delete process.env[PI_LOOM_RUNTIME_SPACE_ID_ENV];
    delete process.env[PI_LOOM_RUNTIME_REPOSITORY_ID_ENV];
    delete process.env[PI_LOOM_RUNTIME_WORKTREE_ID_ENV];

    try {
      const { identity } = await openWorkspaceStorage(workspace.cwd);
      const serviceA = identity.repositories.find(
        (repository) =>
          repository.displayName === "service-a" || repository.remoteUrls.some((url) => url.includes("service-a")),
      );
      const serviceB = identity.repositories.find(
        (repository) =>
          repository.displayName === "service-b" || repository.remoteUrls.some((url) => url.includes("service-b")),
      );
      expect(serviceA).toBeDefined();
      expect(serviceB).toBeDefined();
      if (!serviceA || !serviceB) {
        throw new Error("Missing seeded repository identities");
      }

      const { identity: scopedServiceA } = await openRepositoryWorkspaceStorage(workspace.cwd, {
        repositoryId: serviceA.id,
      });
      const { identity: scopedServiceB } = await openRepositoryWorkspaceStorage(workspace.cwd, {
        repositoryId: serviceB.id,
      });

      const ticketStoreA = createTicketStore(workspace.cwd, { repositoryId: serviceA.id });
      const ticketA = await ticketStoreA.createTicketAsync({
        title: "Concurrent service-a Ralph ticket",
        summary: "Launch Ralph for service-a from the ambiguous parent workspace.",
        plan: "Run a bounded iteration concurrently with the service-b launch.",
        verification: "Inspect the runtime scope and persisted repository attribution.",
      });
      const planStoreA = createPlanStore(workspace.cwd, { repositoryId: serviceA.id });
      const planA = await planStoreA.createPlan({
        title: "Concurrent service-a Ralph plan",
        summary: "Exercise repository-bound concurrent Ralph launches for service-a.",
        sourceTarget: { kind: "workspace", ref: "service-a" },
      });
      await planStoreA.linkPlanTicket(planA.state.planId, { ticketId: ticketA.summary.id, role: "execution" });

      const ticketStoreB = createTicketStore(workspace.cwd, { repositoryId: serviceB.id });
      const ticketB = await ticketStoreB.createTicketAsync({
        title: "Concurrent service-b Ralph ticket",
        summary: "Launch Ralph for service-b from the ambiguous parent workspace.",
        plan: "Run a bounded iteration concurrently with the service-a launch.",
        verification: "Inspect the runtime scope and persisted repository attribution.",
      });
      const planStoreB = createPlanStore(workspace.cwd, { repositoryId: serviceB.id });
      const planB = await planStoreB.createPlan({
        title: "Concurrent service-b Ralph plan",
        summary: "Exercise repository-bound concurrent Ralph launches for service-b.",
        sourceTarget: { kind: "workspace", ref: "service-b" },
      });
      await planStoreB.linkPlanTicket(planB.state.planId, { ticketId: ticketB.summary.id, role: "execution" });

      const { ensureRalphRun, executeRalphLoop } = await import("../domain/loop.js");
      const ctx = {
        cwd: workspace.cwd,
        sessionManager: { getBranch: () => [] },
      } as unknown as ExtensionContext;
      const createdA = await ensureRalphRun(ctx, { ticketRef: ticketA.summary.id, planRef: planA.state.planId });
      const createdB = await ensureRalphRun(ctx, { ticketRef: ticketB.summary.id, planRef: planB.state.planId });

      let releaseLaunches!: () => void;
      const launchRelease = new Promise<void>((resolve) => {
        releaseLaunches = resolve;
      });
      let resolveBothStarted!: () => void;
      const bothStarted = new Promise<void>((resolve) => {
        resolveBothStarted = resolve;
      });
      let startedCount = 0;
      const envByTicket = new Map<string, Record<string, string | undefined>>();

      const runtimeSpy = vi.spyOn(await import("../domain/runtime.js"), "runRalphLaunch");
      runtimeSpy.mockImplementation(async (_cwd, launch, _signal, _onUpdate, extraEnv, onEvent) => {
        envByTicket.set(launch.ticketRef, extraEnv ?? {});
        startedCount += 1;
        await onEvent?.({ type: "launch_state", state: "running", at: new Date().toISOString() });
        if (startedCount === 2) {
          resolveBothStarted();
        }
        await launchRelease;
        await recordBoundTicketActivity(workspace.cwd, launch.ticketRef, {
          repositoryId: launch.ticketRef === ticketA.summary.id ? serviceA.id : serviceB.id,
          status: "in_progress",
          journalText: `Recorded ${launch.iterationId} for ${launch.ticketRef}.`,
        });
        return {
          command: "pi",
          args: ["session-runtime"],
          exitCode: 0,
          output: `${launch.ticketRef} ok`,
          stderr: "",
          usage: { measured: true, input: 3, output: 4, cacheRead: 0, cacheWrite: 0, totalTokens: 7 },
          status: "completed",
          completedAt: new Date().toISOString(),
        };
      });

      const launchA = executeRalphLoop(ctx, { ref: createdA.run.state.runId, iterations: 1 });
      const launchB = executeRalphLoop(ctx, { ref: createdB.run.state.runId, iterations: 1 });

      await bothStarted;
      expect(startedCount).toBe(2);
      releaseLaunches();

      const [resultA, resultB] = await Promise.all([launchA, launchB]);

      expect(envByTicket.get(ticketA.summary.id)).toMatchObject({
        [PI_LOOM_RUNTIME_SPACE_ID_ENV]: scopedServiceA.space.id,
        [PI_LOOM_RUNTIME_REPOSITORY_ID_ENV]: serviceA.id,
        [PI_LOOM_RUNTIME_WORKTREE_ID_ENV]: scopedServiceA.worktree.id,
      });
      expect(envByTicket.get(ticketB.summary.id)).toMatchObject({
        [PI_LOOM_RUNTIME_SPACE_ID_ENV]: scopedServiceB.space.id,
        [PI_LOOM_RUNTIME_REPOSITORY_ID_ENV]: serviceB.id,
        [PI_LOOM_RUNTIME_WORKTREE_ID_ENV]: scopedServiceB.worktree.id,
      });

      expect(resultA.run.state.scope.repositoryId).toBe(serviceA.id);
      expect(resultB.run.state.scope.repositoryId).toBe(serviceB.id);
      expect(resultA.run.runtimeArtifacts.at(-1)).toMatchObject({
        runtimeScope: {
          spaceId: scopedServiceA.space.id,
          repositoryId: serviceA.id,
          worktreeId: scopedServiceA.worktree.id,
        },
        missingTicketActivity: false,
      });
      expect(resultB.run.runtimeArtifacts.at(-1)).toMatchObject({
        runtimeScope: {
          spaceId: scopedServiceB.space.id,
          repositoryId: serviceB.id,
          worktreeId: scopedServiceB.worktree.id,
        },
        missingTicketActivity: false,
      });

      const { storage, identity: readIdentity } = await openWorkspaceStorage(workspace.cwd);
      const runEntityA = await findEntityByDisplayId(
        storage,
        readIdentity.space.id,
        "ralph_run",
        createdA.run.state.runId,
      );
      const runEntityB = await findEntityByDisplayId(
        storage,
        readIdentity.space.id,
        "ralph_run",
        createdB.run.state.runId,
      );
      expect(runEntityA).toMatchObject({ owningRepositoryId: serviceA.id });
      expect(runEntityB).toMatchObject({ owningRepositoryId: serviceB.id });

      runtimeSpy.mockRestore();
    } finally {
      if (previousRuntimeEnv.root === undefined) {
        delete process.env.PI_LOOM_ROOT;
      } else {
        process.env.PI_LOOM_ROOT = previousRuntimeEnv.root;
      }
      if (previousRuntimeEnv.spaceId === undefined) {
        delete process.env[PI_LOOM_RUNTIME_SPACE_ID_ENV];
      } else {
        process.env[PI_LOOM_RUNTIME_SPACE_ID_ENV] = previousRuntimeEnv.spaceId;
      }
      if (previousRuntimeEnv.repositoryId === undefined) {
        delete process.env[PI_LOOM_RUNTIME_REPOSITORY_ID_ENV];
      } else {
        process.env[PI_LOOM_RUNTIME_REPOSITORY_ID_ENV] = previousRuntimeEnv.repositoryId;
      }
      if (previousRuntimeEnv.worktreeId === undefined) {
        delete process.env[PI_LOOM_RUNTIME_WORKTREE_ID_ENV];
      } else {
        process.env[PI_LOOM_RUNTIME_WORKTREE_ID_ENV] = previousRuntimeEnv.worktreeId;
      }
      rmSync(loomRoot, { recursive: true, force: true });
      workspace.cleanup();
    }
  }, 120000);

  it("allocates Ralph worktree branches from canonical reservations and reuses reruns", async () => {
    const workspace = createSeededGitWorkspace({
      prefix: "pi-ralph-branch-reservations-",
      packageName: "pi-loom",
      remoteUrl: "git@github.com:example/pi-loom.git",
    });

    try {
      const ticketStore = createTicketStore(workspace.cwd);
      const firstTicket = await ticketStore.createTicketAsync({
        title: "Allocator branch ticket one",
        branchMode: "allocator",
        branchFamily: "UDP-100",
        externalRefs: ["ZZZ-2", "AAA-1"],
      });
      const secondTicket = await ticketStore.createTicketAsync({
        title: "Allocator branch ticket two",
        branchMode: "allocator",
        branchFamily: "UDP-100",
      });
      const exactTicket = await ticketStore.createTicketAsync({
        title: "Exact branch ticket",
        branchMode: "exact",
        branchFamily: "UDP-100",
        exactBranchName: "release/manual-hotfix",
        externalRefs: ["AAA-1", "ZZZ-2"],
      });

      const planStore = createPlanStore(workspace.cwd);
      const plan = await planStore.createPlan({
        title: "Branch reservation plan",
        summary: "Exercise canonical worktree branch reservations.",
        sourceTarget: { kind: "workspace", ref: "pi-loom" },
      });
      await planStore.linkPlanTicket(plan.state.planId, { ticketId: firstTicket.summary.id, role: "execution" });
      await planStore.linkPlanTicket(plan.state.planId, { ticketId: secondTicket.summary.id, role: "execution" });
      await planStore.linkPlanTicket(plan.state.planId, { ticketId: exactTicket.summary.id, role: "execution" });

      const { ensureRalphRun } = await import("../domain/loop.js");
      const ctx = { cwd: workspace.cwd, sessionManager: { getBranch: () => [] } } as unknown as ExtensionContext;

      const firstRun = await ensureRalphRun(ctx, {
        ticketRef: firstTicket.summary.id,
        planRef: plan.state.planId,
        executionMode: "worktree",
      });
      const firstRerun = await ensureRalphRun(ctx, {
        ticketRef: firstTicket.summary.id,
        planRef: plan.state.planId,
        executionMode: "worktree",
      });
      const secondRun = await ensureRalphRun(ctx, {
        ticketRef: secondTicket.summary.id,
        planRef: plan.state.planId,
        executionMode: "worktree",
      });
      const exactRun = await ensureRalphRun(ctx, {
        ticketRef: exactTicket.summary.id,
        planRef: plan.state.planId,
        executionMode: "worktree",
      });

      expect(firstRun.run.state.executionEnv).toMatchObject({ branchName: "UDP-100" });
      expect(firstRerun.created).toBe(false);
      expect(firstRerun.run.state.executionEnv).toMatchObject({
        branchName: "UDP-100",
        worktreeRoot: firstRun.run.state.executionEnv?.worktreeRoot,
      });
      expect(secondRun.run.state.executionEnv).toMatchObject({ branchName: "UDP-100-1" });
      expect(exactRun.run.state.executionEnv).toMatchObject({ branchName: "release/manual-hotfix" });
    } finally {
      workspace.cleanup();
    }
  }, 120000);

  it("reuses the same reserved branch after worktree provisioning fails", async () => {
    const workspace = createSeededGitWorkspace({
      prefix: "pi-ralph-branch-reservation-retry-",
      packageName: "pi-loom",
      remoteUrl: "git@github.com:example/pi-loom.git",
    });

    try {
      const ticketStore = createTicketStore(workspace.cwd);
      const ticket = await ticketStore.createTicketAsync({
        title: "Allocator branch retry ticket",
        branchMode: "allocator",
        branchFamily: "UDP-200",
      });
      const planStore = createPlanStore(workspace.cwd);
      const plan = await planStore.createPlan({
        title: "Branch retry plan",
        summary: "Exercise reservation reuse after provisioning failure.",
        sourceTarget: { kind: "workspace", ref: "pi-loom" },
      });
      await planStore.linkPlanTicket(plan.state.planId, { ticketId: ticket.summary.id, role: "execution" });

      const worktreeModule = await import("../domain/worktree.js");
      const provisionSpy = vi.spyOn(worktreeModule, "provisionWorktree");
      provisionSpy.mockImplementationOnce(() => {
        throw new Error("synthetic provision failure");
      });

      const { ensureRalphRun } = await import("../domain/loop.js");
      const ctx = { cwd: workspace.cwd, sessionManager: { getBranch: () => [] } } as unknown as ExtensionContext;

      await expect(
        ensureRalphRun(ctx, {
          ticketRef: ticket.summary.id,
          planRef: plan.state.planId,
          executionMode: "worktree",
        }),
      ).rejects.toThrow("synthetic provision failure");

      provisionSpy.mockRestore();

      const retried = await ensureRalphRun(ctx, {
        ticketRef: ticket.summary.id,
        planRef: plan.state.planId,
        executionMode: "worktree",
      });
      expect(retried.run.state.executionEnv).toMatchObject({ branchName: "UDP-200" });
    } finally {
      workspace.cleanup();
    }
  }, 120000);

  it("keeps Ralph runtime artifacts pinned to the selected sibling worktree from a parent workspace", async () => {
    const workspace = createSeededParentGitWorkspace({
      prefix: "pi-ralph-parent-sibling-worktrees-",
      repositories: [
        { name: "service-a", remoteUrl: "git@github.com:example/service-a.git" },
        { name: "service-a-clone", remoteUrl: "git@github.com:example/service-a.git" },
      ],
    });
    const loomRoot = mkdtempSync(join(tmpdir(), "pi-ralph-parent-sibling-worktrees-state-"));
    const previousRuntimeEnv = {
      root: process.env.PI_LOOM_ROOT,
      spaceId: process.env[PI_LOOM_RUNTIME_SPACE_ID_ENV],
      repositoryId: process.env[PI_LOOM_RUNTIME_REPOSITORY_ID_ENV],
      worktreeId: process.env[PI_LOOM_RUNTIME_WORKTREE_ID_ENV],
    };
    process.env.PI_LOOM_ROOT = loomRoot;
    delete process.env[PI_LOOM_RUNTIME_SPACE_ID_ENV];
    delete process.env[PI_LOOM_RUNTIME_REPOSITORY_ID_ENV];
    delete process.env[PI_LOOM_RUNTIME_WORKTREE_ID_ENV];

    try {
      const { storage, identity } = await openWorkspaceStorage(workspace.cwd);
      expect(identity.repositories).toHaveLength(1);
      expect(identity.worktrees).toHaveLength(2);
      const repository = identity.repositories[0];
      if (!repository) {
        throw new Error("Missing canonical repository identity for sibling worktrees");
      }

      const [untouchedWorktree, targetWorktree] = [...identity.worktrees].sort((left, right) =>
        left.logicalKey.localeCompare(right.logicalKey),
      );
      if (!untouchedWorktree || !targetWorktree) {
        throw new Error("Missing sibling worktree identities");
      }

      const selected = await selectActiveScope(
        workspace.cwd,
        { repositoryId: repository.id, worktreeId: targetWorktree.id },
        storage,
      );
      expect(selected.worktree?.id).toBe(targetWorktree.id);
      closeAllWorkspaceStorage();

      const { identity: scopedIdentity } = await openRepositoryWorkspaceStorage(workspace.cwd, {
        repositoryId: repository.id,
      });
      expect(scopedIdentity.worktree.id).toBe(targetWorktree.id);

      const ticketStore = createTicketStore(workspace.cwd, {
        repositoryId: repository.id,
        worktreeId: targetWorktree.id,
      });
      const ticket = await ticketStore.createTicketAsync({
        title: "Sibling worktree Ralph ticket",
        summary: "Launch Ralph from the parent workspace without drifting onto the sibling clone.",
        plan: "Run one bounded iteration while the target repository has two local sibling worktrees.",
        verification: "Inspect the persisted runtime artifact scope and confirm the selected worktree is preserved.",
      });

      const planStore = createPlanStore(workspace.cwd, {
        repositoryId: repository.id,
        worktreeId: targetWorktree.id,
      });
      const plan = await planStore.createPlan({
        title: "Sibling worktree Ralph plan",
        summary: "Exercise parent-workspace Ralph runtime scoping when one canonical repository has two local clones.",
        sourceTarget: { kind: "workspace", ref: repository.slug },
      });
      await planStore.linkPlanTicket(plan.state.planId, { ticketId: ticket.summary.id, role: "execution" });

      const { ensureRalphRun, executeRalphLoop } = await import("../domain/loop.js");
      const ctx = {
        cwd: workspace.cwd,
        sessionManager: { getBranch: () => [] },
      } as unknown as ExtensionContext;
      const created = await ensureRalphRun(ctx, { ticketRef: ticket.summary.id, planRef: plan.state.planId });

      let launchEnv: Record<string, string | undefined> | undefined;
      const runtimeSpy = vi.spyOn(await import("../domain/runtime.js"), "runRalphLaunch");
      runtimeSpy.mockImplementationOnce(async (_cwd, launch, _signal, _onUpdate, extraEnv) => {
        launchEnv = extraEnv ?? {};
        await recordBoundTicketActivity(workspace.cwd, launch.ticketRef, {
          repositoryId: repository.id,
          status: "in_progress",
          journalText: `Recorded ${launch.iterationId} for selected sibling worktree ${targetWorktree.id}.`,
        });
        return {
          command: "pi",
          args: ["session-runtime"],
          exitCode: 0,
          output: "sibling worktree scoped launch ok",
          stderr: "",
          usage: { measured: true, input: 5, output: 7, cacheRead: 0, cacheWrite: 0, totalTokens: 12 },
          status: "completed",
          completedAt: new Date().toISOString(),
        };
      });

      const result = await executeRalphLoop(ctx, { ref: created.run.state.runId, iterations: 1 });

      expect(launchEnv).toMatchObject({
        [PI_LOOM_RUNTIME_SPACE_ID_ENV]: scopedIdentity.space.id,
        [PI_LOOM_RUNTIME_REPOSITORY_ID_ENV]: repository.id,
        [PI_LOOM_RUNTIME_WORKTREE_ID_ENV]: targetWorktree.id,
      });
      expect(result.run.runtimeArtifacts.at(-1)).toMatchObject({
        runtimeScope: {
          spaceId: scopedIdentity.space.id,
          repositoryId: repository.id,
          worktreeId: targetWorktree.id,
        },
        missingTicketActivity: false,
      });
      expect(
        result.run.runtimeArtifacts.some((artifact) => artifact.runtimeScope?.worktreeId === untouchedWorktree.id),
      ).toBe(false);

      closeAllWorkspaceStorage();
      const reopened = await openWorkspaceStorage(workspace.cwd);
      expect(reopened.identity.repository?.id).toBe(repository.id);
      expect(reopened.identity.worktree?.id).toBe(targetWorktree.id);
      expect(reopened.identity.activeScope.worktreeId).toBe(targetWorktree.id);

      const runEntity = await findEntityByDisplayId(
        reopened.storage,
        reopened.identity.space.id,
        "ralph_run",
        created.run.state.runId,
      );
      expect(runEntity).toMatchObject({ owningRepositoryId: repository.id });

      runtimeSpy.mockRestore();
    } finally {
      if (previousRuntimeEnv.root === undefined) {
        delete process.env.PI_LOOM_ROOT;
      } else {
        process.env.PI_LOOM_ROOT = previousRuntimeEnv.root;
      }
      if (previousRuntimeEnv.spaceId === undefined) {
        delete process.env[PI_LOOM_RUNTIME_SPACE_ID_ENV];
      } else {
        process.env[PI_LOOM_RUNTIME_SPACE_ID_ENV] = previousRuntimeEnv.spaceId;
      }
      if (previousRuntimeEnv.repositoryId === undefined) {
        delete process.env[PI_LOOM_RUNTIME_REPOSITORY_ID_ENV];
      } else {
        process.env[PI_LOOM_RUNTIME_REPOSITORY_ID_ENV] = previousRuntimeEnv.repositoryId;
      }
      if (previousRuntimeEnv.worktreeId === undefined) {
        delete process.env[PI_LOOM_RUNTIME_WORKTREE_ID_ENV];
      } else {
        process.env[PI_LOOM_RUNTIME_WORKTREE_ID_ENV] = previousRuntimeEnv.worktreeId;
      }
      rmSync(loomRoot, { recursive: true, force: true });
      workspace.cleanup();
    }
  }, 120000);

  it("stores portable runtime invocation metadata instead of machine-local spawn paths", async () => {
    const store = createRalphStore(workspace);
    const run = store.createRun({
      title: "Portable runtime artifact Ralph Run",
      objective: "Keep durable runtime artifacts free of machine-local spawn paths.",
      policySnapshot: { verifierRequired: false },
      scope: createTicketBoundScope(),
    });

    const runtimeSpy = vi.spyOn(await import("../domain/runtime.js"), "runRalphLaunch");
    runtimeSpy.mockImplementationOnce(async (_cwd, launch) => {
      await recordBoundTicketActivity(workspace, launch.ticketRef, {
        status: "in_progress",
        journalText: "Recorded iter-001 portable runtime artifact evidence.",
      });

      return {
        command: "/usr/local/bin/node",
        args: [
          "/custom-fork/dist/omp-cli.js",
          "-e",
          "/Users/alexanderbutler/code_projects/pi-loom",
          "--mode=json",
          "-p",
          "bounded worker prompt",
          "--session-dir",
          "/tmp/pi-loom-ralph-12345",
        ],
        exitCode: 0,
        output: "portable runtime ok",
        stderr: "",
        usage: { measured: true, input: 4, output: 6, cacheRead: 0, cacheWrite: 0, totalTokens: 10 },
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

    expect(result.run.runtimeArtifacts.at(-1)).toMatchObject({
      command: "session-runtime",
      args: [`iteration=iter-001`, `mode=launch`, `run=${run.state.runId}`],
      output: "portable runtime ok",
    });
    expect(result.run.packet).toContain("command: session-runtime");
    expect(result.run.packet).not.toContain("/usr/local/bin/node");
    expect(result.run.packet).not.toContain("/custom-fork/dist/omp-cli.js");
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
