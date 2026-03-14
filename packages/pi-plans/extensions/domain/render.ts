import type { PlanDashboard, PlanDashboardTicket, PlanReadResult, PlanState, PlanSummary } from "./models.js";

function renderList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}

function renderText(value: string, empty = "(empty)"): string {
  return value.trim() || empty;
}

function renderTicketProgress(tickets: PlanDashboardTicket[]): string {
  if (tickets.length === 0) {
    return "- [ ] No tickets linked yet.";
  }
  return tickets
    .map((ticket) => {
      const checked = ticket.status === "closed" ? "x" : " ";
      const role = ticket.role ? ` (${ticket.role})` : "";
      const status = ticket.status !== "closed" ? ` [${ticket.status}]` : "";
      return `- [${checked}] Ticket ${ticket.ticketId}${status} — ${ticket.title}${role}`;
    })
    .join("\n");
}

function renderDiscoveries(state: PlanState): string {
  if (state.discoveries.length === 0) {
    return "- (none yet)";
  }
  return state.discoveries
    .map((entry) => `- Observation: ${entry.note}\n  Evidence: ${entry.evidence || "(none provided)"}`)
    .join("\n\n");
}

function renderDecisions(state: PlanState): string {
  if (state.decisions.length === 0) {
    return "- (none yet)";
  }
  return state.decisions
    .map(
      (entry) =>
        `- Decision: ${entry.decision}\n  Rationale: ${entry.rationale || "(none provided)"}\n  Date/Author: ${entry.date} / ${entry.author}`,
    )
    .join("\n\n");
}

function renderTicketList(tickets: PlanDashboardTicket[]): string {
  if (tickets.length === 0) {
    return "- (none linked)";
  }
  return tickets
    .map((ticket) => `- ${ticket.ticketId} [${ticket.status}] ${ticket.title}${ticket.role ? ` — ${ticket.role}` : ""}`)
    .join("\n");
}

export function renderPlanSummary(summary: PlanSummary): string {
  return `${summary.id} [${summary.status}] ${summary.title}`;
}

export function renderPlanMarkdown(state: PlanState, linkedTickets: PlanDashboardTicket[]): string {
  const sourceTarget = `${state.sourceTarget.kind}:${state.sourceTarget.ref}`;
  const scopePaths = state.scopePaths.length > 0 ? `\n\nScope paths: ${state.scopePaths.join(", ")}` : "";
  const contextRefs = [
    state.contextRefs.roadmapItemIds.length > 0 ? `Roadmap: ${state.contextRefs.roadmapItemIds.join(", ")}` : null,
    state.contextRefs.initiativeIds.length > 0 ? `Initiatives: ${state.contextRefs.initiativeIds.join(", ")}` : null,
    state.contextRefs.researchIds.length > 0 ? `Research: ${state.contextRefs.researchIds.join(", ")}` : null,
    state.contextRefs.specChangeIds.length > 0 ? `Specs: ${state.contextRefs.specChangeIds.join(", ")}` : null,
    state.contextRefs.critiqueIds.length > 0 ? `Critiques: ${state.contextRefs.critiqueIds.join(", ")}` : null,
    state.contextRefs.docIds.length > 0 ? `Docs: ${state.contextRefs.docIds.join(", ")}` : null,
  ]
    .filter((value): value is string => value !== null)
    .join("\n");

  return `${[
    `# ${state.title}`,
    "",
    "## Purpose / Big Picture",
    renderText(
      state.purpose || state.summary,
      "Describe what this plan enables and how linked tickets prove progress.",
    ),
    "",
    "## Progress",
    renderTicketProgress(linkedTickets),
    "",
    "## Surprises & Discoveries",
    renderDiscoveries(state),
    "",
    "## Decision Log",
    renderDecisions(state),
    "",
    "## Outcomes & Retrospective",
    renderText(state.outcomesAndRetrospective, "No retrospective recorded yet."),
    "",
    "## Context and Orientation",
    `${renderText(state.contextAndOrientation, "Use the planning packet for upstream context and keep linked tickets as the live execution ledger plus the self-contained definition of each unit of work.")}\n\nSource target: ${sourceTarget}${scopePaths}${contextRefs ? `\n\n${contextRefs}` : ""}`,
    "",
    "## Plan of Work",
    renderText(state.planOfWork, "Describe the ordered phases that the linked tickets execute."),
    "",
    "## Concrete Steps",
    renderText(
      state.concreteSteps,
      "Describe the next concrete steps and point to linked tickets for the live work state.",
    ),
    "",
    "## Validation and Acceptance",
    renderText(state.validation, "Describe what observable behavior or checks prove the plan is complete."),
    "",
    "## Tickets",
    renderTicketList(linkedTickets),
    "",
    "## Risks and open questions",
    renderText(state.risksAndQuestions, "No additional risks or open questions recorded."),
    "",
  ]
    .join("\n")
    .trimEnd()}\n`;
}

export function renderPlanDetail(result: PlanReadResult): string {
  return [
    renderPlanSummary(result.summary),
    `Source target: ${result.state.sourceTarget.kind}:${result.state.sourceTarget.ref}`,
    `Linked tickets: ${result.state.linkedTickets.length}`,
    `Scope paths: ${renderList(result.state.scopePaths)}`,
    `Packet summary: ${result.state.packetSummary || "(empty)"}`,
    "",
    "Summary:",
    result.state.summary || "(empty)",
  ].join("\n");
}

export function renderDashboard(dashboard: PlanDashboard): string {
  return [
    renderPlanSummary(dashboard.plan),
    `Source target: ${dashboard.sourceTarget.kind}:${dashboard.sourceTarget.ref}`,
    `Tickets: ${dashboard.counts.tickets}`,
    `Ticket statuses: ${
      Object.entries(dashboard.counts.byStatus)
        .map(([status, count]) => `${status}=${count}`)
        .join(", ") || "none"
    }`,
    `Scope paths: ${renderList(dashboard.scopePaths)}`,
  ].join("\n");
}
