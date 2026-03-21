import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCritiqueStore } from "@pi-loom/pi-critique/extensions/domain/store.js";
import { createDocumentationStore } from "@pi-loom/pi-docs/extensions/domain/store.js";
import { createInitiativeStore } from "@pi-loom/pi-initiatives/extensions/domain/store.js";
import { createPlanStore } from "@pi-loom/pi-plans/extensions/domain/store.js";
import { createRalphStore } from "@pi-loom/pi-ralph-wiggum/extensions/domain/store.js";
import { createResearchStore } from "@pi-loom/pi-research/extensions/domain/store.js";
import { createSpecStore } from "@pi-loom/pi-specs/extensions/domain/store.js";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findEntityByDisplayId } from "../storage/entities.js";
import { openWorkspaceStorage } from "../storage/workspace.js";

interface OutgoingLinkSummary {
  kind: string;
  targetKind: string | null;
  targetDisplayId: string | null;
}

async function outgoingLinks(cwd: string, kind: string, displayId: string): Promise<OutgoingLinkSummary[]> {
  const { storage, identity } = await openWorkspaceStorage(cwd);
  const entity = await findEntityByDisplayId(storage, identity.space.id, kind as never, displayId);
  if (!entity) {
    throw new Error(`Expected ${kind}:${displayId} entity to exist`);
  }
  const links = (await storage.listLinks(entity.id)).filter((link) => link.fromEntityId === entity.id);
  return Promise.all(
    links.map(async (link) => {
      const target = await storage.getEntity(link.toEntityId);
      return {
        kind: link.kind,
        targetKind: target?.kind ?? null,
        targetDisplayId: target?.displayId ?? null,
      } satisfies OutgoingLinkSummary;
    }),
  );
}

