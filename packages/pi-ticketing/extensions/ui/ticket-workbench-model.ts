import type { TicketGraphResult, TicketStatus, TicketSummary } from "../domain/models.js";

export type TicketWorkbenchTabId = "overview" | "inbox" | "list" | "board" | "timeline" | "detail";

export interface TicketBlockedItem {
  ticket: TicketSummary;
  blockers: string[];
}

export interface TicketWorkbenchCounts {
  total: number;
  ready: number;
  inProgress: number;
  review: number;
  blocked: number;
  closed: number;
}

export interface TicketWorkbenchModel {
  tickets: TicketSummary[];
  counts: TicketWorkbenchCounts;
  ready: TicketSummary[];
  active: TicketSummary[];
  blocked: TicketBlockedItem[];
  recent: TicketSummary[];
  timeline: TicketSummary[];
  byStatus: Record<TicketStatus, TicketSummary[]>;
}

export function orderedTickets(tickets: TicketSummary[]): TicketSummary[] {
  return [...tickets].sort((left, right) => left.id.localeCompare(right.id));
}

export function updatedTickets(tickets: TicketSummary[]): TicketSummary[] {
  return [...tickets].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function statusCount(tickets: TicketSummary[], status: TicketStatus): number {
  return tickets.filter((ticket) => ticket.status === status).length;
}

export function summarizeTicketsForWidget(tickets: TicketSummary[], status: TicketStatus, limit = 2): string {
  const matches = orderedTickets(tickets)
    .filter((ticket) => ticket.status === status)
    .slice(0, limit)
    .map((ticket) => `${ticket.id} ${ticket.title}`);
  return matches.length > 0 ? matches.join(" • ") : "(none)";
}

export function recentChangeLines(tickets: TicketSummary[], limit = 3): string[] {
  const recent = updatedTickets(tickets)
    .slice(0, limit)
    .map((ticket) => `${ticket.id} ${ticket.title} • ${ticket.updatedAt}`);
  return recent.length > 0 ? recent : ["(none)"];
}

export function nextActionLines(tickets: TicketSummary[]): string[] {
  const actions: string[] = [];
  if (tickets.length === 0) {
    return ["/ticket create", "/ticket open home"];
  }
  if (tickets.some((ticket) => ticket.status === "blocked")) {
    actions.push("/ticket review blocked");
  }
  if (tickets.some((ticket) => ticket.status === "ready")) {
    actions.push("/ticket review ready");
  }
  actions.push("/ticket open list");
  actions.push("/ticket create");
  return [...new Set(actions)].slice(0, 4);
}

export function createTicketWorkbenchModel(tickets: TicketSummary[], graph: TicketGraphResult): TicketWorkbenchModel {
  const ordered = orderedTickets(tickets);
  const timeline = updatedTickets(tickets);
  const byStatus: Record<TicketStatus, TicketSummary[]> = {
    open: ordered.filter((ticket) => ticket.status === "open"),
    ready: ordered.filter((ticket) => ticket.status === "ready"),
    in_progress: ordered.filter((ticket) => ticket.status === "in_progress"),
    blocked: ordered.filter((ticket) => ticket.status === "blocked"),
    review: ordered.filter((ticket) => ticket.status === "review"),
    closed: ordered.filter((ticket) => ticket.status === "closed"),
  };

  return {
    tickets: ordered,
    counts: {
      total: ordered.length,
      ready: byStatus.ready.length,
      inProgress: byStatus.in_progress.length,
      review: byStatus.review.length,
      blocked: byStatus.blocked.length,
      closed: byStatus.closed.length,
    },
    ready: byStatus.ready,
    active: [...byStatus.in_progress, ...byStatus.review],
    blocked: byStatus.blocked.map((ticket) => ({
      ticket,
      blockers: graph.nodes[ticket.id]?.blockedBy ?? [],
    })),
    recent: timeline.slice(0, 6),
    timeline,
    byStatus,
  };
}

export function uniqueTickets(tickets: TicketSummary[]): TicketSummary[] {
  const byId = new Map<string, TicketSummary>();
  for (const ticket of tickets) {
    if (!byId.has(ticket.id)) {
      byId.set(ticket.id, ticket);
    }
  }
  return [...byId.values()];
}

export function getOverviewTickets(model: TicketWorkbenchModel): TicketSummary[] {
  return uniqueTickets([...model.ready.slice(0, 4), ...model.active.slice(0, 3), ...model.recent.slice(0, 3)]);
}

export function getInboxTickets(model: TicketWorkbenchModel, filter?: "ready" | "blocked"): TicketSummary[] {
  if (filter === "ready") {
    return model.ready;
  }
  if (filter === "blocked") {
    return model.blocked.map((entry) => entry.ticket);
  }
  return [...model.blocked.map((entry) => entry.ticket), ...model.ready];
}

export function getBoardTickets(model: TicketWorkbenchModel, filter?: "ready" | "blocked"): TicketSummary[] {
  if (filter === "ready") {
    return model.byStatus.ready;
  }
  if (filter === "blocked") {
    return model.byStatus.blocked;
  }
  return [
    ...model.byStatus.ready,
    ...model.byStatus.in_progress,
    ...model.byStatus.review,
    ...model.byStatus.blocked,
    ...model.byStatus.open,
    ...model.byStatus.closed,
  ];
}

export function getTicketById(model: TicketWorkbenchModel, ticketId: string | null | undefined): TicketSummary | null {
  if (!ticketId) {
    return null;
  }
  return model.tickets.find((ticket) => ticket.id === ticketId) ?? null;
}
