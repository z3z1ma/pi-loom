import type {
  CheckpointRecord,
  JournalEntry,
  TicketGraphRef,
  TicketGraphResult,
  TicketReadResult,
  TicketSummary,
} from "./models.js";

function renderList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}

function renderGraphRefs(refs: TicketGraphRef[]): string {
  return refs.length > 0 ? refs.map((ref) => ref.qualifiedId).join(", ") : "none";
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
    `Branch mode: ${ticket.frontmatter["branch-mode"]}`,
    `Branch family: ${ticket.frontmatter["branch-family"] ?? "none"}`,
    `Exact branch: ${ticket.frontmatter["exact-branch-name"] ?? "none"}`,
    `Deps: ${renderList(ticket.frontmatter.deps)}`,
    `Links: ${renderList(ticket.frontmatter.links)}`,
    `Initiatives: ${renderList(ticket.frontmatter["initiative-ids"])}`,
    `Research: ${renderList(ticket.frontmatter["research-ids"])}`,
    `Acceptance: ${renderList(ticket.frontmatter.acceptance)}`,
    `Labels: ${renderList(ticket.frontmatter.labels)}`,
    `Docs disposition: ${ticket.frontmatter["docs-disposition"] ?? "pending"}`,
    `Docs refs: ${renderList(ticket.frontmatter["docs-refs"])}`,
    `Docs note: ${ticket.frontmatter["docs-note"] ?? "none"}`,
    `Docs reviewed at: ${ticket.frontmatter["docs-reviewed-at"] ?? "not reviewed"}`,
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
  const lines = [`Ready: ${renderGraphRefs(graph.ready)}`, `Blocked: ${renderGraphRefs(graph.blocked)}`];
  for (const node of Object.values(graph.nodes).sort((left, right) =>
    left.qualifiedId.localeCompare(right.qualifiedId),
  )) {
    lines.push(
      `${node.qualifiedId} [${node.status}] deps=${renderGraphRefs(node.deps)} blockedBy=${renderGraphRefs(node.blockedBy)}`,
    );
  }
  return lines.join("\n");
}
