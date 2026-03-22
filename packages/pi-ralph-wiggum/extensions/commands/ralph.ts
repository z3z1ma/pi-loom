import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import {
  type ExecuteRalphLoopInput,
  type ExecuteRalphLoopResult,
  ensureRalphRun,
  executeRalphLoop,
  isRalphLoopExecutionInFlight,
  renderLoopResult,
  reserveDurableLaunch,
} from "../domain/loop.js";
import { createRalphStore } from "../domain/store.js";
import { type RalphLiveCommandWidgetState, renderRalphCommandWidgetLines } from "../ui/renderers.js";

const RALPH_COMMAND_USAGE =
  "Usage: /ralph plan <spec-ref> [steering prompt]\n   or: /ralph run <spec-ref> <plan-ref> <ticket-ref> [steering prompt]\n   or: /ralph resume <run-ref> [steering prompt]";
let activeRalphHeaderToken = 0;
const activeRalphWidgets = new Map<number, { ctx: ExtensionCommandContext; state: RalphLiveCommandWidgetState }>();
const RALPH_WIDGET_KEY = "ralph-live-run";

function parseLoopArgs(args: string): ExecuteRalphLoopInput {
  const trimmed = args.trim();
  if (!trimmed) {
    throw new Error(RALPH_COMMAND_USAGE);
  }

  const resumeMatch = trimmed.match(/^resume\s+(\S+)(?:\s+([\s\S]+))?$/i);
  if (resumeMatch) {
    return {
      ref: (resumeMatch[1] ?? "").trim(),
      prompt: (resumeMatch[2] ?? "").trim() || undefined,
    };
  }

  const planMatch = trimmed.match(/^plan\s+(\S+)(?:\s+([\s\S]+))?$/i);
  if (planMatch) {
    return {
      prompt: (planMatch[2] ?? "").trim() || undefined,
      scope: {
        mode: "plan",
        specRef: (planMatch[1] ?? "").trim(),
      },
    };
  }

  const runMatch = trimmed.match(/^run\s+(\S+)\s+(\S+)\s+(\S+)(?:\s+([\s\S]+))?$/i);
  if (runMatch) {
    return {
      prompt: (runMatch[4] ?? "").trim() || undefined,
      scope: {
        mode: "execute",
        specRef: (runMatch[1] ?? "").trim(),
        planRef: (runMatch[2] ?? "").trim(),
        ticketRef: (runMatch[3] ?? "").trim(),
      },
    };
  }

  throw new Error(RALPH_COMMAND_USAGE);
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

function summarizeActiveRalphStatus(line: string, activeCount: number): string {
  if (activeCount <= 1) {
    return line;
  }
  const suffix = line.replace(/^⏳ Ralph\s*·\s*/, "").trim();
  return suffix.length > 0
    ? `⏳ Ralph · ${activeCount} active · showing newest · ${suffix}`
    : `⏳ Ralph · ${activeCount} active`;
}

function renderTopRalphWidget(): void {
  const active = [...activeRalphWidgets.entries()].sort((left, right) => left[0] - right[0]).at(-1) ?? null;
  if (!active) {
    return;
  }
  const [token, payload] = active;
  const line = renderRalphCommandWidgetLines(payload.state)[0] ?? "⏳ Ralph";
  payload.ctx.ui.setStatus(RALPH_WIDGET_KEY, summarizeActiveRalphStatus(line, activeRalphWidgets.size));
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
  const input = parseLoopArgs(args);
  const ensured = await ensureRalphRun(ctx, input);
  const hasPreparedLaunch =
    ensured.run.state.nextLaunch?.runtime === "session" && ensured.run.state.nextIterationId !== null;
  if (isRalphLoopExecutionInFlight(ctx.cwd, ensured.run.state.runId)) {
    throw new Error(
      `Ralph run ${ensured.run.state.runId} already has an in-flight loop execution in workspace ${ctx.cwd}.`,
    );
  }

  let reservedWasFresh = false;
  let reserved = ensured.run;
  if (!hasPreparedLaunch) {
    reserved = await reserveDurableLaunch(ctx, input, ensured.run, ensured.created);
    reservedWasFresh = true;
  } else if (input.prompt?.trim()) {
    throw new Error(
      `Ralph run ${ensured.run.state.runId} already has a prepared launch; resume it without new steering or clear the prepared launch first.`,
    );
  }

  const headerToken = ++activeRalphHeaderToken;
  const widgetState: RalphLiveCommandWidgetState | null =
    ctx.hasUI && typeof ctx.ui?.setStatus === "function"
      ? {
          cwd: ctx.cwd,
          runId: reserved.state.runId,
          prompt: input.prompt ?? null,
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
      prompt: input.prompt ?? null,
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
