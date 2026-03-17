import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import {
  REVIEW_STATUSES,
  TICKET_PRIORITIES,
  TICKET_RISKS,
  TICKET_TYPES,
  type TicketReadResult,
  type TicketReviewStatus,
  type TicketRisk,
  type TicketType,
  type UpdateTicketInput,
} from "../domain/models.js";
import { renderTicketDetail } from "../domain/render.js";
import { createTicketStore } from "../domain/store.js";
import {
  loadTicketWorkspaceSnapshot,
  openInteractiveTicketWorkspace,
  renderTicketWorkspaceText,
  syncTicketHomeWidget,
  type TicketWorkspaceAction,
  type TicketWorkspaceField,
  type TicketWorkspaceView,
} from "../ui/ticket-workspace.js";

const WORKSPACE_FIELDS = [
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
] as const satisfies readonly TicketWorkspaceField[];

function splitArgs(args: string): string[] {
  return args.trim().split(/\s+/).filter(Boolean);
}

function normalizeWorkspaceRef(ref: string): string {
  return ref.startsWith("#") ? ref.slice(1) : ref;
}

function fieldLabel(field: TicketWorkspaceField): string {
  switch (field) {
    case "journalSummary":
      return "journal summary";
    default:
      return field;
  }
}

function currentFieldValue(result: TicketReadResult, field: TicketWorkspaceField): string {
  switch (field) {
    case "assignee":
      return result.ticket.frontmatter.assignee ?? "";
    case "priority":
      return result.ticket.frontmatter.priority;
    case "risk":
      return result.ticket.frontmatter.risk;
    case "type":
      return result.ticket.frontmatter.type;
    case "reviewStatus":
      return result.ticket.frontmatter["review-status"];
    case "title":
      return result.ticket.frontmatter.title;
    case "summary":
      return result.ticket.body.summary;
    case "context":
      return result.ticket.body.context;
    case "plan":
      return result.ticket.body.plan;
    case "notes":
      return result.ticket.body.notes;
    case "verification":
      return result.ticket.body.verification;
    case "journalSummary":
      return result.ticket.body.journalSummary;
  }
}

