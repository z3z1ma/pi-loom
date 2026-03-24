import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";
import type {
  ConstitutionalEntryInput,
  RoadmapItemInput,
  UpdateRoadmapInput,
  UpdateRoadmapItemInput,
  UpdateVisionInput,
} from "../domain/models.js";
import { renderConstitutionDashboard, renderConstitutionDetail, renderRoadmapItemDetail } from "../domain/render.js";
import { createConstitutionalStore } from "../domain/store.js";

const ConstitutionSectionEnum = StringEnum([
  "all",
  "state",
  "brief",
  "vision",
  "principles",
  "constraints",
  "roadmap",
] as const);
const ConstitutionWriteActionEnum = StringEnum([
  "init",
  "update_vision",
  "update_principles",
  "update_constraints",
  "update_roadmap",
  "record_decision",
] as const);
const ConstitutionDecisionKindEnum = StringEnum([
  "clarification",
  "revision",
  "roadmap_update",
  "principle_update",
  "constraint_update",
] as const);
const RoadmapStatusEnum = StringEnum(["candidate", "active", "paused", "completed", "superseded"] as const);
const RoadmapHorizonEnum = StringEnum(["now", "next", "later"] as const);
const ConstitutionRoadmapActionEnum = StringEnum([
  "list_items",
  "create_item",
  "update_item",
  "link_initiative",
  "unlink_initiative",
] as const);

const ConstitutionalEntryParams = Type.Object({
  id: Type.Optional(Type.String()),
  title: Type.String(),
  summary: Type.String(),
  rationale: Type.Optional(Type.String()),
});

const ConstitutionReadParams = Type.Object({
  section: Type.Optional(ConstitutionSectionEnum),
  itemId: Type.Optional(Type.String()),
});

const ConstitutionWriteParams = Type.Object({
  action: ConstitutionWriteActionEnum,
  projectId: Type.Optional(Type.String()),
  title: Type.Optional(Type.String()),
  visionSummary: Type.Optional(Type.String()),
  visionNarrative: Type.Optional(Type.String()),
  principles: Type.Optional(Type.Array(ConstitutionalEntryParams)),
  constraints: Type.Optional(Type.Array(ConstitutionalEntryParams)),
  strategicDirectionSummary: Type.Optional(Type.String()),
  currentFocus: Type.Optional(Type.Array(Type.String())),
  openConstitutionQuestions: Type.Optional(Type.Array(Type.String())),
  question: Type.Optional(Type.String()),
  answer: Type.Optional(Type.String()),
  decisionKind: Type.Optional(ConstitutionDecisionKindEnum),
  affectedArtifacts: Type.Optional(Type.Array(Type.String())),
});

const ConstitutionRoadmapParams = Type.Object({
  action: ConstitutionRoadmapActionEnum,
  itemId: Type.Optional(Type.String()),
  title: Type.Optional(Type.String()),
  status: Type.Optional(RoadmapStatusEnum),
  horizon: Type.Optional(RoadmapHorizonEnum),
  summary: Type.Optional(Type.String()),
  rationale: Type.Optional(Type.String()),
  initiativeIds: Type.Optional(Type.Array(Type.String())),
  researchIds: Type.Optional(Type.Array(Type.String())),
  specChangeIds: Type.Optional(Type.Array(Type.String())),
  initiativeId: Type.Optional(Type.String()),
});

const ConstitutionDashboardParams = Type.Object({});

type ConstitutionReadParamsValue = Static<typeof ConstitutionReadParams>;
type ConstitutionWriteParamsValue = Static<typeof ConstitutionWriteParams>;
type ConstitutionRoadmapParamsValue = Static<typeof ConstitutionRoadmapParams>;

function getStore(ctx: ExtensionContext) {
  return createConstitutionalStore(ctx.cwd);
}

function machineResult(details: Record<string, unknown>, text: string) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

function renderRoadmapListText(
  items: Array<{ id: string; horizon: string; status: string; title: string; summary: string }>,
): string {
  if (items.length === 0) {
    return "No roadmap items match the requested filters.";
  }
  return items
    .map((item) => {
      const summary = item.summary.trim();
      return summary.length > 0
        ? `${item.id} [${item.horizon}/${item.status}] ${item.title}\n${summary}`
        : `${item.id} [${item.horizon}/${item.status}] ${item.title}`;
    })
    .join("\n\n");
}

function requireItemId(itemId: string | undefined): string {
  if (!itemId) {
    throw new Error("itemId is required for this action");
  }
  return itemId;
}

function toVisionUpdate(params: ConstitutionWriteParamsValue): UpdateVisionInput {
  return {
    projectId: params.projectId,
    title: params.title,
    visionSummary: params.visionSummary,
    visionNarrative: params.visionNarrative,
  };
}

function toRoadmapUpdate(params: ConstitutionWriteParamsValue): UpdateRoadmapInput {
  return {
    strategicDirectionSummary: params.strategicDirectionSummary,
    currentFocus: params.currentFocus,
    openConstitutionQuestions: params.openConstitutionQuestions,
  };
}

