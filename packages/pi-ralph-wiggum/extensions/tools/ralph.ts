import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { LOOM_LIST_SORTS, type LoomListSort } from "@pi-loom/pi-storage/storage/list-search.js";
import { type Static, Type } from "@sinclair/typebox";
import type { AsyncJob } from "../domain/async-job-manager.js";
import { AsyncJobManager } from "../domain/async-job-manager.js";
import {
  type ExecuteRalphLoopInput,
  type ExecuteRalphLoopResult,
  ensureRalphRun,
  executeRalphLoop,
  isRalphLoopExecutionInFlight,
  resolveRalphRunBinding,
  renderLoopResult,
} from "../domain/loop.js";
import type { DecideRalphRunInput, RalphCritiqueLink, RalphReadResult } from "../domain/models.js";
import { renderDashboard, renderRalphDetail } from "../domain/render.js";
import { createRalphStore } from "../domain/store.js";
import {
  type RalphRunRenderDetails,
  renderRalphCheckpointCall,
  renderRalphCheckpointResult,
  renderRalphJobCall,
  renderRalphJobResult,
  renderRalphReadCall,
  renderRalphReadResult,
  renderRalphRunCall,
  renderRalphRunResult,
} from "../ui/renderers.js";

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

const PolicySnapshotSchema = Type.Object({
  mode: Type.Optional(
    withDescription(
      StringEnum(["strict", "balanced", "expedite"] as const),
      "Policy posture for the managed loop. `strict` favors review gates, `balanced` is the default delivery posture, and `expedite` favors fast ticket throughput within the same durable loop contract.",
    ),
  ),
  maxIterations: Type.Optional(
    Type.Number({
      description:
        "Optional cap on bounded iterations for this loop. Leave unset when the loop should run until the workplan is complete.",
    }),
  ),
  maxRuntimeMinutes: Type.Optional(
    Type.Number({ description: "Optional runtime limit for each fresh-context iteration in minutes." }),
  ),
  tokenBudget: Type.Optional(
    Type.Number({
      description:
        "Optional token budget for the loop. The runtime records measured usage and enforces this budget truthfully.",
    }),
  ),
  verifierRequired: Type.Optional(
    Type.Boolean({ description: "Require verifier evidence before the loop may treat ticket progress as accepted." }),
  ),
  critiqueRequired: Type.Optional(
    Type.Boolean({ description: "Require critique context before the loop advances through review-sensitive work." }),
  ),
  stopWhenVerified: Type.Optional(
    Type.Boolean({
      description: "Allow the loop to complete once the workplan is closed and verifier conditions are satisfied.",
    }),
  ),
  manualApprovalRequired: Type.Optional(
    Type.Boolean({ description: "Route the loop through operator review gates before final completion decisions." }),
  ),
  allowOperatorPause: Type.Optional(
    Type.Boolean({ description: "Allow operator steering to pause or reshape the loop at iteration boundaries." }),
  ),
  notes: Type.Optional(
    Type.Array(Type.String({ description: "Additional policy notes that become part of the durable loop context." })),
  ),
});

const VerifierSummarySchema = Type.Object({
  sourceKind: Type.Optional(
    withDescription(RalphVerifierSourceKindEnum, "Verifier evidence source kind for this iteration outcome."),
  ),
  sourceRef: Type.Optional(
    Type.String({
      description: "Verifier source reference such as a plan id, ticket id, test target, or diagnostic artifact.",
    }),
  ),
  verdict: Type.Optional(
    withDescription(RalphVerifierVerdictEnum, "Verifier conclusion for the bounded iteration outcome."),
  ),
  summary: Type.Optional(
    Type.String({ description: "Compact verifier narrative describing what the evidence means for this iteration." }),
  ),
  required: Type.Optional(Type.Boolean({ description: "Marks verifier evidence as required for this scope." })),
  blocker: Type.Optional(
    Type.Boolean({ description: "Marks the verifier result as gating further loop progress until addressed." }),
  ),
  checkedAt: Type.Optional(
    Type.String({ description: "ISO timestamp describing when the verifier evidence was gathered." }),
  ),
  evidence: Type.Optional(
    Type.Array(
      Type.String({ description: "Verifier evidence references, commands, or artifacts that justify the verdict." }),
    ),
  ),
});

