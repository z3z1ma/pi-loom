import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCritiqueStore } from "@pi-loom/pi-critique/extensions/domain/store.js";
import { findEntityByDisplayId } from "@pi-loom/pi-storage/storage/entities.js";
import { createEntityId } from "@pi-loom/pi-storage/storage/ids.js";
import {
  closeWorkspaceStorage,
  openWorkspaceStorage,
  openWorkspaceStorageSync,
} from "@pi-loom/pi-storage/storage/workspace.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateRalphRunInput } from "../extensions/domain/models.js";
import { createRalphStore } from "../extensions/domain/store.js";

function createExecutionRun(
  store: ReturnType<typeof createRalphStore>,
  input: Omit<CreateRalphRunInput, "scope" | "packetContext">,
) {
  return store.createRun({
    ...input,
    scope: {
      mode: "execute",
      specChangeId: input.linkedRefs?.specChangeIds?.[0] ?? "spec-789",
      planId: input.linkedRefs?.planIds?.[0] ?? "plan-123",
      ticketId: input.linkedRefs?.ticketIds?.[0] ?? "ticket-456",
      roadmapItemIds: input.linkedRefs?.roadmapItemIds ?? [],
      initiativeIds: input.linkedRefs?.initiativeIds ?? [],
      researchIds: input.linkedRefs?.researchIds ?? [],
      critiqueIds: input.linkedRefs?.critiqueIds ?? [],
      docIds: input.linkedRefs?.docIds ?? [],
    },
    packetContext: {
      capturedAt: new Date().toISOString(),
      constitutionBrief: "Brief constitutional guidance.",
      specContext: "Spec context for the anchored Ralph run.",
      planContext: "Plan context for the anchored Ralph run.",
      ticketContext: "Ticket context for the anchored Ralph run.",
      priorIterationLearnings: [],
      operatorNotes: null,
    },
  });
}

