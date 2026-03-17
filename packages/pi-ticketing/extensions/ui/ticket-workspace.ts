import type { ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type {
  TicketGraphResult,
  TicketReadResult,
  TicketStatus,
  TicketSummary,
  UpdateTicketInput,
} from "../domain/models.js";
import { renderTicketDetail, renderTicketSummary } from "../domain/render.js";
import { createTicketStore, type TicketStore } from "../domain/store.js";

export type TicketWorkspaceFilter = "ready" | "blocked";

export type TicketWorkspaceView =
  | { kind: "home" }
  | { kind: "list"; filter?: TicketWorkspaceFilter }
  | { kind: "board"; filter?: TicketWorkspaceFilter }
  | { kind: "timeline" }
  | { kind: "detail"; ref: string };

export type TicketWorkspaceField = keyof Pick<
  UpdateTicketInput,
  | "title"
  | "summary"
  | "context"
  | "plan"
  | "notes"
  | "verification"
  | "journalSummary"
  | "assignee"
  | "priority"
  | "risk"
  | "type"
  | "reviewStatus"
>;

export type TicketWorkspaceAction =
  | { kind: "close" }
  | { kind: "navigate"; view: TicketWorkspaceView }
  | { kind: "create" }
  | { kind: "edit"; ref: string; field: TicketWorkspaceField; value?: string }
  | {
      kind: "status";
      ref: string;
      status: "open" | "reopen" | "in_progress" | "review" | "close";
      verificationNote?: string;
    }
  | { kind: "dependency"; ref: string; mode: "add" | "remove"; dependencyRef?: string };

interface TicketWorkspaceSnapshot {
  view: TicketWorkspaceView;
  tickets: TicketSummary[];
  graph: TicketGraphResult;
  detail: TicketReadResult | null;
}

interface ActionOption {
  label: string;
  description?: string;
  action: TicketWorkspaceAction;
}

function statusCount(tickets: TicketSummary[], status: TicketStatus): number {
  return tickets.filter((ticket) => ticket.status === status).length;
}

function describeFilter(filter?: TicketWorkspaceFilter): string {
  if (filter === "ready") return "ready review";
  if (filter === "blocked") return "blocked review";
  return "full backlog";
}

function orderedTickets(tickets: TicketSummary[]): TicketSummary[] {
  return [...tickets].sort((left, right) => left.id.localeCompare(right.id));
}

function updatedTickets(tickets: TicketSummary[]): TicketSummary[] {
  return [...tickets].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function summarizeTicketsForWidget(tickets: TicketSummary[], status: TicketStatus, limit = 2): string {
  const matches = orderedTickets(tickets)
    .filter((ticket) => ticket.status === status)
    .slice(0, limit)
    .map((ticket) => `${ticket.id} ${ticket.title}`);
  return matches.length > 0 ? matches.join(" • ") : "(none)";
}

function recentChangeLines(tickets: TicketSummary[], limit = 3): string[] {
  const recent = updatedTickets(tickets)
    .slice(0, limit)
    .map((ticket) => `${ticket.id} ${ticket.title} • ${ticket.updatedAt}`);
  return recent.length > 0 ? recent : ["(none)"];
}

function nextActionLines(tickets: TicketSummary[]): string[] {
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

function linesForStatus(tickets: TicketSummary[], status: TicketStatus): string[] {
  const matches = tickets.filter((ticket) => ticket.status === status);
  return matches.length > 0 ? matches.map(renderTicketSummary) : ["(none)"];
}

function blockedReviewLines(snapshot: TicketWorkspaceSnapshot): string[] {
  const blockedIds = orderedTickets(snapshot.tickets)
    .filter((ticket) => ticket.status === "blocked")
    .map((ticket) => ticket.id);
  if (blockedIds.length === 0) {
    return ["(none)"];
  }
  return blockedIds.map((ticketId) => {
    const node = snapshot.graph.nodes[ticketId];
    const blockers = node?.blockedBy.length ? node.blockedBy.join(", ") : "unknown";
    const ticket = snapshot.tickets.find((entry) => entry.id === ticketId);
    return `${ticketId} blocked by ${blockers}${ticket ? ` • ${ticket.title}` : ""}`;
  });
}

export async function syncTicketHomeWidget(ctx: ExtensionContext): Promise<void> {
  if (!("ui" in ctx) || typeof ctx.ui?.setWidget !== "function") {
    return;
  }
  const store = createTicketStore(ctx.cwd);
  await store.initLedgerAsync();
  const tickets = await store.listTicketsAsync({ includeClosed: true });
  const lines = [
    `Tickets ${tickets.length} total • Ready ${statusCount(tickets, "ready")} • Blocked ${statusCount(tickets, "blocked")} • Active ${statusCount(tickets, "in_progress")} • Review ${statusCount(tickets, "review")}`,
    `Ready: ${summarizeTicketsForWidget(tickets, "ready")}`,
    `Blocked: ${summarizeTicketsForWidget(tickets, "blocked")}`,
    `Recent: ${recentChangeLines(tickets, 2).join(" • ")}`,
    `Next: ${nextActionLines(tickets).join(" • ")}`,
  ];

  ctx.ui.setWidget("ticket-home", lines);
}

export async function loadTicketWorkspaceSnapshot(
  store: TicketStore,
  view: TicketWorkspaceView,
): Promise<TicketWorkspaceSnapshot> {
  const tickets = await store.listTicketsAsync({ includeClosed: true });
  const graph = await store.graphAsync();
  const detail = view.kind === "detail" ? await store.readTicketAsync(view.ref) : null;
  return { view, tickets, graph, detail };
}

export function renderTicketWorkspaceText(snapshot: TicketWorkspaceSnapshot): string {
  const tickets = orderedTickets(snapshot.tickets);
  switch (snapshot.view.kind) {
    case "home": {
      const ready = tickets.filter((ticket) => ticket.status === "ready").slice(0, 5);
      const active = tickets
        .filter((ticket) => ticket.status === "in_progress" || ticket.status === "review")
        .slice(0, 5);
      return [
        "Ticket workspace: home",
        `Total: ${tickets.length}`,
        `Ready: ${statusCount(tickets, "ready")}`,
        `In progress: ${statusCount(tickets, "in_progress")}`,
        `Review: ${statusCount(tickets, "review")}`,
        `Blocked: ${statusCount(tickets, "blocked")}`,
        `Closed: ${statusCount(tickets, "closed")}`,
        "",
        "Next ready:",
        ...(ready.length > 0 ? ready.map(renderTicketSummary) : ["(none)"]),
        "",
        "Active now:",
        ...(active.length > 0 ? active.map(renderTicketSummary) : ["(none)"]),
        "",
        "Recent changes:",
        ...recentChangeLines(tickets),
        "",
        "Next actions:",
        ...nextActionLines(tickets),
      ].join("\n");
    }
    case "list": {
      const listed =
        snapshot.view.filter === "ready"
          ? tickets.filter((ticket) => ticket.status === "ready")
          : snapshot.view.filter === "blocked"
            ? tickets.filter((ticket) => ticket.status === "blocked")
            : tickets;
      return [
        `Ticket workspace: list (${describeFilter(snapshot.view.filter)})`,
        ...(listed.length > 0 ? listed.map(renderTicketSummary) : ["No tickets in this view."]),
      ].join("\n");
    }
    case "board": {
      if (snapshot.view.filter === "ready") {
        return ["Ticket workspace: board (ready review)", ...linesForStatus(tickets, "ready")].join("\n");
      }
      if (snapshot.view.filter === "blocked") {
        return ["Ticket workspace: board (blocked review)", ...blockedReviewLines(snapshot)].join("\n");
      }
      return [
        "Ticket workspace: board",
        "",
        "Ready:",
        ...linesForStatus(tickets, "ready"),
        "",
        "In progress:",
        ...linesForStatus(tickets, "in_progress"),
        "",
        "Review:",
        ...linesForStatus(tickets, "review"),
        "",
        "Blocked:",
        ...linesForStatus(tickets, "blocked"),
        "",
        "Closed:",
        ...linesForStatus(tickets, "closed"),
      ].join("\n");
    }
    case "timeline": {
      const timeline = updatedTickets(tickets).map(
        (ticket) => `${ticket.updatedAt} ${ticket.id} [${ticket.status}] ${ticket.title}`,
      );
      return ["Ticket workspace: timeline", ...(timeline.length > 0 ? timeline : ["No tickets yet."])].join("\n");
    }
    case "detail":
      return snapshot.detail
        ? [
            renderTicketDetail(snapshot.detail),
            "",
            "Recent journal:",
            ...(snapshot.detail.journal.length > 0
              ? snapshot.detail.journal.slice(-5).map((entry) => `${entry.createdAt} [${entry.kind}] ${entry.text}`)
              : ["(none)"]),
            "",
            "Checkpoints:",
            ...(snapshot.detail.checkpoints.length > 0
              ? snapshot.detail.checkpoints.map((checkpoint) => `${checkpoint.id} ${checkpoint.title}`)
              : ["(none)"]),
            "",
            "Attachments:",
            ...(snapshot.detail.attachments.length > 0
              ? snapshot.detail.attachments.map((attachment) => `${attachment.label} (${attachment.mediaType})`)
              : ["(none)"]),
          ].join("\n")
        : `Unknown ticket: ${snapshot.view.ref}`;
  }
}

function buildActionOptions(snapshot: TicketWorkspaceSnapshot): ActionOption[] {
  const options: ActionOption[] = [
    { label: "Home", description: "Workspace summary and next ready work", action: { kind: "navigate", view: { kind: "home" } } },
    { label: "List", description: "Full ticket list", action: { kind: "navigate", view: { kind: "list" } } },
    { label: "Board", description: "Grouped by effective status", action: { kind: "navigate", view: { kind: "board" } } },
    { label: "Timeline", description: "Most recently updated first", action: { kind: "navigate", view: { kind: "timeline" } } },
    {
      label: "Review ready",
      description: "Focus only ready tickets",
      action: { kind: "navigate", view: { kind: "board", filter: "ready" } },
    },
    {
      label: "Review blocked",
      description: "Focus blocked tickets and blockers",
      action: { kind: "navigate", view: { kind: "board", filter: "blocked" } },
    },
    { label: "Create ticket", description: "Capture new work", action: { kind: "create" } },
  ];

  for (const ticket of updatedTickets(snapshot.tickets)) {
    options.push({
      label: `Open ${ticket.id}`,
      description: `${ticket.status} • ${ticket.title}`,
      action: { kind: "navigate", view: { kind: "detail", ref: ticket.id } },
    });
  }

  if (snapshot.detail) {
    const ref = snapshot.detail.summary.id;
    if (snapshot.detail.ticket.closed) {
      options.push({
        label: `Reopen ${ref}`,
        description: "Restore the closed ticket to active tracking",
        action: { kind: "status", ref, status: "reopen" },
      });
    } else {
      options.push(
        { label: `Edit ${ref} title`, description: "Rename the ticket", action: { kind: "edit", ref, field: "title" } },
        { label: `Edit ${ref} assignee`, description: "Change the assignee", action: { kind: "edit", ref, field: "assignee" } },
        { label: `Edit ${ref} priority`, description: "Change the ticket priority", action: { kind: "edit", ref, field: "priority" } },
        { label: `Edit ${ref} risk`, description: "Change the ticket risk", action: { kind: "edit", ref, field: "risk" } },
        { label: `Edit ${ref} type`, description: "Change the ticket type", action: { kind: "edit", ref, field: "type" } },
        {
          label: `Edit ${ref} review status`,
          description: "Change the stored review status",
          action: { kind: "edit", ref, field: "reviewStatus" },
        },
        { label: `Edit ${ref} summary`, description: "Update the summary section", action: { kind: "edit", ref, field: "summary" } },
        { label: `Edit ${ref} context`, description: "Update context notes", action: { kind: "edit", ref, field: "context" } },
        { label: `Edit ${ref} plan`, description: "Update execution plan", action: { kind: "edit", ref, field: "plan" } },
        { label: `Edit ${ref} notes`, description: "Update ongoing notes", action: { kind: "edit", ref, field: "notes" } },
        {
          label: `Edit ${ref} verification`,
          description: "Update verification notes",
          action: { kind: "edit", ref, field: "verification" },
        },
        {
          label: `Edit ${ref} journal summary`,
          description: "Update the durable summary",
          action: { kind: "edit", ref, field: "journalSummary" },
        },
        {
          label: `Set ${ref} open`,
          description: "Move back to open/ready tracking",
          action: { kind: "status", ref, status: "open" },
        },
        {
          label: `Set ${ref} in progress`,
          description: "Mark active work",
          action: { kind: "status", ref, status: "in_progress" },
        },
        {
          label: `Set ${ref} review`,
          description: "Mark ready for review",
          action: { kind: "status", ref, status: "review" },
        },
        { label: `Close ${ref}`, description: "Archive with verification note", action: { kind: "status", ref, status: "close" } },
        {
          label: `Add dependency to ${ref}`,
          description: "Record a new blocker or prerequisite",
          action: { kind: "dependency", ref, mode: "add" },
        },
        {
          label: `Remove dependency from ${ref}`,
          description: "Drop an obsolete dependency",
          action: { kind: "dependency", ref, mode: "remove" },
        },
      );
    }
  }

  options.push({ label: "Close workspace", description: "Return to the normal shell flow", action: { kind: "close" } });
  return options;
}

function renderHeader(snapshot: TicketWorkspaceSnapshot): string[] {
  return renderTicketWorkspaceText(snapshot).split("\n");
}

export async function openInteractiveTicketWorkspace(
  ctx: ExtensionCommandContext,
  snapshot: TicketWorkspaceSnapshot,
): Promise<TicketWorkspaceAction | null> {
  return ctx.ui.custom<TicketWorkspaceAction | null>((_tui, theme, _keybindings, done) => {
    const actionOptions = buildActionOptions(snapshot);
    const bodyLines = renderHeader(snapshot);
    let selectedIndex = 0;

    const moveSelection = (delta: number) => {
      selectedIndex = (selectedIndex + delta + actionOptions.length) % actionOptions.length;
    };

    return {
      render(_width: number): string[] {
        const startIndex = Math.max(0, Math.min(selectedIndex - 5, Math.max(0, actionOptions.length - 12)));
        const visibleOptions = actionOptions.slice(startIndex, startIndex + 12);
        const actionLines = visibleOptions.map((option, offset) => {
          const index = startIndex + offset;
          const selected = index === selectedIndex;
          const prefix = selected ? theme.fg("accent", ">") : " ";
          const label = selected ? theme.fg("accent", option.label) : option.label;
          const description = option.description ? ` ${theme.fg("dim", `— ${option.description}`)}` : "";
          return `${prefix} ${label}${description}`;
        });
        return [
          ...bodyLines,
          "",
          theme.fg("accent", "Actions"),
          ...actionLines,
          ...(actionOptions.length > visibleOptions.length
            ? [theme.fg("dim", `(${selectedIndex + 1}/${actionOptions.length})`)]
            : []),
          "",
          theme.fg("dim", "Use ↑/↓ or j/k • Enter chooses • Esc closes workspace"),
        ];
      },
      handleInput(data: string): void {
        if (data === "\u001b[A" || data === "k") {
          moveSelection(-1);
          return;
        }
        if (data === "\u001b[B" || data === "j") {
          moveSelection(1);
          return;
        }
        if (data === "\u001b" || data === "\u0003") {
          done(null);
          return;
        }
        if (data === "\r" || data === "\n") {
          done(actionOptions[selectedIndex]?.action ?? null);
        }
      },
      invalidate(): void {},
    };
  });
}
