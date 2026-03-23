import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { RalphLaunchDescriptor, RalphRuntimeEvent, RalphRuntimeUsage } from "./models.js";
import { renderLaunchPrompt } from "./render.js";

const require = createRequire(import.meta.url);

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
  usage: RalphRuntimeUsage;
  startedAt?: string | null;
  completedAt?: string;
  status?: "completed" | "failed" | "cancelled";
  events?: RalphRuntimeEvent[];
}

interface HarnessSessionRuntime {
  createAgentSession: (options: Record<string, unknown>) => Promise<{
    session: HarnessSession;
    modelFallbackMessage?: string;
  }>;
  DefaultResourceLoader?: new (options: {
    cwd?: string;
    additionalExtensionPaths?: string[];
    noExtensions?: boolean;
  }) => HarnessResourceLoader;
  SessionManager: {
    inMemory: (cwd?: string) => unknown;
  };
}

interface HarnessResourceLoader {
  reload?: () => Promise<void>;
}

interface HarnessAssistantMessage {
  role?: string;
  stopReason?: string;
  errorMessage?: string;
  content?: Array<{ type?: string; text?: string }>;
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    totalTokens?: number;
  };
}

interface HarnessSession {
  waitForIdle?: () => Promise<void>;
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
  subscribe?: (listener: (event: unknown) => void) => (() => void) | undefined;
  abort?: () => Promise<void>;
  newSession?: (options?: {
    parentSession?: string;
    setup?: (sessionManager: unknown) => Promise<void>;
  }) => Promise<boolean>;
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

const REQUIRED_RALPH_WORKER_TOOL_NAMES = ["ralph_read", "ticket_read", "ticket_write"] as const;

export type RalphLaunchEvent = RalphRuntimeEvent;

export const PI_PARENT_HARNESS_EXEC_PATH_ENV = "PI_PARENT_HARNESS_EXEC_PATH";
export const PI_PARENT_HARNESS_EXEC_ARGV_ENV = "PI_PARENT_HARNESS_EXEC_ARGV";
export const PI_PARENT_HARNESS_ARGV1_ENV = "PI_PARENT_HARNESS_ARGV1";
export const PI_PARENT_HARNESS_PACKAGE_ROOT_ENV = "PI_PARENT_HARNESS_PACKAGE_ROOT";
export const PI_PARENT_SESSION_MODEL_PROVIDER_ENV = "PI_PARENT_SESSION_MODEL_PROVIDER";
export const PI_PARENT_SESSION_MODEL_ID_ENV = "PI_PARENT_SESSION_MODEL_ID";
export const PI_PARENT_SESSION_CWD_ENV = "PI_PARENT_SESSION_CWD";
export const PI_PARENT_SESSION_ADDITIONAL_EXTENSION_PATHS_ENV = "PI_PARENT_SESSION_ADDITIONAL_EXTENSION_PATHS";
export const PI_PARENT_SESSION_DISABLE_EXTENSION_DISCOVERY_ENV = "PI_PARENT_SESSION_DISABLE_EXTENSION_DISCOVERY";

const harnessRuntimeCache = new Map<string, Promise<HarnessSessionRuntime>>();

function trimToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isTimeoutAbortSignal(signal: AbortSignal | undefined): boolean {
  const reason = signal?.reason;
  return reason instanceof Error && /timeout/i.test(reason.message);
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

function parseStringArrayOverride(value: string | undefined): string[] | undefined {
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

function parseBooleanOverride(value: string | undefined): boolean | undefined {
  const normalized = trimToUndefined(value)?.toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized === "1" || normalized === "true") {
    return true;
  }
  if (normalized === "0" || normalized === "false") {
    return false;
  }
  return undefined;
}

function isPathInside(parentDir: string, targetPath: string): boolean {
  const relativePath = path.relative(parentDir, targetPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function remapExtensionPathForNestedSession(extensionPath: string, parentCwd: string, nestedCwd: string): string {
  const absolutePath = path.isAbsolute(extensionPath) ? extensionPath : path.resolve(parentCwd, extensionPath);
  if (!isPathInside(parentCwd, absolutePath)) {
    return absolutePath;
  }
  return path.resolve(nestedCwd, path.relative(parentCwd, absolutePath));
}

function parseExplicitExtensionConfigFromArgv(argv: string[]): {
  additionalExtensionPaths?: string[];
  disableExtensionDiscovery?: boolean;
} {
  const additionalExtensionPaths: string[] = [];
  let disableExtensionDiscovery = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--hook" && index + 1 < argv.length) {
      const candidate = trimToUndefined(argv[index + 1]);
      if (candidate) {
        additionalExtensionPaths.push(candidate);
      }
      index += 1;
      continue;
    }
    if ((arg === "--extension" || arg === "-e") && index + 1 < argv.length) {
      const candidate = trimToUndefined(argv[index + 1]);
      if (candidate) {
        additionalExtensionPaths.push(candidate);
      }
      index += 1;
      continue;
    }
    if (arg === "--no-extensions" || arg === "-ne") {
      disableExtensionDiscovery = true;
    }
  }

  return {
    additionalExtensionPaths: additionalExtensionPaths.length > 0 ? additionalExtensionPaths : undefined,
    disableExtensionDiscovery: disableExtensionDiscovery ? true : undefined,
  };
}

function resolveCurrentSessionExtensionConfig(input: { env: NodeJS.ProcessEnv; cwd?: string; argv?: string[] }): {
  parentCwd?: string;
  additionalExtensionPaths?: string[];
  disableExtensionDiscovery?: boolean;
} {
  const parentCwd = trimToUndefined(input.env[PI_PARENT_SESSION_CWD_ENV]);
  const inheritedPaths = parseStringArrayOverride(input.env[PI_PARENT_SESSION_ADDITIONAL_EXTENSION_PATHS_ENV]);
  const inheritedDisableExtensionDiscovery = parseBooleanOverride(
    input.env[PI_PARENT_SESSION_DISABLE_EXTENSION_DISCOVERY_ENV],
  );
  const currentCwd = trimToUndefined(input.cwd);

  if (parentCwd || inheritedPaths !== undefined || inheritedDisableExtensionDiscovery !== undefined) {
    return {
      parentCwd: currentCwd,
      additionalExtensionPaths:
        parentCwd && currentCwd && inheritedPaths
          ? [
              ...new Set(
                inheritedPaths.map((extensionPath) =>
                  remapExtensionPathForNestedSession(extensionPath, parentCwd, currentCwd),
                ),
              ),
            ]
          : inheritedPaths,
      disableExtensionDiscovery: inheritedDisableExtensionDiscovery,
    };
  }

  const parsedArgs = parseExplicitExtensionConfigFromArgv(input.argv ?? process.argv.slice(2));
  return {
    parentCwd: currentCwd,
    additionalExtensionPaths: parsedArgs.additionalExtensionPaths?.map((extensionPath) =>
      currentCwd ? path.resolve(currentCwd, extensionPath) : extensionPath,
    ),
    disableExtensionDiscovery: parsedArgs.disableExtensionDiscovery,
  };
}

function resolveNestedSessionExtensionConfig(
  env: NodeJS.ProcessEnv,
  cwd: string,
): {
  additionalExtensionPaths?: string[];
  disableExtensionDiscovery?: boolean;
} {
  const parentCwd = trimToUndefined(env[PI_PARENT_SESSION_CWD_ENV]);
  const forwardedPaths = parseStringArrayOverride(env[PI_PARENT_SESSION_ADDITIONAL_EXTENSION_PATHS_ENV]);
  const disableExtensionDiscovery = parseBooleanOverride(env[PI_PARENT_SESSION_DISABLE_EXTENSION_DISCOVERY_ENV]);

  return {
    additionalExtensionPaths:
      forwardedPaths && parentCwd
        ? [
            ...new Set(
              forwardedPaths.map((extensionPath) => remapExtensionPathForNestedSession(extensionPath, parentCwd, cwd)),
            ),
          ]
        : forwardedPaths,
    disableExtensionDiscovery: disableExtensionDiscovery === true ? true : undefined,
  };
}

type ExtensionManifest = { extensions?: string[] };

function readExtensionManifest(packageJsonPath: string): ExtensionManifest | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as { pi?: ExtensionManifest; omp?: ExtensionManifest };
    return parsed.pi ?? parsed.omp ?? null;
  } catch {
    return null;
  }
}

