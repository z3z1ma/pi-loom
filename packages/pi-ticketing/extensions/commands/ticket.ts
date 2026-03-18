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

function notifyMessage(ctx: ExtensionCommandContext, message: string): void {
  if (typeof ctx.ui?.notify === "function") {
    ctx.ui.notify(message, "info");
  }
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
    return buildFieldUpdate(field, await ctx.ui.input(`Edit ${ref} risk (${TICKET_RISKS.join(", ")})`, currentValue));
  }
  if (field === "type") {
    return buildFieldUpdate(field, await ctx.ui.input(`Edit ${ref} type (${TICKET_TYPES.join(", ")})`, currentValue));
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
    case "archive": {
      const updated = await store.archiveTicketAsync(action.ref);
      await safeSyncTicketHomeWidget(ctx);
      notifyTicketResult(ctx, updated);
      return action.nextView;
    }
    case "delete": {
      const deleted = await store.deleteTicketAsync(action.ref);
      await safeSyncTicketHomeWidget(ctx);
      notifyMessage(
        ctx,
        deleted.affectedTicketIds.length > 0
          ? `Deleted ${deleted.deletedTicketId}; updated ${deleted.affectedTicketIds.join(", ")}`
          : `Deleted ${deleted.deletedTicketId}`,
      );
      return action.nextView;
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
        updated = await store.closeTicketAsync(action.ref, verificationNote);
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
  if (!ctx.hasUI) {
    const store = createTicketStore(ctx.cwd);
    return renderTicketWorkspaceText(await loadTicketWorkspaceSnapshot(store, initialView));
  }

  const store = createTicketStore(ctx.cwd);

  const runWorkspaceLoop = async (): Promise<void> => {
    let view = initialView;
    while (true) {
      const action = await openInteractiveTicketWorkspace(ctx, store, await loadTicketWorkspaceSnapshot(store, view));
      if (!action || action.kind === "close") {
        await safeSyncTicketHomeWidget(ctx);
        return;
      }
      view = await performWorkspaceAction(action, ctx);
    }
  };

  void runWorkspaceLoop().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    if (typeof ctx.ui?.notify === "function") {
      ctx.ui.notify(message, "error");
    }
  });

  return "";
}

export async function handleTicketCommand(_args: string, ctx: ExtensionCommandContext): Promise<string> {
  await createTicketStore(ctx.cwd).initLedgerAsync();
  return openTicketWorkspace({ kind: "home" }, ctx);
}
