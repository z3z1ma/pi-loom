import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { handleManagerCommand } from "./commands/manager.js";
import { handleWorkerCommand } from "./commands/worker.js";
import { createWorkerStore } from "./domain/store.js";
import { buildWorkerSystemPrompt, getBaseWorkerGuidance } from "./prompts/guidance.js";
import { registerManagerTools } from "./tools/manager.js";
import { registerWorkerTools } from "./tools/worker.js";

const MANAGER_COMMAND = "manager";
const WORKER_COMMAND = "worker";

export default function piWorkers(pi: ExtensionAPI): void {
  pi.registerCommand(MANAGER_COMMAND, {
    description:
      "Manage worker fleets, inbox backlog, supervision, approvals, and resume operations in local Loom memory",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const output = await handleManagerCommand(args, ctx);
      if (output) {
        ctx.ui.notify(output, "info");
      }
    },
  });

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

  registerManagerTools(pi);
  registerWorkerTools(pi);

  pi.on("session_start", async (_event, ctx) => {
    await createWorkerStore(ctx.cwd).initLedgerAsync();
  });

  pi.on("before_agent_start", async (event: BeforeAgentStartEvent, ctx: ExtensionContext) => {
    await createWorkerStore(ctx.cwd).initLedgerAsync();
    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildWorkerSystemPrompt(ctx.cwd)}`,
    };
  });
}

export const _test = {
  managerCommandName: MANAGER_COMMAND,
  commandName: WORKER_COMMAND,
  getBaseWorkerGuidance,
  buildWorkerSystemPrompt,
  handleManagerCommand,
  handleWorkerCommand,
  createWorkerStore,
};
