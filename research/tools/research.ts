import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";
import { analyzeListQuery, renderAnalyzedListQuery } from "#storage/list-query.js";
import { LOOM_LIST_SORTS } from "#storage/list-search.js";
import { hasExportedProjectionFamily, runProjectionAwareOperation } from "#storage/projection-lifecycle.js";
import type {
  CreateResearchInput,
  ResearchArtifactInput,
  ResearchHypothesisInput,
  UpdateResearchInput,
} from "../domain/models.js";
import { exportResearchProjections } from "../domain/projection.js";
import {
  renderResearchDetail,
  renderResearchMap,
  renderResearchOverview,
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
const LoomListSortEnum = StringEnum(LOOM_LIST_SORTS);

function withDescription<T extends Record<string, unknown>>(schema: T, description: string): T {
  return { ...schema, description } as T;
}

const ResearchListParams = Type.Object({
  exactStatus: Type.Optional(
    withDescription(
      ResearchStatusEnum,
      "Optional exact status filter. Leave it unset on the first pass unless you intentionally want one research-state slice.",
    ),
  ),
  includeArchived: Type.Optional(
    Type.Boolean({ description: "Include archived research. Archived records are hidden unless this is true." }),
  ),
  exactRepositoryId: Type.Optional(
    Type.String({
      description:
        "Optional exact repository id filter. Use a repository id from `scope_read` or prior machine-readable research results when you intentionally want one repository slice.",
    }),
  ),
  text: Type.Optional(
    Type.String({
      description:
        "Broad text search across research records. Leave `sort` unset to rank by relevance when text is present; start here before adding narrower exact filters.",
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
  exactKeyword: Type.Optional(
    Type.String({
      description:
        "Exact keyword filter against the research record's stored `keywords` list. Use after a broad text search when you know the keyword already recorded on the target research.",
    }),
  ),
});

const ResearchReadParams = Type.Object({
  ref: Type.String({
    description: "Existing research id or `research:<id>` ref. Reads fail when the research record does not exist.",
  }),
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
});

const ResearchWriteParams = Type.Object({
  action: ResearchWriteActionEnum,
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
  repositoryId: Type.Optional(
    Type.String({
      description:
        "Optional repository id for repository-targeted hypothesis updates when the active scope is ambiguous.",
    }),
  ),
  worktreeId: Type.Optional(
    Type.String({
      description:
        "Optional worktree id for repository-targeted hypothesis updates when a specific clone/worktree matters.",
    }),
  ),
  id: Type.Optional(Type.String()),
  statement: Type.String(),
  status: Type.Optional(HypothesisStatusEnum),
  confidence: Type.Optional(HypothesisConfidenceEnum),
  evidence: Type.Optional(Type.Array(Type.String())),
  results: Type.Optional(Type.Array(Type.String())),
});

const ResearchArtifactParams = Type.Object({
  ref: Type.String(),
  repositoryId: Type.Optional(
    Type.String({
      description:
        "Optional repository id for repository-targeted artifact updates when the active scope is ambiguous.",
    }),
  ),
  worktreeId: Type.Optional(
    Type.String({
      description:
        "Optional worktree id for repository-targeted artifact updates when a specific clone/worktree matters.",
    }),
  ),
  id: Type.Optional(Type.String()),
  kind: ResearchArtifactKindEnum,
  title: Type.String(),
  summary: Type.Optional(Type.String()),
  body: Type.Optional(Type.String()),
  sourceUri: Type.Optional(Type.String()),
  tags: Type.Optional(Type.Array(Type.String())),
  linkedHypothesisIds: Type.Optional(Type.Array(Type.String())),
});

const ResearchScopedRefParams = Type.Object({
  ref: Type.String(),
  repositoryId: Type.Optional(
    Type.String({
      description: "Optional repository id for repository-targeted map reads when the active scope is ambiguous.",
    }),
  ),
  worktreeId: Type.Optional(
    Type.String({
      description: "Optional worktree id for repository-targeted map reads when a specific clone/worktree matters.",
    }),
  ),
});

const ResearchOverviewParams = ResearchScopedRefParams;
const ResearchMapParams = ResearchScopedRefParams;

type ResearchWriteParamsValue = Static<typeof ResearchWriteParams>;

function getStore(ctx: ExtensionContext) {
  return createResearchStore(ctx.cwd);
}

function getScopedStore(ctx: ExtensionContext, scope?: { repositoryId?: string; worktreeId?: string }) {
  return createResearchStore(ctx.cwd, {
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

async function refreshResearchProjectionsIfExported(cwd: string): Promise<void> {
  if (hasExportedProjectionFamily(cwd, "research")) {
    await exportResearchProjections(cwd);
  }
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
    description:
      "List research records from the durable local knowledge memory. Leave `sort` unset for the default ordering: `updated_desc` without `text`, `relevance` with `text`. Start broad with `text`, then add exact filters like `exactStatus`, `exactTag`, or `exactKeyword` only when you intentionally want a narrower slice.",
    promptSnippet:
      "Inspect existing research before creating a new investigation so you can reuse prior evidence, methodology, rejected paths, and open questions instead of restarting discovery; broad text search with the default relevance ranking is the safest first pass when the exact record shape is unknown.",
    promptGuidelines: [
      "Use this tool before opening new exploratory work so you do not fork existing knowledge.",
      "Start with `text` and no exact filters when rediscovering prior work by topic, question, or phrase; the default sort becomes `relevance` for text search, so leave `sort` unset unless you intentionally want a different ordering.",
      "Without `text`, the default sort is `updated_desc`; set `sort` only when you explicitly want created-time or id ordering instead of the normal recency view.",
      "`exactStatus`, `exactTag`, and `exactKeyword` are exact filters over stored metadata and can hide valid matches if you guess the recorded value wrong.",
      "Archived research is hidden by default; set `includeArchived` when checking whether older investigations already resolved the uncertainty or should still inform the current search.",
      "If a zero-result query used exact filters, inspect the returned query diagnostics and broader suggestions before assuming no research record exists.",
    ],
    parameters: ResearchListParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await analyzeListQuery(
        params,
        (next) =>
          getStore(ctx).listResearch({
            status: next.exactStatus,
            repositoryId: next.exactRepositoryId,
            includeArchived: next.includeArchived,
            text: next.text,
            sort: next.sort,
            tag: next.exactTag,
            keyword: next.exactKeyword,
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
            {
              key: "exactRepositoryId",
              value: params.exactRepositoryId,
              clear: (current) => ({ ...current, exactRepositoryId: undefined }),
            },
            {
              key: "exactKeyword",
              value: params.exactKeyword,
              clear: (current) => ({ ...current, exactKeyword: undefined }),
            },
          ],
        },
      );

      return machineResult(
        { research: result.items, queryDiagnostics: result.diagnostics, broaderMatches: result.broaderMatches },
        renderAnalyzedListQuery(result, {
          emptyText: "No research records.",
          renderItem: renderResearchSummary,
        }),
      );
    },
  });

  pi.registerTool({
    name: "research_read",
    label: "research_read",
    description: "Read a research record with durable synthesis, hypotheses, artifacts, and linked work.",
    promptSnippet:
      "Load the full research record before drafting specs, initiatives, or execution artifacts so downstream work inherits the detailed evidence, rationale, assumptions, and unresolved questions already captured.",
    promptGuidelines: [
      "Read the research record before drafting related specs or starting implementation when durable findings, methodology, or rejected paths may already exist.",
      'Use `research_write` with `action: "create"` to start new research; `research_read` only loads existing records and will fail for unknown refs.',
    ],
    parameters: ResearchReadParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const research = await getScopedStore(ctx, params).readResearch(params.ref);
      return machineResult({ research }, renderResearchDetail(research));
    },
  });

  pi.registerTool({
    name: "research_write",
    label: "research_write",
    description:
      "Create or update durable research state in the local research memory layer. Create explicitly before recording child state on a new investigation.",
    promptSnippet:
      "Persist a substantial, reusable research record with question, framing, methodology, evidence, rejected paths, conclusions, provenance, links, and current position instead of leaving discovery in chat.",
    promptGuidelines: [
      "Use this tool when exploratory work should remain reusable after the current turn.",
      'Use `action: "create"` before `research_read`, `research_hypothesis`, `research_artifact`, or link actions on a new investigation; those flows do not create missing research records.',
      "Keep research framing, methodology, evidence, conclusions, links, and open questions truthful so future turns and agents can rely on them.",
      "Favor detail-first updates at the research layer: capture why confidence changed, what was ruled out, and what still needs proof without duplicating downstream execution ledgers.",
    ],
    parameters: ResearchWriteParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const store = getScopedStore(ctx, params);
      switch (params.action) {
        case "init": {
          const result = await store.initLedger();
          return machineResult(
            { action: params.action, initialized: result },
            `Initialized research memory at ${result.root}`,
          );
        }
        case "create": {
          const research = await runProjectionAwareOperation({
            repositoryRoot: ctx.cwd,
            operation: "research_write create",
            families: ["research"],
            action: () => store.createResearch(toCreateInput(params)),
            refresh: () => refreshResearchProjectionsIfExported(ctx.cwd),
          });
          return machineResult({ action: params.action, research }, renderResearchDetail(research));
        }
        case "update": {
          const research = await runProjectionAwareOperation({
            repositoryRoot: ctx.cwd,
            operation: "research_write update",
            families: ["research"],
            action: () => store.updateResearch(requireRef(params.ref), toUpdateInput(params)),
            refresh: () => refreshResearchProjectionsIfExported(ctx.cwd),
          });
          return machineResult({ action: params.action, research }, renderResearchDetail(research));
        }
        case "archive": {
          const research = await runProjectionAwareOperation({
            repositoryRoot: ctx.cwd,
            operation: "research_write archive",
            families: ["research"],
            action: () => store.archiveResearch(requireRef(params.ref)),
            refresh: () => refreshResearchProjectionsIfExported(ctx.cwd),
          });
          return machineResult({ action: params.action, research }, renderResearchDetail(research));
        }
        case "link_initiative": {
          if (!params.initiativeId?.trim()) throw new Error("initiativeId is required for link_initiative");
          const initiativeId = params.initiativeId;
          const research = await runProjectionAwareOperation({
            repositoryRoot: ctx.cwd,
            operation: "research_write link_initiative",
            families: ["research"],
            action: () => store.linkInitiative(requireRef(params.ref), initiativeId),
            refresh: () => refreshResearchProjectionsIfExported(ctx.cwd),
          });
          return machineResult({ action: params.action, research }, renderResearchDetail(research));
        }
        case "unlink_initiative": {
          if (!params.initiativeId?.trim()) throw new Error("initiativeId is required for unlink_initiative");
          const initiativeId = params.initiativeId;
          const research = await runProjectionAwareOperation({
            repositoryRoot: ctx.cwd,
            operation: "research_write unlink_initiative",
            families: ["research"],
            action: () => store.unlinkInitiative(requireRef(params.ref), initiativeId),
            refresh: () => refreshResearchProjectionsIfExported(ctx.cwd),
          });
          return machineResult({ action: params.action, research }, renderResearchDetail(research));
        }
        case "link_spec": {
          if (!params.specChangeId?.trim()) throw new Error("specChangeId is required for link_spec");
          const specChangeId = params.specChangeId;
          const research = await runProjectionAwareOperation({
            repositoryRoot: ctx.cwd,
            operation: "research_write link_spec",
            families: ["research"],
            action: () => store.linkSpec(requireRef(params.ref), specChangeId),
            refresh: () => refreshResearchProjectionsIfExported(ctx.cwd),
          });
          return machineResult({ action: params.action, research }, renderResearchDetail(research));
        }
        case "unlink_spec": {
          if (!params.specChangeId?.trim()) throw new Error("specChangeId is required for unlink_spec");
          const specChangeId = params.specChangeId;
          const research = await runProjectionAwareOperation({
            repositoryRoot: ctx.cwd,
            operation: "research_write unlink_spec",
            families: ["research"],
            action: () => store.unlinkSpec(requireRef(params.ref), specChangeId),
            refresh: () => refreshResearchProjectionsIfExported(ctx.cwd),
          });
          return machineResult({ action: params.action, research }, renderResearchDetail(research));
        }
        case "link_ticket": {
          if (!params.ticketId?.trim()) throw new Error("ticketId is required for link_ticket");
          const ticketId = params.ticketId;
          const research = await runProjectionAwareOperation({
            repositoryRoot: ctx.cwd,
            operation: "research_write link_ticket",
            families: ["research"],
            action: () => store.linkTicket(requireRef(params.ref), ticketId),
            refresh: () => refreshResearchProjectionsIfExported(ctx.cwd),
          });
          return machineResult({ action: params.action, research }, renderResearchDetail(research));
        }
        case "unlink_ticket": {
          if (!params.ticketId?.trim()) throw new Error("ticketId is required for unlink_ticket");
          const ticketId = params.ticketId;
          const research = await runProjectionAwareOperation({
            repositoryRoot: ctx.cwd,
            operation: "research_write unlink_ticket",
            families: ["research"],
            action: () => store.unlinkTicket(requireRef(params.ref), ticketId),
            refresh: () => refreshResearchProjectionsIfExported(ctx.cwd),
          });
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
      const research = await runProjectionAwareOperation({
        repositoryRoot: ctx.cwd,
        operation: "research_hypothesis",
        families: ["research"],
        action: () => getScopedStore(ctx, params).recordHypothesis(params.ref, params as ResearchHypothesisInput),
        refresh: () => refreshResearchProjectionsIfExported(ctx.cwd),
      });
      return machineResult({ research }, renderResearchDetail(research));
    },
  });

  pi.registerTool({
    name: "research_artifact",
    label: "research_artifact",
    description:
      "Record current-state research notes, experiments, sources, and other artifacts with inventory metadata.",
    promptSnippet:
      "Persist authored research artifacts as current-state records with reusable context, observations, and provenance instead of burying them in chat.",
    promptGuidelines: [
      "Use artifact records for notes, experiments, and sources that should remain reusable later.",
      "Artifacts describe the current stored state for that artifact id; update the record in place when the summary, tags, or body changes.",
      "Capture enough artifact detail that another agent can understand what was examined, how it was examined, and why the result matters.",
      "Link artifacts to hypotheses when the artifact supports or rejects a claim.",
    ],
    parameters: ResearchArtifactParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const research = await runProjectionAwareOperation({
        repositoryRoot: ctx.cwd,
        operation: "research_artifact",
        families: ["research"],
        action: () => getScopedStore(ctx, params).recordArtifact(params.ref, params as ResearchArtifactInput),
        refresh: () => refreshResearchProjectionsIfExported(ctx.cwd),
      });
      return machineResult({ research }, renderResearchDetail(research));
    },
  });

  pi.registerTool({
    name: "research_overview",
    label: "research_overview",
    description: "Read the machine-usable overview for a durable research record.",
    promptSnippet:
      "Use the overview to reason over current findings, evidence coverage, linked work, and open questions before deciding whether research is mature enough for downstream layers.",
    promptGuidelines: [
      "Use this tool when you need machine-usable research status across hypotheses, artifacts, and downstream work.",
    ],
    parameters: ResearchOverviewParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const research = await getScopedStore(ctx, params).readResearch(params.ref);
      return machineResult({ overview: research.overview, research }, renderResearchOverview(research.overview));
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
      const research = await getScopedStore(ctx, params).readResearch(params.ref);
      return machineResult({ map: research.map, research }, renderResearchMap(research.map));
    },
  });
}
