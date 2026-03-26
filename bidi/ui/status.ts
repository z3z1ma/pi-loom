import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
  ensureWorkspaceProjectionBootstrap,
  readWorkspaceProjectionDirtyReport,
  renderWorkspaceProjectionDirtySummary,
} from "#storage/projection-lifecycle.js";

const LOOM_SYNC_STATUS_KEY = "loom-sync";

export async function syncLoomSyncStatus(ctx: ExtensionContext): Promise<void> {
  if (!("ui" in ctx)) {
    return;
  }

  const ui = ctx.ui as ExtensionContext["ui"] & {
    setStatus?: (key: string, text: string | undefined) => void;
  };
  if (typeof ui?.setStatus !== "function") {
    return;
  }

  ensureWorkspaceProjectionBootstrap(ctx.cwd);
  const summary = renderWorkspaceProjectionDirtySummary(readWorkspaceProjectionDirtyReport(ctx.cwd));
  ui.setStatus(LOOM_SYNC_STATUS_KEY, summary);
}
