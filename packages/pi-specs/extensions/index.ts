import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { createSpecStore } from "./domain/store.js";
import { buildSpecSystemPrompt, getBaseSpecGuidance } from "./prompts/guidance.js";
import { registerSpecTools } from "./tools/spec.js";

export default function piSpecs(pi: ExtensionAPI): void {
  registerSpecTools(pi);

  pi.on("session_start", async (_event, ctx) => {
    await createSpecStore(ctx.cwd).initLedger();
  });

  pi.on("before_agent_start", async (event: BeforeAgentStartEvent, ctx: ExtensionContext) => {
    await createSpecStore(ctx.cwd).initLedger();
    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildSpecSystemPrompt(ctx.cwd)}`,
    };
  });
}

export const _test = {
  getBaseSpecGuidance,
  buildSpecSystemPrompt,
  createSpecStore,
};
