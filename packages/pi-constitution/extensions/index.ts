import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { handleConstitutionCommand } from "./commands/constitution.js";
import { createConstitutionalStore } from "./domain/store.js";
import { buildConstitutionalSystemPrompt, getBaseConstitutionalGuidance } from "./prompts/guidance.js";
import { registerConstitutionTools } from "./tools/constitution.js";

const CONSTITUTION_COMMAND = "constitution";

export default function piConstitution(pi: ExtensionAPI): void {
  pi.registerCommand(CONSTITUTION_COMMAND, {
    description: "Manage durable constitutional memory in the local .loom project context",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const output = await handleConstitutionCommand(args, ctx);
      if (output) {
        ctx.ui.notify(output, "info");
      }
    },
  });

  registerConstitutionTools(pi);

  pi.on("session_start", async (_event, ctx) => {
    createConstitutionalStore(ctx.cwd).initLedger();
  });

  pi.on("before_agent_start", async (event: BeforeAgentStartEvent, ctx: ExtensionContext) => {
    createConstitutionalStore(ctx.cwd).initLedger();
    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildConstitutionalSystemPrompt(ctx.cwd)}`,
    };
  });
}

export const _test = {
  commandName: CONSTITUTION_COMMAND,
  getBaseConstitutionalGuidance,
  buildConstitutionalSystemPrompt,
  handleConstitutionCommand,
  createConstitutionalStore,
};
