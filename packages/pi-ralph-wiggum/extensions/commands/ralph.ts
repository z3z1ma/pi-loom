import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import {
  type ExecuteRalphLoopResult,
  ensureRalphRun,
  executeRalphLoop,
  isRalphLoopExecutionInFlight,
  renderLoopResult,
  reserveDurableLaunch,
} from "../domain/loop.js";
import { createRalphStore } from "../domain/store.js";
import { type RalphLiveCommandWidgetState, renderRalphCommandWidgetLines } from "../ui/renderers.js";

const RALPH_COMMAND_USAGE = "Usage: /ralph [xN] <prompt>\n   or: /ralph resume <run-ref> [xN] [steering prompt]";
let activeRalphHeaderToken = 0;
const activeRalphWidgets = new Map<number, { ctx: ExtensionCommandContext; state: RalphLiveCommandWidgetState }>();
const RALPH_WIDGET_KEY = "ralph-live-run";

function parseIterations(raw: string | undefined): number {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return 1;
  }
  const match = trimmed.match(/^x(\d+)$/i);
  if (!match) {
    throw new Error(RALPH_COMMAND_USAGE);
  }
  const iterations = Number.parseInt(match[1] ?? "1", 10);
  if (!Number.isFinite(iterations) || iterations < 1) {
    throw new Error(RALPH_COMMAND_USAGE);
  }
  return iterations;
}

function parseLoopArgs(args: string): { iterations: number; prompt?: string; ref?: string } {
  const trimmed = args.trim();
  if (!trimmed) {
    throw new Error(RALPH_COMMAND_USAGE);
  }
  if (/^resume\b/i.test(trimmed) && !/^resume\s+\S+/i.test(trimmed)) {
    throw new Error(RALPH_COMMAND_USAGE);
  }
  if (/^x\d+$/i.test(trimmed)) {
    throw new Error(RALPH_COMMAND_USAGE);
  }

  const resumeMatch = trimmed.match(/^resume\s+(\S+)(?:\s+(x\d+))?(?:\s+([\s\S]+))?$/i);
  if (resumeMatch) {
    const ref = (resumeMatch[1] ?? "").trim();
    if (!ref) {
      throw new Error(RALPH_COMMAND_USAGE);
    }
    const prompt = (resumeMatch[3] ?? "").trim();
    return {
      ref,
      iterations: parseIterations(resumeMatch[2]),
      prompt: prompt || undefined,
    };
  }

  const match = trimmed.match(/^x(\d+)\s+([\s\S]+)$/i);
  if (!match) {
    return { iterations: 1, prompt: trimmed };
  }

  const iterations = parseIterations(`x${match[1] ?? "1"}`);

  const prompt = (match[2] ?? "").trim();
  if (!prompt) {
    throw new Error(RALPH_COMMAND_USAGE);
  }

  return { iterations, prompt };
}

export interface RalphCommandExecution {
  text: string;
  result: ExecuteRalphLoopResult;
  prompt: string | null;
}

function notifyProgress(ctx: ExtensionCommandContext, message: string): void {
  if (!message.trim()) {
    return;
  }
  if (typeof ctx.ui?.notify === "function") {
    ctx.ui.notify(message, "info");
  }
}

function renderTopRalphWidget(): void {
  const active = [...activeRalphWidgets.entries()].sort((left, right) => left[0] - right[0]).at(-1) ?? null;
  if (!active) {
    return;
  }
  const [token, payload] = active;
  payload.ctx.ui.setStatus(RALPH_WIDGET_KEY, renderRalphCommandWidgetLines(payload.state)[0]);
  for (const [otherToken, otherPayload] of activeRalphWidgets.entries()) {
    if (otherToken === token) {
      continue;
    }
    otherPayload.ctx.ui.setStatus(RALPH_WIDGET_KEY, undefined);
  }
}

