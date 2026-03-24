import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";
import { analyzeListQuery, renderAnalyzedListQuery } from "#storage/list-query.js";
import { LOOM_LIST_SORTS, type LoomListSort } from "#storage/list-search.js";
import { readRuntimeScopeFromEnv, resolveEntityRuntimeScope } from "#storage/runtime-scope.js";
import { renderCritiqueDetail, renderDashboard } from "../domain/render.js";
import { runCritiqueLaunch } from "../domain/runtime.js";
import { createCritiqueStore } from "../domain/store.js";

const CritiqueStatusEnum = StringEnum(["proposed", "active", "resolved", "superseded", "archived"] as const);
const CritiqueTargetKindEnum = StringEnum([
  "ticket",
  "spec",
  "initiative",
  "research",
  "constitution",
  "artifact",
  "workspace",
] as const);
const CritiqueFocusAreaEnum = StringEnum([
  "correctness",
  "edge_cases",
  "tests",
  "architecture",
  "roadmap_alignment",
  "constitutional_alignment",
  "security",
  "performance",
  "docs",
  "maintainability",
  "process",
] as const);
const CritiqueVerdictEnum = StringEnum(["pass", "concerns", "blocked", "needs_revision"] as const);
const CritiqueRunKindEnum = StringEnum([
  "adversarial",
  "verification",
  "roadmap_alignment",
  "architecture",
  "security",
  "performance",
  "docs",
  "process",
] as const);
const CritiqueFindingKindEnum = StringEnum([
  "bug",
  "unsafe_assumption",
  "missing_test",
  "edge_case",
  "architecture",
  "roadmap_misalignment",
  "constitutional_violation",
  "security",
  "performance",
  "docs_gap",
  "process_issue",
] as const);
const CritiqueFindingSeverityEnum = StringEnum(["low", "medium", "high", "critical"] as const);
const CritiqueFindingConfidenceEnum = StringEnum(["low", "medium", "high"] as const);
const CritiqueFindingStatusEnum = StringEnum(["open", "accepted", "rejected", "fixed", "superseded"] as const);
const CritiqueWriteActionEnum = StringEnum(["init", "create", "update", "resolve"] as const);
const CritiqueReadModeEnum = StringEnum(["full", "state", "packet", "critique"] as const);
const CritiqueFindingActionEnum = StringEnum(["create", "update", "ticketify"] as const);
const LoomListSortEnum = StringEnum(LOOM_LIST_SORTS);

function withDescription<T extends Record<string, unknown>>(schema: T, description: string): T {
  return { ...schema, description } as T;
}

const ContextRefsSchema = Type.Object({
  roadmapItemIds: Type.Optional(Type.Array(Type.String())),
  initiativeIds: Type.Optional(Type.Array(Type.String())),
  researchIds: Type.Optional(Type.Array(Type.String())),
  specChangeIds: Type.Optional(Type.Array(Type.String())),
  ticketIds: Type.Optional(Type.Array(Type.String())),
});

const CritiqueTargetSchema = Type.Object({
  kind: CritiqueTargetKindEnum,
  ref: Type.String(),
  path: Type.Optional(Type.String()),
});

const CritiqueListParams = Type.Object({
  exactStatus: Type.Optional(
    withDescription(
      CritiqueStatusEnum,
      "Exact critique status filter. Start with text first unless you intentionally want one status bucket.",
    ),
  ),
  exactVerdict: Type.Optional(
    withDescription(CritiqueVerdictEnum, "Exact verdict filter. Useful for targeted triage after broad discovery."),
  ),
  exactTargetKind: Type.Optional(
    withDescription(
      CritiqueTargetKindEnum,
      "Exact target kind filter. Leave unset unless you already know the critique target type.",
    ),
  ),
  exactFocusArea: Type.Optional(
    withDescription(
      CritiqueFocusAreaEnum,
      "Exact focus-area filter. This narrows to critiques whose recorded focus areas include the chosen value.",
    ),
  ),
  text: Type.Optional(
    Type.String({
      description:
        "Free-text search over critique id, title, review question, target ref, target kind, focus areas, and recorded context refs. Prefer this first when uncertain.",
    }),
  ),
  sort: Type.Optional(
    withDescription(
      LoomListSortEnum,
      "Optional result ordering. Defaults to `relevance` when `text` is present, otherwise `updated_desc`. Override this only when you intentionally need chronological or id-based ordering after filtering.",
    ),
  ),
});

