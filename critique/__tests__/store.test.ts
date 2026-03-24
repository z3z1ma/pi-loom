import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConstitutionalStore } from "#constitution/extensions/domain/store.js";
import { createInitiativeStore } from "#initiatives/extensions/domain/store.js";
import { createResearchStore } from "#research/extensions/domain/store.js";
import { createSpecStore } from "#specs/extensions/domain/store.js";
import { findEntityByDisplayId } from "#storage/entities.js";
import { openWorkspaceStorage } from "#storage/workspace.js";
import { createTicketStore } from "#ticketing/extensions/domain/store.js";
import { createCritiqueStore } from "../extensions/domain/store.js";

describe("CritiqueStore durable memory", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "pi-critique-store-"));
    process.env.PI_LOOM_ROOT = join(workspace, ".pi-loom-test");
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.PI_LOOM_ROOT;
    rmSync(workspace, { recursive: true, force: true });
  });

  it("compiles fresh-context packets, records durable runs/findings, and creates follow-up tickets", async () => {
    const constitutionStore = createConstitutionalStore(workspace);
    const initiativeStore = createInitiativeStore(workspace);
    const researchStore = createResearchStore(workspace);
    const specStore = createSpecStore(workspace);
    const ticketStore = createTicketStore(workspace);
    const critiqueStore = createCritiqueStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T10:00:00.000Z"));
    await constitutionStore.initLedger({ title: "Pi Loom" });
    await constitutionStore.updateVision({
      title: "Pi Loom",
      visionSummary: "Build durable AI coordination and review memory.",
      visionNarrative: "The system should preserve intent, review, and follow-up work durably.",
    });
    await constitutionStore.updateRoadmap({
      strategicDirectionSummary: "Ship a durable critique system for mission-critical AI development.",
      currentFocus: ["Critique packets", "Adversarial review"],
    });
    const roadmap = await constitutionStore.upsertRoadmapItem({
      title: "Critique layer",
      status: "active",
      horizon: "now",
      summary: "Add durable critique packets, findings, and follow-up work.",
      rationale: "Mission-critical work needs adversarial review that survives beyond chat.",
    });
    const roadmapId = roadmap.state.roadmapItems[0]?.id;
    expect(roadmapId).toBeDefined();
    if (!roadmapId) {
      throw new Error("Expected roadmap item id");
    }

    vi.setSystemTime(new Date("2026-03-15T10:05:00.000Z"));
    const initiative = await initiativeStore.createInitiative({
      title: "Critique System",
      objective: "Add first-class critique and review memory.",
      roadmapRefs: [roadmapId],
      risks: ["Inline self-review is not independent enough."],
    });

    vi.setSystemTime(new Date("2026-03-15T10:10:00.000Z"));
    const research = await researchStore.createResearch({
      title: "Fresh review packets",
      question: "How should critique launch work?",
      objective: "Design a fresh-context review handoff.",
      conclusions: ["Fresh reviewer context should start from a compiled packet, not executor chat state."],
      openQuestions: ["Which runtime adapter should own session spawning?"],
      initiativeIds: [initiative.state.initiativeId],
    });
    await initiativeStore.setResearchIds(initiative.state.initiativeId, [research.state.researchId]);

    vi.setSystemTime(new Date("2026-03-15T10:15:00.000Z"));
    const spec = await specStore.createChange({
      title: "Add critique layer",
      summary: "Persist critique packets, runs, findings, and launch metadata.",
      initiativeIds: [initiative.state.initiativeId],
      researchIds: [research.state.researchId],
    });
    await specStore.updatePlan(spec.state.changeId, {
      designNotes: "Compile review packets from linked context and persist explicit launch descriptors.",
      capabilities: [
        {
          title: "Critique packets",
          summary: "Provide a bounded packet for a fresh reviewer context.",
          requirements: [
            "Compile a packet from constitution, initiative, research, spec, and ticket context.",
            "Record an explicit launch descriptor for fresh-session review.",
          ],
          acceptance: ["Packet includes broader project context."],
          scenarios: ["A critic loads packet.md in a fresh context window."],
        },
      ],
    });

    vi.setSystemTime(new Date("2026-03-15T10:20:00.000Z"));
    const ticket = await ticketStore.createTicketAsync({
      title: "Implement critique store",
      summary: "Persist critique state, packet, runs, findings, and dashboard artifacts.",
      initiativeIds: [initiative.state.initiativeId],
      researchIds: [research.state.researchId],
    });
    await initiativeStore.linkTicket(initiative.state.initiativeId, ticket.summary.id);
    await researchStore.linkTicket(research.state.researchId, ticket.summary.id);

    vi.setSystemTime(new Date("2026-03-15T10:25:00.000Z"));
    const critique = await critiqueStore.createCritiqueAsync({
      title: "Critique implementation ticket",
      target: {
        kind: "ticket",
        ref: ticket.summary.id,
        locator: "critique/extensions/domain/store.ts",
      },
      focusAreas: ["architecture", "tests"],
      reviewQuestion: "Does this work satisfy the constitutional requirement for durable adversarial review?",
      scopeRefs: ["critique/extensions/domain/store.ts", "critique/extensions/tools/critique.ts"],
      nonGoals: ["Do not redesign Ralph loop orchestration."],
      contextRefs: {
        roadmapItemIds: [roadmapId],
      },
    });

    expect(critique.state.critiqueId).toBe("critique-implementation-ticket");
    const { storage, identity } = await openWorkspaceStorage(workspace);
    const createdEntity = await findEntityByDisplayId(
      storage,
      identity.space.id,
      "critique",
      critique.state.critiqueId,
    );
    expect(createdEntity).toBeTruthy();
    expect(createdEntity?.attributes).toMatchObject({
      record: {
        state: { critiqueId: critique.state.critiqueId },
        runs: [],
      },
    });
    expect(createdEntity?.attributes).not.toHaveProperty("record.findings");
    expect(createdEntity?.attributes).not.toHaveProperty("record.launch");
    expect(createdEntity?.attributes).not.toHaveProperty("record.packet");
    expect(createdEntity?.attributes).not.toHaveProperty("record.dashboard");
    expect(critique.packet).toContain("Ship a durable critique system for mission-critical AI development.");
    expect(critique.packet).toContain(`${roadmapId} [active/now] Critique layer`);
    expect(critique.packet).toContain(initiative.state.initiativeId);
    expect(critique.packet).toContain(research.state.researchId);
    expect(critique.packet).toContain(ticket.summary.id);
    expect(critique.packet).toContain(
      "Does this work satisfy the constitutional requirement for durable adversarial review?",
    );

    vi.setSystemTime(new Date("2026-03-15T10:30:00.000Z"));
    const launched = await critiqueStore.launchCritiqueAsync(critique.state.critiqueId);
    expect(launched.launch.runtime).toBe("descriptor_only");
    expect(launched.launch.freshContextRequired).toBe(true);
    expect(launched.launch.packetRef).toBe(`critique:${critique.state.critiqueId}:packet`);
    expect(launched.text).toContain("fresh reviewer session");
    expect(launched.text).toContain(`Packet ref: critique:${critique.state.critiqueId}:packet`);
    expect(launched.critique.summary.critiqueRef).toBe(`critique:${critique.state.critiqueId}`);
    expect(launched.critique.dashboard.critique.critiqueRef).toBe(`critique:${critique.state.critiqueId}`);
    expect(launched.critique.dashboard.packetRef).toBe(`critique:${critique.state.critiqueId}:packet`);
    expect(launched.critique.dashboard.launchRef).toBe(`critique:${critique.state.critiqueId}:launch`);
    const launchedEntity = await findEntityByDisplayId(
      storage,
      identity.space.id,
      "critique",
      critique.state.critiqueId,
    );
    expect(launchedEntity?.attributes).toMatchObject({
      record: {
        state: { critiqueId: critique.state.critiqueId, launchCount: 1 },
        runs: [],
      },
    });
    expect(launchedEntity?.attributes).not.toHaveProperty("record.launch");

    vi.setSystemTime(new Date("2026-03-15T10:35:00.000Z"));
    const withRun = await critiqueStore.recordRunAsync(critique.state.critiqueId, {
      kind: "adversarial",
      verdict: "needs_revision",
      summary: "The packet is good, but verification coverage is incomplete.",
      freshContext: true,
      focusAreas: ["architecture", "tests"],
    });
    expect(withRun.runs).toHaveLength(1);
    expect(withRun.state.currentVerdict).toBe("needs_revision");
    const runId = withRun.runs[0]?.id;
    expect(runId).toBeDefined();
    if (!runId) {
      throw new Error("Expected critique run id");
    }

    vi.setSystemTime(new Date("2026-03-15T10:40:00.000Z"));
    const withFirstFinding = await critiqueStore.addFindingAsync(critique.state.critiqueId, {
      runId,
      kind: "missing_test",
      severity: "high",
      confidence: "high",
      title: "No launch contract verification",
      summary: "The fresh-session launch boundary is not yet verified by tests.",
      evidence: ["No test covered launch.json generation or descriptor semantics."],
      recommendedAction: "Add targeted launch tests that assert descriptor-only behavior.",
    });
    expect(withFirstFinding.findings).toHaveLength(1);
    expect(withFirstFinding.state.openFindingIds).toEqual(["finding-001"]);
    const findingArtifact = await findEntityByDisplayId(
      storage,
      identity.space.id,
      "artifact",
      `critique:${critique.state.critiqueId}:finding:finding-001`,
    );
    expect(findingArtifact).toMatchObject({
      displayId: `critique:${critique.state.critiqueId}:finding:finding-001`,
      status: "open",
      attributes: {
        artifactType: "critique-finding",
        payload: expect.objectContaining({
          critiqueId: critique.state.critiqueId,
          id: "finding-001",
          status: "open",
          linkedTicketId: null,
        }),
      },
    });

    vi.setSystemTime(new Date("2026-03-15T10:45:00.000Z"));
    const withSecondFinding = await critiqueStore.addFindingAsync(critique.state.critiqueId, {
      runId,
      kind: "architecture",
      severity: "medium",
      confidence: "medium",
      title: "Critique summary should remain distinct from loop orchestration",
      summary: "The system should describe critique as reusable outside Ralph looping.",
      evidence: ["Cross-layer doctrine must explicitly keep critique separate from Ralph loop mode."],
      recommendedAction: "Update docs and prompt doctrine to keep critique distinct from loop orchestration.",
    });
    expect(withSecondFinding.state.openFindingIds).toEqual(["finding-001", "finding-002"]);
    expect(withSecondFinding.dashboard.counts.openFindings).toBe(2);

    vi.setSystemTime(new Date("2026-03-15T10:50:00.000Z"));
    const ticketified = await critiqueStore.ticketifyFindingAsync(critique.state.critiqueId, {
      findingId: "finding-001",
    });
    expect(ticketified.state.followupTicketIds).toEqual(["t-0002"]);
    expect(ticketified.findings.find((finding) => finding.id === "finding-001")?.linkedTicketId).toBe("t-0002");
    expect(ticketified.findings.find((finding) => finding.id === "finding-001")?.status).toBe("accepted");
    expect(ticketified.state.openFindingIds).toEqual(["finding-001", "finding-002"]);
    const ticketifiedArtifact = await findEntityByDisplayId(
      storage,
      identity.space.id,
      "artifact",
      `critique:${critique.state.critiqueId}:finding:finding-001`,
    );
    expect(ticketifiedArtifact?.attributes).toMatchObject({
      payload: expect.objectContaining({
        linkedTicketId: "t-0002",
        status: "accepted",
      }),
    });

    const followupTicket = await ticketStore.readTicketAsync("t-0002");
    expect(followupTicket.ticket.body.context).toContain(`Critique: ${critique.state.critiqueId}`);
    expect(followupTicket.ticket.body.context).toContain("Finding: finding-001");

    await expect(critiqueStore.resolveCritiqueAsync(critique.state.critiqueId)).rejects.toThrow(
      "Cannot resolve critique with active findings",
    );

    vi.setSystemTime(new Date("2026-03-15T10:55:00.000Z"));
    const fixed = await critiqueStore.updateFindingAsync(critique.state.critiqueId, {
      id: "finding-001",
      status: "fixed",
      resolutionNotes: "Launch tests now cover descriptor-only behavior.",
      recommendedAction: "Do not rewrite finding history.",
    });
    const rejected = await critiqueStore.updateFindingAsync(critique.state.critiqueId, {
      id: "finding-002",
      status: "rejected",
      resolutionNotes: "Doctrine update already landed in the same change.",
    });
    expect(fixed.findings.find((finding) => finding.id === "finding-001")?.status).toBe("fixed");
    expect(fixed.findings.find((finding) => finding.id === "finding-001")?.recommendedAction).toBe(
      "Add targeted launch tests that assert descriptor-only behavior.",
    );
    expect(fixed.findings.find((finding) => finding.id === "finding-001")?.evidence).toEqual([
      "No test covered launch.json generation or descriptor semantics.",
    ]);
    expect(rejected.state.openFindingIds).toEqual([]);

    vi.setSystemTime(new Date("2026-03-15T11:00:00.000Z"));
    const resolved = await critiqueStore.resolveCritiqueAsync(critique.state.critiqueId);
    expect(resolved.state.status).toBe("resolved");
    expect(resolved.state.currentVerdict).toBe("pass");
    expect(resolved.dashboard.counts.openFindings).toBe(0);
    expect(resolved.critique).toContain("Current Verdict");
    if (!launchedEntity) {
      throw new Error("Expected launched critique entity to exist");
    }
    const critiqueEvents = await storage.listEvents(launchedEntity.id);
    expect(critiqueEvents.map((event) => event.payload.change)).toEqual(
      expect.arrayContaining([
        "critique_launch_prepared",
        "critique_run_recorded",
        "critique_finding_created",
        "critique_finding_updated",
        "critique_finding_resolved",
      ]),
    );
  }, 300000);
});
