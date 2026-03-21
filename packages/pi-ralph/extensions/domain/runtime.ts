import { spawn } from "node:child_process";
import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { RalphLaunchDescriptor } from "./models.js";
import { renderLaunchPrompt } from "./render.js";

const require = createRequire(import.meta.url);

export interface PiSpawnDeps {
  platform?: NodeJS.Platform;
  execPath?: string;
  execArgv?: string[];
  argv1?: string;
  env?: NodeJS.ProcessEnv;
  existsSync?: (filePath: string) => boolean;
  readFileSync?: (filePath: string, encoding: "utf-8") => string;
  resolvePackageJson?: () => string;
  piPackageRoot?: string;
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

export const PI_PARENT_HARNESS_EXEC_PATH_ENV = "PI_PARENT_HARNESS_EXEC_PATH";
export const PI_PARENT_HARNESS_EXEC_ARGV_ENV = "PI_PARENT_HARNESS_EXEC_ARGV";
export const PI_PARENT_HARNESS_ARGV1_ENV = "PI_PARENT_HARNESS_ARGV1";

function isRunnableNodeScript(filePath: string, existsSync: (filePath: string) => boolean): boolean {
  if (!existsSync(filePath)) return false;
  return /\.(?:mjs|cjs|js)$/i.test(filePath);
}

function isGenericJsRuntime(execPath: string): boolean {
  const base = path.basename(execPath).toLowerCase();
  return base === "node" || base === "node.exe" || base === "bun" || base === "bun.exe";
}

function normalizePath(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
}

function appendErrorText(stderr: string, errorText: string): string {
  if (!errorText) return stderr;
  if (!stderr) return errorText;
  return `${stderr.trimEnd()}\n${errorText}`;
}

function trimToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
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
    argv1: inherited.argv1 ?? deps.argv1 ?? process.argv[1],
  };
}

export function captureParentHarnessSpawnEnv(
  env: NodeJS.ProcessEnv = process.env,
  deps: Pick<PiSpawnDeps, "execPath" | "execArgv" | "argv1"> = {},
): Record<string, string> {
  const resolved = resolvePiSpawnDeps({ env, ...deps });
  const forwardedEnv: Record<string, string> = {
    [PI_PARENT_HARNESS_EXEC_PATH_ENV]: resolved.execPath,
    [PI_PARENT_HARNESS_EXEC_ARGV_ENV]: JSON.stringify(resolved.execArgv),
  };
  if (resolved.argv1) {
    forwardedEnv[PI_PARENT_HARNESS_ARGV1_ENV] = resolved.argv1;
  }
  return forwardedEnv;
}

