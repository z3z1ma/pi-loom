import type { ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { createConstitutionalStore } from "#constitution/extensions/domain/store.js";
import { createPlanStore } from "#plans/extensions/domain/store.js";
import { createSpecStore } from "#specs/extensions/domain/store.js";
import type { TicketReadResult, TicketStatus } from "#ticketing/extensions/domain/models.js";
import { createTicketStore } from "#ticketing/extensions/domain/store.js";
import type {
  RalphPacketContext,
  RalphReadResult,
  RalphRunPhase,
  RalphRunScope,
  RalphRunStatus,
  RalphWaitingFor,
  UpsertRalphIterationRuntimeInput,
} from "./models.js";
import { deriveRalphRunId } from "./paths.js";
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
  ticketRef?: string;
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

export interface RalphLoopProgressUpdate {
  text: string;
  kind: "assistant_output" | "launch_state" | "tool_execution" | "status";
}

export interface ExecuteRalphLoopOptions {
  onUpdate?: (update: string | RalphLoopProgressUpdate) => void;
  jobId?: string | null;
}

interface BoundRunContext {
  planId: string | null;
  planTitle: string | null;
  ticketId: string;
  ticketTitle: string | null;
  specChangeId: string | null;
  roadmapItemIds: string[];
  initiativeIds: string[];
  researchIds: string[];
  critiqueIds: string[];
  docIds: string[];
}

interface TicketLedgerSnapshot {
  ticketId: string;
  status: TicketStatus;
  closed: boolean;
  updatedAt: string;
  bodyState: string;
  journalState: string;
  checkpointState: string;
  blockersState: string;
  depsState: string;
}

interface SynthesizedTicketIteration {
  iterationStatus: "accepted" | "reviewing";
  decision: NonNullable<RalphReadResult["state"]["latestDecision"]>;
  summary: string;
  workerSummary: string;
  notes: string[];
}

export interface EnsureRalphRunResult {
  run: RalphReadResult;
  created: boolean;
}

async function applyRunPolicySnapshot(
  store: ReturnType<typeof createRalphStore>,
  run: RalphReadResult,
  policySnapshot: ExecuteRalphLoopInput["policySnapshot"] | undefined,
): Promise<RalphReadResult> {
  if (!policySnapshot) {
    return run;
  }
  return store.updateRunAsync(run.state.runId, { policySnapshot });
}

function snapshotTicketLedger(ticket: TicketReadResult): TicketLedgerSnapshot {
  return {
    ticketId: ticket.summary.id,
    status: ticket.summary.status,
    closed: ticket.summary.closed,
    updatedAt: ticket.summary.updatedAt,
    bodyState: [
      ticket.ticket.body.summary,
      ticket.ticket.body.context,
      ticket.ticket.body.plan,
      ticket.ticket.body.notes,
      ticket.ticket.body.verification,
      ticket.ticket.body.journalSummary,
    ].join("\n---\n"),
    journalState: ticket.journal
      .map((entry) => `${entry.id}:${entry.kind}:${entry.createdAt}:${entry.text}`)
      .join("\n"),
    checkpointState: ticket.checkpoints
      .map((entry) => `${entry.id}:${entry.createdAt}:${entry.title}:${entry.body}`)
      .join("\n"),
    blockersState: [...ticket.blockers].sort().join(","),
    depsState: [...ticket.summary.deps].sort().join(","),
  };
}

async function readTicketLedgerSnapshot(cwd: string, ticketRef: string): Promise<TicketLedgerSnapshot | null> {
  return createTicketStore(cwd)
    .readTicketAsync(ticketRef)
    .then((ticket) => snapshotTicketLedger(ticket))
    .catch(() => null);
}

function ticketLedgerChanged(before: TicketLedgerSnapshot | null, after: TicketLedgerSnapshot | null): boolean {
  if (!before || !after) {
    return false;
  }
  return (
    before.status !== after.status ||
    before.closed !== after.closed ||
    before.updatedAt !== after.updatedAt ||
    before.bodyState !== after.bodyState ||
    before.journalState !== after.journalState ||
    before.checkpointState !== after.checkpointState ||
    before.blockersState !== after.blockersState ||
    before.depsState !== after.depsState
  );
}

function describeTicketLedgerDelta(before: TicketLedgerSnapshot, after: TicketLedgerSnapshot): string[] {
  const delta: string[] = [];
  if (before.status !== after.status) {
    delta.push(`status ${before.status} → ${after.status}`);
  }
  if (!before.closed && after.closed) {
    delta.push("ticket closed");
  }
  if (before.bodyState !== after.bodyState) {
    delta.push("ticket body updated");
  }
  if (before.journalState !== after.journalState) {
    delta.push("ticket journal updated");
  }
  if (before.checkpointState !== after.checkpointState) {
    delta.push("ticket checkpoints updated");
  }
  if (before.blockersState !== after.blockersState) {
    delta.push("blockers changed");
  }
  if (before.depsState !== after.depsState) {
    delta.push("dependencies changed");
  }
  if (delta.length === 0 && before.updatedAt !== after.updatedAt) {
    delta.push(`ticket updated at ${after.updatedAt}`);
  }
  return delta.length > 0 ? delta : ["ticket ledger changed"];
}

function synthesizeTicketIteration(
  ticketId: string,
  before: TicketLedgerSnapshot,
  after: TicketLedgerSnapshot,
): SynthesizedTicketIteration {
  const delta = describeTicketLedgerDelta(before, after);
  const workerSummary = delta.join("; ");
  if (after.closed) {
    return {
      iterationStatus: "accepted",
      decision: managedDecision("complete", "goal_reached", `Ticket ${ticketId} closed during bounded iteration.`),
      summary: `Ticket ${ticketId} closed during bounded iteration.`,
      workerSummary,
      notes: delta,
    };
  }
  if (after.status === "blocked") {
    return {
      iterationStatus: "reviewing",
      decision: managedDecision("pause", "policy_blocked", `Ticket ${ticketId} is blocked after bounded iteration.`),
      summary: `Ticket ${ticketId} is blocked after bounded iteration.`,
      workerSummary,
      notes: delta,
    };
  }
  if (after.status === "review") {
    return {
      iterationStatus: "reviewing",
      decision: managedDecision(
        "pause",
        "manual_review_required",
        `Ticket ${ticketId} is waiting in review after bounded iteration.`,
      ),
      summary: `Ticket ${ticketId} is waiting in review after bounded iteration.`,
      workerSummary,
      notes: delta,
    };
  }
  const summary =
    before.status !== after.status
      ? `Ticket ${ticketId} moved to ${after.status} during bounded iteration.`
      : `Ticket ${ticketId} recorded durable activity during bounded iteration.`;
  return {
    iterationStatus: "accepted",
    decision: managedDecision(
      "continue",
      "unknown",
      `${summary} Another bounded iteration may proceed if policy allows.`,
    ),
    summary,
    workerSummary,
    notes: delta,
  };
}

function decisionState(decision: NonNullable<RalphReadResult["state"]["latestDecision"]>): {
  status: RalphRunStatus;
  phase: RalphRunPhase;
  waitingFor: RalphWaitingFor;
  stopReason: RalphReadResult["state"]["stopReason"];
} {
  switch (decision.kind) {
    case "continue":
      return { status: "active", phase: "deciding", waitingFor: "none", stopReason: null };
    case "pause":
      if (decision.reason === "manual_review_required") {
        return {
          status: "waiting_for_review",
          phase: "reviewing",
          waitingFor: "critique",
          stopReason: decision.reason,
        };
      }
      return { status: "paused", phase: "reviewing", waitingFor: "operator", stopReason: decision.reason };
    case "complete":
      return { status: "completed", phase: "completed", waitingFor: "none", stopReason: decision.reason };
    case "halt":
      return {
        status: decision.reason === "runtime_failure" ? "failed" : "halted",
        phase: "halted",
        waitingFor: "none",
        stopReason: decision.reason,
      };
    case "escalate":
      return { status: "paused", phase: "reviewing", waitingFor: "operator", stopReason: decision.reason };
  }
}

export interface RalphRunBinding {
  ticketId: string;
  planId: string | null;
  runId: string;
  existingRun: RalphReadResult | null;
}

const inFlightLoopExecutions = new Set<string>();
const TICKET_ACTIVITY_GRACE_MS = 2_000;
const RUNTIME_PERSIST_FLUSH_MS = 200;
const TICKET_ONLY_PLAN_KEY = "ticket-only";

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

function runMatchesTicket(run: RalphReadResult, ticketId: string): boolean {
  return run.state.scope.ticketId === ticketId || run.state.linkedRefs.ticketIds.includes(ticketId);
}

function deriveBoundRunId(planId: string | null, ticketId: string): string {
  return deriveRalphRunId(planId ?? TICKET_ONLY_PLAN_KEY, ticketId);
}

export async function resolveRalphRunBinding(
  cwd: string,
  input: { ticketRef: string; planRef?: string | null },
): Promise<RalphRunBinding> {
  const ticketId = createTicketStore(cwd).resolveTicketRef(input.ticketRef);
  const planRef = input.planRef?.trim() || null;
  const store = createRalphStore(cwd);

  if (planRef) {
    const plan = await createPlanStore(cwd).readPlan(planRef);
    if (!plan.state.linkedTickets.some((link) => link.ticketId === ticketId)) {
      throw new Error(`Ticket ${ticketId} is not linked to plan ${planRef}.`);
    }
    const runId = deriveBoundRunId(plan.state.planId, ticketId);
    return {
      ticketId,
      planId: plan.state.planId,
      runId,
      existingRun: await store.readRunAsync(runId).catch(() => null),
    };
  }

  const matchingRuns = (await store.listRunsAsync({}))
    .filter((summary) => !isTerminalStatus(summary.status) && summary.status !== "archived")
    .map((summary) => ({ summary, run: null as RalphReadResult | null }));
  const resolvedMatches: RalphReadResult[] = [];
  for (const candidate of matchingRuns) {
    const run = await store.readRunAsync(candidate.summary.id);
    if (runMatchesTicket(run, ticketId)) {
      resolvedMatches.push(run);
    }
  }
  if (resolvedMatches.length === 1) {
    const existingRun = resolvedMatches[0] as RalphReadResult;
    return {
      ticketId,
      planId: existingRun.state.scope.planId,
      runId: existingRun.state.runId,
      existingRun,
    };
  }
  if (resolvedMatches.length > 1) {
    throw new Error(
      `Ticket ${ticketId} has multiple active Ralph runs (${resolvedMatches.map((run) => run.state.runId).join(", ")}). Provide planRef to disambiguate.`,
    );
  }

  const linkedPlans = await createPlanStore(cwd).listPlans({ linkedTicketId: ticketId });
  if (linkedPlans.length > 1) {
    throw new Error(
      `Ticket ${ticketId} is linked to multiple plans (${linkedPlans.map((plan) => plan.id).join(", ")}). Provide planRef.`,
    );
  }
  const inferredPlanId = linkedPlans[0]?.id ?? null;
  const runId = deriveBoundRunId(inferredPlanId, ticketId);
  return {
    ticketId,
    planId: inferredPlanId,
    runId,
    existingRun: await store.readRunAsync(runId).catch(() => null),
  };
}

export async function reserveDurableLaunch(
  ctx: RalphContextLike,
  input: ExecuteRalphLoopInput,
  run: RalphReadResult,
  created = false,
): Promise<RalphReadResult> {
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

  const requiresFreshLaunch = refreshed.state.postIteration === null || refreshed.state.latestDecision?.kind === "halt";
  const reserved = requiresFreshLaunch
    ? await store.prepareLaunchAsync(refreshed.state.runId, {
        focus,
        instructions,
        requireFresh: true,
        allowTerminalRerun: refreshed.state.latestDecision?.kind === "halt",
      })
    : await store.resumeRunAsync(refreshed.state.runId, { focus, instructions, requireFresh: true });

  return steeringText?.trim()
    ? await store.consumeQueuedSteeringAsync(reserved.state.runId, reserved.launch.iterationId)
    : reserved;
}

function isTerminalStatus(status: RalphRunStatus): boolean {
  return ["completed", "halted", "failed", "archived"].includes(status);
}

function canPrepareFreshIteration(status: RalphRunStatus): boolean {
  return !["completed", "archived"].includes(status);
}

function canRerunFromTerminalStatus(status: RalphRunStatus): boolean {
  return ["halted", "failed"].includes(status);
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

async function readBoundRunContext(cwd: string, planRef: string | null, ticketRef: string): Promise<BoundRunContext> {
  const ticket = await createTicketStore(cwd).readTicketAsync(ticketRef);
  if (!planRef) {
    return {
      planId: null,
      planTitle: null,
      ticketId: ticket.summary.id,
      ticketTitle: ticket.summary.title,
      specChangeId: null,
      roadmapItemIds: [],
      initiativeIds: ticket.ticket.frontmatter["initiative-ids"],
      researchIds: ticket.ticket.frontmatter["research-ids"],
      critiqueIds: [],
      docIds: [],
    };
  }
  const plan = await createPlanStore(cwd).readPlan(planRef);
  const linkedTicketIds = new Set(plan.state.linkedTickets.map((link) => link.ticketId));
  if (!linkedTicketIds.has(ticketRef)) {
    throw new Error(`Ticket ${ticketRef} is not linked to plan ${planRef}.`);
  }
  const specChangeId =
    plan.state.sourceTarget.kind === "spec"
      ? plan.state.sourceTarget.ref
      : (plan.state.contextRefs.specChangeIds[0] ?? null);
  return {
    planId: plan.state.planId,
    planTitle: plan.state.title,
    ticketId: ticket.summary.id,
    ticketTitle: ticket.summary.title,
    specChangeId,
    roadmapItemIds: plan.state.contextRefs.roadmapItemIds,
    initiativeIds: plan.state.contextRefs.initiativeIds,
    researchIds: plan.state.contextRefs.researchIds,
    critiqueIds: plan.state.contextRefs.critiqueIds,
    docIds: plan.state.contextRefs.docIds,
  };
}

function toBoundRunScope(context: BoundRunContext): RalphRunScope {
  return {
    mode: "execute",
    specChangeId: context.specChangeId,
    planId: context.planId,
    ticketId: context.ticketId,
    roadmapItemIds: context.roadmapItemIds,
    initiativeIds: context.initiativeIds,
    researchIds: context.researchIds,
    critiqueIds: context.critiqueIds,
    docIds: context.docIds,
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

function deriveTitle(
  scope: RalphRunScope,
  _specTitle: string | null,
  planTitle: string | null,
  ticketTitle: string | null,
): string {
  return truncate(
    `Ralph ${scope.ticketId ?? "(unscoped-ticket)"}: ${ticketTitle ?? planTitle ?? scope.ticketId ?? "Ticket loop"}`,
    80,
  );
}

function buildObjective(scope: RalphRunScope, steeringPrompt: string | undefined): string {
  const base = `Advance ticket ${scope.ticketId ?? "(none)"} under plan ${scope.planId ?? "(none)"}${scope.specChangeId ? ` and governing spec ${scope.specChangeId}` : ""} to its truthful next state.`;
  return steeringPrompt?.trim() ? `${base}\n\nOperator notes: ${steeringPrompt.trim()}` : base;
}

function buildSummary(scope: RalphRunScope, steeringPrompt: string | undefined): string {
  const base = `Managed Ralph loop for ticket ${scope.ticketId ?? "(none)"} under plan ${scope.planId ?? "(none)"}${scope.specChangeId ? ` with governing spec ${scope.specChangeId}` : ""}.`;
  return truncate(steeringPrompt?.trim() ? `${base} ${steeringPrompt.trim()}` : base, 160);
}

function buildRunInstructions(scope: RalphRunScope, steeringPrompt: string | undefined): string[] {
  const instructions = [
    `Operate only within ticket ${scope.ticketId ?? "(none)"} under plan ${scope.planId ?? "(none)"}${scope.specChangeId ? ` and its governing spec ${scope.specChangeId}` : ""}.`,
    `Read the canonical packet through ralph_read mode=packet ticketRef=${scope.ticketId ?? "(none)"}${scope.planId ? ` planRef=${scope.planId}` : ""}.`,
    "Perform one bounded Ralph iteration and leave durable bound-ticket activity before exit.",
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
  const noTicketActivitySummary =
    execution.status === "cancelled"
      ? "The session-backed launch was cancelled before durable bound-ticket activity was recorded."
      : execution.exitCode === 0
        ? "The session-backed launch returned without durable bound-ticket activity."
        : `Session runtime exited with code ${execution.exitCode}.`;
  const summary = queueTimeoutExceeded
    ? "The Ralph run exceeded its allowed wait for the session runtime queue before a fresh worker started."
    : timeoutExceeded
      ? "The Ralph run exceeded its configured runtime limit before completing the bounded iteration."
      : budgetExceeded
        ? "The Ralph run exceeded its configured token budget during the bounded iteration."
        : execution.stderr || execution.output || noTicketActivitySummary;
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
    missingTicketActivity: true,
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
        : budgetExceeded
          ? "The bounded iteration exhausted the configured token budget before durable ticket activity was observed."
          : noTicketActivitySummary,
    notes: [
      queueTimeoutExceeded
        ? "Session-backed launch exceeded the configured queue wait limit before a fresh worker started."
        : timeoutExceeded
          ? "Session-backed launch exceeded the configured runtime limit before leaving durable bound-ticket activity."
          : budgetExceeded
            ? "Session-backed launch exceeded the configured token budget before leaving durable bound-ticket activity."
            : execution.status === "cancelled"
              ? "Session-backed launch was cancelled before leaving durable bound-ticket activity."
              : "Session-backed launch exited without leaving durable bound-ticket activity.",
      ...(runtimeUnavailable
        ? [
            "Runtime token usage metadata was also unavailable for this no-activity failure, but missing ticket activity remains the primary failure signal.",
          ]
        : []),
    ],
  });
  let run = await store.decideRunAsync(ref, {
    operatorRequestedStop:
      execution.status === "cancelled" &&
      !timeoutExceeded &&
      !queueTimeoutExceeded &&
      !budgetExceeded &&
      !runtimeUnavailable,
    runtimeFailure: execution.status !== "cancelled" && !timeoutExceeded && !queueTimeoutExceeded && !budgetExceeded,
    queueTimeoutExceeded,
    runtimeUnavailable: false,
    timeoutExceeded,
    budgetExceeded,
    summary,
    decidedBy: timeoutExceeded || budgetExceeded ? "policy" : execution.status === "cancelled" ? "operator" : "runtime",
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

async function waitForTicketActivityGrace(): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => resolve(), TICKET_ACTIVITY_GRACE_MS);
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
  const ticketBeforeLaunch = await readTicketLedgerSnapshot(ctx.cwd, run.launch.ticketRef);
  const executionSignal = createExecutionSignal(signal);
  let queueTimeoutExceeded = false;
  let queueTimeoutTimer: NodeJS.Timeout | null = null;
  let streamedOutput = "";
  let latestRuntimeStatus: "queued" | "running" = "queued";
  let pendingRuntimeUpdate: UpsertRalphIterationRuntimeInput | null = null;
  let flushTimer: NodeJS.Timeout | null = null;
  let flushChain = Promise.resolve();
  let flushError: Error | null = null;

  const mergeRuntimeUpdate = (update: UpsertRalphIterationRuntimeInput): void => {
    pendingRuntimeUpdate = pendingRuntimeUpdate
      ? {
          ...pendingRuntimeUpdate,
          ...update,
          usage: { ...pendingRuntimeUpdate.usage, ...update.usage },
          events: [...(pendingRuntimeUpdate.events ?? []), ...(update.events ?? [])],
          launch: update.launch ?? pendingRuntimeUpdate.launch,
        }
      : {
          ...update,
          usage: update.usage ? { ...update.usage } : undefined,
          events: [...(update.events ?? [])],
        };
  };

  const flushRuntimeUpdate = async (): Promise<void> => {
    if (!pendingRuntimeUpdate) {
      return;
    }
    const update = pendingRuntimeUpdate;
    pendingRuntimeUpdate = null;
    await store.upsertIterationRuntimeAsync(ref, update);
  };

  const queueRuntimePersistence = (update: UpsertRalphIterationRuntimeInput, immediate = false): void => {
    mergeRuntimeUpdate(update);
    if (immediate) {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      flushChain = flushChain
        .then(() => flushRuntimeUpdate())
        .catch((error) => {
          flushError = error instanceof Error ? error : new Error(String(error));
        });
      return;
    }
    if (flushTimer) {
      return;
    }
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushChain = flushChain
        .then(() => flushRuntimeUpdate())
        .catch((error) => {
          flushError = error instanceof Error ? error : new Error(String(error));
        });
    }, RUNTIME_PERSIST_FLUSH_MS);
    flushTimer.unref?.();
  };

  const flushRuntimePersistenceNow = async (): Promise<void> => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    flushChain = flushChain
      .then(() => flushRuntimeUpdate())
      .catch((error) => {
        flushError = error instanceof Error ? error : new Error(String(error));
      });
    await flushChain;
    if (flushError) {
      throw flushError;
    }
  };

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

  queueRuntimePersistence(
    {
      iterationId: run.launch.iterationId,
      iteration: run.launch.iteration,
      status: "queued",
      startedAt: new Date().toISOString(),
      launch: run.launch,
      jobId: options.jobId,
    },
    true,
  );
  await flushRuntimePersistenceNow();

  const runtimePromise = runRalphLaunch(
    ctx.cwd,
    run.launch,
    executionSignal.signal,
    (text) => {
      if (executionSignal.timedOut()) {
        return;
      }
      streamedOutput = appendRuntimeOutput(streamedOutput, text);
      options.onUpdate?.({ text, kind: "assistant_output" });
      queueRuntimePersistence({
        iterationId: run.launch.iterationId,
        iteration: run.launch.iteration,
        status: latestRuntimeStatus,
        output: streamedOutput,
        launch: run.launch,
        jobId: options.jobId,
      });
    },
    runtimeEnv,
    (event) => {
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
        options.onUpdate?.({
          text: updateText,
          kind: event.type === "launch_state" ? "launch_state" : "tool_execution",
        });
      }
      queueRuntimePersistence({
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
  await flushRuntimePersistenceNow();
  const timeoutExceeded = executionSignal.timedOut();
  const normalizedExecution =
    timeoutExceeded && execution.status === "cancelled"
      ? {
          ...execution,
          status: "failed" as const,
          stderr: execution.stderr === "Aborted" ? "Timed out" : execution.stderr || "Timed out",
        }
      : execution;

  queueRuntimePersistence(
    {
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
      missingTicketActivity: false,
      jobId: options.jobId,
    },
    true,
  );
  await flushRuntimePersistenceNow();

  if (timeoutExceeded) {
    await waitForTicketActivityGrace();
  }

  let updated = await store.readRunAsync(ref);
  const ticketAfterLaunch = await readTicketLedgerSnapshot(ctx.cwd, run.launch.ticketRef);
  const hasDurableTicketActivity = ticketLedgerChanged(ticketBeforeLaunch, ticketAfterLaunch);
  updated = await store.upsertIterationRuntimeAsync(ref, {
    iterationId: run.launch.iterationId,
    iteration: run.launch.iteration,
    missingTicketActivity: !hasDurableTicketActivity,
    jobId: options.jobId,
  });
  const totalTokens = totalRuntimeTokens(updated);
  const budgetLimit = updated.state.policySnapshot.tokenBudget;
  const requiresBudgetEvidence = budgetLimit !== null;
  const launchStarted = hasRunningLaunchEvent(updated, run.launch.iterationId);
  const missingBudgetEvidence = requiresBudgetEvidence && totalTokens === null && launchStarted;
  const budgetExceeded = requiresBudgetEvidence && totalTokens !== null && totalTokens > budgetLimit;
  const operatorRequestedStop =
    normalizedExecution.status === "cancelled" &&
    !timeoutExceeded &&
    !queueTimeoutExceeded &&
    !budgetExceeded &&
    !missingBudgetEvidence;
  const runtimeFailure =
    normalizedExecution.status !== "completed" &&
    !operatorRequestedStop &&
    !timeoutExceeded &&
    !queueTimeoutExceeded &&
    !budgetExceeded &&
    !missingBudgetEvidence;

  if (!hasDurableTicketActivity || !ticketBeforeLaunch || !ticketAfterLaunch) {
    updated = await persistRuntimeFailure(ctx.cwd, ref, normalizedExecution, run.launch.iterationId, options.jobId, {
      timeoutExceeded,
      queueTimeoutExceeded,
      budgetExceeded,
      runtimeUnavailable: missingBudgetEvidence,
    });
  } else {
    const synthesized = synthesizeTicketIteration(run.launch.ticketRef, ticketBeforeLaunch, ticketAfterLaunch);
    updated = await store.appendIterationAsync(ref, {
      id: run.launch.iterationId,
      status: synthesized.iterationStatus,
      completedAt: normalizedExecution.completedAt ?? ticketAfterLaunch.updatedAt,
      summary: synthesized.summary,
      workerSummary: synthesized.workerSummary,
      decision: synthesized.decision,
      notes: synthesized.notes,
    });
    if (
      timeoutExceeded ||
      budgetExceeded ||
      missingBudgetEvidence ||
      queueTimeoutExceeded ||
      operatorRequestedStop ||
      runtimeFailure
    ) {
      updated = await store.decideRunAsync(ref, {
        operatorRequestedStop,
        runtimeFailure,
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
              : operatorRequestedStop
                ? synthesized.decision.summary
                : runtimeFailure
                  ? normalizedExecution.stderr ||
                    normalizedExecution.output ||
                    "Session runtime exited unsuccessfully after updating the bound ticket."
                  : "The Ralph run exceeded its configured token budget.",
        decidedBy: operatorRequestedStop ? "operator" : missingBudgetEvidence || runtimeFailure ? "runtime" : "policy",
      });
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
                : operatorRequestedStop
                  ? "The session runtime was cancelled after durable ticket activity was recorded."
                  : runtimeFailure
                    ? `Session runtime exited with code ${normalizedExecution.exitCode ?? "unknown"} after durable ticket activity was recorded.`
                    : "Policy halted the run because the bounded iteration exceeded the configured token budget.",
        ],
      });
    } else {
      const nextState = decisionState(synthesized.decision);
      updated = await store.updateRunAsync(ref, {
        latestDecision: synthesized.decision,
        status: nextState.status,
        phase: nextState.phase,
        waitingFor: nextState.waitingFor,
        stopReason: nextState.stopReason,
        activeTicketId: updated.state.scope.ticketId,
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
    const run = await store.readRunAsync(input.ref);
    return { run: await applyRunPolicySnapshot(store, run, input.policySnapshot), created: false };
  }
  const ticketRef = input.ticketRef?.trim();
  if (!ticketRef) {
    throw new Error("ticketRef is required when creating a managed Ralph run");
  }
  const binding = await resolveRalphRunBinding(ctx.cwd, { ticketRef, planRef: input.planRef ?? null });
  if (binding.existingRun) {
    return {
      run: await applyRunPolicySnapshot(store, binding.existingRun, input.policySnapshot),
      created: false,
    };
  }
  const context = await readBoundRunContext(ctx.cwd, binding.planId, binding.ticketId);
  const scope = toBoundRunScope(context);
  const spec = context.specChangeId
    ? await createSpecStore(ctx.cwd)
        .readChange(context.specChangeId)
        .catch(() => null)
    : null;
  const packetContext = await buildPacketContext(ctx.cwd, scope, input.prompt, []);
  try {
    const created = await store.createRunAsync({
      title: deriveTitle(scope, spec?.state.title ?? null, context.planTitle, context.ticketTitle),
      objective: buildObjective(scope, input.prompt),
      summary: buildSummary(scope, input.prompt),
      scope,
      activeTicketId: scope.ticketId,
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
        note: `Managed Ralph loop created for ${ticketRef}.`,
      },
      policySnapshot: input.policySnapshot,
      launchInstructions: buildRunInstructions(scope, input.prompt),
    });
    return { run: created, created: true };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Ralph run already exists")) {
      const run = await store.readRunAsync(binding.runId);
      return { run: await applyRunPolicySnapshot(store, run, input.policySnapshot), created: false };
    }
    throw error;
  }
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

async function syncBoundRunScope(
  ctx: RalphContextLike,
  run: RalphReadResult,
  steeringPrompt: string | undefined,
): Promise<{ run: RalphReadResult; context: BoundRunContext }> {
  const planId = run.state.scope.planId ?? run.state.linkedRefs.planIds[0] ?? "";
  const ticketId = run.state.scope.ticketId ?? run.state.linkedRefs.ticketIds[0] ?? "";
  const context = await readBoundRunContext(ctx.cwd, planId, ticketId).catch(() => ({
    planId,
    planTitle: run.state.title,
    ticketId,
    ticketTitle: run.state.activeTicketId ?? ticketId,
    specChangeId: run.state.scope.specChangeId,
    roadmapItemIds: run.state.scope.roadmapItemIds,
    initiativeIds: run.state.scope.initiativeIds,
    researchIds: run.state.scope.researchIds,
    critiqueIds: run.state.scope.critiqueIds,
    docIds: run.state.scope.docIds,
  }));
  const scope = toBoundRunScope(context);
  const packetContext = await buildPacketContext(ctx.cwd, scope, steeringPrompt, summarizePriorLearnings(run, scope));
  return {
    context,
    run: await createRalphStore(ctx.cwd).updateRunAsync(run.state.runId, {
      scope,
      activeTicketId: scope.ticketId,
      packetContext,
      scheduler: { updatedAt: new Date().toISOString() },
    }),
  };
}

async function reconcileTicketRunAfterIteration(ctx: RalphContextLike, run: RalphReadResult): Promise<RalphReadResult> {
  const store = createRalphStore(ctx.cwd);

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
      activeTicketId: run.state.scope.ticketId,
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

  if (run.state.latestDecision?.kind === "complete") {
    return store.updateRunAsync(run.state.runId, {
      scheduler: { status: "completed", updatedAt: new Date().toISOString(), note: run.state.latestDecision.summary },
    });
  }

  return store.updateRunAsync(run.state.runId, {
    activeTicketId: run.state.scope.ticketId,
    scheduler: {
      status: "running",
      updatedAt: new Date().toISOString(),
      note: `Continue ticket ${run.state.scope.ticketId ?? "(none)"}.`,
    },
  });
}

async function prepareBoundIteration(
  ctx: RalphContextLike,
  input: ExecuteRalphLoopInput,
  run: RalphReadResult,
): Promise<{ run: RalphReadResult; shouldExecute: boolean }> {
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
        activeTicketId: run.state.scope.ticketId,
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

  if (run.state.latestDecision?.kind === "halt" && !canRerunFromTerminalStatus(run.state.status)) {
    return {
      shouldExecute: false,
      run: await store.updateRunAsync(run.state.runId, {
        scheduler: { status: "completed", updatedAt: new Date().toISOString(), note: run.state.latestDecision.summary },
      }),
    };
  }

  if (run.state.latestDecision?.kind === "pause" || run.state.latestDecision?.kind === "escalate") {
    return {
      shouldExecute: false,
      run: await store.updateRunAsync(run.state.runId, {
        scheduler: {
          status: "waiting",
          updatedAt: new Date().toISOString(),
          note: run.state.latestDecision.summary,
        },
      }),
    };
  }

  if (run.state.latestDecision?.kind === "complete") {
    return {
      shouldExecute: false,
      run: await store.updateRunAsync(run.state.runId, {
        scheduler: { status: "completed", updatedAt: new Date().toISOString(), note: run.state.latestDecision.summary },
      }),
    };
  }

  const synchronized = await syncBoundRunScope(ctx, run, steeringText);
  return {
    shouldExecute: true,
    run: await store.updateRunAsync(synchronized.run.state.runId, {
      objective: buildObjective(synchronized.run.state.scope, steeringText),
      summary: buildSummary(synchronized.run.state.scope, steeringText),
      status: "active",
      phase: "deciding",
      waitingFor: "none",
      stopReason: null,
      activeTicketId: synchronized.run.state.scope.ticketId,
      scheduler: {
        status: "running",
        updatedAt: new Date().toISOString(),
        note: `Executing ${synchronized.run.state.scope.ticketId ?? "(none)"}.`,
      },
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
    run = await createRalphStore(ctx.cwd).setSchedulerAsync(run.state.runId, {
      status: "running",
      updatedAt: new Date().toISOString(),
      jobId: options.jobId ?? null,
      note: `Managed Ralph loop started for ${run.state.scope.ticketId ?? "(none)"}.`,
    });
    const maxIterationsForCall =
      typeof input.iterations === "number" && Number.isFinite(input.iterations) && input.iterations > 0
        ? Math.floor(input.iterations)
        : null;

    while (canPrepareFreshIteration(run.state.status)) {
      const prepared = await prepareBoundIteration(ctx, input, run);
      run = prepared.run;
      if (!prepared.shouldExecute || isTerminalStatus(run.state.status)) {
        break;
      }

      const launch = await reserveDurableLaunch(ctx, input, run, ensured.created);
      const executed = await executePreparedIteration(ctx, run.state.runId, signal, launch, options);
      run = await reconcileTicketRunAfterIteration(ctx, executed.run);
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

      if (run.state.scheduler.status !== "running" || run.state.latestDecision?.kind !== "continue") {
        break;
      }
      if (maxIterationsForCall !== null && steps.length >= maxIterationsForCall) {
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
    `Latest bounded iteration: ${latest.state.postIteration ? `${latest.state.postIteration.iteration} [${latest.state.postIteration.status}]` : "none"}`,
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
