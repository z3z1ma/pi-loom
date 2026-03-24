import { spawn } from "node:child_process";
import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { type LoomRuntimeScope, runtimeScopeToEnv } from "#storage/runtime-scope.js";

const require = createRequire(import.meta.url);

export interface PiSpawnDeps {
  platform?: NodeJS.Platform;
  execPath?: string;
  argv1?: string;
  existsSync?: (filePath: string) => boolean;
  readFileSync?: (filePath: string, encoding: "utf-8") => string;
  resolvePackageJson?: () => string;
  piPackageRoot?: string;
  docsPackageRoot?: string;
}

export interface PiSpawnCommand {
  command: string;
  args: string[];
}

export interface DocsExecutionResult {
  command: string;
  args: string[];
  exitCode: number;
  output: string;
  stderr: string;
}

function isRunnableNodeScript(
  filePath: string,
  existsSync: (filePath: string) => boolean,
  readFileSync: (filePath: string, encoding: "utf-8") => string,
): boolean {
  if (!existsSync(filePath)) return false;
  if (/\.(?:mjs|cjs|js)$/i.test(filePath)) {
    return true;
  }
  if (path.extname(filePath)) {
    return false;
  }
  try {
    return readFileSync(filePath, "utf-8").startsWith("#!");
  } catch {
    return false;
  }
}

function isGenericJsRuntime(execPath: string): boolean {
  const base = path.basename(execPath).toLowerCase();
  return base === "node" || base === "node.exe" || base === "bun" || base === "bun.exe";
}

function normalizePath(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

export function resolveDocsPackageRoot(): string {
  let currentDir = path.dirname(fs.realpathSync(fileURLToPath(import.meta.url)));
  while (true) {
    const packageJsonPath = path.join(currentDir, "package.json");
    const packageJson = readJsonFile<{ pi?: { extensions?: string[] } }>(packageJsonPath);
    if (packageJson?.pi?.extensions && packageJson.pi.extensions.length > 0) {
      return currentDir;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return path.dirname(fs.realpathSync(fileURLToPath(import.meta.url)));
    }
    currentDir = parentDir;
  }
}

export interface DocsUpdateLaunchConfig {
  extensionRoot: string;
  spawn: PiSpawnCommand;
  env: Record<string, string>;
}

export function getDocsUpdateLaunchConfig(
  _cwd: string,
  prompt: string,
  scope: LoomRuntimeScope | undefined,
  deps: PiSpawnDeps = {},
): DocsUpdateLaunchConfig {
  const extensionRoot = deps.docsPackageRoot ?? resolveDocsPackageRoot();
  return {
    extensionRoot,
    spawn: getPiSpawnCommand(["-e", extensionRoot, "--mode", "json", "-p", "--no-session", prompt], deps),
    env: scope ? runtimeScopeToEnv(scope) : {},
  };
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
  const argv1 = deps.argv1 ?? process.argv[1];

  if (argv1) {
    const argvPath = normalizePath(argv1);
    if (isRunnableNodeScript(argvPath, existsSync, readFileSync)) {
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
    if (isRunnableNodeScript(candidate, existsSync, readFileSync)) {
      return candidate;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function getPiSpawnCommand(args: string[], deps: PiSpawnDeps = {}): PiSpawnCommand {
  const execPath = deps.execPath ?? process.execPath;
  const argv1 = deps.argv1 ?? process.argv[1];
  const existsSync = deps.existsSync ?? fs.existsSync;
  const readFileSync = deps.readFileSync ?? ((filePath, encoding) => fs.readFileSync(filePath, encoding));

  if (argv1) {
    const argvPath = normalizePath(argv1);
    if (isRunnableNodeScript(argvPath, existsSync, readFileSync)) {
      return {
        command: execPath,
        args: [argvPath, ...args],
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
      args: [piCliPath, ...args],
    };
  }

  return { command: "pi", args };
}

export async function runDocsUpdate(
  cwd: string,
  prompt: string,
  signal: AbortSignal | undefined,
  onUpdate?: (text: string) => void,
  scope?: LoomRuntimeScope,
): Promise<DocsExecutionResult> {
  const launch = getDocsUpdateLaunchConfig(cwd, prompt, scope);
  const command = launch.spawn;
  const spawnCwd = scope?.worktreePath ?? cwd;

  let resolvePromise: ((value: DocsExecutionResult) => void) | null = null;
  const promise = new Promise<DocsExecutionResult>((resolve) => {
    resolvePromise = resolve;
  });
  const proc = spawn(command.command, command.args, {
    cwd: spawnCwd,
    env: { ...process.env, ...launch.env },
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdoutBuffer = "";
  let stderr = "";
  let output = "";

  const processLine = (line: string) => {
    if (!line.trim()) {
      return;
    }
    try {
      const event = JSON.parse(line) as {
        type?: string;
        message?: {
          role?: string;
          content?: Array<{ type?: string; text?: string }>;
        };
      };
      if (event.type === "message_end" && event.message?.role === "assistant") {
        const text = event.message.content?.find((part) => part.type === "text")?.text?.trim();
        if (text) {
          output = text;
          onUpdate?.(text);
        }
      }
    } catch {}
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
      stderr: `${stderr}${error.message}`,
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
    const abortProcess = () => {
      proc.kill("SIGTERM");
      setTimeout(() => {
        if (!proc.killed) {
          proc.kill("SIGKILL");
        }
      }, 5000);
    };
    if (signal.aborted) {
      abortProcess();
    } else {
      signal.addEventListener("abort", abortProcess, { once: true });
    }
  }

  return promise;
}
