import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { createWorkerStore } from "./domain/store.js";
import { buildWorkerSystemPrompt, getBaseWorkerGuidance } from "./prompts/guidance.js";
import { registerManagerTools } from "./tools/manager.js";
import { registerWorkerTools } from "./tools/worker.js";

export default function piWorkers(pi: ExtensionAPI): void {
  registerManagerTools(pi);
  registerWorkerTools(pi);

  pi.on("session_start", async (_event, ctx) => {
    await createWorkerStore(ctx.cwd).initLedgerAsync();
  });

  pi.on("before_agent_start", async (event: BeforeAgentStartEvent, ctx: ExtensionContext) => {
    await createWorkerStore(ctx.cwd).initLedgerAsync();
    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildWorkerSystemPrompt(ctx.cwd)}`,
    };
  });
}

export const _test = {
  getBaseWorkerGuidance,
  buildWorkerSystemPrompt,
  createWorkerStore,
};
