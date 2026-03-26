import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";
import { analyzeListQuery, renderAnalyzedListQuery } from "#storage/list-query.js";
import { LOOM_LIST_SORTS } from "#storage/list-search.js";
import {
  REVIEW_STATUSES,
  TICKET_BRANCH_MODES,
  TICKET_PRIORITIES,
  TICKET_RISKS,
  TICKET_TYPES,
} from "#ticketing/domain/models.js";
import type { CreatePlanInput, PlanContextRefsUpdate, UpdatePlanInput } from "../domain/models.js";
import { renderOverview, renderPlanDetail } from "../domain/render.js";
import { createPlanStore } from "../domain/store.js";

const PlanStatusEnum = StringEnum(["active", "paused", "completed", "archived", "superseded"] as const);
const PlanSourceTargetKindEnum = StringEnum(["workspace", "initiative", "spec", "research"] as const);
const PlanProgressStatusEnum = StringEnum(["done", "pending"] as const);
const PlanWriteActionEnum = StringEnum(["init", "create", "update", "archive"] as const);
const PlanReadModeEnum = StringEnum(["full", "state", "packet", "plan"] as const);
const PlanTicketLinkActionEnum = StringEnum(["link", "unlink"] as const);
const LoomListSortEnum = StringEnum(LOOM_LIST_SORTS);
const TicketTypeEnum = StringEnum(TICKET_TYPES);
const TicketPriorityEnum = StringEnum(TICKET_PRIORITIES);
const TicketRiskEnum = StringEnum(TICKET_RISKS);
const TicketReviewStatusEnum = StringEnum(REVIEW_STATUSES);
const TicketBranchModeEnum = StringEnum(TICKET_BRANCH_MODES);
function withDescription<T extends Record<string, unknown>>(schema: T, description: string): T {
  return { ...schema, description } as T;
}

const SourceTargetSchema = Type.Object({
  kind: PlanSourceTargetKindEnum,
  ref: Type.String(),
});

const PlanDiscoverySchema = Type.Object({
  note: Type.String(),
  evidence: Type.String(),
});

const PlanDecisionSchema = Type.Object({
  decision: Type.String(),
  rationale: Type.String(),
  date: Type.String(),
  author: Type.String(),
});

const PlanProgressSchema = Type.Object({
  timestamp: Type.String(),
  status: PlanProgressStatusEnum,
  text: Type.String(),
});

const PlanRevisionSchema = Type.Object({
  timestamp: Type.String(),
  change: Type.String(),
  reason: Type.String(),
});

const PlanLinkedTicketInputSchema = Type.Object({
  ticketRef: Type.Optional(Type.String()),
  title: Type.Optional(Type.String()),
  summary: Type.Optional(Type.String()),
  context: Type.Optional(Type.String()),
  plan: Type.Optional(Type.String()),
  notes: Type.Optional(Type.String()),
  verification: Type.Optional(Type.String()),
  journalSummary: Type.Optional(Type.String()),
  priority: Type.Optional(TicketPriorityEnum),
  type: Type.Optional(TicketTypeEnum),
  tags: Type.Optional(Type.Array(Type.String())),
  deps: Type.Optional(Type.Array(Type.String())),
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
  branchMode: Type.Optional(TicketBranchModeEnum),
  branchFamily: Type.Optional(Type.String()),
  exactBranchName: Type.Optional(Type.String()),
  role: Type.Optional(Type.String()),
  order: Type.Optional(Type.Number()),
});

const PlanListParams = Type.Object({
  exactStatus: Type.Optional(
    withDescription(
      PlanStatusEnum,
      "Optional exact status filter: active, paused, completed, archived, or superseded.",
    ),
  ),
  exactSourceKind: Type.Optional(
    withDescription(
      PlanSourceTargetKindEnum,
      "Optional exact source target kind filter. This matches the plan's upstream anchor (`sourceTarget.kind`): workspace, initiative, spec, or research. Leave it unset when you know the plan name or topic but do not know its anchor kind.",
    ),
  ),
  exactRepositoryId: Type.Optional(
    Type.String({
      description:
        "Optional exact repository id filter. Use a repository id from `scope_read` or prior machine-readable plan results when you intentionally want one repository slice.",
    }),
  ),
  text: Type.Optional(
    Type.String({
      description:
        "Free-text search over plan id, title, summary, source ref, and source kind. Leave `sort` unset to rank by relevance when text is present; prefer starting with text alone, then add filters only after you find the right plan family.",
    }),
  ),
  sort: Type.Optional(
    withDescription(
      LoomListSortEnum,
      "Optional result ordering override. Defaults to `relevance` when `text` is present, otherwise `updated_desc`. Set this only when you need recency, creation time, or id ordering instead of the default ranking.",
    ),
  ),
  exactLinkedTicketId: Type.Optional(
    Type.String({ description: "Optional exact ticket id filter for plans linked to a specific ticket." }),
  ),
});

