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
import { TicketCommandEditor } from "./ui/ticket-command-editor.js";
import { syncTicketHomeWidget } from "./ui/ticket-workspace.js";

const TICKET_COMMAND = "ticket";
let removeTicketTerminalListener: (() => void) | null = null;

function isTicketCommandText(text: string): boolean {
  const trimmed = text.trim();
  return trimmed === `/${TICKET_COMMAND}` || trimmed.startsWith(`/${TICKET_COMMAND} `);
}

function launchTicketWorkspace(ctx: ExtensionContext): void {
  void (async () => {
    const output = await handleTicketCommand("", ctx as ExtensionCommandContext);
    await refreshTicketHomeWidget(ctx);
    if (output) {
      ctx.ui.notify(output, "info");
    }
  })().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(message, "error");
  });
}

function installTicketCommandEditor(ctx: ExtensionContext): void {
  if (!ctx.hasUI) {
    return;
  }

  if (typeof ctx.ui?.onTerminalInput === "function") {
    removeTicketTerminalListener?.();
    removeTicketTerminalListener = ctx.ui.onTerminalInput((data) => {
      if (data !== "\r" && data !== "\n") {
        return undefined;
      }

      const text = ctx.ui.getEditorText().trim();
      if (!isTicketCommandText(text)) {
        return undefined;
      }

      ctx.ui.setEditorText("");
      launchTicketWorkspace(ctx);

      return { consume: true };
    });
  }

  ctx.ui.setEditorComponent(
    (tui, theme, keybindings) => new TicketCommandEditor(tui, theme, keybindings, () => launchTicketWorkspace(ctx)),
  );
}

async function refreshTicketHomeWidget(ctx: ExtensionContext): Promise<void> {
  try {
    await syncTicketHomeWidget(ctx);
  } catch {
    // Widget refresh is advisory; session and command flows should stay usable even if rendering fails.
  }
}

export default function piTicketing(pi: ExtensionAPI): void {
  pi.registerCommand(TICKET_COMMAND, {
    description: "Open the focused ticket workspace",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      const output = await handleTicketCommand("", ctx);
      await refreshTicketHomeWidget(ctx);
      if (output) {
        ctx.ui.notify(output, "info");
      }
    },
  });

  registerTicketTools(pi);

  pi.on("session_start", async (_event, ctx) => {
    await createTicketStore(ctx.cwd).initLedgerAsync();
    installTicketCommandEditor(ctx);
    await refreshTicketHomeWidget(ctx);
  });

  pi.on("session_switch", async (_event, ctx) => {
    installTicketCommandEditor(ctx);
    await refreshTicketHomeWidget(ctx);
  });

  pi.on("session_fork", async (_event, ctx) => {
    installTicketCommandEditor(ctx);
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
