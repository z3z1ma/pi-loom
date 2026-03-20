import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { createPlanStore } from "./domain/store.js";
import { buildPlanSystemPrompt, getBasePlanGuidance } from "./prompts/guidance.js";
import { registerPlanTools } from "./tools/plan.js";

export default function piPlans(pi: ExtensionAPI): void {
  registerPlanTools(pi);

  pi.on("session_start", async (_event, ctx) => {
    await createPlanStore(ctx.cwd).initLedger();
  });

  pi.on("before_agent_start", async (event: BeforeAgentStartEvent, ctx: ExtensionContext) => {
    await createPlanStore(ctx.cwd).initLedger();
    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildPlanSystemPrompt(ctx.cwd)}`,
    };
  });
}

export const _test = {
  getBasePlanGuidance,
  buildPlanSystemPrompt,
  createPlanStore,
};
