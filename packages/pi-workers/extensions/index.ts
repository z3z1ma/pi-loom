import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { handleWorkerCommand } from "./commands/worker.js";
import { createWorkerStore } from "./domain/store.js";
import { buildWorkerSystemPrompt, getBaseWorkerGuidance } from "./prompts/guidance.js";
import { registerWorkerTools } from "./tools/worker.js";

const WORKER_COMMAND = "worker";

export default function piWorkers(pi: ExtensionAPI): void {
  pi.registerCommand(WORKER_COMMAND, {
    description:
      "Manage workspace-backed workers, messages, checkpoints, launches, approvals, and consolidation in local Loom memory",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const output = await handleWorkerCommand(args, ctx);
      if (output) {
        ctx.ui.notify(output, "info");
      }
    },
  });

  registerWorkerTools(pi);

  pi.on("session_start", async (_event, ctx) => {
    createWorkerStore(ctx.cwd).initLedger();
  });

  pi.on("before_agent_start", async (event: BeforeAgentStartEvent, ctx: ExtensionContext) => {
    createWorkerStore(ctx.cwd).initLedger();
    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildWorkerSystemPrompt(ctx.cwd)}`,
    };
  });
}

export const _test = {
  commandName: WORKER_COMMAND,
  getBaseWorkerGuidance,
  buildWorkerSystemPrompt,
  handleWorkerCommand,
  createWorkerStore,
};
