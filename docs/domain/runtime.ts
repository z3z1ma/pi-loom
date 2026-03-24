import { type LoomRuntimeScope, runtimeScopeToEnv } from "#storage/runtime-scope.js";
import {
  type HarnessExecutionResult,
  type HarnessRuntimeEvent,
  resolveExtensionRoot,
  runHarnessLaunch,
} from "#ralph/domain/harness.js";
import {
  getWorktreeEnv,
  provisionWorktree,
  resolveWorktreeName,
} from "#ralph/domain/worktree.js";
import { createTicketStore } from "#ticketing/domain/store.js";

export type DocsExecutionResult = HarnessExecutionResult;

export function resolveDocsPackageRoot(): string {
  // Use the shared resolution logic which looks for package.json with pi.extensions
  return resolveExtensionRoot();
}

export interface DocsUpdateLaunchConfig {
  extensionRoot: string;
  // We don't expose spawn command details directly in the new runtime model
  // but keeping the type if needed for compatibility, though it's likely unused externally.
  env: Record<string, string>;
}

export function getDocsUpdateLaunchConfig(
  _cwd: string,
  _prompt: string,
  scope: LoomRuntimeScope | undefined,
): DocsUpdateLaunchConfig {
  const extensionRoot = resolveDocsPackageRoot();
  return {
    extensionRoot,
    env: scope ? runtimeScopeToEnv(scope) : {},
  };
}

export async function runDocsUpdate(
  cwd: string,
  prompt: string,
  signal: AbortSignal | undefined,
  onUpdate?: (text: string) => void,
  scope?: LoomRuntimeScope,
  worktreeTicketRef?: string,
  preferExternalRefNaming?: boolean,
): Promise<DocsExecutionResult> {
  let finalCwd = cwd;
  let worktreeEnv: Record<string, string> = {};

  if (worktreeTicketRef) {
    let externalRefs: string[] = [];
    if (preferExternalRefNaming) {
      try {
        const ticket = await createTicketStore(cwd).readTicketAsync(worktreeTicketRef);
        externalRefs = ticket.ticket.frontmatter["external-refs"] || [];
      } catch {
        // Fallback if ticket lookup fails
      }
    }
    const branchName = resolveWorktreeName(
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

  // runHarnessLaunch handles the session dir, tailing, and output parsing
  return runHarnessLaunch(
    finalCwd,
    prompt,
    signal,
    onUpdate,
    env,
    undefined, // onEvent
    undefined, // extensionRoot (auto-resolve)
  );
}
