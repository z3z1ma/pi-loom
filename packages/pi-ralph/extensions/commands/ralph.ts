import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { executeRalphLoop, renderLoopResult } from "../domain/loop.js";
import { createRalphStore } from "../domain/store.js";

function parseLoopArgs(args: string): { iterations: number; prompt: string } {
  const trimmed = args.trim();
  if (!trimmed) {
    throw new Error("Usage: /ralph [xN] <prompt>");
  }

  const match = trimmed.match(/^x(\d+)\s+([\s\S]+)$/i);
  if (!match) {
    return { iterations: 1, prompt: trimmed };
  }

  const iterations = Number.parseInt(match[1] ?? "1", 10);
  if (!Number.isFinite(iterations) || iterations < 1) {
    throw new Error("Usage: /ralph [xN] <prompt>");
  }

  const prompt = (match[2] ?? "").trim();
  if (!prompt) {
    throw new Error("Usage: /ralph [xN] <prompt>");
  }

  return { iterations, prompt };
}

export async function handleRalphCommand(args: string, ctx: ExtensionCommandContext): Promise<string> {
  await createRalphStore(ctx.cwd).initLedgerAsync();
  const parsed = parseLoopArgs(args);
  const result = await executeRalphLoop(ctx, {
    prompt: parsed.prompt,
    iterations: parsed.iterations,
  });
  return renderLoopResult(result);
}
