import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConstitutionalStore } from "#constitution/domain/store.js";
import { createCritiqueStore } from "#critique/domain/store.js";
import { createDocumentationStore } from "#docs/domain/store.js";
import { createInitiativeStore } from "#initiatives/domain/store.js";
import { createResearchStore } from "#research/domain/store.js";
import { createSpecStore } from "#specs/domain/store.js";
import { findEntityByDisplayId } from "#storage/entities.js";
import { openWorkspaceStorage } from "#storage/workspace.js";
import { createTicketStore } from "#ticketing/domain/store.js";
import { createPlanStore } from "../domain/store.js";

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
      summary: "Persist plans, packets, overviews, and ticket links.",
      initiativeIds: [initiative.state.initiativeId],
      researchIds: [research.state.researchId],
    });
    await specStore.updatePlan(spec.state.changeId, {
      designNotes:
        "Compile upstream context, render a detailed plan.md, and link tickets without scraping markdown into execution units.",
      capabilities: [
        {
          title: "Detailed plan container",
          summary: "Store a packet, plan markdown, overview, and linked ticket metadata.",
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
      summary: "Persist state, packet, plan markdown, and overview artifacts.",
      initiativeIds: [initiative.state.initiativeId],
      researchIds: [research.state.researchId],
    });
    const reviewTicket = await ticketStore.createTicketAsync({
      title: "Review plan package",
      summary: "Verify the plan layer stays detailed at the execution-strategy level and ticket-linked.",
      initiativeIds: [initiative.state.initiativeId],
      researchIds: [research.state.researchId],
    });
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
        locator: "plans/domain/store.ts",
      },
      focusAreas: ["architecture", "process"],
      reviewQuestion:
        "Does the plan layer stay detailed at the execution-strategy level while tickets remain the live execution system of record and complete units of work?",
      contextRefs: { roadmapItemIds: [roadmapId] },
    });
    await critiqueStore.recordRunAsync(critique.state.critiqueId, {
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
      scopePaths: ["plans", "README.md", "docs/loom.md"],
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
        "Capture the final plan section headings and the targeted test output that proves the packet and plan remain Loom-linked.",
      interfacesAndDependencies:
        "Keep createPlanStore as the entry point, renderPlanMarkdown as the markdown renderer, and the plan_* tools as the supported AI-facing interfaces.",
      risksAndQuestions: "Avoid duplicating ticket implementation detail inside the plan document.",
      sourceTarget: { kind: "spec", ref: spec.state.changeId },
      contextRefs: {
        roadmapItemIds: [roadmapId],
        initiativeIds: [initiative.state.initiativeId],
        researchIds: [research.state.researchId],
        specChangeIds: [spec.state.changeId],
        critiqueIds: [critique.state.critiqueId],
        docIds: [doc.state.docId],
      },
      scopePaths: ["plans", "ticketing", "README.md", "docs/loom.md"],
      discoveries: [
        {
          note: "The plan must stay detailed about sequencing and rationale without copying ticket-by-ticket live execution history.",
          evidence:
            "The user required much more contextual detail in plans while preserving tickets as the live execution ledger and the complete definition of each unit of work.",
        },
      ],
      decisions: [
        {
          decision: "Use the explicit workplan naming consistently.",
          rationale:
            "The plan layer should use its own unambiguous name instead of collapsing into a generic plan label.",
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
          text: "Keep the workplan aligned with linked ticket changes and add proof snippets as verification lands.",
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
    await planStore.linkPlanTicket(linkedPlan.state.planId, {
      ticketId: reviewTicket.summary.id,
      role: "review",
      order: 2,
    });
    await ticketStore.closeTicketAsync(reviewTicket.summary.id, "Critique and overview tests pass.");
    const linkedClosed = await planStore.readPlan(linkedPlan.state.planId);

    expect(linkedClosed.state.planId).toBe("planning-layer-rollout");
    const { storage, identity } = await openWorkspaceStorage(workspace);
    const entity = await findEntityByDisplayId(storage, identity.space.id, "plan", linkedClosed.state.planId);
    expect(entity).toBeTruthy();
    if (!entity) {
      throw new Error("Expected plan entity to exist");
    }
    expect(entity.attributes).toMatchObject({
      state: {
        planId: linkedClosed.state.planId,
        linkedTickets: [
          { ticketId: implementationTicket.summary.id, role: "implementation", order: 1 },
          { ticketId: reviewTicket.summary.id, role: "review", order: 2 },
        ],
      },
    });

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
    expect(linkedClosed.summary.ref).toBe(`plan:${linkedClosed.state.planId}`);
    expect(linkedClosed.overview.plan.ref).toBe(`plan:${linkedClosed.state.planId}`);
    expect(linkedClosed.overview.packetRef).toBe(`plan:${linkedClosed.state.planId}:packet`);
    expect(linkedClosed.overview.planRef).toBe(`plan:${linkedClosed.state.planId}:document`);
    expect(linkedClosed.overview.linkedTickets).toEqual([
      expect.objectContaining({
        ticketId: implementationTicket.summary.id,
        ref: `ticket:${implementationTicket.summary.id}`,
      }),
      expect.objectContaining({
        ticketId: reviewTicket.summary.id,
        ref: `ticket:${reviewTicket.summary.id}`,
      }),
    ]);
    expect(linkedClosed.overview.counts.tickets).toBe(2);
    expect(linkedClosed.overview.counts.byStatus).toMatchObject({ ready: 1, closed: 1 });

    const reread = await planStore.readPlan(linkedClosed.state.planId);

    expect(reread.overview).toEqual(linkedClosed.overview);

    const implementationReadback = await ticketStore.readTicketAsync(implementationTicket.summary.id);
    const reviewReadback = await ticketStore.readTicketAsync(reviewTicket.summary.id);
    expect(implementationReadback.ticket.frontmatter["external-refs"]).toContain(`plan:${linkedClosed.state.planId}`);
    expect(reviewReadback.ticket.frontmatter["external-refs"]).toContain(`plan:${linkedClosed.state.planId}`);

    const unlinked = await planStore.unlinkPlanTicket(linkedClosed.state.planId, reviewTicket.summary.id);
    expect(unlinked.state.linkedTickets).toHaveLength(1);
    expect(unlinked.state.linkedTickets[0]?.ticketId).toBe(implementationTicket.summary.id);
    expect((await ticketStore.readTicketAsync(reviewTicket.summary.id)).ticket.frontmatter["external-refs"]).toContain(
      `plan:${linkedClosed.state.planId}`,
    );

    expect(reread.plan).toContain("## Purpose / Big Picture");
    expect(reread.plan).toContain("## Artifacts and Notes");
    expect(reread.plan).toContain(`Ticket ${implementationTicket.summary.id}`);
  }, 120000);

  it("rebuilds linked ticket overview details from canonical storage after async ticket mutations", async () => {
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

    vi.setSystemTime(new Date("2026-03-15T14:06:00.000Z"));
    await ticketStore.updateTicketAsync(orphanedTicket.summary.id, { title: "Canonical follow-up" });

    const linked = await planStore.readPlan(linkedExisting.state.planId);

    expect(linked.overview.plan.ref).toBe(`plan:${created.state.planId}`);
    expect(linked.overview.packetRef).toBe(`plan:${created.state.planId}:packet`);
    expect(linked.overview.planRef).toBe(`plan:${created.state.planId}:document`);
    expect(linked.overview.linkedTickets).toEqual([
      expect.objectContaining({
        ticketId: orphanedTicket.summary.id,
        status: "ready",
        title: "Canonical follow-up",
        ref: `ticket:${orphanedTicket.summary.id}`,
      }),
    ]);
    expect(linked.overview.counts.byStatus).toMatchObject({ ready: 1 });

    expect(linked.plan).toContain("Canonical follow-up");
  }, 30000);


  it("replaces and removes context refs explicitly instead of only accumulating them", async () => {
    const ticketStore = createTicketStore(workspace);
    const planStore = createPlanStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T14:10:00.000Z"));
    const firstTicket = await ticketStore.createTicketAsync({ title: "First context ticket" });
    const secondTicket = await ticketStore.createTicketAsync({ title: "Second context ticket" });
    const thirdTicket = await ticketStore.createTicketAsync({ title: "Third context ticket" });
    const created = await planStore.createPlan({
      title: "Context ref corrections",
      sourceTarget: { kind: "workspace", ref: "." },
      contextRefs: { ticketIds: [firstTicket.summary.id, secondTicket.summary.id] },
    });

    const updated = await planStore.updatePlan(created.state.planId, {
      contextRefs: {
        replace: { ticketIds: [secondTicket.summary.id, thirdTicket.summary.id] },
        remove: { ticketIds: [secondTicket.summary.id] },
      },
    });

    expect(updated.state.contextRefs.ticketIds).toEqual([thirdTicket.summary.id]);
    expect(updated.overview.contextRefs.ticketIds).toEqual([thirdTicket.summary.id]);
    expect(updated.packet).toContain(thirdTicket.summary.id);
    expect(updated.packet).not.toContain(firstTicket.summary.id);
    expect(updated.packet).not.toContain(secondTicket.summary.id);
  }, 30000);

  it("treats plan child records as whole-list replacement or append-only logs", async () => {
    const planStore = createPlanStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T14:20:00.000Z"));
    const created = await planStore.createPlan({
      title: "Plan child record semantics",
      sourceTarget: { kind: "workspace", ref: "." },
      progress: [
        {
          timestamp: "2026-03-15T14:20:00.000Z",
          status: "pending",
          text: "Initial progress entry.",
        },
      ],
      discoveries: [{ note: "Old discovery", evidence: "Old evidence" }],
      decisions: [
        {
          decision: "Old decision",
          rationale: "Old rationale",
          date: "2026-03-15",
          author: "ChatGPT",
        },
      ],
    });

    vi.setSystemTime(new Date("2026-03-15T14:25:00.000Z"));
    const updated = await planStore.updatePlan(created.state.planId, {
      progress: [
        {
          timestamp: "2026-03-15T14:25:00.000Z",
          status: "done",
          text: "Replacement progress entry.",
        },
      ],
      discoveries: [{ note: "New discovery", evidence: "New evidence" }],
      decisions: [
        {
          decision: "New decision",
          rationale: "New rationale",
          date: "2026-03-15",
          author: "ChatGPT",
        },
      ],
      revisionNotes: [
        {
          timestamp: "2026-03-15T14:25:00.000Z",
          change: "Recorded a manual note.",
          reason: "Explain the replacement semantics explicitly.",
        },
      ],
    });

    expect(updated.state.progress).toEqual([
      {
        timestamp: "2026-03-15T14:25:00.000Z",
        status: "done",
        text: "Replacement progress entry.",
      },
    ]);
    expect(updated.state.discoveries).toEqual([{ note: "New discovery", evidence: "New evidence" }]);
    expect(updated.state.decisions).toEqual([
      {
        decision: "New decision",
        rationale: "New rationale",
        date: "2026-03-15",
        author: "ChatGPT",
      },
    ]);
    expect(updated.state.revisionNotes).toEqual([
      expect.objectContaining({ change: expect.stringContaining("Created durable workplan scaffold") }),
      {
        timestamp: "2026-03-15T14:25:00.000Z",
        change: "Recorded a manual note.",
        reason: "Explain the replacement semantics explicitly.",
      },
      expect.objectContaining({ change: "Updated progress, surprises and discoveries, decision log, revision notes." }),
    ]);
  }, 30000);

  it("removes deleted tickets from linked plan membership and canonical plan links", async () => {
    const ticketStore = createTicketStore(workspace);
    const planStore = createPlanStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T15:00:00.000Z"));
    const created = await planStore.createPlan({
      title: "Delete linked ticket",
      sourceTarget: { kind: "workspace", ref: "." },
      contextRefs: { ticketIds: [] },
    });
    const ticket = await ticketStore.createTicketAsync({ title: "Plan-linked ticket" });

    await planStore.linkPlanTicket(created.state.planId, {
      ticketId: ticket.summary.id,
      role: "implementation",
      order: 1,
    });
    await planStore.updatePlan(created.state.planId, {
      contextRefs: { replace: { ticketIds: [ticket.summary.id] } },
    });

    await ticketStore.deleteTicketAsync(ticket.summary.id);

    const reread = await planStore.readPlan(created.state.planId);
    expect(reread.state.linkedTickets).toEqual([]);
    expect(reread.state.contextRefs.ticketIds).toEqual([]);

    const { storage, identity } = await openWorkspaceStorage(workspace);
    const planEntity = await findEntityByDisplayId(storage, identity.space.id, "plan", created.state.planId);
    expect(planEntity).toBeTruthy();
    if (!planEntity) {
      throw new Error("Expected plan entity to exist");
    }
    const outgoing = (await storage.listLinks(planEntity.id)).filter((link) => link.fromEntityId === planEntity.id);
    expect(outgoing).toEqual([]);
    expect(reread.state.revisionNotes.at(-1)?.change).toContain(`Removed deleted ticket ${ticket.summary.id}`);
  }, 30000);
});
