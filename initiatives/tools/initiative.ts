import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";
import { analyzeListQuery, renderAnalyzedListQuery } from "#storage/list-query.js";
import { LOOM_LIST_SORTS } from "#storage/list-search.js";
import { hasExportedProjectionFamily, runProjectionAwareOperation } from "#storage/projection-lifecycle.js";
import type { CreateInitiativeInput, InitiativeMilestoneInput, UpdateInitiativeInput } from "../domain/models.js";
import { exportInitiativeProjections } from "../domain/projection.js";
import { renderInitiativeDetail, renderInitiativeOverview, renderInitiativeSummary } from "../domain/render.js";
import { createInitiativeStore } from "../domain/store.js";

const InitiativeStatusEnum = StringEnum([
  "proposed",
  "active",
  "paused",
  "completed",
  "archived",
  "superseded",
] as const);
const InitiativeDecisionKindEnum = StringEnum(["clarification", "decision", "status"] as const);
const InitiativeMilestoneStatusEnum = StringEnum(["planned", "in_progress", "blocked", "completed"] as const);
const InitiativeWriteActionEnum = StringEnum([
  "init",
  "create",
  "update",
  "add_decision",
  "link_spec",
  "unlink_spec",
  "link_ticket",
  "unlink_ticket",
  "upsert_milestone",
  "archive",
] as const);
const LoomListSortEnum = StringEnum(LOOM_LIST_SORTS);

function withDescription<T extends Record<string, unknown>>(schema: T, description: string): T {
  return { ...schema, description } as T;
}

const InitiativeListParams = Type.Object({
  exactStatus: Type.Optional(
    withDescription(
      InitiativeStatusEnum,
      "Optional exact status filter. Leave it unset on the first pass unless you intentionally want one initiative-state slice.",
    ),
  ),
  includeArchived: Type.Optional(
    Type.Boolean({ description: "Include archived initiatives. Archived initiatives are hidden unless this is true." }),
  ),
  text: Type.Optional(
    Type.String({
      description:
        "Broad text search across initiative records. Leave `sort` unset to rank by relevance when text is present; start here before adding narrower exact filters.",
    }),
  ),
  sort: Type.Optional(
    withDescription(
      LoomListSortEnum,
      "Optional result ordering override. Defaults to `relevance` when `text` is present, otherwise `updated_desc`. Set this only when you need recency, creation time, or id ordering instead of the default ranking.",
    ),
  ),
  exactTag: Type.Optional(
    Type.String({
      description:
        "Exact tag filter. Add only when you intentionally want to narrow results; the wrong tag hides valid matches.",
    }),
  ),
});

const InitiativeReadParams = Type.Object({
  ref: Type.String({
    description: "Existing initiative id or initiative directory path. Reads do not create missing initiatives.",
  }),
});

const InitiativeMilestoneParams = Type.Object({
  id: Type.Optional(Type.String()),
  title: Type.String(),
  status: Type.Optional(InitiativeMilestoneStatusEnum),
  description: Type.Optional(Type.String()),
  specChangeIds: Type.Optional(Type.Array(Type.String())),
  ticketIds: Type.Optional(Type.Array(Type.String())),
});

const InitiativeWriteParams = Type.Object({
  action: InitiativeWriteActionEnum,
  ref: Type.Optional(Type.String()),
  title: Type.Optional(Type.String()),
  status: Type.Optional(InitiativeStatusEnum),
  objective: Type.Optional(Type.String()),
  outcomes: Type.Optional(Type.Array(Type.String())),
  scope: Type.Optional(Type.Array(Type.String())),
  nonGoals: Type.Optional(Type.Array(Type.String())),
  successMetrics: Type.Optional(Type.Array(Type.String())),
  risks: Type.Optional(Type.Array(Type.String())),
  statusSummary: Type.Optional(Type.String()),
  targetWindow: Type.Optional(Type.String()),
  owners: Type.Optional(Type.Array(Type.String())),
  tags: Type.Optional(Type.Array(Type.String())),
  researchIds: Type.Optional(Type.Array(Type.String())),
  specChangeIds: Type.Optional(Type.Array(Type.String())),
  ticketIds: Type.Optional(Type.Array(Type.String())),
  capabilityIds: Type.Optional(Type.Array(Type.String())),
  supersedes: Type.Optional(Type.Array(Type.String())),
  roadmapRefs: Type.Optional(Type.Array(Type.String())),
  question: Type.Optional(Type.String()),
  answer: Type.Optional(Type.String()),
  decisionKind: Type.Optional(InitiativeDecisionKindEnum),
  specChangeId: Type.Optional(Type.String()),
  ticketId: Type.Optional(Type.String()),
  milestone: Type.Optional(InitiativeMilestoneParams),
});

