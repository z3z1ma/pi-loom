import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { RalphLaunchDescriptor } from "./models.js";
import { renderLaunchPrompt } from "./render.js";

const require = createRequire(import.meta.url);
let sessionRuntimeLaunchQueue: Promise<void> = Promise.resolve();

export interface PiSpawnDeps {
  execPath?: string;
  execArgv?: string[];
  argv1?: string;
  env?: NodeJS.ProcessEnv;
  existsSync?: (filePath: string) => boolean;
  readFileSync?: (filePath: string, encoding: "utf-8") => string;
}

export interface PiSpawnCommand {
  command: string;
  args: string[];
}

export interface RalphExecutionResult {
  command: string;
  args: string[];
  exitCode: number;
  output: string;
  stderr: string;
}

interface HarnessSessionRuntime {
  createAgentSession: (options: Record<string, unknown>) => Promise<{
    session: HarnessSession;
    modelFallbackMessage?: string;
  }>;
  SessionManager: {
    inMemory: (cwd?: string) => unknown;
  };
}

interface HarnessAssistantMessage {
  role?: string;
  stopReason?: string;
  errorMessage?: string;
  content?: Array<{ type?: string; text?: string }>;
}

interface HarnessSession {
  agent?: {
    waitForIdle?: () => Promise<void>;
  };
  state?: {
    messages?: HarnessAssistantMessage[];
  };
  bindExtensions?: (bindings: Record<string, unknown>) => Promise<void>;
  getAllTools?: () => Array<{ name: string }>;
  modelRegistry?: {
    find?: (provider: string, modelId: string) => unknown;
  };
  setActiveToolsByName?: (toolNames: string[]) => Promise<void>;
  setModel?: (model: unknown) => Promise<void>;
  prompt: (text: string) => Promise<void>;
  dispose?: () => void | Promise<void>;
  subscribe?: (listener: (event: unknown) => void) => (() => void) | void;
  abort?: () => Promise<void>;
  newSession?: (options?: { parentSession?: boolean }) => Promise<boolean>;
  fork?: (entryId: string) => Promise<{ cancelled: boolean }>;
  navigateTree?: (
    targetId: string,
    options?: { summarize?: boolean; customInstructions?: string; replaceInstructions?: boolean; label?: string },
  ) => Promise<{ cancelled: boolean }>;
  switchSession?: (sessionPath: string) => Promise<boolean>;
  reload?: () => Promise<void>;
}

interface RequestedModelRuntime {
  provider: string;
  modelId: string;
}

export const PI_PARENT_HARNESS_EXEC_PATH_ENV = "PI_PARENT_HARNESS_EXEC_PATH";
export const PI_PARENT_HARNESS_EXEC_ARGV_ENV = "PI_PARENT_HARNESS_EXEC_ARGV";
export const PI_PARENT_HARNESS_ARGV1_ENV = "PI_PARENT_HARNESS_ARGV1";
export const PI_PARENT_HARNESS_PACKAGE_ROOT_ENV = "PI_PARENT_HARNESS_PACKAGE_ROOT";
export const PI_PARENT_SESSION_MODEL_PROVIDER_ENV = "PI_PARENT_SESSION_MODEL_PROVIDER";
export const PI_PARENT_SESSION_MODEL_ID_ENV = "PI_PARENT_SESSION_MODEL_ID";

const harnessRuntimeCache = new Map<string, Promise<HarnessSessionRuntime>>();

function trimToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function appendErrorText(stderr: string, errorText: string): string {
  if (!errorText) return stderr;
  if (!stderr) return errorText;
  return `${stderr.trimEnd()}\n${errorText}`;
}

function parseExecArgvOverride(value: string | undefined): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function extractAssistantText(message: HarnessAssistantMessage | undefined): string {
  if (!Array.isArray(message?.content)) {
    return "";
  }
  return message.content
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

function findLastAssistantMessage(messages: HarnessAssistantMessage[] | undefined): HarnessAssistantMessage | undefined {
  if (!Array.isArray(messages)) {
    return undefined;
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant") {
      return message;
    }
  }
  return undefined;
}

