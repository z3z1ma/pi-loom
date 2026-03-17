import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { handleTicketCommand } from "./commands/ticket.js";
import { createTicketStore } from "./domain/store.js";
import { buildTicketingSystemPrompt, getBaseTicketingGuidance } from "./prompts/guidance.js";
import { registerTicketTools } from "./tools/ticket.js";

const TICKET_COMMAND = "ticket";

export default function piTicketing(pi: ExtensionAPI): void {
  pi.registerCommand(TICKET_COMMAND, {
    description: "Manage durable tickets in the local .loom ledger",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const output = await handleTicketCommand(args, ctx);
      if (output) {
        ctx.ui.notify(output, "info");
      }
    },
  });

  registerTicketTools(pi);

  pi.on("session_start", async (_event, ctx) => {
    await createTicketStore(ctx.cwd).initLedgerAsync();
  });

  pi.on("before_agent_start", async (event: BeforeAgentStartEvent, ctx: ExtensionContext) => {
    await createTicketStore(ctx.cwd).initLedgerAsync();
    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildTicketingSystemPrompt(ctx.cwd)}`,
    };
  });
}

export const _test = {
  commandName: TICKET_COMMAND,
  getBaseTicketingGuidance,
  buildTicketingSystemPrompt,
  handleTicketCommand,
  createTicketStore,
};
