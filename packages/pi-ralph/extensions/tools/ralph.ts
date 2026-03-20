import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { LOOM_LIST_SORTS, type LoomListSort } from "@pi-loom/pi-storage/storage/list-search.js";
import { type Static, Type } from "@sinclair/typebox";
import { executeRalphLoop, renderLoopResult, type ExecuteRalphLoopInput } from "../domain/loop.js";
import type { DecideRalphRunInput, RalphCritiqueLink } from "../domain/models.js";
import { renderDashboard, renderRalphDetail } from "../domain/render.js";
import { createRalphStore } from "../domain/store.js";

function withDescription<T extends Record<string, unknown>>(schema: T, description: string): T {
  return { ...schema, description } as T;
}

const RalphRunStatusEnum = StringEnum([
  "planned",
  "active",
  "paused",
  "waiting_for_review",
  "completed",
  "halted",
  "failed",
  "archived",
] as const);
const RalphRunPhaseEnum = StringEnum([
  "preparing",
  "executing",
  "reviewing",
  "deciding",
  "completed",
  "halted",
] as const);
const RalphDecisionKindEnum = StringEnum(["continue", "pause", "complete", "halt", "escalate"] as const);
const RalphWaitingForEnum = StringEnum(["none", "verifier", "critique", "operator"] as const);
const RalphIterationStatusEnum = StringEnum([
  "pending",
  "running",
  "reviewing",
  "accepted",
  "rejected",
  "failed",
  "cancelled",
] as const);
const RalphVerifierSourceKindEnum = StringEnum(["manual", "plan", "ticket", "test", "diagnostic", "runtime"] as const);
const RalphVerifierVerdictEnum = StringEnum(["not_run", "pass", "concerns", "fail"] as const);
const RalphCritiqueLinkKindEnum = StringEnum(["context", "launched", "blocking", "accepted", "followup"] as const);
const RalphCritiqueVerdictEnum = StringEnum(["pass", "concerns", "blocked", "needs_revision"] as const);
const RalphReadModeEnum = StringEnum(["full", "state", "packet", "run", "dashboard"] as const);
const LoomListSortEnum = StringEnum(LOOM_LIST_SORTS);

const LinkedRefsSchema = Type.Object({
  roadmapItemIds: Type.Optional(Type.Array(Type.String())),
  initiativeIds: Type.Optional(Type.Array(Type.String())),
  researchIds: Type.Optional(Type.Array(Type.String())),
  specChangeIds: Type.Optional(Type.Array(Type.String())),
  ticketIds: Type.Optional(Type.Array(Type.String())),
  critiqueIds: Type.Optional(Type.Array(Type.String())),
  docIds: Type.Optional(Type.Array(Type.String())),
  planIds: Type.Optional(Type.Array(Type.String())),
});

const PolicySnapshotSchema = Type.Object({
  mode: Type.Optional(StringEnum(["strict", "balanced", "expedite"] as const)),
  maxIterations: Type.Optional(Type.Number()),
  maxRuntimeMinutes: Type.Optional(Type.Number()),
  tokenBudget: Type.Optional(Type.Number()),
  verifierRequired: Type.Optional(Type.Boolean()),
  critiqueRequired: Type.Optional(Type.Boolean()),
  stopWhenVerified: Type.Optional(Type.Boolean()),
  manualApprovalRequired: Type.Optional(Type.Boolean()),
  allowOperatorPause: Type.Optional(Type.Boolean()),
  notes: Type.Optional(Type.Array(Type.String())),
});

const VerifierSummarySchema = Type.Object({
  sourceKind: Type.Optional(RalphVerifierSourceKindEnum),
  sourceRef: Type.Optional(Type.String()),
  verdict: Type.Optional(RalphVerifierVerdictEnum),
  summary: Type.Optional(Type.String()),
  required: Type.Optional(Type.Boolean()),
  blocker: Type.Optional(Type.Boolean()),
  checkedAt: Type.Optional(Type.String()),
  evidence: Type.Optional(Type.Array(Type.String())),
});

