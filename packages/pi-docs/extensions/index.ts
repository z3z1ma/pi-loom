import type { BeforeAgentStartEvent, ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { createDocumentationStore } from "./domain/store.js";
import { buildDocsSystemPrompt, getBaseDocsGuidance } from "./prompts/guidance.js";
import { registerDocsTools } from "./tools/docs.js";

export default function piDocs(pi: ExtensionAPI): void {
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
  getBaseDocsGuidance,
  buildDocsSystemPrompt,
  createDocumentationStore,
};