async function rollbackReservedLaunch(
  ctx: ExtensionCommandContext,
  reservedRunId: string,
  reservedIterationId: string,
  previousState: ExecuteRalphLoopResult["run"]["state"],
  summary: string,
): Promise<void> {
  const store = createRalphStore(ctx.cwd);
  const current = await store.readRunAsync(reservedRunId);
  if (current.state.nextIterationId !== reservedIterationId || current.state.nextLaunch.runtime !== "session") {
    return;
  }
  await store.cancelLaunchAsync(reservedRunId, previousState, reservedIterationId, summary);
}

export async function handleRalphCommand(args: string, ctx: ExtensionCommandContext): Promise<RalphCommandExecution> {
  await createRalphStore(ctx.cwd).initLedgerAsync();
  const parsed = parseLoopArgs(args);
  const input = {
    ref: parsed.ref,
    prompt: parsed.prompt,
    iterations: parsed.iterations,
  };
  const ensured = await ensureRalphRun(ctx, input);
  const hasPreparedLaunch =
    ensured.run.state.nextLaunch?.runtime === "session" && ensured.run.state.nextIterationId !== null;
  if (isRalphLoopExecutionInFlight(ctx.cwd, ensured.run.state.runId)) {
    throw new Error(
      `Ralph run ${ensured.run.state.runId} already has an in-flight loop execution in workspace ${ctx.cwd}.`,
    );
  }
  let reservedWasFresh = false;
  const reserved =
    parsed.ref && hasPreparedLaunch
      ? parsed.prompt
        ? ensured.run.state.nextLaunch.resume
          ? await createRalphStore(ctx.cwd).resumeRunAsync(ensured.run.state.runId, {
              focus: parsed.prompt,
              instructions: [`Primary objective for the next bounded iteration: ${parsed.prompt}`],
            })
          : await createRalphStore(ctx.cwd).prepareLaunchAsync(ensured.run.state.runId, {
              focus: parsed.prompt,
              instructions: [`Primary objective for the next bounded iteration: ${parsed.prompt}`],
            })
        : ensured.run
      : await reserveDurableLaunch(ctx, input, ensured.run, ensured.created);
  reservedWasFresh = !(parsed.ref && hasPreparedLaunch);
  const headerToken = ++activeRalphHeaderToken;
  const widgetState: RalphLiveCommandWidgetState | null =
    ctx.hasUI && typeof ctx.ui?.setStatus === "function"
      ? {
          cwd: ctx.cwd,
          runId: reserved.state.runId,
          prompt: parsed.prompt ?? null,
          startedAt: Date.now(),
          initialRuntimeArtifactCount: ensured.run.runtimeArtifacts.length,
          updates: [],
        }
      : null;

  const applyWidget = () => {
    if (!widgetState) {
      return;
    }
    activeRalphWidgets.set(headerToken, { ctx, state: widgetState });
    renderTopRalphWidget();
  };

  if (widgetState) {
    applyWidget();
  }

  try {
    const result = await executeRalphLoop(ctx, { ...input, ref: reserved.state.runId }, undefined, {
      onUpdate: (message) => {
        if (!message.trim()) {
          return;
        }
        if (!widgetState) {
          notifyProgress(ctx, message);
          return;
        }
        widgetState.updates = [...widgetState.updates, message].slice(-8);
        applyWidget();
      },
    });
    const normalizedResult = ensured.created ? { ...result, created: true } : result;
    return {
      text: renderLoopResult(normalizedResult),
      result: normalizedResult,
      prompt: parsed.prompt ?? null,
    };
  } catch (error) {
    if (reservedWasFresh) {
      await rollbackReservedLaunch(
        ctx,
        reserved.state.runId,
        reserved.launch.iterationId,
        ensured.run.state,
        "Ralph command launch failed before a worker session started.",
      );
    }
    throw error;
  } finally {
    if (widgetState) {
      activeRalphWidgets.delete(headerToken);
      if (activeRalphWidgets.size === 0) {
        ctx.ui.setStatus(RALPH_WIDGET_KEY, undefined);
      } else {
        renderTopRalphWidget();
      }
    }
  }
}
