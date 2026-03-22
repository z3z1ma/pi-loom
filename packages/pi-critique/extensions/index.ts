import type { BeforeAgentStartEvent, ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { createCritiqueStore } from "./domain/store.js";
import { buildCritiqueSystemPrompt, getBaseCritiqueGuidance } from "./prompts/guidance.js";
import { registerCritiqueTools } from "./tools/critique.js";

export default function piCritique(pi: ExtensionAPI): void {
  registerCritiqueTools(pi);

  pi.on("session_start", async (_event, ctx) => {
    await createCritiqueStore(ctx.cwd).initLedgerAsync();
  });

  pi.on("before_agent_start", async (event: BeforeAgentStartEvent, ctx: ExtensionContext) => {
    await createCritiqueStore(ctx.cwd).initLedgerAsync();
    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildCritiqueSystemPrompt(ctx.cwd)}`,
    };
  });
}

export const _test = {
  getBaseCritiqueGuidance,
  buildCritiqueSystemPrompt,
  createCritiqueStore,
};
