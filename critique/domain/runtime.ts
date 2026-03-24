import { type LoomRuntimeScope, runtimeScopeToEnv } from "#storage/runtime-scope.js";
import { type HarnessExecutionResult, resolveExtensionRoot, runHarnessLaunch } from "#ralph/domain/harness.js";
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
): Promise<CritiqueExecutionResult> {
  const extensionRoot = resolveExtensionPackageRoot();
  const prompt = renderLaunchPrompt(cwd, launch);
  const env = scope ? runtimeScopeToEnv(scope) : undefined;

  return runHarnessLaunch(
    cwd,
    prompt,
    signal,
    onUpdate,
    env,
    undefined, // onEvent
    extensionRoot
  );
}
