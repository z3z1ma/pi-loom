import type { ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { createConstitutionalStore } from "@pi-loom/pi-constitution/extensions/domain/store.js";
import { createPlanStore } from "@pi-loom/pi-plans/extensions/domain/store.js";
import { createSpecStore } from "@pi-loom/pi-specs/extensions/domain/store.js";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import type { RalphPacketContext, RalphReadResult, RalphRunScope, RalphRunStatus } from "./models.js";
import {
  buildParentSessionRuntimeEnv,
  type RalphExecutionResult,
  type RalphLaunchEvent,
  runRalphLaunch,
} from "./runtime.js";
import { createRalphStore } from "./store.js";

type RalphContextLike =
  | Pick<ExtensionContext, "cwd" | "model" | "sessionManager">
  | Pick<ExtensionCommandContext, "cwd" | "model" | "sessionManager">;

export interface ExecuteRalphLoopInput {
  ref?: string;
  prompt?: string;
  title?: string;
  iterations?: number;
  linkedRefs?: {
    roadmapItemIds?: string[];
    initiativeIds?: string[];
    researchIds?: string[];
    specChangeIds?: string[];
    ticketIds?: string[];
    critiqueIds?: string[];
    docIds?: string[];
    planIds?: string[];
  };
  scope?: {
    mode?: "plan" | "execute";
    specRef?: string;
    planRef?: string;
    ticketRef?: string;
    roadmapItemIds?: string[];
    initiativeIds?: string[];
    researchIds?: string[];
    critiqueIds?: string[];
    docIds?: string[];
  };
  policySnapshot?: {
    mode?: "strict" | "balanced" | "expedite";
    maxRuntimeMinutes?: number;
    tokenBudget?: number;
    verifierRequired?: boolean;
    critiqueRequired?: boolean;
    stopWhenVerified?: boolean;
    manualApprovalRequired?: boolean;
    allowOperatorPause?: boolean;
    notes?: string[];
  };
}

export interface RalphLoopStepResult {
  iterationId: string;
  iteration: number;
  exitCode: number;
  output: string;
  stderr: string;
  finalStatus: RalphRunStatus;
  finalDecision: string | null;
}

export interface ExecuteRalphLoopResult {
  run: RalphReadResult;
  created: boolean;
  steps: RalphLoopStepResult[];
}

export interface ExecuteRalphLoopOptions {
  onUpdate?: (text: string) => void;
  jobId?: string | null;
}

export interface EnsureRalphRunResult {
  run: RalphReadResult;
  created: boolean;
}

const inFlightLoopExecutions = new Set<string>();
const TIMEOUT_CHECKPOINT_GRACE_MS = 2_000;

function loopExecutionKey(cwd: string, runId: string): string {
  return `${cwd}::${runId}`;
}

export function isRalphLoopExecutionInFlight(cwd: string, runId: string): boolean {
  return inFlightLoopExecutions.has(loopExecutionKey(cwd, runId));
}

export function hasTrustedPostIteration(run: RalphReadResult, iterationId: string): boolean {
  const launchedIteration = run.iterations.find((iteration) => iteration.id === iterationId) ?? null;
  return launchedIteration !== null && launchedIteration.decision !== null;
}

function hasRunningLaunchEvent(run: RalphReadResult, iterationId: string): boolean {
  return run.runtimeArtifacts.some(
    (artifact) =>
      artifact.iterationId === iterationId &&
      artifact.events.some((event) => event.type === "launch_state" && event.state === "running"),
  );
}

function iterationExecuted(run: RalphReadResult, iterationId: string): boolean {
  return hasTrustedPostIteration(run, iterationId) || hasRunningLaunchEvent(run, iterationId);
}

export function hasDurableActiveLaunch(run: RalphReadResult): boolean {
  return run.state.nextLaunch.runtime === "session" && run.state.nextIterationId !== null;
}

export async function reserveDurableLaunch(
  ctx: RalphContextLike,
  input: ExecuteRalphLoopInput,
  run: RalphReadResult,
  created = false,
): Promise<RalphReadResult> {
  if (hasDurableActiveLaunch(run)) {
    throw new Error(
      `Ralph run ${run.state.runId} already has an active session launch for ${run.state.nextIterationId}.`,
    );
  }

  const store = createRalphStore(ctx.cwd);
  const refreshed = await store.updateRunAsync(run.state.runId, {
    packetContext: await buildPacketContext(
      ctx.cwd,
      run.state.scope,
      input.prompt,
      summarizePriorLearnings(run, run.state.scope),
    ),
  });
  const focus = input.prompt?.trim() || refreshed.state.objective;
  const instructions = created
    ? refreshed.state.nextLaunch.instructions
    : input.prompt?.trim()
      ? [`Primary objective for the next bounded iteration: ${input.prompt.trim()}`]
      : undefined;

  return refreshed.state.postIteration === null
    ? await store.prepareLaunchAsync(refreshed.state.runId, { focus, instructions, requireFresh: true })
    : await store.resumeRunAsync(refreshed.state.runId, { focus, instructions, requireFresh: true });
}

function isTerminalStatus(status: RalphRunStatus): boolean {
  return ["completed", "halted", "failed", "archived"].includes(status);
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

type RalphRunScopeInput = NonNullable<ExecuteRalphLoopInput["scope"]>;

function normalizeScopeInput(input: RalphRunScopeInput): RalphRunScopeInput {
  return {
    mode: input.mode === "plan" ? "plan" : "execute",
    specRef: input.specRef?.trim(),
    planRef: input.planRef?.trim(),
    ticketRef: input.ticketRef?.trim(),
    roadmapItemIds: input.roadmapItemIds?.map((value) => value.trim()).filter(Boolean),
    initiativeIds: input.initiativeIds?.map((value) => value.trim()).filter(Boolean),
    researchIds: input.researchIds?.map((value) => value.trim()).filter(Boolean),
    critiqueIds: input.critiqueIds?.map((value) => value.trim()).filter(Boolean),
    docIds: input.docIds?.map((value) => value.trim()).filter(Boolean),
  };
}

function assertValidScopeInput(scope: RalphRunScopeInput): asserts scope is RalphRunScopeInput & { specRef: string } {
  if (!scope.specRef) {
    throw new Error("specRef is required when creating a new Ralph run.");
  }
  if (scope.mode === "execute") {
    if (!scope.planRef) {
      throw new Error("planRef is required for execute-mode Ralph runs.");
    }
    if (!scope.ticketRef) {
      throw new Error("ticketRef is required for execute-mode Ralph runs.");
    }
  }
  if (scope.mode === "plan" && scope.ticketRef) {
    throw new Error("plan-mode Ralph runs must not declare an active ticket.");
  }
}

function toRunScope(scope: RalphRunScopeInput & { specRef: string }): RalphRunScope {
  return {
    mode: scope.mode ?? "execute",
    specChangeId: scope.specRef,
    planId: scope.planRef ?? null,
    ticketId: scope.mode === "execute" ? (scope.ticketRef ?? null) : null,
    roadmapItemIds: scope.roadmapItemIds ?? [],
    initiativeIds: scope.initiativeIds ?? [],
    researchIds: scope.researchIds ?? [],
    critiqueIds: scope.critiqueIds ?? [],
    docIds: scope.docIds ?? [],
  };
}

async function buildPacketContext(
  cwd: string,
  scope: RalphRunScope,
  steeringPrompt: string | undefined,
  priorIterationLearnings: string[],
): Promise<RalphPacketContext> {
  const constitution = await createConstitutionalStore(cwd)
    .readConstitution()
    .catch(() => null);
  const spec = await createSpecStore(cwd)
    .readChange(scope.specChangeId)
    .catch(() => null);
  const plan = scope.planId
    ? await createPlanStore(cwd)
        .readPlan(scope.planId)
        .catch(() => null)
    : null;
  const ticket = scope.ticketId
    ? await createTicketStore(cwd)
        .readTicketAsync(scope.ticketId)
        .catch(() => null)
    : null;

  const constitutionBrief = constitution
    ? truncate(
        [
          constitution.state.visionSummary,
          constitution.state.strategicDirectionSummary,
          ...constitution.state.currentFocus,
        ]
          .filter(Boolean)
          .join("\n"),
        2400,
      )
    : "No constitutional record resolved for this workspace.";
  const specContext = spec
    ? truncate(
        [
          `${spec.summary.id} [${spec.summary.status}] ${spec.state.title}`,
          spec.state.proposalSummary,
          spec.state.designNotes,
          ...spec.state.requirements
            .slice(0, 8)
            .map((requirement) => `${requirement.text} Acceptance: ${requirement.acceptance.join("; ")}`),
        ]
          .filter(Boolean)
          .join("\n\n"),
        5000,
      )
    : `Spec ${scope.specChangeId} could not be resolved from durable storage.`;
  const planContext = plan
    ? truncate(
        [
          `${plan.summary.id} [${plan.summary.status}] ${plan.state.title}`,
          plan.state.summary,
          plan.state.contextAndOrientation,
          plan.state.planOfWork,
          plan.state.concreteSteps,
          plan.state.validation,
          plan.state.linkedTickets
            .map((link) => `${link.ticketId}${link.role ? ` (${link.role})` : ""} @${link.order}`)
            .join("\n"),
        ]
          .filter(Boolean)
          .join("\n\n"),
        5000,
      )
    : null;
  const ticketContext = ticket
    ? truncate(
        [
          `${ticket.summary.id} [${ticket.summary.status}] ${ticket.summary.title}`,
          ticket.ticket.body.summary,
          ticket.ticket.body.context,
          ticket.ticket.body.plan,
          `Acceptance:\n${ticket.ticket.frontmatter.acceptance.map((line) => `- ${line}`).join("\n") || "- (none)"}`,
          ticket.ticket.body.verification,
        ]
          .filter(Boolean)
          .join("\n\n"),
        5000,
      )
    : null;

  return {
    capturedAt: new Date().toISOString(),
    constitutionBrief,
    specContext,
    planContext,
    ticketContext,
    priorIterationLearnings,
    operatorNotes: steeringPrompt?.trim() || null,
  };
}

function summarizePriorLearnings(run: RalphReadResult | null, scope: RalphRunScope): string[] {
  if (!run) {
    return [];
  }
  return run.iterations
    .filter((iteration) => iteration.scope.ticketId === scope.ticketId && iteration.scope.planId === scope.planId)
    .slice(-4)
    .flatMap((iteration) => {
      const lines = [
        iteration.summary ? `Iteration ${iteration.iteration}: ${iteration.summary}` : "",
        iteration.workerSummary ? `Worker: ${iteration.workerSummary}` : "",
        iteration.decision ? `Decision: ${iteration.decision.kind} — ${iteration.decision.summary}` : "",
        ...iteration.notes,
      ].filter(Boolean);
      return lines;
    })
    .map((line) => truncate(line, 240));
}

function deriveTitle(
  scope: RalphRunScope,
  specTitle: string,
  planTitle: string | null,
  ticketTitle: string | null,
): string {
  if (scope.mode === "plan") {
    return truncate(`Plan ${scope.specChangeId}: ${specTitle}`, 80);
  }
  return truncate(`${scope.ticketId ?? scope.specChangeId}: ${ticketTitle ?? planTitle ?? specTitle}`, 80);
}

function buildObjective(scope: RalphRunScope, steeringPrompt: string | undefined): string {
  const base =
    scope.mode === "plan"
      ? `Create or refine the Loom workplan for spec ${scope.specChangeId}${scope.planId ? ` using plan ${scope.planId}` : ""}.`
      : `Complete ticket ${scope.ticketId ?? "(unassigned)"} under plan ${scope.planId ?? "(none)"} for spec ${scope.specChangeId}.`;
  return steeringPrompt?.trim() ? `${base}\n\nOperator notes: ${steeringPrompt.trim()}` : base;
}

function buildSummary(scope: RalphRunScope, steeringPrompt: string | undefined): string {
  const base =
    scope.mode === "plan"
      ? `Ralph planning run anchored to spec ${scope.specChangeId}${scope.planId ? ` and plan ${scope.planId}` : ""}.`
      : `Ralph execution run for ticket ${scope.ticketId ?? "(unassigned)"} under plan ${scope.planId ?? "(none)"}.`;
  return truncate(steeringPrompt?.trim() ? `${base} ${steeringPrompt.trim()}` : base, 160);
}

function buildRunInstructions(scope: RalphRunScope, steeringPrompt: string | undefined): string[] {
  const instructions = [
    scope.mode === "plan"
      ? `Create or refine the plan for spec ${scope.specChangeId}.`
      : `Execute only ticket ${scope.ticketId ?? "(unassigned)"} under plan ${scope.planId ?? "(none)"} for spec ${scope.specChangeId}.`,
    "Perform one bounded Ralph iteration and persist a single durable checkpoint before exit.",
  ];
  if (steeringPrompt?.trim()) {
    instructions.push(`Operator notes: ${steeringPrompt.trim()}`);
  }
  return instructions;
}

function appendRuntimeOutput(current: string, next: string): string {
  const trimmed = next.trim();
  if (!trimmed) {
    return current;
  }
  return current ? `${current}\n\n${trimmed}` : trimmed;
}

function renderRuntimeEventUpdate(event: RalphLaunchEvent, iterationId: string): string | null {
  if (event.type === "assistant_message") {
    return null;
  }
  if (event.type === "launch_state") {
    return event.state === "queued"
      ? `Ralph iteration ${iterationId} is queued for session-runtime execution.`
      : `Ralph iteration ${iterationId} is running in a fresh session-runtime worker.`;
  }
  return event.phase === "start"
    ? `Ralph iteration ${iterationId} started tool ${event.toolName}.`
    : `Ralph iteration ${iterationId} finished tool ${event.toolName}${event.errorMessage ? ` with error: ${event.errorMessage}` : "."}`;
}

async function persistRuntimeFailure(
  cwd: string,
  ref: string,
  execution: RalphExecutionResult,
  iterationId: string,
  jobId?: string | null,
  decisionInput?: {
    timeoutExceeded?: boolean;
    queueTimeoutExceeded?: boolean;
    budgetExceeded?: boolean;
    runtimeUnavailable?: boolean;
  },
): Promise<RalphReadResult> {
  const store = createRalphStore(cwd);
  const timeoutExceeded = decisionInput?.timeoutExceeded === true;
  const queueTimeoutExceeded = decisionInput?.queueTimeoutExceeded === true;
  const budgetExceeded = decisionInput?.budgetExceeded === true;
  const runtimeUnavailable = decisionInput?.runtimeUnavailable === true;
  const summary = queueTimeoutExceeded
    ? "The Ralph run exceeded its allowed wait for the session runtime queue before a fresh worker started."
    : timeoutExceeded
      ? "The Ralph run exceeded its configured runtime limit before completing the bounded iteration."
      : runtimeUnavailable
        ? "The Ralph run could not verify runtime token usage for the configured token budget."
        : budgetExceeded
          ? "The Ralph run exceeded its configured token budget during the bounded iteration."
          : execution.stderr ||
            execution.output ||
            "Ralph session runtime exited unsuccessfully before finishing the iteration.";
  await store.upsertIterationRuntimeAsync(ref, {
    iterationId,
    status: execution.status === "cancelled" ? "cancelled" : "failed",
    completedAt: execution.completedAt,
    command: execution.command,
    args: execution.args,
    exitCode: execution.exitCode,
    output: execution.output,
    stderr: execution.stderr,
    usage: execution.usage,
    missingCheckpoint: true,
    jobId,
  });
  await store.appendIterationAsync(ref, {
    id: iterationId,
    status: execution.status === "cancelled" ? "cancelled" : "failed",
    summary,
    workerSummary: queueTimeoutExceeded
      ? "The bounded iteration never acquired the session-runtime launch slot before the configured queue wait limit elapsed."
      : timeoutExceeded
        ? "The session-backed launch was aborted after the configured runtime limit elapsed."
        : runtimeUnavailable
          ? "The bounded iteration finished without runtime token-usage metadata, so the configured budget could not be enforced truthfully."
          : budgetExceeded
            ? "The bounded iteration exhausted the configured token budget before a durable checkpoint was trusted."
            : execution.status === "cancelled"
              ? "The session-backed launch was cancelled before a durable Ralph checkpoint was written."
              : execution.exitCode === 0
                ? "The session-backed launch returned without durable Ralph iteration state."
                : `Session runtime exited with code ${execution.exitCode}.`,
    notes: [
      queueTimeoutExceeded
        ? "Session-backed launch exceeded the configured queue wait limit before a fresh worker started."
        : timeoutExceeded
          ? "Session-backed launch exceeded the configured runtime limit before leaving a durable post-iteration checkpoint."
          : runtimeUnavailable
            ? "Session-backed launch ended without runtime token-usage metadata required for truthful budget enforcement."
            : budgetExceeded
              ? "Session-backed launch exceeded the configured token budget before leaving a durable post-iteration checkpoint."
              : execution.status === "cancelled"
                ? "Session-backed launch was cancelled before leaving a durable post-iteration checkpoint."
                : "Session-backed launch exited without leaving a durable post-iteration checkpoint.",
    ],
  });
  let run = await store.decideRunAsync(ref, {
    operatorRequestedStop:
      execution.status === "cancelled" &&
      !timeoutExceeded &&
      !queueTimeoutExceeded &&
      !budgetExceeded &&
      !runtimeUnavailable,
    runtimeFailure:
      execution.status !== "cancelled" &&
      !timeoutExceeded &&
      !queueTimeoutExceeded &&
      !budgetExceeded &&
      !runtimeUnavailable,
    queueTimeoutExceeded,
    runtimeUnavailable,
    timeoutExceeded,
    budgetExceeded,
    summary,
    decidedBy:
      timeoutExceeded || budgetExceeded
        ? "policy"
        : runtimeUnavailable
          ? "runtime"
          : execution.status === "cancelled"
            ? "operator"
            : "runtime",
  });
  if (run.state.latestDecision) {
    run = await store.appendIterationAsync(ref, {
      id: iterationId,
      decision: run.state.latestDecision,
    });
  }
  return run;
}

function totalRuntimeTokens(run: RalphReadResult): number | null {
  let total = 0;
  for (const artifact of run.runtimeArtifacts) {
    if (artifact.usage.measured !== true) {
      return null;
    }
    total += artifact.usage.totalTokens || 0;
  }
  return total;
}

function buildTimeoutExecutionResult(run: RalphReadResult, timeoutMs: number): RalphExecutionResult {
  return {
    command: "session-runtime",
    args: [run.launch.runId, run.launch.iterationId, run.launch.resume ? "resume" : "launch"],
    exitCode: 1,
    output: "",
    stderr: `Timed out after ${timeoutMs}ms`,
    usage: { measured: false, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    status: "failed",
    events: [],
  };
}

function buildQueuedTimeoutExecutionResult(run: RalphReadResult, timeoutMs: number): RalphExecutionResult {
  return {
    command: "session-runtime",
    args: [run.launch.runId, run.launch.iterationId, run.launch.resume ? "resume" : "launch"],
    exitCode: 1,
    output: "",
    stderr: `Timed out waiting ${timeoutMs}ms for the Ralph session runtime queue`,
    usage: { measured: false, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    status: "failed",
    events: [],
  };
}

async function waitForTimeoutCheckpointGrace(): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => resolve(), TIMEOUT_CHECKPOINT_GRACE_MS);
    timer.unref?.();
  });
}

