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
import { type RalphCommandRenderDetails, renderRalphCommandMessage } from "./ui/renderers.js";

const RALPH_COMMAND = "ralph";
let removeRalphTerminalListener: (() => void) | null = null;

function isRalphCommandText(text: string): boolean {
  const trimmed = text.trim();
  return trimmed === `/${RALPH_COMMAND}` || trimmed.startsWith(`/${RALPH_COMMAND} `);
}

function getRalphCommandArgs(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith(`/${RALPH_COMMAND}`)) {
    return "";
  }
  return trimmed.slice(`/${RALPH_COMMAND}`.length).trim();
}

function sendRalphCommandMessage(
  pi: ExtensionAPI,
  customType: "ralph-command-result" | "ralph-command-error",
  content: string,
  details?: RalphCommandRenderDetails,
): void {
  if (!content.trim()) {
    return;
  }
  pi.sendMessage(
    {
      customType,
      content,
      display: true,
      details,
    },
    { triggerTurn: false },
  );
}

async function launchRalphCommand(pi: ExtensionAPI, args: string, ctx: ExtensionCommandContext): Promise<void> {
  try {
    const output = await handleRalphCommand(args, ctx);
    if (output.text) {
      sendRalphCommandMessage(pi, "ralph-command-result", output.text, {
        kind: "ralph_command",
        level: "result",
        prompt: output.prompt,
        result: output.result,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendRalphCommandMessage(pi, "ralph-command-error", message, {
      kind: "ralph_command",
      level: "error",
      prompt: args.trim() || null,
      result: null,
    });
    ctx.ui.notify(message, "error");
  }
}

function installRalphCommandListener(pi: ExtensionAPI, ctx: ExtensionContext): void {
  if (!ctx.hasUI || typeof ctx.ui?.onTerminalInput !== "function") {
    return;
  }

  removeRalphTerminalListener?.();
  removeRalphTerminalListener = ctx.ui.onTerminalInput((data) => {
    if (data !== "\r" && data !== "\n") {
      return undefined;
    }

    const text = ctx.ui.getEditorText().trim();
    if (!isRalphCommandText(text)) {
      return undefined;
    }

    ctx.ui.setEditorText("");
    void launchRalphCommand(pi, getRalphCommandArgs(text), ctx as ExtensionCommandContext);
    return { consume: true };
  });
}

export default function piRalph(pi: ExtensionAPI): void {
  pi.registerMessageRenderer("ralph-command-result", (message, options, theme) =>
    renderRalphCommandMessage(message as { content: string; details?: RalphCommandRenderDetails }, options, theme),
  );
  pi.registerMessageRenderer("ralph-command-error", (message, options, theme) =>
    renderRalphCommandMessage(message as { content: string; details?: RalphCommandRenderDetails }, options, theme),
  );

  pi.registerCommand(RALPH_COMMAND, {
    description: "Control ticket-bound managed Ralph runs for this workspace",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      await launchRalphCommand(pi, args, ctx);
    },
  });

  registerRalphTools(pi);

  pi.on("session_start", async (_event, ctx) => {
    await createRalphStore(ctx.cwd).initLedgerAsync();
    installRalphCommandListener(pi, ctx);
  });

  pi.on("session_switch", async (_event, ctx) => {
    installRalphCommandListener(pi, ctx);
  });

  pi.on("session_fork", async (_event, ctx) => {
    installRalphCommandListener(pi, ctx);
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