function readJsonFile<T>(filePath: string, readFileSync: (filePath: string, encoding: "utf-8") => string): T | null {
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function resolvePackageRootFromEntry(
  entryPath: string | undefined,
  existsSync: (filePath: string) => boolean,
  readFileSync: (filePath: string, encoding: "utf-8") => string,
): string | undefined {
  const trimmed = trimToUndefined(entryPath);
  if (!trimmed) {
    return undefined;
  }

  let currentDir = path.dirname(path.resolve(trimmed));
  while (true) {
    const packageJsonPath = path.join(currentDir, "package.json");
    if (existsSync(packageJsonPath)) {
      const packageJson = readJsonFile<{ name?: string; main?: string }>(packageJsonPath, readFileSync);
      if (packageJson?.name?.endsWith("/pi-coding-agent") || packageJson?.main) {
        return currentDir;
      }
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return undefined;
    }
    currentDir = parentDir;
  }
}

function getInheritedParentHarnessSpawnDeps(env: NodeJS.ProcessEnv): Pick<PiSpawnDeps, "execPath" | "execArgv" | "argv1"> {
  return {
    execPath: trimToUndefined(env[PI_PARENT_HARNESS_EXEC_PATH_ENV]),
    execArgv: parseExecArgvOverride(env[PI_PARENT_HARNESS_EXEC_ARGV_ENV]),
    argv1: trimToUndefined(env[PI_PARENT_HARNESS_ARGV1_ENV]),
  };
}

function resolvePiSpawnDeps(deps: PiSpawnDeps = {}): Required<Pick<PiSpawnDeps, "execPath" | "execArgv" | "argv1">> {
  const env = deps.env ?? process.env;
  const inherited = getInheritedParentHarnessSpawnDeps(env);
  return {
    execPath: inherited.execPath ?? deps.execPath ?? process.execPath,
    execArgv: inherited.execArgv ?? deps.execArgv ?? process.execArgv,
    argv1: inherited.argv1 ?? deps.argv1 ?? process.argv[1] ?? "",
  };
}

function resolveParentHarnessPackageRoot(
  deps: PiSpawnDeps = {},
): string | undefined {
  const env = deps.env ?? process.env;
  const inheritedRoot = trimToUndefined(env[PI_PARENT_HARNESS_PACKAGE_ROOT_ENV]);
  if (inheritedRoot) {
    return inheritedRoot;
  }

  const existsSync = deps.existsSync ?? fs.existsSync;
  const readFileSync = deps.readFileSync ?? ((filePath, encoding) => fs.readFileSync(filePath, encoding));
  const { argv1 } = resolvePiSpawnDeps(deps);
  const resolvedFromEntry = resolvePackageRootFromEntry(argv1, existsSync, readFileSync);
  if (resolvedFromEntry) {
    return resolvedFromEntry;
  }

  for (const packageName of ["@oh-my-pi/pi-coding-agent", "@mariozechner/pi-coding-agent"] as const) {
    try {
      return path.dirname(require.resolve(`${packageName}/package.json`));
    } catch {
      continue;
    }
  }

  return undefined;
}

function resolveHarnessRuntimeEntryPath(deps: PiSpawnDeps = {}): string {
  const existsSync = deps.existsSync ?? fs.existsSync;
  const readFileSync = deps.readFileSync ?? ((filePath, encoding) => fs.readFileSync(filePath, encoding));
  const packageRoot = resolveParentHarnessPackageRoot(deps);
  if (!packageRoot) {
    throw new Error("Unable to resolve the current harness package root for Ralph session execution.");
  }

  const packageJsonPath = path.join(packageRoot, "package.json");
  const packageJson = readJsonFile<{
    main?: string;
    exports?: { "."?: { import?: string } | string };
  }>(packageJsonPath, readFileSync);

  const rootExport = packageJson?.exports?.["."];
  const exportPath = typeof rootExport === "string" ? rootExport : rootExport?.import;
  const entryPath = packageJson?.main ?? exportPath;
  if (!entryPath) {
    throw new Error(`Harness package at ${packageRoot} does not expose a main SDK entry.`);
  }

  const resolvedEntry = path.resolve(packageRoot, entryPath);
  if (!existsSync(resolvedEntry)) {
    throw new Error(`Resolved harness SDK entry does not exist: ${resolvedEntry}`);
  }
  return resolvedEntry;
}

async function loadHarnessSessionRuntime(deps: PiSpawnDeps = {}): Promise<HarnessSessionRuntime> {
  const entryPath = resolveHarnessRuntimeEntryPath(deps);
  const cached = harnessRuntimeCache.get(entryPath);
  if (cached) {
    return cached;
  }

  const pending = import(pathToFileURL(entryPath).href).then((runtimeModule) => {
    const candidate = runtimeModule as Partial<HarnessSessionRuntime>;
    if (typeof candidate.createAgentSession !== "function" || typeof candidate.SessionManager?.inMemory !== "function") {
      throw new Error(`Harness SDK entry ${entryPath} does not expose createAgentSession and SessionManager.inMemory.`);
    }
    return candidate as HarnessSessionRuntime;
  });

  harnessRuntimeCache.set(entryPath, pending);
  return pending;
}

function applyEnvironmentOverrides<T>(env: NodeJS.ProcessEnv, fn: () => Promise<T>): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return fn().finally(() => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

async function withSessionRuntimeLaunchLock<T>(signal: AbortSignal | undefined, fn: () => Promise<T>): Promise<T> {
  if (signal?.aborted) {
    throw new Error("Aborted");
  }

  const waitForTurn = sessionRuntimeLaunchQueue.catch(() => undefined);
  let releaseCurrent: (() => void) | undefined;
  sessionRuntimeLaunchQueue = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });

  let onAbort: (() => void) | undefined;
  const abortPromise =
    signal === undefined
      ? undefined
      : new Promise<never>((_, reject) => {
          onAbort = () => reject(new Error("Aborted"));
          signal.addEventListener("abort", onAbort, { once: true });
        });

  try {
    await (abortPromise ? Promise.race([waitForTurn, abortPromise]) : waitForTurn);
  } catch (error) {
    releaseCurrent?.();
    throw error;
  } finally {
    if (signal && onAbort) {
      signal.removeEventListener("abort", onAbort);
    }
  }

  if (signal?.aborted) {
    releaseCurrent?.();
    throw new Error("Aborted");
  }

  try {
    return await fn();
  } finally {
    releaseCurrent?.();
  }
}

