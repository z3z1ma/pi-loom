import type { CheckpointRecord, JournalEntry, TicketGraphResult, TicketReadResult, TicketSummary } from "./models.js";

function renderList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}

export function renderTicketSummary(summary: TicketSummary): string {
  const lifecycle = summary.archived ? " archived" : "";
  return `${summary.id} [${summary.status}${lifecycle}]${summary.repository ? ` repo=${summary.repository.slug}` : ""} (${summary.type}/${summary.priority}) ${summary.title}`;
}

export function renderTicketDetail(result: TicketReadResult): string {
  const { ticket, summary, journal, attachments, checkpoints, children, blockers } = result;
  return [
    renderTicketSummary(summary),
    `Repository: ${summary.repository ? `${summary.repository.displayName} [${summary.repository.id}]` : "(none)"}`,
    `Archived: ${ticket.archived ? `yes (${ticket.archivedAt ?? "timestamp unavailable"})` : "no"}`,
    `Stored status: ${ticket.frontmatter.status}`,
    `Risk: ${ticket.frontmatter.risk}`,
    `Review status: ${ticket.frontmatter["review-status"]}`,
    `Deps: ${renderList(ticket.frontmatter.deps)}`,
    `Links: ${renderList(ticket.frontmatter.links)}`,
    `Initiatives: ${renderList(ticket.frontmatter["initiative-ids"])}`,
    `Research: ${renderList(ticket.frontmatter["research-ids"])}`,
    `Acceptance: ${renderList(ticket.frontmatter.acceptance)}`,
    `Labels: ${renderList(ticket.frontmatter.labels)}`,
    `Children: ${renderList(children)}`,
    `Blockers: ${renderList(blockers)}`,
    `Attachments: ${attachments.length}`,
    `Checkpoints: ${checkpoints.length}`,
    `Journal entries: ${journal.length}`,
    "",
    "Summary:",
    ticket.body.summary || "(empty)",
    "",
    "Context:",
    ticket.body.context || "(empty)",
    "",
    "Plan:",
    ticket.body.plan || "(empty)",
    "",
    "Notes:",
    ticket.body.notes || "(empty)",
    "",
    "Verification:",
    ticket.body.verification || "(empty)",
    "",
    "Journal Summary:",
    ticket.body.journalSummary || "(empty)",
  ].join("\n");
}

export function renderJournal(entries: JournalEntry[]): string {
  if (entries.length === 0) {
    return "No journal entries.";
  }
  return entries.map((entry) => `- ${entry.createdAt} [${entry.kind}] ${entry.text}`).join("\n");
}

export function renderCheckpointList(checkpoints: CheckpointRecord[]): string {
  if (checkpoints.length === 0) {
    return "No checkpoints.";
  }
  return checkpoints.map((checkpoint) => `- ${checkpoint.id} ${checkpoint.title}`).join("\n");
}

export function renderGraph(graph: TicketGraphResult): string {
  const lines = [
    `Ready: ${graph.ready.length > 0 ? graph.ready.join(", ") : "none"}`,
    `Blocked: ${graph.blocked.length > 0 ? graph.blocked.join(", ") : "none"}`,
  ];
  for (const node of Object.values(graph.nodes).sort((left, right) => left.id.localeCompare(right.id))) {
    lines.push(
      `${node.id} [${node.status}]${node.repository ? ` repo=${node.repository.slug}` : ""} deps=${renderList(node.deps)} blockedBy=${renderList(node.blockedBy)}`,
    );
  }
  return lines.join("\n");
}