const CritiqueLinkSchema = Type.Object({
  critiqueId: Type.String({ description: "Critique id associated with this bounded iteration." }),
  kind: Type.Optional(
    withDescription(RalphCritiqueLinkKindEnum, "Role this critique plays in the current iteration context."),
  ),
  verdict: Type.Optional(
    withDescription(RalphCritiqueVerdictEnum, "Critique verdict carried into the Ralph checkpoint."),
  ),
  required: Type.Optional(
    Type.Boolean({ description: "Marks this critique as part of the required review context for the loop." }),
  ),
  blocking: Type.Optional(Type.Boolean({ description: "Marks this critique as an active gate on further progress." })),
  reviewedAt: Type.Optional(Type.String({ description: "ISO timestamp for the critique review event." })),
  findingIds: Type.Optional(
    Type.Array(Type.String({ description: "Accepted or referenced critique finding ids relevant to this iteration." })),
  ),
  summary: Type.Optional(
    Type.String({ description: "Compact explanation of why this critique link matters for the iteration." }),
  ),
});

const DecisionInputSchema = Type.Object({
  workerRequestedCompletion: Type.Optional(
    Type.Boolean({
      description:
        "Worker-level signal that the current bounded iteration reached a truthful stopping point for the selected ticket.",
    }),
  ),
  operatorRequestedStop: Type.Optional(
    Type.Boolean({ description: "Operator-level stop signal carried into the checkpoint decision input." }),
  ),
  runtimeUnavailable: Type.Optional(
    Type.Boolean({ description: "Runtime support or usage evidence was unavailable for the current iteration." }),
  ),
  runtimeFailure: Type.Optional(Type.Boolean({ description: "Runtime execution failed for the current iteration." })),
  timeoutExceeded: Type.Optional(
    Type.Boolean({ description: "Runtime limit was exceeded for the current iteration." }),
  ),
  budgetExceeded: Type.Optional(Type.Boolean({ description: "Token budget was exceeded for the current iteration." })),
  summary: Type.Optional(
    Type.String({ description: "Decision summary that will be preserved with the durable continuation record." }),
  ),
  decidedBy: Type.Optional(
    withDescription(
      StringEnum(["policy", "verifier", "critique", "operator", "runtime"] as const),
      "Primary decision source for the continuation record produced from this checkpoint.",
    ),
  ),
  blockingRefs: Type.Optional(
    Type.Array(Type.String({ description: "Refs that explain any current loop gate or stopping condition." })),
  ),
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
      "Optional exact latest-decision filter. This matches the stored continuation decision kind and is useful when you want one precise continuation slice.",
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
  ticketRef: Type.String({ description: "Ticket ref bound to the Ralph run you want to inspect." }),
  planRef: Type.Optional(
    Type.String({ description: "Optional governing plan ref for the Ralph run you want to inspect." }),
  ),
  mode: Type.Optional(
    withDescription(
      RalphReadModeEnum,
      "Read shape for the response. `packet` is ideal for fresh iteration context, `dashboard` for operator triage, `run` for the rendered markdown view, `state` for structured state, and `full` for the complete durable record.",
    ),
  ),
});

const RalphRunParams = Type.Object({
  ticketRef: Type.String({ description: "Ticket ref that the Ralph run is durably bound to." }),
  planRef: Type.Optional(Type.String({ description: "Optional governing plan ref for the ticket-bound Ralph run." })),
  steeringPrompt: Type.Optional(
    Type.String({
      description:
        "Durable operator steering for the next iteration boundary. This guidance is preserved in run state and applied to the bound ticket run.",
    }),
  ),
  background: Type.Optional(
    Type.Boolean({
      description:
        "Execution mode. `true` returns immediately with a job id while the managed loop advances asynchronously; `false` runs in the current call and returns the resulting durable state.",
    }),
  ),
  policySnapshot: Type.Optional(PolicySnapshotSchema),
});

const RalphSteerParams = Type.Object({
  ticketRef: Type.String({ description: "Ticket ref bound to the Ralph run that should absorb the steering." }),
  planRef: Type.Optional(
    Type.String({ description: "Optional governing plan ref for the Ralph run that should absorb the steering." }),
  ),
  text: Type.String({ description: "Steering text to queue durably for the next iteration boundary." }),
});

const RalphStopParams = Type.Object({
  ticketRef: Type.String({ description: "Ticket ref bound to the Ralph run that should stop." }),
  planRef: Type.Optional(
    Type.String({ description: "Optional governing plan ref for the Ralph run that should stop." }),
  ),
  summary: Type.Optional(Type.String({ description: "Operator summary recorded with the durable stop request." })),
  cancelRunning: Type.Optional(
    Type.Boolean({
      description:
        "When true, cancel the currently running background job while preserving the stop request in durable state.",
    }),
  ),
});

