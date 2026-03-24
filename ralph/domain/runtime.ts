import {
  type HarnessExecutionResult,
  type HarnessRuntimeEvent,
  PI_HARNESS_COMMAND_ENV,
  PI_HARNESS_PACKAGE_ROOT_ENV,
  resolveExtensionRoot,
  runHarnessLaunch,
} from "./harness.js";
import type { RalphLaunchDescriptor, RalphRuntimeEvent } from "./models.js";
import { renderLaunchPrompt } from "./render.js";

export type {
  PiSpawnCommand,
  PiSpawnDeps,
} from "./harness.js";

export type RalphExecutionResult = HarnessExecutionResult;

export type RalphLaunchEvent = RalphRuntimeEvent;

export const PI_RALPH_HARNESS_COMMAND_ENV = "PI_RALPH_HARNESS_COMMAND";
export const PI_RALPH_HARNESS_PACKAGE_ROOT_ENV = "PI_RALPH_HARNESS_PACKAGE_ROOT";

export async function runRalphLaunch(
  cwd: string,
  launch: RalphLaunchDescriptor,
  signal: AbortSignal | undefined,
  onUpdate?: (text: string) => void,
  extraEnv?: Record<string, string | undefined>,
  onEvent?: (event: RalphLaunchEvent) => void | Promise<void>,
): Promise<RalphExecutionResult> {
  const env = { ...extraEnv };

  const commandOverride = env[PI_RALPH_HARNESS_COMMAND_ENV] ?? process.env[PI_RALPH_HARNESS_COMMAND_ENV];
  if (commandOverride && !env[PI_HARNESS_COMMAND_ENV]) {
    env[PI_HARNESS_COMMAND_ENV] = commandOverride;
  }

  const rootOverride = env[PI_RALPH_HARNESS_PACKAGE_ROOT_ENV] ?? process.env[PI_RALPH_HARNESS_PACKAGE_ROOT_ENV];
  if (rootOverride && !env[PI_HARNESS_PACKAGE_ROOT_ENV]) {
    env[PI_HARNESS_PACKAGE_ROOT_ENV] = rootOverride;
  }

  const prompt = renderLaunchPrompt(cwd, launch);

  return runHarnessLaunch(
    cwd,
    prompt,
    signal,
    onUpdate,
    env,
    onEvent as (event: HarnessRuntimeEvent) => void | Promise<void>,
  );
}

export const resolveRalphExtensionRoot = resolveExtensionRoot;
