import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";
import type {
  CreateResearchInput,
  ResearchArtifactInput,
  ResearchHypothesisInput,
  UpdateResearchInput,
} from "../domain/models.js";
import {
  renderResearchDashboard,
  renderResearchDetail,
  renderResearchMap,
  renderResearchSummary,
} from "../domain/render.js";
import { createResearchStore } from "../domain/store.js";

const ResearchStatusEnum = StringEnum([
  "proposed",
  "active",
  "paused",
  "synthesized",
  "archived",
  "superseded",
] as const);
const HypothesisStatusEnum = StringEnum(["open", "supported", "rejected", "superseded"] as const);
const HypothesisConfidenceEnum = StringEnum(["low", "medium", "high"] as const);
const ResearchArtifactKindEnum = StringEnum(["note", "experiment", "source", "dataset", "log", "summary"] as const);
const ResearchWriteActionEnum = StringEnum([
  "init",
  "create",
  "update",
  "archive",
  "link_initiative",
  "unlink_initiative",
  "link_spec",
  "unlink_spec",
  "link_ticket",
  "unlink_ticket",
] as const);

const ResearchListParams = Type.Object({
  status: Type.Optional(ResearchStatusEnum),
  includeArchived: Type.Optional(Type.Boolean()),
  text: Type.Optional(Type.String()),
  tag: Type.Optional(Type.String()),
  keyword: Type.Optional(Type.String()),
});

const ResearchReadParams = Type.Object({
  ref: Type.String({ description: "Research id or research directory path." }),
});

const ResearchWriteParams = Type.Object({
  action: ResearchWriteActionEnum,
  ref: Type.Optional(Type.String()),
  title: Type.Optional(Type.String()),
  status: Type.Optional(ResearchStatusEnum),
  question: Type.Optional(Type.String()),
  objective: Type.Optional(Type.String()),
  scope: Type.Optional(Type.Array(Type.String())),
  nonGoals: Type.Optional(Type.Array(Type.String())),
  methodology: Type.Optional(Type.Array(Type.String())),
  keywords: Type.Optional(Type.Array(Type.String())),
  statusSummary: Type.Optional(Type.String()),
  conclusions: Type.Optional(Type.Array(Type.String())),
  recommendations: Type.Optional(Type.Array(Type.String())),
  openQuestions: Type.Optional(Type.Array(Type.String())),
  initiativeIds: Type.Optional(Type.Array(Type.String())),
  specChangeIds: Type.Optional(Type.Array(Type.String())),
  ticketIds: Type.Optional(Type.Array(Type.String())),
  capabilityIds: Type.Optional(Type.Array(Type.String())),
  sourceRefs: Type.Optional(Type.Array(Type.String())),
  supersedes: Type.Optional(Type.Array(Type.String())),
  tags: Type.Optional(Type.Array(Type.String())),
  initiativeId: Type.Optional(Type.String()),
  specChangeId: Type.Optional(Type.String()),
  ticketId: Type.Optional(Type.String()),
});

const ResearchHypothesisParams = Type.Object({
  ref: Type.String(),
  id: Type.Optional(Type.String()),
  statement: Type.String(),
  status: Type.Optional(HypothesisStatusEnum),
  confidence: Type.Optional(HypothesisConfidenceEnum),
  evidence: Type.Optional(Type.Array(Type.String())),
  results: Type.Optional(Type.Array(Type.String())),
});

const ResearchArtifactParams = Type.Object({
  ref: Type.String(),
  id: Type.Optional(Type.String()),
  kind: ResearchArtifactKindEnum,
  title: Type.String(),
  summary: Type.Optional(Type.String()),
  body: Type.Optional(Type.String()),
  sourceUri: Type.Optional(Type.String()),
  tags: Type.Optional(Type.Array(Type.String())),
  linkedHypothesisIds: Type.Optional(Type.Array(Type.String())),
});

const ResearchDashboardParams = Type.Object({
  ref: Type.String(),
});

const ResearchMapParams = Type.Object({
  ref: Type.String(),
});

type ResearchWriteParamsValue = Static<typeof ResearchWriteParams>;

function getStore(ctx: ExtensionContext) {
  return createResearchStore(ctx.cwd);
}

function machineResult(details: Record<string, unknown>, text: string) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

function requireRef(ref: string | undefined): string {
  if (!ref) {
    throw new Error("Research reference is required for this action");
  }
  return ref;
}