export function extractAssistantMessageEnd(line: string): { text?: string; errorText?: string } | null {
  try {
    const event = JSON.parse(line) as {
      type?: string;
      errorMessage?: string;
      message?: {
        role?: string;
        errorMessage?: string;
        content?: Array<{ type?: string; text?: string }>;
      };
    };
    if (event.type !== "message_end" || event.message?.role !== "assistant") {
      return null;
    }

    return {
      text: trimToUndefined(event.message.content?.find((part) => part.type === "text")?.text),
      errorText: trimToUndefined(event.message.errorMessage ?? event.errorMessage),
    };
  } catch {
    return null;
  }
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function resolvePiExtensionRootFromCwd(startDir: string): string | undefined {
  let currentDir = path.resolve(startDir);
  while (true) {
    const packageJsonPath = path.join(currentDir, "package.json");
    const packageJson = readJsonFile<{ pi?: { extensions?: string[] } }>(packageJsonPath);
    if (packageJson?.pi?.extensions && packageJson.pi.extensions.length > 0) {
      return currentDir;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return undefined;
    }
    currentDir = parentDir;
  }
}

export function resolveRalphExtensionRoot(startDir = path.dirname(fileURLToPath(import.meta.url))): string {
  let currentDir = path.resolve(startDir);
  while (true) {
    const packageJsonPath = path.join(currentDir, "package.json");
    const packageJson = readJsonFile<{ pi?: { extensions?: string[] } }>(packageJsonPath);
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

export function resolvePiPackageRoot(): string | undefined {
  try {
    const entry = process.argv[1];
    if (!entry) return undefined;
    let dir = path.dirname(fs.realpathSync(entry));
    while (dir !== path.dirname(dir)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf-8")) as { name?: string };
        if (pkg.name === "@mariozechner/pi-coding-agent") return dir;
      } catch {}
      dir = path.dirname(dir);
    }
  } catch {}
  return undefined;
}

export function resolvePiCliScript(deps: PiSpawnDeps = {}): string | undefined {
  const existsSync = deps.existsSync ?? fs.existsSync;
  const readFileSync = deps.readFileSync ?? ((filePath, encoding) => fs.readFileSync(filePath, encoding));
  const { argv1 } = resolvePiSpawnDeps(deps);

  if (argv1) {
    const argvPath = normalizePath(argv1);
    if (isRunnableNodeScript(argvPath, existsSync)) {
      return argvPath;
    }
  }

  try {
    const resolvePackageJson =
      deps.resolvePackageJson ??
      (() => {
        const root = deps.piPackageRoot ?? resolvePiPackageRoot();
        if (root) return path.join(root, "package.json");
        return require.resolve("@mariozechner/pi-coding-agent/package.json");
      });
    const packageJsonPath = resolvePackageJson();
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
      bin?: string | Record<string, string>;
    };
    const binField = packageJson.bin;
    const binPath = typeof binField === "string" ? binField : (binField?.pi ?? Object.values(binField ?? {})[0]);
    if (!binPath) return undefined;
    const candidate = normalizePath(path.resolve(path.dirname(packageJsonPath), binPath));
    if (isRunnableNodeScript(candidate, existsSync)) {
      return candidate;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function getPiSpawnCommand(args: string[], deps: PiSpawnDeps = {}): PiSpawnCommand {
  const { execPath, execArgv, argv1 } = resolvePiSpawnDeps(deps);
  const existsSync = deps.existsSync ?? fs.existsSync;

  if (argv1) {
    const argvPath = normalizePath(argv1);
    if (isRunnableNodeScript(argvPath, existsSync)) {
      return {
        command: execPath,
        args: [...execArgv, argvPath, ...args],
      };
    }
  }

  if (!isGenericJsRuntime(execPath)) {
    return {
      command: execPath,
      args,
    };
  }

  const piCliPath = resolvePiCliScript(deps);
  if (piCliPath) {
    return {
      command: execPath,
      args: [...execArgv, piCliPath, ...args],
    };
  }

  return { command: "pi", args };
}

export async function runRalphLaunch(
  cwd: string,
  launch: RalphLaunchDescriptor,
  signal: AbortSignal | undefined,
  onUpdate?: (text: string) => void,
  extraEnv?: Record<string, string | undefined>,
): Promise<RalphExecutionResult> {
  const extensionRoot = resolvePiExtensionRootFromCwd(cwd) ?? resolveRalphExtensionRoot();
  const prompt = renderLaunchPrompt(cwd, launch);
  const command = getPiSpawnCommand(["-e", extensionRoot, "--mode", "json", "-p", "--no-session", prompt]);

  let resolvePromise: ((value: RalphExecutionResult) => void) | null = null;
  const promise = new Promise<RalphExecutionResult>((resolve) => {
    resolvePromise = resolve;
  });
  const proc = spawn(command.command, command.args, {
    cwd,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
  });

  let stdoutBuffer = "";
  let stderr = "";
  let output = "";

  const processLine = (line: string) => {
    if (!line.trim()) {
      return;
    }
    const assistantMessage = extractAssistantMessageEnd(line);
    if (!assistantMessage) {
      return;
    }

    if (assistantMessage.text) {
      output = assistantMessage.text;
      onUpdate?.(assistantMessage.text);
    }
    if (assistantMessage.errorText) {
      stderr = appendErrorText(stderr, assistantMessage.errorText);
    }
  };

  proc.stdout.on("data", (data: Buffer | string) => {
    stdoutBuffer += data.toString();
    const lines = stdoutBuffer.split("\n");
    stdoutBuffer = lines.pop() ?? "";
    for (const line of lines) {
      processLine(line);
    }
  });

  proc.stderr.on("data", (data: Buffer | string) => {
    stderr += data.toString();
  });

  proc.on("error", (error) => {
    resolvePromise?.({
      command: command.command,
      args: command.args,
      exitCode: 1,
      output,
      stderr: appendErrorText(stderr, error.message),
    });
  });

  proc.on("close", (code) => {
    if (stdoutBuffer.trim()) {
      processLine(stdoutBuffer);
    }
    resolvePromise?.({
      command: command.command,
      args: command.args,
      exitCode: code ?? 0,
      output,
      stderr,
    });
  });

  if (signal) {
    signal.addEventListener(
      "abort",
      () => {
        proc.kill();
      },
      { once: true },
    );
  }

  return promise;
}
