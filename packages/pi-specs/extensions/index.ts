import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { handleSpecCommand } from "./commands/spec.js";
import { createSpecStore } from "./domain/store.js";
import { buildSpecSystemPrompt, getBaseSpecGuidance } from "./prompts/guidance.js";
import { registerSpecTools } from "./tools/spec.js";

const SPEC_COMMAND = "spec";

export default function piSpecs(pi: ExtensionAPI): void {
  pi.registerCommand(SPEC_COMMAND, {
    description: "Manage durable specifications in SQLite-backed spec memory",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const output = await handleSpecCommand(args, ctx);
      if (output) {
        ctx.ui.notify(output, "info");
      }
    },
  });

  registerSpecTools(pi);

  pi.on("session_start", async (_event, ctx) => {
    await createSpecStore(ctx.cwd).initLedger();
  });

  pi.on("before_agent_start", async (event: BeforeAgentStartEvent, ctx: ExtensionContext) => {
    await createSpecStore(ctx.cwd).initLedger();
    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildSpecSystemPrompt(ctx.cwd)}`,
    };
  });
}

export const _test = {
  commandName: SPEC_COMMAND,
  getBaseSpecGuidance,
  buildSpecSystemPrompt,
  handleSpecCommand,
  createSpecStore,
};