const CritiqueReadParams = Type.Object({
  ref: Type.String({ description: "Critique id, critique path, or critique artifact path." }),
  mode: Type.Optional(CritiqueReadModeEnum),
});

const CritiqueWriteParams = Type.Object({
  action: CritiqueWriteActionEnum,
  ref: Type.Optional(Type.String()),
  title: Type.Optional(Type.String()),
  target: Type.Optional(CritiqueTargetSchema),
  focusAreas: Type.Optional(Type.Array(CritiqueFocusAreaEnum)),
  reviewQuestion: Type.Optional(Type.String()),
  scopePaths: Type.Optional(Type.Array(Type.String())),
  nonGoals: Type.Optional(Type.Array(Type.String())),
  contextRefs: Type.Optional(ContextRefsSchema),
  freshContextRequired: Type.Optional(Type.Boolean()),
  status: Type.Optional(CritiqueStatusEnum),
  verdict: Type.Optional(CritiqueVerdictEnum),
});

const CritiqueLaunchParams = Type.Object({
  ref: Type.String(),
  worktreeTicketRef: Type.Optional(
    Type.String({
      description: "Optional ticket ref to execute this launch in an isolated worktree bound to that ticket.",
    }),
  ),
  preferExternalRefNaming: Type.Optional(
    Type.Boolean({
      description:
        "When using a worktree, prefer the external ticket ref (e.g. linear-123) for the branch name if available.",
    }),
  ),
});

const CritiqueRunParams = Type.Object({
  ref: Type.String(),
  kind: CritiqueRunKindEnum,
  summary: Type.String(),
  verdict: CritiqueVerdictEnum,
  freshContext: Type.Optional(Type.Boolean()),
  focusAreas: Type.Optional(Type.Array(CritiqueFocusAreaEnum)),
  findingIds: Type.Optional(Type.Array(Type.String())),
  followupTicketIds: Type.Optional(Type.Array(Type.String())),
});

const CritiqueFindingParams = Type.Object({
  action: CritiqueFindingActionEnum,
  ref: Type.String(),
  id: Type.Optional(Type.String()),
  runId: Type.Optional(Type.String()),
  kind: Type.Optional(CritiqueFindingKindEnum),
  severity: Type.Optional(CritiqueFindingSeverityEnum),
  confidence: Type.Optional(CritiqueFindingConfidenceEnum),
  title: Type.Optional(Type.String()),
  summary: Type.Optional(Type.String()),
  evidence: Type.Optional(Type.Array(Type.String())),
  scopePaths: Type.Optional(Type.Array(Type.String())),
  recommendedAction: Type.Optional(Type.String()),
  status: Type.Optional(CritiqueFindingStatusEnum),
  linkedTicketId: Type.Optional(Type.String()),
  resolutionNotes: Type.Optional(Type.String()),
  ticketTitle: Type.Optional(Type.String()),
});

const CritiqueDashboardParams = Type.Object({
  ref: Type.String(),
});

type CritiqueWriteParamsValue = Static<typeof CritiqueWriteParams>;

type CritiqueFindingParamsValue = Static<typeof CritiqueFindingParams>;

function getStore(ctx: ExtensionContext) {
  return createCritiqueStore(ctx.cwd, readRuntimeScopeFromEnv());
}

function machineResult(details: Record<string, unknown>, text: string) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

function requireRef(ref: string | undefined): string {
  if (!ref) {
    throw new Error("Critique reference is required for this action");
  }
  return ref;
}

function toCreateInput(params: CritiqueWriteParamsValue) {
  if (!params.title?.trim()) {
    throw new Error("title is required for create");
  }
  if (!params.target) {
    throw new Error("target is required for create");
  }
  return {
    title: params.title,
    target: {
      kind: params.target.kind,
      ref: params.target.ref,
      locator: params.target.path ?? null,
    },
    focusAreas: params.focusAreas,
    reviewQuestion: params.reviewQuestion,
    scopeRefs: params.scopePaths,
    nonGoals: params.nonGoals,
    contextRefs: params.contextRefs,
    freshContextRequired: params.freshContextRequired,
  };
}