const RalphJobReadParams = Type.Object({
  jobId: Type.String({
    description: "Background Ralph job id returned by `ralph_run` or visible through the job tools.",
  }),
});

const RalphJobCancelParams = Type.Object({
  jobId: Type.String({ description: "Background Ralph job id to cancel." }),
});

const RalphJobWaitParams = Type.Object({
  jobIds: Type.Optional(
    Type.Array(
      Type.String({
        description:
          "Specific Ralph background job ids to wait on. Leave unset to wait for any tracked Ralph job in the workspace.",
      }),
    ),
  ),
  mode: Type.Optional(
    withDescription(
      StringEnum(["any", "all"]),
      "Wait mode: resolve when any tracked job settles or after all tracked jobs settle.",
    ),
  ),
  timeoutMs: Type.Optional(Type.Number({ description: "Optional wait timeout in milliseconds for the current call." })),
});

const RalphCheckpointParams = Type.Object({
  ref: Type.String({
    description:
      "Ralph run display id or `ralph-run:<display-id>` ref receiving the checkpoint. Canonical Ralph entity ids remain internal storage details.",
  }),
  iterationId: Type.String({
    description:
      "Explicit launched iteration id from the Ralph launch packet. Reuse this exact id if you update the same bounded iteration checkpoint again.",
  }),
  status: withDescription(RalphIterationStatusEnum, "Bounded iteration status being committed."),
  focus: Type.Optional(Type.String({ description: "Ticket-sized focus statement for this bounded iteration." })),
  summary: Type.Optional(Type.String({ description: "Outcome summary for the bounded iteration." })),
  workerSummary: Type.Optional(
    Type.String({
      description:
        "Worker-centric execution summary highlighting what changed, what was verified, and what remains relevant.",
    }),
  ),
  startedAt: Type.Optional(Type.String({ description: "ISO timestamp for when this bounded iteration started." })),
  completedAt: Type.Optional(Type.String({ description: "ISO timestamp for when this bounded iteration completed." })),
  verifierSummary: Type.Optional(VerifierSummarySchema),
  critiqueLinks: Type.Optional(Type.Array(CritiqueLinkSchema)),
  notes: Type.Optional(Type.Array(Type.String({ description: "Additional durable notes for this iteration record." }))),
  decisionInput: DecisionInputSchema,
});

type RalphCheckpointParamsValue = Static<typeof RalphCheckpointParams>;

function getStore(ctx: ExtensionContext) {
  return createRalphStore(ctx.cwd);
}

type RalphJobType = "ralph_run";
type RalphJobMetadata = { runId: string; cwd: string };

const ralphJobManager = new AsyncJobManager<RalphJobType, RalphJobMetadata, ExecuteRalphLoopResult>();

function getWorkspaceJobs(cwd: string): AsyncJob<RalphJobType, RalphJobMetadata, ExecuteRalphLoopResult>[] {
  return ralphJobManager.getAllJobs().filter((job) => job.metadata?.cwd === cwd);
}

function getRunJobs(runId: string, cwd: string): AsyncJob<RalphJobType, RalphJobMetadata, ExecuteRalphLoopResult>[] {
  return getWorkspaceJobs(cwd)
    .filter((job) => job.metadata?.runId === runId && job.metadata?.cwd === cwd)
    .sort((left, right) => left.startTime - right.startTime);
}

function getWorkspaceJob(
  jobId: string,
  cwd: string,
): AsyncJob<RalphJobType, RalphJobMetadata, ExecuteRalphLoopResult> | null {
  const job = ralphJobManager.getJob(jobId);
  if (!job || job.metadata?.cwd !== cwd) {
    return null;
  }
  return job;
}

function getRunningRunJobs(
  runId: string,
  cwd: string,
): AsyncJob<RalphJobType, RalphJobMetadata, ExecuteRalphLoopResult>[] {
  return getRunJobs(runId, cwd).filter((job) => job.status === "running");
}

function getRunningRunJob(
  runId: string,
  cwd: string,
): AsyncJob<RalphJobType, RalphJobMetadata, ExecuteRalphLoopResult> | null {
  return getRunningRunJobs(runId, cwd)[0] ?? null;
}

export async function resolveTargetRalphRun(
  ctx: ExtensionContext,
  ticketRef: string,
  planRef?: string,
): Promise<RalphReadResult> {
  const binding = await resolveRalphRunBinding(ctx.cwd, { ticketRef, planRef });
  return binding.existingRun ?? getStore(ctx).readRunAsync(binding.runId);
}