function normalizeEnumInput<T extends string>(
  field: string,
  value: string | undefined,
  allowed: readonly T[],
): T | null {
  if (value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if ((allowed as readonly string[]).includes(trimmed)) {
    return trimmed as T;
  }
  throw new Error(`Invalid ${field}: ${trimmed}. Expected one of ${allowed.join(", ")}.`);
}

async function safeSyncTicketHomeWidget(ctx: ExtensionCommandContext): Promise<void> {
  try {
    await syncTicketHomeWidget(ctx);
  } catch {
    // Widget refresh is advisory; durable ticket mutations must not fail outward when it cannot render.
  }
}

function notifyTicketResult(ctx: ExtensionCommandContext, result: TicketReadResult): void {
  if (typeof ctx.ui?.notify === "function") {
    ctx.ui.notify(renderTicketDetail(result), "info");
  }
}

function parseWorkspaceField(value: string | undefined): TicketWorkspaceField {
  if (value && WORKSPACE_FIELDS.includes(value as TicketWorkspaceField)) {
    return value as TicketWorkspaceField;
  }
  throw new Error(`Unsupported ticket field. Expected one of ${WORKSPACE_FIELDS.join(", ")}.`);
}

function buildFieldUpdate(field: TicketWorkspaceField, value: string | undefined): UpdateTicketInput | null {
  if (field === "title") {
    const trimmed = value?.trim();
    return trimmed ? { title: trimmed } : null;
  }
  if (field === "assignee") {
    if (value === undefined) {
      return null;
    }
    const trimmed = value.trim();
    return { assignee: !trimmed || trimmed === "none" ? null : trimmed };
  }
  if (field === "priority") {
    const priority = normalizeEnumInput("priority", value, TICKET_PRIORITIES);
    return priority ? { priority } : null;
  }
  if (field === "risk") {
    const risk = normalizeEnumInput<TicketRisk>("risk", value, TICKET_RISKS);
    return risk ? { risk } : null;
  }
  if (field === "type") {
    const type = normalizeEnumInput<TicketType>("type", value, TICKET_TYPES);
    return type ? { type } : null;
  }
  if (field === "reviewStatus") {
    const reviewStatus = normalizeEnumInput<TicketReviewStatus>("review status", value, REVIEW_STATUSES);
    return reviewStatus ? { reviewStatus } : null;
  }
  if (value === undefined) {
    return null;
  }
  return { [field]: value.trim() } as UpdateTicketInput;
}

function promptTitle(ctx: ExtensionCommandContext, initialValue: string): Promise<string | undefined> {
  return ctx.ui.input("Ticket title", initialValue || "Short human-readable title");
}

async function promptFieldUpdate(
  ctx: ExtensionCommandContext,
  ref: string,
  field: TicketWorkspaceField,
  currentValue: string,
  suppliedValue?: string,
): Promise<UpdateTicketInput | null> {
  if (suppliedValue !== undefined) {
    return buildFieldUpdate(field, suppliedValue);
  }
  if (field === "title") {
    return buildFieldUpdate(field, await promptTitle(ctx, currentValue));
  }
  if (field === "assignee") {
    return buildFieldUpdate(
      field,
      await ctx.ui.input(`Edit ${ref} assignee`, currentValue || "Unassigned; leave blank to clear"),
    );
  }
  if (field === "priority") {
    return buildFieldUpdate(
      field,
      await ctx.ui.input(`Edit ${ref} priority (${TICKET_PRIORITIES.join(", ")})`, currentValue),
    );
  }
  if (field === "risk") {
    return buildFieldUpdate(
      field,
      await ctx.ui.input(`Edit ${ref} risk (${TICKET_RISKS.join(", ")})`, currentValue),
    );
  }
  if (field === "type") {
    return buildFieldUpdate(
      field,
      await ctx.ui.input(`Edit ${ref} type (${TICKET_TYPES.join(", ")})`, currentValue),
    );
  }
  if (field === "reviewStatus") {
    return buildFieldUpdate(
      field,
      await ctx.ui.input(`Edit ${ref} review status (${REVIEW_STATUSES.join(", ")})`, currentValue),
    );
  }
  const value = await ctx.ui.editor(`Edit ${ref} ${fieldLabel(field)}`, currentValue);
  return buildFieldUpdate(field, value);
}

function parseOpenCommand(parts: string[]): { view: TicketWorkspaceView; action: TicketWorkspaceAction | null } {
  const [view, maybeRef, maybeAction, ...rest] = parts;
  if (!view || view === "home") {
    return { view: { kind: "home" }, action: null };
  }
  if (view === "list") {
    return { view: { kind: "list" }, action: null };
  }
  if (view === "board") {
    return { view: { kind: "board" }, action: null };
  }
  if (view === "timeline") {
    return { view: { kind: "timeline" }, action: null };
  }
  if (view === "detail") {
    if (!maybeRef) {
      throw new Error("Usage: /ticket open detail <ref>");
    }
    const ref = normalizeWorkspaceRef(maybeRef);
    if (!maybeAction) {
      return { view: { kind: "detail", ref }, action: null };
    }
    if (maybeAction === "edit") {
      const field = parseWorkspaceField(rest[0]);
      return { view: { kind: "detail", ref }, action: { kind: "edit", ref, field, value: rest.slice(1).join(" ") } };
    }
    if (maybeAction === "status") {
      const [status, ...noteParts] = rest;
      if (!status || !["open", "reopen", "in_progress", "review", "close"].includes(status)) {
        throw new Error("Usage: /ticket open detail <ref> status <open|reopen|in_progress|review|close> [verification note]");
      }
      return {
        view: { kind: "detail", ref },
        action: {
          kind: "status",
          ref,
          status: status as "open" | "reopen" | "in_progress" | "review" | "close",
          verificationNote: noteParts.join(" "),
        },
      };
    }
    if (maybeAction === "dependency") {
      const [mode, dependencyRef] = rest;
      if ((mode !== "add" && mode !== "remove") || !dependencyRef) {
        throw new Error("Usage: /ticket open detail <ref> dependency <add|remove> <depRef>");
      }
      return {
        view: { kind: "detail", ref },
        action: { kind: "dependency", ref, mode, dependencyRef },
      };
    }
    throw new Error("Usage: /ticket open detail <ref> [edit <field> <value...>|status <open|reopen|in_progress|review|close> [verification note]|dependency <add|remove> <depRef>]");
  }
  throw new Error("Usage: /ticket open [home|list|board|timeline|detail <ref>]");
}

async function performWorkspaceAction(
  action: TicketWorkspaceAction,
  ctx: ExtensionCommandContext,
): Promise<TicketWorkspaceView> {
  const store = createTicketStore(ctx.cwd);
  switch (action.kind) {
    case "navigate":
      return action.view;
    case "create": {
      const title = await promptTitle(ctx, "");
      if (!title?.trim()) {
        return { kind: "home" };
      }
      const created = await store.createTicketAsync({ title: title.trim() });
      await safeSyncTicketHomeWidget(ctx);
      notifyTicketResult(ctx, created);
      return { kind: "detail", ref: created.summary.id };
    }
    case "edit": {
      const current = await store.readTicketAsync(action.ref);
      if (current.ticket.closed) {
        throw new Error(`Closed ticket ${action.ref} must be reopened before it can be edited.`);
      }
      const updates = await promptFieldUpdate(
        ctx,
        action.ref,
        action.field,
        currentFieldValue(current, action.field),
        action.value,
      );
      if (!updates) {
        return { kind: "detail", ref: action.ref };
      }
      const updated = await store.updateTicketAsync(action.ref, updates);
      await safeSyncTicketHomeWidget(ctx);
      notifyTicketResult(ctx, updated);
      return { kind: "detail", ref: updated.summary.id };
    }
    case "status": {
      let updated: TicketReadResult;
      if (action.status === "reopen") {
        updated = await store.reopenTicketAsync(action.ref);
      } else if (action.status === "open") {
        updated = await store.updateTicketAsync(action.ref, { status: "open" });
      } else if (action.status === "in_progress") {
        updated = await store.startTicketAsync(action.ref);
      } else if (action.status === "review") {
        updated = await store.updateTicketAsync(action.ref, { status: "review" });
      } else {
        const verificationNote = action.verificationNote?.trim()
          ? action.verificationNote.trim()
          : ctx.hasUI
            ? (await ctx.ui.editor(`Close ${action.ref}: verification`, ""))?.trim()
            : undefined;
        updated = await store.closeTicketAsync(
          action.ref,
          verificationNote,
        );
      }
      await safeSyncTicketHomeWidget(ctx);
      notifyTicketResult(ctx, updated);
      return { kind: "detail", ref: updated.summary.id };
    }
    case "dependency": {
      const current = await store.readTicketAsync(action.ref);
      if (current.ticket.closed) {
        throw new Error(`Closed ticket ${action.ref} must be reopened before dependencies can change.`);
      }
      const prompt = action.mode === "add" ? `Add dependency to ${action.ref}` : `Remove dependency from ${action.ref}`;
      const ref = action.dependencyRef ?? (await ctx.ui.input(prompt, "t-0001 or #t-0001"));
      if (!ref?.trim()) {
        return { kind: "detail", ref: action.ref };
      }
      const updated =
        action.mode === "add"
          ? await store.addDependencyAsync(action.ref, ref.trim())
          : await store.removeDependencyAsync(action.ref, ref.trim());
      await safeSyncTicketHomeWidget(ctx);
      notifyTicketResult(ctx, updated);
      return { kind: "detail", ref: updated.summary.id };
    }
    case "close":
      return { kind: "home" };
  }
}

async function openTicketWorkspace(initialView: TicketWorkspaceView, ctx: ExtensionCommandContext): Promise<string> {
  const store = createTicketStore(ctx.cwd);
  if (!ctx.hasUI) {
    return renderTicketWorkspaceText(await loadTicketWorkspaceSnapshot(store, initialView));
  }

  let view = initialView;
  while (true) {
    const action = await openInteractiveTicketWorkspace(ctx, await loadTicketWorkspaceSnapshot(store, view));
    if (!action || action.kind === "close") {
      await safeSyncTicketHomeWidget(ctx);
      return "";
    }
    view = await performWorkspaceAction(action, ctx);
  }
}

function parseReviewFilter(value: string | undefined): "ready" | "blocked" {
  if (!value || value === "ready") {
    return "ready";
  }
  if (value === "blocked") {
    return "blocked";
  }
  throw new Error("Usage: /ticket review [ready|blocked]");
}

export async function handleTicketCommand(args: string, ctx: ExtensionCommandContext): Promise<string> {
  const store = createTicketStore(ctx.cwd);
  await store.initLedgerAsync();
  const [subcommand, ...rest] = splitArgs(args);
  if (!subcommand) {
    return "Usage: /ticket <open [home|list|board|timeline|detail <ref>]|create [title...]|review [ready|blocked]>";
  }

  switch (subcommand) {
    case "open": {
      const parsed = parseOpenCommand(rest);
      if (parsed.action) {
        const nextView = await performWorkspaceAction(parsed.action, ctx);
        return ctx.hasUI
          ? openTicketWorkspace(nextView, ctx)
          : renderTicketWorkspaceText(await loadTicketWorkspaceSnapshot(store, nextView));
      }
      return openTicketWorkspace(parsed.view, ctx);
    }
    case "create": {
      let title = rest.join(" ").trim();
      if (!title && ctx.hasUI) {
        title = (await promptTitle(ctx, ""))?.trim() ?? "";
      }
      if (!title) {
        throw new Error("Usage: /ticket create [title...]");
      }
      const result = await store.createTicketAsync({ title });
      await safeSyncTicketHomeWidget(ctx);
      return renderTicketDetail(result);
    }
    case "review":
      return openTicketWorkspace({ kind: "board", filter: parseReviewFilter(rest[0]) }, ctx);
    default:
      throw new Error(`Unknown /ticket subcommand: ${subcommand}`);
  }
}