function toCreateInput(params: ResearchWriteParamsValue): CreateResearchInput {
  if (!params.title?.trim()) {
    throw new Error("title is required for create");
  }
  return {
    title: params.title,
    question: params.question,
    objective: params.objective,
    scope: params.scope,
    nonGoals: params.nonGoals,
    methodology: params.methodology,
    keywords: params.keywords,
    statusSummary: params.statusSummary,
    conclusions: params.conclusions,
    recommendations: params.recommendations,
    openQuestions: params.openQuestions,
    initiativeIds: params.initiativeIds,
    specChangeIds: params.specChangeIds,
    ticketIds: params.ticketIds,
    capabilityIds: params.capabilityIds,
    sourceRefs: params.sourceRefs,
    supersedes: params.supersedes,
    tags: params.tags,
  };
}

function toUpdateInput(params: ResearchWriteParamsValue): UpdateResearchInput {
  return {
    title: params.title,
    status: params.status,
    question: params.question,
    objective: params.objective,
    scope: params.scope,
    nonGoals: params.nonGoals,
    methodology: params.methodology,
    keywords: params.keywords,
    statusSummary: params.statusSummary,
    conclusions: params.conclusions,
    recommendations: params.recommendations,
    openQuestions: params.openQuestions,
    initiativeIds: params.initiativeIds,
    specChangeIds: params.specChangeIds,
    ticketIds: params.ticketIds,
    capabilityIds: params.capabilityIds,
    sourceRefs: params.sourceRefs,
    supersedes: params.supersedes,
    tags: params.tags,
  };
}