const CritiqueLinkSchema = Type.Object({
  critiqueId: Type.String(),
  kind: Type.Optional(RalphCritiqueLinkKindEnum),
  verdict: Type.Optional(RalphCritiqueVerdictEnum),
  required: Type.Optional(Type.Boolean()),
  blocking: Type.Optional(Type.Boolean()),
  reviewedAt: Type.Optional(Type.String()),
  findingIds: Type.Optional(Type.Array(Type.String())),
  summary: Type.Optional(Type.String()),
});

const DecisionInputSchema = Type.Object({
  workerRequestedCompletion: Type.Optional(Type.Boolean()),
  operatorRequestedStop: Type.Optional(Type.Boolean()),
  runtimeUnavailable: Type.Optional(Type.Boolean()),
  runtimeFailure: Type.Optional(Type.Boolean()),
  timeoutExceeded: Type.Optional(Type.Boolean()),
  budgetExceeded: Type.Optional(Type.Boolean()),
  summary: Type.Optional(Type.String()),
  decidedBy: Type.Optional(StringEnum(["policy", "verifier", "critique", "operator", "runtime"] as const)),
  blockingRefs: Type.Optional(Type.Array(Type.String())),
});

const RalphListParams = Type.Object({
  status: Type.Optional(
    withDescription(
      RalphRunStatusEnum,
      "Optional exact run status filter. Leave it unset on the first pass unless you intentionally want one run-state slice.",
    ),
  ),
  phase: Type.Optional(
    withDescription(
      RalphRunPhaseEnum,
      "Optional exact orchestration phase filter. Use this only when you already know which lifecycle phase you need.",
    ),
  ),
  decision: Type.Optional(
    withDescription(
      RalphDecisionKindEnum,
      "Optional exact latest-decision filter. This matches the stored continuation decision kind and can hide valid runs if guessed incorrectly.",
    ),
  ),
  waitingFor: Type.Optional(
    withDescription(
      RalphWaitingForEnum,
      "Optional exact waiting-state filter for paused or review-gated runs. Use it when triaging a known blocker class, not as the first discovery step.",
    ),
  ),
  text: Type.Optional(
    Type.String({
      description:
        "Free-text search over Ralph run id, title, objective, notes, and related indexed content. Prefer starting with text alone, then add exact filters only after the broad search is still too wide.",
    }),
  ),
  sort: Type.Optional(
    withDescription(
      LoomListSortEnum,
      "Optional result ordering. Defaults to `relevance` when `text` is present, otherwise `updated_desc`. Override this only when you intentionally need chronology or id-based ordering after filtering.",
    ),
  ),
});

const RalphReadParams = Type.Object({
  ref: Type.String({ description: "Run id, run path, or Ralph artifact path." }),
  mode: Type.Optional(RalphReadModeEnum),
});

const RalphRunParams = Type.Object({
  ref: Type.Optional(Type.String()),
  prompt: Type.Optional(Type.String()),
  title: Type.Optional(Type.String()),
  iterations: Type.Optional(Type.Number()),
  linkedRefs: Type.Optional(LinkedRefsSchema),
  policySnapshot: Type.Optional(PolicySnapshotSchema),
});

const RalphCheckpointParams = Type.Object({
  ref: Type.String(),
  status: RalphIterationStatusEnum,
  focus: Type.Optional(Type.String()),
  summary: Type.Optional(Type.String()),
  workerSummary: Type.Optional(Type.String()),
  startedAt: Type.Optional(Type.String()),
  completedAt: Type.Optional(Type.String()),
  verifierSummary: Type.Optional(VerifierSummarySchema),
  critiqueLinks: Type.Optional(Type.Array(CritiqueLinkSchema)),
  notes: Type.Optional(Type.Array(Type.String())),
  decisionInput: DecisionInputSchema,
});

