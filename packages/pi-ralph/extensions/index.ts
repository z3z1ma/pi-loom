import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { handleRalphCommand } from "./commands/ralph.js";
import { createRalphStore } from "./domain/store.js";
import { buildRalphSystemPrompt, getBaseRalphGuidance } from "./prompts/guidance.js";
import { registerRalphTools } from "./tools/ralph.js";

const RALPH_COMMAND = "ralph";

export default function piRalph(pi: ExtensionAPI): void {
  pi.registerCommand(RALPH_COMMAND, {
    description: "Manage durable Ralph loop runs, packets, dashboards, and fresh-context launches in local Loom memory",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const output = await handleRalphCommand(args, ctx);
      if (output) {
        ctx.ui.notify(output, "info");
      }
    },
  });

  registerRalphTools(pi);

  pi.on("session_start", async (_event, ctx) => {
    await createRalphStore(ctx.cwd).initLedgerAsync();
  });

  pi.on("before_agent_start", async (event: BeforeAgentStartEvent, ctx: ExtensionContext) => {
    await createRalphStore(ctx.cwd).initLedgerAsync();
    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildRalphSystemPrompt(ctx.cwd)}`,
    };
  });
}

export const _test = {
  commandName: RALPH_COMMAND,
  getBaseRalphGuidance,
  buildRalphSystemPrompt,
  handleRalphCommand,
  createRalphStore,
};