async function bindHeadlessExtensions(session: HarnessSession): Promise<void> {
  if (typeof session.bindExtensions !== "function") {
    return;
  }

  await session.bindExtensions({
    commandContextActions: {
      waitForIdle: () => session.agent?.waitForIdle?.() ?? Promise.resolve(),
      newSession: async (options?: { parentSession?: boolean }) => {
        const success = (await session.newSession?.({ parentSession: options?.parentSession })) ?? false;
        return { cancelled: !success };
      },
      fork: async (entryId: string) => {
        return (await session.fork?.(entryId)) ?? { cancelled: true };
      },
      navigateTree: async (
        targetId: string,
        options?: { summarize?: boolean; customInstructions?: string; replaceInstructions?: boolean; label?: string },
      ) => {
        return (
          (await session.navigateTree?.(targetId, {
            summarize: options?.summarize,
            customInstructions: options?.customInstructions,
            replaceInstructions: options?.replaceInstructions,
            label: options?.label,
          })) ?? { cancelled: true }
        );
      },
      switchSession: async (sessionPath: string) => {
        const success = (await session.switchSession?.(sessionPath)) ?? false;
        return { cancelled: !success };
      },
      reload: async () => {
        await session.reload?.();
      },
    },
    onError: () => {},
  });
}

async function activateAllTools(session: HarnessSession): Promise<void> {
  if (typeof session.getAllTools !== "function" || typeof session.setActiveToolsByName !== "function") {
    return;
  }
  const allToolNames = session
    .getAllTools()
    .map((tool) => tool.name)
    .filter((name): name is string => typeof name === "string" && name.length > 0);
  await session.setActiveToolsByName(allToolNames);
}

