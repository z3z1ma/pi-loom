import type { ExtensionCommandContext, ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import type {
  TicketGraphResult,
  TicketReadResult,
  TicketStatus,
  TicketSummary,
  UpdateTicketInput,
} from "../domain/models.js";
import { renderTicketDetail } from "../domain/render.js";
import { createTicketStore, type TicketStore } from "../domain/store.js";
import {
  createTicketWorkbenchModel,
  getBoardTickets,
  getInboxTickets,
  getOverviewTickets,
  getTicketById,
  nextActionLines,
  orderedTickets,
  recentChangeLines,
  summarizeTicketsForWidget,
  type TicketWorkbenchModel,
  type TicketWorkbenchTabId,
} from "./ticket-workbench-model.js";

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

export interface TicketWorkspaceSnapshot {
  view: TicketWorkspaceView;
  tickets: TicketSummary[];
  graph: TicketGraphResult;
  detail: TicketReadResult | null;
}

type WorkbenchMenu =
  | null
  | { kind: "actions"; ref: string; selectedIndex: number }
  | { kind: "status"; ref: string; selectedIndex: number }
  | { kind: "edit"; ref: string; selectedIndex: number }
  | { kind: "dependency"; ref: string; selectedIndex: number };

interface WorkbenchState {
  activeTab: TicketWorkbenchTabId;
  previousTab: TicketWorkbenchTabId | null;
  inboxFilter?: TicketWorkspaceFilter;
  boardFilter?: TicketWorkspaceFilter;
  selectedByTab: Partial<Record<TicketWorkbenchTabId, string | null>>;
  detailRef: string | null;
  menu: WorkbenchMenu;
}

interface DetailLoadState {
  failedRefs: Set<string>;
  loadingRefs: Set<string>;
}

interface MenuOption {
  label: string;
  description?: string;
  perform: () => TicketWorkspaceAction | undefined;
}

const TAB_ORDER: TicketWorkbenchTabId[] = ["overview", "inbox", "list", "board", "timeline", "detail"];
const TAB_LABELS: Record<TicketWorkbenchTabId, string> = {
  overview: "Overview",
  inbox: "Inbox",
  list: "List",
  board: "Board",
  timeline: "Timeline",
  detail: "Detail",
};

const EDITABLE_FIELDS: TicketWorkspaceField[] = [
  "title",
  "assignee",
  "priority",
  "risk",
  "type",
  "reviewStatus",
  "summary",
  "context",
  "plan",
  "notes",
  "verification",
  "journalSummary",
];

function describeFilter(filter?: TicketWorkspaceFilter): string {
  if (filter === "ready") return "ready review";
  if (filter === "blocked") return "blocked review";
  return "full backlog";
}

function box(title: string, lines: string[], width: number, theme: Theme): string[] {
  const innerWidth = Math.max(10, width - 2);
  const titleText = ` ${title} `;
  const ruleWidth = Math.max(0, innerWidth - visibleWidth(titleText));
  const leftRule = "─".repeat(Math.floor(ruleWidth / 2));
  const rightRule = "─".repeat(Math.max(0, ruleWidth - leftRule.length));
  const top = `${theme.fg("dim", "╭")}${theme.fg("dim", leftRule)}${theme.fg("accent", titleText)}${theme.fg("dim", rightRule)}${theme.fg("dim", "╮")}`;
  const bottom = `${theme.fg("dim", "╰")}${theme.fg("dim", "─".repeat(innerWidth))}${theme.fg("dim", "╯")}`;
  const body = lines.map((line) => {
    const content = truncateToWidth(line, innerWidth, "…", true);
    const padding = Math.max(0, innerWidth - visibleWidth(content));
    return `${theme.fg("dim", "│")}${content}${" ".repeat(padding)}${theme.fg("dim", "│")}`;
  });
  return [top, ...body, bottom];
}

function combineColumns(left: string[], right: string[], leftWidth: number, rightWidth: number): string[] {
  const maxLines = Math.max(left.length, right.length);
  const lines: string[] = [];
  for (let index = 0; index < maxLines; index += 1) {
    const leftLine = truncateToWidth(left[index] ?? "", leftWidth, "…", true);
    const leftPadding = Math.max(0, leftWidth - visibleWidth(leftLine));
    const rightLine = truncateToWidth(right[index] ?? "", rightWidth, "…", true);
    lines.push(`${leftLine}${" ".repeat(leftPadding)}  ${rightLine}`);
  }
  return lines;
}

function formatStatus(ticket: TicketSummary): string {
  return `${ticket.status.replaceAll("_", " ")} • ${ticket.type}/${ticket.priority}`;
}

function ticketRows(
  tickets: TicketSummary[],
  selectedRef: string | null,
  theme: Theme,
  width: number,
  extras?: Map<string, string>,
): string[] {
  if (tickets.length === 0) {
    return [theme.fg("dim", "(none)")];
  }

  const lines: string[] = [];
  for (const ticket of tickets) {
    const selected = ticket.id === selectedRef;
    const prefix = selected ? theme.fg("accent", ">") : " ";
    const title = selected ? theme.fg("accent", `${ticket.id} ${ticket.title}`) : `${ticket.id} ${ticket.title}`;
    lines.push(`${prefix} ${truncateToWidth(title, Math.max(12, width - 2), "…", true)}`);
    const extra = extras?.get(ticket.id) ?? `${formatStatus(ticket)} • ${ticket.updatedAt}`;
    lines.push(`  ${theme.fg("dim", truncateToWidth(extra, Math.max(10, width - 2), "…", true))}`);
  }
  return lines;
}

function renderTabBar(activeTab: TicketWorkbenchTabId, theme: Theme, width: number): string {
  const pieces = TAB_ORDER.map((tab) => {
    const label = ` ${TAB_LABELS[tab]} `;
    return tab === activeTab ? theme.fg("accent", theme.bold(label)) : theme.fg("dim", label);
  });
  const suffix = theme.fg("dim", "(tab/←/→ to cycle)");
  return truncateToWidth(`Tickets  ${pieces.join(" ")}  ${suffix}`, width, "…", true);
}

function renderWidgetCounts(model: TicketWorkbenchModel): string {
  return `Tickets ${model.counts.total} total • Ready ${model.counts.ready} • Blocked ${model.counts.blocked} • Active ${model.counts.inProgress} • Review ${model.counts.review}`;
}

function selectedTicketRef(state: WorkbenchState, model: TicketWorkbenchModel): string | null {
  if (state.activeTab === "detail") {
    return state.detailRef ?? state.selectedByTab.detail ?? model.tickets[0]?.id ?? null;
  }
  const current = state.selectedByTab[state.activeTab];
  if (current) {
    return current;
  }
  const fallback = currentTabTickets(state, model)[0]?.id ?? null;
  state.selectedByTab[state.activeTab] = fallback;
  return fallback;
}

function deriveInitialTab(view: TicketWorkspaceView): TicketWorkbenchTabId {
  switch (view.kind) {
    case "home":
      return "overview";
    case "list":
      return "list";
    case "board":
      return view.filter ? "inbox" : "board";
    case "timeline":
      return "timeline";
    case "detail":
      return "detail";
  }
}

function currentTabTickets(state: WorkbenchState, model: TicketWorkbenchModel): TicketSummary[] {
  switch (state.activeTab) {
    case "overview":
      return getOverviewTickets(model);
    case "inbox":
      return getInboxTickets(model, state.inboxFilter);
    case "list":
      return model.tickets;
    case "board":
      return getBoardTickets(model, state.boardFilter);
    case "timeline":
      return model.timeline;
    case "detail":
      return state.detailRef
        ? [getTicketById(model, state.detailRef)].filter((value): value is TicketSummary => Boolean(value))
        : [];
  }
}

function moveSelection(state: WorkbenchState, model: TicketWorkbenchModel, delta: number): void {
  const tickets = currentTabTickets(state, model);
  if (tickets.length === 0 || state.activeTab === "detail") {
    return;
  }
  const current = selectedTicketRef(state, model);
  const currentIndex = Math.max(
    0,
    tickets.findIndex((ticket) => ticket.id === current),
  );
  const nextIndex = (currentIndex + delta + tickets.length) % tickets.length;
  state.selectedByTab[state.activeTab] = tickets[nextIndex]?.id ?? null;
}

function setActiveTab(state: WorkbenchState, tab: TicketWorkbenchTabId, model: TicketWorkbenchModel): void {
  const previouslySelected =
    state.activeTab === "detail"
      ? (state.detailRef ?? state.selectedByTab.detail ?? model.tickets[0]?.id ?? null)
      : (state.selectedByTab[state.activeTab] ?? currentTabTickets(state, model)[0]?.id ?? null);

  state.activeTab = tab;
  if (tab === "detail") {
    state.detailRef = previouslySelected ?? state.detailRef ?? model.tickets[0]?.id ?? null;
    state.selectedByTab.detail = state.detailRef;
    return;
  }
  if (!state.selectedByTab[tab]) {
    state.selectedByTab[tab] = currentTabTickets(state, model)[0]?.id ?? null;
  }
}

function previewLines(
  summary: TicketSummary | null,
  detail: TicketReadResult | null,
  graph: TicketGraphResult,
): string[] {
  if (!summary) {
    return ["Select a ticket to inspect details."];
  }
  const node = graph.nodes[summary.id];
  const lines = [
    `${summary.id}`,
    summary.title,
    formatStatus(summary),
    `Updated ${summary.updatedAt}`,
    `Deps: ${summary.deps.length > 0 ? summary.deps.join(", ") : "none"}`,
    `Blocked by: ${node?.blockedBy.length ? node.blockedBy.join(", ") : "none"}`,
  ];
  if (detail) {
    const journalEntry = detail.journal.at(-1);
    if (detail.ticket.body.summary.trim()) {
      lines.push("");
      lines.push(detail.ticket.body.summary.trim());
    }
    if (journalEntry) {
      lines.push("");
      lines.push(`Latest journal: ${journalEntry.kind} • ${journalEntry.createdAt}`);
      lines.push(journalEntry.text);
    }
  }
  return lines;
}

function renderOverview(state: WorkbenchState, model: TicketWorkbenchModel, theme: Theme, width: number): string[] {
  const selectedRef = selectedTicketRef(state, model);
  const highlightTickets = getOverviewTickets(model);
  const blockers = new Map(
    model.blocked.map((entry) => [entry.ticket.id, `blocked by ${entry.blockers.join(", ") || "unknown"}`]),
  );
  return [
    theme.fg("accent", renderWidgetCounts(model)),
    "",
    theme.fg("dim", "Ready now"),
    ...ticketRows(model.ready.slice(0, 4), selectedRef, theme, width, undefined),
    "",
    theme.fg("dim", "Blocked attention"),
    ...ticketRows(
      model.blocked.slice(0, 4).map((entry) => entry.ticket),
      selectedRef,
      theme,
      width,
      blockers,
    ),
    "",
    theme.fg("dim", "Recent movement"),
    ...ticketRows(model.recent.slice(0, 4), selectedRef, theme, width),
    "",
    theme.fg("dim", `Spotlight queue: ${highlightTickets.length} ticket(s)`),
  ];
}

function renderInbox(state: WorkbenchState, model: TicketWorkbenchModel, theme: Theme, width: number): string[] {
  const selectedRef = selectedTicketRef(state, model);
  const blockedMap = new Map(
    model.blocked.map((entry) => [entry.ticket.id, `blocked by ${entry.blockers.join(", ") || "unknown"}`]),
  );
  const blockedTickets = getInboxTickets(model, "blocked");
  const readyTickets = getInboxTickets(model, "ready");
  const filterLabel = state.inboxFilter ? `Focus: ${describeFilter(state.inboxFilter)}` : "Focus: all review lanes";
  return [
    theme.fg("accent", filterLabel),
    theme.fg("dim", "Keys: [b] blocked • [r] ready • [i] all"),
    "",
    ...(state.inboxFilter === "ready"
      ? [theme.fg("dim", "Ready review"), ...ticketRows(readyTickets, selectedRef, theme, width)]
      : state.inboxFilter === "blocked"
        ? [theme.fg("dim", "Blocked review"), ...ticketRows(blockedTickets, selectedRef, theme, width, blockedMap)]
        : [
            theme.fg("dim", "Blocked review"),
            ...ticketRows(blockedTickets, selectedRef, theme, width, blockedMap),
            "",
            theme.fg("dim", "Ready review"),
            ...ticketRows(readyTickets, selectedRef, theme, width),
          ]),
  ];
}

function renderList(state: WorkbenchState, model: TicketWorkbenchModel, theme: Theme, width: number): string[] {
  const selectedRef = selectedTicketRef(state, model);
  return [
    theme.fg("accent", `Full backlog • ${model.tickets.length} ticket(s)`),
    "",
    ...ticketRows(model.tickets, selectedRef, theme, width),
  ];
}

function renderBoard(state: WorkbenchState, model: TicketWorkbenchModel, theme: Theme, width: number): string[] {
  const selectedRef = selectedTicketRef(state, model);
  const lines = [theme.fg("accent", "Status board"), ""];
  const statusOrder: TicketStatus[] = ["ready", "in_progress", "review", "blocked", "open", "closed"];
  for (const status of statusOrder) {
    const tickets = model.byStatus[status];
    lines.push(theme.fg("dim", `${status.replaceAll("_", " ")} (${tickets.length})`));
    lines.push(...ticketRows(tickets, selectedRef, theme, width));
    lines.push("");
  }
  return lines;
}

function renderTimeline(state: WorkbenchState, model: TicketWorkbenchModel, theme: Theme, width: number): string[] {
  const selectedRef = selectedTicketRef(state, model);
  const extras = new Map(model.timeline.map((ticket) => [ticket.id, `${ticket.updatedAt} • ${ticket.status}`]));
  return [theme.fg("accent", "Recent timeline"), "", ...ticketRows(model.timeline, selectedRef, theme, width, extras)];
}

function renderDetail(
  state: WorkbenchState,
  model: TicketWorkbenchModel,
  detailCache: Map<string, TicketReadResult>,
  detailState: DetailLoadState,
  graph: TicketGraphResult,
  theme: Theme,
): string[] {
  const ref = selectedTicketRef(state, model);
  if (!ref) {
    return ["No ticket selected."];
  }
  const summary = getTicketById(model, ref);
  const detail = detailCache.get(ref);
  if (detail) {
    return renderTicketDetail(detail).split("\n");
  }
  if (detailState.loadingRefs.has(ref)) {
    return [theme.fg("dim", `Loading ${ref}…`)];
  }

  return [
    ...(detailState.failedRefs.has(ref)
      ? [theme.fg("warning", `Detail unavailable for ${ref}. Showing summary-only fallback.`), ""]
      : []),
    ...previewLines(summary, null, graph),
  ];
}

function renderMainPane(
  state: WorkbenchState,
  model: TicketWorkbenchModel,
  detailCache: Map<string, TicketReadResult>,
  detailState: DetailLoadState,
  graph: TicketGraphResult,
  theme: Theme,
  width: number,
): string[] {
  switch (state.activeTab) {
    case "overview":
      return renderOverview(state, model, theme, width);
    case "inbox":
      return renderInbox(state, model, theme, width);
    case "list":
      return renderList(state, model, theme, width);
    case "board":
      return renderBoard(state, model, theme, width);
    case "timeline":
      return renderTimeline(state, model, theme, width);
    case "detail":
      return renderDetail(state, model, detailCache, detailState, graph, theme);
  }
}

function fieldLabel(field: TicketWorkspaceField): string {
  switch (field) {
    case "reviewStatus":
      return "Edit review status";
    case "journalSummary":
      return "Edit journal summary";
    default:
      return `Edit ${field}`;
  }
}

function buildMenuOptions(
  menu: Exclude<WorkbenchMenu, null>,
  state: WorkbenchState,
  model: TicketWorkbenchModel,
  close: () => TicketWorkspaceAction,
): MenuOption[] {
  const summary = getTicketById(model, menu.ref);
  if (menu.kind === "actions") {
    const options: MenuOption[] = [];
    if (state.activeTab !== "detail") {
      options.push({
        label: `Open ${menu.ref} detail`,
        description: summary?.title,
        perform: () => {
          state.previousTab = state.activeTab;
          state.detailRef = menu.ref;
          state.selectedByTab.detail = menu.ref;
          state.menu = null;
          setActiveTab(state, "detail", model);
        },
      });
    }
    options.push(
      {
        label: "Change status",
        description: "Open the bounded status menu",
        perform: () => {
          state.menu = { kind: "status", ref: menu.ref, selectedIndex: 0 };
        },
      },
      {
        label: "Create ticket",
        description: "Capture new work from anywhere in the workbench",
        perform: () => ({ kind: "create" }),
      },
      { label: "Close workbench", description: "Return to the normal shell flow", perform: close },
    );
    if (summary?.closed) {
      return options;
    }
    options.splice(
      2,
      0,
      {
        label: "Edit fields",
        description: "Choose a field to edit",
        perform: () => {
          state.menu = { kind: "edit", ref: menu.ref, selectedIndex: 0 };
        },
      },
      {
        label: "Dependencies",
        description: "Add or remove blockers and prerequisites",
        perform: () => {
          state.menu = { kind: "dependency", ref: menu.ref, selectedIndex: 0 };
        },
      },
    );
    return options;
  }

  if (menu.kind === "status") {
    return summary?.closed
      ? [
          {
            label: `Reopen ${menu.ref}`,
            description: summary?.title,
            perform: () => ({ kind: "status", ref: menu.ref, status: "reopen" }),
          },
        ]
      : [
          {
            label: "Set open",
            description: "Move back to open tracking",
            perform: () => ({ kind: "status", ref: menu.ref, status: "open" }),
          },
          {
            label: "Set in progress",
            description: "Mark active work",
            perform: () => ({ kind: "status", ref: menu.ref, status: "in_progress" }),
          },
          {
            label: "Set review",
            description: "Mark ready for review",
            perform: () => ({ kind: "status", ref: menu.ref, status: "review" }),
          },
          {
            label: "Close ticket",
            description: "Archive with a verification note",
            perform: () => ({ kind: "status", ref: menu.ref, status: "close" }),
          },
        ];
  }

  if (menu.kind === "dependency") {
    return [
      {
        label: `Add dependency to ${menu.ref}`,
        description: summary?.title,
        perform: () => ({ kind: "dependency", ref: menu.ref, mode: "add" }),
      },
      {
        label: `Remove dependency from ${menu.ref}`,
        description: summary?.title,
        perform: () => ({ kind: "dependency", ref: menu.ref, mode: "remove" }),
      },
    ];
  }

  return EDITABLE_FIELDS.map((field) => ({
    label: fieldLabel(field),
    description: summary?.title,
    perform: () => ({ kind: "edit", ref: menu.ref, field }),
  }));
}

function renderMenu(menu: Exclude<WorkbenchMenu, null>, options: MenuOption[], theme: Theme, width: number): string[] {
  const lines = options.flatMap((option, index) => {
    const selected = index === menu.selectedIndex;
    const prefix = selected ? theme.fg("accent", ">") : " ";
    const label = selected ? theme.fg("accent", option.label) : option.label;
    const description = option.description ? theme.fg("dim", ` ${option.description}`) : "";
    return [`${prefix} ${truncateToWidth(`${label}${description}`, Math.max(12, width - 2), "…", true)}`];
  });
  return box(
    menu.kind === "actions" ? `Actions • ${menu.ref}` : `${TAB_LABELS.detail} menu • ${menu.ref}`,
    lines,
    width,
    theme,
  );
}

export async function syncTicketHomeWidget(ctx: ExtensionContext): Promise<void> {
  if (!("ui" in ctx) || typeof ctx.ui?.setWidget !== "function") {
    return;
  }
  const store = createTicketStore(ctx.cwd);
  await store.initLedgerAsync();
  const tickets = await store.listTicketsAsync({ includeClosed: true });
  const model = createTicketWorkbenchModel(tickets, await store.graphAsync());
  const lines = [
    renderWidgetCounts(model),
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
  const model = createTicketWorkbenchModel(snapshot.tickets, snapshot.graph);
  const tickets = orderedTickets(snapshot.tickets);
  switch (snapshot.view.kind) {
    case "home": {
      return [
        "Ticket workbench: overview",
        renderWidgetCounts(model),
        "",
        "Ready now:",
        ...(model.ready.length > 0
          ? model.ready.slice(0, 5).map((ticket) => `${ticket.id} [${ticket.status}] ${ticket.title}`)
          : ["(none)"]),
        "",
        "Blocked attention:",
        ...(model.blocked.length > 0
          ? model.blocked
              .slice(0, 5)
              .map(
                (entry) =>
                  `${entry.ticket.id} blocked by ${entry.blockers.join(", ") || "unknown"} • ${entry.ticket.title}`,
              )
          : ["(none)"]),
        "",
        "Recent movement:",
        ...recentChangeLines(tickets),
        "",
        "Next actions:",
        ...nextActionLines(tickets),
      ].join("\n");
    }
    case "list": {
      return [
        `Ticket workbench: list (${describeFilter(snapshot.view.filter)})`,
        ...(tickets.length > 0
          ? tickets.map(
              (ticket) => `${ticket.id} [${ticket.status}] (${ticket.type}/${ticket.priority}) ${ticket.title}`,
            )
          : ["No tickets in this view."]),
      ].join("\n");
    }
    case "board": {
      if (snapshot.view.filter === "ready") {
        return [
          "Ticket workbench: inbox (ready review)",
          ...(model.ready.length > 0
            ? model.ready.map((ticket) => `${ticket.id} [${ticket.status}] ${ticket.title}`)
            : ["(none)"]),
        ].join("\n");
      }
      if (snapshot.view.filter === "blocked") {
        return [
          "Ticket workbench: inbox (blocked review)",
          ...(model.blocked.length > 0
            ? model.blocked.map(
                (entry) =>
                  `${entry.ticket.id} blocked by ${entry.blockers.join(", ") || "unknown"} • ${entry.ticket.title}`,
              )
            : ["(none)"]),
        ].join("\n");
      }
      return [
        "Ticket workbench: board",
        "",
        "Ready:",
        ...(model.byStatus.ready.length > 0
          ? model.byStatus.ready.map((ticket) => `${ticket.id} ${ticket.title}`)
          : ["(none)"]),
        "",
        "In progress:",
        ...(model.byStatus.in_progress.length > 0
          ? model.byStatus.in_progress.map((ticket) => `${ticket.id} ${ticket.title}`)
          : ["(none)"]),
        "",
        "Review:",
        ...(model.byStatus.review.length > 0
          ? model.byStatus.review.map((ticket) => `${ticket.id} ${ticket.title}`)
          : ["(none)"]),
        "",
        "Blocked:",
        ...(model.byStatus.blocked.length > 0
          ? model.byStatus.blocked.map((ticket) => `${ticket.id} ${ticket.title}`)
          : ["(none)"]),
        "",
        "Closed:",
        ...(model.byStatus.closed.length > 0
          ? model.byStatus.closed.map((ticket) => `${ticket.id} ${ticket.title}`)
          : ["(none)"]),
      ].join("\n");
    }
    case "timeline": {
      return [
        "Ticket workbench: timeline",
        ...(model.timeline.length > 0
          ? model.timeline.map((ticket) => `${ticket.updatedAt} ${ticket.id} [${ticket.status}] ${ticket.title}`)
          : ["No tickets yet."]),
      ].join("\n");
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

export async function openInteractiveTicketWorkspace(
  ctx: ExtensionCommandContext,
  store: TicketStore,
  snapshot: TicketWorkspaceSnapshot,
): Promise<TicketWorkspaceAction | null> {
  return ctx.ui.custom<TicketWorkspaceAction | null>(
    (tui, theme, _keybindings, done) => {
      const model = createTicketWorkbenchModel(snapshot.tickets, snapshot.graph);
      const detailCache = new Map<string, TicketReadResult>();
      const detailState: DetailLoadState = { failedRefs: new Set<string>(), loadingRefs: new Set<string>() };
      if (snapshot.detail) {
        detailCache.set(snapshot.detail.summary.id, snapshot.detail);
      }
      const state: WorkbenchState = {
        activeTab: deriveInitialTab(snapshot.view),
        previousTab: null,
        inboxFilter: snapshot.view.kind === "board" ? snapshot.view.filter : undefined,
        boardFilter: snapshot.view.kind === "board" && !snapshot.view.filter ? undefined : undefined,
        selectedByTab: {
          overview: getOverviewTickets(model)[0]?.id ?? null,
          inbox:
            getInboxTickets(model, snapshot.view.kind === "board" ? snapshot.view.filter : undefined)[0]?.id ?? null,
          list: model.tickets[0]?.id ?? null,
          board: getBoardTickets(model)[0]?.id ?? null,
          timeline: model.timeline[0]?.id ?? null,
          detail: snapshot.detail?.summary.id ?? (snapshot.view.kind === "detail" ? snapshot.view.ref : null),
        },
        detailRef: snapshot.detail?.summary.id ?? (snapshot.view.kind === "detail" ? snapshot.view.ref : null),
        menu: null,
      };

      const ensureDetail = (ref: string | null): void => {
        if (!ref || detailCache.has(ref) || detailState.loadingRefs.has(ref) || detailState.failedRefs.has(ref)) {
          return;
        }
        detailState.loadingRefs.add(ref);
        void store
          .readTicketAsync(ref)
          .then((result) => {
            detailCache.set(ref, result);
            tui.requestRender();
          })
          .catch(() => {
            detailState.failedRefs.add(ref);
            tui.requestRender();
          })
          .finally(() => {
            detailState.loadingRefs.delete(ref);
            tui.requestRender();
          });
      };

      const close = (): TicketWorkspaceAction => ({ kind: "close" });

      const currentRef = (): string | null => selectedTicketRef(state, model);

      const moveTab = (delta: number): void => {
        const currentIndex = TAB_ORDER.indexOf(state.activeTab);
        const nextIndex = (currentIndex + delta + TAB_ORDER.length) % TAB_ORDER.length;
        setActiveTab(state, TAB_ORDER[nextIndex] ?? "overview", model);
        ensureDetail(currentRef());
      };

      ensureDetail(currentRef());

      return {
        render(width: number): string[] {
          ensureDetail(currentRef());
          const mainWidth = width >= 116 && state.activeTab !== "detail" ? Math.floor(width * 0.58) : width;
          const sideWidth = width >= 116 && state.activeTab !== "detail" ? width - mainWidth - 2 : width;
          const ref = currentRef();
          const summary = getTicketById(model, ref);
          const detail = ref ? (detailCache.get(ref) ?? null) : null;
          const header = [
            theme.fg("accent", theme.bold("Ticket Workbench")),
            theme.fg("dim", renderWidgetCounts(model)),
            renderTabBar(state.activeTab, theme, width),
            "",
          ];

          const main = box(
            TAB_LABELS[state.activeTab],
            renderMainPane(state, model, detailCache, detailState, snapshot.graph, theme, Math.max(20, mainWidth - 2)),
            mainWidth,
            theme,
          );
          const sidebar = box(
            summary ? `Selected • ${summary.id}` : "Selected",
            previewLines(summary, detail, snapshot.graph),
            sideWidth,
            theme,
          );
          const body =
            width >= 116 && state.activeTab !== "detail"
              ? combineColumns(main, sidebar, mainWidth, sideWidth)
              : [...main, "", ...sidebar];

          const menuLines = state.menu
            ? [
                "",
                ...renderMenu(
                  state.menu,
                  buildMenuOptions(state.menu, state, model, close),
                  theme,
                  Math.min(width, 72),
                ),
              ]
            : [];

          const footer = state.menu
            ? theme.fg("dim", "Use ↑/↓ or j/k • Enter chooses • Esc backs out of the menu")
            : state.activeTab === "inbox"
              ? theme.fg(
                  "dim",
                  "Use Tab/←/→ tabs • ↑/↓ or j/k move • Enter opens detail • a actions • n new • b/r/i filter inbox • Esc backs out",
                )
              : theme.fg(
                  "dim",
                  "Use Tab/←/→ tabs • ↑/↓ or j/k move • Enter opens detail • a actions • n new • Esc backs out",
                );

          return [...header, ...body, ...menuLines, "", footer];
        },
        handleInput(data: string): void {
          const isUp = data === "\u001b[A" || data === "k";
          const isDown = data === "\u001b[B" || data === "j";
          const isLeft = data === "\u001b[D" || data === "\u001b[Z";
          const isRight = data === "\u001b[C" || data === "\t";
          const isEnter = data === "\r" || data === "\n";
          const isEscape = data === "\u001b" || data === "\u0003";

          if (state.menu) {
            const options = buildMenuOptions(state.menu, state, model, close);
            if (isUp) {
              state.menu.selectedIndex = (state.menu.selectedIndex - 1 + options.length) % options.length;
              return;
            }
            if (isDown) {
              state.menu.selectedIndex = (state.menu.selectedIndex + 1) % options.length;
              return;
            }
            if (isEscape) {
              state.menu =
                state.menu.kind === "actions" ? null : { kind: "actions", ref: state.menu.ref, selectedIndex: 0 };
              return;
            }
            if (isEnter) {
              const result = options[state.menu.selectedIndex]?.perform();
              if (result) {
                done(result);
              }
            }
            return;
          }

          if (data === "n") {
            done({ kind: "create" });
            return;
          }
          if (data === "a") {
            const ref = currentRef();
            if (ref) {
              state.menu = { kind: "actions", ref, selectedIndex: 0 };
            } else {
              done({ kind: "create" });
            }
            return;
          }
          if (state.activeTab === "inbox") {
            if (data === "b") {
              state.inboxFilter = "blocked";
              state.selectedByTab.inbox = getInboxTickets(model, "blocked")[0]?.id ?? null;
              ensureDetail(currentRef());
              return;
            }
            if (data === "r") {
              state.inboxFilter = "ready";
              state.selectedByTab.inbox = getInboxTickets(model, "ready")[0]?.id ?? null;
              ensureDetail(currentRef());
              return;
            }
            if (data === "i") {
              state.inboxFilter = undefined;
              state.selectedByTab.inbox = getInboxTickets(model)[0]?.id ?? null;
              ensureDetail(currentRef());
              return;
            }
          }
          if (isLeft) {
            moveTab(-1);
            return;
          }
          if (isRight) {
            moveTab(1);
            return;
          }
          if (isUp) {
            moveSelection(state, model, -1);
            ensureDetail(currentRef());
            return;
          }
          if (isDown) {
            moveSelection(state, model, 1);
            ensureDetail(currentRef());
            return;
          }
          if (isEscape) {
            if (state.activeTab === "detail" && state.previousTab) {
              setActiveTab(state, state.previousTab, model);
              state.previousTab = null;
              return;
            }
            done(null);
            return;
          }
          if (isEnter) {
            const ref = currentRef();
            if (!ref) {
              done({ kind: "create" });
              return;
            }
            if (state.activeTab === "detail") {
              state.menu = { kind: "actions", ref, selectedIndex: 0 };
              return;
            }
            state.previousTab = state.activeTab;
            state.detailRef = ref;
            state.selectedByTab.detail = ref;
            setActiveTab(state, "detail", model);
            ensureDetail(ref);
          }
        },
        invalidate(): void {},
      };
    },
    {
      overlay: true,
      overlayOptions: {
        anchor: "center",
        width: "88%",
        maxHeight: "85%",
      },
    },
  );
}
