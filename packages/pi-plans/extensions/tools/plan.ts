import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { LOOM_LIST_SORTS } from "@pi-loom/pi-storage/storage/list-search.js";
import { type Static, Type } from "@sinclair/typebox";
import type { CreatePlanInput, PlanContextRefsUpdate, UpdatePlanInput } from "../domain/models.js";
import { renderDashboard, renderPlanDetail } from "../domain/render.js";
import { createPlanStore } from "../domain/store.js";

const PlanStatusEnum = StringEnum(["active", "paused", "completed", "archived", "superseded"] as const);
const PlanSourceTargetKindEnum = StringEnum(["workspace", "initiative", "spec", "research"] as const);
const PlanProgressStatusEnum = StringEnum(["done", "pending"] as const);
const PlanWriteActionEnum = StringEnum(["init", "create", "update", "archive"] as const);
const PlanReadModeEnum = StringEnum(["full", "state", "packet", "plan"] as const);
const PlanTicketLinkActionEnum = StringEnum(["link", "unlink"] as const);
const LoomListSortEnum = StringEnum(LOOM_LIST_SORTS);
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

const PlanListParams = Type.Object({
  status: Type.Optional(
    withDescription(
      PlanStatusEnum,
      "Optional exact status filter: active, paused, completed, archived, or superseded.",
    ),
  ),
  sourceKind: Type.Optional(
    withDescription(
      PlanSourceTargetKindEnum,
      "Optional exact source target kind filter. This matches the plan's upstream anchor (`sourceTarget.kind`): workspace, initiative, spec, or research. Leave it unset when you know the plan name or topic but do not know its anchor kind.",
    ),
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
  linkedTicketId: Type.Optional(
    Type.String({ description: "Optional exact ticket id filter for plans linked to a specific ticket." }),
  ),
});

const PlanReadParams = Type.Object({
  ref: Type.String({ description: "Plan id or plan artifact path." }),
  mode: Type.Optional(PlanReadModeEnum),
});

const PlanWriteParams = Type.Object({
  action: PlanWriteActionEnum,
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
});

const PlanPacketParams = Type.Object({
  ref: Type.String(),
});

const PlanTicketLinkParams = Type.Object({
  action: PlanTicketLinkActionEnum,
  ref: Type.String(),
  ticketId: Type.String(),
  role: Type.Optional(Type.String()),
  order: Type.Optional(Type.Number()),
});

const PlanDashboardParams = Type.Object({
  ref: Type.String(),
});

type PlanWriteParamsValue = Static<typeof PlanWriteParams>;

function getStore(ctx: ExtensionContext) {
  return createPlanStore(ctx.cwd);
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

export function registerPlanTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "plan_list",
    label: "plan_list",
    description:
      "List durable execution plans. Leave `sort` unset for the default ordering: `updated_desc` without `text`, `relevance` with `text`. Start broad with `text` when rediscovering a plan by name, topic, or source context; add exact filters such as `status`, `sourceKind`, or `linkedTicketId` only when you intentionally want a narrower result set.",
    promptSnippet:
      "Inspect existing plans before creating a new one so durable execution strategy does not fork; broad text search with the default relevance ranking is the safest first pass when you do not yet know the exact source anchor or status.",
    promptGuidelines: [
      "Use this tool before writing a new plan so broader execution strategy stays consolidated.",
      "When rediscovering an existing plan, start with `text` and no exact filters; the default sort becomes `relevance` for text search, so leave `sort` unset unless you intentionally want a different ordering.",
      "Without `text`, the default sort is `updated_desc`; set `sort` only when you explicitly want created-time or id ordering instead of the normal recency view.",
      "`status`, `sourceKind`, and `linkedTicketId` all narrow by exact stored values, and `sourceKind` in particular matches the upstream anchor type (`workspace`, `initiative`, `spec`, or `research`).",
      "Add exact filters only after the broad search is still too wide or when you intentionally need one specific execution-plan slice.",
    ],
    parameters: PlanListParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const plans = await getStore(ctx).listPlans({
        status: params.status,
        sourceKind: params.sourceKind,
        text: params.text,
        sort: params.sort,
        linkedTicketId: params.linkedTicketId,
      });
      return machineResult(
        { plans },
        plans.length > 0 ? plans.map((plan) => `${plan.id} [${plan.status}] ${plan.title}`).join("\n") : "No plans.",
      );
    },
  });

  pi.registerTool({
    name: "plan_read",
    label: "plan_read",
    description: "Read plan state, packet, or rendered plan markdown from durable Loom plan memory.",
    promptSnippet:
      "Read the plan packet or current plan markdown before inventing a new execution strategy from chat history.",
    promptGuidelines: [
      "Read packet mode when you need the bounded planning handoff from linked durable context.",
      "Read plan mode when you need the current detailed execution strategy, sequencing rationale, and linked ticket checklist.",
    ],
    parameters: PlanReadParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await getStore(ctx).readPlan(params.ref);
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
    description: "Create, update, or archive durable execution plans in local Loom memory.",
    promptSnippet:
      "Persist substantial execution strategy durably instead of leaving multi-ticket planning trapped in scratch chat or one-off notes.",
    promptGuidelines: [
      "Create the plan before repeatedly revising the execution strategy so ticket links and source refs accumulate on a stable durable id.",
      "Update plan content as a self-contained novice-facing workplan with explicit milestones, timestamped progress, concrete commands, validation, recovery guidance, interfaces, and revision notes without duplicating live per-ticket status, checkpoints, or journal detail; linked tickets must still stand alone as complete units of work, whether they pre-existed or were created through the ticket layer during planning.",
      "`progress`, `discoveries`, and `decisions` are whole-list replacements, not patch-by-index updates. `revisionNotes` is append-only: supplied notes are added ahead of the automatic audit note for the write.",
      "For `contextRefs`, use `replace` to correct an entire ref bucket and `remove` to drop specific stale refs. Bare arrays are treated as `replace` for each provided bucket.",
    ],
    parameters: PlanWriteParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const store = getStore(ctx);
      switch (params.action) {
        case "init": {
          const result = await store.initLedger();
          return machineResult(
            { action: params.action, initialized: result },
            `Initialized plan memory at ${result.root}`,
          );
        }
        case "create": {
          const plan = await store.createPlan(toCreateInput(params));
          return machineResult({ action: params.action, plan }, renderPlanDetail(plan));
        }
        case "update": {
          const plan = await store.updatePlan(requireRef(params.ref), toUpdateInput(params));
          return machineResult({ action: params.action, plan }, renderPlanDetail(plan));
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
      const plan = await getStore(ctx).readPlan(params.ref);
      return machineResult({ plan: plan.summary, packet: plan.packet }, plan.packet);
    },
  });

  pi.registerTool({
    name: "plan_ticket_link",
    label: "plan_ticket_link",
    description: "Link or unlink durable tickets from a plan while keeping tickets as the live execution record.",
    promptSnippet:
      "Link tickets to the plan so plan.md carries detailed execution strategy without copying live execution state line-by-line.",
    promptGuidelines: [
      "Use link to attach an existing or newly created ticket to the plan and optionally record a plan-local role for that ticket inside the broader execution narrative, while keeping the ticket itself comprehensive and self-contained.",
      "Use unlink only to remove the active plan membership; ticket provenance is intentionally not scrubbed from the ticket itself.",
    ],
    parameters: PlanTicketLinkParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const store = getStore(ctx);
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
    name: "plan_dashboard",
    label: "plan_dashboard",
    description: "Read the machine-usable plan dashboard rollup for linked tickets and source refs.",
    promptSnippet: "Use the dashboard when you need plan-linked ticket counts and statuses at a glance.",
    promptGuidelines: [
      "Prefer the dashboard for observability and automation; prefer plan_read when you need the full packet or markdown artifact.",
    ],
    parameters: PlanDashboardParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const plan = await getStore(ctx).readPlan(params.ref);
      return machineResult({ dashboard: plan.dashboard }, renderDashboard(plan.dashboard));
    },
  });
}