const PlanReadParams = Type.Object({
  ref: Type.String({ description: "Plan id or plan artifact path." }),
  repositoryId: Type.Optional(
    Type.String({
      description: "Optional repository id for repository-targeted reads when the active scope is ambiguous.",
    }),
  ),
  worktreeId: Type.Optional(
    Type.String({
      description: "Optional worktree id for repository-targeted reads when a specific clone/worktree matters.",
    }),
  ),
  mode: Type.Optional(PlanReadModeEnum),
});

const PlanWriteParams = Type.Object({
  action: PlanWriteActionEnum,
  repositoryId: Type.Optional(
    Type.String({
      description: "Optional repository id for repository-targeted writes when the active scope is ambiguous.",
    }),
  ),
  worktreeId: Type.Optional(
    Type.String({
      description: "Optional worktree id for repository-targeted writes when a specific clone/worktree matters.",
    }),
  ),
  ref: Type.Optional(Type.String()),
  title: Type.Optional(Type.String()),
  status: Type.Optional(PlanStatusEnum),
  summary: Type.Optional(Type.String()),
  purpose: Type.Optional(Type.String()),
  contextAndOrientation: Type.Optional(Type.String()),
  milestones: Type.Optional(Type.String()),
  planOfWork: Type.Optional(Type.String()),
  concreteSteps: Type.Optional(Type.String()),
  validation: Type.Optional(Type.String()),
  idempotenceAndRecovery: Type.Optional(Type.String()),
  artifactsAndNotes: Type.Optional(Type.String()),
  interfacesAndDependencies: Type.Optional(Type.String()),
  risksAndQuestions: Type.Optional(Type.String()),
  outcomesAndRetrospective: Type.Optional(Type.String()),
  scopePaths: Type.Optional(Type.Array(Type.String())),
  contextRefs: Type.Optional(
    withDescription(
      Type.Object({}, { additionalProperties: true }),
      "Either bare context-ref buckets or an update object. For updates, use `replace` to set listed buckets exactly, `remove` to drop specific stale refs, or combine both. Omitted buckets stay unchanged.",
    ),
  ),
  progress: Type.Optional(Type.Array(PlanProgressSchema)),
  sourceTarget: Type.Optional(SourceTargetSchema),
  discoveries: Type.Optional(Type.Array(PlanDiscoverySchema)),
  decisions: Type.Optional(Type.Array(PlanDecisionSchema)),
  revisionNotes: Type.Optional(Type.Array(PlanRevisionSchema)),
  linkedTicketInputs: Type.Optional(
    withDescription(
      Type.Array(PlanLinkedTicketInputSchema),
      "Optional linked-ticket materialization input. Each entry either references an existing ticket via `ticketRef` or defines a new ticket to create via `title` plus full ticket detail. Use this when you can still make every ticket self-contained; omit it when you need to scaffold the plan first and add tickets later.",
    ),
  ),
});

const PlanPacketParams = Type.Object({
  ref: Type.String(),
  repositoryId: Type.Optional(
    Type.String({
      description: "Optional repository id for repository-targeted packet reads when the active scope is ambiguous.",
    }),
  ),
  worktreeId: Type.Optional(
    Type.String({
      description: "Optional worktree id for repository-targeted packet reads when a specific clone/worktree matters.",
    }),
  ),
});

const PlanTicketLinkParams = Type.Object({
  action: PlanTicketLinkActionEnum,
  ref: Type.String(),
  repositoryId: Type.Optional(
    Type.String({
      description:
        "Optional repository id for repository-targeted plan ticket linkage when the active scope is ambiguous.",
    }),
  ),
  worktreeId: Type.Optional(
    Type.String({
      description:
        "Optional worktree id for repository-targeted plan ticket linkage when a specific clone/worktree matters.",
    }),
  ),
  ticketId: Type.String(),
  role: Type.Optional(Type.String()),
  order: Type.Optional(Type.Number()),
});

