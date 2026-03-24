import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";
import { analyzeListQuery, renderAnalyzedListQuery } from "#storage/list-query.js";
import { LOOM_LIST_SORTS, type LoomListSort } from "#storage/list-search.js";
import type {
  AttachArtifactInput,
  CreateCheckpointInput,
  CreateTicketInput,
  TicketStatus,
  UpdateTicketInput,
} from "../domain/models.js";
import { TICKET_WRITE_ACTIONS } from "../domain/models.js";
import { renderGraph, renderTicketDetail, renderTicketSummary } from "../domain/render.js";
import { createTicketStore } from "../domain/store.js";
import { syncTicketHomeWidget } from "../ui/ticket-workspace.js";

const TicketStatusEnum = StringEnum(["open", "ready", "in_progress", "blocked", "review", "closed"] as const);
const TicketTypeEnum = StringEnum(["task", "bug", "feature", "epic", "chore", "review", "security"] as const);
const TicketPriorityEnum = StringEnum(["low", "medium", "high", "critical"] as const);
const TicketRiskEnum = StringEnum(["low", "medium", "high"] as const);
const TicketReviewStatusEnum = StringEnum(["none", "requested", "changes_requested", "approved"] as const);
const JournalKindEnum = StringEnum([
  "note",
  "decision",
  "progress",
  "verification",
  "checkpoint",
  "attachment",
  "state",
] as const);
const TicketWriteActionEnum = StringEnum(TICKET_WRITE_ACTIONS);
const TicketCheckpointActionEnum = StringEnum(["create", "read"] as const);
const LoomListSortEnum = StringEnum(LOOM_LIST_SORTS);

function withDescription<T extends Record<string, unknown>>(schema: T, description: string): T {
  return { ...schema, description } as T;
}

const TicketListParams = Type.Object({
  exactStatus: Type.Optional(
    withDescription(
      TicketStatusEnum,
      "Exact status filter. Start with text when discovering work; add status only once you intentionally want a narrower slice.",
    ),
  ),
  exactType: Type.Optional(
    withDescription(
      TicketTypeEnum,
      "Exact type filter. Leave unset for broad discovery unless you already know the ticket kind you want.",
    ),
  ),
  exactRepositoryId: Type.Optional(
    Type.String({
      description:
        "Optional exact repository id filter. Use a repository id from `scope_read` or prior machine-readable ticket results when you intentionally want one repository slice.",
    }),
  ),
  includeClosed: Type.Optional(
    Type.Boolean({
      description:
        "Closed non-archived tickets are hidden by default. Set true only when you intentionally want closed history included.",
    }),
  ),
  includeArchived: Type.Optional(
    Type.Boolean({
      description:
        "Archived tickets are hidden by default, even when includeClosed is true. Set true only when you intentionally need archived records.",
    }),
  ),
  text: Type.Optional(
    Type.String({
      description:
        "Free-text search over ticket id, title, summary, assignee, labels, tags, and linked context. Prefer this first when you are unsure of the exact status or type.",
    }),
  ),
  sort: Type.Optional(
    withDescription(
      LoomListSortEnum,
      "Optional result ordering. Defaults to `relevance` when `text` is present, otherwise `updated_desc`. Override this only when you intentionally need chronological or id-based ordering after filtering.",
    ),
  ),
});

const TicketReadParams = Type.Object({
  ref: Type.String({
    description:
      "Human-facing ticket ref: repo-prefixed ids such as `pl-0001`, `#pl-0001`, `@pl-0001`, `ticket:pl-0001`, a markdown filename, or a markdown path. Canonical storage entity ids stay opaque and are not accepted here.",
  }),
});

