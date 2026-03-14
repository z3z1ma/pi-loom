import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { handleWorkplanCommand } from "./commands/plan.js";
import { createPlanStore } from "./domain/store.js";
import { buildPlanSystemPrompt, getBasePlanGuidance } from "./prompts/guidance.js";
import { registerPlanTools } from "./tools/plan.js";

const WORKPLAN_COMMAND = "workplan";

export default function piPlans(pi: ExtensionAPI): void {
  pi.registerCommand(WORKPLAN_COMMAND, {
    description: "Manage durable execution plans in the local .loom plan memory",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const output = await handleWorkplanCommand(args, ctx);
      if (output) {
        ctx.ui.notify(output, "info");
      }
    },
  });

  registerPlanTools(pi);

  pi.on("session_start", async (_event, ctx) => {
    createPlanStore(ctx.cwd).initLedger();
  });

  pi.on("before_agent_start", async (event: BeforeAgentStartEvent, ctx: ExtensionContext) => {
    createPlanStore(ctx.cwd).initLedger();
    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildPlanSystemPrompt(ctx.cwd)}`,
    };
  });
}

export const _test = {
  commandName: WORKPLAN_COMMAND,
  getBasePlanGuidance,
  buildPlanSystemPrompt,
  handleWorkplanCommand,
  createPlanStore,
};
