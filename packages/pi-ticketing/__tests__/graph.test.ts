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

  it("rejects dependency cycles and computes ready versus blocked tickets", () => {
    const store = createTicketStore(workspace);

    vi.setSystemTime(new Date("2024-05-01T00:00:00.000Z"));
    const foundation = store.createTicket({ title: "Restore database" });
    vi.setSystemTime(new Date("2024-05-01T00:00:01.000Z"));
    const dependent = store.createTicket({ title: "Re-enable API", deps: [foundation.ticket.frontmatter.id] });
    vi.setSystemTime(new Date("2024-05-01T00:00:02.000Z"));
    store.createTicket({ title: "Update status page" });

    const initialGraph = store.graph();
    expect(initialGraph.ready).toEqual(["t-0001", "t-0003"]);
    expect(initialGraph.blocked).toEqual(["t-0002"]);
    expect(initialGraph.nodes["t-0002"]).toEqual(
      expect.objectContaining({ status: "blocked", blockedBy: ["t-0001"], ready: false }),
    );

    expect(() => store.addDependency(foundation.ticket.frontmatter.id, dependent.ticket.frontmatter.id)).toThrow(
      "Dependency cycle rejected: t-0002 -> t-0001",
    );

    vi.setSystemTime(new Date("2024-05-01T00:00:03.000Z"));
    store.closeTicket(foundation.ticket.frontmatter.id, "Database healthy");
    const resolvedGraph = store.graph();
    expect(resolvedGraph.ready).toEqual(["t-0002", "t-0003"]);
    expect(resolvedGraph.blocked).toEqual([]);
    expect(resolvedGraph.nodes["t-0002"]).toEqual(
      expect.objectContaining({ status: "ready", blockedBy: [], ready: true }),
    );
  });

  it("rejects moving blocked tickets into active statuses that would lie about the dependency graph", () => {
    const store = createTicketStore(workspace);

    vi.setSystemTime(new Date("2024-05-01T01:00:00.000Z"));
    const foundation = store.createTicket({ title: "Restore database" });
    vi.setSystemTime(new Date("2024-05-01T01:00:01.000Z"));
    const dependent = store.createTicket({ title: "Re-enable API", deps: [foundation.ticket.frontmatter.id] });

    expect(() => store.startTicket(dependent.ticket.frontmatter.id)).toThrow(
      "Ticket t-0002 cannot transition to in_progress while blocked by: t-0001",
    );
    expect(() => store.updateTicket(dependent.ticket.frontmatter.id, { status: "review" })).toThrow(
      "Ticket t-0002 cannot transition to review while blocked by: t-0001",
    );

    const graph = store.graph();
    expect(graph.ready).toEqual(["t-0001"]);
    expect(graph.blocked).toEqual(["t-0002"]);
    expect(graph.nodes["t-0002"]).toEqual(
      expect.objectContaining({ status: "blocked", blockedBy: ["t-0001"], ready: false }),
    );
  });

  it("normalizes ticket references from ids, hashes, filenames, and paths", () => {
    const store = createTicketStore(workspace);

    vi.setSystemTime(new Date("2024-05-02T00:00:00.000Z"));
    const created = store.createTicket({ title: "Normalize references" });
    const id = created.ticket.frontmatter.id;
    const fileName = basename(created.ticket.path);
    const openPath = join(workspace, created.ticket.path);

    expect(store.resolveTicketRef(id)).toBe(id);
    expect(store.resolveTicketRef(`#${id}`)).toBe(id);
    expect(store.resolveTicketRef(fileName)).toBe(id);
    expect(store.resolveTicketRef(created.ticket.path)).toBe(id);
    expect(store.resolveTicketRef(relative(workspace, openPath))).toBe(id);

    vi.setSystemTime(new Date("2024-05-02T00:00:01.000Z"));
    const closed = store.closeTicket(id, "Reference path updated after closure");
    expect(closed.ticket.path).toBe(`.loom/tickets/closed/${id}.md`);
    expect(store.resolveTicketRef(closed.ticket.path)).toBe(id);
  });
});