const TicketWriteParams = Type.Object({
  action: TicketWriteActionEnum,
  ref: Type.Optional(
    Type.String({
      description:
        "Existing human-facing ticket ref for non-create actions: repo-prefixed ids such as `pl-0001`, `#pl-0001`, `@pl-0001`, `ticket:pl-0001`, a markdown filename, or a markdown path.",
    }),
  ),
  title: Type.Optional(Type.String()),
  summary: Type.Optional(Type.String()),
  context: Type.Optional(Type.String()),
  plan: Type.Optional(Type.String()),
  notes: Type.Optional(Type.String()),
  verification: Type.Optional(Type.String()),
  journalSummary: Type.Optional(Type.String()),
  status: Type.Optional(StringEnum(["open", "in_progress", "review"] as const)),
  priority: Type.Optional(TicketPriorityEnum),
  type: Type.Optional(TicketTypeEnum),
  tags: Type.Optional(Type.Array(Type.String())),
  links: Type.Optional(Type.Array(Type.String())),
  initiativeIds: Type.Optional(Type.Array(Type.String())),
  researchIds: Type.Optional(Type.Array(Type.String())),
  parent: Type.Optional(Type.String()),
  assignee: Type.Optional(Type.String()),
  acceptance: Type.Optional(Type.Array(Type.String())),
  labels: Type.Optional(Type.Array(Type.String())),
  risk: Type.Optional(TicketRiskEnum),
  reviewStatus: Type.Optional(TicketReviewStatusEnum),
  externalRefs: Type.Optional(Type.Array(Type.String())),
  dependency: Type.Optional(Type.String()),
  journalKind: Type.Optional(JournalKindEnum),
  text: Type.Optional(Type.String()),
  artifact: Type.Optional(
    Type.Object({
      label: Type.String(),
      description: Type.Optional(Type.String()),
      path: Type.Optional(Type.String()),
      content: Type.Optional(Type.String()),
      mediaType: Type.Optional(Type.String()),
      metadata: Type.Optional(Type.Object({}, { additionalProperties: true })),
    }),
  ),
});

const TicketGraphParams = Type.Object({
  ref: Type.Optional(
    Type.String({
      description:
        "Optional human-facing ticket ref: repo-prefixed ids such as `pl-0001`, `#pl-0001`, `@pl-0001`, `ticket:pl-0001`, a markdown filename, or a markdown path.",
    }),
  ),
});

const TicketCheckpointParams = Type.Object({
  action: TicketCheckpointActionEnum,
  ref: Type.String({
    description:
      "Human-facing ticket ref: repo-prefixed ids such as `pl-0001`, `#pl-0001`, `@pl-0001`, `ticket:pl-0001`, a markdown filename, or a markdown path.",
  }),
  title: Type.Optional(Type.String()),
  body: Type.Optional(Type.String()),
  supersedes: Type.Optional(Type.String()),
});

type TicketWriteParamsValue = Static<typeof TicketWriteParams>;

function getStore(ctx: ExtensionContext) {
  return createTicketStore(ctx.cwd);
}

function requireRef(ref: string | undefined): string {
  if (!ref) {
    throw new Error("Ticket reference is required for this action");
  }
  return ref;
}

function toUpdateInput(params: TicketWriteParamsValue): UpdateTicketInput {
  return {
    title: params.title,
    summary: params.summary,
    context: params.context,
    plan: params.plan,
    notes: params.notes,
    verification: params.verification,
    journalSummary: params.journalSummary,
    status: params.status,
    priority: params.priority,
    type: params.type,
    tags: params.tags,
    links: params.links,
    initiativeIds: params.initiativeIds,
    researchIds: params.researchIds,
    parent: params.parent,
    assignee: params.assignee,
    acceptance: params.acceptance,
    labels: params.labels,
    risk: params.risk,
    reviewStatus: params.reviewStatus,
    externalRefs: params.externalRefs,
  };
}