function createExecutionSignal(signal: AbortSignal | undefined): {
  signal: AbortSignal | undefined;
  timedOut: () => boolean;
  armTimeout: (timeoutMs: number | null) => void;
  timeoutPromise: Promise<void>;
  abort: (reason: unknown) => void;
  cleanup: () => void;
} {
  const combinedController = new AbortController();
  let timedOut = false;
  let timeoutTimer: NodeJS.Timeout | null = null;
  let resolveTimeout: (() => void) | null = null;
  const timeoutPromise = new Promise<void>((resolve) => {
    resolveTimeout = resolve;
  });

  const abortCombined = (reason: unknown) => {
    if (!combinedController.signal.aborted) {
      combinedController.abort(reason);
    }
  };
  const onSignalAbort = () => abortCombined(signal?.reason);

  if (signal?.aborted) {
    onSignalAbort();
  } else {
    signal?.addEventListener("abort", onSignalAbort, { once: true });
  }

  return {
    signal: combinedController.signal,
    timedOut: () => timedOut,
    armTimeout: (timeoutMs: number | null) => {
      if (timeoutTimer || !timeoutMs || timeoutMs <= 0) {
        return;
      }
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        abortCombined(new Error("Ralph runtime timeout exceeded"));
        resolveTimeout?.();
      }, timeoutMs);
      timeoutTimer.unref?.();
    },
    timeoutPromise,
    abort: abortCombined,
    cleanup: () => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
      }
      signal?.removeEventListener("abort", onSignalAbort);
    },
  };
}