function toUpdateInput(params: CritiqueWriteParamsValue) {
  return {
    title: params.title,
    target: params.target
      ? {
          kind: params.target.kind,
          ref: params.target.ref,
          locator: params.target.path ?? null,
        }
      : undefined,
    focusAreas: params.focusAreas,
    reviewQuestion: params.reviewQuestion,
    scopeRefs: params.scopePaths,
    nonGoals: params.nonGoals,
    contextRefs: params.contextRefs,
    freshContextRequired: params.freshContextRequired,
    status: params.status,
    verdict: params.verdict,
  };
}

function toCreateFindingInput(params: CritiqueFindingParamsValue) {
  if (!params.runId?.trim()) throw new Error("runId is required for finding creation");
  if (!params.kind) throw new Error("kind is required for finding creation");
  if (!params.severity) throw new Error("severity is required for finding creation");
  if (!params.title?.trim()) throw new Error("title is required for finding creation");
  if (!params.summary?.trim()) throw new Error("summary is required for finding creation");
  if (!params.recommendedAction?.trim()) throw new Error("recommendedAction is required for finding creation");
  return {
    runId: params.runId,
    kind: params.kind,
    severity: params.severity,
    confidence: params.confidence,
    title: params.title,
    summary: params.summary,
    evidence: params.evidence,
    scopePaths: params.scopePaths,
    recommendedAction: params.recommendedAction,
    status: params.status,
  };
}

function toUpdateFindingInput(params: CritiqueFindingParamsValue) {
  if (!params.id?.trim()) {
    throw new Error("id is required for finding update");
  }
  return {
    id: params.id,
    status: params.status,
    linkedTicketId: params.linkedTicketId,
    resolutionNotes: params.resolutionNotes,
  };
}

