import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { executeRalphLoop, renderLoopResult } from "../domain/loop.js";
import { createRalphStore } from "../domain/store.js";

const RALPH_COMMAND_USAGE = "Usage: /ralph [xN] <prompt>\n   or: /ralph resume <run-ref> [xN] [steering prompt]";

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

function notifyProgress(ctx: ExtensionCommandContext, message: string): void {
  if (!message.trim()) {
    return;
  }
  if (typeof ctx.ui?.notify === "function") {
    ctx.ui.notify(message, "info");
  }
}

export async function handleRalphCommand(args: string, ctx: ExtensionCommandContext): Promise<string> {
  await createRalphStore(ctx.cwd).initLedgerAsync();
  const parsed = parseLoopArgs(args);
  const result = await executeRalphLoop(
    ctx,
    {
      ref: parsed.ref,
      prompt: parsed.prompt,
      iterations: parsed.iterations,
    },
    undefined,
    {
      onUpdate: (message) => {
        notifyProgress(ctx, message);
      },
    },
  );
  return renderLoopResult(result);
}