async function executePreparedIteration(
  ctx: RalphContextLike,
  ref: string,
  signal: AbortSignal | undefined,
  run: RalphReadResult,
  options: ExecuteRalphLoopOptions,
): Promise<{ run: RalphReadResult; execution: RalphExecutionResult }> {
  const store = createRalphStore(ctx.cwd);
  const runtimeEnv = await buildParentSessionRuntimeEnv({
    cwd: ctx.cwd,
    model: ctx.model,
  });
  const timeoutMs =
    run.state.policySnapshot.maxRuntimeMinutes === null ? null : run.state.policySnapshot.maxRuntimeMinutes * 60 * 1000;
  const executionSignal = createExecutionSignal(signal);
  let queueTimeoutExceeded = false;
  let queueTimeoutTimer: NodeJS.Timeout | null = null;
  let streamedOutput = "";
  let latestRuntimeStatus: "queued" | "running" = "queued";

  const queueTimeoutPromise =
    timeoutMs && timeoutMs > 0
      ? new Promise<RalphExecutionResult>((resolve) => {
          queueTimeoutTimer = setTimeout(() => {
            queueTimeoutExceeded = true;
            executionSignal.abort(new Error("Ralph launch queue timeout exceeded"));
            resolve(buildQueuedTimeoutExecutionResult(run, timeoutMs));
          }, timeoutMs);
          queueTimeoutTimer.unref?.();
        })
      : null;

  await store.upsertIterationRuntimeAsync(ref, {
    iterationId: run.launch.iterationId,
    iteration: run.launch.iteration,
    status: "queued",
    startedAt: new Date().toISOString(),
    launch: run.launch,
    jobId: options.jobId,
  });

  const runtimePromise = runRalphLaunch(
    ctx.cwd,
    run.launch,
    executionSignal.signal,
    async (text) => {
      if (executionSignal.timedOut()) {
        return;
      }
      streamedOutput = appendRuntimeOutput(streamedOutput, text);
      options.onUpdate?.(text);
      await store.upsertIterationRuntimeAsync(ref, {
        iterationId: run.launch.iterationId,
        iteration: run.launch.iteration,
        status: latestRuntimeStatus,
        output: streamedOutput,
        launch: run.launch,
        jobId: options.jobId,
      });
    },
    runtimeEnv,
    async (event) => {
      if (executionSignal.signal?.aborted) {
        return;
      }
      if (event.type === "launch_state") {
        latestRuntimeStatus = event.state;
        if (event.state === "running") {
          if (queueTimeoutTimer) {
            clearTimeout(queueTimeoutTimer);
            queueTimeoutTimer = null;
          }
          executionSignal.armTimeout(timeoutMs);
        }
      }
      const updateText = renderRuntimeEventUpdate(event, run.launch.iterationId);
      if (updateText) {
        options.onUpdate?.(updateText);
      }
      await store.upsertIterationRuntimeAsync(ref, {
        iterationId: run.launch.iterationId,
        iteration: run.launch.iteration,
        status: event.type === "launch_state" ? event.state : latestRuntimeStatus,
        output: streamedOutput,
        events: [event],
        launch: run.launch,
        jobId: options.jobId,
      });
    },
  );
  const execution = await Promise.race([
    runtimePromise,
    ...(queueTimeoutPromise ? [queueTimeoutPromise] : []),
    executionSignal.timeoutPromise.then(() => buildTimeoutExecutionResult(run, timeoutMs ?? 0)),
  ]);
  if (queueTimeoutTimer) {
    clearTimeout(queueTimeoutTimer);
  }
  executionSignal.cleanup();
  const timeoutExceeded = executionSignal.timedOut();
  const normalizedExecution =
    timeoutExceeded && execution.status === "cancelled"
      ? {
          ...execution,
          status: "failed" as const,
          stderr: execution.stderr === "Aborted" ? "Timed out" : execution.stderr || "Timed out",
        }
      : execution;

  await store.upsertIterationRuntimeAsync(ref, {
    iterationId: run.launch.iterationId,
    iteration: run.launch.iteration,
    status:
      normalizedExecution.status === "completed"
        ? "completed"
        : normalizedExecution.status === "cancelled"
          ? "cancelled"
          : "failed",
    completedAt: normalizedExecution.completedAt,
    command: normalizedExecution.command,
    args: normalizedExecution.args,
    exitCode: normalizedExecution.exitCode,
    output: normalizedExecution.output || streamedOutput,
    stderr: normalizedExecution.stderr,
    usage: normalizedExecution.usage,
    launch: run.launch,
    jobId: options.jobId,
  });

  if (timeoutExceeded) {
    await waitForTimeoutCheckpointGrace();
  }

  let updated = await store.readRunAsync(ref);
  const hasDurableCheckpoint = hasTrustedPostIteration(updated, run.launch.iterationId);
  const totalTokens = totalRuntimeTokens(updated);
  const budgetLimit = updated.state.policySnapshot.tokenBudget;
  const requiresBudgetEvidence = budgetLimit !== null;
  const launchStarted = hasRunningLaunchEvent(updated, run.launch.iterationId);
  const missingBudgetEvidence = requiresBudgetEvidence && totalTokens === null && launchStarted;
  const budgetExceeded = requiresBudgetEvidence && totalTokens !== null && totalTokens > budgetLimit;

  if (!hasDurableCheckpoint) {
    updated = await persistRuntimeFailure(ctx.cwd, ref, normalizedExecution, run.launch.iterationId, options.jobId, {
      timeoutExceeded,
      queueTimeoutExceeded,
      budgetExceeded,
      runtimeUnavailable: missingBudgetEvidence,
    });
  } else if (timeoutExceeded || budgetExceeded || missingBudgetEvidence || queueTimeoutExceeded) {
    updated = await store.decideRunAsync(ref, {
      queueTimeoutExceeded,
      timeoutExceeded,
      budgetExceeded,
      runtimeUnavailable: missingBudgetEvidence,
      summary: queueTimeoutExceeded
        ? "The Ralph run exceeded its allowed wait for the session runtime queue before a fresh worker started."
        : timeoutExceeded
          ? "The Ralph run exceeded its configured runtime limit."
          : missingBudgetEvidence
            ? "The Ralph run requires runtime token-usage evidence to enforce its configured token budget."
            : "The Ralph run exceeded its configured token budget.",
      decidedBy: missingBudgetEvidence ? "runtime" : "policy",
    });
    if (updated.state.latestDecision) {
      updated = await store.appendIterationAsync(ref, {
        id: run.launch.iterationId,
        decision: updated.state.latestDecision,
        notes: [
          timeoutExceeded
            ? "Policy halted the run because the bounded iteration exceeded the configured runtime limit."
            : queueTimeoutExceeded
              ? "The session runtime queue wait exceeded the configured limit before a fresh worker began running."
              : missingBudgetEvidence
                ? "Runtime token usage metadata was unavailable, so the configured token budget could not be enforced truthfully."
                : "Policy halted the run because the bounded iteration exceeded the configured token budget.",
        ],
      });
    }
  }

  return { run: updated, execution: normalizedExecution };
}