async function syncRunSchedulerWithJobs(ctx: ExtensionContext, runId: string): Promise<RalphReadResult> {
  const store = getStore(ctx);
  const current = await store.readRunAsync(runId);
  const runningJobs = getRunningRunJobs(runId, ctx.cwd);
  if (runningJobs.length === 0) {
    return current;
  }

  const latestJob = runningJobs.at(-1) ?? null;
  return store.setSchedulerAsync(runId, {
    status: "running",
    updatedAt: new Date().toISOString(),
    jobId: latestJob?.id ?? null,
    note:
      runningJobs.length === 1
        ? (current.state.scheduler.note ?? `Managed Ralph loop running as job ${latestJob?.id ?? "(unknown)"}.`)
        : `${runningJobs.length} Ralph jobs are running for ticket ${current.state.scope.ticketId ?? current.state.runId}.`,
  });
}

export async function startRalphLoopJob(
  ctx: ExtensionContext,
  input: ExecuteRalphLoopInput,
  onProgress?: (text: string) => void | Promise<void>,
): Promise<{ run: RalphReadResult; created: boolean; jobId: string; alreadyRunning: boolean }> {
  const store = getStore(ctx);
  const ensured = await ensureRalphRun(ctx, input);
  let run = ensured.run;
  if (!ensured.created && input.prompt?.trim()) {
    run = await store.queueSteeringAsync(run.state.runId, input.prompt.trim());
  }

  const runningJob = getRunningRunJob(run.state.runId, ctx.cwd);
  if (runningJob) {
    return { run, created: ensured.created, jobId: runningJob.id, alreadyRunning: true };
  }
  if (isRalphLoopExecutionInFlight(ctx.cwd, run.state.runId)) {
    throw new Error(`Ralph run ${run.state.runId} already has an in-flight loop execution in workspace ${ctx.cwd}.`);
  }

  const jobId = ralphJobManager.register(
    "ralph_run",
    `Ralph run ${run.state.runId}`,
    async ({ jobId: runningJobId, signal: jobSignal, reportProgress }) => {
      await store.setSchedulerAsync(run.state.runId, {
        status: "running",
        updatedAt: new Date().toISOString(),
        jobId: runningJobId,
        note: `Managed Ralph loop running for ticket ${run.state.scope.ticketId ?? "(none)"}.`,
      });
      await reportProgress(`Starting managed Ralph loop ${run.state.runId}.`, {
        jobId: runningJobId,
        runId: run.state.runId,
      });
      if (onProgress) {
        await onProgress(`Starting managed Ralph loop ${run.state.runId}.`);
      }
      try {
        return await executeRalphLoop(ctx, { ref: run.state.runId }, jobSignal, {
          jobId: runningJobId,
          onUpdate: async (text) => {
            await reportProgress(text, { jobId: runningJobId, runId: run.state.runId });
            if (onProgress) {
              await onProgress(text);
            }
          },
        });
      } finally {
        await syncRunSchedulerWithJobs(ctx, run.state.runId);
      }
    },
    {
      metadata: { runId: run.state.runId, cwd: ctx.cwd },
    },
  );

  run = await store.setSchedulerAsync(run.state.runId, {
    status: "running",
    updatedAt: new Date().toISOString(),
    jobId,
    note: `Managed Ralph loop scheduled as job ${jobId}.`,
  });
  return { run, created: ensured.created, jobId, alreadyRunning: false };
}

export async function stopRalphLoop(
  ctx: ExtensionContext,
  ticketRef: string,
  planRef?: string,
  summary?: string,
  cancelRunning = true,
): Promise<{ run: RalphReadResult; cancelledJobIds: string[] }> {
  const store = getStore(ctx);
  const run = await resolveTargetRalphRun(ctx, ticketRef, planRef);
  let updated = await store.requestStopAsync(run.state.runId, summary, cancelRunning);
  const runningJobs = getRunningRunJobs(run.state.runId, ctx.cwd);
  if (cancelRunning && runningJobs.length > 0) {
    const cancelledJobIds = runningJobs.filter((job) => ralphJobManager.cancel(job.id)).map((job) => job.id);
    await syncRunSchedulerWithJobs(ctx, run.state.runId);
    return { run: updated, cancelledJobIds };
  }
  if (runningJobs.length === 0) {
    updated = await store.acknowledgeStopRequestAsync(run.state.runId);
    updated = await store.updateRunAsync(run.state.runId, {
      latestDecision: {
        kind: "halt",
        reason: "operator_requested",
        summary: summary?.trim() || "Operator requested the Ralph loop to stop.",
        decidedAt: new Date().toISOString(),
        decidedBy: "operator",
        blockingRefs: [],
      },
      status: "halted",
      phase: "halted",
      waitingFor: "none",
      stopReason: "operator_requested",
      scheduler: {
        status: "completed",
        updatedAt: new Date().toISOString(),
        jobId: null,
        note: summary?.trim() || "Operator requested the Ralph loop to stop.",
      },
    });
  }
  return { run: updated, cancelledJobIds: [] };
}

