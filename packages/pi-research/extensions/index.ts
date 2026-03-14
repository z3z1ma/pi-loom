import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { handleResearchCommand } from "./commands/research.js";
import { createResearchStore } from "./domain/store.js";
import { buildResearchSystemPrompt, getBaseResearchGuidance } from "./prompts/guidance.js";
import { registerResearchTools } from "./tools/research.js";

const RESEARCH_COMMAND = "research";

export default function piResearch(pi: ExtensionAPI): void {
  pi.registerCommand(RESEARCH_COMMAND, {
    description: "Manage durable research in the local .loom knowledge memory",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const output = await handleResearchCommand(args, ctx);
      if (output) {
        ctx.ui.notify(output, "info");
      }
    },
  });

  registerResearchTools(pi);

  pi.on("session_start", async (_event, ctx) => {
    createResearchStore(ctx.cwd).initLedger();
  });

  pi.on("before_agent_start", async (event: BeforeAgentStartEvent, ctx: ExtensionContext) => {
    createResearchStore(ctx.cwd).initLedger();
    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildResearchSystemPrompt(ctx.cwd)}`,
    };
  });
}

export const _test = {
  commandName: RESEARCH_COMMAND,
  getBaseResearchGuidance,
  buildResearchSystemPrompt,
  handleResearchCommand,
  createResearchStore,
};