export async function ensureRalphRun(
  ctx: RalphContextLike,
  input: ExecuteRalphLoopInput,
): Promise<EnsureRalphRunResult> {
  const store = createRalphStore(ctx.cwd);
  if (input.ref) {
    return { run: await store.readRunAsync(input.ref), created: false };
  }
  if (!input.scope) {
    throw new Error("scope is required when creating a new Ralph run");
  }
  const normalizedScopeInput = normalizeScopeInput(input.scope);
  assertValidScopeInput(normalizedScopeInput);
  const scope = toRunScope(normalizedScopeInput);
  const spec = await createSpecStore(ctx.cwd).readChange(scope.specChangeId);
  const plan = scope.planId ? await createPlanStore(ctx.cwd).readPlan(scope.planId) : null;
  const ticket = scope.ticketId ? await createTicketStore(ctx.cwd).readTicketAsync(scope.ticketId) : null;
  const packetContext = await buildPacketContext(ctx.cwd, scope, input.prompt, []);
  const created = await store.createRunAsync({
    title: deriveTitle(scope, spec.state.title, plan?.state.title ?? null, ticket?.summary.title ?? null),
    objective: buildObjective(scope, input.prompt),
    summary: buildSummary(scope, input.prompt),
    scope,
    packetContext,
    policySnapshot: input.policySnapshot,
    launchInstructions: buildRunInstructions(scope, input.prompt),
  });
  return { run: created, created: true };
}