function toCreateInput(params: TicketWriteParamsValue): CreateTicketInput {
  if (!params.title?.trim()) {
    throw new Error("title is required for create");
  }
  return {
    title: params.title,
    summary: params.summary,
    context: params.context,
    plan: params.plan,
    notes: params.notes,
    verification: params.verification,
    journalSummary: params.journalSummary,
    priority: params.priority,
    type: params.type,
    tags: params.tags,
    links: params.links,
    initiativeIds: params.initiativeIds,
    researchIds: params.researchIds,
    parent: params.parent,
    assignee: params.assignee,
    acceptance: params.acceptance,
    labels: params.labels,
    risk: params.risk,
    reviewStatus: params.reviewStatus,
    externalRefs: params.externalRefs,
  };
}

function machineResult(details: Record<string, unknown>, text: string) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

async function runMutation<T>(ctx: ExtensionContext, action: () => Promise<T>): Promise<T> {
  const result = await action();
  try {
    await syncTicketHomeWidget(ctx);
  } catch {
    // Widget refresh is advisory; durable tool writes must not fail outward after they committed.
  }
  return result;
}

export function registerTicketTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ticket_list",
    label: "ticket_list",
    description:
      "List tickets from the durable local ledger using effective execution status. Prefer broad discovery with text first, then add exact filters such as `exactStatus` or `exactType` only when you intentionally want to narrow the result set; results default to `relevance` with `text`, otherwise `updated_desc`.",
    promptSnippet:
      "Inspect backlog, ready work, blocked work, or existing intent before creating a new ticket. Start broad with text when uncertain, then narrow with exact filters; rely on the default relevance ranking unless you explicitly need a different ordering.",
    promptGuidelines: [
      "Use this tool before creating tickets so you do not duplicate existing work.",
      "Start with text for broad-first discovery when you only know part of the title or intent; exact filters such as `exactStatus` and `exactType` can hide valid matches if you guess wrong.",
      "The default ordering is `relevance` when `text` is present and `updated_desc` otherwise; set `sort` only when you intentionally need another ordering such as chronology or id order.",
      "List and graph status are effective execution states derived from stored status plus open dependencies; use `ticket_read` when you also need the stored status field shown explicitly.",
      "Closed tickets are excluded by default, and archived tickets are also excluded by default even when includeClosed is true; opt into those histories only when you intentionally need them.",
      "Use exact status filters to inspect ready or blocked work before proposing sequencing or parallelism once you have already narrowed the search intentionally.",
      "If a zero-result query used exact filters, inspect the returned query diagnostics and broader suggestions before assuming the ticket does not exist.",
      "Use the existing ledger to inherit durable context, dependencies, and verification expectations before writing a new ticket body.",
    ],
    parameters: TicketListParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await analyzeListQuery(
        params,
        (next) =>
          getStore(ctx).listTicketsAsync({
            status: next.exactStatus as TicketStatus | undefined,
            type: next.exactType,
            repositoryId: next.exactRepositoryId,
            includeClosed: next.includeClosed,
            includeArchived: next.includeArchived,
            text: next.text,
            sort: next.sort as LoomListSort | undefined,
          }),
        {
          text: params.text,
          exactFilters: [
            {
              key: "exactStatus",
              value: params.exactStatus,
              clear: (current) => ({ ...current, exactStatus: undefined }),
            },
            {
              key: "exactType",
              value: params.exactType,
              clear: (current) => ({ ...current, exactType: undefined }),
            },
            {
              key: "exactRepositoryId",
              value: params.exactRepositoryId,
              clear: (current) => ({ ...current, exactRepositoryId: undefined }),
            },
          ],
        },
      );

      return machineResult(
        { tickets: result.items, queryDiagnostics: result.diagnostics, broaderMatches: result.broaderMatches },
        renderAnalyzedListQuery(result, {
          emptyText: "No tickets.",
          renderItem: renderTicketSummary,
        }),
      );
    },
  });

  pi.registerTool({
    name: "ticket_read",
    label: "ticket_read",
    description:
      "Read a fully detailed ticket with acceptance criteria, journal history, attachments, checkpoints, graph context, effective status summary, and explicit stored status.",
    promptSnippet: "Load the current truth for a ticket before acting on it or changing it.",
    promptGuidelines: [
      "Read the ticket before editing code when durable intent or previous discoveries may matter.",
      "Use human-facing ticket refs only; canonical storage entity ids stay opaque under the durable display id and are not a public ticket reference format.",
      "Use the full ticket body, acceptance criteria, provenance, and journal as the execution record; do not overwrite a complete unit of work with a thinner restatement that would leave a newcomer unsure why the work exists or how to recognize completion.",
    ],
    parameters: TicketReadParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await getStore(ctx).readTicketAsync(params.ref);
      return machineResult({ ticket: result }, renderTicketDetail(result));
    },
  });

  pi.registerTool({
    name: "ticket_write",
    label: "ticket_write",
    description:
      "Create or update fully specified durable ticket state in the local ledger. Closed tickets must be reopened before structural edits such as dependency or external-link changes.",
    promptSnippet:
      "Persist substantial work intent, acceptance criteria, implementation plan, progress, blockers, verification, dependencies, and artifacts instead of keeping them only in chat.",
    promptGuidelines: [
      "Use this tool for durable work state rather than transient scratch planning.",
      "Create ticket bodies as complete, self-contained units of work with concrete context, acceptance criteria, plan, dependencies, risks, provenance, and verification expectations rather than minimal blurbs; a capable newcomer should be able to understand why the task exists, what generally needs to happen, and what done looks like.",
      "Closed tickets are structurally frozen until reopened; append-only journal, checkpoint, and attachment writes remain available, but dependency and other relationship edits must go through reopen first.",
      "Update the ticket as the work evolves so future turns and agents can rely on truthful ongoing state instead of stale summaries.",
    ],
    parameters: TicketWriteParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const store = getStore(ctx);
      switch (params.action) {
        case "create": {
          const result = await runMutation(ctx, () => store.createTicketAsync(toCreateInput(params)));
          return machineResult({ action: params.action, ticket: result }, renderTicketDetail(result));
        }
        case "update": {
          const result = await runMutation(ctx, () =>
            store.updateTicketAsync(requireRef(params.ref), toUpdateInput(params)),
          );
          return machineResult({ action: params.action, ticket: result }, renderTicketDetail(result));
        }
        case "start": {
          const result = await runMutation(ctx, () => store.startTicketAsync(requireRef(params.ref)));
          return machineResult({ action: params.action, ticket: result }, renderTicketDetail(result));
        }
        case "reopen": {
          const result = await runMutation(ctx, () => store.reopenTicketAsync(requireRef(params.ref)));
          return machineResult({ action: params.action, ticket: result }, renderTicketDetail(result));
        }
        case "close": {
          const result = await runMutation(ctx, () =>
            store.closeTicketAsync(requireRef(params.ref), params.verification),
          );
          return machineResult({ action: params.action, ticket: result }, renderTicketDetail(result));
        }
        case "archive": {
          const result = await runMutation(ctx, () => store.archiveTicketAsync(requireRef(params.ref)));
          return machineResult({ action: params.action, ticket: result }, renderTicketDetail(result));
        }
        case "delete": {
          const result = await runMutation(ctx, () => store.deleteTicketAsync(requireRef(params.ref)));
          return machineResult(
            { action: params.action, result },
            result.affectedTicketIds.length > 0
              ? `Deleted ticket ${result.deletedTicketId}. Updated tickets: ${result.affectedTicketIds.join(", ")}`
              : `Deleted ticket ${result.deletedTicketId}.`,
          );
        }
        case "add_note": {
          if (!params.text?.trim()) throw new Error("text is required for add_note");
          const text = params.text;
          const result = await runMutation(ctx, () => store.addNoteAsync(requireRef(params.ref), text));
          return machineResult({ action: params.action, ticket: result }, renderTicketDetail(result));
        }
        case "add_journal_entry": {
          if (!params.text?.trim()) throw new Error("text is required for add_journal_entry");
          const text = params.text;
          const result = await runMutation(ctx, () =>
            store.addJournalEntryAsync(requireRef(params.ref), params.journalKind ?? "progress", text),
          );
          return machineResult({ action: params.action, ticket: result }, renderTicketDetail(result));
        }
        case "attach_artifact": {
          if (!params.artifact) throw new Error("artifact is required for attach_artifact");
          const result = await runMutation(ctx, () =>
            store.attachArtifactAsync(requireRef(params.ref), params.artifact as AttachArtifactInput),
          );
          return machineResult({ action: params.action, ticket: result }, renderTicketDetail(result));
        }
        case "add_dependency": {
          if (!params.dependency) throw new Error("dependency is required for add_dependency");
          const dependency = params.dependency;
          const result = await runMutation(ctx, () => store.addDependencyAsync(requireRef(params.ref), dependency));
          return machineResult({ action: params.action, ticket: result }, renderTicketDetail(result));
        }
        case "remove_dependency": {
          if (!params.dependency) throw new Error("dependency is required for remove_dependency");
          const dependency = params.dependency;
          const result = await runMutation(ctx, () => store.removeDependencyAsync(requireRef(params.ref), dependency));
          return machineResult({ action: params.action, ticket: result }, renderTicketDetail(result));
        }
      }
    },
  });

  pi.registerTool({
    name: "ticket_graph",
    label: "ticket_graph",
    description: "Inspect dependency and parent relationships across the ticket ledger.",
    promptSnippet: "Inspect dependencies and ready or blocked work before choosing sequence or parallelism.",
    promptGuidelines: [
      "Use this tool when ordering work or explaining why something is blocked.",
      "Ground ticket sequencing in the stored dependency graph instead of flattening dependency context into vague ticket prose.",
    ],
    parameters: TicketGraphParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const graph = await getStore(ctx).graphAsync();
      if (params.ref) {
        const ticketId = getStore(ctx).resolveTicketRef(params.ref);
        return machineResult(
          { graph, node: graph.nodes[ticketId] ?? null },
          graph.nodes[ticketId]
            ? renderGraph({
                nodes: { [ticketId]: graph.nodes[ticketId] },
                ready: graph.ready.filter((id) => id === ticketId),
                blocked: graph.blocked.filter((id) => id === ticketId),
                cycles: graph.cycles.filter((cycle) => cycle.includes(ticketId)),
              })
            : `No graph node for ${ticketId}`,
        );
      }
      return machineResult({ graph }, renderGraph(graph));
    },
  });

  pi.registerTool({
    name: "ticket_checkpoint",
    label: "ticket_checkpoint",
    description: "Persist or read durable handoff checkpoints linked to a ticket.",
    promptSnippet: "Persist checkpoints when work spans turns, agents, reviews, or handoff boundaries.",
    promptGuidelines: [
      "Use checkpoints for reusable durable handoff records, not ephemeral chat summaries.",
      "Checkpoint bodies should preserve the critical execution detail needed for truthful resumption, including state, decisions, risks, acceptance progress, and verification status, so a later worker can tell what remains and how completion will be judged.",
    ],
    parameters: TicketCheckpointParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const store = getStore(ctx);
      if (params.action === "read") {
        const result = await store.readTicketAsync(params.ref);
        return machineResult(
          { checkpoints: result.checkpoints },
          result.checkpoints.map((checkpoint) => `${checkpoint.id} ${checkpoint.title}`).join("\n") ||
            "No checkpoints.",
        );
      }
      if (!params.title?.trim() || !params.body?.trim()) {
        throw new Error("title and body are required for checkpoint creation");
      }
      const result = await store.recordCheckpointAsync(params.ref, {
        title: params.title,
        body: params.body,
        supersedes: params.supersedes,
      } as CreateCheckpointInput);
      try {
        await syncTicketHomeWidget(ctx);
      } catch {
        // Widget refresh is advisory; durable checkpoint writes must not fail outward after they committed.
      }
      return machineResult({ action: params.action, ticket: result }, renderTicketDetail(result));
    },
  });
}
