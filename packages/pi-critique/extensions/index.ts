import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { handleCritiqueCommand } from "./commands/critique.js";
import { createCritiqueStore } from "./domain/store.js";
import { buildCritiqueSystemPrompt, getBaseCritiqueGuidance } from "./prompts/guidance.js";
import { registerCritiqueTools } from "./tools/critique.js";

const CRITIQUE_COMMAND = "critique";

export default function piCritique(pi: ExtensionAPI): void {
  pi.registerCommand(CRITIQUE_COMMAND, {
    description: "Manage durable critique packets, runs, findings, and launch descriptors in local Loom memory",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const output = await handleCritiqueCommand(args, ctx);
      if (output) {
        ctx.ui.notify(output, "info");
      }
    },
  });

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
  commandName: CRITIQUE_COMMAND,
  getBaseCritiqueGuidance,
  buildCritiqueSystemPrompt,
  handleCritiqueCommand,
  createCritiqueStore,
};