const InitiativeOverviewParams = Type.Object({
  ref: Type.String(),
});

type InitiativeWriteParamsValue = Static<typeof InitiativeWriteParams>;

function getStore(ctx: ExtensionContext) {
  return createInitiativeStore(ctx.cwd);
}

function machineResult(details: Record<string, unknown>, text: string) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

async function refreshInitiativeProjectionsIfExported(cwd: string): Promise<void> {
  if (hasExportedProjectionFamily(cwd, "initiatives")) {
    await exportInitiativeProjections(cwd);
  }
}

function requireRef(ref: string | undefined): string {
  if (!ref) {
    throw new Error("Initiative reference is required for this action");
  }
  return ref;
}

function toCreateInput(params: InitiativeWriteParamsValue): CreateInitiativeInput {
  if (!params.title?.trim()) {
    throw new Error("title is required for create");
  }
  return {
    title: params.title,
    objective: params.objective,
    outcomes: params.outcomes,
    scope: params.scope,
    nonGoals: params.nonGoals,
    successMetrics: params.successMetrics,
    risks: params.risks,
    statusSummary: params.statusSummary,
    targetWindow: params.targetWindow,
    owners: params.owners,
    tags: params.tags,
    researchIds: params.researchIds,
    specChangeIds: params.specChangeIds,
    ticketIds: params.ticketIds,
    capabilityIds: params.capabilityIds,
    supersedes: params.supersedes,
    roadmapRefs: params.roadmapRefs,
    milestones: params.milestone ? [params.milestone as InitiativeMilestoneInput] : undefined,
  };
}

function toUpdateInput(params: InitiativeWriteParamsValue): UpdateInitiativeInput {
  return {
    title: params.title,
    status: params.status,
    objective: params.objective,
    outcomes: params.outcomes,
    scope: params.scope,
    nonGoals: params.nonGoals,
    successMetrics: params.successMetrics,
    risks: params.risks,
    statusSummary: params.statusSummary,
    targetWindow: params.targetWindow,
    owners: params.owners,
    tags: params.tags,
    researchIds: params.researchIds,
    specChangeIds: params.specChangeIds,
    ticketIds: params.ticketIds,
    capabilityIds: params.capabilityIds,
    supersedes: params.supersedes,
    roadmapRefs: params.roadmapRefs,
  };
}

