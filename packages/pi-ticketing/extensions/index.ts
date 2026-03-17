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
import { syncTicketHomeWidget } from "./ui/ticket-workspace.js";

const TICKET_COMMAND = "ticket";

async function refreshTicketHomeWidget(ctx: ExtensionContext): Promise<void> {
  try {
    await syncTicketHomeWidget(ctx);
  } catch {
    // Widget refresh is advisory; session and command flows should stay usable even if rendering fails.
  }
}

export default function piTicketing(pi: ExtensionAPI): void {
  pi.registerCommand(TICKET_COMMAND, {
    description: "Open the focused ticket workspace, create tickets, and review ready or blocked work",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const output = await handleTicketCommand(args, ctx);
      await refreshTicketHomeWidget(ctx);
      if (output) {
        ctx.ui.notify(output, "info");
      }
    },
  });

  registerTicketTools(pi);

  pi.on("session_start", async (_event, ctx) => {
    await createTicketStore(ctx.cwd).initLedgerAsync();
    await refreshTicketHomeWidget(ctx);
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
