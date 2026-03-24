import type {
  TicketGraphNode,
  TicketGraphRef,
  TicketGraphResult,
  TicketRecord,
  TicketStatus,
  TicketSummary,
} from "./models.js";

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

export function ticketGraphNodeKey(ticket: Pick<TicketSummary, "id" | "repository">): string {
  return ticket.repository?.id ? `${ticket.repository.id}:${ticket.id}` : ticket.id;
}

export function ticketGraphQualifiedId(ticket: Pick<TicketSummary, "id" | "repository">): string {
  return ticket.repository?.slug ? `${ticket.repository.slug}:${ticket.id}` : ticket.id;
}

function toGraphRef(ticket: Pick<TicketSummary, "id" | "repository">): TicketGraphRef {
  return {
    key: ticketGraphNodeKey(ticket),
    id: ticket.id,
    qualifiedId: ticketGraphQualifiedId(ticket),
    repository: ticket.repository,
  };
}

function sortGraphRefs(refs: TicketGraphRef[]): TicketGraphRef[] {
  return [...refs].sort(
    (left, right) => left.qualifiedId.localeCompare(right.qualifiedId) || left.key.localeCompare(right.key),
  );
}

function groupTicketsById(tickets: TicketSummary[]): Map<string, TicketSummary[]> {
  const grouped = new Map<string, TicketSummary[]>();
  for (const ticket of tickets) {
    const entries = grouped.get(ticket.id) ?? [];
    entries.push(ticket);
    grouped.set(ticket.id, entries);
  }
  return grouped;
}

function ensureDuplicatedTicketsRemainQualified(duplicates: TicketSummary[]): void {
  const seenRepositoryIds = new Set<string>();
  for (const ticket of duplicates) {
    const repositoryId = ticket.repository?.id;
    if (!repositoryId) {
      throw new Error(
        `Cannot build ticket graph: duplicate ticket id ${ticket.id} is missing repository qualification.`,
      );
    }
    if (seenRepositoryIds.has(repositoryId)) {
      throw new Error(`Cannot build ticket graph: duplicate ticket id ${ticket.id} reuses repository ${repositoryId}.`);
    }
    seenRepositoryIds.add(repositoryId);
  }
}

function listDuplicateMatches(duplicates: TicketSummary[]): string {
  return sortGraphRefs(duplicates.map((ticket) => toGraphRef(ticket)))
    .map((ref) => ref.qualifiedId)
    .join(", ");
}

function resolveTargetKey(
  targetId: string,
  sourceRef: TicketGraphRef,
  relationLabel: string,
  ticketsById: Map<string, TicketSummary[]>,
  uniqueKeyById: Map<string, string>,
): string | null {
  const uniqueKey = uniqueKeyById.get(targetId);
  if (uniqueKey) {
    return uniqueKey;
  }
  const matches = ticketsById.get(targetId) ?? [];
  if (matches.length === 0) {
    return null;
  }
  throw new Error(
    `Cannot build ticket graph: ${sourceRef.qualifiedId} has ambiguous ${relationLabel} ${targetId}; matches ${listDuplicateMatches(matches)}.`,
  );
}

function findDependencyCycleByKey(
  dependencyKeysByNodeKey: Map<string, string[]>,
  sourceKey: string,
  dependencyKey: string,
): string[] | null {
  if (sourceKey === dependencyKey) {
    return [sourceKey, dependencyKey];
  }
  const visited = new Set<string>();
  const stack: string[] = [];

  function walk(currentKey: string): string[] | null {
    if (currentKey === sourceKey) {
      return [...stack, currentKey];
    }
    if (visited.has(currentKey)) {
      return null;
    }
    visited.add(currentKey);
    const nextKeys = dependencyKeysByNodeKey.get(currentKey);
    if (!nextKeys) {
      return null;
    }
    stack.push(currentKey);
    for (const nextKey of nextKeys) {
      const cycle = walk(nextKey);
      if (cycle) {
        return cycle;
      }
    }
    stack.pop();
    return null;
  }

  return walk(dependencyKey);
}

