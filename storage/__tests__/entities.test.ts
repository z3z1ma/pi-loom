import { describe, expect, it } from "vitest";
import { upsertEntityByDisplayIdWithLifecycleEvents } from "../entities.js";
import { InMemoryLoomCatalog } from "../memory.js";

describe("upsertEntityByDisplayIdWithLifecycleEvents", () => {
  it("emits created, updated, and status_changed events with monotonic sequences", async () => {
    const storage = new InMemoryLoomCatalog();
    const base = {
      kind: "ticket" as const,
      spaceId: "space-1",
      owningRepositoryId: "repo-1",
      displayId: "t-1000",
      title: "Lifecycle test",
      summary: "summary",
      tags: ["test"],
      createdAt: "2026-03-19T02:20:00.000Z",
      updatedAt: "2026-03-19T02:20:00.000Z",
    };

    const created = await upsertEntityByDisplayIdWithLifecycleEvents(
      storage,
      {
        ...base,
        status: "open",
        version: 1,
        attributes: { state: "created" },
      },
      {
        actor: "ticket-store",
        createdPayload: { change: "ticket_created" },
        updatedPayload: { change: "ticket_updated" },
      },
    );

    const updated = await upsertEntityByDisplayIdWithLifecycleEvents(
      storage,
      {
        ...base,
        status: "in_progress",
        version: 2,
        updatedAt: "2026-03-19T02:21:00.000Z",
        attributes: { state: "updated" },
      },
      {
        actor: "ticket-store",
        createdPayload: { change: "ticket_created" },
        updatedPayload: { change: "ticket_updated" },
      },
    );

    expect(created.previous).toBeNull();
    expect(updated.previous).toMatchObject({ status: "open", version: 1 });
    expect(await storage.listEvents(updated.entity.id)).toEqual([
      expect.objectContaining({
        kind: "created",
        sequence: 1,
        payload: expect.objectContaining({ change: "ticket_created" }),
      }),
      expect.objectContaining({
        kind: "status_changed",
        sequence: 2,
        payload: expect.objectContaining({ previousStatus: "open", nextStatus: "in_progress" }),
      }),
      expect.objectContaining({
        kind: "updated",
        sequence: 3,
        payload: expect.objectContaining({ change: "ticket_updated", previousVersion: 1 }),
      }),
    ]);
  });
});