export function registerInitiativeTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "initiative_list",
    label: "initiative_list",
    description:
      "List initiatives from the durable local strategic memory layer. Leave `sort` unset for the default ordering: `updated_desc` without `text`, `relevance` with `text`. Start broad with `text`, then add exact filters like `exactStatus` or `exactTag` only when you intentionally want a narrower strategic slice.",
    promptSnippet:
      "Inspect strategic context before creating a new initiative or assuming work has no long-horizon container; broad text search with the default relevance ranking is the safest first pass when the exact initiative title or tag is uncertain.",
    promptGuidelines: [
      "Use this tool before creating a new initiative so you do not fork program-level context.",
      "Start with `text` and no exact filters when rediscovering initiative context by theme, objective, or phrase; the default sort becomes `relevance` for text search, so leave `sort` unset unless you intentionally want a different ordering.",
      "Without `text`, the default sort is `updated_desc`; set `sort` only when you explicitly want created-time or id ordering instead of the normal recency view.",
      "`exactStatus` and `exactTag` are exact filters and can hide valid matches if you guess the stored values wrong.",
      "Archived initiatives are hidden by default; set `includeArchived` when checking whether older strategy still governs the current work or was explicitly retired.",
      "If a zero-result query used exact filters, inspect the returned query diagnostics and broader suggestions before assuming no initiative exists.",
    ],
    parameters: InitiativeListParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await analyzeListQuery(
        params,
        (next) =>
          getStore(ctx).listInitiatives({
            status: next.exactStatus,
            includeArchived: next.includeArchived,
            text: next.text,
            sort: next.sort,
            tag: next.exactTag,
          }),
        {
          text: params.text,
          exactFilters: [
            {
              key: "exactStatus",
              value: params.exactStatus,
              clear: (current) => ({ ...current, exactStatus: undefined }),
            },
            { key: "exactTag", value: params.exactTag, clear: (current) => ({ ...current, exactTag: undefined }) },
          ],
        },
      );

      return machineResult(
        { initiatives: result.items, queryDiagnostics: result.diagnostics, broaderMatches: result.broaderMatches },
        renderAnalyzedListQuery(result, {
          emptyText: "No initiatives.",
          renderItem: renderInitiativeSummary,
        }),
      );
    },
  });

  pi.registerTool({
    name: "initiative_read",
    label: "initiative_read",
    description: "Read existing durable initiative state from the local strategic memory layer.",
    promptSnippet:
      "Load the full strategic record for an existing initiative before planning multi-spec or multi-ticket work against it.",
    promptGuidelines: [
      "Read the initiative before revising linked specs or sequencing linked tickets when durable strategic intent, rationale, risks, dependencies, or success criteria may matter.",
      "If the initiative may not exist yet, list first or create it explicitly; reads fail for missing initiatives instead of bootstrapping new records.",
    ],
    parameters: InitiativeReadParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const initiative = await getStore(ctx).readInitiative(params.ref);
      return machineResult({ initiative }, renderInitiativeDetail(initiative));
    },
  });

  pi.registerTool({
    name: "initiative_write",
    label: "initiative_write",
    description: "Create or update durable initiative state in the local strategic memory layer.",
    promptSnippet:
      "Persist a substantial strategic record with objective, rationale, scope, milestones, metrics, dependencies, linked standalone specs, linked tickets, risks, and status summaries instead of leaving that context only in chat.",
    promptGuidelines: [
      "Use this tool when work deserves durable strategic context beyond a single spec or ticket graph, and make that context detailed enough for later turns to understand the initiative without replaying chat.",
      "Use initiative links to group stable behavior contracts and their execution work under one strategy, not to turn the initiative into a spec or a rollout script.",
      "Keep initiative rationale, scope boundaries, milestones, dependencies, risks, metrics, links, and status truthful so future turns and agents can rely on them.",
      "Status changes must remain lifecycle-truthful: entering `completed` or `archived` sets that terminal timestamp, and leaving either status clears the stale terminal timestamp.",
    ],
    parameters: InitiativeWriteParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const store = getStore(ctx);
      switch (params.action) {
        case "init": {
          const result = await store.initLedger();
          return machineResult(
            { action: params.action, initialized: result },
            `Initialized initiative memory at ${result.root}`,
          );
        }
        case "create": {
          const initiative = await runProjectionAwareOperation({
            repositoryRoot: ctx.cwd,
            operation: "initiative_write create",
            families: ["initiatives"],
            action: () => store.createInitiative(toCreateInput(params)),
            refresh: () => refreshInitiativeProjectionsIfExported(ctx.cwd),
          });
          return machineResult({ action: params.action, initiative }, renderInitiativeDetail(initiative));
        }
        case "update": {
          const initiative = await runProjectionAwareOperation({
            repositoryRoot: ctx.cwd,
            operation: "initiative_write update",
            families: ["initiatives"],
            action: () => store.updateInitiative(requireRef(params.ref), toUpdateInput(params)),
            refresh: () => refreshInitiativeProjectionsIfExported(ctx.cwd),
          });
          return machineResult({ action: params.action, initiative }, renderInitiativeDetail(initiative));
        }
        case "add_decision": {
          if (!params.question?.trim() || !params.answer?.trim()) {
            throw new Error("question and answer are required for add_decision");
          }
          const question = params.question;
          const answer = params.answer;
          const initiative = await runProjectionAwareOperation({
            repositoryRoot: ctx.cwd,
            operation: "initiative_write add_decision",
            families: ["initiatives"],
            action: () => store.recordDecision(requireRef(params.ref), question, answer, params.decisionKind),
            refresh: () => refreshInitiativeProjectionsIfExported(ctx.cwd),
          });
          return machineResult({ action: params.action, initiative }, renderInitiativeDetail(initiative));
        }
        case "link_spec": {
          if (!params.specChangeId?.trim()) throw new Error("specChangeId is required for link_spec");
          const specChangeId = params.specChangeId;
          const initiative = await runProjectionAwareOperation({
            repositoryRoot: ctx.cwd,
            operation: "initiative_write link_spec",
            families: ["initiatives"],
            action: () => store.linkSpec(requireRef(params.ref), specChangeId),
            refresh: () => refreshInitiativeProjectionsIfExported(ctx.cwd),
          });
          return machineResult({ action: params.action, initiative }, renderInitiativeDetail(initiative));
        }
        case "unlink_spec": {
          if (!params.specChangeId?.trim()) throw new Error("specChangeId is required for unlink_spec");
          const specChangeId = params.specChangeId;
          const initiative = await runProjectionAwareOperation({
            repositoryRoot: ctx.cwd,
            operation: "initiative_write unlink_spec",
            families: ["initiatives"],
            action: () => store.unlinkSpec(requireRef(params.ref), specChangeId),
            refresh: () => refreshInitiativeProjectionsIfExported(ctx.cwd),
          });
          return machineResult({ action: params.action, initiative }, renderInitiativeDetail(initiative));
        }
        case "link_ticket": {
          if (!params.ticketId?.trim()) throw new Error("ticketId is required for link_ticket");
          const ticketId = params.ticketId;
          const initiative = await runProjectionAwareOperation({
            repositoryRoot: ctx.cwd,
            operation: "initiative_write link_ticket",
            families: ["initiatives"],
            action: () => store.linkTicket(requireRef(params.ref), ticketId),
            refresh: () => refreshInitiativeProjectionsIfExported(ctx.cwd),
          });
          return machineResult({ action: params.action, initiative }, renderInitiativeDetail(initiative));
        }
        case "unlink_ticket": {
          if (!params.ticketId?.trim()) throw new Error("ticketId is required for unlink_ticket");
          const ticketId = params.ticketId;
          const initiative = await runProjectionAwareOperation({
            repositoryRoot: ctx.cwd,
            operation: "initiative_write unlink_ticket",
            families: ["initiatives"],
            action: () => store.unlinkTicket(requireRef(params.ref), ticketId),
            refresh: () => refreshInitiativeProjectionsIfExported(ctx.cwd),
          });
          return machineResult({ action: params.action, initiative }, renderInitiativeDetail(initiative));
        }
        case "upsert_milestone": {
          if (!params.milestone) throw new Error("milestone is required for upsert_milestone");
          const initiative = await runProjectionAwareOperation({
            repositoryRoot: ctx.cwd,
            operation: "initiative_write upsert_milestone",
            families: ["initiatives"],
            action: () => store.upsertMilestone(requireRef(params.ref), params.milestone as InitiativeMilestoneInput),
            refresh: () => refreshInitiativeProjectionsIfExported(ctx.cwd),
          });
          return machineResult({ action: params.action, initiative }, renderInitiativeDetail(initiative));
        }
        case "archive": {
          const initiative = await runProjectionAwareOperation({
            repositoryRoot: ctx.cwd,
            operation: "initiative_write archive",
            families: ["initiatives"],
            action: () => store.archiveInitiative(requireRef(params.ref)),
            refresh: () => refreshInitiativeProjectionsIfExported(ctx.cwd),
          });
          return machineResult({ action: params.action, initiative }, renderInitiativeDetail(initiative));
        }
      }
    },
  });

  pi.registerTool({
    name: "initiative_overview",
    label: "initiative_overview",
    description: "Read the machine-usable overview for a durable initiative.",
    promptSnippet:
      "Use the overview together with the initiative record to reason over linked spec and ticket progress before planning strategic next steps.",
    promptGuidelines: [
      "Use this tool when you need machine-usable linked status across strategic, spec, and ticket layers, while keeping the initiative itself as the source of detailed strategic context.",
    ],
    parameters: InitiativeOverviewParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const initiative = await getStore(ctx).readInitiative(params.ref);
      return machineResult(
        { overview: initiative.overview, initiative },
        renderInitiativeOverview(initiative.overview),
      );
    },
  });
}