function seedLinkedEntity(
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
              summary: { id: displayId, status: "active", title },
              blockers: [],
              ticket: {
                frontmatter: {
                  "initiative-ids": [],
                  "research-ids": [],
                  "roadmap-item-ids": [],
                  "spec-change-id": "spec-789",
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

function seedDefaultLinkedEntities(workspace: string) {
  seedLinkedEntity(workspace, "plan", "plan-123", "Default plan");
  seedLinkedEntity(workspace, "ticket", "ticket-456", "Default ticket");
  seedLinkedEntity(workspace, "spec_change", "spec-789", "Default spec");
}

describe("RalphStore durable memory", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "pi-ralph-store-"));
    vi.useFakeTimers();
    seedDefaultLinkedEntities(workspace);
  });

  afterEach(() => {
    vi.useRealTimers();
    closeWorkspaceStorage(workspace);
    rmSync(workspace, { recursive: true, force: true });
  });

  it("initializes the ledger and persists run state for canonical readback", () => {
    vi.setSystemTime(new Date("2026-03-15T14:00:00.000Z"));
    const store = createRalphStore(workspace);

    const ledger = store.initLedger();
    const created = createExecutionRun(store, {
      title: "Ralph Rollout",
      objective: "Coordinate one bounded orchestration loop.",
      linkedRefs: {
        planIds: ["plan-123"],
        ticketIds: ["ticket-456"],
        specChangeIds: ["spec-789"],
      },
      policySnapshot: {
        mode: "strict",
        maxIterations: 3,
        critiqueRequired: true,
        notes: ["Require explicit review before completion"],
      },
      verifierSummary: {
        sourceKind: "test",
        sourceRef: "packages/pi-ralph-wiggum/__tests__/store.test.ts",
        summary: "Verifier has not run yet.",
        required: true,
      },
    });

    expect(ledger).toMatchObject({
      initialized: true,
      root: expect.stringMatching(/catalog\.sqlite$/),
    });
    expect(created.state.runId).toBe("ralph-rollout");
    expect(created.state.linkedRefs.planIds).toEqual(["plan-123"]);
    expect(created.state.linkedRefs.ticketIds).toEqual(["ticket-456"]);
    expect(created.state.linkedRefs.specChangeIds).toEqual(["spec-789"]);
    expect(created.state.policySnapshot).toMatchObject({
      mode: "strict",
      maxIterations: 3,
      critiqueRequired: true,
      verifierRequired: true,
    });
    expect(created.state.packetSummary).toContain("looping plan plan-123 under spec spec-789 on ticket ticket-456");
    expect(created.state.scope).toMatchObject({
      mode: "execute",
      specChangeId: "spec-789",
      planId: "plan-123",
      ticketId: "ticket-456",
    });
    expect(created.launch).toMatchObject({
      runId: "ralph-rollout",
      iterationId: "iter-001",
      iteration: 1,
      runtime: "descriptor_only",
      resume: false,
    });

    expect(created.artifacts.dir).toBe(`ralph-run:${created.state.runId}`);
    expect(created.artifacts.state).toBe(`ralph-run:${created.state.runId}:state`);
    expect(created.artifacts.packet).toBe(`ralph-run:${created.state.runId}:packet`);
    expect(created.artifacts.run).toBe(`ralph-run:${created.state.runId}:run`);
    expect(created.artifacts.launch).toBe(`ralph-run:${created.state.runId}:launch`);
    expect(created.packet).toContain("# Ralph Packet: Ralph Rollout");
    expect(created.packet).toContain("plan-123 [active] Default plan");
    expect(created.run).toContain("## Linked Refs");
    expect(created.dashboard.counts.iterations).toBe(0);
    expect(created.summary.runRef).toBe(`ralph-run:${created.state.runId}`);
    expect(created.dashboard.packetRef).toBe(`ralph-run:${created.state.runId}:packet`);
    expect(created.dashboard.runRef).toBe(`ralph-run:${created.state.runId}:run`);
    expect(created.dashboard.launchRef).toBe(`ralph-run:${created.state.runId}:launch`);
    expect(created.launch.packetRef).toBe(`ralph-run:${created.state.runId}:packet`);
    expect(created.launch.launchRef).toBe(`ralph-run:${created.state.runId}:launch`);

    const readback = store.readRun(created.state.runId);
    expect(readback.state).toMatchObject({
      runId: "ralph-rollout",
      objective: "Coordinate one bounded orchestration loop.",
      status: "planned",
      phase: "preparing",
      waitingFor: "none",
      postIteration: null,
      nextIterationId: null,
      nextLaunch: {
        runtime: null,
        resume: false,
        preparedAt: null,
      },
      lastIterationNumber: 0,
    });
    expect(readback.summary).toMatchObject({
      id: "ralph-rollout",
      status: "planned",
      decision: null,
      iterationCount: 0,
      waitingFor: "none",
    });
    expect(readback.dashboard.counts.iterations).toBe(0);
    expect(readback.launch.instructions).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`ralph-run:${created.state.runId}:packet`),
        expect.stringContaining(`ref=ralph-run:${created.state.runId}`),
      ]),
    );
  }, 10000);

  it("fails truthfully when projected links cannot resolve linked refs", () => {
    vi.setSystemTime(new Date("2026-03-15T14:05:00.000Z"));
    const store = createRalphStore(workspace);

    expect(() =>
      createExecutionRun(store, {
        title: "Missing plan link",
        objective: "Do not persist a run whose projected plan link cannot resolve.",
        linkedRefs: {
          planIds: ["plan-missing"],
          ticketIds: ["ticket-456"],
          specChangeIds: ["spec-789"],
        },
      }),
    ).toThrow("Ralph projected link sync cannot resolve: plan:plan-missing");
  });

  it("stores canonical Ralph state and iteration artifacts without duplicating read models", async () => {
    vi.setSystemTime(new Date("2026-03-15T15:00:00.000Z"));
    const store = createRalphStore(workspace);

    const created = createExecutionRun(store, {
      title: "Canonical Ralph Payload",
      objective: "Persist only canonical state and rebuild rich reads on demand.",
      policySnapshot: {
        verifierRequired: true,
      },
    });

    vi.setSystemTime(new Date("2026-03-15T15:01:00.000Z"));
    const launch = store.prepareLaunch(created.state.runId, { focus: "Prepare canonical iteration" });

    vi.setSystemTime(new Date("2026-03-15T15:02:00.000Z"));
    const updated = store.appendIteration(created.state.runId, {
      id: launch.launch.iterationId,
      status: "reviewing",
      summary: "Captured review-gated iteration state.",
      verifier: {
        sourceKind: "test",
        sourceRef: "packages/pi-ralph-wiggum/__tests__/store.test.ts",
        verdict: "concerns",
        blocker: false,
        summary: "Verifier raised concerns that still require critique follow-up.",
      },
      critiqueLinks: [
        {
          critiqueId: "crit-123",
          kind: "blocking",
          verdict: null,
          required: true,
          blocking: false,
          reviewedAt: null,
          findingIds: [],
          summary: "Await critique review before continuing.",
        },
      ],
      decision: {
        kind: "pause",
        reason: "manual_review_required",
        summary: "Need explicit critique review before another launch.",
        decidedAt: "2026-03-18T10:15:00.000Z",
        decidedBy: "policy",
        blockingRefs: ["crit-123"],
      },
    });

    expect(updated.state.waitingFor).toBe("critique");
    expect(updated.iterations).toHaveLength(1);
    expect(updated.launch.iterationId).toBe("iter-001");

    const { storage, identity } = await openWorkspaceStorage(workspace);
    const runEntity = await findEntityByDisplayId(storage, identity.space.id, "ralph_run", created.state.runId);
    expect(runEntity?.id).toMatch(/^ralph_run_/);
    expect(runEntity?.id).not.toBe(created.state.runId);
    expect(runEntity?.displayId).toBe(created.state.runId);
    expect(runEntity?.attributes).toEqual(
      expect.objectContaining({
        state: expect.objectContaining({
          runId: created.state.runId,
          nextIterationId: null,
          nextLaunch: expect.objectContaining({ runtime: null, resume: false, preparedAt: null }),
          postIteration: expect.objectContaining({
            iterationId: "iter-001",
            status: "reviewing",
          }),
        }),
      }),
    );
    expect(runEntity?.attributes).not.toHaveProperty("record");
    expect(runEntity?.attributes).not.toHaveProperty("iterations");
    expect(runEntity?.attributes).not.toHaveProperty("launch");
    expect(runEntity?.attributes).not.toHaveProperty("packet");
    expect(runEntity?.attributes).not.toHaveProperty("dashboard");

    const artifacts = (await storage.listEntities(identity.space.id, "artifact")).filter((entity) =>
      entity.displayId?.startsWith(`ralph-run:${created.state.runId}:iteration:`),
    );
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({
      displayId: `ralph-run:${created.state.runId}:iteration:iter-001`,
      status: "reviewing",
      attributes: expect.objectContaining({
        artifactType: "ralph-iteration",
        payload: expect.objectContaining({
          iteration: expect.objectContaining({ id: "iter-001", status: "reviewing", iteration: 1 }),
        }),
      }),
    });

    const events = await storage.listEvents(runEntity?.id ?? "missing");
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "updated",
          payload: expect.objectContaining({ change: "launch_prepared", iterationId: "iter-001" }),
        }),
        expect.objectContaining({
          kind: "updated",
          payload: expect.objectContaining({
            change: "iteration_updated",
            iterationId: "iter-001",
            status: "reviewing",
          }),
        }),
        expect.objectContaining({
          kind: "updated",
          payload: expect.objectContaining({
            change: "verifier_updated",
            iterationId: "iter-001",
            verdict: "concerns",
          }),
        }),
        expect.objectContaining({
          kind: "updated",
          payload: expect.objectContaining({
            change: "critique_links_updated",
            iterationId: "iter-001",
            critiqueIds: ["crit-123"],
          }),
        }),
        expect.objectContaining({
          kind: "decision_recorded",
          payload: expect.objectContaining({ change: "iteration_decision_recorded" }),
        }),
      ]),
    );

    const readback = store.readRun(created.state.runId);
    expect(readback.iterations).toHaveLength(1);
    expect(readback.iterations[0]).toMatchObject({ id: "iter-001", status: "reviewing" });
    expect(readback.state.waitingFor).toBe("critique");
    expect(readback.launch).toMatchObject({
      iterationId: "iter-001",
      runtime: "descriptor_only",
      packetRef: `ralph-run:${created.state.runId}:packet`,
    });
  }, 120000);

  it("records iteration state and pauses on blocking critique decisions", async () => {
    vi.setSystemTime(new Date("2026-03-15T14:10:00.000Z"));
    const critiqueStore = createCritiqueStore(workspace);
    const store = createRalphStore(workspace);

    const critique = await critiqueStore.createCritiqueAsync({
      title: "Review Ralph resume blocker",
      target: {
        kind: "ticket",
        ref: "ticket-456",
        locator: "packages/pi-ralph-wiggum/extensions/domain/store.ts",
      },
      focusAreas: ["architecture"],
      reviewQuestion: "Can the run continue safely after the verifier failure?",
      contextRefs: { ticketIds: ["ticket-456"] },
    });

    const created = createExecutionRun(store, {
      title: "Blocked Ralph Run",
      objective: "Pause when verifier evidence or critique findings block progress.",
      policySnapshot: {
        verifierRequired: true,
        critiqueRequired: true,
      },
    });

    vi.setSystemTime(new Date("2026-03-15T14:11:00.000Z"));
    const launched = store.prepareLaunch(created.state.runId, { focus: "Investigate blocker" });
    expect(launched.launch).toMatchObject({
      runtime: "session",
      iterationId: "iter-001",
      iteration: 1,
      resume: false,
    });
    expect(launched.state.nextIterationId).toBe("iter-001");
    expect(launched.state.nextLaunch).toMatchObject({
      runtime: "session",
      resume: false,
      preparedAt: "2026-03-15T14:11:00.000Z",
    });

    vi.setSystemTime(new Date("2026-03-15T14:12:00.000Z"));
    const reviewed = store.appendIteration(created.state.runId, {
      id: launched.launch.iterationId,
      status: "reviewing",
      summary: "Verifier failed during launch preparation.",
      workerSummary: "Resume metadata did not satisfy the expected launch contract.",
      verifier: {
        sourceKind: "test",
        sourceRef: "packages/pi-ralph-wiggum/__tests__/runtime.test.ts",
        verdict: "fail",
        blocker: true,
        summary: "Launch descriptor data was incomplete for safe resume.",
        evidence: ["runtime.test.ts"],
      },
      notes: ["Wait for critique review before another iteration."],
    });

    expect(reviewed.iterations).toHaveLength(1);
    expect(reviewed.iterations[0]).toMatchObject({
      id: "iter-001",
      status: "reviewing",
      verifier: {
        verdict: "fail",
        blocker: true,
        sourceRef: "packages/pi-ralph-wiggum/__tests__/runtime.test.ts",
      },
    });
    expect(reviewed.dashboard.counts.iterations).toBe(1);
    expect(reviewed.dashboard.counts.byStatus.reviewing).toBe(1);
    expect(reviewed.launch.packetRef).toBe(`ralph-run:${created.state.runId}:packet`);

    vi.setSystemTime(new Date("2026-03-15T14:13:00.000Z"));
    const linked = store.linkCritique(created.state.runId, {
      critiqueId: critique.state.critiqueId,
      kind: "blocking",
      verdict: "blocked",
      required: true,
      blocking: true,
      findingIds: ["finding-001"],
      summary: "Resume handling must be fixed before Ralph can continue.",
    });

    expect(linked.state.linkedRefs.critiqueIds).toEqual([critique.state.critiqueId]);
    expect(linked.state.waitingFor).toBe("operator");
    expect(linked.state.status).toBe("waiting_for_review");
    expect(linked.packet).toContain(`${critique.state.critiqueId} [blocking/blocked]`);

    vi.setSystemTime(new Date("2026-03-15T14:14:00.000Z"));
    const decided = store.decideRun(created.state.runId, {
      summary: "Blocking critique and verifier evidence require operator review.",
    });

    expect(decided.state.latestDecision).toMatchObject({
      kind: "pause",
      reason: "critique_blocked",
      decidedBy: "critique",
      blockingRefs: [critique.state.critiqueId],
    });
    expect(decided.state.status).toBe("paused");
    expect(decided.state.phase).toBe("reviewing");
    expect(decided.state.waitingFor).toBe("operator");
    expect(decided.state.stopReason).toBe("critique_blocked");
    expect(decided.packet).toContain("Launch descriptor data was incomplete for safe resume.");
    expect(decided.run).toContain("## Latest Decision");
  }, 120000);

  it("does not treat non-blocking verifier concerns as verifier blockers", () => {
    const store = createRalphStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T14:15:00.000Z"));
    const run = createExecutionRun(store, {
      title: "Verifier Concerns Run",
      objective: "Keep verifier concerns distinct from hard blockers.",
      policySnapshot: {
        verifierRequired: true,
        critiqueRequired: false,
        stopWhenVerified: false,
      },
    });

    vi.setSystemTime(new Date("2026-03-15T14:16:00.000Z"));
    const launch = store.prepareLaunch(run.state.runId, { focus: "Capture non-blocking verifier evidence" });

    vi.setSystemTime(new Date("2026-03-15T14:17:00.000Z"));
    store.appendIteration(run.state.runId, {
      id: launch.launch.iterationId,
      status: "reviewing",
      summary: "Captured verifier concerns without a hard blocker.",
      workerSummary: "Verifier found follow-up items but did not block progress.",
      verifier: {
        sourceKind: "test",
        sourceRef: "packages/pi-ralph-wiggum/__tests__/store.test.ts",
        verdict: "concerns",
        blocker: false,
        summary: "Concerns are informative only and should not force a verifier pause.",
      },
    });

    vi.setSystemTime(new Date("2026-03-15T14:18:00.000Z"));
    const decided = store.decideRun(run.state.runId, {
      summary: "Non-blocking verifier concerns should leave the run eligible for another iteration.",
    });

    expect(decided.state.latestDecision).toMatchObject({
      kind: "continue",
      reason: "unknown",
    });
    expect(decided.state.status).toBe("active");
    expect(decided.state.waitingFor).toBe("none");
    expect(decided.state.stopReason).toBeNull();
  });

  it("pauses as verifier_blocked when required verifier evidence is actually blocking", () => {
    const store = createRalphStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T14:19:00.000Z"));
    const run = createExecutionRun(store, {
      title: "Verifier Blocker Run",
      objective: "Pause only when verifier evidence is an actual blocker.",
      policySnapshot: {
        verifierRequired: true,
        critiqueRequired: false,
      },
    });

    vi.setSystemTime(new Date("2026-03-15T14:20:00.000Z"));
    const launch = store.prepareLaunch(run.state.runId, { focus: "Capture blocking verifier evidence" });

    vi.setSystemTime(new Date("2026-03-15T14:21:00.000Z"));
    store.appendIteration(run.state.runId, {
      id: launch.launch.iterationId,
      status: "reviewing",
      summary: "Verifier reported a true blocker.",
      workerSummary: "The run must pause until the verifier blocker is resolved.",
      verifier: {
        sourceKind: "test",
        sourceRef: "packages/pi-ralph-wiggum/__tests__/store.test.ts",
        verdict: "fail",
        blocker: true,
        summary: "A hard verifier failure prevents more Ralph progress.",
      },
    });

    vi.setSystemTime(new Date("2026-03-15T14:22:00.000Z"));
    const decided = store.decideRun(run.state.runId, {
      summary: "Blocking verifier evidence requires operator review.",
    });

    expect(decided.state.latestDecision).toMatchObject({
      kind: "pause",
      reason: "verifier_blocked",
      decidedBy: "verifier",
      blockingRefs: ["test:packages/pi-ralph-wiggum/__tests__/store.test.ts"],
    });
    expect(decided.state.status).toBe("paused");
    expect(decided.state.waitingFor).toBe("operator");
    expect(decided.state.stopReason).toBe("verifier_blocked");
  });

  it("does not complete on non-blocking verifier concerns when stopWhenVerified is true", () => {
    const store = createRalphStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T14:23:00.000Z"));
    const run = createExecutionRun(store, {
      title: "Verifier Satisfaction Run",
      objective: "Require verifier satisfaction before completion.",
      policySnapshot: {
        verifierRequired: true,
        critiqueRequired: false,
        stopWhenVerified: true,
      },
    });

    vi.setSystemTime(new Date("2026-03-15T14:24:00.000Z"));
    const launch = store.prepareLaunch(run.state.runId, { focus: "Gather non-blocking verifier evidence" });

    vi.setSystemTime(new Date("2026-03-15T14:25:00.000Z"));
    store.appendIteration(run.state.runId, {
      id: launch.launch.iterationId,
      status: "accepted",
      summary: "The worker believes the change is ready.",
      workerSummary: "Request completion once policy gates allow it.",
      verifier: {
        sourceKind: "test",
        sourceRef: "packages/pi-ralph-wiggum/__tests__/store.test.ts",
        verdict: "concerns",
        blocker: false,
        summary: "Verifier concerns remain, so the verifier stop gate is not yet satisfied.",
      },
    });

    vi.setSystemTime(new Date("2026-03-15T14:26:00.000Z"));
    const decided = store.decideRun(run.state.runId, {
      workerRequestedCompletion: true,
      summary: "Do not complete until the verifier actually passes.",
    });

    expect(decided.state.latestDecision).toMatchObject({
      kind: "continue",
      reason: "worker_requested_completion",
      decidedBy: "policy",
    });
    expect(decided.state.status).toBe("active");
    expect(decided.state.phase).toBe("deciding");
    expect(decided.state.waitingFor).toBe("none");
    expect(decided.state.stopReason).toBeNull();
  });

  it("keeps plan-anchored completion decisions loop-managed even when the worker reports completion", () => {
    const store = createRalphStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T14:20:00.000Z"));
    const cleanRun = createExecutionRun(store, {
      title: "Clean Completion Run",
      objective: "Stop once the verifier passes and the worker requests completion.",
      policySnapshot: {
        verifierRequired: true,
        critiqueRequired: false,
        stopWhenVerified: true,
      },
    });

    vi.setSystemTime(new Date("2026-03-15T14:21:00.000Z"));
    const cleanLaunch = store.prepareLaunch(cleanRun.state.runId, { focus: "Execute accepted fix" });
    vi.setSystemTime(new Date("2026-03-15T14:22:00.000Z"));
    store.appendIteration(cleanRun.state.runId, {
      id: cleanLaunch.launch.iterationId,
      status: "accepted",
      summary: "Applied the change and gathered evidence.",
      workerSummary: "Ready for final policy decision.",
      verifier: {
        sourceKind: "test",
        sourceRef: "packages/pi-ralph-wiggum/__tests__/store.test.ts",
        verdict: "pass",
        blocker: false,
        summary: "Targeted Ralph tests passed.",
        evidence: ["store.test.ts", "runtime.test.ts", "prompt-guidance.test.ts"],
      },
    });
    vi.setSystemTime(new Date("2026-03-15T14:23:00.000Z"));
    const completed = store.decideRun(cleanRun.state.runId, {
      workerRequestedCompletion: true,
      summary: "Verifier gates passed and the bounded goal is complete.",
    });

    expect(completed.state.latestDecision).toMatchObject({
      kind: "continue",
      reason: "worker_requested_completion",
    });
    expect(completed.state.status).toBe("active");
    expect(completed.state.phase).toBe("deciding");
    expect(completed.state.nextIterationId).toBeNull();
    expect(completed.state.nextLaunch).toMatchObject({
      runtime: null,
      resume: false,
      preparedAt: null,
    });
    expect(completed.state.stopReason).toBeNull();

    vi.setSystemTime(new Date("2026-03-15T14:30:00.000Z"));
    const resumableRun = createExecutionRun(store, {
      title: "Resume Launch Run",
      objective: "Prepare a fresh iteration after an accepted prior iteration.",
    });

    vi.setSystemTime(new Date("2026-03-15T14:31:00.000Z"));
    const firstLaunch = store.prepareLaunch(resumableRun.state.runId, {
      focus: "Land the first bounded step",
      instructions: ["Read packet", "Capture a durable decision"],
    });
    expect(firstLaunch.launch).toMatchObject({
      iterationId: "iter-001",
      iteration: 1,
      resume: false,
    });
    expect(firstLaunch.launch.instructions).toEqual(
      expect.arrayContaining(["Read packet", "Capture a durable decision"]),
    );

    vi.setSystemTime(new Date("2026-03-15T14:32:00.000Z"));
    store.appendIteration(resumableRun.state.runId, {
      id: firstLaunch.launch.iterationId,
      status: "accepted",
      summary: "The first bounded step finished cleanly.",
    });

    expect(() => store.resumeRun(resumableRun.state.runId, { focus: "Resume from durable state" })).toThrow(
      "Ralph run resume-launch-run requires a fresh continuation decision for iteration iter-001 before launching again.",
    );

    vi.setSystemTime(new Date("2026-03-15T14:32:30.000Z"));
    const continued = store.decideRun(resumableRun.state.runId, {
      summary: "A fresh continuation decision authorizes the next bounded step.",
    });
    expect(continued.state.latestDecision).toMatchObject({ kind: "continue" });
    expect(continued.state.latestDecisionIterationId).toBe("iter-001");

    vi.setSystemTime(new Date("2026-03-15T14:33:00.000Z"));
    const resumed = store.resumeRun(resumableRun.state.runId, { focus: "Resume from durable state" });

    expect(resumed.launch).toMatchObject({
      iterationId: "iter-002",
      iteration: 2,
      runtime: "session",
      resume: true,
    });
    expect(resumed.state.nextIterationId).toBe("iter-002");
    expect(resumed.state.lastIterationNumber).toBe(2);
    expect(resumed.state.nextLaunch).toMatchObject({
      runtime: "session",
      resume: true,
      preparedAt: "2026-03-15T14:33:00.000Z",
    });
    expect(resumed.iterations.map((iteration) => iteration.id)).toEqual(["iter-001", "iter-002"]);

    const resumedReadback = store.readRun(resumed.state.runId);
    expect(resumedReadback.launch).toMatchObject({
      iterationId: "iter-002",
      resume: true,
      packetRef: `ralph-run:${resumed.state.runId}:packet`,
      launchRef: `ralph-run:${resumed.state.runId}:launch`,
      createdAt: "2026-03-15T14:33:00.000Z",
    });
  }, 180000);

  it("does not treat a previous verifier pass as fresh evidence for a later iteration", () => {
    const store = createRalphStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T14:50:00.000Z"));
    const run = createExecutionRun(store, {
      title: "Fresh verifier evidence run",
      objective: "Require verifier evidence from the latest bounded iteration before completion.",
      policySnapshot: {
        verifierRequired: true,
        stopWhenVerified: true,
      },
    });

    vi.setSystemTime(new Date("2026-03-15T14:51:00.000Z"));
    const firstLaunch = store.prepareLaunch(run.state.runId, { focus: "Land the first bounded step" });
    vi.setSystemTime(new Date("2026-03-15T14:52:00.000Z"));
    store.appendIteration(run.state.runId, {
      id: firstLaunch.launch.iterationId,
      status: "accepted",
      summary: "The first iteration gathered a passing verifier result.",
      verifier: {
        sourceKind: "test",
        sourceRef: "packages/pi-ralph-wiggum/__tests__/store.test.ts",
        verdict: "pass",
        blocker: false,
        summary: "Iteration one verification passed.",
      },
    });
    vi.setSystemTime(new Date("2026-03-15T14:53:00.000Z"));
    store.decideRun(run.state.runId, {
      summary: "Continue into a second bounded iteration.",
    });

    vi.setSystemTime(new Date("2026-03-15T14:54:00.000Z"));
    const secondLaunch = store.resumeRun(run.state.runId, { focus: "Attempt a second bounded step" });
    vi.setSystemTime(new Date("2026-03-15T14:55:00.000Z"));
    store.appendIteration(run.state.runId, {
      id: secondLaunch.launch.iterationId,
      status: "accepted",
      summary: "The second iteration changed code without rerunning the verifier.",
    });

    vi.setSystemTime(new Date("2026-03-15T14:56:00.000Z"));
    const decided = store.decideRun(run.state.runId, {
      workerRequestedCompletion: true,
      summary: "Do not complete unless the latest iteration has fresh verifier evidence.",
    });

    expect(decided.state.latestDecision).toMatchObject({
      kind: "continue",
      reason: "worker_requested_completion",
    });
    expect(decided.state.verifierSummary).toMatchObject({
      verdict: "not_run",
      iterationId: null,
    });
    expect(decided.state.postIteration?.iterationId).toBe("iter-002");
  });

  it("ignores stale run-level verifier updates for earlier iterations", () => {
    const store = createRalphStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T14:57:00.000Z"));
    const run = createExecutionRun(store, {
      title: "Stale verifier update run",
      objective: "Do not re-gate a newer iteration with stale verifier evidence.",
      policySnapshot: {
        verifierRequired: true,
        critiqueRequired: false,
      },
    });

    vi.setSystemTime(new Date("2026-03-15T14:58:00.000Z"));
    const firstLaunch = store.prepareLaunch(run.state.runId, { focus: "First iteration" });
    vi.setSystemTime(new Date("2026-03-15T14:59:00.000Z"));
    store.appendIteration(run.state.runId, {
      id: firstLaunch.launch.iterationId,
      status: "accepted",
      summary: "Accepted first iteration with passing verifier.",
      verifier: {
        iterationId: "iter-001",
        sourceKind: "test",
        sourceRef: "packages/pi-ralph-wiggum/__tests__/store.test.ts",
        verdict: "pass",
        blocker: false,
        summary: "First iteration passed verification.",
      },
    });
    vi.setSystemTime(new Date("2026-03-15T15:00:00.000Z"));
    store.decideRun(run.state.runId, { summary: "Continue to a second iteration." });

    vi.setSystemTime(new Date("2026-03-15T15:01:00.000Z"));
    const secondLaunch = store.resumeRun(run.state.runId, { focus: "Second iteration" });
    vi.setSystemTime(new Date("2026-03-15T15:02:00.000Z"));
    store.appendIteration(run.state.runId, {
      id: secondLaunch.launch.iterationId,
      status: "accepted",
      summary: "Accepted the second iteration.",
      decision: {
        kind: "continue",
        reason: "unknown",
        summary: "Remain eligible for another step.",
        decidedAt: "2026-03-15T15:02:00.000Z",
        decidedBy: "policy",
        blockingRefs: [],
      },
    });

    vi.setSystemTime(new Date("2026-03-15T15:03:00.000Z"));
    const updated = store.setVerifier(run.state.runId, {
      iterationId: "iter-001",
      sourceKind: "test",
      sourceRef: "packages/pi-ralph-wiggum/__tests__/store.test.ts",
      verdict: "fail",
      blocker: true,
      summary: "A stale verifier update for the first iteration should not re-gate the run.",
    });

    expect(updated.state.waitingFor).toBe("none");
    expect(updated.state.status).toBe("active");
    expect(updated.state.phase).toBe("deciding");
    expect(updated.state.verifierSummary).toMatchObject({
      iterationId: null,
      verdict: "not_run",
      blocker: false,
    });
  });

  it("archives runs without leaving live loop controls in public state", () => {
    const store = createRalphStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T14:39:00.000Z"));
    const run = createExecutionRun(store, {
      title: "Archive cleanup run",
      objective: "Archive should clear public loop-control residue without destroying read access.",
    });

    vi.setSystemTime(new Date("2026-03-15T14:39:10.000Z"));
    store.queueSteering(run.state.runId, "Pause after the next checkpoint.");
    vi.setSystemTime(new Date("2026-03-15T14:39:20.000Z"));
    store.requestStop(run.state.runId, "Operator requested stop before archiving.", true);
    vi.setSystemTime(new Date("2026-03-15T14:39:30.000Z"));
    store.setScheduler(run.state.runId, { status: "running", jobId: "job-123", note: "Still running." });

    vi.setSystemTime(new Date("2026-03-15T14:39:40.000Z"));
    const archived = store.archiveRun(run.state.runId);

    expect(archived.state.status).toBe("archived");
    expect(archived.state.phase).toBe("halted");
    expect(archived.state.waitingFor).toBe("none");
    expect(archived.state.steeringQueue).toEqual([]);
    expect(archived.state.stopRequest).toBeNull();
    expect(archived.state.scheduler).toMatchObject({
      status: "completed",
      jobId: null,
      note: "Ralph run archived.",
    });
    expect(archived.state.nextIterationId).toBeNull();
    expect(archived.state.nextLaunch).toMatchObject({
      runtime: null,
      resume: false,
      preparedAt: null,
      instructions: [],
    });

    const readback = store.readRun(run.state.runId);
    expect(readback.summary).toMatchObject({ id: run.state.runId, status: "archived", phase: "halted" });
    expect(readback.state.stopRequest).toBeNull();
    expect(readback.state.scheduler.jobId).toBeNull();
    expect(readback.state.steeringQueue).toEqual([]);
  });

  it("preserves manual approval gating and rejects launch while review gates are active", () => {
    const store = createRalphStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T14:40:00.000Z"));
    const gated = createExecutionRun(store, {
      title: "Manual approval run",
      objective: "Require operator approval before continuing.",
      policySnapshot: {
        verifierRequired: false,
        manualApprovalRequired: true,
      },
    });

    vi.setSystemTime(new Date("2026-03-15T14:41:00.000Z"));
    const paused = store.decideRun(gated.state.runId, {
      summary: "Manual approval must happen before the next iteration.",
    });

    expect(paused.state.latestDecision).toMatchObject({
      kind: "pause",
      reason: "manual_review_required",
    });
    expect(paused.state.status).toBe("paused");
    expect(paused.state.waitingFor).toBe("operator");
    expect(paused.packet).toContain("waiting for: operator");

    expect(() => store.prepareLaunch(gated.state.runId)).toThrow(
      "Ralph run manual-approval-run is waiting for operator and cannot launch until that gate is cleared.",
    );

    const cleared = store.updateRun(gated.state.runId, {
      waitingFor: "none",
      status: "paused",
      phase: "deciding",
    });

    vi.setSystemTime(new Date("2026-03-15T14:42:00.000Z"));
    const launched = store.prepareLaunch(cleared.state.runId, { focus: "Resume after approval" });
    expect(launched.launch).toMatchObject({
      iterationId: "iter-001",
      runtime: "session",
    });
  }, 90000);
});
