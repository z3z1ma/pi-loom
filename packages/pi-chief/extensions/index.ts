import type { BeforeAgentStartEvent, ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { createManagerStore } from "./domain/manager-store.js";
import { createWorkerStore } from "./domain/store.js";
import { buildChiefSystemPrompt, getBaseChiefGuidance } from "./prompts/guidance.js";
import { registerInternalManagerTools, registerManagerTools } from "./tools/manager.js";

export default function piChief(pi: ExtensionAPI): void {
  registerManagerTools(pi);
  if (process.env.PI_CHIEF_INTERNAL_MANAGER === "1") {
    registerInternalManagerTools(pi);
  }

  pi.on("session_start", async (_event, ctx) => {
    await createWorkerStore(ctx.cwd).initLedgerAsync();
  });

  pi.on("before_agent_start", async (event: BeforeAgentStartEvent, ctx: ExtensionContext) => {
    await createWorkerStore(ctx.cwd).initLedgerAsync();
    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildChiefSystemPrompt(ctx.cwd)}`,
    };
  });
}

export const _test = {
  getBaseChiefGuidance,
  buildChiefSystemPrompt,
  createWorkerStore,
  createManagerStore,
};