function toRoadmapCreate(params: ConstitutionRoadmapParamsValue): RoadmapItemInput {
  if (!params.title?.trim()) {
    throw new Error("title is required for create_item");
  }
  return {
    title: params.title,
    status: params.status,
    horizon: params.horizon,
    summary: params.summary,
    rationale: params.rationale,
    initiativeIds: params.initiativeIds,
    researchIds: params.researchIds,
    specChangeIds: params.specChangeIds,
  };
}

function toRoadmapUpdateItem(params: ConstitutionRoadmapParamsValue): UpdateRoadmapItemInput {
  return {
    id: requireItemId(params.itemId),
    title: params.title,
    status: params.status,
    horizon: params.horizon,
    summary: params.summary,
    rationale: params.rationale,
    initiativeIds: params.initiativeIds,
    researchIds: params.researchIds,
    specChangeIds: params.specChangeIds,
  };
}

export function registerConstitutionTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "constitution_read",
    label: "constitution_read",
    description:
      "Read constitutional memory, compiled brief content, roadmap summaries, or a specific embedded roadmap item with its durable strategic context.",
    promptSnippet:
      "Inspect constitutional memory before making strategic, roadmap, or constraint-sensitive decisions, and recover the detailed rationale, implications, and affected artifacts before editing it.",
    promptGuidelines: [
      "Use this tool before creating or revising initiatives, strategic specs, or roadmap-scale research.",
      "Prefer the constitutional brief when you need compact governing context, then update the fuller underlying artifacts when intent changes.",
      "Read the detailed constitutional artifact before revising it so changes preserve rationale, implications, provenance, and layer boundaries.",
    ],
    parameters: ConstitutionReadParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if ((params as ConstitutionReadParamsValue).itemId) {
        const item = await getStore(ctx).readRoadmapItem((params as ConstitutionReadParamsValue).itemId as string);
        return machineResult({ item }, renderRoadmapItemDetail(item));
      }
      const record = await getStore(ctx).readConstitution();
      const section = (params as ConstitutionReadParamsValue).section ?? "all";
      switch (section) {
        case "state":
          return machineResult({ state: record.state }, JSON.stringify(record.state, null, 2));
        case "brief":
          return machineResult({ brief: record.brief, state: record.state }, record.brief);
        case "vision":
          return machineResult({ vision: record.vision, state: record.state }, record.vision);
        case "principles":
          return machineResult({ principles: record.principles, state: record.state }, record.principles);
        case "constraints":
          return machineResult({ constraints: record.constraints, state: record.state }, record.constraints);
        case "roadmap":
          return machineResult({ roadmap: record.roadmap, state: record.state }, record.roadmap);
        default:
          return machineResult({ constitution: record }, renderConstitutionDetail(record));
      }
    },
  });

  pi.registerTool({
    name: "constitution_write",
    label: "constitution_write",
    description:
      "Create or update durable constitutional memory, including fully detailed principles, constraints, roadmap context, and strategic decisions.",
    promptSnippet:
      "Persist project-defining vision, principles, constraints, and constitutional decisions as detailed durable artifacts with rationale, implications, provenance, and affected artifacts instead of leaving them in chat.",
    promptGuidelines: [
      "Use this tool when the user clarifies project identity, durable constraints, or strategic direction.",
      "`update_principles` and `update_constraints` replace the full stored list for that section; send the complete desired set each time.",
      "Write constitutional artifacts so they are self-contained for future readers: include problem framing, rationale, assumptions, scope and non-goals, dependencies, risks, edge cases, verification expectations, provenance, and open questions when relevant.",
      "Keep vision, principles, and constraints higher-friction than roadmap updates; do not silently rewrite project identity, and require equally durable rationale when they do change.",
    ],
    parameters: ConstitutionWriteParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const store = getStore(ctx);
      switch ((params as ConstitutionWriteParamsValue).action) {
        case "init": {
          const initialized = await store.initLedger({ title: params.title, projectId: params.projectId });
          return machineResult(
            { action: params.action, initialized, constitution: await store.readConstitution() },
            `Initialized constitutional memory at ${initialized.root}`,
          );
        }
        case "update_vision": {
          const constitution = await store.updateVision(toVisionUpdate(params as ConstitutionWriteParamsValue));
          return machineResult({ action: params.action, constitution }, renderConstitutionDetail(constitution));
        }
        case "update_principles": {
          if (!(params as ConstitutionWriteParamsValue).principles) {
            throw new Error("principles are required for update_principles");
          }
          const constitution = await store.setPrinciples(
            (params as ConstitutionWriteParamsValue).principles as ConstitutionalEntryInput[],
          );
          return machineResult({ action: params.action, constitution }, renderConstitutionDetail(constitution));
        }
        case "update_constraints": {
          if (!(params as ConstitutionWriteParamsValue).constraints) {
            throw new Error("constraints are required for update_constraints");
          }
          const constitution = await store.setConstraints(
            (params as ConstitutionWriteParamsValue).constraints as ConstitutionalEntryInput[],
          );
          return machineResult({ action: params.action, constitution }, renderConstitutionDetail(constitution));
        }
        case "update_roadmap": {
          const constitution = await store.updateRoadmap(toRoadmapUpdate(params as ConstitutionWriteParamsValue));
          return machineResult({ action: params.action, constitution }, renderConstitutionDetail(constitution));
        }
        case "record_decision": {
          if (
            !(params as ConstitutionWriteParamsValue).question?.trim() ||
            !(params as ConstitutionWriteParamsValue).answer?.trim()
          ) {
            throw new Error("question and answer are required for record_decision");
          }
          const constitution = await store.recordDecision(
            (params as ConstitutionWriteParamsValue).question as string,
            (params as ConstitutionWriteParamsValue).answer as string,
            (params as ConstitutionWriteParamsValue).decisionKind,
            (params as ConstitutionWriteParamsValue).affectedArtifacts,
          );
          return machineResult({ action: params.action, constitution }, renderConstitutionDetail(constitution));
        }
      }
    },
  });

  pi.registerTool({
    name: "constitution_roadmap",
    label: "constitution_roadmap",
    description:
      "List, create, update, and link embedded constitutional roadmap items with durable sequencing context.",
    promptSnippet:
      "Use embedded roadmap items to evolve strategic sequencing without rewriting stable project principles, while preserving detailed rationale, dependencies, risks, verification expectations, and linked work.",
    promptGuidelines: [
      "Use roadmap items for mutable sequencing and initiative linkage while keeping vision, principles, and constraints stable.",
      'Roadmap item ids are stable within the constitution aggregate, not global canonical entity ids; discover them with `list_items` or `constitution_read(section="roadmap")` before mutating them.',
      "Roadmap items may change more easily than principles or constraints, but each item should still capture the full context needed to explain why it exists, what it depends on, what it risks, and how completion will be verified.",
      "Link initiatives truthfully so roadmap ownership remains observable across layers, and record affected artifacts when roadmap changes shift constitutional intent.",
    ],
    parameters: ConstitutionRoadmapParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const store = getStore(ctx);
      switch ((params as ConstitutionRoadmapParamsValue).action) {
        case "list_items": {
          const items = await store.listRoadmapItems({
            status: (params as ConstitutionRoadmapParamsValue).status,
            horizon: (params as ConstitutionRoadmapParamsValue).horizon,
          });
          return machineResult(
            {
              action: params.action,
              filters: {
                status: (params as ConstitutionRoadmapParamsValue).status ?? null,
                horizon: (params as ConstitutionRoadmapParamsValue).horizon ?? null,
              },
              items,
            },
            renderRoadmapListText(items),
          );
        }
        case "create_item": {
          const constitution = await store.upsertRoadmapItem(toRoadmapCreate(params as ConstitutionRoadmapParamsValue));
          return machineResult({ action: params.action, constitution }, renderConstitutionDetail(constitution));
        }
        case "update_item": {
          const constitution = await store.upsertRoadmapItem(
            toRoadmapUpdateItem(params as ConstitutionRoadmapParamsValue),
          );
          return machineResult({ action: params.action, constitution }, renderConstitutionDetail(constitution));
        }
        case "link_initiative": {
          if (!(params as ConstitutionRoadmapParamsValue).initiativeId?.trim()) {
            throw new Error("initiativeId is required for link_initiative");
          }
          const constitution = await store.linkInitiative(
            requireItemId((params as ConstitutionRoadmapParamsValue).itemId),
            (params as ConstitutionRoadmapParamsValue).initiativeId as string,
          );
          return machineResult({ action: params.action, constitution }, renderConstitutionDetail(constitution));
        }
        case "unlink_initiative": {
          if (!(params as ConstitutionRoadmapParamsValue).initiativeId?.trim()) {
            throw new Error("initiativeId is required for unlink_initiative");
          }
          const constitution = await store.unlinkInitiative(
            requireItemId((params as ConstitutionRoadmapParamsValue).itemId),
            (params as ConstitutionRoadmapParamsValue).initiativeId as string,
          );
          return machineResult({ action: params.action, constitution }, renderConstitutionDetail(constitution));
        }
      }
    },
  });

  pi.registerTool({
    name: "constitution_dashboard",
    label: "constitution_dashboard",
    description: "Read a machine-usable constitutional dashboard summarizing completeness, roadmap, and linked work.",
    promptSnippet:
      "Use the constitutional dashboard to reason over governing completeness, roadmap load, and linked work before strategic changes.",
    promptGuidelines: [
      "Use this tool to decide whether constitutional grounding is complete enough before planning downstream work.",
    ],
    parameters: ConstitutionDashboardParams,
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const constitution = await getStore(ctx).readConstitution();
      return machineResult(
        { dashboard: constitution.dashboard, constitution },
        renderConstitutionDashboard(constitution.dashboard),
      );
    },
  });
}