function normalizeWorkspaceJobIds(jobIds: readonly string[] | undefined, cwd: string): string[] {
  if (!jobIds || jobIds.length === 0) {
    const workspaceJobs = getWorkspaceJobs(cwd);
    const runningJobIds = workspaceJobs.filter((job) => job.status === "running").map((job) => job.id);
    return runningJobIds.length > 0 ? runningJobIds : workspaceJobs.map((job) => job.id);
  }

  const foreign = jobIds.filter((jobId) => {
    const job = ralphJobManager.getJob(jobId);
    return job && job.metadata?.cwd !== cwd;
  });
  if (foreign.length > 0) {
    throw new Error(`Ralph jobs belong to a different workspace: ${foreign.join(", ")}`);
  }

  return jobIds.filter((jobId) => getWorkspaceJob(jobId, cwd) !== null);
}

function machineResult(details: Record<string, unknown>, text: string) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

function buildRalphRunRenderDetails(input: {
  prompt?: string;
  startedAt: number;
  created: boolean;
  updates: string[];
  run: ExecuteRalphLoopResult["run"]["summary"] | null;
  state: RalphRunRenderDetails["state"];
  result: ExecuteRalphLoopResult | null;
  asyncState?: RalphRunRenderDetails["async"];
}): RalphRunRenderDetails {
  return {
    kind: "ralph_run",
    prompt: input.prompt?.trim() || null,
    startedAt: input.startedAt,
    created: input.created,
    updates: [...input.updates],
    run: input.run,
    state: input.state,
    result: input.result,
    async: input.asyncState ?? null,
  };
}

function renderJobSummary(job: AsyncJob<RalphJobType, RalphJobMetadata, ExecuteRalphLoopResult>): string {
  return [
    `${job.id} [${job.status}] ${job.label}`,
    `run: ${job.metadata?.runId ?? "(unknown)"}`,
    `started: ${new Date(job.startTime).toISOString()}`,
    `last progress: ${job.progress?.text ?? "(none)"}`,
    `error: ${job.errorText ?? "(none)"}`,
  ].join("\n");
}

