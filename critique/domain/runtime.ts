import { type HarnessExecutionResult, resolveExtensionRoot, runHarnessLaunch } from "#ralph/domain/harness.js";
import { getWorktreeEnv, provisionWorktree, resolveLatestWorktreeName } from "#ralph/domain/worktree.js";
import { type LoomRuntimeScope, runtimeScopeToEnv } from "#storage/runtime-scope.js";
import { createTicketStore } from "#ticketing/domain/store.js";
import type { CritiqueLaunchDescriptor } from "./models.js";
import { renderLaunchPrompt } from "./render.js";

export type CritiqueExecutionResult = HarnessExecutionResult;

export function resolveExtensionPackageRoot(): string {
  return resolveExtensionRoot();
}

export async function runCritiqueLaunch(
  cwd: string,
  launch: CritiqueLaunchDescriptor,
  signal: AbortSignal | undefined,
  onUpdate?: (text: string) => void,
  scope?: LoomRuntimeScope,
  worktreeTicketRef?: string,
  preferExternalRefNaming?: boolean,
): Promise<CritiqueExecutionResult> {
  const extensionRoot = resolveExtensionPackageRoot();
  const prompt = renderLaunchPrompt(cwd, launch);

  let finalCwd = cwd;
  let worktreeEnv: Record<string, string> = {};

  if (worktreeTicketRef) {
    let externalRefs: string[] = [];
    if (preferExternalRefNaming) {
      try {
        const ticketStore = createTicketStore(cwd);
        const ticket = await ticketStore.readTicketAsync(worktreeTicketRef);
        externalRefs = ticket.ticket.frontmatter["external-refs"] || [];
      } catch {
        // Ignore ticket lookup failures; fallback to internal ref naming
      }
    }

    const branchName = resolveLatestWorktreeName(
      { ref: worktreeTicketRef, externalRefs },
      cwd,
      preferExternalRefNaming ?? false,
    );
    finalCwd = provisionWorktree(cwd, branchName);
    worktreeEnv = getWorktreeEnv(cwd);
  }

  const env = {
    ...(scope ? runtimeScopeToEnv(scope) : {}),
    ...worktreeEnv,
  };

  return runHarnessLaunch(
    finalCwd,
    prompt,
    signal,
    onUpdate,
    env,
    undefined, // onEvent
    extensionRoot,
  );
}