describe("execution-layer canonical link projection", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "pi-storage-execution-links-"));
    process.env.PI_LOOM_ROOT = join(workspace, ".pi-loom-test");
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.PI_LOOM_ROOT;
    rmSync(workspace, { recursive: true, force: true });
  });

  it("projects canonical links for plans, tickets, critique, and Ralph and fixes stale plan refs", async () => {
    const initiativeStore = createInitiativeStore(workspace);
    const researchStore = createResearchStore(workspace);
    const specStore = createSpecStore(workspace);
    const docsStore = createDocumentationStore(workspace);
    const ticketStore = createTicketStore(workspace);
    const planStore = createPlanStore(workspace);
    const critiqueStore = createCritiqueStore(workspace);
    const ralphStore = createRalphStore(workspace);

    vi.setSystemTime(new Date("2026-03-19T03:00:00.000Z"));
    const initiative = await initiativeStore.createInitiative({ title: "Execution graph" });
    const research = await researchStore.createResearch({ title: "Execution graph research" });
    const spec = await specStore.createChange({ title: "Execution graph spec", summary: "Support graph projection." });
    const doc = await docsStore.createDoc({
      title: "Execution graph overview",
      docType: "overview",
      sourceTarget: { kind: "spec", ref: spec.state.changeId },
      document: "# Execution graph\n",
    });

    const foundation = await ticketStore.createTicketAsync({
      title: "Foundation ticket",
      initiativeIds: [initiative.state.initiativeId],
      researchIds: [research.state.researchId],
    });
    const dependent = await ticketStore.createTicketAsync({
      title: "Dependent ticket",
      deps: [foundation.summary.id],
      initiativeIds: [initiative.state.initiativeId],
      researchIds: [research.state.researchId],
      parent: foundation.summary.id,
    });

    const plan = await planStore.createPlan({
      title: "Execution graph rollout",
      summary: "Coordinate the execution-layer cutover.",
      sourceTarget: { kind: "spec", ref: spec.state.changeId },
      contextRefs: {
        initiativeIds: [initiative.state.initiativeId],
        researchIds: [research.state.researchId],
        specChangeIds: [spec.state.changeId],
        ticketIds: [foundation.summary.id],
        docIds: [doc.state.docId],
      },
    });
    await planStore.linkPlanTicket(plan.state.planId, {
      ticketId: foundation.summary.id,
      role: "implementation",
      order: 1,
    });
    const linkedTicket = await ticketStore.readTicketAsync(foundation.summary.id);
    expect(linkedTicket.ticket.frontmatter["external-refs"]).toContain(`plan:${plan.state.planId}`);
    await planStore.unlinkPlanTicket(plan.state.planId, foundation.summary.id);
    const unlinkedTicket = await ticketStore.readTicketAsync(foundation.summary.id);
    expect(unlinkedTicket.ticket.frontmatter["external-refs"]).not.toContain(`plan:${plan.state.planId}`);
    expect(await outgoingLinks(workspace, "ticket", foundation.summary.id)).not.toEqual(
      expect.arrayContaining([{ kind: "belongs_to", targetKind: "plan", targetDisplayId: plan.state.planId }]),
    );
    await planStore.linkPlanTicket(plan.state.planId, {
      ticketId: foundation.summary.id,
      role: "implementation",
      order: 1,
    });

    const critique = await critiqueStore.createCritiqueAsync({
      title: "Review execution graph",
      target: { kind: "ticket", ref: foundation.summary.id, locator: null },
      contextRefs: {
        initiativeIds: [initiative.state.initiativeId],
        researchIds: [research.state.researchId],
        specChangeIds: [spec.state.changeId],
        ticketIds: [dependent.summary.id],
      },
    });
    await critiqueStore.recordRunAsync(critique.state.critiqueId, {
      kind: "architecture",
      summary: "Add follow-up work",
      verdict: "concerns",
      followupTicketIds: [dependent.summary.id],
    });

    const ralph = ralphStore.createRun({
      title: "Execution graph run",
      linkedRefs: {
        initiativeIds: [initiative.state.initiativeId],
        researchIds: [research.state.researchId],
        specChangeIds: [spec.state.changeId],
        ticketIds: [foundation.summary.id],
        critiqueIds: [critique.state.critiqueId],
        docIds: [doc.state.docId],
        planIds: [plan.state.planId],
      },
    });

    expect(await outgoingLinks(workspace, "plan", plan.state.planId)).toEqual(
      expect.arrayContaining([
        { kind: "belongs_to", targetKind: "spec_change", targetDisplayId: spec.state.changeId },
        { kind: "belongs_to", targetKind: "ticket", targetDisplayId: foundation.summary.id },
        { kind: "references", targetKind: "initiative", targetDisplayId: initiative.state.initiativeId },
        { kind: "references", targetKind: "research", targetDisplayId: research.state.researchId },
        { kind: "references", targetKind: "documentation", targetDisplayId: doc.state.docId },
      ]),
    );

    expect(await outgoingLinks(workspace, "ticket", dependent.summary.id)).toEqual(
      expect.arrayContaining([
        { kind: "depends_on", targetKind: "ticket", targetDisplayId: foundation.summary.id },
        { kind: "belongs_to", targetKind: "initiative", targetDisplayId: initiative.state.initiativeId },
        { kind: "belongs_to", targetKind: "ticket", targetDisplayId: foundation.summary.id },
        { kind: "references", targetKind: "research", targetDisplayId: research.state.researchId },
      ]),
    );

    await vi.waitFor(async () => {
      expect(await outgoingLinks(workspace, "critique", critique.state.critiqueId)).toEqual(
        expect.arrayContaining([
          { kind: "critiques", targetKind: "ticket", targetDisplayId: foundation.summary.id },
          { kind: "references", targetKind: "initiative", targetDisplayId: initiative.state.initiativeId },
          { kind: "references", targetKind: "research", targetDisplayId: research.state.researchId },
          { kind: "references", targetKind: "spec_change", targetDisplayId: spec.state.changeId },
          { kind: "references", targetKind: "ticket", targetDisplayId: dependent.summary.id },
        ]),
      );
    });

    await vi.waitFor(async () => {
      expect(await outgoingLinks(workspace, "ralph_run", ralph.state.runId)).toEqual(
        expect.arrayContaining([
          { kind: "references", targetKind: "initiative", targetDisplayId: initiative.state.initiativeId },
          { kind: "references", targetKind: "research", targetDisplayId: research.state.researchId },
          { kind: "references", targetKind: "spec_change", targetDisplayId: spec.state.changeId },
          { kind: "references", targetKind: "ticket", targetDisplayId: foundation.summary.id },
          { kind: "references", targetKind: "documentation", targetDisplayId: doc.state.docId },
          { kind: "references", targetKind: "plan", targetDisplayId: plan.state.planId },
          { kind: "critiques", targetKind: "critique", targetDisplayId: critique.state.critiqueId },
        ]),
      );
    });
  }, 30000);
});
