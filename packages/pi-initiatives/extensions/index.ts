import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { handleInitiativeCommand } from "./commands/initiative.js";
import { createInitiativeStore } from "./domain/store.js";
import { buildInitiativeSystemPrompt, getBaseInitiativeGuidance } from "./prompts/guidance.js";
import { registerInitiativeTools } from "./tools/initiative.js";

const INITIATIVE_COMMAND = "initiative";

export default function piInitiatives(pi: ExtensionAPI): void {
  pi.registerCommand(INITIATIVE_COMMAND, {
    description: "Manage durable initiatives in the local .loom strategic memory",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const output = await handleInitiativeCommand(args, ctx);
      if (output) {
        ctx.ui.notify(output, "info");
      }
    },
  });

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
  commandName: INITIATIVE_COMMAND,
  getBaseInitiativeGuidance,
  buildInitiativeSystemPrompt,
  handleInitiativeCommand,
  createInitiativeStore,
};
