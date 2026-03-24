import { spawn } from "node:child_process";
import * as fs from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";
import type { RalphLaunchDescriptor, RalphRuntimeEvent, RalphRuntimeUsage } from "./models.js";
import { renderLaunchPrompt } from "./render.js";

const require = createRequire(import.meta.url);

export interface PiSpawnDeps {
  env?: NodeJS.ProcessEnv;
  execPath?: string;
  argv1?: string;
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

export type RalphLaunchEvent = RalphRuntimeEvent;

export const PI_RALPH_HARNESS_COMMAND_ENV = "PI_RALPH_HARNESS_COMMAND";
export const PI_RALPH_HARNESS_PACKAGE_ROOT_ENV = "PI_RALPH_HARNESS_PACKAGE_ROOT";

const HARNESS_PACKAGE_NAMES = ["@oh-my-pi/pi-coding-agent", "@mariozechner/pi-coding-agent"] as const;
const SESSION_FILE_POLL_MS = 50;
const PROCESS_ABORT_GRACE_MS = 5_000;

interface HarnessPackageInfo {
  packageRoot: string;
  packageName: string;
}

interface RuntimeParseState {
  output: string;
  usage: RalphRuntimeUsage;
  events: RalphRuntimeEvent[];
  lastAssistantStopReason?: string;
  lastAssistantError?: string;
}

interface JsonlCursor {
  offset: number;
  partialLine: string;
  decoder: StringDecoder;
}

interface SessionRecord {
  type?: string;
  timestamp?: string;
  message?: {
    role?: string;
    content?: Array<{
      type?: string;
      text?: string;
      id?: string;
      name?: string;
    }>;
    toolCallId?: string;
    toolName?: string;
    isError?: boolean;
    errorMessage?: string;
    stopReason?: string;
    usage?: {
      input?: number;
      output?: number;
      cacheRead?: number;
      cacheWrite?: number;
      totalTokens?: number;
    };
  };
}

type SessionMessage = NonNullable<SessionRecord["message"]>;

function trimToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeUsageValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function emptyUsage(): RalphRuntimeUsage {
  return { measured: false, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 };
}

function mergeUsage(current: RalphRuntimeUsage, usage: SessionMessage["usage"]): RalphRuntimeUsage {
  if (!usage) {
    return current;
  }
  const input = normalizeUsageValue(usage.input);
  const output = normalizeUsageValue(usage.output);
  const cacheRead = normalizeUsageValue(usage.cacheRead);
  const cacheWrite = normalizeUsageValue(usage.cacheWrite);
  const totalTokens = normalizeUsageValue(usage.totalTokens) || input + output + cacheRead + cacheWrite;
  return {
    measured: true,
    input: current.input + input,
    output: current.output + output,
    cacheRead: current.cacheRead + cacheRead,
    cacheWrite: current.cacheWrite + cacheWrite,
    totalTokens: current.totalTokens + totalTokens,
  };
}

function isTimeoutAbortSignal(signal: AbortSignal | undefined): boolean {
  const reason = signal?.reason;
  return reason instanceof Error && /timeout/i.test(reason.message);
}

function readJsonFile<T>(filePath: string, readFileSync: (filePath: string, encoding: "utf-8") => string): T | null {
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

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
): HarnessPackageInfo | null {
  const trimmed = trimToUndefined(entryPath);
  if (!trimmed) {
    return null;
  }

  let currentDir = path.dirname(resolveEntryRealPath(trimmed, existsSync));
  while (true) {
    const packageJsonPath = path.join(currentDir, "package.json");
    if (existsSync(packageJsonPath)) {
      const packageJson = readJsonFile<{ name?: string }>(packageJsonPath, readFileSync);
      if (isSupportedHarnessPackageName(packageJson?.name)) {
        return {
          packageRoot: currentDir,
          packageName: packageJson?.name ?? "",
        };
      }
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }
    currentDir = parentDir;
  }
}

function resolveHarnessPackageInfo(deps: PiSpawnDeps = {}): HarnessPackageInfo | null {
  const env = deps.env ?? process.env;
  const existsSync = deps.existsSync ?? fs.existsSync;
  const readFileSync = deps.readFileSync ?? ((filePath, encoding) => fs.readFileSync(filePath, encoding));

  const overriddenRoot = trimToUndefined(env[PI_RALPH_HARNESS_PACKAGE_ROOT_ENV]);
  if (overriddenRoot) {
    const packageJson = readJsonFile<{ name?: string }>(path.join(overriddenRoot, "package.json"), readFileSync);
    return {
      packageRoot: overriddenRoot,
      packageName: packageJson?.name ?? "",
    };
  }

  const fromArgv = resolvePackageRootFromEntry(deps.argv1 ?? process.argv[1], existsSync, readFileSync);
  if (fromArgv) {
    return fromArgv;
  }

  for (const packageName of HARNESS_PACKAGE_NAMES) {
    try {
      const packageJsonPath = require.resolve(`${packageName}/package.json`);
      const packageRoot = path.dirname(packageJsonPath);
      return {
        packageRoot,
        packageName,
      };
    } catch {}
  }

  return null;
}

function isGenericJsRuntime(execPath: string): boolean {
  const base = path.basename(execPath).toLowerCase();
  return base === "node" || base === "node.exe" || base === "bun" || base === "bun.exe";
}

function getHarnessBinaryName(packageName: string | undefined): "pi" | "omp" {
  return packageName === "@oh-my-pi/pi-coding-agent" ? "omp" : "pi";
}

function getHarnessSpawnCommand(args: string[], deps: PiSpawnDeps = {}): PiSpawnCommand {
  const env = deps.env ?? process.env;
  const overriddenCommand = trimToUndefined(env[PI_RALPH_HARNESS_COMMAND_ENV]);
  if (overriddenCommand) {
    return { command: overriddenCommand, args };
  }

  const execPath = deps.execPath ?? process.execPath;
  const existsSync = deps.existsSync ?? fs.existsSync;
  const readFileSync = deps.readFileSync ?? ((filePath, encoding) => fs.readFileSync(filePath, encoding));
  const packageInfo = resolveHarnessPackageInfo(deps);
  const binaryName = getHarnessBinaryName(packageInfo?.packageName);

  if (packageInfo) {
    const packageJson = readJsonFile<{ bin?: string | Record<string, string> }>(
      path.join(packageInfo.packageRoot, "package.json"),
      readFileSync,
    );
    const binField = packageJson?.bin;
    const binPath =
      typeof binField === "string"
        ? binField
        : typeof binField?.[binaryName] === "string"
          ? binField[binaryName]
          : Object.values(binField ?? {}).find((value) => typeof value === "string");
    if (typeof binPath === "string") {
      const resolvedBinPath = path.resolve(packageInfo.packageRoot, binPath);
      if (existsSync(resolvedBinPath)) {
        if (isGenericJsRuntime(execPath)) {
          return {
            command: execPath,
            args: [resolvedBinPath, ...args],
          };
        }
        return {
          command: resolvedBinPath,
          args,
        };
      }
    }
  }

  return { command: binaryName, args };
}

function currentTimestamp(recordTimestamp: string | undefined): string {
  return trimToUndefined(recordTimestamp) ?? new Date().toISOString();
}

function extractTextContent(content: SessionMessage["content"]): string | null {
  if (!Array.isArray(content)) {
    return null;
  }
  const text = content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n\n")
    .trim();
  return text || null;
}

function extractToolCallContent(content: SessionMessage["content"]): Array<{ id: string | null; name: string | null }> {
  if (!Array.isArray(content)) {
    return [];
  }
  return content
    .filter((part) => part?.type === "toolCall")
    .map((part) => ({
      id: trimToUndefined(part.id) ?? null,
      name: trimToUndefined(part.name) ?? null,
    }))
    .filter((part) => part.name !== null);
}

function extractToolResultError(record: SessionRecord): string | null {
  const message = record.message;
  if (!message || message.isError !== true) {
    return null;
  }
  const explicitError = trimToUndefined(message.errorMessage);
  if (explicitError) {
    return explicitError;
  }
  return extractTextContent(message.content);
}

function appendEvent(
  state: RuntimeParseState,
  event: RalphRuntimeEvent,
  onEvent?: (event: RalphLaunchEvent) => void | Promise<void>,
): void {
  state.events.push(event);
  if (!onEvent) {
    return;
  }
  void Promise.resolve(onEvent(event)).catch(() => {});
}

function applySessionRecord(
  state: RuntimeParseState,
  record: SessionRecord,
  onUpdate?: (text: string) => void,
  onEvent?: (event: RalphLaunchEvent) => void | Promise<void>,
): void {
  if (record.type !== "message" || !record.message) {
    return;
  }

  const at = currentTimestamp(record.timestamp);
  const role = trimToUndefined(record.message.role);
  if (role === "assistant") {
    state.usage = mergeUsage(state.usage, record.message.usage);
    state.lastAssistantStopReason = trimToUndefined(record.message.stopReason) ?? state.lastAssistantStopReason;
    state.lastAssistantError = trimToUndefined(record.message.errorMessage) ?? state.lastAssistantError;

    for (const toolCall of extractToolCallContent(record.message.content)) {
      appendEvent(
        state,
        {
          type: "tool_execution",
          phase: "start",
          toolName: toolCall.name ?? "unknown",
          toolCallId: toolCall.id,
          errorMessage: null,
          at,
        },
        onEvent,
      );
    }

    const text = extractTextContent(record.message.content);
    if (text) {
      state.output = text;
      onUpdate?.(text);
      appendEvent(state, { type: "assistant_message", text, at }, onEvent);
    }
    return;
  }

  if (role === "toolResult") {
    const toolName = trimToUndefined(record.message.toolName);
    if (!toolName) {
      return;
    }
    appendEvent(
      state,
      {
        type: "tool_execution",
        phase: "end",
        toolName,
        toolCallId: trimToUndefined(record.message.toolCallId) ?? null,
        errorMessage: extractToolResultError(record),
        at,
      },
      onEvent,
    );
  }
}

function drainSessionJsonl(
  filePath: string,
  cursor: JsonlCursor,
  state: RuntimeParseState,
  onUpdate?: (text: string) => void,
  onEvent?: (event: RalphLaunchEvent) => void | Promise<void>,
): void {
  let handle: number | null = null;
  try {
    handle = fs.openSync(filePath, "r");
    const stats = fs.fstatSync(handle);
    if (stats.size <= cursor.offset) {
      return;
    }
    const length = stats.size - cursor.offset;
    const buffer = Buffer.alloc(length);
    const bytesRead = fs.readSync(handle, buffer, 0, length, cursor.offset);
    cursor.offset += bytesRead;
    const text = cursor.partialLine + cursor.decoder.write(buffer.subarray(0, bytesRead));
    const lines = text.split(/\r?\n/);
    cursor.partialLine = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      try {
        applySessionRecord(state, JSON.parse(trimmed) as SessionRecord, onUpdate, onEvent);
      } catch {}
    }
  } catch {
    // The harness may still be creating or rotating the file. The next poll will retry.
  } finally {
    if (handle !== null) {
      fs.closeSync(handle);
    }
  }
}