const PlanOverviewParams = Type.Object({
  ref: Type.String(),
  repositoryId: Type.Optional(
    Type.String({
      description: "Optional repository id for repository-targeted overview reads when the active scope is ambiguous.",
    }),
  ),
  worktreeId: Type.Optional(
    Type.String({
      description:
        "Optional worktree id for repository-targeted overview reads when a specific clone/worktree matters.",
    }),
  ),
});

type PlanWriteParamsValue = Static<typeof PlanWriteParams>;

function getStore(ctx: ExtensionContext) {
  return createPlanStore(ctx.cwd);
}

function getScopedStore(ctx: ExtensionContext, scope?: { repositoryId?: string; worktreeId?: string }) {
  return createPlanStore(ctx.cwd, {
    repositoryId: scope?.repositoryId,
    worktreeId: scope?.worktreeId,
  });
}

function machineResult(details: Record<string, unknown>, text: string) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

function isContextRefsUpdate(value: unknown): value is PlanContextRefsUpdate {
  return Boolean(value && typeof value === "object" && ("replace" in value || "remove" in value));
}

function requireRef(ref: string | undefined): string {
  if (!ref) {
    throw new Error("Plan reference is required for this action");
  }
  return ref;
}

function toCreateInput(params: PlanWriteParamsValue): CreatePlanInput {
  if (!params.title?.trim()) {
    throw new Error("title is required for create");
  }
  if (!params.sourceTarget) {
    throw new Error("sourceTarget is required for create");
  }
  if (isContextRefsUpdate(params.contextRefs)) {
    if (params.contextRefs.remove) {
      throw new Error("contextRefs.remove is only supported for update");
    }
  }
  const contextRefs: CreatePlanInput["contextRefs"] = isContextRefsUpdate(params.contextRefs)
    ? (params.contextRefs.replace as CreatePlanInput["contextRefs"])
    : (params.contextRefs as CreatePlanInput["contextRefs"]);
  return {
    title: params.title,
    summary: params.summary,
    purpose: params.purpose,
    contextAndOrientation: params.contextAndOrientation,
    milestones: params.milestones,
    planOfWork: params.planOfWork,
    concreteSteps: params.concreteSteps,
    validation: params.validation,
    idempotenceAndRecovery: params.idempotenceAndRecovery,
    artifactsAndNotes: params.artifactsAndNotes,
    interfacesAndDependencies: params.interfacesAndDependencies,
    risksAndQuestions: params.risksAndQuestions,
    outcomesAndRetrospective: params.outcomesAndRetrospective,
    scopePaths: params.scopePaths,
    contextRefs,
    sourceTarget: params.sourceTarget,
    progress: params.progress,
    discoveries: params.discoveries,
    decisions: params.decisions,
    revisionNotes: params.revisionNotes,
  };
}

function toUpdateInput(params: PlanWriteParamsValue): UpdatePlanInput {
  const contextRefs: PlanContextRefsUpdate | undefined = isContextRefsUpdate(params.contextRefs)
    ? (params.contextRefs as PlanContextRefsUpdate)
    : params.contextRefs
      ? { replace: params.contextRefs as NonNullable<CreatePlanInput["contextRefs"]> }
      : undefined;
  return {
    title: params.title,
    status: params.status,
    summary: params.summary,
    purpose: params.purpose,
    contextAndOrientation: params.contextAndOrientation,
    milestones: params.milestones,
    planOfWork: params.planOfWork,
    concreteSteps: params.concreteSteps,
    validation: params.validation,
    idempotenceAndRecovery: params.idempotenceAndRecovery,
    artifactsAndNotes: params.artifactsAndNotes,
    interfacesAndDependencies: params.interfacesAndDependencies,
    risksAndQuestions: params.risksAndQuestions,
    outcomesAndRetrospective: params.outcomesAndRetrospective,
    scopePaths: params.scopePaths,
    contextRefs,
    sourceTarget: params.sourceTarget,
    progress: params.progress,
    discoveries: params.discoveries,
    decisions: params.decisions,
    revisionNotes: params.revisionNotes,
  };
}

function hasPlanUpdateFields(params: PlanWriteParamsValue): boolean {
  return [
    params.title,
    params.status,
    params.summary,
    params.purpose,
    params.contextAndOrientation,
    params.milestones,
    params.planOfWork,
    params.concreteSteps,
    params.validation,
    params.idempotenceAndRecovery,
    params.artifactsAndNotes,
    params.interfacesAndDependencies,
    params.risksAndQuestions,
    params.outcomesAndRetrospective,
    params.scopePaths,
    params.contextRefs,
    params.progress,
    params.sourceTarget,
    params.discoveries,
    params.decisions,
    params.revisionNotes,
  ].some((value) => value !== undefined);
}

