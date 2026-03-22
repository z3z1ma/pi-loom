import type { BeforeAgentStartEvent, ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { createResearchStore } from "./domain/store.js";
import { buildResearchSystemPrompt, getBaseResearchGuidance } from "./prompts/guidance.js";
import { registerResearchTools } from "./tools/research.js";

export default function piResearch(pi: ExtensionAPI): void {
  registerResearchTools(pi);

  pi.on("session_start", async (_event, ctx) => {
    await createResearchStore(ctx.cwd).initLedger();
  });

  pi.on("before_agent_start", async (event: BeforeAgentStartEvent, ctx: ExtensionContext) => {
    await createResearchStore(ctx.cwd).initLedger();
    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildResearchSystemPrompt(ctx.cwd)}`,
    };
  });
}

export const _test = {
  getBaseResearchGuidance,
  buildResearchSystemPrompt,
  createResearchStore,
};
