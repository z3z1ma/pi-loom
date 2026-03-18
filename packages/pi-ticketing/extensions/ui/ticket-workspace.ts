import type { ExtensionCommandContext, ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";
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
  detailScrollOffset: number;
  detailMaxScroll: number;
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

const TAB_ICONS: Record<TicketWorkbenchTabId, string> = {
  overview: "✨",
  inbox: "📥",
  list: "📚",
  board: "🗂",
  timeline: "🕒",
  detail: "🧾",
};

const OVERLAY_WIDTH = 96;
const OVERLAY_MAX_HEIGHT = 40;
const MAIN_BOX_LINES = 28;
const SIDEBAR_LINES = 24;
const MENU_LINES = 8;
const NARROW_MAIN_BOX_LINES = 18;
const NARROW_SIDEBAR_LINES = 9;

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

function viewportRange(total: number, selectedIndex: number, maxVisible: number): { start: number; end: number } {
  if (total <= maxVisible) {
    return { start: 0, end: total };
  }
  const start = Math.max(0, Math.min(selectedIndex - Math.floor(maxVisible / 2), total - maxVisible));
  return { start, end: Math.min(total, start + maxVisible) };
}

function viewportLines(lines: string[], maxVisible: number, offset = 0): string[] {
  const overflowing = lines.length > maxVisible;
  const visibleBudget = overflowing ? Math.max(1, maxVisible - 1) : maxVisible;
  const safeOffset = Math.max(0, Math.min(offset, Math.max(0, lines.length - visibleBudget)));
  const visible = lines.slice(safeOffset, safeOffset + visibleBudget);
  if (overflowing) {
    visible.push(`… ${safeOffset + 1}-${Math.min(lines.length, safeOffset + visibleBudget)} / ${lines.length}`);
  }
  return visible;
}

function wrapDisplayLines(lines: string[], width: number): string[] {
  return lines.flatMap((line) => {
    if (!line) {
      return [""];
    }
    const wrapped = wrapTextWithAnsi(line, Math.max(1, width));
    return wrapped.length > 0 ? wrapped : [""];
  });
}

function statusLabel(status: TicketStatus): string {
  return status.replaceAll("_", " ");
}

function statusColor(status: TicketStatus): "success" | "warning" | "muted" | "dim" | "accent" {
  switch (status) {
    case "ready":
      return "success";
    case "blocked":
      return "warning";
    case "in_progress":
      return "accent";
    case "review":
      return "muted";
    case "closed":
      return "dim";
    case "open":
      return "muted";
  }
}

function statChip(
  label: string,
  value: number,
  color: "accent" | "success" | "warning" | "dim" | "muted",
  theme: Theme,
): string {
  return theme.fg(color, `${label} ${value}`);
}

function box(title: string, lines: string[], width: number, theme: Theme, maxBodyLines?: number): string[] {
  const innerWidth = Math.max(10, width - 2);
  const titleText = ` ${title} `;
  const ruleWidth = Math.max(0, innerWidth - visibleWidth(titleText));
  const leftRule = "─".repeat(Math.floor(ruleWidth / 2));
  const rightRule = "─".repeat(Math.max(0, ruleWidth - leftRule.length));
  const top = `${theme.fg("borderAccent", "╭")}${theme.fg("borderMuted", leftRule)}${theme.fg("accent", theme.bold(titleText))}${theme.fg("borderMuted", rightRule)}${theme.fg("borderAccent", "╮")}`;
  const bottom = `${theme.fg("borderAccent", "╰")}${theme.fg("borderMuted", "─".repeat(innerWidth))}${theme.fg("borderAccent", "╯")}`;
  const normalizedLines = wrapDisplayLines(
    lines.flatMap((line) => line.split("\n")),
    innerWidth,
  );
  const rawBodyLines = maxBodyLines ? viewportLines(normalizedLines, maxBodyLines) : normalizedLines;
  const bodyLines =
    maxBodyLines && rawBodyLines.length < maxBodyLines
      ? [...rawBodyLines, ...Array.from({ length: maxBodyLines - rawBodyLines.length }, () => "")]
      : rawBodyLines;
  const body = bodyLines.map((line) => {
    const content = truncateToWidth(line, innerWidth, "…", true);
    const padding = Math.max(0, innerWidth - visibleWidth(content));
    return `${theme.fg("borderMuted", "│")}${content}${" ".repeat(padding)}${theme.fg("borderMuted", "│")}`;
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
  return `${ticket.type}/${ticket.priority}`;
}

function ticketRows(
  tickets: TicketSummary[],
  selectedRef: string | null,
  theme: Theme,
  width: number,
  maxTickets: number,
  extras?: Map<string, string>,
): string[] {
  if (tickets.length === 0) {
    return [theme.fg("dim", "(none)")];
  }

  const selectedIndex = Math.max(
    0,
    tickets.findIndex((ticket) => ticket.id === selectedRef),
  );
  const { start, end } = viewportRange(tickets.length, selectedIndex, maxTickets);
  const lines: string[] = [];
  for (const ticket of tickets.slice(start, end)) {
    const selected = ticket.id === selectedRef;
    const prefix = selected ? theme.fg("accent", "›") : theme.fg("dim", "·");
    const titleText = `${ticket.id} ${ticket.title}`;
    const wrappedTitle = wrapTextWithAnsi(titleText, Math.max(12, width - 4));
    wrappedTitle.forEach((segment, index) => {
      const decorated = selected ? theme.bg("selectedBg", theme.fg("text", segment)) : segment;
      lines.push(`${index === 0 ? prefix : " ".repeat(visibleWidth(prefix))} ${decorated}`);
    });
    const extra =
      extras?.get(ticket.id) ??
      `${statusLabel(ticket.status)} • ${formatStatus(ticket)} • ${compactIso(ticket.updatedAt)}`;
    const wrappedExtra = wrapTextWithAnsi(theme.fg(statusColor(ticket.status), extra), Math.max(10, width - 3));
    for (const segment of wrappedExtra) {
      lines.push(`  ${segment}`);
    }
  }
  if (start > 0 || end < tickets.length) {
    lines.push(theme.fg("dim", `… ${selectedIndex + 1}/${tickets.length}`));
  }
  return lines;
}

function renderTabBar(activeTab: TicketWorkbenchTabId, theme: Theme, width: number): string {
  const pieces = TAB_ORDER.map((tab) => {
    const label = ` ${TAB_ICONS[tab]} ${TAB_LABELS[tab]} `;
    return tab === activeTab ? theme.bg("selectedBg", theme.fg("text", theme.bold(label))) : theme.fg("muted", label);
  });
  const suffix = theme.fg("dim", "(Tab / ← →)");
  return truncateToWidth(`Tickets  ${pieces.join(" ")}  ${suffix}`, width, "…", true);
}

function renderWidgetCounts(model: TicketWorkbenchModel, theme: Theme): string {
  return [
    statChip("total", model.counts.total, "dim", theme),
    statChip("ready", model.counts.ready, "success", theme),
    statChip("blocked", model.counts.blocked, "warning", theme),
    statChip("active", model.counts.inProgress, "muted", theme),
    statChip("review", model.counts.review, "muted", theme),
  ].join(" ");
}

function renderWidgetCountsText(model: TicketWorkbenchModel): string {
  return `Tickets ${model.counts.total} total • Ready ${model.counts.ready} • Blocked ${model.counts.blocked} • Active ${model.counts.inProgress} • Review ${model.counts.review}`;
}

function formatTimelineBucket(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);
  const key = date.toISOString().slice(0, 10);
  if (key === todayKey) {
    return "Today";
  }
  if (key === yesterdayKey) {
    return "Yesterday";
  }
  return key;
}

function compactIso(timestamp: string): string {
  return timestamp.replace("T", " ").replace(/\.\d+Z$/, "Z");
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

function moveDetailScroll(state: WorkbenchState, delta: number): void {
  state.detailScrollOffset = Math.max(0, Math.min(state.detailMaxScroll, state.detailScrollOffset + delta));
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
    state.detailScrollOffset = 0;
    state.detailMaxScroll = 0;
    return;
  }
  state.detailScrollOffset = 0;
  state.detailMaxScroll = 0;
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
    return ["Pick a ticket to inspect detail."];
  }
  const node = graph.nodes[summary.id];
  const lines = [
    `${summary.id}`,
    summary.title,
    "",
    `Status ${statusLabel(summary.status)} • ${summary.type}/${summary.priority}`,
    `Updated ${compactIso(summary.updatedAt)}`,
    `Deps ${summary.deps.length > 0 ? summary.deps.join(", ") : "none"}`,
    `Blocked by ${node?.blockedBy.length ? node.blockedBy.join(", ") : "none"}`,
  ];
  if (detail) {
    const journalEntry = detail.journal.at(-1);
    const summaryText = detail.ticket.body.summary.trim();
    const acceptance =
      detail.ticket.frontmatter.acceptance.length > 0 ? detail.ticket.frontmatter.acceptance.join(" • ") : "(none)";
    lines.push("");
    lines.push("Summary");
    lines.push(summaryText || "(empty)");
    lines.push("");
    lines.push("Acceptance");
    lines.push(acceptance);
    if (detail.ticket.body.summary.trim()) {
      lines.push("");
    }
    if (journalEntry) {
      lines.push("Latest journal");
      lines.push(`${journalEntry.kind} • ${compactIso(journalEntry.createdAt)}`);
      lines.push(journalEntry.text);
    }
  }
  return lines;
}

function detailSection(title: string, value: string, theme: Theme): string[] {
  const trimmed = value.trim();
  return [theme.fg("dim", title), trimmed || theme.fg("muted", "(empty)")];
}

function renderInteractiveDetail(detail: TicketReadResult, theme: Theme): string[] {
  const { summary, ticket, journal, checkpoints, attachments, blockers, children } = detail;
  const latestJournal = journal.at(-1);
  const acceptance = ticket.frontmatter.acceptance.length > 0 ? ticket.frontmatter.acceptance.join(" • ") : "(none)";
  const links = ticket.frontmatter.links.length > 0 ? ticket.frontmatter.links.join(" • ") : "(none)";
  const metadata = [
    `${statusLabel(summary.status)} • ${summary.type}/${summary.priority} • risk ${ticket.frontmatter.risk}`,
    `Updated ${compactIso(summary.updatedAt)} • review ${ticket.frontmatter["review-status"]}`,
    `Deps ${summary.deps.length > 0 ? summary.deps.join(", ") : "none"} • blockers ${blockers.length > 0 ? blockers.join(", ") : "none"}`,
    `Journal ${journal.length} • checkpoints ${checkpoints.length} • attachments ${attachments.length} • children ${children.length}`,
  ];

  const lines = [summary.id, summary.title, "", ...metadata, ""];

  lines.push(...detailSection("Summary", ticket.body.summary, theme), "");
  lines.push(theme.fg("dim", "Acceptance"), acceptance, "");
  lines.push(...detailSection("Plan", ticket.body.plan, theme), "");
  lines.push(...detailSection("Notes", ticket.body.notes, theme), "");
  lines.push(theme.fg("dim", "Links"), links, "");

  if (latestJournal) {
    lines.push(theme.fg("dim", "Latest journal"));
    lines.push(`${latestJournal.kind} • ${compactIso(latestJournal.createdAt)}`);
    lines.push(latestJournal.text);
    lines.push("");
  }

  if (checkpoints.length > 0) {
    lines.push(theme.fg("dim", "Recent checkpoints"));
    for (const checkpoint of checkpoints.slice(-2)) {
      lines.push(`${checkpoint.id} • ${checkpoint.title}`);
    }
    lines.push("");
  }

  if (attachments.length > 0) {
    lines.push(theme.fg("dim", "Attachments"));
    for (const attachment of attachments.slice(-2)) {
      lines.push(`${attachment.label} • ${attachment.mediaType}`);
    }
  }

  return lines;
}

function renderOverview(
  state: WorkbenchState,
  model: TicketWorkbenchModel,
  theme: Theme,
  width: number,
  maxLines: number,
): string[] {
  const selectedRef = selectedTicketRef(state, model);
  const blockers = new Map(
    model.blocked.map((entry) => [entry.ticket.id, `blocked by ${entry.blockers.join(", ") || "unknown"}`]),
  );
  const recentClosedExtras = new Map(
    model.recentClosed.map((ticket) => [
      ticket.id,
      `${statusLabel(ticket.status)} • shipped ${compactIso(ticket.updatedAt)}`,
    ]),
  );
  if (maxLines <= 10) {
    return [
      renderWidgetCounts(model, theme),
      theme.fg("dim", `Next: ${nextActionLines(model.tickets).join(" • ")}`),
      "",
      theme.fg("dim", "Ready now"),
      ...ticketRows(model.ready, selectedRef, theme, width, 1),
      "",
      ...(model.blocked.length > 0
        ? [
            theme.fg("dim", "Blocked attention"),
            ...ticketRows(
              model.blocked.map((entry) => entry.ticket),
              selectedRef,
              theme,
              width,
              1,
              blockers,
            ),
          ]
        : [
            theme.fg("dim", "Recently closed"),
            ...ticketRows(model.recentClosed, selectedRef, theme, width, 1, recentClosedExtras),
          ]),
    ];
  }

  const compactTickets = Math.max(1, Math.min(2, Math.floor((maxLines - 9) / 6) || 1));
  return [
    renderWidgetCounts(model, theme),
    theme.fg("dim", `Next: ${nextActionLines(model.tickets).join(" • ")}`),
    "",
    theme.fg("dim", "Ready now"),
    ...ticketRows(model.ready, selectedRef, theme, width, compactTickets),
    "",
    theme.fg("dim", model.blocked.length > 0 ? "Blocked attention" : "Active now"),
    ...(model.blocked.length > 0
      ? ticketRows(
          model.blocked.map((entry) => entry.ticket),
          selectedRef,
          theme,
          width,
          compactTickets,
          blockers,
        )
      : ticketRows(model.active, selectedRef, theme, width, compactTickets)),
    "",
    theme.fg("dim", model.recentClosed.length > 0 ? "Recently closed" : "Recent movement"),
    ...(model.recentClosed.length > 0
      ? ticketRows(model.recentClosed, selectedRef, theme, width, compactTickets, recentClosedExtras)
      : ticketRows(model.recent, selectedRef, theme, width, compactTickets)),
  ];
}

function renderInbox(
  state: WorkbenchState,
  model: TicketWorkbenchModel,
  theme: Theme,
  width: number,
  maxLines: number,
): string[] {
  const selectedRef = selectedTicketRef(state, model);
  const blockedMap = new Map(
    model.blocked.map((entry) => [entry.ticket.id, `blocked by ${entry.blockers.join(", ") || "unknown"}`]),
  );
  const blockedTickets = getInboxTickets(model, "blocked");
  const readyTickets = getInboxTickets(model, "ready");
  const filterLabel = state.inboxFilter ? `Focus: ${describeFilter(state.inboxFilter)}` : "Focus: all review lanes";
  const filteredVisible = Math.max(1, Math.floor((maxLines - 4) / 2));
  const combinedVisible = Math.max(1, Math.floor((maxLines - 7) / 4));
  return [
    theme.fg("accent", filterLabel),
    theme.fg("dim", "Keys: b blocked • r ready • i all"),
    "",
    ...(state.inboxFilter === "ready"
      ? [theme.fg("dim", "Ready review"), ...ticketRows(readyTickets, selectedRef, theme, width, filteredVisible)]
      : state.inboxFilter === "blocked"
        ? [
            theme.fg("dim", "Blocked review"),
            ...ticketRows(blockedTickets, selectedRef, theme, width, filteredVisible, blockedMap),
          ]
        : [
            theme.fg("dim", "Blocked review"),
            ...ticketRows(blockedTickets, selectedRef, theme, width, combinedVisible, blockedMap),
            "",
            theme.fg("dim", "Ready review"),
            ...ticketRows(readyTickets, selectedRef, theme, width, combinedVisible),
          ]),
  ];
}

function renderList(
  state: WorkbenchState,
  model: TicketWorkbenchModel,
  theme: Theme,
  width: number,
  maxLines: number,
): string[] {
  const selectedRef = selectedTicketRef(state, model);
  const visibleTickets = Math.max(1, Math.floor((maxLines - 3) / 2));
  return [
    theme.fg("accent", `Full backlog • ${model.tickets.length} ticket(s)`),
    "",
    ...ticketRows(model.tickets, selectedRef, theme, width, visibleTickets),
  ];
}

function renderBoard(
  state: WorkbenchState,
  model: TicketWorkbenchModel,
  theme: Theme,
  width: number,
  maxLines: number,
): string[] {
  const selectedRef = selectedTicketRef(state, model);
  const blockedMap = new Map(
    model.blocked.map((entry) => [entry.ticket.id, `blocked by ${entry.blockers.join(", ") || "unknown"}`]),
  );
  const activeStatuses: TicketStatus[] = ["ready", "in_progress", "review", "blocked", "open"];
  const activeSections = activeStatuses.filter((status) => model.byStatus[status].length > 0);
  const visiblePerLane = activeSections.length <= 2 ? 2 : 1;
  const lines = [
    theme.fg("accent", "Action board"),
    theme.fg(
      "dim",
      `${statusLabel("ready")} ${model.byStatus.ready.length} • ${statusLabel("in_progress")} ${model.byStatus.in_progress.length} • ${statusLabel("review")} ${model.byStatus.review.length}`,
    ),
    theme.fg(
      "dim",
      `${statusLabel("blocked")} ${model.byStatus.blocked.length} • ${statusLabel("open")} ${model.byStatus.open.length} • closed hidden ${model.byStatus.closed.length}`,
    ),
    theme.fg("dim", "Press Enter for detail • use List for the full backlog including closed work"),
    "",
  ];

  for (const status of activeSections) {
    const tickets = model.byStatus[status];
    const extras = status === "blocked" ? blockedMap : undefined;
    lines.push(theme.fg(statusColor(status), `${statusLabel(status)} lane`));
    lines.push(...ticketRows(tickets, selectedRef, theme, width, visiblePerLane, extras));
    lines.push("");
  }

  if (activeSections.length === 0) {
    lines.push(theme.fg("dim", "No actionable tickets right now."));
    lines.push(
      theme.fg(
        "dim",
        `Recently closed: ${
          model.recentClosed
            .slice(0, 3)
            .map((ticket) => ticket.id)
            .join(", ") || "none"
        }`,
      ),
    );
  }

  return viewportLines(lines, maxLines);
}

function renderTimeline(
  state: WorkbenchState,
  model: TicketWorkbenchModel,
  theme: Theme,
  width: number,
  maxLines: number,
): string[] {
  const selectedRef = selectedTicketRef(state, model);
  const introLines = [
    theme.fg("accent", "Recent timeline"),
    theme.fg("dim", "Grouped by update day so status movement reads like a feed."),
    "",
  ];
  const bodyLines: string[] = [];
  let selectedBodyIndex = 0;

  let currentBucket: string | null = null;
  for (const ticket of model.timeline) {
    const bucket = formatTimelineBucket(ticket.updatedAt);
    if (bucket !== currentBucket) {
      bodyLines.push(theme.fg("dim", bucket));
      currentBucket = bucket;
    }
    const selected = ticket.id === selectedRef;
    const prefix = selected ? theme.fg("accent", "›") : theme.fg("dim", "·");
    const row = `${ticket.id} ${ticket.title}`;
    if (selected) {
      selectedBodyIndex = bodyLines.length;
    }
    const wrappedRow = wrapTextWithAnsi(row, Math.max(12, width - 4));
    wrappedRow.forEach((segment, index) => {
      const decorated = selected ? theme.bg("selectedBg", theme.fg("text", segment)) : segment;
      bodyLines.push(`${index === 0 ? prefix : " ".repeat(visibleWidth(prefix))} ${decorated}`);
    });
    const wrappedMeta = wrapTextWithAnsi(
      theme.fg("dim", `${compactIso(ticket.updatedAt)} • ${ticket.type}/${ticket.priority}`),
      Math.max(10, width - 3),
    );
    for (const segment of wrappedMeta) {
      bodyLines.push(`  ${segment}`);
    }
  }

  const bodyVisible = Math.max(1, maxLines - introLines.length);
  const { start, end } = viewportRange(bodyLines.length, selectedBodyIndex, bodyVisible);
  const visibleBody = bodyLines.slice(start, end);

  if (start > 0 || end < bodyLines.length) {
    visibleBody.push(theme.fg("dim", `… ${selectedBodyIndex + 1}/${bodyLines.length}`));
  }

  return [...introLines, ...visibleBody];
}

function renderDetail(
  state: WorkbenchState,
  model: TicketWorkbenchModel,
  detailCache: Map<string, TicketReadResult>,
  detailState: DetailLoadState,
  graph: TicketGraphResult,
  theme: Theme,
  maxLines: number,
): string[] {
  const ref = selectedTicketRef(state, model);
  if (!ref) {
    state.detailMaxScroll = 0;
    return ["No ticket selected."];
  }
  const summary = getTicketById(model, ref);
  const detail = detailCache.get(ref);
  const setMaxScroll = (lineCount: number): void => {
    const visibleBudget = lineCount > maxLines ? Math.max(1, maxLines - 1) : maxLines;
    state.detailMaxScroll = Math.max(0, lineCount - visibleBudget);
    state.detailScrollOffset = Math.min(state.detailScrollOffset, state.detailMaxScroll);
  };
  if (detail) {
    const lines = renderInteractiveDetail(detail, theme).flatMap((line) => line.split("\n"));
    setMaxScroll(lines.length);
    return viewportLines(lines, maxLines, state.detailScrollOffset);
  }
  if (detailState.loadingRefs.has(ref)) {
    state.detailMaxScroll = 0;
    return [theme.fg("dim", `Loading ${ref}…`)];
  }

  const fallbackLines = [
    ...(detailState.failedRefs.has(ref)
      ? [theme.fg("warning", `Detail unavailable for ${ref}. Showing summary-only fallback.`), ""]
      : []),
    ...previewLines(summary, null, graph),
  ].flatMap((line) => line.split("\n"));
  setMaxScroll(fallbackLines.length);
  return viewportLines(fallbackLines, maxLines, state.detailScrollOffset);
}

function renderMainPane(
  state: WorkbenchState,
  model: TicketWorkbenchModel,
  detailCache: Map<string, TicketReadResult>,
  detailState: DetailLoadState,
  graph: TicketGraphResult,
  theme: Theme,
  width: number,
  maxLines: number,
): string[] {
  switch (state.activeTab) {
    case "overview":
      return renderOverview(state, model, theme, width, maxLines);
    case "inbox":
      return renderInbox(state, model, theme, width, maxLines);
    case "list":
      return renderList(state, model, theme, width, maxLines);
    case "board":
      return renderBoard(state, model, theme, width, maxLines);
    case "timeline":
      return renderTimeline(state, model, theme, width, maxLines);
    case "detail":
      return renderDetail(state, model, detailCache, detailState, graph, theme, maxLines);
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
  const { start, end } = viewportRange(options.length, menu.selectedIndex, MENU_LINES);
  const lines = options.slice(start, end).flatMap((option, offset) => {
    const index = start + offset;
    const selected = index === menu.selectedIndex;
    const prefix = selected ? theme.fg("accent", "❯") : theme.fg("dim", "•");
    const label = selected ? theme.bg("selectedBg", theme.fg("text", option.label)) : option.label;
    const description = option.description ? theme.fg("dim", ` ${option.description}`) : "";
    return [`${prefix} ${truncateToWidth(`${label}${description}`, Math.max(12, width - 2), "…", true)}`];
  });
  if (start > 0 || end < options.length) {
    lines.push(theme.fg("dim", `… ${menu.selectedIndex + 1}/${options.length}`));
  }
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
    renderWidgetCountsText(model),
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
  const detail = view.kind === "detail" ? await store.readTicketAsync(view.ref).catch(() => null) : null;
  return { view, tickets, graph, detail };
}

export function renderTicketWorkspaceText(snapshot: TicketWorkspaceSnapshot): string {
  const model = createTicketWorkbenchModel(snapshot.tickets, snapshot.graph);
  const tickets = orderedTickets(snapshot.tickets);
  switch (snapshot.view.kind) {
    case "home": {
      return [
        "Ticket workbench: overview",
        renderWidgetCountsText(model),
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
        : (() => {
            const summary = model.tickets.find((ticket) => ticket.id === snapshot.view.ref) ?? null;
            return summary
              ? [`Ticket workbench: detail (${summary.id})`, "", ...previewLines(summary, null, snapshot.graph)].join(
                  "\n",
                )
              : `Unknown ticket: ${snapshot.view.ref}`;
          })();
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
        detailScrollOffset: 0,
        detailMaxScroll: 0,
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
        const currentTab = state.activeTab;
        const currentIndex = TAB_ORDER.indexOf(state.activeTab);
        const nextIndex = (currentIndex + delta + TAB_ORDER.length) % TAB_ORDER.length;
        const nextTab = TAB_ORDER[nextIndex] ?? "overview";
        if (nextTab === "detail" && currentTab !== "detail") {
          state.previousTab = currentTab;
        }
        if (currentTab === "detail" && nextTab !== "detail") {
          state.previousTab = null;
        }
        setActiveTab(state, nextTab, model);
        ensureDetail(currentRef());
      };

      ensureDetail(currentRef());

      return {
        render(width: number): string[] {
          ensureDetail(currentRef());
          const stackedLayout = width < 96;
          const mainWidth = width >= 96 && state.activeTab !== "detail" ? Math.floor(width * 0.58) : width;
          const sideWidth = width >= 96 && state.activeTab !== "detail" ? width - mainWidth - 2 : width;
          const mainBoxLines = stackedLayout && state.activeTab !== "detail" ? NARROW_MAIN_BOX_LINES : MAIN_BOX_LINES;
          const sidebarBoxLines = stackedLayout ? NARROW_SIDEBAR_LINES : SIDEBAR_LINES;
          const ref = currentRef();
          const summary = getTicketById(model, ref);
          const detail = ref ? (detailCache.get(ref) ?? null) : null;
          const keyboardHint = theme.fg("dim", "Tab / ← →");
          const header = [
            theme.fg("accent", theme.bold("Ticket Workbench")),
            renderWidgetCounts(model, theme),
            renderTabBar(state.activeTab, theme, Math.max(20, width - visibleWidth(keyboardHint) - 3)),
            "",
          ];

          const main = box(
            `${TAB_ICONS[state.activeTab]} ${TAB_LABELS[state.activeTab]}`,
            renderMainPane(
              state,
              model,
              detailCache,
              detailState,
              snapshot.graph,
              theme,
              Math.max(20, mainWidth - 2),
              mainBoxLines,
            ),
            mainWidth,
            theme,
            mainBoxLines,
          );
          const sidebar = box(
            summary ? `Selected • ${summary.id}` : "Selected",
            previewLines(summary, detail, snapshot.graph),
            sideWidth,
            theme,
            sidebarBoxLines,
          );
          const menuPanel = state.menu
            ? renderMenu(
                state.menu,
                buildMenuOptions(state.menu, state, model, close),
                theme,
                Math.min(width >= 96 && state.activeTab !== "detail" ? sideWidth : width, 72),
              )
            : null;
          const body = state.menu
            ? width >= 96 && state.activeTab !== "detail"
              ? combineColumns(main, menuPanel ?? [], mainWidth, sideWidth)
              : [
                  ...box(
                    summary ? `Focus • ${summary.id}` : "Focus",
                    previewLines(summary, detail, snapshot.graph),
                    width,
                    theme,
                    6,
                  ),
                  "",
                  ...(menuPanel ?? []),
                ]
            : state.activeTab === "detail"
              ? [...main]
              : width >= 96 && state.activeTab !== "detail"
                ? combineColumns(main, sidebar, mainWidth, sideWidth)
                : [...main, "", ...sidebar];

          const footer = state.menu
            ? theme.fg("dim", "↑ ↓ move • Enter choose • Esc back")
            : state.activeTab === "detail"
              ? theme.fg("dim", "↑ ↓ scroll detail • Enter actions • Esc back • Tab / ← → switch tabs")
              : state.activeTab === "inbox"
                ? theme.fg(
                    "dim",
                    "↑ ↓ move • Enter detail • a actions • n new • b/r/i inbox filters • Esc close • Tab / ← → tabs",
                  )
                : theme.fg("dim", "↑ ↓ move • Enter detail • a actions • n new • Esc close • Tab / ← → tabs");

          return [...header, ...body, "", footer];
        },
        handleInput(data: string): void {
          const isUp = matchesKey(data, Key.up) || data === "k";
          const isDown = matchesKey(data, Key.down) || data === "j";
          const isLeft = matchesKey(data, Key.left) || matchesKey(data, Key.shift("tab")) || data === "h";
          const isRight = matchesKey(data, Key.right) || matchesKey(data, Key.tab) || data === "l";
          const isEnter = matchesKey(data, Key.enter) || matchesKey(data, Key.return);
          const isEscape = matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"));
          const isPageUp = matchesKey(data, Key.pageUp);
          const isPageDown = matchesKey(data, Key.pageDown);

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
            const summary = ref ? getTicketById(model, ref) : null;
            if (ref && summary) {
              state.menu = { kind: "actions", ref, selectedIndex: 0 };
            } else {
              return;
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
            if (state.activeTab === "detail") {
              moveDetailScroll(state, -1);
            } else {
              moveSelection(state, model, -1);
            }
            ensureDetail(currentRef());
            return;
          }
          if (isDown) {
            if (state.activeTab === "detail") {
              moveDetailScroll(state, 1);
            } else {
              moveSelection(state, model, 1);
            }
            ensureDetail(currentRef());
            return;
          }
          if (isPageUp) {
            moveDetailScroll(state, -MAIN_BOX_LINES + 3);
            return;
          }
          if (isPageDown) {
            moveDetailScroll(state, MAIN_BOX_LINES - 3);
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
            const summary = ref ? getTicketById(model, ref) : null;
            if (!ref) {
              done({ kind: "create" });
              return;
            }
            if (state.activeTab === "detail") {
              if (!summary) {
                return;
              }
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
        width: OVERLAY_WIDTH,
        maxHeight: OVERLAY_MAX_HEIGHT,
      },
    },
  );
}
