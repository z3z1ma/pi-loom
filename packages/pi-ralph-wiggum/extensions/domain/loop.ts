import type { ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { RalphReadResult, RalphRunStatus } from "./models.js";
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
  policySnapshot?: {
    mode?: "strict" | "balanced" | "expedite";
    maxIterations?: number;
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
  const focus = input.prompt?.trim() || run.state.objective;
  const instructions = created
    ? run.state.nextLaunch.instructions
    : input.prompt?.trim()
      ? [`Primary objective for the next bounded iteration: ${input.prompt.trim()}`]
      : undefined;

  return run.state.postIteration === null
    ? await store.prepareLaunchAsync(run.state.runId, { focus, instructions, requireFresh: true })
    : await store.resumeRunAsync(run.state.runId, { focus, instructions, requireFresh: true });
}

function isTerminalStatus(status: RalphRunStatus): boolean {
  return ["completed", "halted", "failed", "archived"].includes(status);
}

function shouldContinue(run: RalphReadResult): boolean {
  return (
    run.state.latestDecision?.kind === "continue" &&
    run.state.waitingFor === "none" &&
    !isTerminalStatus(run.state.status)
  );
}

function normalizeLoopCount(value: number | undefined): number {
  if (!Number.isFinite(value) || !value || value < 1) {
    return 1;
  }
  return Math.min(10, Math.floor(value));
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function extractText(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .flatMap((part) => {
      if (typeof part === "string") {
        return [part];
      }
      if (!part || typeof part !== "object") {
        return [];
      }
      const candidate = part as { type?: unknown; text?: unknown };
      if (candidate.type === "text" && typeof candidate.text === "string") {
        return [candidate.text];
      }
      return [];
    })
    .join("\n")
    .trim();
}

function buildConversationContext(ctx: RalphContextLike): string {
  const branch = (ctx.sessionManager?.getBranch?.() ?? []) as Array<{
    type?: string;
    message?: { role?: string; content?: unknown };
  }>;
  const messages = branch
    .filter((entry) => entry.type === "message" && entry.message)
    .map((entry) => entry.message)
    .filter((message): message is { role?: string; content?: unknown } => Boolean(message))
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-6)
    .map((message) => {
      const text = extractText(message.content);
      if (!text) {
        return "";
      }
      return `${message.role}: ${text}`;
    })
    .filter(Boolean);

  return truncate(messages.join("\n\n"), 4000);
}

function deriveTitle(prompt: string, override?: string): string {
  const candidate = (override?.trim() || prompt.trim()).replace(/\s+/g, " ");
  return truncate(candidate, 80) || "Ralph loop";
}

function buildObjective(prompt: string, conversationContext: string): string {
  if (!conversationContext) {
    return prompt.trim();
  }
  return [`Operator prompt:`, prompt.trim(), `Current session context:`, conversationContext].join("\n\n");
}

function buildSummary(prompt: string, conversationContext: string): string {
  const base = conversationContext
    ? `Run derived from the current session context and prompt: ${prompt.trim()}`
    : prompt.trim();
  return truncate(base, 120);
}

function buildInstructions(prompt: string | undefined, conversationContext: string): string[] | undefined {
  const instructions: string[] = [];
  if (prompt?.trim()) {
    instructions.push(`Primary objective for the next bounded iteration: ${prompt.trim()}`);
  }
  if (conversationContext) {
    instructions.push(`Current session context:\n${conversationContext}`);
  }
  return instructions.length > 0 ? instructions : undefined;
}

function buildSteeringInstructions(prompt: string | undefined): string[] | undefined {
  const trimmed = prompt?.trim();
  return trimmed ? [`Primary objective for the next bounded iteration: ${trimmed}`] : undefined;
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
  if (!input.prompt?.trim()) {
    throw new Error("prompt is required when creating a new Ralph run");
  }
  const conversationContext = buildConversationContext(ctx);
  const created = await store.createRunAsync({
    title: deriveTitle(input.prompt, input.title),
    objective: buildObjective(input.prompt, conversationContext),
    summary: buildSummary(input.prompt, conversationContext),
    linkedRefs: input.linkedRefs,
    policySnapshot: input.policySnapshot,
    launchInstructions: buildInstructions(input.prompt, conversationContext),
  });
  return { run: created, created: true };
}

export async function executeRalphLoop(
  ctx: RalphContextLike,
  input: ExecuteRalphLoopInput,
  signal?: AbortSignal,
  options: ExecuteRalphLoopOptions = {},
): Promise<ExecuteRalphLoopResult> {
  const store = createRalphStore(ctx.cwd);
  const loopCount = normalizeLoopCount(input.iterations);
  const ensured = await ensureRalphRun(ctx, input);
  let run = ensured.run;
  const steeringInstructions = ensured.created ? undefined : buildSteeringInstructions(input.prompt);
  const steps: RalphLoopStepResult[] = [];
  const executionKey = loopExecutionKey(ctx.cwd, run.state.runId);
  if (inFlightLoopExecutions.has(executionKey)) {
    throw new Error(`Ralph run ${run.state.runId} already has an in-flight loop execution in workspace ${ctx.cwd}.`);
  }
  inFlightLoopExecutions.add(executionKey);

  try {
    for (let stepIndex = 0; stepIndex < loopCount; stepIndex += 1) {
      if (isTerminalStatus(run.state.status) || run.state.waitingFor !== "none") {
        break;
      }

      const launch = hasDurableActiveLaunch(run)
        ? run
        : run.state.postIteration === null
          ? await store.prepareLaunchAsync(run.state.runId, {
              focus: input.prompt?.trim() || run.state.objective,
              instructions: stepIndex === 0 ? steeringInstructions : undefined,
            })
          : await store.resumeRunAsync(run.state.runId, {
              focus: stepIndex === 0 ? input.prompt?.trim() || run.state.objective : undefined,
              instructions: stepIndex === 0 ? steeringInstructions : undefined,
            });

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

      if (!shouldContinue(run)) {
        break;
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