async function waitForSessionIdle(session: HarnessSession): Promise<void> {
  if (typeof session.agent?.waitForIdle === "function") {
    await session.agent.waitForIdle();
  }
}

function getRequestedModelRuntime(env: NodeJS.ProcessEnv): RequestedModelRuntime | null {
  const provider = trimToUndefined(env[PI_PARENT_SESSION_MODEL_PROVIDER_ENV]);
  const modelId = trimToUndefined(env[PI_PARENT_SESSION_MODEL_ID_ENV]);
  if (!provider || !modelId) {
    return null;
  }
  return {
    provider,
    modelId,
  };
}

function buildSessionCreationOptions(
  runtime: HarnessSessionRuntime,
  cwd: string,
): Record<string, unknown> {
  return {
    cwd,
    sessionManager: runtime.SessionManager.inMemory(cwd),
  };
}

async function applyRequestedModelToSession(session: HarnessSession, env: NodeJS.ProcessEnv): Promise<void> {
  const requestedModel = getRequestedModelRuntime(env);
  if (!requestedModel || typeof session.setModel !== "function") {
    return;
  }

  const resolvedModel = session.modelRegistry?.find?.(requestedModel.provider, requestedModel.modelId);
  if (resolvedModel === undefined) {
    return;
  }

  await session.setModel(resolvedModel);
}

export async function buildParentSessionRuntimeEnv(input: {
  env?: NodeJS.ProcessEnv;
  execPath?: string;
  execArgv?: string[];
  argv1?: string;
  model?: { provider?: string; id?: string } | null;
} = {}): Promise<Record<string, string>> {
  const env = input.env ?? process.env;
  const forwardedEnv = captureParentHarnessSpawnEnv(env, {
    execPath: input.execPath,
    execArgv: input.execArgv,
    argv1: input.argv1,
  });

  const provider = trimToUndefined(input.model?.provider);
  const modelId = trimToUndefined(input.model?.id);
  if (!provider || !modelId) {
    return forwardedEnv;
  }

  forwardedEnv[PI_PARENT_SESSION_MODEL_PROVIDER_ENV] = provider;
  forwardedEnv[PI_PARENT_SESSION_MODEL_ID_ENV] = modelId;

  return forwardedEnv;
}

export function captureParentHarnessSpawnEnv(
  env: NodeJS.ProcessEnv = process.env,
  deps: Pick<PiSpawnDeps, "execPath" | "execArgv" | "argv1"> = {},
): Record<string, string> {
  const resolved = resolvePiSpawnDeps({ env, ...deps });
  const packageRoot = resolveParentHarnessPackageRoot({ env, ...deps });
  const forwardedEnv: Record<string, string> = {
    [PI_PARENT_HARNESS_EXEC_PATH_ENV]: resolved.execPath,
    [PI_PARENT_HARNESS_EXEC_ARGV_ENV]: JSON.stringify(resolved.execArgv),
  };
  if (resolved.argv1) {
    forwardedEnv[PI_PARENT_HARNESS_ARGV1_ENV] = resolved.argv1;
  }
  if (packageRoot) {
    forwardedEnv[PI_PARENT_HARNESS_PACKAGE_ROOT_ENV] = packageRoot;
  }
  return forwardedEnv;
}

