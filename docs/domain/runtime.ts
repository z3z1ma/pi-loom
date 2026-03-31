import { type HarnessExecutionResult, resolveExtensionRoot, runHarnessLaunch } from "#ralph/domain/harness.js";
import { getWorktreeEnv, provisionWorktree, resolveManagedWorktreeBranchName } from "#ralph/domain/worktree.js";
import { type LoomRuntimeScope, runtimeScopeToEnv } from "#storage/runtime-scope.js";
import { withDisabledRuntimeTools } from "#storage/runtime-tools.js";
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
  const env = withDisabledRuntimeTools(scope ? runtimeScopeToEnv(scope) : {}, ["docs_update"]);
  return {
    extensionRoot,
    env,
  };
}

export async function runDocsUpdate(
  cwd: string,
  prompt: string,
  signal: AbortSignal | undefined,
  onUpdate?: (text: string) => void,
  scope?: LoomRuntimeScope,
  worktreeTicketRef?: string,
): Promise<DocsExecutionResult> {
  let finalCwd = cwd;
  let worktreeEnv: Record<string, string> = {};

  if (worktreeTicketRef) {
    const ticket = await createTicketStore(cwd).readTicketAsync(worktreeTicketRef);
    const repositoryId = ticket.summary.repository?.id ?? scope?.repositoryId;
    if (!repositoryId) {
      throw new Error(`Cannot resolve repository-scoped docs worktree branch for ${worktreeTicketRef}.`);
    }
    const branchName = await resolveManagedWorktreeBranchName({
      cwd,
      repositoryId,
      ticket,
      ownerKey: `docs:${worktreeTicketRef}`,
      metadata: {
        source: "docs-runtime",
      },
    });
    finalCwd = provisionWorktree(cwd, branchName);
    worktreeEnv = getWorktreeEnv(cwd);
  }

  const env = withDisabledRuntimeTools(
    {
      ...(scope ? runtimeScopeToEnv(scope) : {}),
      ...worktreeEnv,
    },
    ["docs_update"],
  );

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