export function registerResearchTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "research_list",
    label: "research_list",
    description: "List research records from the durable local knowledge memory.",
    promptSnippet:
      "Inspect existing research before creating a new investigation so you can reuse prior evidence, methodology, rejected paths, and open questions instead of restarting discovery.",
    promptGuidelines: [
      "Use this tool before opening new exploratory work so you do not fork existing knowledge.",
      "Inspect archived and active research when evaluating whether uncertainty is already resolved or prior evidence materially narrows the search space.",
    ],
    parameters: ResearchListParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const research = await getStore(ctx).listResearch({
        status: params.status,
        includeArchived: params.includeArchived,
        text: params.text,
        tag: params.tag,
        keyword: params.keyword,
      });
      return machineResult(
        { research },
        research.length > 0 ? research.map(renderResearchSummary).join("\n") : "No research records.",
      );
    },
  });

  pi.registerTool({
    name: "research_read",
    label: "research_read",
    description: "Read a research record with durable synthesis, hypotheses, artifacts, and linked work.",
    promptSnippet:
      "Load the full research record before planning specs, initiatives, or execution so downstream work inherits the detailed evidence, rationale, assumptions, and unresolved questions already captured.",
    promptGuidelines: [
      "Read the research record before starting related implementation when durable findings, methodology, or rejected paths may already exist.",
    ],
    parameters: ResearchReadParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const research = await getStore(ctx).readResearch(params.ref);
      return machineResult({ research }, renderResearchDetail(research));
    },
  });

  pi.registerTool({
    name: "research_write",
    label: "research_write",
    description: "Create or update durable research state in the local research memory layer.",
    promptSnippet:
      "Persist a substantial, reusable research record with question, framing, methodology, evidence, rejected paths, conclusions, provenance, links, and current position instead of leaving discovery in chat.",
    promptGuidelines: [
      "Use this tool when exploratory work should remain reusable after the current turn.",
      "Keep research framing, methodology, evidence, conclusions, links, and open questions truthful so future turns and agents can rely on them.",
      "Favor detail-first updates at the research layer: capture why confidence changed, what was ruled out, and what still needs proof without duplicating downstream execution ledgers.",
    ],
    parameters: ResearchWriteParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const store = getStore(ctx);
      switch (params.action) {
        case "init": {
          const result = await store.initLedger();
          return machineResult(
            { action: params.action, initialized: result },
            `Initialized research memory at ${result.root}`,
          );
        }
        case "create": {
          const research = await store.createResearch(toCreateInput(params));
          return machineResult({ action: params.action, research }, renderResearchDetail(research));
        }
        case "update": {
          const research = await store.updateResearch(requireRef(params.ref), toUpdateInput(params));
          return machineResult({ action: params.action, research }, renderResearchDetail(research));
        }
        case "archive": {
          const research = await store.archiveResearch(requireRef(params.ref));
          return machineResult({ action: params.action, research }, renderResearchDetail(research));
        }
        case "link_initiative": {
          if (!params.initiativeId?.trim()) throw new Error("initiativeId is required for link_initiative");
          const research = await store.linkInitiative(requireRef(params.ref), params.initiativeId);
          return machineResult({ action: params.action, research }, renderResearchDetail(research));
        }
        case "unlink_initiative": {
          if (!params.initiativeId?.trim()) throw new Error("initiativeId is required for unlink_initiative");
          const research = await store.unlinkInitiative(requireRef(params.ref), params.initiativeId);
          return machineResult({ action: params.action, research }, renderResearchDetail(research));
        }
        case "link_spec": {
          if (!params.specChangeId?.trim()) throw new Error("specChangeId is required for link_spec");
          const research = await store.linkSpec(requireRef(params.ref), params.specChangeId);
          return machineResult({ action: params.action, research }, renderResearchDetail(research));
        }
        case "unlink_spec": {
          if (!params.specChangeId?.trim()) throw new Error("specChangeId is required for unlink_spec");
          const research = await store.unlinkSpec(requireRef(params.ref), params.specChangeId);
          return machineResult({ action: params.action, research }, renderResearchDetail(research));
        }
        case "link_ticket": {
          if (!params.ticketId?.trim()) throw new Error("ticketId is required for link_ticket");
          const research = await store.linkTicket(requireRef(params.ref), params.ticketId);
          return machineResult({ action: params.action, research }, renderResearchDetail(research));
        }
        case "unlink_ticket": {
          if (!params.ticketId?.trim()) throw new Error("ticketId is required for unlink_ticket");
          const research = await store.unlinkTicket(requireRef(params.ref), params.ticketId);
          return machineResult({ action: params.action, research }, renderResearchDetail(research));
        }
      }
    },
  });

  pi.registerTool({
    name: "research_hypothesis",
    label: "research_hypothesis",
    description: "Append or update explicit research hypotheses with evidence, results, and confidence.",
    promptSnippet:
      "Persist structured reasoning as explicit hypotheses with evidence, results, confidence, and rejected outcomes instead of losing the investigation trail in transient chat.",
    promptGuidelines: [
      "Preserve rejected hypotheses so failed exploration is not repeated later.",
      "Use evidence and results fields to capture why confidence changed, what was observed, and what remains uncertain.",
    ],
    parameters: ResearchHypothesisParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const research = await getStore(ctx).recordHypothesis(params.ref, params as ResearchHypothesisInput);
      return machineResult({ research }, renderResearchDetail(research));
    },
  });

  pi.registerTool({
    name: "research_artifact",
    label: "research_artifact",
    description: "Record canonical research notes, experiments, sources, and other artifacts with inventory metadata.",
    promptSnippet:
      "Persist authored research artifacts as canonical evidence packages with reusable context, observations, and provenance instead of burying them in chat.",
    promptGuidelines: [
      "Use canonical artifact records for notes, experiments, and sources that should remain reusable later.",
      "Capture enough artifact detail that another agent can understand what was examined, how it was examined, and why the result matters.",
      "Link artifacts to hypotheses when the artifact supports or rejects a claim.",
    ],
    parameters: ResearchArtifactParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const research = await getStore(ctx).recordArtifact(params.ref, params as ResearchArtifactInput);
      return machineResult({ research }, renderResearchDetail(research));
    },
  });

  pi.registerTool({
    name: "research_dashboard",
    label: "research_dashboard",
    description: "Read the machine-usable dashboard for a durable research record.",
    promptSnippet:
      "Use the dashboard to reason over current findings, evidence coverage, linked work, and open questions before deciding whether research is mature enough for downstream layers.",
    promptGuidelines: [
      "Use this tool when you need machine-usable research status across hypotheses, artifacts, and downstream work.",
    ],
    parameters: ResearchDashboardParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const research = await getStore(ctx).readResearch(params.ref);
      return machineResult({ dashboard: research.dashboard, research }, renderResearchDashboard(research.dashboard));
    },
  });

  pi.registerTool({
    name: "research_map",
    label: "research_map",
    description: "Read the graph summary linking a research record to hypotheses, artifacts, and downstream work.",
    promptSnippet:
      "Use the research map to understand how detailed evidence, hypotheses, artifacts, and downstream work connect before planning the next layer of work.",
    promptGuidelines: [
      "Use this tool when linking research to initiatives, specs, tickets, or supporting artifacts so the evidence graph stays reusable and legible.",
    ],
    parameters: ResearchMapParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const research = await getStore(ctx).readResearch(params.ref);
      return machineResult({ map: research.map, research }, renderResearchMap(research.map));
    },
  });
}
