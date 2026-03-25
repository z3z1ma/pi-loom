import { type HarnessExecutionResult, resolveExtensionRoot, runHarnessLaunch } from "#ralph/domain/harness.js";
import { getWorktreeEnv, provisionWorktree, resolveManagedWorktreeBranchName } from "#ralph/domain/worktree.js";
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
    const ticket = await createTicketStore(cwd).readTicketAsync(worktreeTicketRef);
    const repositoryId = ticket.summary.repository?.id ?? scope?.repositoryId;
    if (!repositoryId) {
      throw new Error(`Cannot resolve repository-scoped critique worktree branch for ${worktreeTicketRef}.`);
    }
    const branchName = await resolveManagedWorktreeBranchName({
      cwd,
      repositoryId,
      ticket,
      ownerKey: `critique:${worktreeTicketRef}`,
      metadata: {
        source: "critique-runtime",
        preferExternalRefNaming: preferExternalRefNaming ?? false,
      },
    });
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
