import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { LOOM_LIST_SORTS, type LoomListSort } from "@pi-loom/pi-storage/storage/list-search.js";
import { type Static, Type } from "@sinclair/typebox";
import type {
  AppendRalphIterationInput,
  CreateRalphRunInput,
  DecideRalphRunInput,
  LinkRalphCritiqueInput,
  RalphContinuationDecision,
  RalphCritiqueLink,
  UpdateRalphRunInput,
} from "../domain/models.js";
import { renderDashboard, renderLaunchDescriptor, renderRalphDetail } from "../domain/render.js";
import { runRalphLaunch } from "../domain/runtime.js";
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
const RalphWriteActionEnum = StringEnum([
  "init",
  "create",
  "update",
  "append_iteration",
  "set_verifier",
  "link_critique",
  "decide",
  "archive",
] as const);
const RalphReadModeEnum = StringEnum(["full", "state", "packet", "run"] as const);
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

const IterationInputSchema = Type.Object({
  id: Type.Optional(Type.String()),
  status: Type.Optional(RalphIterationStatusEnum),
  startedAt: Type.Optional(Type.String()),
  completedAt: Type.Optional(Type.String()),
  focus: Type.Optional(Type.String()),
  summary: Type.Optional(Type.String()),
  workerSummary: Type.Optional(Type.String()),
  verifier: Type.Optional(VerifierSummarySchema),
  critiqueLinks: Type.Optional(Type.Array(CritiqueLinkSchema)),
  notes: Type.Optional(Type.Array(Type.String())),
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
      "Optional result ordering. Defaults to `relevance` when `text` is present, otherwise `updated_desc`. Override this only when you intentionally need chronological or id-based ordering after filtering.",
    ),
  ),
});

const RalphReadParams = Type.Object({
  ref: Type.String({ description: "Run id, run path, or Ralph artifact path." }),
  mode: Type.Optional(RalphReadModeEnum),
});

const RalphWriteParams = Type.Object({
  action: RalphWriteActionEnum,
  ref: Type.Optional(Type.String()),
  title: Type.Optional(Type.String()),
  objective: Type.Optional(Type.String()),
  summary: Type.Optional(Type.String()),
  linkedRefs: Type.Optional(LinkedRefsSchema),
  policySnapshot: Type.Optional(PolicySnapshotSchema),
  verifierSummary: Type.Optional(VerifierSummarySchema),
  critiqueLink: Type.Optional(CritiqueLinkSchema),
  latestDecision: Type.Optional(
    Type.Object({
      kind: RalphDecisionKindEnum,
      reason: StringEnum([
        "goal_reached",
        "verifier_blocked",
        "critique_blocked",
        "manual_review_required",
        "iteration_limit_reached",
        "policy_blocked",
        "operator_requested",
        "runtime_unavailable",
        "runtime_failure",
        "timeout_exceeded",
        "budget_exceeded",
        "worker_requested_completion",
        "unknown",
      ] as const),
      summary: Type.Optional(Type.String()),
      decidedAt: Type.Optional(Type.String()),
      decidedBy: Type.Optional(StringEnum(["policy", "verifier", "critique", "operator", "runtime"] as const)),
      blockingRefs: Type.Optional(Type.Array(Type.String())),
    }),
  ),
  waitingFor: Type.Optional(RalphWaitingForEnum),
  status: Type.Optional(RalphRunStatusEnum),
  phase: Type.Optional(RalphRunPhaseEnum),
  iteration: Type.Optional(IterationInputSchema),
  decisionInput: Type.Optional(DecisionInputSchema),
  launchInstructions: Type.Optional(Type.Array(Type.String())),
});

const RalphLaunchParams = Type.Object({
  ref: Type.String(),
  focus: Type.Optional(Type.String()),
  instructions: Type.Optional(Type.Array(Type.String())),
});

const RalphResumeParams = Type.Object({
  ref: Type.String(),
  focus: Type.Optional(Type.String()),
  instructions: Type.Optional(Type.Array(Type.String())),
});

const RalphDashboardParams = Type.Object({
  ref: Type.String(),
});

type RalphWriteParamsValue = Static<typeof RalphWriteParams>;

function getStore(ctx: ExtensionContext) {
  return createRalphStore(ctx.cwd);
}

function machineResult(details: Record<string, unknown>, text: string) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

function requireRef(ref: string | undefined): string {
  if (!ref) {
    throw new Error("Ralph run reference is required for this action");
  }
  return ref;
}