function resolveExtensionEntriesFromPackageRoot(packageRoot: string): string[] {
  const packageJsonPath = path.join(packageRoot, "package.json");
  const manifest = readExtensionManifest(packageJsonPath);
  const manifestEntries = manifest?.extensions
    ?.map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => path.resolve(packageRoot, entry));
  if (manifestEntries && manifestEntries.length > 0) {
    return manifestEntries;
  }

  const defaultEntries = [path.join(packageRoot, "extensions", "index.ts"), path.join(packageRoot, "extensions", "index.js")];
  return defaultEntries.filter((entry) => fs.existsSync(entry));
}

export function resolveRequiredRalphWorkerExtensionPaths(): string[] {
  const ralphPackageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const ticketPackageRoot = path.dirname(require.resolve("@pi-loom/pi-ticketing/package.json"));
  return [...new Set([...resolveExtensionEntriesFromPackageRoot(ralphPackageRoot), ...resolveExtensionEntriesFromPackageRoot(ticketPackageRoot)])];
}

function withGuaranteedRalphWorkerExtensionPaths(paths: string[] | undefined): string[] {
  return paths && paths.length > 0 ? paths : resolveRequiredRalphWorkerExtensionPaths();
}

async function buildNestedSessionResourceLoader(
  runtime: HarnessSessionRuntime,
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<HarnessResourceLoader | undefined> {
  if (!runtime.DefaultResourceLoader) {
    return undefined;
  }

  const extensionConfig = resolveNestedSessionExtensionConfig(env, cwd);
  const resourceLoader = new runtime.DefaultResourceLoader({
    cwd,
    additionalExtensionPaths: withGuaranteedRalphWorkerExtensionPaths(extensionConfig.additionalExtensionPaths),
    noExtensions: extensionConfig.disableExtensionDiscovery,
  });
  await resourceLoader.reload?.();
  return resourceLoader;
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

function normalizeUsageValue(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function extractAssistantUsage(message: HarnessAssistantMessage | undefined): RalphRuntimeUsage {
  const measured = Boolean(message?.usage);
  const input = normalizeUsageValue(message?.usage?.input);
  const output = normalizeUsageValue(message?.usage?.output);
  const cacheRead = normalizeUsageValue(message?.usage?.cacheRead);
  const cacheWrite = normalizeUsageValue(message?.usage?.cacheWrite);
  const totalFromMessage = normalizeUsageValue(message?.usage?.totalTokens);
  return {
    measured,
    input,
    output,
    cacheRead,
    cacheWrite,
    totalTokens: totalFromMessage || input + output + cacheRead + cacheWrite,
  };
}

function extractAssistantUsageFromMessages(messages: HarnessAssistantMessage[] | undefined): RalphRuntimeUsage {
  if (!Array.isArray(messages)) {
    return { measured: false, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 };
  }

  return messages.reduce<RalphRuntimeUsage>(
    (aggregate, message) => {
      if (message?.role !== "assistant") {
        return aggregate;
      }
      const usage = extractAssistantUsage(message);
      if (!usage.measured) {
        return aggregate;
      }
      return {
        measured: true,
        input: aggregate.input + usage.input,
        output: aggregate.output + usage.output,
        cacheRead: aggregate.cacheRead + usage.cacheRead,
        cacheWrite: aggregate.cacheWrite + usage.cacheWrite,
        totalTokens: aggregate.totalTokens + usage.totalTokens,
      };
    },
    { measured: false, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
  );
}

function findLastAssistantMessage(
  messages: HarnessAssistantMessage[] | undefined,
): HarnessAssistantMessage | undefined {
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

function extractToolExecutionEvent(event: unknown): RalphRuntimeEvent | null {
  if (!event || typeof event !== "object") {
    return null;
  }

  const candidate = event as {
    type?: string;
    phase?: string;
    toolName?: string;
    toolCallId?: string;
    tool?: { name?: string };
    toolCall?: { id?: string; name?: string };
    errorMessage?: string;
    error?: { message?: string };
  };

  const eventType = trimToUndefined(candidate.type);
  const normalizedEventType = eventType?.toLowerCase();
  const explicitPhase = trimToUndefined(candidate.phase)?.toLowerCase();
  const phase =
    explicitPhase === "start" || explicitPhase === "end"
      ? explicitPhase
      : normalizedEventType?.includes("end")
        ? "end"
        : normalizedEventType?.includes("start")
          ? "start"
          : undefined;
  const toolName =
    trimToUndefined(candidate.toolName) ??
    trimToUndefined(candidate.tool?.name) ??
    trimToUndefined(candidate.toolCall?.name);

  const looksLikeToolEvent =
    explicitPhase === "start" ||
    explicitPhase === "end" ||
    (normalizedEventType?.includes("tool") &&
      (normalizedEventType.includes("start") || normalizedEventType.includes("end")));
  if (!phase || !toolName || !looksLikeToolEvent) {
    return null;
  }

  return {
    type: "tool_execution",
    phase,
    toolName,
    toolCallId: trimToUndefined(candidate.toolCallId) ?? trimToUndefined(candidate.toolCall?.id) ?? null,
    errorMessage: trimToUndefined(candidate.errorMessage) ?? trimToUndefined(candidate.error?.message) ?? null,
    at: new Date().toISOString(),
  };
}

function emitLaunchEvent(
  handler: ((event: RalphLaunchEvent) => void | Promise<void>) | undefined,
  event: RalphLaunchEvent,
): void {
  if (!handler) {
    return;
  }
  void Promise.resolve(handler(event)).catch(() => {});
}

const HARNESS_PACKAGE_NAMES = ["@oh-my-pi/pi-coding-agent", "@mariozechner/pi-coding-agent"] as const;
const PATH_DISCOVERABLE_HARNESS_COMMANDS = ["omp"] as const;

function isSupportedHarnessPackageName(packageName: string | undefined): boolean {
  return (
    packageName !== undefined &&
    (HARNESS_PACKAGE_NAMES.includes(packageName as (typeof HARNESS_PACKAGE_NAMES)[number]) ||
      packageName.endsWith("/pi-coding-agent"))
  );
}

function resolveEntryRealPath(entryPath: string, existsSync: (filePath: string) => boolean): string {
  const resolvedPath = path.resolve(entryPath);
  if (!existsSync(resolvedPath)) {
    return resolvedPath;
  }

  try {
    return fs.realpathSync.native?.(resolvedPath) ?? fs.realpathSync(resolvedPath);
  } catch {
    return resolvedPath;
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

  let currentDir = path.dirname(resolveEntryRealPath(trimmed, existsSync));
  while (true) {
    const packageJsonPath = path.join(currentDir, "package.json");
    if (existsSync(packageJsonPath)) {
      const packageJson = readJsonFile<{ name?: string; main?: string }>(packageJsonPath, readFileSync);
      if (isSupportedHarnessPackageName(packageJson?.name)) {
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

function resolvePathDiscoverableHarnessPackageRoot(
  env: NodeJS.ProcessEnv,
  existsSync: (filePath: string) => boolean,
  readFileSync: (filePath: string, encoding: "utf-8") => string,
  argv1: string | undefined,
): string | undefined {
  const pathValue = trimToUndefined(env.PATH) ?? trimToUndefined(env.Path);
  if (!pathValue) {
    return undefined;
  }

  const commandNames = new Set<string>(PATH_DISCOVERABLE_HARNESS_COMMANDS);
  const trimmedArgv1 = trimToUndefined(argv1);
  const argv1Basename = trimmedArgv1 ? path.basename(trimmedArgv1) : undefined;
  if (argv1Basename) {
    commandNames.add(argv1Basename);
  }

  for (const directory of pathValue
    .split(path.delimiter)
    .map((segment) => trimToUndefined(segment))
    .flatMap((segment) => (segment ? [segment] : []))) {
    for (const commandName of commandNames) {
      const candidatePath = path.join(directory, commandName);
      if (!existsSync(candidatePath)) {
        continue;
      }

      const packageRoot = resolvePackageRootFromEntry(candidatePath, existsSync, readFileSync);
      if (packageRoot) {
        return packageRoot;
      }
    }
  }

  return undefined;
}

function getInheritedParentHarnessSpawnDeps(
  env: NodeJS.ProcessEnv,
): Pick<PiSpawnDeps, "execPath" | "execArgv" | "argv1"> {
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

function resolveParentHarnessPackageRoot(deps: PiSpawnDeps = {}): string | undefined {
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

  const resolvedFromPath = resolvePathDiscoverableHarnessPackageRoot(env, existsSync, readFileSync, argv1);
  if (resolvedFromPath) {
    return resolvedFromPath;
  }

  for (const packageName of HARNESS_PACKAGE_NAMES) {
    try {
      return path.dirname(require.resolve(`${packageName}/package.json`));
    } catch {}
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
    if (
      typeof candidate.createAgentSession !== "function" ||
      typeof candidate.SessionManager?.inMemory !== "function"
    ) {
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

async function bindHeadlessExtensions(session: HarnessSession, runtimeEnv: NodeJS.ProcessEnv): Promise<void> {
  if (typeof session.bindExtensions !== "function") {
    return;
  }

  const withRuntimeEnv = <T>(fn: () => Promise<T>) => applyEnvironmentOverrides(runtimeEnv, fn);

  await session.bindExtensions({
    commandContextActions: {
      waitForIdle: () => waitForSessionIdle(session),
      newSession: async (options?: { parentSession?: string; setup?: (sessionManager: unknown) => Promise<void> }) => {
        const success = await withRuntimeEnv(async () => (await session.newSession?.(options)) ?? false);
        return { cancelled: !success };
      },
      fork: async (entryId: string) => {
        return withRuntimeEnv(async () => (await session.fork?.(entryId)) ?? { cancelled: true });
      },
      navigateTree: async (
        targetId: string,
        options?: { summarize?: boolean; customInstructions?: string; replaceInstructions?: boolean; label?: string },
      ) => {
        return withRuntimeEnv(async () =>
          (await session.navigateTree?.(targetId, {
            summarize: options?.summarize,
            customInstructions: options?.customInstructions,
            replaceInstructions: options?.replaceInstructions,
            label: options?.label,
          })) ?? { cancelled: true },
        );
      },
      switchSession: async (sessionPath: string) => {
        const success = await withRuntimeEnv(async () => (await session.switchSession?.(sessionPath)) ?? false);
        return { cancelled: !success };
      },
      reload: async () => {
        await withRuntimeEnv(async () => {
          await session.reload?.();
        });
      },
    },
    onError: () => {},
  });
}

async function waitForSessionIdle(session: HarnessSession): Promise<void> {
  if (typeof session.waitForIdle === "function") {
    await session.waitForIdle();
    return;
  }
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
  env: NodeJS.ProcessEnv,
  resourceLoader?: HarnessResourceLoader,
): Record<string, unknown> {
  const requestedModel = getRequestedModelRuntime(env);
  const extensionConfig = resolveNestedSessionExtensionConfig(env, cwd);
  const additionalExtensionPaths = withGuaranteedRalphWorkerExtensionPaths(extensionConfig.additionalExtensionPaths);
  const options: Record<string, unknown> = {
    cwd,
    sessionManager: runtime.SessionManager.inMemory(cwd),
  };

  if (additionalExtensionPaths.length > 0) {
    options.additionalExtensionPaths = additionalExtensionPaths;
  }
  if (extensionConfig.disableExtensionDiscovery === true) {
    options.disableExtensionDiscovery = true;
  }

  if (resourceLoader) {
    options.resourceLoader = resourceLoader;
  }

  if (requestedModel) {
    options.model = {
      provider: requestedModel.provider,
      id: requestedModel.modelId,
    };
  }

  return options;
}

function listSessionToolNames(session: HarnessSession): string[] {
  return typeof session.getAllTools === "function"
    ? session.getAllTools().flatMap((tool) => (typeof tool?.name === "string" && tool.name.trim() ? [tool.name] : []))
    : [];
}

async function ensureRalphWorkerToolsAvailable(session: HarnessSession): Promise<string[]> {
  const toolNames = listSessionToolNames(session);
  const missing = REQUIRED_RALPH_WORKER_TOOL_NAMES.filter((name) => !toolNames.includes(name));
  if (missing.length > 0) {
    throw new Error(
      `Ralph nested session is missing required tools: ${missing.join(", ")}. Ensure parent extension paths are forwarded explicitly to the nested run.`,
    );
  }
  if (typeof session.setActiveToolsByName === "function" && toolNames.length > 0) {
    await session.setActiveToolsByName(toolNames);
  }
  return toolNames;
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

export async function buildParentSessionRuntimeEnv(
  input: {
    env?: NodeJS.ProcessEnv;
    execPath?: string;
    execArgv?: string[];
    argv1?: string;
    argv?: string[];
    cwd?: string;
    model?: { provider?: string; id?: string } | null;
  } = {},
): Promise<Record<string, string>> {
  const env = input.env ?? process.env;
  const forwardedEnv = captureParentHarnessSpawnEnv(env, {
    execPath: input.execPath,
    execArgv: input.execArgv,
    argv1: input.argv1,
  });
  const extensionConfig = resolveCurrentSessionExtensionConfig({ env, cwd: input.cwd, argv: input.argv });
  if (extensionConfig.additionalExtensionPaths && extensionConfig.additionalExtensionPaths.length > 0) {
    forwardedEnv[PI_PARENT_SESSION_ADDITIONAL_EXTENSION_PATHS_ENV] = JSON.stringify(
      extensionConfig.additionalExtensionPaths,
    );
  }
  if (extensionConfig.disableExtensionDiscovery === true) {
    forwardedEnv[PI_PARENT_SESSION_DISABLE_EXTENSION_DISCOVERY_ENV] = "1";
  }
  if (
    extensionConfig.parentCwd &&
    (extensionConfig.additionalExtensionPaths?.length || extensionConfig.disableExtensionDiscovery === true)
  ) {
    forwardedEnv[PI_PARENT_SESSION_CWD_ENV] = extensionConfig.parentCwd;
  }

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
  onEvent?: (event: RalphLaunchEvent) => void | Promise<void>,
): Promise<RalphExecutionResult> {
  const runtimeEnv = extraEnv ? { ...process.env, ...extraEnv } : process.env;
  let command = "session-runtime";
  const args = [launch.runId, launch.iterationId, launch.resume ? "resume" : "launch"];
  const events: RalphRuntimeEvent[] = [];
  let startedAt: string | null = null;

  const recordEvent = (event: RalphRuntimeEvent): void => {
    events.push(event);
    emitLaunchEvent(onEvent, event);
  };

  if (signal?.aborted) {
    const completedAt = new Date().toISOString();
    const timedOut = isTimeoutAbortSignal(signal);
    return {
      command,
      args,
      exitCode: 1,
      output: "",
      stderr: timedOut ? "Timed out" : "Aborted",
      usage: { measured: false, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
      startedAt,
      completedAt,
      status: timedOut ? "failed" : "cancelled",
      events,
    };
  }

  let session: HarnessSession | undefined;
  let unsubscribe: (() => void) | undefined;

  try {
    command = resolveHarnessRuntimeEntryPath({ env: runtimeEnv });
    const runtime = await loadHarnessSessionRuntime({ env: runtimeEnv });
    const prompt = renderLaunchPrompt(cwd, launch);
    const resourceLoader = await buildNestedSessionResourceLoader(runtime, cwd, runtimeEnv);
    const createOptions = buildSessionCreationOptions(runtime, cwd, runtimeEnv, resourceLoader);

    recordEvent({ type: "launch_state", state: "queued", at: new Date().toISOString() });

    const execution = await (async () => {
        startedAt = new Date().toISOString();
        recordEvent({ type: "launch_state", state: "running", at: startedAt });

        const created = await runtime.createAgentSession(createOptions);
        session = created.session;

        await bindHeadlessExtensions(created.session, runtimeEnv);
        await applyRequestedModelToSession(created.session, runtimeEnv);
        await ensureRalphWorkerToolsAvailable(created.session);

        if (typeof created.session.subscribe === "function") {
          unsubscribe = created.session.subscribe((event) => {
            if (!event || typeof event !== "object") {
              return;
            }
            const candidate = event as {
              type?: string;
              message?: HarnessAssistantMessage;
            };
            const toolEvent = extractToolExecutionEvent(event);
            if (toolEvent) {
              recordEvent(toolEvent);
              return;
            }
            if (candidate.type === "message_end" && candidate.message?.role === "assistant") {
              const text = extractAssistantText(candidate.message);
              if (text) {
                onUpdate?.(text);
                recordEvent({ type: "assistant_message", text, at: new Date().toISOString() });
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
        const usage = extractAssistantUsageFromMessages(created.session.state?.messages);
        const exitCode =
          aborted || lastAssistant?.stopReason === "error" || lastAssistant?.stopReason === "aborted" ? 1 : 0;

        return {
          exitCode,
          output,
          stderr: errorText ?? (aborted ? (isTimeoutAbortSignal(signal) ? "Timed out" : "Aborted") : ""),
          usage,
        };
      })();

    const completedAt = new Date().toISOString();
    const status: RalphExecutionResult["status"] = isTimeoutAbortSignal(signal)
      ? "failed"
      : signal?.aborted || execution.stderr === "Aborted"
        ? "cancelled"
        : execution.exitCode === 0
          ? "completed"
          : "failed";

    return {
      command,
      args,
      exitCode: execution.exitCode,
      output: execution.output,
      stderr: execution.stderr,
      usage: execution.usage,
      startedAt,
      completedAt,
      status,
      events,
    };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const status: RalphExecutionResult["status"] = isTimeoutAbortSignal(signal)
      ? "failed"
      : signal?.aborted
        ? "cancelled"
        : "failed";
    return {
      command,
      args,
      exitCode: 1,
      output: "",
      stderr: isTimeoutAbortSignal(signal)
        ? "Timed out"
        : signal?.aborted
          ? "Aborted"
          : error instanceof Error
            ? error.message
            : String(error),
      usage: { measured: false, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
      startedAt,
      completedAt,
      status,
      events,
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