type RalphCheckpointParamsValue = Static<typeof RalphCheckpointParams>;

function getStore(ctx: ExtensionContext) {
  return createRalphStore(ctx.cwd);
}

function machineResult(details: Record<string, unknown>, text: string) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

function materializeCritiqueLink(link: NonNullable<RalphCheckpointParamsValue["critiqueLinks"]>[number]): RalphCritiqueLink {
  return {
    critiqueId: link.critiqueId,
    kind: link.kind ?? "context",
    verdict: link.verdict ?? null,
    required: link.required === true,
    blocking: link.blocking === true,
    reviewedAt: link.reviewedAt ?? null,
    findingIds: link.findingIds ?? [],
    summary: link.summary ?? "",
  };
}

async function checkpointRun(
  store: ReturnType<typeof getStore>,
  params: {
    ref: string;
    status: "pending" | "running" | "reviewing" | "accepted" | "rejected" | "failed" | "cancelled";
    focus?: string;
    summary?: string;
    workerSummary?: string;
    startedAt?: string;
    completedAt?: string;
    verifierSummary?: {
      sourceKind?: "manual" | "plan" | "ticket" | "test" | "diagnostic" | "runtime";
      sourceRef?: string;
      verdict?: "not_run" | "pass" | "concerns" | "fail";
      summary?: string;
      required?: boolean;
      blocker?: boolean;
      checkedAt?: string;
      evidence?: string[];
    };
    critiqueLinks?: Array<{
      critiqueId: string;
      kind?: "context" | "launched" | "blocking" | "accepted" | "followup";
      verdict?: "pass" | "concerns" | "blocked" | "needs_revision";
      required?: boolean;
      blocking?: boolean;
      reviewedAt?: string;
      findingIds?: string[];
      summary?: string;
    }>;
    notes?: string[];
    decisionInput: DecideRalphRunInput;
  },
) {
  let run = await store.appendIterationAsync(params.ref, {
    status: params.status,
    focus: params.focus,
    summary: params.summary,
    workerSummary: params.workerSummary,
    startedAt: params.startedAt,
    completedAt: params.completedAt,
    verifier: params.verifierSummary,
    critiqueLinks: params.critiqueLinks?.map((link) => materializeCritiqueLink(link)),
    notes: params.notes,
  });

  const iterationId = run.state.postIteration?.iterationId ?? run.state.nextIterationId ?? run.iterations.at(-1)?.id ?? null;
  run = await store.decideRunAsync(params.ref, params.decisionInput);

  if (iterationId && run.state.latestDecision) {
    run = await store.appendIterationAsync(params.ref, {
      id: iterationId,
      decision: run.state.latestDecision,
    });
  }

  return run;
}

