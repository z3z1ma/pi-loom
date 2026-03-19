import { describe, expect, it } from "vitest";
import { syncProjectedArtifacts } from "../storage/artifacts.js";
import type { LoomEntityRecord } from "../storage/contract.js";
import { InMemoryLoomCatalog } from "../storage/memory.js";

const timestamp = "2026-03-19T02:00:00.000Z";

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
    createdAt: partial.createdAt ?? timestamp,
    updatedAt: partial.updatedAt ?? timestamp,
  };
}

describe("syncProjectedArtifacts", () => {
  it("upserts projected artifact entities, links them to their owner, and removes stale projections", async () => {
    const storage = new InMemoryLoomCatalog();
    const critique = entity({ id: "crit-1", kind: "critique", displayId: "crit-1", title: "Critique" });
    await storage.upsertEntity(critique);

    await syncProjectedArtifacts({
      storage,
      spaceId: critique.spaceId,
      owningRepositoryId: critique.owningRepositoryId,
      owner: { entityId: critique.id, kind: "critique", displayId: "crit-1" },
      projectionOwner: "critique-findings",
      timestamp,
      desired: [
        {
          artifactType: "critique-finding",
          displayId: "critique:crit-1:finding:finding-001",
          title: "Null pointer not handled",
          summary: "Missing null handling in parser cleanup path.",
          tags: ["high", "open"],
          payload: {
            findingId: "finding-001",
            severity: "high",
            status: "open",
          },
        },
      ],
    });

    const artifacts = await storage.listEntities(critique.spaceId, "artifact");
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({
      displayId: "critique:crit-1:finding:finding-001",
      tags: ["critique-finding", "crit-1", "high", "open"],
      attributes: expect.objectContaining({
        projectionOwner: "critique-findings",
        artifactType: "critique-finding",
        owner: expect.objectContaining({ entityId: critique.id, displayId: "crit-1" }),
        payload: expect.objectContaining({ findingId: "finding-001" }),
      }),
    });
    expect(await storage.listLinks(artifacts[0].id)).toEqual([
      expect.objectContaining({ kind: "belongs_to", toEntityId: critique.id }),
    ]);

    await syncProjectedArtifacts({
      storage,
      spaceId: critique.spaceId,
      owningRepositoryId: critique.owningRepositoryId,
      owner: { entityId: critique.id, kind: "critique", displayId: "crit-1" },
      projectionOwner: "critique-findings",
      timestamp: "2026-03-19T02:05:00.000Z",
      desired: [],
    });

    expect(await storage.listEntities(critique.spaceId, "artifact")).toEqual([]);
    expect(await storage.listLinks(critique.id)).toEqual([]);
  });
});
