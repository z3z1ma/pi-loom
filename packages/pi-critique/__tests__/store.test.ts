import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConstitutionalStore } from "@pi-loom/pi-constitution/extensions/domain/store.js";
import { createInitiativeStore } from "@pi-loom/pi-initiatives/extensions/domain/store.js";
import { createResearchStore } from "@pi-loom/pi-research/extensions/domain/store.js";
import { createSpecStore } from "@pi-loom/pi-specs/extensions/domain/store.js";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    initiativeStore.setResearchIds(initiative.state.initiativeId, [research.state.researchId]);

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
    await specStore.updateTasks(spec.state.changeId, {
      tasks: [{ title: "Implement critique store", requirements: ["req-001"] }],
    });

    vi.setSystemTime(new Date("2026-03-15T10:20:00.000Z"));
    const ticket = await ticketStore.createTicketAsync({
      title: "Implement critique store",
      summary: "Persist critique state, packet, runs, findings, and dashboard artifacts.",
      initiativeIds: [initiative.state.initiativeId],
      researchIds: [research.state.researchId],
      specChange: spec.state.changeId,
    });
    await initiativeStore.linkTicket(initiative.state.initiativeId, ticket.summary.id);
    await researchStore.linkTicket(research.state.researchId, ticket.summary.id);

    vi.setSystemTime(new Date("2026-03-15T10:25:00.000Z"));
    const critique = await critiqueStore.createCritiqueAsync({
      title: "Critique implementation ticket",
      target: {
        kind: "ticket",
        ref: ticket.summary.id,
        path: "packages/pi-critique/extensions/domain/store.ts",
      },
      focusAreas: ["architecture", "tests"],
      reviewQuestion: "Does this work satisfy the constitutional requirement for durable adversarial review?",
      scopePaths: [
        "packages/pi-critique/extensions/domain/store.ts",
        "packages/pi-critique/extensions/tools/critique.ts",
      ],
      nonGoals: ["Do not redesign Ralph loop orchestration."],
      contextRefs: {
        roadmapItemIds: [roadmapId],
      },
    });

    expect(critique.state.critiqueId).toBe("critique-implementation-ticket");
    expect(existsSync(join(workspace, ".loom", "critiques", critique.state.critiqueId, "state.json"))).toBe(true);
    expect(existsSync(join(workspace, ".loom", "critiques", critique.state.critiqueId, "packet.md"))).toBe(true);
    expect(critique.packet).toContain("Ship a durable critique system for mission-critical AI development.");
    expect(critique.packet).toContain(`${roadmapId} [active/now] Critique layer`);
    expect(critique.packet).toContain(initiative.state.initiativeId);
    expect(critique.packet).toContain(research.state.researchId);
    expect(critique.packet).toContain(spec.state.changeId);
    expect(critique.packet).toContain(ticket.summary.id);
    expect(critique.packet).toContain(
      "Does this work satisfy the constitutional requirement for durable adversarial review?",
    );

    vi.setSystemTime(new Date("2026-03-15T10:30:00.000Z"));
    const launched = critiqueStore.launchCritique(critique.state.critiqueId);
    expect(launched.launch.runtime).toBe("descriptor_only");
    expect(launched.launch.freshContextRequired).toBe(true);
    expect(launched.launch.packetPath).toBe(`.loom/critiques/${critique.state.critiqueId}/packet.md`);
    expect(launched.text).toContain("fresh reviewer session");
    expect(launched.text).toContain(`Packet: .loom/critiques/${critique.state.critiqueId}/packet.md`);
    expect(launched.critique.summary.path).toBe(`.loom/critiques/${critique.state.critiqueId}`);
    expect(launched.critique.dashboard.critique.path).toBe(`.loom/critiques/${critique.state.critiqueId}`);
    expect(launched.critique.dashboard.packetPath).toBe(`.loom/critiques/${critique.state.critiqueId}/packet.md`);
    expect(launched.critique.dashboard.launchPath).toBe(`.loom/critiques/${critique.state.critiqueId}/launch.json`);
    expect(existsSync(join(workspace, ".loom", "critiques", critique.state.critiqueId, "launch.json"))).toBe(true);

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

    const followupTicket = await ticketStore.readTicketAsync("t-0002");
    expect(followupTicket.ticket.body.context).toContain(`Critique: ${critique.state.critiqueId}`);
    expect(followupTicket.ticket.body.context).toContain("Finding: finding-001");
    expect(followupTicket.ticket.frontmatter["spec-change"]).toBe(spec.state.changeId);

    vi.setSystemTime(new Date("2026-03-15T10:55:00.000Z"));
    const fixed = await critiqueStore.updateFindingAsync(critique.state.critiqueId, {
      id: "finding-001",
      status: "fixed",
      resolutionNotes: "Launch tests now cover descriptor-only behavior.",
    });
    const rejected = await critiqueStore.updateFindingAsync(critique.state.critiqueId, {
      id: "finding-002",
      status: "rejected",
      resolutionNotes: "Doctrine update already landed in the same change.",
    });
    expect(fixed.findings.find((finding) => finding.id === "finding-001")?.status).toBe("fixed");
    expect(rejected.state.openFindingIds).toEqual([]);

    vi.setSystemTime(new Date("2026-03-15T11:00:00.000Z"));
    const resolved = critiqueStore.resolveCritique(critique.state.critiqueId);
    expect(resolved.state.status).toBe("resolved");
    expect(resolved.state.currentVerdict).toBe("pass");
    expect(resolved.dashboard.counts.openFindings).toBe(0);
    expect(
      readFileSync(join(workspace, ".loom", "critiques", critique.state.critiqueId, "critique.md"), "utf-8"),
    ).toContain("Current Verdict");
  }, 120000);
});
