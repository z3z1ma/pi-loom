import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";
import type { CreateInitiativeInput, InitiativeMilestoneInput, UpdateInitiativeInput } from "../domain/models.js";
import { renderInitiativeDashboard, renderInitiativeDetail, renderInitiativeSummary } from "../domain/render.js";
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

const InitiativeListParams = Type.Object({
  status: Type.Optional(InitiativeStatusEnum),
  includeArchived: Type.Optional(Type.Boolean()),
  text: Type.Optional(Type.String()),
  tag: Type.Optional(Type.String()),
});

const InitiativeReadParams = Type.Object({
  ref: Type.String({ description: "Initiative id or initiative directory path." }),
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

const InitiativeDashboardParams = Type.Object({
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
    description: "List initiatives from the durable local strategic memory layer.",
    promptSnippet:
      "Inspect strategic context before creating a new initiative or assuming work has no long-horizon container.",
    promptGuidelines: [
      "Use this tool before creating a new initiative so you do not fork program-level context.",
      "Inspect active initiatives before opening new cross-cutting specs or tickets that may already belong to strategic work.",
    ],
    parameters: InitiativeListParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const initiatives = await getStore(ctx).listInitiatives({
        status: params.status,
        includeArchived: params.includeArchived,
        text: params.text,
        tag: params.tag,
      });
      return machineResult(
        { initiatives },
        initiatives.length > 0 ? initiatives.map(renderInitiativeSummary).join("\n") : "No initiatives.",
      );
    },
  });

  pi.registerTool({
    name: "initiative_read",
    label: "initiative_read",
    description: "Read durable initiative state from the local strategic memory layer.",
    promptSnippet:
      "Load the full strategic record before planning multi-spec or multi-ticket work against an initiative.",
    promptGuidelines: [
      "Read the initiative before changing linked specs or tickets when durable strategic intent, rationale, risks, dependencies, or success criteria may matter.",
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
      "Persist a substantial strategic record with objective, rationale, scope, milestones, metrics, dependencies, linked specs, linked tickets, risks, and status summaries instead of leaving that context only in chat.",
    promptGuidelines: [
      "Use this tool when work deserves durable strategic context beyond a single spec or ticket graph, and make that context detailed enough for later turns to understand the initiative without replaying chat.",
      "Keep initiative rationale, scope boundaries, milestones, dependencies, risks, metrics, links, and status truthful so future turns and agents can rely on them.",
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
          const initiative = await store.createInitiative(toCreateInput(params));
          return machineResult({ action: params.action, initiative }, renderInitiativeDetail(initiative));
        }
        case "update": {
          const initiative = await store.updateInitiative(requireRef(params.ref), toUpdateInput(params));
          return machineResult({ action: params.action, initiative }, renderInitiativeDetail(initiative));
        }
        case "add_decision": {
          if (!params.question?.trim() || !params.answer?.trim()) {
            throw new Error("question and answer are required for add_decision");
          }
          const initiative = await store.recordDecision(
            requireRef(params.ref),
            params.question,
            params.answer,
            params.decisionKind,
          );
          return machineResult({ action: params.action, initiative }, renderInitiativeDetail(initiative));
        }
        case "link_spec": {
          if (!params.specChangeId?.trim()) throw new Error("specChangeId is required for link_spec");
          const initiative = await store.linkSpec(requireRef(params.ref), params.specChangeId);
          return machineResult({ action: params.action, initiative }, renderInitiativeDetail(initiative));
        }
        case "unlink_spec": {
          if (!params.specChangeId?.trim()) throw new Error("specChangeId is required for unlink_spec");
          const initiative = await store.unlinkSpec(requireRef(params.ref), params.specChangeId);
          return machineResult({ action: params.action, initiative }, renderInitiativeDetail(initiative));
        }
        case "link_ticket": {
          if (!params.ticketId?.trim()) throw new Error("ticketId is required for link_ticket");
          const initiative = await store.linkTicket(requireRef(params.ref), params.ticketId);
          return machineResult({ action: params.action, initiative }, renderInitiativeDetail(initiative));
        }
        case "unlink_ticket": {
          if (!params.ticketId?.trim()) throw new Error("ticketId is required for unlink_ticket");
          const initiative = await store.unlinkTicket(requireRef(params.ref), params.ticketId);
          return machineResult({ action: params.action, initiative }, renderInitiativeDetail(initiative));
        }
        case "upsert_milestone": {
          if (!params.milestone) throw new Error("milestone is required for upsert_milestone");
          const initiative = await store.upsertMilestone(
            requireRef(params.ref),
            params.milestone as InitiativeMilestoneInput,
          );
          return machineResult({ action: params.action, initiative }, renderInitiativeDetail(initiative));
        }
        case "archive": {
          const initiative = await store.archiveInitiative(requireRef(params.ref));
          return machineResult({ action: params.action, initiative }, renderInitiativeDetail(initiative));
        }
      }
    },
  });

  pi.registerTool({
    name: "initiative_dashboard",
    label: "initiative_dashboard",
    description: "Read the machine-usable dashboard for a durable initiative.",
    promptSnippet:
      "Use the dashboard together with the initiative record to reason over linked spec and ticket progress before planning strategic next steps.",
    promptGuidelines: [
      "Use this tool when you need machine-usable linked status across strategic, spec, and ticket layers, while keeping the initiative itself as the source of detailed strategic context.",
    ],
    parameters: InitiativeDashboardParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const initiative = await getStore(ctx).readInitiative(params.ref);
      return machineResult(
        { dashboard: initiative.dashboard, initiative },
        renderInitiativeDashboard(initiative.dashboard),
      );
    },
  });
}
