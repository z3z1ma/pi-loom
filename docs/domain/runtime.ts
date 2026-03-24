import { type LoomRuntimeScope, runtimeScopeToEnv } from "#storage/runtime-scope.js";
import {
  type HarnessExecutionResult,
  type HarnessRuntimeEvent,
  resolveExtensionRoot,
  runHarnessLaunch,
} from "#ralph/domain/harness.js";

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
): Promise<DocsExecutionResult> {
  const env = scope ? runtimeScopeToEnv(scope) : undefined;

  // runHarnessLaunch handles the session dir, tailing, and output parsing
  return runHarnessLaunch(
    cwd,
    prompt,
    signal,
    onUpdate,
    env,
    undefined, // onEvent
    undefined  // extensionRoot (auto-resolve)
  );
}
