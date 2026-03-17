import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { handleDocsCommand } from "./commands/docs.js";
import { createDocumentationStore } from "./domain/store.js";
import { buildDocsSystemPrompt, getBaseDocsGuidance } from "./prompts/guidance.js";
import { registerDocsTools } from "./tools/docs.js";

const DOCS_COMMAND = "docs";

export default function piDocs(pi: ExtensionAPI): void {
  pi.registerCommand(DOCS_COMMAND, {
    description: "Manage durable high-level documentation memory in local Loom storage",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const output = await handleDocsCommand(args, ctx);
      if (output) {
        ctx.ui.notify(output, "info");
      }
    },
  });

  registerDocsTools(pi);

  pi.on("session_start", async (_event, ctx) => {
    await createDocumentationStore(ctx.cwd).initLedgerAsync();
  });

  pi.on("before_agent_start", async (event: BeforeAgentStartEvent, ctx: ExtensionContext) => {
    await createDocumentationStore(ctx.cwd).initLedgerAsync();
    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildDocsSystemPrompt(ctx.cwd)}`,
    };
  });
}

export const _test = {
  commandName: DOCS_COMMAND,
  getBaseDocsGuidance,
  buildDocsSystemPrompt,
  handleDocsCommand,
  createDocumentationStore,
};
