import type { ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { RalphReadResult, RalphRunStatus } from "./models.js";
import { runRalphLaunch, type RalphExecutionResult } from "./runtime.js";
import { createRalphStore } from "./store.js";

type RalphContextLike = Pick<ExtensionContext, "cwd" | "sessionManager"> | Pick<ExtensionCommandContext, "cwd" | "sessionManager">;

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

function isTerminalStatus(status: RalphRunStatus): boolean {
  return ["completed", "halted", "failed", "archived"].includes(status);
}

function shouldContinue(run: RalphReadResult): boolean {
  return run.state.latestDecision?.kind === "continue" && run.state.waitingFor === "none" && !isTerminalStatus(run.state.status);
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
  const branch = (ctx.sessionManager?.getBranch?.() ?? []) as Array<{ type?: string; message?: { role?: string; content?: unknown } }>;
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

async function persistRuntimeFailure(
  cwd: string,
  ref: string,
  execution: RalphExecutionResult,
  iterationId: string,
): Promise<RalphReadResult> {
  const store = createRalphStore(cwd);
  await store.appendIterationAsync(ref, {
    id: iterationId,
    status: "failed",
    summary: execution.stderr || execution.output || "Ralph subprocess exited unsuccessfully before finishing the iteration.",
    workerSummary: execution.exitCode === 0 ? "The subprocess returned success without durable Ralph iteration state." : `Subprocess exited with code ${execution.exitCode}.`,
    notes: ["Subprocess exited without leaving a durable post-iteration checkpoint."],
  });
  return store.decideRunAsync(ref, {
    runtimeFailure: true,
    summary: execution.stderr || execution.output || "Ralph subprocess exited unsuccessfully before finishing the iteration.",
    decidedBy: "runtime",
  });
}

async function executePreparedIteration(
  ctx: RalphContextLike,
  ref: string,
  signal: AbortSignal | undefined,
  run: RalphReadResult,
): Promise<{ run: RalphReadResult; execution: RalphExecutionResult }> {
  const store = createRalphStore(ctx.cwd);
  const execution = await runRalphLaunch(ctx.cwd, run.launch, signal, undefined);
  let updated = await store.readRunAsync(ref);

  if (
    execution.exitCode !== 0 ||
    updated.state.postIteration?.iterationId !== run.launch.iterationId ||
    updated.state.postIteration?.decision === null ||
    updated.state.postIteration === null
  ) {
    updated = await persistRuntimeFailure(ctx.cwd, ref, execution, run.launch.iterationId);
  }

  return { run: updated, execution };
}

async function ensureRun(ctx: RalphContextLike, input: ExecuteRalphLoopInput): Promise<{ run: RalphReadResult; created: boolean }> {
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
): Promise<ExecuteRalphLoopResult> {
  const store = createRalphStore(ctx.cwd);
  const loopCount = normalizeLoopCount(input.iterations);
  const conversationContext = buildConversationContext(ctx);
  const steeringInstructions = buildInstructions(input.prompt, conversationContext);
  const ensured = await ensureRun(ctx, input);
  let run = ensured.run;
  const steps: RalphLoopStepResult[] = [];

  for (let stepIndex = 0; stepIndex < loopCount; stepIndex += 1) {
    if (isTerminalStatus(run.state.status) || run.state.waitingFor !== "none") {
      break;
    }

    const launch =
      run.state.postIteration === null
        ? await store.prepareLaunchAsync(run.state.runId, {
            focus: input.prompt?.trim() || run.state.objective,
            instructions: stepIndex === 0 ? steeringInstructions : undefined,
          })
        : await store.resumeRunAsync(run.state.runId, {
            focus: stepIndex === 0 ? input.prompt?.trim() || run.state.objective : undefined,
            instructions: stepIndex === 0 ? steeringInstructions : undefined,
          });

    const executed = await executePreparedIteration(ctx, run.state.runId, signal, launch);
    run = executed.run;
    steps.push({
      iterationId: launch.launch.iterationId,
      iteration: launch.launch.iteration,
      exitCode: executed.execution.exitCode,
      output: executed.execution.output,
      stderr: executed.execution.stderr,
      finalStatus: run.state.status,
      finalDecision: run.state.latestDecision?.kind ?? null,
    });

    if (!shouldContinue(run)) {
      break;
    }
  }

  return { run, created: ensured.created, steps };
}

export function renderLoopResult(result: ExecuteRalphLoopResult): string {
  const latest = result.run;
  const summary = [
    `${latest.summary.id} [${latest.summary.status}/${latest.summary.phase}] ${latest.summary.title}`,
    `Iterations executed this call: ${result.steps.length}`,
    `Latest decision: ${latest.state.latestDecision?.kind ?? "none"}`,
    `Waiting for: ${latest.state.waitingFor}`,
    `Post-iteration checkpoint: ${latest.state.postIteration ? `${latest.state.postIteration.iteration} [${latest.state.postIteration.status}]` : "none"}`,
  ];

  const lastStep = result.steps.at(-1);
  if (lastStep) {
    summary.push(`Last subprocess exit code: ${lastStep.exitCode}`);
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