function finishSessionJsonl(
  cursor: JsonlCursor,
  state: RuntimeParseState,
  onUpdate?: (text: string) => void,
  onEvent?: (event: RalphLaunchEvent) => void | Promise<void>,
): void {
  const tail = `${cursor.partialLine}${cursor.decoder.end()}`.trim();
  cursor.partialLine = "";
  if (!tail) {
    return;
  }
  try {
    applySessionRecord(state, JSON.parse(tail) as SessionRecord, onUpdate, onEvent);
  } catch {}
}

function resolveSessionJsonlPath(sessionDir: string): string | null {
  try {
    const entries = fs
      .readdirSync(sessionDir)
      .filter((entry) => entry.endsWith(".jsonl"))
      .sort((left, right) => left.localeCompare(right));
    const latest = entries.at(-1);
    return latest ? path.join(sessionDir, latest) : null;
  } catch {
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

export async function runRalphLaunch(
  cwd: string,
  launch: RalphLaunchDescriptor,
  signal: AbortSignal | undefined,
  onUpdate?: (text: string) => void,
  extraEnv?: Record<string, string | undefined>,
  onEvent?: (event: RalphLaunchEvent) => void | Promise<void>,
): Promise<RalphExecutionResult> {
  const runtimeEnv = { ...process.env, ...extraEnv };
  const prompt = renderLaunchPrompt(cwd, launch);
  const extensionRoot = resolveRalphExtensionRoot();
  const sessionDir = fs.mkdtempSync(path.join(tmpdir(), "pi-loom-ralph-"));
  const command = getHarnessSpawnCommand(
    ["-e", extensionRoot, "--mode=json", "-p", prompt, "--session-dir", sessionDir],
    { env: runtimeEnv },
  );
  const events: RalphRuntimeEvent[] = [];
  const state: RuntimeParseState = {
    output: "",
    usage: emptyUsage(),
    events,
  };
  const emitEvent = (event: RalphRuntimeEvent) => appendEvent(state, event, onEvent);
  let startedAt: string | null = null;

  if (signal?.aborted) {
    const completedAt = new Date().toISOString();
    const timedOut = isTimeoutAbortSignal(signal);
    return {
      command: command.command,
      args: command.args,
      exitCode: 1,
      output: "",
      stderr: timedOut ? "Timed out" : "Aborted",
      usage: state.usage,
      startedAt,
      completedAt,
      status: timedOut ? "failed" : "cancelled",
      events,
    };
  }

  emitEvent({ type: "launch_state", state: "queued", at: new Date().toISOString() });

  let stdout = "";
  let stderr = "";
  let spawnErrorText: string | null = null;
  let processClosed = false;
  const cursor: JsonlCursor = {
    offset: 0,
    partialLine: "",
    decoder: new StringDecoder("utf8"),
  };
  let sessionJsonlPath: string | null = null;

  const proc = spawn(command.command, command.args, {
    cwd,
    env: runtimeEnv,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  startedAt = new Date().toISOString();
  emitEvent({ type: "launch_state", state: "running", at: startedAt });

  proc.stdout.on("data", (chunk: Buffer | string) => {
    stdout += chunk.toString();
  });
  proc.stderr.on("data", (chunk: Buffer | string) => {
    stderr += chunk.toString();
  });
  proc.on("error", (error) => {
    spawnErrorText = error instanceof Error ? error.message : String(error);
  });

  const abortProcess = () => {
    proc.kill("SIGTERM");
    const timer = setTimeout(() => {
      if (!proc.killed) {
        proc.kill("SIGKILL");
      }
    }, PROCESS_ABORT_GRACE_MS);
    timer.unref?.();
  };

  if (signal?.aborted) {
    abortProcess();
  } else {
    signal?.addEventListener("abort", abortProcess, { once: true });
  }

  const processPromise = new Promise<number>((resolve) => {
    proc.on("close", (code) => {
      processClosed = true;
      resolve(code ?? 0);
    });
  });

  const watchPromise = (async () => {
    while (true) {
      sessionJsonlPath ||= resolveSessionJsonlPath(sessionDir);
      if (sessionJsonlPath) {
        drainSessionJsonl(sessionJsonlPath, cursor, state, onUpdate, onEvent);
      }
      if (processClosed) {
        break;
      }
      await delay(SESSION_FILE_POLL_MS);
    }

    if (sessionJsonlPath) {
      drainSessionJsonl(sessionJsonlPath, cursor, state, onUpdate, onEvent);
      finishSessionJsonl(cursor, state, onUpdate, onEvent);
    }
  })();

  const exitCode = await processPromise;
  processClosed = true;
  await watchPromise;
  signal?.removeEventListener("abort", abortProcess);

  const completedAt = new Date().toISOString();
  const stderrText =
    trimToUndefined(stderr) ??
    state.lastAssistantError ??
    spawnErrorText ??
    (signal?.aborted ? (isTimeoutAbortSignal(signal) ? "Timed out" : "Aborted") : undefined) ??
    (state.lastAssistantStopReason === "error" ? "Harness execution failed." : undefined) ??
    undefined;
  const finalExitCode = spawnErrorText ? 1 : exitCode;
  const cancelled = signal?.aborted && !isTimeoutAbortSignal(signal);
  const failedByAssistant = state.lastAssistantStopReason === "error";
  const failedByAbort = isTimeoutAbortSignal(signal);
  const status: RalphExecutionResult["status"] = failedByAbort
    ? "failed"
    : cancelled || state.lastAssistantStopReason === "aborted"
      ? "cancelled"
      : finalExitCode === 0 && !failedByAssistant
        ? "completed"
        : "failed";

  try {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  } catch {}

  return {
    command: command.command,
    args: command.args,
    exitCode: finalExitCode,
    output: state.output,
    stderr: stderrText ?? trimToUndefined(stdout) ?? "",
    usage: state.usage,
    startedAt,
    completedAt,
    status,
    events,
  };
}

export function resolveRalphExtensionRoot(startDir = path.dirname(fileURLToPath(import.meta.url))): string {
  let currentDir = path.resolve(startDir);
  while (true) {
    const packageJsonPath = path.join(currentDir, "package.json");
    const packageJson = readJsonFile<{ pi?: { extensions?: string[] }; omp?: { extensions?: string[] } }>(
      packageJsonPath,
      (filePath, encoding) => fs.readFileSync(filePath, encoding),
    );
    if (
      (packageJson?.pi?.extensions && packageJson.pi.extensions.length > 0) ||
      (packageJson?.omp?.extensions && packageJson.omp.extensions.length > 0)
    ) {
      return currentDir;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return path.resolve(startDir);
    }
    currentDir = parentDir;
  }
}
