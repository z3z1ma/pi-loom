import type { BeforeAgentStartEvent, ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { createConstitutionalStore } from "./domain/store.js";
import { buildConstitutionalSystemPrompt, getBaseConstitutionalGuidance } from "./prompts/guidance.js";
import { registerConstitutionTools } from "./tools/constitution.js";

export default function piConstitution(pi: ExtensionAPI): void {
  registerConstitutionTools(pi);

  pi.on("session_start", async (_event, ctx) => {
    await createConstitutionalStore(ctx.cwd).initLedger();
  });

  pi.on("before_agent_start", async (event: BeforeAgentStartEvent, ctx: ExtensionContext) => {
    await createConstitutionalStore(ctx.cwd).initLedger();
    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildConstitutionalSystemPrompt(ctx.cwd)}`,
    };
  });
}

export const _test = {
  getBaseConstitutionalGuidance,
  buildConstitutionalSystemPrompt,
  createConstitutionalStore,
};
