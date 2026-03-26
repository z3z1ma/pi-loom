import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { ensureWorkspaceProjectionBootstrap } from "#storage/projection-lifecycle.js";
import {
  handleLoomExportCommand,
  handleLoomReconcileCommand,
  handleLoomRefreshCommand,
  handleLoomStatusCommand,
} from "./commands/loom-sync.js";
import { registerProjectionTools } from "./tools/projections.js";
import { syncLoomSyncStatus } from "./ui/status.js";

const LOOM_STATUS_COMMAND = "loom-status";
const LOOM_EXPORT_COMMAND = "loom-export";
const LOOM_REFRESH_COMMAND = "loom-refresh";
const LOOM_RECONCILE_COMMAND = "loom-reconcile";

async function notifyResult(ctx: ExtensionCommandContext | ExtensionContext, text: string): Promise<void> {
  if (!text || !("ui" in ctx) || typeof ctx.ui?.notify !== "function") {
    return;
  }
  ctx.ui.notify(text, "info");
}

async function refreshStatus(ctx: ExtensionContext): Promise<void> {
  try {
    await syncLoomSyncStatus(ctx);
  } catch {
    // Status refresh is advisory; Loom sync commands should stay usable even if the UI cannot render it.
  }
}

export default function piBidi(pi: ExtensionAPI): void {
  pi.registerCommand(LOOM_STATUS_COMMAND, {
    description: "Inspect the current .loom sync state for repo-visible Loom files",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      await notifyResult(ctx, await handleLoomStatusCommand(args, ctx));
    },
  });

  pi.registerCommand(LOOM_EXPORT_COMMAND, {
    description: "Export repo-visible .loom files from canonical Loom state",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      await notifyResult(ctx, await handleLoomExportCommand(args, ctx));
    },
  });

  pi.registerCommand(LOOM_REFRESH_COMMAND, {
    description: "Refresh exported .loom files from canonical Loom state",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      await notifyResult(ctx, await handleLoomRefreshCommand(args, ctx));
    },
  });

  pi.registerCommand(LOOM_RECONCILE_COMMAND, {
    description: "Reconcile edited .loom files back into canonical Loom state",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      await notifyResult(ctx, await handleLoomReconcileCommand(args, ctx));
    },
  });

  registerProjectionTools(pi);

  pi.on("session_start", async (_event, ctx) => {
    ensureWorkspaceProjectionBootstrap(ctx.cwd);
    await refreshStatus(ctx);
  });

  pi.on("session_switch", async (_event, ctx) => {
    ensureWorkspaceProjectionBootstrap(ctx.cwd);
    await refreshStatus(ctx);
  });

  pi.on("session_fork", async (_event, ctx) => {
    ensureWorkspaceProjectionBootstrap(ctx.cwd);
    await refreshStatus(ctx);
  });
}

export const _test = {
  commandNames: [LOOM_STATUS_COMMAND, LOOM_EXPORT_COMMAND, LOOM_REFRESH_COMMAND, LOOM_RECONCILE_COMMAND],
  handleLoomStatusCommand,
  handleLoomExportCommand,
  handleLoomRefreshCommand,
  handleLoomReconcileCommand,
};