function materializeCritiqueLink(link: NonNullable<RalphWriteParamsValue["critiqueLink"]>): RalphCritiqueLink {
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

function materializeDecision(
  decision: RalphWriteParamsValue["latestDecision"] | undefined,
): RalphContinuationDecision | null | undefined {
  if (decision === undefined) {
    return undefined;
  }
  if (decision === null) {
    return null;
  }
  return {
    kind: decision.kind,
    reason: decision.reason,
    summary: decision.summary ?? "",
    decidedAt: decision.decidedAt ?? new Date().toISOString(),
    decidedBy: decision.decidedBy ?? "policy",
    blockingRefs: decision.blockingRefs ?? [],
  };
}

function createInput(params: RalphWriteParamsValue): CreateRalphRunInput {
  if (!params.title?.trim()) {
    throw new Error("title is required for create");
  }
  return {
    title: params.title,
    objective: params.objective,
    summary: params.summary,
    linkedRefs: params.linkedRefs,
    policySnapshot: params.policySnapshot,
    verifierSummary: params.verifierSummary,
    critiqueLinks: params.critiqueLink ? [materializeCritiqueLink(params.critiqueLink)] : undefined,
    latestDecision: materializeDecision(params.latestDecision),
    launchInstructions: params.launchInstructions,
  };
}

function updateInput(params: RalphWriteParamsValue): UpdateRalphRunInput {
  return {
    title: params.title,
    objective: params.objective,
    summary: params.summary,
    linkedRefs: params.linkedRefs,
    policySnapshot: params.policySnapshot,
    verifierSummary: params.verifierSummary,
    critiqueLinks: params.critiqueLink ? [materializeCritiqueLink(params.critiqueLink)] : undefined,
    latestDecision: materializeDecision(params.latestDecision),
    waitingFor: params.waitingFor,
    status: params.status,
    phase: params.phase,
  };
}

function iterationInput(params: RalphWriteParamsValue): AppendRalphIterationInput {
  if (!params.iteration) {
    throw new Error("iteration is required for append_iteration");
  }
  return {
    ...params.iteration,
    critiqueLinks: params.iteration.critiqueLinks?.map((link) => materializeCritiqueLink(link)),
  };
}

function verifierInput(params: RalphWriteParamsValue) {
  if (!params.verifierSummary) {
    throw new Error("verifierSummary is required for set_verifier");
  }
  return params.verifierSummary;
}

function critiqueInput(params: RalphWriteParamsValue): LinkRalphCritiqueInput {
  if (!params.critiqueLink) {
    throw new Error("critiqueLink is required for link_critique");
  }
  return params.critiqueLink;
}

function decisionInput(params: RalphWriteParamsValue): DecideRalphRunInput {
  if (!params.decisionInput) {
    throw new Error("decisionInput is required for decide");
  }
  return params.decisionInput;
}

export function registerRalphTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ralph_list",
    label: "ralph_list",
    description:
      "List durable Ralph runs. Start broad with `text` when rediscovering a run by title, objective, or recent context; add exact filters such as `status`, `phase`, `decision`, or `waitingFor` only when you intentionally want a narrower slice. Results default to `relevance` with `text`, otherwise `updated_desc`.",
    promptSnippet:
      "Inspect existing Ralph runs before starting a new long-horizon loop so orchestration state does not fork; broad text search is the safest first pass when you do not yet know the exact run state, and the default relevance ordering is usually the right first view.",
    promptGuidelines: [
      "Use this tool to rediscover the run that should absorb new iteration work.",
      "When rediscovering a run, start with `text` and no exact filters; `status`, `phase`, `decision`, and `waitingFor` all narrow by exact stored values and can hide valid runs if guessed wrong.",
      "The default ordering is `relevance` when `text` is present and `updated_desc` otherwise; set `sort` only when you intentionally need chronology or id order after filtering.",
      "Use `waitingFor` when intentionally triaging paused or review-gated runs after the broad search, not as the default discovery path.",
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
        runs.length > 0
          ? runs.map((run) => `${run.id} [${run.status}/${run.phase}] ${run.title}`).join("\n")
          : "No Ralph runs.",
      );
    },
  });

  pi.registerTool({
    name: "ralph_read",
    label: "ralph_read",
    description: "Read Ralph state, packet, or rendered run artifacts from durable Loom orchestration memory.",
    promptSnippet:
      "Read the Ralph packet or run state before continuing a long-horizon loop from memory or chat residue.",
    promptGuidelines: [
      "Read packet mode when preparing a fresh Ralph worker context.",
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
      return machineResult({ run: result }, renderRalphDetail(result));
    },
  });

  pi.registerTool({
    name: "ralph_write",
    label: "ralph_write",
    description: "Create, update, and evolve durable Ralph run state in local Loom memory.",
    promptSnippet:
      "Persist detailed Ralph iteration state, verifier evidence, critique links, blockers, and policy decisions durably instead of keeping loop progress only in chat.",
    promptGuidelines: [
      "Use create before a long-horizon loop starts so packet, dashboard, and launch state have a durable home.",
      "Do not write shallow status blurbs; each update should leave the run resume-ready with objective context, what changed, verifier or critique outcomes, and the rationale for the next decision.",
      "Record explicit decisions after each iteration so future workers can see why the loop continued, paused, or stopped.",
    ],
    parameters: RalphWriteParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const store = getStore(ctx);
      switch (params.action) {
        case "init": {
          const result = await store.initLedgerAsync();
          return machineResult(
            { action: params.action, initialized: result },
            `Initialized Ralph memory at ${result.root}`,
          );
        }
        case "create": {
          const run = await store.createRunAsync(createInput(params));
          return machineResult({ action: params.action, run }, renderRalphDetail(run));
        }
        case "update": {
          const run = await store.updateRunAsync(requireRef(params.ref), updateInput(params));
          return machineResult({ action: params.action, run }, renderRalphDetail(run));
        }
        case "append_iteration": {
          const run = await store.appendIterationAsync(requireRef(params.ref), iterationInput(params));
          return machineResult({ action: params.action, run }, renderRalphDetail(run));
        }
        case "set_verifier": {
          const run = await store.setVerifierAsync(requireRef(params.ref), verifierInput(params));
          return machineResult({ action: params.action, run }, renderRalphDetail(run));
        }
        case "link_critique": {
          const run = await store.linkCritiqueAsync(requireRef(params.ref), critiqueInput(params));
          return machineResult({ action: params.action, run }, renderRalphDetail(run));
        }
        case "decide": {
          const run = await store.decideRunAsync(requireRef(params.ref), decisionInput(params));
          return machineResult({ action: params.action, run }, renderRalphDetail(run));
        }
        case "archive": {
          const run = await store.archiveRunAsync(requireRef(params.ref));
          return machineResult({ action: params.action, run }, renderRalphDetail(run));
        }
      }
    },
  });

  pi.registerTool({
    name: "ralph_launch",
    label: "ralph_launch",
    description:
      "Prepare a fresh-context Ralph iteration and execute it through the default subprocess runtime adapter.",
    promptSnippet:
      "Use fresh-context launch descriptors instead of continuing a Ralph loop through one ever-growing transcript.",
    promptGuidelines: [
      "Launch only after the run packet reflects the latest objective framing, verifier evidence, critique outcomes, blockers, and decision state.",
      "Treat non-zero launch exit codes as runtime failures that should be persisted back into the Ralph run.",
    ],
    parameters: RalphLaunchParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const store = getStore(ctx);
      let run = await store.prepareLaunchAsync(params.ref, { focus: params.focus, instructions: params.instructions });
      const execution = await runRalphLaunch(ctx.cwd, run.launch, signal, undefined);
      if (execution.exitCode !== 0) {
        run = await store.decideRunAsync(params.ref, {
          runtimeFailure: true,
          summary: execution.stderr || execution.output || "Ralph launch subprocess exited unsuccessfully.",
          decidedBy: "runtime",
        });
      }
      const text = execution.output || renderLaunchDescriptor(ctx.cwd, run.launch);
      return machineResult({ run, launch: run.launch, execution }, text);
    },
  });

  pi.registerTool({
    name: "ralph_resume",
    label: "ralph_resume",
    description: "Resume a paused or review-gated Ralph run through the default fresh-context runtime adapter.",
    promptSnippet:
      "Resume Ralph from durable run state and packet context instead of reconstructing loop intent from memory.",
    promptGuidelines: [
      "Resume only after required critique or verifier artifacts are linked into the run and the packet explains the latest blockers, rationale, and next-step expectations.",
      "Use this after pauses, review gates, or operator intervention to keep the loop history truthful.",
    ],
    parameters: RalphResumeParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const store = getStore(ctx);
      let run = await store.resumeRunAsync(params.ref, { focus: params.focus, instructions: params.instructions });
      const execution = await runRalphLaunch(ctx.cwd, run.launch, signal, undefined);
      if (execution.exitCode !== 0) {
        run = await store.decideRunAsync(params.ref, {
          runtimeFailure: true,
          summary: execution.stderr || execution.output || "Ralph resume subprocess exited unsuccessfully.",
          decidedBy: "runtime",
        });
      }
      const text = execution.output || renderLaunchDescriptor(ctx.cwd, run.launch);
      return machineResult({ run, launch: run.launch, execution }, text);
    },
  });

  pi.registerTool({
    name: "ralph_dashboard",
    label: "ralph_dashboard",
    description: "Read the machine-usable Ralph dashboard rollup for run state, latest decision, and iteration counts.",
    promptSnippet: "Use the Ralph dashboard for observability when you need the loop state and blockers at a glance.",
    promptGuidelines: [
      "Prefer the dashboard for quick status inspection; prefer ralph_read when you need the packet or full run record.",
      "Check waiting state and latest decision before deciding whether to launch, resume, or stop a run.",
    ],
    parameters: RalphDashboardParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const dashboard = (await getStore(ctx).readRunAsync(params.ref)).dashboard;
      return machineResult({ dashboard }, renderDashboard(dashboard));
    },
  });
}
