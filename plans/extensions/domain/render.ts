import type { PlanDashboard, PlanDashboardTicket, PlanReadResult, PlanState, PlanSummary } from "./models.js";

function renderList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}

function renderText(value: string, empty = "(empty)"): string {
  return value.trim() || empty;
}

function renderRepository(summary: PlanSummary): string {
  return summary.repository ? ` repo=${summary.repository.slug}` : "";
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

function renderProgress(state: PlanState, tickets: PlanDashboardTicket[]): string {
  const progress =
    state.progress.length > 0
      ? state.progress
          .map((entry) => `- [${entry.status === "done" ? "x" : " "}] (${entry.timestamp}) ${entry.text}`)
          .join("\n")
      : "- [ ] Add timestamped progress updates as work advances.";
  const ticketSnapshot =
    tickets.length > 0
      ? `\n\nLinked ticket snapshot from the live execution ledger:\n${renderTicketProgress(tickets)}`
      : "";
  return `${progress}${ticketSnapshot}`;
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

function renderRevisionNotes(state: PlanState): string {
  if (state.revisionNotes.length === 0) {
    return "- (none yet)";
  }
  return state.revisionNotes
    .map((entry) => `- ${entry.timestamp} — ${entry.change}\n  Reason: ${entry.reason || "(none provided)"}`)
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
  return `${summary.id} [${summary.status}]${renderRepository(summary)} ${summary.title}`;
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
    "This workplan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, `Outcomes & Retrospective`, and `Revision Notes` current so a novice can resume from this file alone.",
    "",
    "## Purpose / Big Picture",
    renderText(
      state.purpose || state.summary,
      "Explain what a user or maintainer can do after this work and how they can see it working.",
    ),
    "",
    "## Progress",
    renderProgress(state, linkedTickets),
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
    `${renderText(state.contextAndOrientation, "Explain the current repository state, define any Loom-specific terms in plain language, and orient a novice to the files that matter before they edit anything.")}\n\nSource target: ${sourceTarget}${scopePaths}${contextRefs ? `\n\n${contextRefs}` : ""}`,
    "",
    "## Milestones",
    renderText(
      state.milestones,
      "Describe each milestone as a narrative checkpoint: what will exist afterward, which commands to run, and what observable result proves success.",
    ),
    "",
    "## Plan of Work",
    renderText(
      state.planOfWork,
      "Describe the sequence of edits and why that order is the safest path through the linked execution slice.",
    ),
    "",
    "## Concrete Steps",
    renderText(
      state.concreteSteps,
      "List the exact repository-relative files to edit plus the exact commands to run, including working directory and short expected output when relevant.",
    ),
    "",
    "## Validation and Acceptance",
    renderText(
      state.validation,
      "Describe the observable behavior, targeted tests, and expected outputs that prove the plan worked beyond merely compiling.",
    ),
    "",
    "## Idempotence and Recovery",
    renderText(
      state.idempotenceAndRecovery,
      "Explain which steps are safe to repeat, how to recover from a partial failure, and how to avoid leaving the workspace in a misleading state.",
    ),
    "",
    "## Artifacts and Notes",
    renderText(
      state.artifactsAndNotes,
      "Record concise command transcripts, diff excerpts, or other durable notes that prove the current state of the work.",
    ),
    "",
    "## Interfaces and Dependencies",
    renderText(
      state.interfacesAndDependencies,
      "Name the modules, tools, durable records, and any required function/type surfaces that must exist at the end of the work.",
    ),
    "",
    "## Linked Tickets",
    renderTicketList(linkedTickets),
    "",
    "## Risks and Open Questions",
    renderText(state.risksAndQuestions, "No additional risks or open questions recorded."),
    "",
    "## Revision Notes",
    renderRevisionNotes(state),
    "",
  ]
    .join("\n")
    .trimEnd()}\n`;
}

export function renderPlanDetail(result: PlanReadResult): string {
  return [
    renderPlanSummary(result.summary),
    `Repository: ${
      result.summary.repository
        ? `${result.summary.repository.displayName} [${result.summary.repository.id}]`
        : "(none)"
    }`,
    `Plan ref: ${result.summary.ref}`,
    `Packet ref: ${result.dashboard.packetRef}`,
    `Plan document ref: ${result.dashboard.planRef}`,
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
    `Repository: ${
      dashboard.plan.repository
        ? `${dashboard.plan.repository.displayName} [${dashboard.plan.repository.id}]`
        : "(none)"
    }`,
    `Plan ref: ${dashboard.plan.ref}`,
    `Packet ref: ${dashboard.packetRef}`,
    `Plan document ref: ${dashboard.planRef}`,
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
