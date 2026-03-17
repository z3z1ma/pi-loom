import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";
import { renderDashboard, renderPlanDetail } from "../domain/render.js";
import { createPlanStore } from "../domain/store.js";

const PlanStatusEnum = StringEnum(["active", "paused", "completed", "archived", "superseded"] as const);
const PlanSourceTargetKindEnum = StringEnum(["workspace", "initiative", "spec", "research"] as const);
const PlanWriteActionEnum = StringEnum(["init", "create", "update", "archive"] as const);
const PlanReadModeEnum = StringEnum(["full", "state", "packet", "plan"] as const);
const PlanTicketLinkActionEnum = StringEnum(["link", "unlink"] as const);

const ContextRefsSchema = Type.Object({
  roadmapItemIds: Type.Optional(Type.Array(Type.String())),
  initiativeIds: Type.Optional(Type.Array(Type.String())),
  researchIds: Type.Optional(Type.Array(Type.String())),
  specChangeIds: Type.Optional(Type.Array(Type.String())),
  ticketIds: Type.Optional(Type.Array(Type.String())),
  critiqueIds: Type.Optional(Type.Array(Type.String())),
  docIds: Type.Optional(Type.Array(Type.String())),
});

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

const PlanListParams = Type.Object({
  status: Type.Optional(PlanStatusEnum),
  sourceKind: Type.Optional(PlanSourceTargetKindEnum),
  text: Type.Optional(Type.String()),
  linkedTicketId: Type.Optional(Type.String()),
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
  planOfWork: Type.Optional(Type.String()),
  concreteSteps: Type.Optional(Type.String()),
  validation: Type.Optional(Type.String()),
  risksAndQuestions: Type.Optional(Type.String()),
  outcomesAndRetrospective: Type.Optional(Type.String()),
  scopePaths: Type.Optional(Type.Array(Type.String())),
  contextRefs: Type.Optional(ContextRefsSchema),
  sourceTarget: Type.Optional(SourceTargetSchema),
  discoveries: Type.Optional(Type.Array(PlanDiscoverySchema)),
  decisions: Type.Optional(Type.Array(PlanDecisionSchema)),
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

function requireRef(ref: string | undefined): string {
  if (!ref) {
    throw new Error("Plan reference is required for this action");
  }
  return ref;
}

function toCreateInput(params: PlanWriteParamsValue) {
  if (!params.title?.trim()) {
    throw new Error("title is required for create");
  }
  if (!params.sourceTarget) {
    throw new Error("sourceTarget is required for create");
  }
  return {
    title: params.title,
    summary: params.summary,
    purpose: params.purpose,
    contextAndOrientation: params.contextAndOrientation,
    planOfWork: params.planOfWork,
    concreteSteps: params.concreteSteps,
    validation: params.validation,
    risksAndQuestions: params.risksAndQuestions,
    outcomesAndRetrospective: params.outcomesAndRetrospective,
    scopePaths: params.scopePaths,
    contextRefs: params.contextRefs,
    sourceTarget: params.sourceTarget,
    discoveries: params.discoveries,
    decisions: params.decisions,
  };
}

function toUpdateInput(params: PlanWriteParamsValue) {
  return {
    title: params.title,
    status: params.status,
    summary: params.summary,
    purpose: params.purpose,
    contextAndOrientation: params.contextAndOrientation,
    planOfWork: params.planOfWork,
    concreteSteps: params.concreteSteps,
    validation: params.validation,
    risksAndQuestions: params.risksAndQuestions,
    outcomesAndRetrospective: params.outcomesAndRetrospective,
    scopePaths: params.scopePaths,
    contextRefs: params.contextRefs,
    sourceTarget: params.sourceTarget,
    discoveries: params.discoveries,
    decisions: params.decisions,
  };
}

export function registerPlanTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "plan_list",
    label: "plan_list",
    description: "List durable execution plans by status, source target, text, or linked ticket.",
    promptSnippet: "Inspect existing plans before creating a new one so durable execution strategy does not fork.",
    promptGuidelines: [
      "Use this tool before writing a new plan so broader execution strategy stays consolidated.",
      "Filter by linked ticket or source target when rediscovering the plan that should absorb new work.",
    ],
    parameters: PlanListParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const plans = await getStore(ctx).listPlans(params);
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
      "Update plan content with detailed sequencing, rationale, dependencies, risks, and validation intent without duplicating live per-ticket status, checkpoints, or journal detail; linked tickets must still stand alone as complete units of work, whether they pre-existed or were created through the ticket layer during planning.",
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
          ? await store.linkPlanTicket(params.ref, { ticketId: params.ticketId, role: params.role, order: params.order })
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
