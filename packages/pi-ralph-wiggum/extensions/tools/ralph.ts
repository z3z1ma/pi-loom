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
  hasDurableActiveLaunch,
  isRalphLoopExecutionInFlight,
  renderLoopResult,
  reserveDurableLaunch,
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
  background: Type.Optional(Type.Boolean()),
  linkedRefs: Type.Optional(LinkedRefsSchema),
  policySnapshot: Type.Optional(PolicySnapshotSchema),
});

const RalphJobReadParams = Type.Object({
  jobId: Type.String(),
});

const RalphJobCancelParams = Type.Object({
  jobId: Type.String(),
});

const RalphJobWaitParams = Type.Object({
  jobIds: Type.Optional(Type.Array(Type.String())),
  timeoutMs: Type.Optional(Type.Number()),
});

const RalphCheckpointParams = Type.Object({
  ref: Type.String(),
  iterationId: Type.String({
    description:
      "Explicit launched iteration id from the Ralph launch packet. Reuse this exact id if you update the same bounded iteration checkpoint again.",
  }),
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

function assertNoRunningRunJob(runId: string, cwd: string): void {
  const runningJob = getRunJobs(runId, cwd).find((job) => job.status === "running");
  if (runningJob) {
    throw new Error(
      `Ralph run ${runId} already has running background job ${runningJob.id}; wait for it to finish or cancel it before launching again.`,
    );
  }
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

async function rollbackReservedLaunch(
  ctx: ExtensionContext,
  reserved: RalphReadResult,
  previousState: RalphReadResult["state"],
  summary: string,
): Promise<void> {
  const store = getStore(ctx);
  const current = await store.readRunAsync(reserved.state.runId);
  if (current.state.nextIterationId !== reserved.launch.iterationId || current.state.nextLaunch.runtime !== "session") {
    return;
  }
  await store.cancelLaunchAsync(reserved.state.runId, previousState, reserved.launch.iterationId, summary);
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
      "Read Ralph state, packet, dashboard, or rendered run artifacts from durable Loom orchestration memory.",
    promptSnippet: "Read the Ralph packet or run state before deciding whether to launch another bounded iteration.",
    promptGuidelines: [
      "Read packet mode when preparing a fresh Ralph worker context.",
      "Read dashboard mode for a concise between-iteration view of state, blockers, and latest decisions.",
      "Read full mode when you need the latest iterations, launch descriptor, and dashboard together.",
    ],
    parameters: RalphReadParams,
    renderCall: (args, theme) => renderRalphReadCall(args as Record<string, unknown>, theme),
    renderResult: (result, options, theme) => renderRalphReadResult(result, options, theme),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await getStore(ctx).readRunAsync(params.ref);
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
      "Persist one bounded Ralph iteration checkpoint for an explicit launched iteration id, including verifier evidence, critique links, and an explicit continuation decision, in a single safe tool call.",
    promptSnippet:
      "Use one Ralph checkpoint call per bounded iteration with the explicit launched iterationId so the durable state stays coherent and the next caller can inspect a complete outcome.",
    promptGuidelines: [
      "This is the safe way for a fresh Ralph worker session to commit its bounded iteration outcome for the launched iteration id.",
      "Always pass the explicit `iterationId` from the launch packet; repeated updates for the same bounded iteration must reuse that same id.",
      "Only checkpoint the currently launched iteration or the latest un-relaunched post-iteration record; older iteration ids are rejected.",
      "Always provide an explicit `decisionInput`; a clean exit without a durable checkpoint and decision is treated as failure.",
      "Prefer this tool over piecemeal low-level writes so verifier, critique, iteration, and decision state stay in sync.",
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
      "Create or continue a Ralph run, execute up to N bounded fresh-context session-runtime iterations under the hood, and return the resulting durable state for the next caller to inspect. It can also launch the work in background and hand back a cancellable Ralph job id.",
    promptSnippet:
      "Use this as the primary Ralph loop tool: it handles the create or resume, one-bounded-iteration session-runtime execution, durable-state inspection, and repeat logic for you.",
    promptGuidelines: [
      "For a new loop, provide a prompt and optional iteration count; the run will be initialized from the prompt plus current conversation context.",
      "For an existing loop, provide `ref` and optionally a steering prompt; the current conversation transcript is not implicitly injected into the durable resume.",
      "Set `background: true` when the bounded iteration may take a while and you want a Ralph job id you can inspect, wait on, or cancel later.",
      "This tool intentionally executes bounded session-runtime iterations; it does not keep a hidden long-running transcript alive.",
    ],
    parameters: RalphRunParams,
    renderCall: (args, theme) => renderRalphRunCall(args as Record<string, unknown>, theme),
    renderResult: (result, options, theme) => renderRalphRunResult(result, options, theme),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const input: ExecuteRalphLoopInput = {
        ref: params.ref,
        prompt: params.prompt,
        title: params.title,
        iterations: params.iterations,
        linkedRefs: params.linkedRefs as ExecuteRalphLoopInput["linkedRefs"],
        policySnapshot: params.policySnapshot as ExecuteRalphLoopInput["policySnapshot"],
      };
      const startedAt = Date.now();
      const progressUpdates: string[] = [];
      const ensured = await ensureRalphRun(ctx, input);
      assertNoRunningRunJob(ensured.run.state.runId, ctx.cwd);
      if (isRalphLoopExecutionInFlight(ctx.cwd, ensured.run.state.runId)) {
        throw new Error(
          `Ralph run ${ensured.run.state.runId} already has an in-flight loop execution in workspace ${ctx.cwd}.`,
        );
      }
      const hasPreparedLaunch = hasDurableActiveLaunch(ensured.run);
      let reservedWasFresh = false;
      const reserved =
        input.ref && hasPreparedLaunch
          ? params.prompt
            ? ensured.run.state.nextLaunch.resume
              ? await getStore(ctx).resumeRunAsync(ensured.run.state.runId, {
                  focus: params.prompt,
                  instructions: [`Primary objective for the next bounded iteration: ${params.prompt}`],
                })
              : await getStore(ctx).prepareLaunchAsync(ensured.run.state.runId, {
                  focus: params.prompt,
                  instructions: [`Primary objective for the next bounded iteration: ${params.prompt}`],
                })
            : ensured.run
          : await reserveDurableLaunch(ctx, input, ensured.run, ensured.created);
      reservedWasFresh = !(input.ref && hasPreparedLaunch);

      if (params.background === true) {
        let jobId: string;
        try {
          jobId = ralphJobManager.register(
            "ralph_run",
            `Ralph run ${reserved.state.runId}`,
            async ({ jobId: runningJobId, signal: jobSignal, reportProgress }) => {
              await reportProgress(`Starting background Ralph run ${reserved.state.runId}.`, {
                jobId: runningJobId,
                runId: reserved.state.runId,
              });
              try {
                return await executeRalphLoop(ctx, { ...input, ref: reserved.state.runId }, jobSignal, {
                  jobId: runningJobId,
                  onUpdate: async (text) => {
                    progressUpdates.push(text);
                    await reportProgress(text, { jobId: runningJobId, runId: reserved.state.runId });
                  },
                });
              } catch (error) {
                if (reservedWasFresh) {
                  await rollbackReservedLaunch(
                    ctx,
                    reserved,
                    ensured.run.state,
                    "Background Ralph launch failed before a worker session started.",
                  );
                }
                throw error;
              }
            },
            {
              metadata: { runId: reserved.state.runId, cwd: ctx.cwd },
              onProgress: async (text, details) => {
                progressUpdates.push(text);
                onUpdate?.({
                  content: [{ type: "text", text }],
                  details: {
                    async: {
                      state: "running",
                      jobId: typeof details?.jobId === "string" ? details.jobId : null,
                      runId: reserved.state.runId,
                      type: "ralph_run",
                    },
                    run: reserved.summary,
                    ui: buildRalphRunRenderDetails({
                      prompt: params.prompt,
                      startedAt,
                      created: ensured.created,
                      updates: progressUpdates.slice(-8),
                      run: reserved.summary,
                      state: "background",
                      result: null,
                      asyncState: {
                        state: "running",
                        jobId: typeof details?.jobId === "string" ? details.jobId : null,
                        runId: reserved.state.runId,
                        type: "ralph_run",
                      },
                    }),
                  },
                });
              },
            },
          );
        } catch (error) {
          if (reservedWasFresh) {
            await getStore(ctx).cancelLaunchAsync(
              reserved.state.runId,
              ensured.run.state,
              reserved.launch.iterationId,
              "Background Ralph launch registration failed before a worker session started.",
            );
          }
          throw error;
        }
        const job = ralphJobManager.getJob(jobId);
        return machineResult(
          {
            async: { state: "running", jobId, runId: reserved.state.runId, type: "ralph_run" },
            run: reserved.summary,
            job,
            ui: buildRalphRunRenderDetails({
              prompt: params.prompt,
              startedAt,
              created: ensured.created,
              updates: progressUpdates,
              run: reserved.summary,
              state: "background",
              result: null,
              asyncState: { state: "running", jobId, runId: reserved.state.runId, type: "ralph_run" },
            }),
          },
          `Started background Ralph run ${reserved.state.runId} as job ${jobId}. Use ralph_job_read, ralph_job_wait, or ralph_job_cancel to manage it.`,
        );
      }

      let result: ExecuteRalphLoopResult;
      try {
        result = await executeRalphLoop(ctx, { ...input, ref: reserved.state.runId }, signal, {
          onUpdate: (text) => {
            progressUpdates.push(text);
            onUpdate?.({
              content: [{ type: "text", text }],
              details: {
                runRef: reserved.state.runId,
                ui: buildRalphRunRenderDetails({
                  prompt: params.prompt,
                  startedAt,
                  created: ensured.created,
                  updates: progressUpdates.slice(-8),
                  run: reserved.summary,
                  state: "running",
                  result: null,
                }),
              },
            });
          },
        });
      } catch (error) {
        if (reservedWasFresh) {
          await rollbackReservedLaunch(
            ctx,
            reserved,
            ensured.run.state,
            "Foreground Ralph launch failed before a worker session started.",
          );
        }
        throw error;
      }
      const normalizedResult = ensured.created ? { ...result, created: true } : result;
      return machineResult(
        {
          result: normalizedResult,
          ui: buildRalphRunRenderDetails({
            prompt: params.prompt,
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
    name: "ralph_job_read",
    label: "ralph_job_read",
    description: "Read the current status of a background Ralph run job created by ralph_run(background=true).",
    promptSnippet: "Use this to inspect an active or completed Ralph background job by id.",
    promptGuidelines: [
      "Use the job id returned by ralph_run with background=true.",
      "Read the linked Ralph run separately if you need the durable orchestration state as well as the job lifecycle snapshot.",
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
      "Wait until at least one target Ralph background job finishes, fails, or is cancelled, then return the current job and run snapshots.",
    promptSnippet:
      "Use this instead of polling when you need to block until a Ralph background job changes out of running state.",
    promptGuidelines: [
      "Pass specific job ids when you only care about a known Ralph background job or small batch.",
      "Leave jobIds unset to wait for any tracked Ralph background job.",
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
      const jobs = await ralphJobManager.waitForAnyJob({ jobIds, timeoutMs: params.timeoutMs });
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
    description: "Cancel a running Ralph background job by id.",
    promptSnippet: "Use this when a background Ralph iteration is no longer needed or is stuck.",
    promptGuidelines: [
      "Cancel only jobs you intentionally want to stop; the underlying Ralph run will record a durable cancelled/failure outcome if the worker never checkpoints.",
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
