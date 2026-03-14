import { buildTicketGraph, computeEffectiveStatus, summarizeTicket } from "./graph.js";
import type { TicketGraphResult, TicketListFilter, TicketRecord, TicketSummary } from "./models.js";

export function summarizeTickets(records: TicketRecord[]): TicketSummary[] {
  const provisional = records.map((record) => ({
    id: record.frontmatter.id,
    title: record.frontmatter.title,
    status: record.frontmatter.status,
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
    path: record.path,
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

export function filterTickets(summaries: TicketSummary[], filter: TicketListFilter = {}): TicketSummary[] {
  return summaries.filter((summary) => {
    if (!filter.includeClosed && summary.status === "closed") {
      return false;
    }
    if (filter.status && summary.status !== filter.status) {
      return false;
    }
    if (filter.type && summary.type !== filter.type) {
      return false;
    }
    if (filter.tag && !summary.tags.includes(filter.tag)) {
      return false;
    }
    if (filter.text) {
      const haystack = `${summary.id} ${summary.title}`.toLowerCase();
      if (!haystack.includes(filter.text.toLowerCase())) {
        return false;
      }
    }
    return true;
  });
}

export function queryGraph(records: TicketRecord[]): TicketGraphResult {
  return buildTicketGraph(summarizeTickets(records));
}