export async function executeRalphLoop(
  ctx: RalphContextLike,
  input: ExecuteRalphLoopInput,
  signal?: AbortSignal,
  options: ExecuteRalphLoopOptions = {},
): Promise<ExecuteRalphLoopResult> {
  const ensured = await ensureRalphRun(ctx, input);
  let run = ensured.run;
  const steps: RalphLoopStepResult[] = [];
  const executionKey = loopExecutionKey(ctx.cwd, run.state.runId);
  if (inFlightLoopExecutions.has(executionKey)) {
    throw new Error(`Ralph run ${run.state.runId} already has an in-flight loop execution in workspace ${ctx.cwd}.`);
  }
  inFlightLoopExecutions.add(executionKey);

  try {
    if (!isTerminalStatus(run.state.status) && run.state.waitingFor === "none") {
      const launch = hasDurableActiveLaunch(run) ? run : await reserveDurableLaunch(ctx, input, run, ensured.created);
      const executed = await executePreparedIteration(ctx, run.state.runId, signal, launch, options);
      run = executed.run;
      if (iterationExecuted(run, launch.launch.iterationId)) {
        steps.push({
          iterationId: launch.launch.iterationId,
          iteration: launch.launch.iteration,
          exitCode: executed.execution.exitCode,
          output: executed.execution.output,
          stderr: executed.execution.stderr,
          finalStatus: run.state.status,
          finalDecision: run.state.latestDecision?.kind ?? null,
        });
      }
    }

    return { run, created: ensured.created, steps };
  } finally {
    inFlightLoopExecutions.delete(executionKey);
  }
}

