import { filterAndSortListEntries } from "@pi-loom/pi-storage/storage/list-search.js";
import { buildTicketGraph, computeEffectiveStatus, summarizeTicket } from "./graph.js";
import type { TicketGraphResult, TicketListFilter, TicketReadResult, TicketRecord, TicketSummary } from "./models.js";

export function summarizeTickets(records: TicketRecord[]): TicketSummary[] {
  const provisional = records.map((record) => ({
    id: record.frontmatter.id,
    title: record.frontmatter.title,
    status: record.frontmatter.status,
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
  }));
  const ticketsById = new Map(provisional.map((ticket) => [ticket.id, ticket]));
  return records
    .map((record) => {
      const summary = ticketsById.get(record.frontmatter.id);
      if (!summary) {
        throw new Error(`Missing provisional ticket summary for ${record.frontmatter.id}`);
      }
      return summarizeTicket(record, computeEffectiveStatus(summary, ticketsById));
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function ticketSearchText(record: TicketReadResult): string[] {
  return [
    record.summary.id,
    record.summary.title,
    record.ticket.body.summary,
    record.ticket.body.context,
    record.ticket.body.plan,
    record.ticket.body.notes,
    record.ticket.body.verification,
    record.ticket.body.journalSummary,
    ...record.ticket.frontmatter.tags,
    ...record.ticket.frontmatter.labels,
    ...record.ticket.frontmatter.acceptance,
    ...record.ticket.frontmatter.deps,
    ...record.ticket.frontmatter.links,
    ...record.ticket.frontmatter["initiative-ids"],
    ...record.ticket.frontmatter["research-ids"],
    ...(record.ticket.frontmatter.parent ? [record.ticket.frontmatter.parent] : []),
    ...(record.ticket.frontmatter.assignee ? [record.ticket.frontmatter.assignee] : []),
    ...record.ticket.frontmatter["external-refs"],
    record.ticket.ref,
    record.summary.ref,
  ];
}

export function filterTickets(records: TicketReadResult[], filter: TicketListFilter = {}): TicketSummary[] {
  const filtered = records.filter((record) => {
    const summary = record.summary;
    if (!filter.includeArchived && summary.archived) {
      return false;
    }
    if (!filter.includeClosed && summary.status === "closed" && !summary.archived) {
      return false;
    }
    if (filter.status && summary.status !== filter.status) {
      return false;
    }
    if (filter.type && summary.type !== filter.type) {
      return false;
    }
    if (filter.repositoryId && summary.repository?.id !== filter.repositoryId) {
      return false;
    }
    if (filter.tag && !summary.tags.includes(filter.tag)) {
      return false;
    }
    return true;
  });

  return filterAndSortListEntries(
    filtered.map((record) => ({
      item: record.summary,
      id: record.summary.id,
      createdAt: record.summary.createdAt,
      updatedAt: record.summary.updatedAt,
      fields: [
        { value: record.summary.id, weight: 12 },
        { value: record.summary.repository?.id ?? "", weight: 8 },
        { value: record.summary.repository?.slug ?? "", weight: 8 },
        { value: record.summary.repository?.displayName ?? "", weight: 8 },
        { value: record.summary.title, weight: 10 },
        { value: record.ticket.body.summary, weight: 9 },
        { value: record.ticket.body.context, weight: 5 },
        { value: record.ticket.body.plan, weight: 5 },
        { value: record.ticket.body.notes, weight: 4 },
        { value: record.ticket.body.verification, weight: 4 },
        { value: ticketSearchText(record).join(" "), weight: 3 },
      ],
    })),
    { text: filter.text, sort: filter.sort },
  );
}

export function queryGraph(records: TicketRecord[]): TicketGraphResult {
  return buildTicketGraph(summarizeTickets(records));
}
