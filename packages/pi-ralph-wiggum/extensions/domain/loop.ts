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
  planRef?: string;
  prompt?: string;
  iterations?: number;
  policySnapshot?: {
    mode?: "strict" | "balanced" | "expedite";
    maxRuntimeMinutes?: number;
    maxIterations?: number;
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

interface ManagedPlanSnapshot {
  planId: string;
  planTitle: string;
  specChangeId: string | null;
  roadmapItemIds: string[];
  initiativeIds: string[];
  researchIds: string[];
  critiqueIds: string[];
  docIds: string[];
  orderedTicketIds: string[];
  openTicketIds: string[];
  readyTicketIds: string[];
  blockedTicketIds: string[];
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

export async function findActiveRalphRun(cwd: string): Promise<RalphReadResult | null> {
  const runs = await createRalphStore(cwd).listRunsAsync({});
  const current = [...runs]
    .filter((run) => !isTerminalStatus(run.status) && run.status !== "archived")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  if (!current) {
    return null;
  }
  return createRalphStore(cwd).readRunAsync(current.id);
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
  const steeringText = pendingSteeringText(run) ?? input.prompt;
  const refreshed = await store.updateRunAsync(run.state.runId, {
    packetContext: await buildPacketContext(
      ctx.cwd,
      run.state.scope,
      steeringText,
      summarizePriorLearnings(run, run.state.scope),
    ),
  });
  const focus = steeringText?.trim() || refreshed.state.objective;
  const instructions = created
    ? refreshed.state.nextLaunch.instructions
    : steeringText?.trim()
      ? [`Primary objective for the next bounded iteration: ${steeringText.trim()}`]
      : undefined;

  const reserved =
    refreshed.state.postIteration === null
      ? await store.prepareLaunchAsync(refreshed.state.runId, { focus, instructions, requireFresh: true })
      : await store.resumeRunAsync(refreshed.state.runId, { focus, instructions, requireFresh: true });

  return steeringText?.trim()
    ? await store.consumeQueuedSteeringAsync(reserved.state.runId, reserved.launch.iterationId)
    : reserved;
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

async function readManagedPlanSnapshot(cwd: string, planRef: string): Promise<ManagedPlanSnapshot> {
  const plan = await createPlanStore(cwd).readPlan(planRef);
  const tickets = await createTicketStore(cwd).listTicketsAsync({ includeClosed: true });
  const graph = await createTicketStore(cwd).graphAsync();
  const planTicketIds = plan.state.linkedTickets.map((link) => link.ticketId);
  const linkedTickets = tickets.filter((ticket) => planTicketIds.includes(ticket.id));
  const openTicketIds = linkedTickets.filter((ticket) => !ticket.closed).map((ticket) => ticket.id);
  const readyTicketIds = graph.ready.filter((ticketId) => openTicketIds.includes(ticketId));
  const blockedTicketIds = graph.blocked.filter((ticketId) => openTicketIds.includes(ticketId));
  const specChangeId =
    plan.state.sourceTarget.kind === "spec"
      ? plan.state.sourceTarget.ref
      : (plan.state.contextRefs.specChangeIds[0] ?? null);
  return {
    planId: plan.state.planId,
    planTitle: plan.state.title,
    specChangeId,
    roadmapItemIds: plan.state.contextRefs.roadmapItemIds,
    initiativeIds: plan.state.contextRefs.initiativeIds,
    researchIds: plan.state.contextRefs.researchIds,
    critiqueIds: plan.state.contextRefs.critiqueIds,
    docIds: plan.state.contextRefs.docIds,
    orderedTicketIds: planTicketIds,
    openTicketIds,
    readyTicketIds,
    blockedTicketIds,
  };
}

function toManagedRunScope(snapshot: ManagedPlanSnapshot, ticketId: string | null = null): RalphRunScope {
  return {
    mode: "execute",
    specChangeId: snapshot.specChangeId,
    planId: snapshot.planId,
    ticketId,
    roadmapItemIds: snapshot.roadmapItemIds,
    initiativeIds: snapshot.initiativeIds,
    researchIds: snapshot.researchIds,
    critiqueIds: snapshot.critiqueIds,
    docIds: snapshot.docIds,
  };
}

function pendingSteeringText(run: RalphReadResult): string | undefined {
  const pending = run.state.steeringQueue.filter((entry) => entry.consumedAt === null);
  if (pending.length === 0) {
    return undefined;
  }
  return pending.map((entry) => entry.text).join("\n\n");
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
    .readChange(scope.specChangeId ?? "")
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
    : scope.specChangeId
      ? `Spec ${scope.specChangeId} could not be resolved from durable storage.`
      : null;
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

function selectNextTicket(snapshot: ManagedPlanSnapshot): string | null {
  if (snapshot.readyTicketIds.length > 0) {
    return snapshot.orderedTicketIds.find((ticketId) => snapshot.readyTicketIds.includes(ticketId)) ?? null;
  }
  if (snapshot.openTicketIds.length > 0) {
    return snapshot.orderedTicketIds.find((ticketId) => snapshot.openTicketIds.includes(ticketId)) ?? null;
  }
  return null;
}

function formatBlockingSummary(snapshot: ManagedPlanSnapshot): string {
  if (snapshot.blockedTicketIds.length === 0) {
    return `Plan ${snapshot.planId} has no runnable open tickets.`;
  }
  return `Plan ${snapshot.planId} is blocked on tickets: ${snapshot.blockedTicketIds.join(", ")}.`;
}

function deriveTitle(
  scope: RalphRunScope,
  _specTitle: string | null,
  planTitle: string | null,
  _ticketTitle: string | null,
): string {
  return truncate(`Ralph ${scope.planId ?? "(unscoped-plan)"}: ${planTitle ?? "Managed loop"}`, 80);
}

function buildObjective(scope: RalphRunScope, steeringPrompt: string | undefined): string {
  const base = `Complete all in-scope tickets for plan ${scope.planId ?? "(none)"}${scope.specChangeId ? ` under governing spec ${scope.specChangeId}` : ""}.`;
  return steeringPrompt?.trim() ? `${base}\n\nOperator notes: ${steeringPrompt.trim()}` : base;
}

function buildSummary(scope: RalphRunScope, steeringPrompt: string | undefined): string {
  const base = `Managed Ralph loop for plan ${scope.planId ?? "(none)"}${scope.specChangeId ? ` with governing spec ${scope.specChangeId}` : ""}.`;
  return truncate(steeringPrompt?.trim() ? `${base} ${steeringPrompt.trim()}` : base, 160);
}

function buildRunInstructions(scope: RalphRunScope, steeringPrompt: string | undefined): string[] {
  const instructions = [
    `Operate only within plan ${scope.planId ?? "(none)"}${scope.specChangeId ? ` and its governing spec ${scope.specChangeId}` : ""}.`,
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
  if (!input.planRef) {
    throw new Error("planRef is required when creating a new managed Ralph run");
  }
  const snapshot = await readManagedPlanSnapshot(ctx.cwd, input.planRef);
  const scope = toManagedRunScope(snapshot, null);
  const spec = snapshot.specChangeId
    ? await createSpecStore(ctx.cwd)
        .readChange(snapshot.specChangeId)
        .catch(() => null)
    : null;
  const packetContext = await buildPacketContext(ctx.cwd, scope, input.prompt, []);
  const created = await store.createRunAsync({
    title: deriveTitle(scope, spec?.state.title ?? null, snapshot.planTitle, null),
    objective: buildObjective(scope, input.prompt),
    summary: buildSummary(scope, input.prompt),
    scope,
    activeTicketId: null,
    packetContext,
    steeringQueue: input.prompt?.trim()
      ? [
          {
            id: "steer-001",
            text: input.prompt.trim(),
            createdAt: new Date().toISOString(),
            source: "operator",
            consumedAt: null,
            consumedIterationId: null,
          },
        ]
      : [],
    scheduler: {
      status: "idle",
      updatedAt: new Date().toISOString(),
      jobId: null,
      note: "Managed Ralph loop created.",
    },
    policySnapshot: input.policySnapshot,
    launchInstructions: buildRunInstructions(scope, input.prompt),
  });
  return { run: created, created: true };
}

function managedDecision(
  kind: "continue" | "pause" | "complete" | "halt",
  reason: "goal_reached" | "manual_review_required" | "operator_requested" | "policy_blocked" | "unknown",
  summary: string,
  decidedBy: "policy" | "operator" = "policy",
): NonNullable<RalphReadResult["state"]["latestDecision"]> {
  return {
    kind,
    reason,
    summary,
    decidedAt: new Date().toISOString(),
    decidedBy,
    blockingRefs: [],
  };
}

async function syncManagedRunScope(
  ctx: RalphContextLike,
  run: RalphReadResult,
  activeTicketId: string | null,
  steeringPrompt: string | undefined,
): Promise<{ run: RalphReadResult; snapshot: ManagedPlanSnapshot }> {
  const snapshot = await readManagedPlanSnapshot(
    ctx.cwd,
    run.state.scope.planId ?? run.state.linkedRefs.planIds[0] ?? "",
  );
  const scope = toManagedRunScope(snapshot, activeTicketId);
  const packetContext = await buildPacketContext(ctx.cwd, scope, steeringPrompt, summarizePriorLearnings(run, scope));
  return {
    snapshot,
    run: await createRalphStore(ctx.cwd).updateRunAsync(run.state.runId, {
      scope,
      activeTicketId,
      packetContext,
      scheduler: { updatedAt: new Date().toISOString() },
    }),
  };
}

async function reconcileManagedRunAfterIteration(
  ctx: RalphContextLike,
  run: RalphReadResult,
): Promise<RalphReadResult> {
  const store = createRalphStore(ctx.cwd);
  const snapshot = await readManagedPlanSnapshot(
    ctx.cwd,
    run.state.scope.planId ?? run.state.linkedRefs.planIds[0] ?? "",
  );
  const activeTicketId = selectNextTicket(snapshot);
  const steeringText = pendingSteeringText(run);

  if (run.state.stopRequest && run.state.stopRequest.handledAt === null) {
    const acknowledged = await store.acknowledgeStopRequestAsync(run.state.runId);
    return store.updateRunAsync(acknowledged.state.runId, {
      latestDecision: managedDecision(
        "halt",
        "operator_requested",
        run.state.stopRequest.summary || "Operator requested the Ralph loop to stop.",
        "operator",
      ),
      status: "halted",
      phase: "halted",
      waitingFor: "none",
      stopReason: "operator_requested",
      scheduler: {
        status: "completed",
        updatedAt: new Date().toISOString(),
        note: "Operator stop request acknowledged.",
      },
      activeTicketId: null,
    });
  }

  if (run.state.latestDecision?.kind === "halt") {
    return store.updateRunAsync(run.state.runId, {
      scheduler: { status: "completed", updatedAt: new Date().toISOString(), note: run.state.latestDecision.summary },
    });
  }

  if (run.state.latestDecision?.kind === "pause" || run.state.latestDecision?.kind === "escalate") {
    return store.updateRunAsync(run.state.runId, {
      scheduler: { status: "waiting", updatedAt: new Date().toISOString(), note: run.state.latestDecision.summary },
    });
  }

  if (snapshot.orderedTicketIds.length === 0) {
    return store.updateRunAsync(run.state.runId, {
      latestDecision: managedDecision(
        "pause",
        "manual_review_required",
        `Plan ${snapshot.planId} still has no linked tickets after the ticket-synthesis iteration.`,
      ),
      status: "paused",
      phase: "reviewing",
      waitingFor: "operator",
      stopReason: "manual_review_required",
      scheduler: {
        status: "waiting",
        updatedAt: new Date().toISOString(),
        note: "Waiting for ticket synthesis review.",
      },
      activeTicketId: null,
      packetContext: await buildPacketContext(
        ctx.cwd,
        toManagedRunScope(snapshot, null),
        steeringText,
        summarizePriorLearnings(run, toManagedRunScope(snapshot, null)),
      ),
    });
  }

  if (snapshot.openTicketIds.length === 0) {
    return store.updateRunAsync(run.state.runId, {
      latestDecision: managedDecision(
        "complete",
        "goal_reached",
        `All plan-linked tickets for ${snapshot.planId} are closed.`,
      ),
      status: "completed",
      phase: "completed",
      waitingFor: "none",
      stopReason: "goal_reached",
      scheduler: { status: "completed", updatedAt: new Date().toISOString(), note: "Managed Ralph loop completed." },
      activeTicketId: null,
      scope: toManagedRunScope(snapshot, null),
      packetContext: await buildPacketContext(
        ctx.cwd,
        toManagedRunScope(snapshot, null),
        steeringText,
        summarizePriorLearnings(run, toManagedRunScope(snapshot, null)),
      ),
    });
  }

  if (!activeTicketId) {
    return store.updateRunAsync(run.state.runId, {
      latestDecision: managedDecision("pause", "policy_blocked", formatBlockingSummary(snapshot)),
      status: "paused",
      phase: "reviewing",
      waitingFor: "operator",
      stopReason: "policy_blocked",
      scheduler: { status: "waiting", updatedAt: new Date().toISOString(), note: formatBlockingSummary(snapshot) },
      activeTicketId: null,
      scope: toManagedRunScope(snapshot, null),
      packetContext: await buildPacketContext(
        ctx.cwd,
        toManagedRunScope(snapshot, null),
        steeringText,
        summarizePriorLearnings(run, toManagedRunScope(snapshot, null)),
      ),
    });
  }

  const synchronized = await syncManagedRunScope(ctx, run, activeTicketId, steeringText);
  return store.updateRunAsync(synchronized.run.state.runId, {
    latestDecision: managedDecision(
      "continue",
      "unknown",
      `Continue the managed Ralph loop with ticket ${activeTicketId}.`,
    ),
    status: "active",
    phase: "deciding",
    waitingFor: "none",
    stopReason: null,
    scheduler: { status: "running", updatedAt: new Date().toISOString(), note: `Next ticket ${activeTicketId}.` },
  });
}

async function prepareManagedIteration(
  ctx: RalphContextLike,
  input: ExecuteRalphLoopInput,
  run: RalphReadResult,
): Promise<{ run: RalphReadResult; shouldExecute: boolean }> {
  const snapshot = await readManagedPlanSnapshot(
    ctx.cwd,
    run.state.scope.planId ?? run.state.linkedRefs.planIds[0] ?? "",
  );
  const steeringText = pendingSteeringText(run) ?? input.prompt;
  const store = createRalphStore(ctx.cwd);

  if (run.state.stopRequest && run.state.stopRequest.handledAt === null) {
    const halted = await store.acknowledgeStopRequestAsync(run.state.runId);
    return {
      shouldExecute: false,
      run: await store.updateRunAsync(halted.state.runId, {
        latestDecision: managedDecision("halt", "operator_requested", run.state.stopRequest.summary, "operator"),
        status: "halted",
        phase: "halted",
        waitingFor: "none",
        stopReason: "operator_requested",
        scheduler: { status: "completed", updatedAt: new Date().toISOString(), note: run.state.stopRequest.summary },
        activeTicketId: null,
      }),
    };
  }

  if ((run.state.waitingFor === "operator" || run.state.status === "paused") && !steeringText) {
    return {
      shouldExecute: false,
      run: await store.updateRunAsync(run.state.runId, {
        scheduler: {
          status: "waiting",
          updatedAt: new Date().toISOString(),
          note: run.state.latestDecision?.summary ?? "Waiting for operator input.",
        },
      }),
    };
  }

  if (run.state.waitingFor === "critique" || run.state.waitingFor === "verifier") {
    return {
      shouldExecute: false,
      run: await store.updateRunAsync(run.state.runId, {
        scheduler: {
          status: "waiting",
          updatedAt: new Date().toISOString(),
          note: run.state.latestDecision?.summary ?? "Waiting for external review signals.",
        },
      }),
    };
  }

  if (snapshot.orderedTicketIds.length === 0) {
    const synchronized = await syncManagedRunScope(ctx, run, null, steeringText);
    return {
      shouldExecute: true,
      run: await store.updateRunAsync(synchronized.run.state.runId, {
        objective: `Create and sequence the initial ticket set for plan ${snapshot.planId}.`,
        summary: `Managed Ralph loop is synthesizing plan tickets for ${snapshot.planId}.`,
        status: "active",
        phase: "deciding",
        waitingFor: "none",
        stopReason: null,
        scheduler: {
          status: "running",
          updatedAt: new Date().toISOString(),
          note: "Synthesizing missing plan tickets.",
        },
      }),
    };
  }

  if (snapshot.openTicketIds.length === 0) {
    return {
      shouldExecute: false,
      run: await store.updateRunAsync(run.state.runId, {
        latestDecision: managedDecision(
          "complete",
          "goal_reached",
          `All plan-linked tickets for ${snapshot.planId} are closed.`,
        ),
        status: "completed",
        phase: "completed",
        waitingFor: "none",
        stopReason: "goal_reached",
        scheduler: { status: "completed", updatedAt: new Date().toISOString(), note: "Managed Ralph loop completed." },
        activeTicketId: null,
        scope: toManagedRunScope(snapshot, null),
      }),
    };
  }

  const activeTicketId = selectNextTicket(snapshot);
  if (!activeTicketId) {
    return {
      shouldExecute: false,
      run: await store.updateRunAsync(run.state.runId, {
        latestDecision: managedDecision("pause", "policy_blocked", formatBlockingSummary(snapshot)),
        status: "paused",
        phase: "reviewing",
        waitingFor: "operator",
        stopReason: "policy_blocked",
        scheduler: { status: "waiting", updatedAt: new Date().toISOString(), note: formatBlockingSummary(snapshot) },
        activeTicketId: null,
        scope: toManagedRunScope(snapshot, null),
      }),
    };
  }

  const synchronized = await syncManagedRunScope(ctx, run, activeTicketId, steeringText);
  return {
    shouldExecute: true,
    run: await store.updateRunAsync(synchronized.run.state.runId, {
      objective: `Advance ticket ${activeTicketId} under plan ${snapshot.planId} to its truthful next state.`,
      summary: `Managed Ralph loop is executing ticket ${activeTicketId} under plan ${snapshot.planId}.`,
      status: "active",
      phase: "deciding",
      waitingFor: "none",
      stopReason: null,
      scheduler: { status: "running", updatedAt: new Date().toISOString(), note: `Executing ${activeTicketId}.` },
    }),
  };
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
    if (!run.state.scope.planId) {
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

      run = await createRalphStore(ctx.cwd).setSchedulerAsync(run.state.runId, {
        jobId: null,
        updatedAt: new Date().toISOString(),
        status: run.state.scheduler.status === "running" ? "waiting" : run.state.scheduler.status,
      });
      return { run, created: ensured.created, steps };
    }

    run = await createRalphStore(ctx.cwd).setSchedulerAsync(run.state.runId, {
      status: "running",
      updatedAt: new Date().toISOString(),
      jobId: options.jobId ?? null,
      note: `Managed Ralph loop started for ${run.state.scope.planId ?? "(none)"}.`,
    });

    while (!isTerminalStatus(run.state.status)) {
      const prepared = await prepareManagedIteration(ctx, input, run);
      run = prepared.run;
      if (!prepared.shouldExecute || isTerminalStatus(run.state.status)) {
        break;
      }

      const launch = hasDurableActiveLaunch(run) ? run : await reserveDurableLaunch(ctx, input, run, ensured.created);
      const executed = await executePreparedIteration(ctx, run.state.runId, signal, launch, options);
      run = await reconcileManagedRunAfterIteration(ctx, executed.run);
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

      if (run.state.scheduler.status !== "running") {
        break;
      }
    }

    run = await createRalphStore(ctx.cwd).setSchedulerAsync(run.state.runId, {
      jobId: null,
      updatedAt: new Date().toISOString(),
      status: run.state.scheduler.status === "running" ? "waiting" : run.state.scheduler.status,
    });
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
