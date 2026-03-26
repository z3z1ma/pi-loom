import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { ensureWorkspaceProjectionBootstrap } from "#storage/projection-lifecycle.js";
import {
  readWorkspaceSyncStatus,
  renderWorkspaceSyncAction,
  renderWorkspaceSyncStatus,
  runWorkspaceSyncAction,
  type WorkspaceSyncFamilyTarget,
} from "../domain/workspace-sync.js";
import { syncLoomSyncStatus } from "../ui/status.js";

const SYNC_FAMILIES = new Set([
  "constitution",
  "specs",
  "initiatives",
  "research",
  "plans",
  "docs",
  "tickets",
  "all",
]);

function parseSelectionArgs(
  args: string,
  options: { command: string; allowPaths: boolean },
): { family?: WorkspaceSyncFamilyTarget; relativePaths?: string[] } {
  const tokens = args
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const family = tokens[0] && SYNC_FAMILIES.has(tokens[0]) ? (tokens[0] as WorkspaceSyncFamilyTarget) : undefined;
  const relativePaths = family ? tokens.slice(1) : tokens;
  if (!options.allowPaths && relativePaths.length > 0) {
    throw new Error(`/${options.command} supports workspace or family scope only; omit file paths.`);
  }
  return { family, relativePaths: relativePaths.length > 0 ? relativePaths : undefined };
}

async function runStatus(args: string, ctx: ExtensionCommandContext): Promise<string> {
  ensureWorkspaceProjectionBootstrap(ctx.cwd);
  const selection = parseSelectionArgs(args, { command: "loom-status", allowPaths: true });
  const report = await readWorkspaceSyncStatus(ctx.cwd, selection);
  await syncLoomSyncStatus(ctx);
  return renderWorkspaceSyncStatus(report);
}

async function runAction(
  action: "export" | "refresh" | "reconcile",
  command: string,
  args: string,
  ctx: ExtensionCommandContext,
): Promise<string> {
  ensureWorkspaceProjectionBootstrap(ctx.cwd);
  const selection = parseSelectionArgs(args, { command, allowPaths: action === "reconcile" });
  const report = await runWorkspaceSyncAction(ctx.cwd, action, selection);
  await syncLoomSyncStatus(ctx);
  return renderWorkspaceSyncAction(report);
}

export async function handleLoomStatusCommand(args: string, ctx: ExtensionCommandContext): Promise<string> {
  return runStatus(args, ctx);
}

export async function handleLoomExportCommand(args: string, ctx: ExtensionCommandContext): Promise<string> {
  return runAction("export", "loom-export", args, ctx);
}

export async function handleLoomRefreshCommand(args: string, ctx: ExtensionCommandContext): Promise<string> {
  return runAction("refresh", "loom-refresh", args, ctx);
}

export async function handleLoomReconcileCommand(args: string, ctx: ExtensionCommandContext): Promise<string> {
  return runAction("reconcile", "loom-reconcile", args, ctx);
}
