import { describe, expect, it } from "vitest";
import type { LoomEntityLinkRecord, LoomEntityRecord } from "../contract.js";
import { createLinkId } from "../ids.js";
import { projectedLinkMetadata, syncProjectedEntityLinks } from "../links.js";
import { InMemoryLoomCatalog } from "../memory.js";

const timestamps = {
  createdAt: "2026-03-19T01:10:00.000Z",
  updatedAt: "2026-03-19T01:10:00.000Z",
};

function entity(
  partial: Partial<LoomEntityRecord> & Pick<LoomEntityRecord, "id" | "kind" | "displayId" | "title">,
): LoomEntityRecord {
  return {
    id: partial.id,
    kind: partial.kind,
    spaceId: partial.spaceId ?? "space-1",
    owningRepositoryId: partial.owningRepositoryId ?? "repo-1",
    displayId: partial.displayId,
    title: partial.title,
    summary: partial.summary ?? partial.title,
    status: partial.status ?? "active",
    version: partial.version ?? 1,
    tags: partial.tags ?? [],
    attributes: partial.attributes ?? {},
    createdAt: partial.createdAt ?? timestamps.createdAt,
    updatedAt: partial.updatedAt ?? timestamps.updatedAt,
  };
}

function link(
  record: Partial<LoomEntityLinkRecord> & Pick<LoomEntityLinkRecord, "id" | "kind" | "fromEntityId" | "toEntityId">,
): LoomEntityLinkRecord {
  return {
    id: record.id,
    kind: record.kind,
    fromEntityId: record.fromEntityId,
    toEntityId: record.toEntityId,
    metadata: record.metadata ?? {},
    createdAt: record.createdAt ?? timestamps.createdAt,
    updatedAt: record.updatedAt ?? timestamps.updatedAt,
  };
}

describe("syncProjectedEntityLinks", () => {
  it("upserts desired projected links, removes stale managed links, and preserves unrelated links", async () => {
    const storage = new InMemoryLoomCatalog();
    const plan = entity({ id: "plan-1", kind: "plan", displayId: "plan-1", title: "Plan" });
    const ticketA = entity({ id: "ticket-a", kind: "ticket", displayId: "t-1000", title: "Ticket A" });
    const ticketB = entity({ id: "ticket-b", kind: "ticket", displayId: "t-1001", title: "Ticket B" });
    const ticketC = entity({ id: "ticket-c", kind: "ticket", displayId: "t-1002", title: "Ticket C" });

    await storage.upsertEntity(plan);
    await storage.upsertEntity(ticketA);
    await storage.upsertEntity(ticketB);
    await storage.upsertEntity(ticketC);

    const staleManaged = link({
      id: createLinkId("references", plan.id, ticketA.id),
      kind: "references",
      fromEntityId: plan.id,
      toEntityId: ticketA.id,
      metadata: projectedLinkMetadata("plan-store", { role: "linked-ticket" }),
    });
    const unrelatedProjection = link({
      id: createLinkId("references", plan.id, ticketC.id),
      kind: "references",
      fromEntityId: plan.id,
      toEntityId: ticketC.id,
      metadata: projectedLinkMetadata("other-store", { role: "other" }),
    });
    await storage.upsertLink(staleManaged);
    await storage.upsertLink(unrelatedProjection);

    const result = await syncProjectedEntityLinks({
      storage,
      spaceId: plan.spaceId,
      fromEntityId: plan.id,
      projectionOwner: "plan-store",
      desired: [
        { kind: "references", targetKind: "ticket", targetDisplayId: "t-1001", metadata: { role: "linked-ticket" } },
      ],
      timestamp: "2026-03-19T01:15:00.000Z",
    });

    expect(result.removedIds).toEqual([staleManaged.id]);
    expect(result.skippedTargets).toEqual([]);

    const links = await storage.listLinks(plan.id);
    expect(links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: createLinkId("references", plan.id, ticketB.id),
          metadata: expect.objectContaining({ projectionOwner: "plan-store", role: "linked-ticket" }),
        }),
        expect.objectContaining({
          id: unrelatedProjection.id,
          metadata: expect.objectContaining({ projectionOwner: "other-store" }),
        }),
      ]),
    );
    expect(links).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: staleManaged.id })]));

    const events = await storage.listEvents(plan.id);
    expect(events).toEqual([
      expect.objectContaining({
        kind: "linked",
        actor: "plan-store",
        payload: expect.objectContaining({
          change: "projected_link_added",
          linkKind: "references",
        }),
      }),
      expect.objectContaining({
        kind: "unlinked",
        actor: "plan-store",
        payload: expect.objectContaining({
          change: "projected_link_removed",
          linkId: staleManaged.id,
        }),
      }),
    ]);
  });

  it("skips unresolved targets without failing persistence", async () => {
    const storage = new InMemoryLoomCatalog();
    const critique = entity({ id: "critique-1", kind: "critique", displayId: "crit-1", title: "Critique" });
    await storage.upsertEntity(critique);

    const result = await syncProjectedEntityLinks({
      storage,
      spaceId: critique.spaceId,
      fromEntityId: critique.id,
      projectionOwner: "critique-store",
      desired: [{ kind: "critiques", targetKind: "ticket", targetDisplayId: "missing-ticket", required: false }],
      timestamp: "2026-03-19T01:20:00.000Z",
    });

    expect(result.upserted).toEqual([]);
    expect(result.removedIds).toEqual([]);
    expect(result.skippedTargets).toEqual([{ kind: "ticket", displayId: "missing-ticket" }]);
    expect(await storage.listLinks(critique.id)).toEqual([]);
  });

  it("rejects missing required projected targets", async () => {
    const storage = new InMemoryLoomCatalog();
    const critique = entity({ id: "critique-2", kind: "critique", displayId: "crit-2", title: "Critique" });
    await storage.upsertEntity(critique);

    await expect(
      syncProjectedEntityLinks({
        storage,
        spaceId: critique.spaceId,
        fromEntityId: critique.id,
        projectionOwner: "critique-store",
        desired: [{ kind: "critiques", targetKind: "ticket", targetDisplayId: "missing-ticket" }],
        timestamp: "2026-03-19T01:25:00.000Z",
      }),
    ).rejects.toThrow("Missing projected link targets for critique-store: ticket:missing-ticket");
  });

  it("rejects blank required projected targets", async () => {
    const storage = new InMemoryLoomCatalog();
    const critique = entity({ id: "critique-3", kind: "critique", displayId: "crit-3", title: "Critique" });
    await storage.upsertEntity(critique);

    await expect(
      syncProjectedEntityLinks({
        storage,
        spaceId: critique.spaceId,
        fromEntityId: critique.id,
        projectionOwner: "critique-store",
        desired: [{ kind: "critiques", targetKind: "ticket", targetDisplayId: "   " }],
        timestamp: "2026-03-19T01:30:00.000Z",
      }),
    ).rejects.toThrow("Missing projected link targets for critique-store: ticket:(empty)");
  });
});
