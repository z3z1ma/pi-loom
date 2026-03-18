import type { TicketGraphNode, TicketGraphResult, TicketRecord, TicketStatus, TicketSummary } from "./models.js";

function ticketMap(tickets: TicketSummary[]): Map<string, TicketSummary> {
  return new Map(tickets.map((ticket) => [ticket.id, ticket]));
}

export function computeEffectiveStatus(ticket: TicketSummary, tickets: Map<string, TicketSummary>): TicketStatus {
  if (ticket.closed || ticket.storedStatus === "closed") {
    return "closed";
  }
  if (ticket.storedStatus === "in_progress" || ticket.storedStatus === "review") {
    return ticket.storedStatus;
  }
  const blockers = ticket.deps.filter((depId) => {
    const dependency = tickets.get(depId);
    return dependency !== undefined && computeEffectiveStatus(dependency, tickets) !== "closed";
  });
  return blockers.length > 0 ? "blocked" : "ready";
}

export function findDependencyCycle(tickets: TicketSummary[], sourceId: string, depId: string): string[] | null {
  if (sourceId === depId) {
    return [sourceId, depId];
  }
  const ticketsById = ticketMap(tickets);
  const visited = new Set<string>();
  const stack: string[] = [];

  function walk(currentId: string): string[] | null {
    if (currentId === sourceId) {
      return [...stack, currentId];
    }
    if (visited.has(currentId)) {
      return null;
    }
    visited.add(currentId);
    const current = ticketsById.get(currentId);
    if (!current) {
      return null;
    }
    stack.push(currentId);
    for (const nextId of current.deps) {
      const cycle = walk(nextId);
      if (cycle) {
        return cycle;
      }
    }
    stack.pop();
    return null;
  }

  return walk(depId);
}

export function buildTicketGraph(tickets: TicketSummary[]): TicketGraphResult {
  const ticketsById = ticketMap(tickets);
  const childrenByParent = new Map<string, string[]>();
  for (const ticket of tickets) {
    if (!ticket.parent) {
      continue;
    }
    const children = childrenByParent.get(ticket.parent) ?? [];
    children.push(ticket.id);
    childrenByParent.set(ticket.parent, children);
  }

  const nodes: Record<string, TicketGraphNode> = {};
  const ready: string[] = [];
  const blocked: string[] = [];
  const cycles: string[][] = [];

  for (const ticket of tickets) {
    const status = computeEffectiveStatus(ticket, ticketsById);
    const blockedBy = ticket.deps.filter((depId) => {
      const dep = ticketsById.get(depId);
      return dep !== undefined && computeEffectiveStatus(dep, ticketsById) !== "closed";
    });
    const children = [...(childrenByParent.get(ticket.id) ?? [])].sort((left, right) => left.localeCompare(right));
    nodes[ticket.id] = {
      id: ticket.id,
      status,
      deps: [...ticket.deps],
      children,
      links: [...ticket.links],
      parent: ticket.parent,
      blockedBy,
      ready: status === "ready",
    };
    if (status === "ready") {
      ready.push(ticket.id);
    }
    if (status === "blocked") {
      blocked.push(ticket.id);
    }
    for (const depId of ticket.deps) {
      const cycle = findDependencyCycle(tickets, ticket.id, depId);
      if (cycle) {
        cycles.push(cycle);
      }
    }
  }

  ready.sort((left, right) => left.localeCompare(right));
  blocked.sort((left, right) => left.localeCompare(right));
  return { nodes, ready, blocked, cycles };
}

export function summarizeTicket(record: TicketRecord, effectiveStatus: TicketStatus): TicketSummary {
  return {
    id: record.frontmatter.id,
    title: record.frontmatter.title,
    status: effectiveStatus,
    storedStatus: record.frontmatter.status,
    priority: record.frontmatter.priority,
    type: record.frontmatter.type,
    createdAt: record.frontmatter["created-at"],
    updatedAt: record.frontmatter["updated-at"],
    deps: [...record.frontmatter.deps],
    links: [...record.frontmatter.links],
    initiativeIds: [...record.frontmatter["initiative-ids"]],
    researchIds: [...record.frontmatter["research-ids"]],
    specChange: record.frontmatter["spec-change"],
    specCapabilities: [...record.frontmatter["spec-capabilities"]],
    specRequirements: [...record.frontmatter["spec-requirements"]],
    tags: [...record.frontmatter.tags],
    parent: record.frontmatter.parent,
    closed: record.closed,
    ref: record.ref,
  };
}
