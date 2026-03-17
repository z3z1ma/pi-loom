import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTicketStore } from "../extensions/domain/store.js";

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
    await store.createTicketAsync({ title: "Update status page" });

    const initialGraph = await createTicketStore(workspace).graphAsync();
    expect(initialGraph.ready).toEqual(["t-0001", "t-0003"]);
    expect(initialGraph.blocked).toEqual(["t-0002"]);
    expect(initialGraph.nodes["t-0002"]).toEqual(
      expect.objectContaining({ status: "blocked", blockedBy: ["t-0001"], ready: false }),
    );

    await expect(store.addDependencyAsync(foundation.summary.id, dependent.summary.id)).rejects.toThrow(
      "Dependency cycle rejected: t-0002 -> t-0001",
    );

    vi.setSystemTime(new Date("2024-05-01T00:00:03.000Z"));
    await store.closeTicketAsync(foundation.summary.id, "Database healthy");
    const resolvedGraph = await createTicketStore(workspace).graphAsync();
    expect(resolvedGraph.ready).toEqual(["t-0002", "t-0003"]);
    expect(resolvedGraph.blocked).toEqual([]);
    expect(resolvedGraph.nodes["t-0002"]).toEqual(
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
    expect(graph.ready).toEqual(["t-0001"]);
    expect(graph.blocked).toEqual(["t-0002"]);
    expect(graph.nodes["t-0002"]).toEqual(
      expect.objectContaining({ status: "blocked", blockedBy: ["t-0001"], ready: false }),
    );
  }, 30000);

  it("normalizes ticket references from ids, hashes, filenames, and paths", async () => {
    const store = createTicketStore(workspace);

    vi.setSystemTime(new Date("2024-05-02T00:00:00.000Z"));
    const created = await store.createTicketAsync({ title: "Normalize references" });
    const id = created.summary.id;
    const fileName = basename(created.ticket.path);
    const openPath = join(workspace, created.ticket.path);

    expect(store.resolveTicketRef(id)).toBe(id);
    expect(store.resolveTicketRef(`#${id}`)).toBe(id);
    expect(store.resolveTicketRef(fileName)).toBe(id);
    expect(store.resolveTicketRef(created.ticket.path)).toBe(id);
    expect(store.resolveTicketRef(relative(workspace, openPath))).toBe(id);

    vi.setSystemTime(new Date("2024-05-02T00:00:01.000Z"));
    const closed = await store.closeTicketAsync(id, "Reference path updated after closure");
    expect(closed.ticket.path).toBe(`.loom/tickets/closed/${id}.md`);
    expect(store.resolveTicketRef(closed.ticket.path)).toBe(id);
  }, 30000);
});