export function resolveTicketGraphNodeKey(
  graph: TicketGraphResult,
  ticketId: string,
  repositoryId?: string | null,
): string | null {
  if (repositoryId) {
    const scopedKey = `${repositoryId}:${ticketId}`;
    return graph.nodes[scopedKey] ? scopedKey : null;
  }
  return graph.lookup.byTicketId[ticketId] ?? null;
}

export function getTicketGraphNodeForSummary(
  graph: TicketGraphResult,
  summary: Pick<TicketSummary, "id" | "repository">,
): TicketGraphNode | null {
  return graph.nodes[ticketGraphNodeKey(summary)] ?? null;
}

export function listTicketGraphNodesById(graph: TicketGraphResult, ticketId: string): TicketGraphNode[] {
  return Object.values(graph.nodes)
    .filter((node) => node.id === ticketId)
    .sort((left, right) => left.qualifiedId.localeCompare(right.qualifiedId) || left.key.localeCompare(right.key));
}

export function buildTicketGraph(tickets: TicketSummary[]): TicketGraphResult {
  const ticketsById = groupTicketsById(tickets);
  const ticketsByKey = new Map<string, TicketSummary>();
  const refsByKey = new Map<string, TicketGraphRef>();
  const uniqueKeyById = new Map<string, string>();
  const ambiguousIds: string[] = [];

  for (const [ticketId, matches] of ticketsById.entries()) {
    if (matches.length > 1) {
      ensureDuplicatedTicketsRemainQualified(matches);
      ambiguousIds.push(ticketId);
    }
    for (const ticket of matches) {
      const ref = toGraphRef(ticket);
      if (refsByKey.has(ref.key)) {
        throw new Error(`Cannot build ticket graph: duplicate graph node key ${ref.key}.`);
      }
      refsByKey.set(ref.key, ref);
      ticketsByKey.set(ref.key, ticket);
    }
    if (matches.length === 1) {
      uniqueKeyById.set(ticketId, ticketGraphNodeKey(matches[0]));
    }
  }

  const dependencyKeysByNodeKey = new Map<string, string[]>();
  const parentKeyByNodeKey = new Map<string, string | null>();
  const childrenByParentKey = new Map<string, string[]>();

  for (const ticket of tickets) {
    const sourceRef = toGraphRef(ticket);
    const dependencyKeys = [
      ...new Set(
        ticket.deps
          .map((depId) => resolveTargetKey(depId, sourceRef, "dependency", ticketsById, uniqueKeyById))
          .filter((key): key is string => Boolean(key)),
      ),
    ];
    dependencyKeysByNodeKey.set(sourceRef.key, dependencyKeys);

    const parentKey = ticket.parent
      ? resolveTargetKey(ticket.parent, sourceRef, "parent", ticketsById, uniqueKeyById)
      : null;
    parentKeyByNodeKey.set(sourceRef.key, parentKey);
    if (parentKey) {
      const children = childrenByParentKey.get(parentKey) ?? [];
      children.push(sourceRef.key);
      childrenByParentKey.set(parentKey, children);
    }
  }

  const statusMemo = new Map<string, TicketStatus>();
  function computeEffectiveStatusByKey(nodeKey: string, visiting = new Set<string>()): TicketStatus {
    const memoized = statusMemo.get(nodeKey);
    if (memoized) {
      return memoized;
    }
    if (visiting.has(nodeKey)) {
      return "blocked";
    }
    const ticket = ticketsByKey.get(nodeKey);
    if (!ticket) {
      throw new Error(`Cannot build ticket graph: missing ticket for node ${nodeKey}.`);
    }
    if (ticket.closed || ticket.storedStatus === "closed") {
      statusMemo.set(nodeKey, "closed");
      return "closed";
    }
    if (ticket.storedStatus === "in_progress" || ticket.storedStatus === "review") {
      statusMemo.set(nodeKey, ticket.storedStatus);
      return ticket.storedStatus;
    }

    const nextVisiting = new Set(visiting);
    nextVisiting.add(nodeKey);
    const blockers = (dependencyKeysByNodeKey.get(nodeKey) ?? []).filter(
      (dependencyKey) => computeEffectiveStatusByKey(dependencyKey, nextVisiting) !== "closed",
    );
    const status: TicketStatus = blockers.length > 0 ? "blocked" : "ready";
    statusMemo.set(nodeKey, status);
    return status;
  }

  const nodes: Record<string, TicketGraphNode> = {};
  const ready: TicketGraphRef[] = [];
  const blocked: TicketGraphRef[] = [];
  const cycles: TicketGraphRef[][] = [];

  for (const ticket of tickets) {
    const ref = toGraphRef(ticket);
    const status = computeEffectiveStatusByKey(ref.key);
    const dependencyKeys = dependencyKeysByNodeKey.get(ref.key) ?? [];
    const blockedByKeys = dependencyKeys.filter(
      (dependencyKey) => computeEffectiveStatusByKey(dependencyKey) !== "closed",
    );
    const childKeys = [...(childrenByParentKey.get(ref.key) ?? [])];
    childKeys.sort((left, right) => {
      const leftRef = refsByKey.get(left);
      const rightRef = refsByKey.get(right);
      return (leftRef?.qualifiedId ?? left).localeCompare(rightRef?.qualifiedId ?? right);
    });

    const node: TicketGraphNode = {
      ...ref,
      status,
      deps: sortGraphRefs(
        dependencyKeys.map((key) => refsByKey.get(key)).filter((value): value is TicketGraphRef => Boolean(value)),
      ),
      children: sortGraphRefs(
        childKeys.map((key) => refsByKey.get(key)).filter((value): value is TicketGraphRef => Boolean(value)),
      ),
      links: [...ticket.links],
      parent: (() => {
        const parentKey = parentKeyByNodeKey.get(ref.key);
        return parentKey ? (refsByKey.get(parentKey) ?? null) : null;
      })(),
      blockedBy: sortGraphRefs(
        blockedByKeys.map((key) => refsByKey.get(key)).filter((value): value is TicketGraphRef => Boolean(value)),
      ),
      ready: status === "ready",
    };
    nodes[ref.key] = node;
    if (status === "ready") {
      ready.push(ref);
    }
    if (status === "blocked") {
      blocked.push(ref);
    }
    for (const dependencyKey of dependencyKeys) {
      const cycle = findDependencyCycleByKey(dependencyKeysByNodeKey, ref.key, dependencyKey);
      if (cycle) {
        cycles.push(cycle.map((key) => refsByKey.get(key)).filter((value): value is TicketGraphRef => Boolean(value)));
      }
    }
  }

  return {
    nodes,
    ready: sortGraphRefs(ready),
    blocked: sortGraphRefs(blocked),
    cycles: cycles.sort((left, right) => (left[0]?.qualifiedId ?? "").localeCompare(right[0]?.qualifiedId ?? "")),
    lookup: {
      byTicketId: Object.fromEntries(
        [...uniqueKeyById.entries()].sort((left, right) => left[0].localeCompare(right[0])),
      ),
      ambiguousIds: [...ambiguousIds].sort((left, right) => left.localeCompare(right)),
    },
  };
}

export function summarizeTicket(record: TicketRecord, effectiveStatus: TicketStatus): TicketSummary {
  return {
    id: record.frontmatter.id,
    title: record.frontmatter.title,
    status: effectiveStatus,
    repository: null,
    storedStatus: record.frontmatter.status,
    priority: record.frontmatter.priority,
    type: record.frontmatter.type,
    createdAt: record.frontmatter["created-at"],
    updatedAt: record.frontmatter["updated-at"],
    deps: [...record.frontmatter.deps],
    links: [...record.frontmatter.links],
    initiativeIds: [...record.frontmatter["initiative-ids"]],
    researchIds: [...record.frontmatter["research-ids"]],
    tags: [...record.frontmatter.tags],
    parent: record.frontmatter.parent,
    closed: record.closed,
    archived: record.archived ?? false,
    archivedAt: record.archivedAt ?? null,
    ref: record.ref,
  };
}
