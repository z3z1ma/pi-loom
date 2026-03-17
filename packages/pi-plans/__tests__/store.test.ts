import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConstitutionalStore } from "@pi-loom/pi-constitution/extensions/domain/store.js";
import { createCritiqueStore } from "@pi-loom/pi-critique/extensions/domain/store.js";
import { createDocumentationStore } from "@pi-loom/pi-docs/extensions/domain/store.js";
import { createInitiativeStore } from "@pi-loom/pi-initiatives/extensions/domain/store.js";
import { createResearchStore } from "@pi-loom/pi-research/extensions/domain/store.js";
import { createSpecStore } from "@pi-loom/pi-specs/extensions/domain/store.js";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlanStore } from "../extensions/domain/store.js";

describe("PlanStore durable memory", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "pi-plans-store-"));
    process.env.PI_LOOM_ROOT = join(workspace, ".pi-loom-test");
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.PI_LOOM_ROOT;
    rmSync(workspace, { recursive: true, force: true });
  });

  it("compiles planning packets from linked context, renders detailed plan markdown, and preserves ticket provenance", async () => {
    const constitutionStore = createConstitutionalStore(workspace);
    const critiqueStore = createCritiqueStore(workspace);
    const docsStore = createDocumentationStore(workspace);
    const initiativeStore = createInitiativeStore(workspace);
    const researchStore = createResearchStore(workspace);
    const specStore = createSpecStore(workspace);
    const ticketStore = createTicketStore(workspace);
    const planStore = createPlanStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));
    await constitutionStore.initLedger({ title: "Pi Loom" });
    await constitutionStore.updateVision({
      title: "Pi Loom",
      visionSummary: "Build durable AI coordination memory.",
      visionNarrative: "The system should preserve execution strategy as well as execution state durably.",
    });
    await constitutionStore.updateRoadmap({
      strategicDirectionSummary: "Bridge durable understanding into staged execution without losing ticket fidelity.",
      currentFocus: ["Plans", "Tickets", "Critique"],
    });
    const roadmap = await constitutionStore.upsertRoadmapItem({
      title: "Planning layer",
      status: "active",
      horizon: "now",
      summary: "Add a detailed execution-strategy layer between specs and tickets.",
      rationale: "Complex work needs a durable plan container that does not replace ticket detail.",
    });
    const roadmapId = roadmap.state.roadmapItems[0]?.id;
    expect(roadmapId).toBeDefined();
    if (!roadmapId) {
      throw new Error("Expected roadmap item id");
    }

    vi.setSystemTime(new Date("2026-03-15T12:05:00.000Z"));
    const initiative = await initiativeStore.createInitiative({
      title: "Planning Memory",
      objective: "Add first-class planning memory for multi-ticket execution slices.",
      roadmapRefs: [roadmapId],
      risks: ["Plan markdown could drift away from the ticket ledger if it carries too much detail."],
    });

    vi.setSystemTime(new Date("2026-03-15T12:10:00.000Z"));
    const research = await researchStore.createResearch({
      title: "Planning layer semantics",
      question: "How should durable plans differ from specs and tickets?",
      objective: "Design a detailed plan that links tickets without replacing them.",
      conclusions: [
        "The plan should compile context into a packet and keep plan.md detailed at the execution-strategy layer while tickets remain the live execution record.",
      ],
      openQuestions: ["Should future fresh-planner subprocesses exist like critique and docs?"],
      initiativeIds: [initiative.state.initiativeId],
    });
    initiativeStore.setResearchIds(initiative.state.initiativeId, [research.state.researchId]);

    vi.setSystemTime(new Date("2026-03-15T12:15:00.000Z"));
    const spec = await specStore.createChange({
      title: "Add planning layer",
      summary: "Persist plans, packets, dashboards, and ticket links.",
      initiativeIds: [initiative.state.initiativeId],
      researchIds: [research.state.researchId],
    });
    await specStore.updatePlan(spec.state.changeId, {
      designNotes:
        "Compile upstream context, render a detailed plan.md, and link tickets without scraping markdown into execution units.",
      capabilities: [
        {
          title: "Detailed plan container",
          summary: "Store a packet, plan markdown, dashboard, and linked ticket metadata.",
          requirements: [
            "Plans compile constitution, research, initiative, spec, ticket, critique, and docs context.",
            "Linked tickets remain the high-fidelity execution system of record and self-contained units of work.",
          ],
          acceptance: ["The rendered plan references ticket ids instead of inlining ticket detail."],
          scenarios: ["A finalized spec creates a plan that groups implementation, review, and docs tickets."],
        },
      ],
    });

    vi.setSystemTime(new Date("2026-03-15T12:20:00.000Z"));
    const implementationTicket = await ticketStore.createTicketAsync({
      title: "Implement plan store",
      summary: "Persist state, packet, plan markdown, and dashboard artifacts.",
      initiativeIds: [initiative.state.initiativeId],
      researchIds: [research.state.researchId],
      specChange: spec.state.changeId,
    });
    const reviewTicket = await ticketStore.createTicketAsync({
      title: "Review plan package",
      summary: "Verify the plan layer stays detailed at the execution-strategy level and ticket-linked.",
      initiativeIds: [initiative.state.initiativeId],
      researchIds: [research.state.researchId],
      specChange: spec.state.changeId,
    });
    await ticketStore.closeTicketAsync(reviewTicket.summary.id, "Critique and dashboard tests pass.");
    await initiativeStore.linkTicket(initiative.state.initiativeId, implementationTicket.summary.id);
    await initiativeStore.linkTicket(initiative.state.initiativeId, reviewTicket.summary.id);
    await researchStore.linkTicket(research.state.researchId, implementationTicket.summary.id);
    await researchStore.linkTicket(research.state.researchId, reviewTicket.summary.id);

    vi.setSystemTime(new Date("2026-03-15T12:25:00.000Z"));
    const critique = await critiqueStore.createCritiqueAsync({
      title: "Critique planning layer",
      target: {
        kind: "ticket",
        ref: implementationTicket.summary.id,
        path: "packages/pi-plans/extensions/domain/store.ts",
      },
      focusAreas: ["architecture", "process"],
      reviewQuestion:
        "Does the plan layer stay detailed at the execution-strategy level while tickets remain the live execution system of record and complete units of work?",
      contextRefs: { roadmapItemIds: [roadmapId] },
    });
    critiqueStore.recordRun(critique.state.critiqueId, {
      kind: "architecture",
      verdict: "pass",
      summary:
        "The plan layer stays detailed at the execution-strategy level and links tickets instead of replacing them.",
    });

    vi.setSystemTime(new Date("2026-03-15T12:30:00.000Z"));
    const doc = await docsStore.createDoc({
      title: "Planning memory system",
      docType: "overview",
      summary: "Explain the durable execution-strategy layer and its relationship to tickets.",
      sourceTarget: { kind: "spec", ref: spec.state.changeId },
      contextRefs: {
        roadmapItemIds: [roadmapId],
        initiativeIds: [initiative.state.initiativeId],
        researchIds: [research.state.researchId],
        specChangeIds: [spec.state.changeId],
        ticketIds: [implementationTicket.summary.id, reviewTicket.summary.id],
        critiqueIds: [critique.state.critiqueId],
      },
      scopePaths: ["packages/pi-plans", "README.md", "docs/loom.md"],
      guideTopics: ["planning-memory"],
      linkedOutputPaths: ["docs/loom.md"],
      updateReason: "Document the new planning layer.",
    });

    vi.setSystemTime(new Date("2026-03-15T12:35:00.000Z"));
    const createdPlan = await planStore.createPlan({
      title: "Planning layer rollout",
      summary: "Coordinate the multi-ticket rollout for the first-class planning layer.",
      purpose: "Bridge finalized design into a linked implementation and review ticket set.",
      contextAndOrientation:
        "This plan sits between the finalized spec and the ticket ledger. It should stay deeply detailed at the execution-strategy layer while the linked tickets hold the live execution detail.",
      milestones:
        "Milestone 1 lands the durable store and packet compiler. Milestone 2 wires the command and tool surfaces. Milestone 3 refreshes doctrine, docs, and tests with observable proof.",
      planOfWork:
        "Land the durable plan store and packet compilation first, then wire the command/tool surface, then update doctrine and docs.",
      concreteSteps: `Implement ${implementationTicket.summary.id}, verify ${reviewTicket.summary.id}, and keep critique/documentation context linked through the plan packet.`,
      validation: "Run targeted plan package tests plus prompt-guidance tests and repo checks.",
      idempotenceAndRecovery:
        "Re-running the targeted plan-package test suite is safe. If a packet or plan artifact is stale, rebuild it by reading or updating the plan again so the repo-materialized markdown matches canonical storage.",
      artifactsAndNotes:
        "Capture the final plan.md section headings and the targeted test output that proves the packet and plan remain Loom-linked.",
      interfacesAndDependencies:
        "Keep createPlanStore as the entry point, renderPlanMarkdown as the markdown renderer, and the plan_* tools as the supported AI-facing interfaces.",
      risksAndQuestions: "Avoid duplicating ticket implementation detail inside plan.md.",
      sourceTarget: { kind: "spec", ref: spec.state.changeId },
      contextRefs: {
        roadmapItemIds: [roadmapId],
        initiativeIds: [initiative.state.initiativeId],
        researchIds: [research.state.researchId],
        specChangeIds: [spec.state.changeId],
        critiqueIds: [critique.state.critiqueId],
        docIds: [doc.state.docId],
      },
      scopePaths: ["packages/pi-plans", "packages/pi-ticketing", "README.md", "docs/loom.md"],
      discoveries: [
        {
          note: "The plan must stay detailed about sequencing and rationale without copying ticket-by-ticket live execution history.",
          evidence:
            "The user required much more contextual detail in plans while preserving tickets as the live execution ledger and the complete definition of each unit of work.",
        },
      ],
      decisions: [
        {
          decision: "Use /workplan instead of /plan.",
          rationale: "Built-in plan-mode surfaces already use the plain plan name.",
          date: "2026-03-15",
          author: "ChatGPT",
        },
      ],
      progress: [
        {
          timestamp: "2026-03-15T12:35:00.000Z",
          status: "done",
          text: "Assembled the first durable workplan draft from linked constitution, research, spec, critique, docs, and ticket context.",
        },
        {
          timestamp: "2026-03-15T12:35:00.000Z",
          status: "pending",
          text: "Keep the workplan synchronized with linked ticket changes and add proof snippets as verification lands.",
        },
      ],
      revisionNotes: [
        {
          timestamp: "2026-03-15T12:35:00.000Z",
          change: "Seeded the first detailed plan draft.",
          reason: "Capture the initial execution strategy before linked tickets begin to drift apart.",
        },
      ],
    });

    const linkedPlan = await planStore.linkPlanTicket(createdPlan.state.planId, {
      ticketId: implementationTicket.summary.id,
      role: "implementation",
      order: 1,
    });
    const linkedClosed = await planStore.linkPlanTicket(linkedPlan.state.planId, {
      ticketId: reviewTicket.summary.id,
      role: "review",
      order: 2,
    });

    expect(linkedClosed.state.planId).toBe("planning-layer-rollout");
    const planRoot = join(workspace, ".loom", "plans", linkedClosed.state.planId);
    expect(existsSync(join(planRoot, "state.json"))).toBe(true);
    expect(existsSync(join(planRoot, "packet.md"))).toBe(true);
    expect(existsSync(join(planRoot, "plan.md"))).toBe(true);

    expect(linkedClosed.packet).toContain("Planning Boundaries");
    expect(linkedClosed.packet).toContain("Workplan Authoring Requirements");
    expect(linkedClosed.packet).toContain(initiative.state.initiativeId);
    expect(linkedClosed.packet).toContain(research.state.researchId);
    expect(linkedClosed.packet).toContain(spec.state.changeId);
    expect(linkedClosed.packet).toContain(implementationTicket.summary.id);
    expect(linkedClosed.packet).toContain(reviewTicket.summary.id);
    expect(linkedClosed.packet).toContain(critique.state.critiqueId);
    expect(linkedClosed.packet).toContain(doc.state.docId);

    expect(linkedClosed.plan).toContain(
      `- [ ] Ticket ${implementationTicket.summary.id} [ready] — Implement plan store (implementation)`,
    );
    expect(linkedClosed.plan).toContain(`- [x] Ticket ${reviewTicket.summary.id} — Review plan package (review)`);
    expect(linkedClosed.plan).toContain("This workplan is a living document.");
    expect(linkedClosed.plan).toContain("## Milestones");
    expect(linkedClosed.plan).toContain("## Idempotence and Recovery");
    expect(linkedClosed.plan).toContain("## Interfaces and Dependencies");
    expect(linkedClosed.plan).toContain("## Linked Tickets");
    expect(linkedClosed.plan).toContain("## Revision Notes");
    expect(linkedClosed.plan).toContain("Seeded the first detailed plan draft.");
    expect(linkedClosed.summary.path).toBe(`.loom/plans/${linkedClosed.state.planId}`);
    expect(linkedClosed.dashboard.plan.path).toBe(`.loom/plans/${linkedClosed.state.planId}`);
    expect(linkedClosed.dashboard.packetPath).toBe(`.loom/plans/${linkedClosed.state.planId}/packet.md`);
    expect(linkedClosed.dashboard.planPath).toBe(`.loom/plans/${linkedClosed.state.planId}/plan.md`);
    expect(linkedClosed.dashboard.linkedTickets).toEqual([
      expect.objectContaining({
        ticketId: implementationTicket.summary.id,
        path: `.loom/tickets/${implementationTicket.summary.id}.md`,
      }),
      expect.objectContaining({
        ticketId: reviewTicket.summary.id,
        path: `.loom/tickets/closed/${reviewTicket.summary.id}.md`,
      }),
    ]);
    expect(linkedClosed.dashboard.counts.tickets).toBe(2);
    expect(linkedClosed.dashboard.counts.byStatus).toMatchObject({ ready: 1, closed: 1 });

    const reread = await planStore.readPlan(linkedClosed.state.planId);
    expect(reread.dashboard).toEqual(linkedClosed.dashboard);
    expect(existsSync(join(planRoot, "dashboard.json"))).toBe(false);

    const implementationReadback = ticketStore.readTicket(implementationTicket.summary.id);
    const reviewReadback = ticketStore.readTicket(reviewTicket.summary.id);
    expect(implementationReadback.ticket.frontmatter["external-refs"]).toContain(`plan:${linkedClosed.state.planId}`);
    expect(reviewReadback.ticket.frontmatter["external-refs"]).toContain(`plan:${linkedClosed.state.planId}`);

    const unlinked = await planStore.unlinkPlanTicket(linkedClosed.state.planId, reviewTicket.summary.id);
    expect(unlinked.state.linkedTickets).toHaveLength(1);
    expect(unlinked.state.linkedTickets[0]?.ticketId).toBe(implementationTicket.summary.id);
    expect(ticketStore.readTicket(reviewTicket.summary.id).ticket.frontmatter["external-refs"]).toContain(
      `plan:${linkedClosed.state.planId}`,
    );

    const renderedPlan = readFileSync(join(planRoot, "plan.md"), "utf-8");
    expect(renderedPlan).toContain("## Purpose / Big Picture");
    expect(renderedPlan).toContain("## Artifacts and Notes");
    expect(renderedPlan).toContain(`Ticket ${implementationTicket.summary.id}`);
  }, 120000);

  it("rebuilds linked ticket dashboard details from canonical storage even if the ticket markdown was removed", async () => {
    const ticketStore = createTicketStore(workspace);
    const planStore = createPlanStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T14:00:00.000Z"));
    const created = await planStore.createPlan({
      title: "Missing ticket references",
      sourceTarget: { kind: "workspace", ref: "." },
    });

    vi.setSystemTime(new Date("2026-03-15T14:05:00.000Z"));
    const orphanedTicket = await ticketStore.createTicketAsync({ title: "Orphaned follow-up" });
    const linkedExisting = await planStore.linkPlanTicket(created.state.planId, {
      ticketId: orphanedTicket.summary.id,
      role: "follow-up",
      order: 1,
    });
    rmSync(join(workspace, orphanedTicket.summary.path), { force: true });
    const linked = await planStore.readPlan(linkedExisting.state.planId);

    expect(linked.dashboard.plan.path).toBe(`.loom/plans/${created.state.planId}`);
    expect(linked.dashboard.packetPath).toBe(`.loom/plans/${created.state.planId}/packet.md`);
    expect(linked.dashboard.planPath).toBe(`.loom/plans/${created.state.planId}/plan.md`);
    expect(linked.dashboard.linkedTickets).toEqual([
      expect.objectContaining({
        ticketId: orphanedTicket.summary.id,
        status: "ready",
        title: "Orphaned follow-up",
        path: `.loom/tickets/${orphanedTicket.summary.id}.md`,
      }),
    ]);
    expect(linked.dashboard.counts.byStatus).toMatchObject({ ready: 1 });
  }, 30000);
});