export function registerRalphTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ralph_list",
    label: "ralph_list",
    description:
      "List durable Ralph runs. Start broad with `text` when rediscovering a run by title, objective, or recent context; add exact filters such as `status`, `phase`, `decision`, or `waitingFor` only when you intentionally want a narrower slice. Results default to `relevance` with `text`, otherwise `updated_desc`.",
    promptSnippet:
      "Inspect existing Ralph runs before starting or continuing a loop so orchestration state does not fork; broad text search is the safest first pass when you do not yet know the exact run state.",
    promptGuidelines: [
      "Use this tool to rediscover the run that should absorb new bounded iteration work.",
      "When rediscovering a run, start with `text` and no exact filters; exact lifecycle filters can hide valid runs if guessed wrong.",
    ],
    parameters: RalphListParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const runs = await getStore(ctx).listRunsAsync({
        status: params.status,
        phase: params.phase,
        decision: params.decision,
        waitingFor: params.waitingFor,
        text: params.text,
        sort: params.sort as LoomListSort | undefined,
      });
      return machineResult(
        { runs },
        runs.length > 0 ? runs.map((run) => `${run.id} [${run.status}/${run.phase}] ${run.title}`).join("\n") : "No Ralph runs.",
      );
    },
  });

  pi.registerTool({
    name: "ralph_read",
    label: "ralph_read",
    description: "Read Ralph state, packet, dashboard, or rendered run artifacts from durable Loom orchestration memory.",
    promptSnippet: "Read the Ralph packet or run state before deciding whether to launch another bounded iteration.",
    promptGuidelines: [
      "Read packet mode when preparing a fresh Ralph worker context.",
      "Read dashboard mode for a concise between-iteration view of state, blockers, and latest decisions.",
      "Read full mode when you need the latest iterations, launch descriptor, and dashboard together.",
    ],
    parameters: RalphReadParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await getStore(ctx).readRunAsync(params.ref);
      if (params.mode === "packet") {
        return machineResult({ run: result.summary, packet: result.packet }, result.packet);
      }
      if (params.mode === "run") {
        return machineResult({ run: result.summary, markdown: result.run }, result.run);
      }
      if (params.mode === "state") {
        return machineResult({ state: result.state, summary: result.summary }, JSON.stringify(result.state, null, 2));
      }
      if (params.mode === "dashboard") {
        return machineResult({ dashboard: result.dashboard }, renderDashboard(result.dashboard));
      }
      return machineResult({ run: result }, renderRalphDetail(result));
    },
  });

  pi.registerTool({
    name: "ralph_checkpoint",
    label: "ralph_checkpoint",
    description: "Persist one bounded Ralph iteration checkpoint, including verifier evidence, critique links, and an explicit continuation decision, in a single safe tool call.",
    promptSnippet:
      "Use one Ralph checkpoint call per bounded iteration so the durable state stays coherent and the next caller can inspect a complete outcome.",
    promptGuidelines: [
      "This is the safe way for a fresh Ralph worker session to commit its bounded iteration outcome.",
      "Always provide an explicit `decisionInput`; a clean exit without a durable checkpoint and decision is treated as failure.",
      "Prefer this tool over piecemeal low-level writes so verifier, critique, iteration, and decision state stay in sync.",
    ],
    parameters: RalphCheckpointParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const run = await checkpointRun(getStore(ctx), {
        ref: params.ref,
        status: params.status,
        focus: params.focus,
        summary: params.summary,
        workerSummary: params.workerSummary,
        startedAt: params.startedAt,
        completedAt: params.completedAt,
        verifierSummary: params.verifierSummary,
        critiqueLinks: params.critiqueLinks,
        notes: params.notes,
        decisionInput: params.decisionInput,
      });
      return machineResult({ run }, renderRalphDetail(run));
    },
  });

  pi.registerTool({
    name: "ralph_run",
    label: "ralph_run",
    description:
      "Create or continue a Ralph run, execute up to N bounded fresh-context subprocess iterations under the hood, and return the resulting durable state for the next caller to inspect.",
    promptSnippet:
      "Use this as the primary Ralph loop tool: it handles the create or resume, one-bounded-iteration subprocess execution, durable-state inspection, and repeat logic for you.",
    promptGuidelines: [
      "For a new loop, provide a prompt and optional iteration count; the run will be initialized from the prompt plus current conversation context.",
      "For an existing loop, provide `ref` and optionally a steering prompt, then inspect the returned durable state before deciding whether to call `ralph_run` again.",
      "This tool intentionally executes bounded subprocess iterations; it does not keep a hidden long-running transcript alive.",
    ],
    parameters: RalphRunParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const result = await executeRalphLoop(
        ctx,
        {
          ref: params.ref,
          prompt: params.prompt,
          title: params.title,
          iterations: params.iterations,
          linkedRefs: params.linkedRefs as ExecuteRalphLoopInput["linkedRefs"],
          policySnapshot: params.policySnapshot as ExecuteRalphLoopInput["policySnapshot"],
        },
        signal,
      );
      return machineResult({ result }, renderLoopResult(result));
    },
  });
}
