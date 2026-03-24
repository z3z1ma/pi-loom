import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConstitutionalStore } from "#constitution/domain/store.js";
import { createDocumentationStore } from "#docs/domain/store.js";
import { createInitiativeStore } from "#initiatives/domain/store.js";
import { createResearchStore } from "#research/domain/store.js";
import { createSpecStore } from "#specs/domain/store.js";
import { createTicketStore } from "#ticketing/domain/store.js";
import { findEntityByDisplayId } from "../entities.js";
import { openWorkspaceStorage } from "../workspace.js";

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
  const summaries = await Promise.all(
    links.map(async (link) => {
      const target = await storage.getEntity(link.toEntityId);
      return {
        kind: link.kind,
        targetKind: target?.kind ?? null,
        targetDisplayId: target?.displayId ?? null,
      } satisfies OutgoingLinkSummary;
    }),
  );
  return summaries.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

describe("context-layer canonical link projection", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "pi-storage-context-links-"));
    process.env.PI_LOOM_ROOT = join(workspace, ".pi-loom-test");
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.PI_LOOM_ROOT;
    rmSync(workspace, { recursive: true, force: true });
  });

  it("projects canonical links for constitution, research, initiatives, specs, and docs", async () => {
    const constitutionStore = createConstitutionalStore(workspace);
    const initiativeStore = createInitiativeStore(workspace);
    const researchStore = createResearchStore(workspace);
    const specStore = createSpecStore(workspace);
    const docsStore = createDocumentationStore(workspace);
    const ticketStore = createTicketStore(workspace);

    vi.setSystemTime(new Date("2026-03-19T02:00:00.000Z"));
    await constitutionStore.initLedger({ title: "Pi Loom" });
    const initiative = await initiativeStore.createInitiative({
      title: "Platform modernization",
      objective: "Coordinate platform changes.",
    });
    const ticket = await ticketStore.createTicketAsync({ title: "Implement migration" });
    const research = await researchStore.createResearch({
      title: "Investigate theme migration",
      initiativeIds: [initiative.state.initiativeId],
      ticketIds: [ticket.summary.id],
      supersedes: ["legacy-theme-research"],
    });
    const spec = await specStore.createChange({
      title: "Add dark mode",
      summary: "Support dark mode.",
      initiativeIds: [initiative.state.initiativeId],
      researchIds: [research.state.researchId],
    });

    await researchStore.linkSpec(research.state.researchId, spec.state.changeId);
    await initiativeStore.setResearchIds(initiative.state.initiativeId, [research.state.researchId]);
    await initiativeStore.linkSpec(initiative.state.initiativeId, spec.state.changeId);
    await initiativeStore.linkTicket(initiative.state.initiativeId, ticket.summary.id);

    await constitutionStore.upsertRoadmapItem({
      title: "Canonical graph rollout",
      initiativeIds: [initiative.state.initiativeId],
      researchIds: [research.state.researchId],
      specChangeIds: [spec.state.changeId],
    });

    await docsStore.createDoc({
      title: "Dark mode architecture",
      docType: "overview",
      summary: "Document the change.",
      sourceTarget: { kind: "spec", ref: spec.state.changeId },
      contextRefs: {
        initiativeIds: [initiative.state.initiativeId],
        researchIds: [research.state.researchId],
        specChangeIds: [spec.state.changeId],
        ticketIds: [ticket.summary.id],
      },
      document: "# Dark mode architecture\n",
    });

    expect(await outgoingLinks(workspace, "constitution", "constitution")).toEqual(
      expect.arrayContaining([
        { kind: "references", targetKind: "initiative", targetDisplayId: initiative.state.initiativeId },
        { kind: "references", targetKind: "research", targetDisplayId: research.state.researchId },
        { kind: "references", targetKind: "spec_change", targetDisplayId: spec.state.changeId },
      ]),
    );

    expect(await outgoingLinks(workspace, "research", research.state.researchId)).toEqual(
      expect.arrayContaining([
        { kind: "references", targetKind: "initiative", targetDisplayId: initiative.state.initiativeId },
        { kind: "references", targetKind: "spec_change", targetDisplayId: spec.state.changeId },
        { kind: "references", targetKind: "ticket", targetDisplayId: ticket.summary.id },
      ]),
    );

    expect(await outgoingLinks(workspace, "initiative", initiative.state.initiativeId)).toEqual(
      expect.arrayContaining([
        { kind: "references", targetKind: "research", targetDisplayId: research.state.researchId },
        { kind: "references", targetKind: "spec_change", targetDisplayId: spec.state.changeId },
        { kind: "references", targetKind: "ticket", targetDisplayId: ticket.summary.id },
      ]),
    );

    expect(await outgoingLinks(workspace, "spec_change", spec.state.changeId)).toEqual(
      expect.arrayContaining([
        { kind: "belongs_to", targetKind: "initiative", targetDisplayId: initiative.state.initiativeId },
        { kind: "references", targetKind: "research", targetDisplayId: research.state.researchId },
      ]),
    );

    expect(await outgoingLinks(workspace, "documentation", "dark-mode-architecture")).toEqual(
      expect.arrayContaining([
        { kind: "documents", targetKind: "spec_change", targetDisplayId: spec.state.changeId },
        { kind: "references", targetKind: "initiative", targetDisplayId: initiative.state.initiativeId },
        { kind: "references", targetKind: "research", targetDisplayId: research.state.researchId },
        { kind: "references", targetKind: "ticket", targetDisplayId: ticket.summary.id },
      ]),
    );
  });
});
