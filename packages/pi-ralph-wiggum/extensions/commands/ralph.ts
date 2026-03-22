import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { ExecuteRalphLoopResult } from "../domain/loop.js";
import { findActiveRalphRun } from "../domain/loop.js";
import { renderRalphDetail } from "../domain/render.js";
import { createRalphStore } from "../domain/store.js";
import { resolveTargetRalphRun, startRalphLoopJob, stopRalphLoop } from "../tools/ralph.js";

const RALPH_COMMAND_USAGE = [
  "Usage: /ralph start <plan-ref> [steering prompt]",
  "   or: /ralph stop [run-ref]",
  "   or: /ralph steer <text>",
  "   or: /ralph steer ref <run-ref> <text>",
  "   or: /ralph status [run-ref]",
].join("\n");
const RALPH_STATUS_KEY = "ralph-live-run";

interface RalphStartArgs {
  kind: "start";
  planRef: string;
  prompt?: string;
}

interface RalphStopArgs {
  kind: "stop";
  ref?: string;
}

interface RalphSteerArgs {
  kind: "steer";
  ref?: string;
  text: string;
}

interface RalphStatusArgs {
  kind: "status";
  ref?: string;
}

type RalphCommandArgs = RalphStartArgs | RalphStopArgs | RalphSteerArgs | RalphStatusArgs;

function parseLoopArgs(args: string): RalphCommandArgs {
  const trimmed = args.trim();
  if (!trimmed) {
    throw new Error(RALPH_COMMAND_USAGE);
  }

  const startMatch = trimmed.match(/^start\s+(\S+)(?:\s+([\s\S]+))?$/i);
  if (startMatch) {
    return {
      kind: "start",
      planRef: (startMatch[1] ?? "").trim(),
      prompt: (startMatch[2] ?? "").trim() || undefined,
    };
  }

  const stopMatch = trimmed.match(/^stop(?:\s+(\S+))?$/i);
  if (stopMatch) {
    return {
      kind: "stop",
      ref: (stopMatch[1] ?? "").trim() || undefined,
    };
  }

  const steerRefMatch = trimmed.match(/^steer\s+ref\s+(\S+)\s+([\s\S]+)$/i);
  if (steerRefMatch) {
    return {
      kind: "steer",
      ref: (steerRefMatch[1] ?? "").trim(),
      text: (steerRefMatch[2] ?? "").trim(),
    };
  }

  const steerMatch = trimmed.match(/^steer\s+([\s\S]+)$/i);
  if (steerMatch) {
    return {
      kind: "steer",
      text: (steerMatch[1] ?? "").trim(),
    };
  }

  const statusMatch = trimmed.match(/^status(?:\s+(\S+))?$/i);
  if (statusMatch) {
    return {
      kind: "status",
      ref: (statusMatch[1] ?? "").trim() || undefined,
    };
  }

  throw new Error(RALPH_COMMAND_USAGE);
}

export interface RalphCommandExecution {
  text: string;
  result: ExecuteRalphLoopResult | null;
  prompt: string | null;
}

export async function handleRalphCommand(args: string, ctx: ExtensionCommandContext): Promise<RalphCommandExecution> {
  await createRalphStore(ctx.cwd).initLedgerAsync();
  const parsed = parseLoopArgs(args);

  switch (parsed.kind) {
    case "start": {
      const active = await findActiveRalphRun(ctx.cwd);
      const activePlanId = active?.state.scope.planId ?? null;
      if (active && activePlanId && activePlanId !== parsed.planRef) {
        throw new Error(
          `Workspace ${ctx.cwd} already has active Ralph loop ${active.summary.id} for plan ${activePlanId}. Stop it before starting plan ${parsed.planRef}.`,
        );
      }
      const started = await startRalphLoopJob(
        ctx,
        active && activePlanId === parsed.planRef
          ? { ref: active.state.runId, prompt: parsed.prompt }
          : { planRef: parsed.planRef, prompt: parsed.prompt },
        async (text) => {
          if (typeof ctx.ui?.setStatus === "function") {
            ctx.ui.setStatus(
              RALPH_STATUS_KEY,
              text.trim() ? `⏳ Ralph · ${text.trim()}` : `⏳ Ralph · ${parsed.planRef}`,
            );
          }
        },
      );
      return {
        text: started.alreadyRunning
          ? `Managed Ralph loop ${started.run.summary.id} is already running as job ${started.jobId}.`
          : `Started managed Ralph loop ${started.run.summary.id} for plan ${started.run.state.scope.planId ?? parsed.planRef} as job ${started.jobId}.`,
        result: null,
        prompt: parsed.prompt ?? null,
      };
    }
    case "stop": {
      const stopped = await stopRalphLoop(ctx, parsed.ref);
      if (typeof ctx.ui?.setStatus === "function") {
        ctx.ui.setStatus(RALPH_STATUS_KEY, undefined);
      }
      return {
        text: stopped.cancelledJobId
          ? `Requested stop for Ralph loop ${stopped.run.summary.id} and cancelled job ${stopped.cancelledJobId}.`
          : `Requested stop for Ralph loop ${stopped.run.summary.id}.`,
        result: null,
        prompt: null,
      };
    }
    case "steer": {
      const target = await resolveTargetRalphRun(ctx, parsed.ref);
      await createRalphStore(ctx.cwd).queueSteeringAsync(target.state.runId, parsed.text);
      return {
        text: `Queued steering for Ralph loop ${target.summary.id}.`,
        result: null,
        prompt: parsed.text,
      };
    }
    case "status": {
      const run = await resolveTargetRalphRun(ctx, parsed.ref);
      return {
        text: renderRalphDetail(run),
        result: null,
        prompt: null,
      };
    }
  }
}