export async function runRalphLaunch(
  cwd: string,
  launch: RalphLaunchDescriptor,
  signal: AbortSignal | undefined,
  onUpdate?: (text: string) => void,
  extraEnv?: Record<string, string | undefined>,
): Promise<RalphExecutionResult> {
  const runtimeEnv = extraEnv ? { ...process.env, ...extraEnv } : process.env;
  let command = "session-runtime";
  const args = [launch.runId, launch.iterationId, launch.resume ? "resume" : "launch"];

  if (signal?.aborted) {
    return {
      command,
      args,
      exitCode: 1,
      output: "",
      stderr: "Aborted",
    };
  }

  let session: HarnessSession | undefined;
  let unsubscribe: (() => void) | undefined;

  try {
    command = resolveHarnessRuntimeEntryPath({ env: runtimeEnv });
    const runtime = await loadHarnessSessionRuntime({ env: runtimeEnv });
    const prompt = renderLaunchPrompt(cwd, launch);
    const createOptions = buildSessionCreationOptions(runtime, cwd);

    const execution = await withSessionRuntimeLaunchLock(signal, () =>
      applyEnvironmentOverrides(runtimeEnv, async () => {
        const created = await runtime.createAgentSession(createOptions);
        session = created.session;

        await bindHeadlessExtensions(created.session);
        await applyRequestedModelToSession(created.session, runtimeEnv);
        await activateAllTools(created.session);

        if (typeof created.session.subscribe === "function") {
          unsubscribe = created.session.subscribe((event) => {
            if (!event || typeof event !== "object") {
              return;
            }
            const candidate = event as {
              type?: string;
              message?: HarnessAssistantMessage;
            };
            if (candidate.type === "message_end" && candidate.message?.role === "assistant") {
              const text = extractAssistantText(candidate.message);
              if (text) {
                onUpdate?.(text);
              }
            }
          }) as (() => void) | undefined;
        }

        let aborted = signal?.aborted === true;
        const handleAbort = () => {
          aborted = true;
          void created.session.abort?.();
        };
        signal?.addEventListener("abort", handleAbort, { once: true });

        try {
          try {
            await created.session.prompt(prompt);
            await waitForSessionIdle(created.session);
          } catch (error) {
            if (!aborted) {
              throw error;
            }
          }
        } finally {
          signal?.removeEventListener("abort", handleAbort);
        }

        const lastAssistant = findLastAssistantMessage(created.session.state?.messages);
        const output = extractAssistantText(lastAssistant);
        const errorText = trimToUndefined(lastAssistant?.errorMessage) ?? undefined;
        const exitCode = aborted || lastAssistant?.stopReason === "error" || lastAssistant?.stopReason === "aborted" ? 1 : 0;

        return {
          exitCode,
          output,
          stderr: errorText ?? (aborted ? "Aborted" : ""),
        };
      }),
    );

    return {
      command,
      args,
      exitCode: execution.exitCode,
      output: execution.output,
      stderr: execution.stderr,
    };
  } catch (error) {
    return {
      command,
      args,
      exitCode: 1,
      output: "",
      stderr: signal?.aborted ? "Aborted" : error instanceof Error ? error.message : String(error),
    };
  } finally {
    unsubscribe?.();
    if (typeof session?.dispose === "function") {
      await session.dispose();
    }
  }
}

export function resolveRalphExtensionRoot(startDir = path.dirname(fileURLToPath(import.meta.url))): string {
  let currentDir = path.resolve(startDir);
  while (true) {
    const packageJsonPath = path.join(currentDir, "package.json");
    const packageJson = readJsonFile<{ pi?: { extensions?: string[] } }>(packageJsonPath, (filePath, encoding) =>
      fs.readFileSync(filePath, encoding),
    );
    if (packageJson?.pi?.extensions && packageJson.pi.extensions.length > 0) {
      return currentDir;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return path.resolve(startDir);
    }
    currentDir = parentDir;
  }
}