export function registerCritiqueTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "critique_list",
    label: "critique_list",
    description:
      "List durable critique records. Prefer broad discovery with text first, then add exact filters such as `exactStatus`, `exactVerdict`, `exactTargetKind`, or `exactFocusArea` only when you intentionally want a narrower slice; results default to `relevance` with `text`, otherwise `updated_desc`.",
    promptSnippet:
      "Inspect existing critiques before starting a new review so prior evidence, verdict reasoning, and follow-up findings are not duplicated or contradicted. Start broad with text when uncertain, then narrow deliberately; keep the default relevance ordering unless you intentionally need another sort.",
    promptGuidelines: [
      "Use this tool to discover whether the target already has a durable critique record.",
      "Prefer text first for broad discovery by critique id, title, target ref, or focus area; exact filters can hide valid matches if you guess the stored status, verdict, target kind, or focus area wrong.",
      "The default ordering is `relevance` when `text` is present and `updated_desc` otherwise; set `sort` only when you intentionally need chronology or id order after filtering.",
      "Filter by focus area or verdict when triaging follow-up review work and when you need the strongest existing evidence trail first.",
      "If a zero-result query used exact filters, inspect the returned query diagnostics and broader suggestions before assuming no critique exists.",
    ],
    parameters: CritiqueListParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await analyzeListQuery(
        params,
        (next) =>
          getStore(ctx).listCritiquesAsync({
            status: next.exactStatus,
            verdict: next.exactVerdict,
            targetKind: next.exactTargetKind,
            focusArea: next.exactFocusArea,
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
              key: "exactVerdict",
              value: params.exactVerdict,
              clear: (current) => ({ ...current, exactVerdict: undefined }),
            },
            {
              key: "exactTargetKind",
              value: params.exactTargetKind,
              clear: (current) => ({ ...current, exactTargetKind: undefined }),
            },
            {
              key: "exactFocusArea",
              value: params.exactFocusArea,
              clear: (current) => ({ ...current, exactFocusArea: undefined }),
            },
          ],
        },
      );

      return machineResult(
        { critiques: result.items, queryDiagnostics: result.diagnostics, broaderMatches: result.broaderMatches },
        renderAnalyzedListQuery(result, {
          emptyText: "No critiques.",
          renderItem: (critique) => `${critique.id} [${critique.status}/${critique.verdict}] ${critique.title}`,
        }),
      );
    },
  });

  pi.registerTool({
    name: "critique_read",
    label: "critique_read",
    description: "Read critique state, packet, or summary artifacts from the durable critique layer.",
    promptSnippet:
      "Load the critique packet or durable findings before claiming work has been adequately reviewed; durable critique should expose evidence, reasoning, and unresolved risk, not a thin verdict.",
    promptGuidelines: [
      "Read the packet when you need the full fresh-context handoff, including scope, evidence, assumptions, risks, and prior follow-up context.",
      "Read the full critique before resolving findings or creating follow-up tickets so your action reflects the recorded reasoning and evidence trail.",
    ],
    parameters: CritiqueReadParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await getStore(ctx).readCritiqueAsync(params.ref);
      if (params.mode === "packet") {
        return machineResult({ critique: result.summary, packet: result.packet }, result.packet);
      }
      if (params.mode === "critique") {
        return machineResult({ critique: result.summary, critiqueMarkdown: result.critique }, result.critique);
      }
      if (params.mode === "state") {
        return machineResult({ state: result.state, summary: result.summary }, JSON.stringify(result.state, null, 2));
      }
      return machineResult({ critique: result }, renderCritiqueDetail(result));
    },
  });

  pi.registerTool({
    name: "critique_write",
    label: "critique_write",
    description:
      "Create, update, or resolve durable critique records in local Loom memory once no active findings remain.",
    promptSnippet:
      "Persist review targets, scope, review questions, and enough contextual detail for a later critic to evaluate the work without relying on chat reconstruction.",
    promptGuidelines: [
      "Create the critique before review begins so fresh-context launch and findings have a stable target with explicit scope, non-goals, dependencies, and review intent.",
      "Resolve the critique only after no active findings remain; linked follow-up tickets and accepted findings still count as active until they are fixed, rejected, or superseded.",
    ],
    parameters: CritiqueWriteParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const store = getStore(ctx);
      switch (params.action) {
        case "init": {
          const result = await store.initLedgerAsync();
          return machineResult(
            { action: params.action, initialized: result },
            `Initialized critique memory at ${result.root}`,
          );
        }
        case "create": {
          const critique = await store.createCritiqueAsync(toCreateInput(params));
          return machineResult({ action: params.action, critique }, renderCritiqueDetail(critique));
        }
        case "update": {
          const critique = await store.updateCritiqueAsync(requireRef(params.ref), toUpdateInput(params));
          return machineResult({ action: params.action, critique }, renderCritiqueDetail(critique));
        }
        case "resolve": {
          const critique = await store.resolveCritiqueAsync(requireRef(params.ref), params.verdict);
          return machineResult({ action: params.action, critique }, renderCritiqueDetail(critique));
        }
      }
    },
  });

  pi.registerTool({
    name: "critique_launch",
    label: "critique_launch",
    description: "Launch a fresh critic process for a critique packet and return its result.",
    promptSnippet:
      "Use this tool to execute a fresh-context critique in a separate process rather than grading the work inside the same saturated session; allow a long timeout because the call blocks until the critic exits after producing a thoroughly substantiated durable run.",
    promptGuidelines: [
      "This tool must run the critique in a separate fresh process and return the result synchronously.",
      "Call this tool with a long timeout for non-trivial reviews because the fresh critic process blocks until completion.",
      "The critique record and launch descriptor remain durable even though the review executes immediately.",
      "The fresh critic must append a durable critique_run before exit; successful process completion without a landed run is a failure.",
      "The landed run should explain the verdict with evidence, reasoning, verification status, and residual risk rather than a bare pass/fail statement.",
    ],
    parameters: CritiqueLaunchParams,
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const ambientStore = getStore(ctx);
      const existing = await ambientStore.readCritiqueAsync(params.ref);
      const runtimeScope = await resolveEntityRuntimeScope(ctx.cwd, "critique", existing.state.critiqueId);
      const store = createCritiqueStore(ctx.cwd, {
        repositoryId: runtimeScope.repositoryId,
        worktreeId: runtimeScope.worktreeId,
      });
      const launched = await store.launchCritiqueAsync(existing.state.critiqueId);
      const previousLastRunId = launched.critique.state.lastRunId;
      const execution = await runCritiqueLaunch(
        ctx.cwd,
        launched.launch,
        signal,
        (text) => {
          onUpdate?.({
            content: [{ type: "text", text }],
            details: {
              launch: launched.launch,
              execution: {
                status: "running",
              },
            },
          });
        },
        runtimeScope,
        params.worktreeTicketRef,
        params.preferExternalRefNaming,
      );
      const critique = await store.readCritiqueAsync(existing.state.critiqueId);
      if (execution.exitCode !== 0) {
        throw new Error(
          [
            `Critique process failed with exit code ${execution.exitCode}.`,
            execution.stderr.trim() || execution.output.trim() || launched.text,
          ]
            .filter(Boolean)
            .join("\n\n"),
        );
      }
      if (critique.state.lastRunId === previousLastRunId) {
        throw new Error(
          [
            "Fresh critique process completed without appending a durable critique run through critique_run.",
            execution.output.trim(),
          ]
            .filter(Boolean)
            .join("\n\n"),
        );
      }
      return machineResult(
        {
          critique,
          launch: launched.launch,
          execution,
        },
        execution.output || renderCritiqueDetail(critique),
      );
    },
  });

  pi.registerTool({
    name: "critique_run",
    label: "critique_run",
    description: "Append a durable critique run verdict to an existing critique record.",
    promptSnippet:
      "Record the critique session durably with the verdict, supporting evidence, reasoning, verification status, and remaining concerns once review completes.",
    promptGuidelines: [
      "Each meaningful review pass should append a run rather than overwriting previous verdict history.",
      "Summaries should stand on their own for later readers by naming what was reviewed, what evidence was checked, what failed or still worries you, and why the verdict follows.",
      "Mark whether the pass used a fresh context window so later readers know how independent the review was.",
    ],
    parameters: CritiqueRunParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const critique = await getStore(ctx).recordRunAsync(params.ref, params);
      return machineResult({ critique }, renderCritiqueDetail(critique));
    },
  });

  pi.registerTool({
    name: "critique_finding",
    label: "critique_finding",
    description:
      "Append findings, update finding lifecycle state, or convert findings into follow-up tickets while marking them accepted.",
    promptSnippet:
      "Persist concrete findings with severity, confidence, evidence, failure mode, and recommended action instead of vague review prose.",
    promptGuidelines: [
      "Every finding should point at concrete evidence, explain the failure mode or risk, and state a recommended action that a maintainer can execute.",
      "Capture affected scope, assumptions, and verification gaps when they matter so the finding stays durable outside the current session.",
      "Finding updates are lifecycle-only: status, linked ticket, and resolution notes may change, but the original finding body and evidence stay as-created.",
      "Creating a follow-up ticket marks the finding accepted, but accepted findings remain active until they are fixed, rejected, or superseded.",
    ],
    parameters: CritiqueFindingParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const store = getStore(ctx);
      switch (params.action) {
        case "create": {
          const critique = await store.addFindingAsync(params.ref, toCreateFindingInput(params));
          return machineResult({ critique }, renderCritiqueDetail(critique));
        }
        case "update": {
          const critique = await store.updateFindingAsync(params.ref, toUpdateFindingInput(params));
          return machineResult({ critique }, renderCritiqueDetail(critique));
        }
        case "ticketify": {
          const critique = await store.ticketifyFindingAsync(params.ref, {
            findingId: requireRef(params.id),
            title: params.ticketTitle,
          });
          return machineResult({ critique }, renderCritiqueDetail(critique));
        }
      }
    },
  });

  pi.registerTool({
    name: "critique_dashboard",
    label: "critique_dashboard",
    description: "Read the machine-usable critique dashboard rollup for observability and automation.",
    promptSnippet:
      "Use dashboard output when you need critique counts, open findings, and follow-up tickets at a glance.",
    promptGuidelines: [
      "Prefer the dashboard for automation and triage; prefer critique_read when you need full packet context.",
    ],
    parameters: CritiqueDashboardParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const critique = await getStore(ctx).readCritiqueAsync(params.ref);
      return machineResult({ dashboard: critique.dashboard }, renderDashboard(critique.dashboard));
    },
  });
}
