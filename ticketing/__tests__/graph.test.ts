import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildTicketGraph, ticketGraphNodeKey, ticketGraphQualifiedId } from "../domain/graph.js";
import { createTicketStore } from "../domain/store.js";
import type { TicketSummary } from "../domain/models.js";

describe("ticket dependency graph", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "pi-ticketing-graph-"));
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(workspace, { recursive: true, force: true });
  });

  it("rejects dependency cycles and computes ready versus blocked tickets from canonical storage", async () => {
    const store = createTicketStore(workspace);

    vi.setSystemTime(new Date("2024-05-01T00:00:00.000Z"));
    const foundation = await store.createTicketAsync({ title: "Restore database" });
    vi.setSystemTime(new Date("2024-05-01T00:00:01.000Z"));
    const dependent = await store.createTicketAsync({ title: "Re-enable API", deps: [foundation.summary.id] });
    vi.setSystemTime(new Date("2024-05-01T00:00:02.000Z"));
    const statusPage = await store.createTicketAsync({ title: "Update status page" });

    const initialGraph = await createTicketStore(workspace).graphAsync();
    expect(initialGraph.ready.map((ref) => ref.id)).toEqual([foundation.summary.id, statusPage.summary.id]);
    expect(initialGraph.blocked.map((ref) => ref.id)).toEqual([dependent.summary.id]);
    expect(initialGraph.nodes[ticketGraphNodeKey(dependent.summary)]).toEqual(
      expect.objectContaining({
        key: ticketGraphNodeKey(dependent.summary),
        qualifiedId: ticketGraphQualifiedId(dependent.summary),
        status: "blocked",
        blockedBy: [
          expect.objectContaining({ key: ticketGraphNodeKey(foundation.summary), id: foundation.summary.id }),
        ],
        ready: false,
      }),
    );

    await expect(store.addDependencyAsync(foundation.summary.id, dependent.summary.id)).rejects.toThrow(
      "Dependency cycle rejected: t-0002 -> t-0001",
    );

    vi.setSystemTime(new Date("2024-05-01T00:00:03.000Z"));
    await store.closeTicketAsync(foundation.summary.id, "Database healthy");
    const resolvedGraph = await createTicketStore(workspace).graphAsync();
    expect(resolvedGraph.ready.map((ref) => ref.id)).toEqual([dependent.summary.id, statusPage.summary.id]);
    expect(resolvedGraph.blocked).toEqual([]);
    expect(resolvedGraph.nodes[ticketGraphNodeKey(dependent.summary)]).toEqual(
      expect.objectContaining({ status: "ready", blockedBy: [], ready: true }),
    );
  }, 30000);

  it("rejects moving blocked tickets into active statuses that would lie about the dependency graph", async () => {
    const store = createTicketStore(workspace);

    vi.setSystemTime(new Date("2024-05-01T01:00:00.000Z"));
    const foundation = await store.createTicketAsync({ title: "Restore database" });
    vi.setSystemTime(new Date("2024-05-01T01:00:01.000Z"));
    const dependent = await store.createTicketAsync({ title: "Re-enable API", deps: [foundation.summary.id] });

    await expect(store.startTicketAsync(dependent.summary.id)).rejects.toThrow(
      "Ticket t-0002 cannot transition to in_progress while blocked by: t-0001",
    );
    await expect(store.updateTicketAsync(dependent.summary.id, { status: "review" })).rejects.toThrow(
      "Ticket t-0002 cannot transition to review while blocked by: t-0001",
    );

    const graph = await createTicketStore(workspace).graphAsync();
    expect(graph.ready.map((ref) => ref.id)).toEqual([foundation.summary.id]);
    expect(graph.blocked.map((ref) => ref.id)).toEqual([dependent.summary.id]);
    expect(graph.nodes[ticketGraphNodeKey(dependent.summary)]).toEqual(
      expect.objectContaining({
        status: "blocked",
        blockedBy: [expect.objectContaining({ id: foundation.summary.id })],
        ready: false,
      }),
    );
  }, 30000);

  it("preserves repository-qualified graph identities when duplicate ids exist across repositories", () => {
    const repoA = { id: "repo-a", slug: "service-a", displayName: "Service A" };
    const repoB = { id: "repo-b", slug: "service-b", displayName: "Service B" };
    const ticketA = buildSummary({ id: "pl-0001", title: "Service A work", repository: repoA });
    const ticketB = buildSummary({
      id: "pl-0001",
      title: "Service B work",
      repository: repoB,
      createdAt: "2024-05-03T00:00:01.000Z",
      updatedAt: "2024-05-03T00:00:01.000Z",
    });

    const graph = buildTicketGraph([ticketA, ticketB]);

    expect(Object.keys(graph.nodes)).toEqual([ticketGraphNodeKey(ticketA), ticketGraphNodeKey(ticketB)]);
    expect(graph.lookup.byTicketId).toEqual({});
    expect(graph.lookup.ambiguousIds).toEqual(["pl-0001"]);
    expect(graph.ready.map((ref) => ref.qualifiedId)).toEqual([
      ticketGraphQualifiedId(ticketA),
      ticketGraphQualifiedId(ticketB),
    ]);
  });

  it("fails closed when duplicate ids make dependency resolution ambiguous across repositories", () => {
    const repoA = { id: "repo-a", slug: "service-a", displayName: "Service A" };
    const repoB = { id: "repo-b", slug: "service-b", displayName: "Service B" };

    expect(() =>
      buildTicketGraph([
        buildSummary({ id: "pl-0001", title: "Service A blocker", repository: repoA }),
        buildSummary({
          id: "pl-0001",
          title: "Service B blocker",
          repository: repoB,
          createdAt: "2024-05-04T00:00:01.000Z",
          updatedAt: "2024-05-04T00:00:01.000Z",
        }),
        buildSummary({
          id: "pl-0002",
          title: "Consumer",
          repository: repoA,
          deps: ["pl-0001"],
          createdAt: "2024-05-04T00:00:02.000Z",
          updatedAt: "2024-05-04T00:00:02.000Z",
        }),
      ]),
    ).toThrow(
      "Cannot build ticket graph: service-a:pl-0002 has ambiguous dependency pl-0001; matches service-a:pl-0001, service-b:pl-0001.",
    );
  });

  it("normalizes ticket references from ids, hashes, and canonical refs", async () => {
    const store = createTicketStore(workspace);

    vi.setSystemTime(new Date("2024-05-02T00:00:00.000Z"));
    const created = await store.createTicketAsync({ title: "Normalize references" });
    const id = created.summary.id;

    expect(store.resolveTicketRef(id)).toBe(id);
    expect(store.resolveTicketRef(created.ticket.ref)).toBe(id);

    vi.setSystemTime(new Date("2024-05-02T00:00:01.000Z"));
    const closed = await store.closeTicketAsync(id, "Reference ref stays stable after closure");
    expect(closed.ticket.ref).toBe(`ticket:${id}`);
    expect(store.resolveTicketRef(closed.ticket.ref)).toBe(id);
  }, 30000);
});

function buildSummary(overrides: Partial<TicketSummary> & Pick<TicketSummary, "id" | "title">): TicketSummary {
  return {
    id: overrides.id,
    title: overrides.title,
    status: overrides.status ?? "ready",
    repository: overrides.repository ?? null,
    storedStatus: overrides.storedStatus ?? "open",
    priority: overrides.priority ?? "medium",
    type: overrides.type ?? "task",
    createdAt: overrides.createdAt ?? "2024-05-03T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2024-05-03T00:00:00.000Z",
    deps: overrides.deps ?? [],
    links: overrides.links ?? [],
    initiativeIds: overrides.initiativeIds ?? [],
    researchIds: overrides.researchIds ?? [],
    tags: overrides.tags ?? [],
    parent: overrides.parent ?? null,
    closed: overrides.closed ?? false,
    archived: overrides.archived ?? false,
    archivedAt: overrides.archivedAt ?? null,
    ref: overrides.ref ?? `ticket:${overrides.id}`,
  };
}
