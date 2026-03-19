import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCritiqueStore } from "@pi-loom/pi-critique/extensions/domain/store.js";
import { findEntityByDisplayId } from "@pi-loom/pi-storage/storage/entities.js";
import { openWorkspaceStorage } from "@pi-loom/pi-storage/storage/workspace.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRalphStore } from "../extensions/domain/store.js";

describe("RalphStore durable memory", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "pi-ralph-store-"));
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(workspace, { recursive: true, force: true });
  });

  it("initializes the ledger and persists run state for canonical readback", () => {
    vi.setSystemTime(new Date("2026-03-15T14:00:00.000Z"));
    const store = createRalphStore(workspace);

    const ledger = store.initLedger();
    const created = store.createRun({
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
        sourceRef: "packages/pi-ralph/__tests__/store.test.ts",
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
    expect(created.state.packetSummary).toContain("Linked refs: plan-123, ticket-456, spec-789.");
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
    expect(created.packet).toContain("plan-123 (unresolved)");
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
      launchCount: 0,
      currentIterationId: null,
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

  it("stores canonical Ralph state and iteration artifacts without duplicating read models", async () => {
    vi.setSystemTime(new Date("2026-03-15T15:00:00.000Z"));
    const store = createRalphStore(workspace);

    const created = store.createRun({
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
        sourceRef: "packages/pi-ralph/__tests__/store.test.ts",
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
    expect(runEntity?.attributes).toEqual(
      expect.objectContaining({
        state: expect.objectContaining({
          runId: created.state.runId,
          currentIterationId: "iter-001",
          preparedLaunch: expect.objectContaining({ runtime: "subprocess", resume: false }),
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
      runtime: "subprocess",
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
        locator: "packages/pi-ralph/extensions/domain/store.ts",
      },
      focusAreas: ["architecture"],
      reviewQuestion: "Can the run continue safely after the verifier failure?",
      contextRefs: { ticketIds: ["ticket-456"] },
    });

    const created = store.createRun({
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
      runtime: "subprocess",
      iterationId: "iter-001",
      iteration: 1,
      resume: false,
    });
    expect(launched.state.currentIterationId).toBe("iter-001");
    expect(launched.state.launchCount).toBe(1);

    vi.setSystemTime(new Date("2026-03-15T14:12:00.000Z"));
    const reviewed = store.appendIteration(created.state.runId, {
      id: launched.launch.iterationId,
      status: "reviewing",
      summary: "Verifier failed during launch preparation.",
      workerSummary: "Resume metadata did not satisfy the expected launch contract.",
      verifier: {
        sourceKind: "test",
        sourceRef: "packages/pi-ralph/__tests__/runtime.test.ts",
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
        sourceRef: "packages/pi-ralph/__tests__/runtime.test.ts",
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

  it("completes cleanly after passing verification and prepares canonical resume launches with fresh iteration ids", () => {
    const store = createRalphStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T14:20:00.000Z"));
    const cleanRun = store.createRun({
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
        sourceRef: "packages/pi-ralph/__tests__/store.test.ts",
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
      kind: "complete",
      reason: "goal_reached",
    });
    expect(completed.state.status).toBe("completed");
    expect(completed.state.phase).toBe("completed");
    expect(completed.state.currentIterationId).toBeNull();
    expect(completed.state.stopReason).toBe("goal_reached");

    vi.setSystemTime(new Date("2026-03-15T14:30:00.000Z"));
    const resumableRun = store.createRun({
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

    vi.setSystemTime(new Date("2026-03-15T14:33:00.000Z"));
    const resumed = store.resumeRun(resumableRun.state.runId, { focus: "Resume from durable state" });

    expect(resumed.launch).toMatchObject({
      iterationId: "iter-002",
      iteration: 2,
      runtime: "subprocess",
      resume: true,
    });
    expect(resumed.state.currentIterationId).toBe("iter-002");
    expect(resumed.state.launchCount).toBe(2);
    expect(resumed.state.lastIterationNumber).toBe(2);
    expect(resumed.state.lastLaunchAt).toBe("2026-03-15T14:33:00.000Z");
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

  it("preserves manual approval gating and rejects launch while review gates are active", () => {
    const store = createRalphStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T14:40:00.000Z"));
    const gated = store.createRun({
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
      runtime: "subprocess",
    });
  }, 90000);
});
