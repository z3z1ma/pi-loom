import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { createInitiativeStore } from "./domain/store.js";
import { buildInitiativeSystemPrompt, getBaseInitiativeGuidance } from "./prompts/guidance.js";
import { registerInitiativeTools } from "./tools/initiative.js";

export default function piInitiatives(pi: ExtensionAPI): void {
  registerInitiativeTools(pi);

  pi.on("session_start", async (_event, ctx) => {
    await createInitiativeStore(ctx.cwd).initLedger();
  });

  pi.on("before_agent_start", async (event: BeforeAgentStartEvent, ctx: ExtensionContext) => {
    await createInitiativeStore(ctx.cwd).initLedger();
    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildInitiativeSystemPrompt(ctx.cwd)}`,
    };
  });
}

export const _test = {
  getBaseInitiativeGuidance,
  buildInitiativeSystemPrompt,
  createInitiativeStore,
};