export function registerPlanTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "plan_list",
    label: "plan_list",
    description:
      "List durable execution plans. Leave `sort` unset for the default ordering: `updated_desc` without `text`, `relevance` with `text`. Start broad with `text` when rediscovering a plan by name, topic, or source context; add exact filters such as `exactStatus`, `exactSourceKind`, or `exactLinkedTicketId` only when you intentionally want a narrower result set.",
    promptSnippet:
      "You **MUST** inspect existing plans before creating a new one so durable execution strategy does not fork. Start with broad text search to find the right family.",
    promptGuidelines: [
      "Use this tool before writing a new plan so broader execution strategy stays consolidated.",
      "When rediscovering an existing plan, start with `text` and no exact filters; the default sort becomes `relevance` for text search, so leave `sort` unset unless you intentionally want a different ordering.",
      "Without `text`, the default sort is `updated_desc`; set `sort` only when you explicitly want created-time or id ordering instead of the normal recency view.",
      "`exactStatus`, `exactSourceKind`, and `exactLinkedTicketId` all narrow by exact stored values, and `exactSourceKind` in particular matches the upstream anchor type (`workspace`, `initiative`, `spec`, or `research`).",
      "Add exact filters only after the broad search is still too wide or when you intentionally need one specific execution-plan slice.",
      "If a zero-result query used exact filters, inspect the returned query diagnostics and broader text-only suggestions before assuming the plan is absent.",
    ],
    parameters: PlanListParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await analyzeListQuery(
        params,
        (next) =>
          getStore(ctx).listPlans({
            status: next.exactStatus,
            repositoryId: next.exactRepositoryId,
            sourceKind: next.exactSourceKind,
            text: next.text,
            sort: next.sort,
            linkedTicketId: next.exactLinkedTicketId,
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
              key: "exactRepositoryId",
              value: params.exactRepositoryId,
              clear: (current) => ({ ...current, exactRepositoryId: undefined }),
            },
            {
              key: "exactSourceKind",
              value: params.exactSourceKind,
              clear: (current) => ({ ...current, exactSourceKind: undefined }),
            },
            {
              key: "exactLinkedTicketId",
              value: params.exactLinkedTicketId,
              clear: (current) => ({ ...current, exactLinkedTicketId: undefined }),
            },
          ],
        },
      );

      return machineResult(
        { plans: result.items, queryDiagnostics: result.diagnostics, broaderMatches: result.broaderMatches },
        renderAnalyzedListQuery(result, {
          emptyText: "No plans.",
          renderItem: (plan) =>
            `${plan.id} [${plan.status}]${plan.repository ? ` repo=${plan.repository.slug}` : ""} ${plan.title}`,
        }),
      );
    },
  });

  pi.registerTool({
    name: "plan_read",
    label: "plan_read",
    description: "Read plan state, packet, or rendered plan markdown from durable Loom plan memory.",
    promptSnippet:
      "You **MUST** read the plan packet or current plan markdown before inventing a new execution strategy from chat history.",
    promptGuidelines: [
      "Read packet mode when you need the bounded planning handoff from linked durable context.",
      "Read plan mode when you need the current detailed execution strategy, sequencing rationale, and linked ticket checklist.",
    ],
    parameters: PlanReadParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await getScopedStore(ctx, params).readPlan(params.ref);
      if (params.mode === "packet") {
        return machineResult({ plan: result.summary, packet: result.packet }, result.packet);
      }
      if (params.mode === "plan") {
        return machineResult({ plan: result.summary, planMarkdown: result.plan }, result.plan);
      }
      if (params.mode === "state") {
        return machineResult({ state: result.state, summary: result.summary }, JSON.stringify(result.state, null, 2));
      }
      return machineResult({ plan: result }, renderPlanDetail(result));
    },
  });

  pi.registerTool({
    name: "plan_write",
    label: "plan_write",
    description:
      "Create, update, or archive durable execution plans in local Loom memory, optionally materializing linked tickets in the same write.",
    promptSnippet:
      "You **MUST** use this tool to persist any execution strategy. Do not leave planning in chat; if you have a plan, you **MUST** write it down.",
    promptGuidelines: [
      "Create the plan before repeatedly revising the execution strategy so ticket links and source refs accumulate on a stable durable id.",
      "Update plan content as a self-contained novice-facing workplan with explicit milestones, timestamped progress, concrete commands, validation, recovery guidance, interfaces, and revision notes without duplicating live per-ticket status, checkpoints, or journal detail; linked tickets must still stand alone as complete units of work, whether they pre-existed or were created through this tool during planning.",
      "Use `linkedTicketInputs` when the execution slice is already clear and you can still write every ticket as a self-contained execution record with concrete acceptance and verification detail. Omit `linkedTicketInputs` when you need to scaffold the plan first and spend more room authoring the tickets later.",
      "`progress`, `discoveries`, and `decisions` are whole-list replacements, not patch-by-index updates. `revisionNotes` is append-only: supplied notes are added ahead of the automatic audit note for the write.",
      "For `contextRefs`, use `replace` to correct an entire ref bucket and `remove` to drop specific stale refs. Bare arrays are treated as `replace` for each provided bucket.",
    ],
    parameters: PlanWriteParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const store = getScopedStore(ctx, params);
      switch (params.action) {
        case "init": {
          const result = await store.initLedger();
          return machineResult(
            { action: params.action, initialized: result },
            `Initialized plan memory at ${result.root}`,
          );
        }
        case "create": {
          const created = await store.createPlan(toCreateInput(params));
          const result =
            params.linkedTicketInputs && params.linkedTicketInputs.length > 0
              ? await store.materializeLinkedTickets(created.state.planId, params.linkedTicketInputs)
              : { plan: created, tickets: [] };
          return machineResult(
            { action: params.action, plan: result.plan, materializedTickets: result.tickets },
            renderPlanDetail(result.plan),
          );
        }
        case "update": {
          const ref = requireRef(params.ref);
          const updated = hasPlanUpdateFields(params)
            ? await store.updatePlan(ref, toUpdateInput(params))
            : await store.readPlan(ref);
          const result =
            params.linkedTicketInputs && params.linkedTicketInputs.length > 0
              ? await store.materializeLinkedTickets(updated.state.planId, params.linkedTicketInputs)
              : { plan: updated, tickets: [] };
          return machineResult(
            { action: params.action, plan: result.plan, materializedTickets: result.tickets },
            renderPlanDetail(result.plan),
          );
        }
        case "archive": {
          const plan = await store.archivePlan(requireRef(params.ref));
          return machineResult({ action: params.action, plan }, renderPlanDetail(plan));
        }
      }
    },
  });

  pi.registerTool({
    name: "plan_packet",
    label: "plan_packet",
    description: "Read the bounded planning packet for a durable work plan.",
    promptSnippet:
      "Use the packet when a fresh planner needs bounded durable context instead of inheriting saturated implementation chat.",
    promptGuidelines: ["Prefer the packet when synthesizing or revising a plan from linked durable context."],
    parameters: PlanPacketParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const plan = await getScopedStore(ctx, params).readPlan(params.ref);
      return machineResult({ plan: plan.summary, packet: plan.packet }, plan.packet);
    },
  });

  pi.registerTool({
    name: "plan_ticket_link",
    label: "plan_ticket_link",
    description: "Link or unlink durable tickets from a plan while keeping tickets as the live execution record.",
    promptSnippet:
      "Link tickets to the plan so the execution strategy stays detailed without copying live ticket state line-by-line.",
    promptGuidelines: [
      "Use link to attach an existing or newly created ticket to the plan and optionally record a plan-local role for that ticket inside the broader execution narrative, while keeping the ticket itself comprehensive and self-contained.",
      "Use unlink only to remove the active plan membership; ticket provenance remains on the ticket so historical rediscovery still works.",
    ],
    parameters: PlanTicketLinkParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const store = getScopedStore(ctx, params);
      const plan =
        params.action === "link"
          ? await store.linkPlanTicket(params.ref, {
              ticketId: params.ticketId,
              role: params.role,
              order: params.order,
            })
          : await store.unlinkPlanTicket(params.ref, params.ticketId);
      return machineResult({ action: params.action, plan }, renderPlanDetail(plan));
    },
  });

  pi.registerTool({
    name: "plan_overview",
    label: "plan_overview",
    description: "Read the machine-usable plan overview rollup for linked tickets and source refs.",
    promptSnippet: "Use the overview when you need plan-linked ticket counts and statuses at a glance.",
    promptGuidelines: [
      "Prefer the overview for observability and automation; prefer plan_read when you need the full packet or markdown artifact.",
    ],
    parameters: PlanOverviewParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const plan = await getScopedStore(ctx, params).readPlan(params.ref);
      return machineResult({ overview: plan.overview }, renderOverview(plan.overview));
    },
  });
}