export function renderLoopResult(result: ExecuteRalphLoopResult): string {
  const latest = result.run;
  const summary = [
    `${latest.summary.id} [${latest.summary.status}/${latest.summary.phase}] ${latest.summary.title}`,
    `Iterations executed this call: ${result.steps.length}`,
    `Latest decision: ${latest.state.latestDecision?.kind ?? "none"}`,
    `Waiting for: ${latest.state.waitingFor}`,
    `Post-iteration checkpoint: ${latest.state.postIteration ? `${latest.state.postIteration.iteration} [${latest.state.postIteration.status}]` : "none"}`,
    `Latest runtime: ${latest.runtimeArtifacts.at(-1) ? `${latest.runtimeArtifacts.at(-1)?.iteration} [${latest.runtimeArtifacts.at(-1)?.status}]` : "none"}`,
  ];

  const lastStep = result.steps.at(-1);
  if (lastStep) {
    summary.push(`Last session runtime exit code: ${lastStep.exitCode}`);
    if (lastStep.output) {
      summary.push("", "Latest output:", lastStep.output);
    } else if (lastStep.stderr) {
      summary.push("", "Latest output:", lastStep.stderr);
    }
  } else {
    summary.push("", "No bounded iteration was executed in this call.");
  }

  return summary.join("\n");
}