function materializeCritiqueLink(
  link: NonNullable<RalphCheckpointParamsValue["critiqueLinks"]>[number],
): RalphCritiqueLink {
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
    iterationId: string;
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
    id: params.iterationId,
    requireActiveIteration: true,
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

  run = await store.decideRunAsync(params.ref, params.decisionInput);

  if (run.state.latestDecision) {
    run = await store.appendIterationAsync(params.ref, {
      id: params.iterationId,
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
      "List durable Ralph loops and their current orchestration posture. Start broad with `text` when rediscovering a loop by plan, title, or recent context, then add exact filters such as `status`, `phase`, `decision`, or `waitingFor` when you want a narrower operational slice. Results default to `relevance` with `text`, otherwise `updated_desc`.",
    promptSnippet:
      "Inspect existing Ralph loops before starting or steering plan execution so durable orchestration state stays concentrated around the right workplan.",
    promptGuidelines: [
      "Use this tool to rediscover the loop that should carry the next stretch of planned implementation work.",
      "Start with `text` and let the default relevance ranking surface the likely loop family before narrowing by exact lifecycle filters.",
      "Use exact filters when you want one operational slice such as active delivery, paused review, or completed run checkpoints.",
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
    description:
      "Read Ralph loop state, packet, dashboard, or rendered run artifacts from durable Loom orchestration memory.",
    promptSnippet: "Read the Ralph packet or run state before deciding whether to launch another bounded iteration.",
    promptGuidelines: [
      "Read packet mode when preparing the next fresh worker iteration for a ticket-bound Ralph run.",
      "Read dashboard mode when triaging loop progress, review gates, or the current scheduler state.",
      "Read full mode when you need the loop state, iterations, runtime artifacts, launch descriptor, and dashboard together.",
    ],
    parameters: RalphReadParams,
    renderCall: (args, theme) => renderRalphReadCall(args as Record<string, unknown>, theme),
    renderResult: (result, options, theme) => renderRalphReadResult(result, options, theme),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await resolveTargetRalphRun(ctx, params.ticketRef, params.planRef);
      const jobs = getRunJobs(result.state.runId, ctx.cwd);
      if (params.mode === "packet") {
        return machineResult({ run: result.summary, packet: result.packet, jobs }, result.packet);
      }
      if (params.mode === "run") {
        return machineResult({ run: result.summary, markdown: result.run, jobs }, result.run);
      }
      if (params.mode === "state") {
        return machineResult(
          { state: result.state, summary: result.summary, runtimeArtifacts: result.runtimeArtifacts, jobs },
          JSON.stringify({ state: result.state, runtimeArtifacts: result.runtimeArtifacts, jobs }, null, 2),
        );
      }
      if (params.mode === "dashboard") {
        return machineResult({ dashboard: result.dashboard, jobs }, renderDashboard(result.dashboard));
      }
      return machineResult({ run: result, jobs }, renderRalphDetail(result));
    },
  });

  pi.registerTool({
    name: "ralph_checkpoint",
    label: "ralph_checkpoint",
    description:
      "Persist one bounded Ralph iteration checkpoint for an explicit launched iteration id, including verifier evidence, critique context, and a continuation decision that the managed loop can evaluate against the workplan.",
    promptSnippet:
      "Commit one complete iteration outcome at a time so the managed loop can inspect plan progress, verifier evidence, and review posture from durable state.",
    promptGuidelines: [
      "Use this tool from the fresh Ralph worker session that owns the launched iteration id.",
      "Pass the explicit `iterationId` from the launch packet so repeated updates stay attached to the same bounded unit of work.",
      "Provide `decisionInput` with the evidence needed for the loop-level continuation decision.",
      "Use the checkpoint as the durable handoff from worker execution back to loop orchestration, including the verifier and critique context that matters for plan progress.",
    ],
    parameters: RalphCheckpointParams,
    renderCall: (args, theme) => renderRalphCheckpointCall(args as Record<string, unknown>, theme),
    renderResult: (result, _options, theme) => renderRalphCheckpointResult(result, theme),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const run = await checkpointRun(getStore(ctx), {
        ref: params.ref,
        iterationId: params.iterationId,
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
      "Start or continue the managed Ralph loop bound to one plan ticket, carrying that ticket through repeated fresh-context iterations with durable state, steering, review evidence, and scheduler control.",
    promptSnippet:
      "Use this when one ticket under a governing plan should advance through bounded Ralph iterations with fresh context and durable review state.",
    promptGuidelines: [
      "Provide `ticketRef`; Ralph binds the run to that exact ticket and uses `planRef` when supplied or inferable.",
      "The system owns run ids. AI callers should identify Ralph work by plan/ticket, not by a chosen run ref.",
      "Background execution is well suited to parallel ticket delivery because distinct ticket-bound runs may proceed concurrently.",
      "Do not try to launch two Ralph runs against the same ticket at the same time.",
    ],
    parameters: RalphRunParams,
    renderCall: (args, theme) => renderRalphRunCall(args as Record<string, unknown>, theme),
    renderResult: (result, options, theme) => renderRalphRunResult(result, options, theme),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const input: ExecuteRalphLoopInput = {
        ticketRef: params.ticketRef,
        planRef: params.planRef,
        prompt: params.steeringPrompt,
        policySnapshot: params.policySnapshot as ExecuteRalphLoopInput["policySnapshot"],
      };
      const startedAt = Date.now();
      const progressUpdates: string[] = [];
      if (params.background !== false) {
        let backgroundJobId: string | null = null;
        let backgroundRunId: string | null = null;
        let backgroundRunSummary: ExecuteRalphLoopResult["run"]["summary"] | null = null;
        let backgroundCreated = false;
        const started = await startRalphLoopJob(ctx, input, async (text) => {
          progressUpdates.push(text);
          onUpdate?.({
            content: [{ type: "text", text }],
            details: {
              async: {
                state: "running",
                jobId: backgroundJobId,
                runId: backgroundRunId,
                type: "ralph_run",
              },
              run: backgroundRunSummary,
              ui: buildRalphRunRenderDetails({
                prompt: params.steeringPrompt,
                startedAt,
                created: backgroundCreated,
                updates: progressUpdates.slice(-8),
                run: backgroundRunSummary,
                state: "background",
                result: null,
                asyncState: {
                  state: "running",
                  jobId: backgroundJobId,
                  runId: backgroundRunId,
                  type: "ralph_run",
                },
              }),
            },
          });
        });
        backgroundJobId = started.jobId;
        backgroundRunId = started.run.state.runId;
        backgroundRunSummary = started.run.summary;
        backgroundCreated = started.created;
        const job = ralphJobManager.getJob(started.jobId);
        return machineResult(
          {
            async: { state: "running", jobId: started.jobId, runId: started.run.state.runId, type: "ralph_run" },
            run: started.run.summary,
            job,
            ui: buildRalphRunRenderDetails({
              prompt: params.steeringPrompt,
              startedAt,
              created: started.created,
              updates: progressUpdates,
              run: started.run.summary,
              state: "background",
              result: null,
              asyncState: { state: "running", jobId: started.jobId, runId: started.run.state.runId, type: "ralph_run" },
            }),
          },
          started.alreadyRunning
            ? `Managed Ralph loop ${started.run.state.runId} is already running as job ${started.jobId}.`
            : `Started managed Ralph loop ${started.run.state.runId} as job ${started.jobId}. Use ralph_read, ralph_job_read, ralph_job_wait, or ralph_job_cancel to inspect it.`,
        );
      }

      const ensured = await ensureRalphRun(ctx, input);
      let run = ensured.run;
      if (!ensured.created && params.steeringPrompt?.trim()) {
        run = await getStore(ctx).queueSteeringAsync(run.state.runId, params.steeringPrompt.trim());
      }
      const result = await executeRalphLoop(ctx, { ref: run.state.runId }, signal, {
        onUpdate: (text) => {
          progressUpdates.push(text);
          onUpdate?.({
            content: [{ type: "text", text }],
            details: {
              runRef: run.state.runId,
              ui: buildRalphRunRenderDetails({
                prompt: params.steeringPrompt,
                startedAt,
                created: ensured.created,
                updates: progressUpdates.slice(-8),
                run: run.summary,
                state: "running",
                result: null,
              }),
            },
          });
        },
      });
      const normalizedResult = result;
      return machineResult(
        {
          result: normalizedResult,
          ui: buildRalphRunRenderDetails({
            prompt: params.steeringPrompt,
            startedAt,
            created: normalizedResult.created,
            updates: progressUpdates.slice(-8),
            run: normalizedResult.run.summary,
            state: "completed",
            result: normalizedResult,
          }),
        },
        renderLoopResult(normalizedResult),
      );
    },
  });

  pi.registerTool({
    name: "ralph_steer",
    label: "ralph_steer",
    description: "Queue durable steering that the managed Ralph loop will absorb at the next iteration boundary.",
    promptSnippet: "Use this to shape the next step of a ticket-bound Ralph run through durable operator guidance.",
    promptGuidelines: [
      "Queue steering whenever the bound ticket needs reprioritization, clarification, or a newly discovered constraint carried into the next iteration.",
      "Steering becomes part of durable loop state and is consumed at the next iteration boundary.",
    ],
    parameters: RalphSteerParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const run = await resolveTargetRalphRun(ctx, params.ticketRef, params.planRef);
      const updated = await getStore(ctx).queueSteeringAsync(run.state.runId, params.text);
      return machineResult({ run: updated.summary }, `Queued Ralph steering for ${updated.summary.id}.`);
    },
  });

  pi.registerTool({
    name: "ralph_stop",
    label: "ralph_stop",
    description:
      "Request a clean stop for the managed Ralph loop and optionally cancel the currently running background job.",
    promptSnippet:
      "Use this to bring a ticket-bound Ralph run to a controlled stopping point while preserving durable state and operator intent.",
    promptGuidelines: [
      "Provide `ticketRef` and add `planRef` when the ticket could resolve to more than one Ralph run.",
      "Use `cancelRunning` when the stop request should take effect at the current runtime cancellation point as well as the next loop boundary.",
    ],
    parameters: RalphStopParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await stopRalphLoop(
        ctx,
        params.ticketRef,
        params.planRef,
        params.summary,
        params.cancelRunning !== false,
      );
      return machineResult(
        { run: result.run.summary, cancelledJobIds: result.cancelledJobIds },
        result.cancelledJobIds.length > 0
          ? `Requested stop for Ralph loop ${result.run.summary.id} and cancelled jobs ${result.cancelledJobIds.join(", ")}.`
          : `Requested stop for Ralph loop ${result.run.summary.id}.`,
      );
    },
  });

  pi.registerTool({
    name: "ralph_job_read",
    label: "ralph_job_read",
    description: "Read the current status of a background Ralph loop job created by `ralph_run(background=true)`.",
    promptSnippet: "Use this to inspect the live execution envelope around a managed Ralph loop job.",
    promptGuidelines: [
      "Use the job id returned by `ralph_run(background=true)`.",
      "Pair this with `ralph_read` when you want both the job lifecycle snapshot and the durable loop state for the same workplan.",
    ],
    parameters: RalphJobReadParams,
    renderCall: (args, theme) => renderRalphJobCall("ralph_job_read", args as Record<string, unknown>, theme),
    renderResult: (result, options, theme) => renderRalphJobResult(result, options, theme),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const job = getWorkspaceJob(params.jobId, ctx.cwd);
      if (!job) {
        return machineResult({ job: null }, `Unknown Ralph job ${params.jobId} for workspace ${ctx.cwd}.`);
      }
      return machineResult({ job }, renderJobSummary(job));
    },
  });

  pi.registerTool({
    name: "ralph_job_wait",
    label: "ralph_job_wait",
    description:
      "Wait until a target Ralph background job changes state, then return the current job and run snapshots for the managed loop.",
    promptSnippet:
      "Use this when you want a blocking handoff point for long-running plan execution with a durable wait primitive around job state.",
    promptGuidelines: [
      "Pass specific job ids when you are following one plan loop or a known small batch of jobs.",
      "Leave `jobIds` unset to wait on the tracked Ralph jobs in the workspace; use `mode` to choose any-vs-all semantics.",
      "Use the returned run snapshots to decide whether the loop should keep advancing, absorb steering, or enter a review gate.",
    ],
    parameters: RalphJobWaitParams,
    renderCall: (args, theme) => renderRalphJobCall("ralph_job_wait", args as Record<string, unknown>, theme),
    renderResult: (result, options, theme) => renderRalphJobResult(result, options, theme),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const jobIds = normalizeWorkspaceJobIds(params.jobIds, ctx.cwd);
      if (jobIds.length === 0) {
        return machineResult(
          { jobs: [], runs: [] },
          "No matching Ralph background jobs are currently tracked in this workspace.",
        );
      }
      const jobs =
        params.mode === "all"
          ? await ralphJobManager.waitForJobs(jobIds, { timeoutMs: params.timeoutMs })
          : await ralphJobManager.waitForAnyJob({ jobIds, timeoutMs: params.timeoutMs });
      const runs = await Promise.all(
        Array.from(
          new Set(
            jobs
              .filter((job) => job.metadata?.cwd === ctx.cwd)
              .map((job) => JSON.stringify({ cwd: job.metadata?.cwd ?? "", runId: job.metadata?.runId ?? "" })),
          ),
        ).flatMap((key) => {
          const parsed = JSON.parse(key) as { cwd?: string; runId?: string };
          if (!parsed.cwd || !parsed.runId) {
            return [];
          }
          return [createRalphStore(parsed.cwd).readRunAsync(parsed.runId)];
        }),
      );
      return machineResult({ jobs, runs }, jobs.map((job) => renderJobSummary(job)).join("\n\n"));
    },
  });

  pi.registerTool({
    name: "ralph_job_cancel",
    label: "ralph_job_cancel",
    description:
      "Cancel a running Ralph background job by id while keeping the managed loop state available for inspection and follow-up control.",
    promptSnippet:
      "Use this to interrupt the current job envelope around a managed loop when operator control should return immediately.",
    promptGuidelines: [
      "Use the job id from `ralph_run`, `ralph_job_read`, or `ralph_job_wait`.",
      "Pair cancellation with `ralph_read` or `ralph_stop` when you want to inspect or reshape the loop after the interruption.",
    ],
    parameters: RalphJobCancelParams,
    renderCall: (args, theme) => renderRalphJobCall("ralph_job_cancel", args as Record<string, unknown>, theme),
    renderResult: (result, options, theme) => renderRalphJobResult(result, options, theme),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const job = getWorkspaceJob(params.jobId, ctx.cwd);
      if (!job) {
        return machineResult(
          { cancelled: false, job: null },
          `Unknown Ralph job ${params.jobId} for workspace ${ctx.cwd}.`,
        );
      }
      const cancelled = ralphJobManager.cancel(params.jobId);
      const updatedJob = getWorkspaceJob(params.jobId, ctx.cwd) ?? job;
      return machineResult(
        { cancelled, job: updatedJob },
        cancelled
          ? `Cancelled Ralph job ${params.jobId}.`
          : `Ralph job ${params.jobId} is not running or does not exist.`,
      );
    },
  });
}
