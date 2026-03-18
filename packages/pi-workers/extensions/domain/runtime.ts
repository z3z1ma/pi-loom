import { execFileSync, spawn } from "node:child_process";
import fs, { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { Model } from "@mariozechner/pi-ai";
import {
  buildSessionContext,
  createCodingTools,
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  type ExtensionContext,
  type ModelRegistry,
} from "@mariozechner/pi-coding-agent";
import type {
  PrepareWorkerLaunchInput,
  WorkerReadResult,
  WorkerRuntimeDescriptor,
  WorkerRuntimeKind,
} from "./models.js";
import { DEFAULT_WORKER_RUNTIME_KIND } from "./models.js";
import { getWorkerRuntimeDir } from "./paths.js";
import { renderWorkerLaunchPrompt } from "./render.js";

function normalizePath(filePath: string): string {
  return path.normalize(filePath);
}

function isRunnableNodeScript(filePath: string, exists: typeof existsSync): boolean {
  return !!filePath && exists(filePath) && filePath.endsWith(".js");
}

function isGenericJsRuntime(execPath: string): boolean {
  const base = path.basename(execPath).toLowerCase();
  return base === "node" || base === "bun" || base === "deno";
}

export interface PiSpawnDeps {
  argv1?: string | undefined;
  execPath?: string | undefined;
  existsSync?: typeof existsSync;
  readFileSync?: (filePath: string, encoding: BufferEncoding) => string;
  resolvePackageJson?: (() => string) | undefined;
  piPackageRoot?: string | undefined;
}

export interface PiSpawnCommand {
  command: string;
  args: string[];
}

export interface WorkerExecutionResult {
  status: "completed" | "failed" | "cancelled";
  output: string;
  error: string | null;
}

export interface WorkerSdkSessionConfig {
  ledgerRoot?: string | undefined;
  extensionRoot?: string | undefined;
  cliExtensionPaths?: string[] | undefined;
  agentDir?: string | undefined;
  modelRegistry?: ModelRegistry | undefined;
  model?: Model<any> | undefined;
  thinkingLevel?: ThinkingLevel | undefined;
}

const SUPPORTED_THINKING_LEVELS = new Set<ThinkingLevel>(["off", "minimal", "low", "medium", "high", "xhigh"]);

interface PiWorkspaceManifest {
  pi?: {
    extensions?: unknown;
  };
}

export function resolveWorkspaceExtensionPaths(workspaceDir: string): string[] {
  const manifestPath = path.join(workspaceDir, "package.json");
  if (!existsSync(manifestPath)) {
    return [];
  }

  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as PiWorkspaceManifest;
    const extensionEntries = manifest.pi?.extensions;
    if (!Array.isArray(extensionEntries)) {
      return [];
    }

    return extensionEntries
      .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
      .map((entry) => path.resolve(path.dirname(manifestPath), entry))
      .filter((entryPath) => existsSync(entryPath));
  } catch {
    return [];
  }
}

export function resolveCliExtensionPathsFromArgv(baseDir: string, argv: string[] = process.argv): string[] {
  const resolvedPaths: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if ((arg === "--extension" || arg === "-e") && typeof argv[index + 1] === "string") {
      const candidate = path.resolve(baseDir, argv[index + 1] ?? "");
      if (existsSync(candidate)) {
        resolvedPaths.push(candidate);
      }
      index += 1;
    }
  }

  return [...new Set(resolvedPaths)];
}

function resolveAgentDirFromSessionPath(sessionPath: string | undefined): string | undefined {
  if (!sessionPath) {
    return undefined;
  }

  const normalizedPath = path.resolve(sessionPath);
  const sessionsDir = path.dirname(normalizedPath);
  if (path.basename(sessionsDir) !== "sessions") {
    return undefined;
  }

  return path.dirname(sessionsDir);
}

function resolveAgentDirFromModelRegistry(modelRegistry: ModelRegistry | undefined): string | undefined {
  const modelsJsonPath = (modelRegistry as unknown as { modelsJsonPath?: unknown } | undefined)?.modelsJsonPath;
  if (typeof modelsJsonPath !== "string" || modelsJsonPath.length === 0) {
    return undefined;
  }
  return path.dirname(modelsJsonPath);
}

function resolveInheritedThinkingLevel(
  sessionManager: Partial<Pick<ExtensionContext, "sessionManager">>["sessionManager"],
): ThinkingLevel | undefined {
  if (!sessionManager) {
    return undefined;
  }

  const current = buildSessionContext(sessionManager.getEntries(), sessionManager.getLeafId()).thinkingLevel;
  if (!SUPPORTED_THINKING_LEVELS.has(current as ThinkingLevel)) {
    return undefined;
  }

  return current as ThinkingLevel;
}

export function buildInheritedWorkerSdkSessionConfig(
  ctx: Partial<Pick<ExtensionContext, "cwd" | "model" | "modelRegistry" | "sessionManager">>,
): WorkerSdkSessionConfig {
  const envAgentDir = process.env.PI_CODING_AGENT_DIR?.trim() || undefined;
  const agentDir =
    envAgentDir ??
    resolveAgentDirFromSessionPath(ctx.sessionManager?.getSessionFile()) ??
    resolveAgentDirFromSessionPath(ctx.sessionManager?.getSessionDir()) ??
    resolveAgentDirFromModelRegistry(ctx.modelRegistry);

  return {
    ledgerRoot: ctx.cwd,
    extensionRoot: ctx.cwd,
    cliExtensionPaths: ctx.cwd ? resolveCliExtensionPathsFromArgv(ctx.cwd) : [],
    agentDir,
    modelRegistry: ctx.modelRegistry,
    model: ctx.model,
    thinkingLevel: resolveInheritedThinkingLevel(ctx.sessionManager),
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
  const pathExists = deps.existsSync ?? existsSync;
  const readText = deps.readFileSync ?? ((filePath, encoding) => readFileSync(filePath, encoding));
  const argv1 = deps.argv1 ?? process.argv[1];

  if (argv1) {
    const argvPath = normalizePath(argv1);
    if (isRunnableNodeScript(argvPath, pathExists)) {
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
    const packageJson = JSON.parse(readText(packageJsonPath, "utf-8")) as {
      bin?: string | Record<string, string>;
    };
    const binField = packageJson.bin;
    const binPath = typeof binField === "string" ? binField : (binField?.pi ?? Object.values(binField ?? {})[0]);
    if (!binPath) return undefined;
    const candidate = normalizePath(path.resolve(path.dirname(packageJsonPath), binPath));
    if (isRunnableNodeScript(candidate, pathExists)) {
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
  const pathExists = deps.existsSync ?? existsSync;

  if (argv1) {
    const argvPath = normalizePath(argv1);
    if (isRunnableNodeScript(argvPath, pathExists)) {
      return { command: execPath, args: [argvPath, ...args] };
    }
  }

  if (!isGenericJsRuntime(execPath)) {
    return { command: execPath, args };
  }

  const piCliPath = resolvePiCliScript(deps);
  if (piCliPath) {
    return { command: execPath, args: [piCliPath, ...args] };
  }

  return { command: "pi", args };
}

function runGit(repoRoot: string, args: string[]): string {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf-8" }).trim();
}

function gitBranchExists(repoRoot: string, branch: string): boolean {
  const output = runGit(repoRoot, ["branch", "--list", branch]);
  return output.length > 0;
}

export function ensureWorkerWorkspace(cwd: string, worker: WorkerReadResult): string {
  const runtimeRoot = getWorkerRuntimeDir(cwd, worker.state.workerId);
  mkdirSync(path.dirname(runtimeRoot), { recursive: true });

  if (existsSync(runtimeRoot) && !existsSync(path.join(runtimeRoot, ".git"))) {
    rmSync(runtimeRoot, { recursive: true, force: true });
  }

  if (existsSync(runtimeRoot) && existsSync(path.join(runtimeRoot, ".git"))) {
    const currentBranch = runGit(runtimeRoot, ["branch", "--show-current"]);
    if (currentBranch !== worker.state.workspace.branch) {
      retireWorkerWorkspace(cwd, worker.state.workerId, runtimeRoot);
    }
  }

  if (!existsSync(runtimeRoot)) {
    const branchExists = gitBranchExists(cwd, worker.state.workspace.branch);
    if (branchExists) {
      runGit(cwd, ["worktree", "add", "--force", runtimeRoot, worker.state.workspace.branch]);
    } else {
      runGit(cwd, [
        "worktree",
        "add",
        "-b",
        worker.state.workspace.branch,
        runtimeRoot,
        worker.state.workspace.baseRef,
      ]);
    }
  }

  return runtimeRoot;
}

function resolveManagedRuntimePath(cwd: string, workerId: string, workspaceDir: string): string {
  const expectedWorkspacePath = path.resolve(getWorkerRuntimeDir(cwd, workerId));
  const resolvedWorkspacePath = path.resolve(workspaceDir);
  if (resolvedWorkspacePath !== expectedWorkspacePath) {
    throw new Error(`Refusing to retire workspace not owned by worker ${workerId}: ${workspaceDir}`);
  }
  return expectedWorkspacePath;
}

export function retireWorkerWorkspace(cwd: string, workerId: string, workspaceDir: string): void {
  const managedWorkspacePath = resolveManagedRuntimePath(cwd, workerId, workspaceDir);
  if (!existsSync(managedWorkspacePath)) {
    return;
  }
  try {
    const repoRoot = execFileSync("git", ["-C", managedWorkspacePath, "rev-parse", "--show-toplevel"], {
      encoding: "utf-8",
    }).trim();
    execFileSync("git", ["-C", repoRoot, "worktree", "remove", "--force", managedWorkspacePath], {
      encoding: "utf-8",
    });
  } catch {
    rmSync(managedWorkspacePath, { recursive: true, force: true });
  }
}

function normalizeRuntimeKind(
  input: PrepareWorkerLaunchInput | undefined,
  worker: WorkerReadResult,
): WorkerRuntimeKind {
  const preparedRuntime = worker.launch && worker.launch.status !== "retired" ? worker.launch.runtime : undefined;
  return input?.runtime ?? worker.state.lastRuntimeKind ?? preparedRuntime ?? DEFAULT_WORKER_RUNTIME_KIND;
}

function runtimeCommandPlaceholder(runtime: WorkerRuntimeKind, prompt: string): string[] {
  if (runtime === "subprocess") {
    const command = getPiSpawnCommand(["--mode", "json", "-p", "--no-session", prompt]);
    return [command.command, ...command.args];
  }
  if (runtime === "sdk") {
    return ["sdk-session", prompt];
  }
  return ["rpc-session", "--mode", "rpc"];
}

export function prepareWorkerLaunchDescriptor(
  cwd: string,
  worker: WorkerReadResult,
  input: PrepareWorkerLaunchInput = {},
): WorkerRuntimeDescriptor {
  const workspaceDir = ensureWorkerWorkspace(cwd, worker);
  const prompt = input.prompt?.trim() || renderWorkerLaunchPrompt(worker);
  const runtime = normalizeRuntimeKind(input, worker);
  return {
    workerId: worker.state.workerId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    runtime,
    resume: input.resume === true,
    workspaceDir,
    branch: worker.state.workspace.branch,
    baseRef: worker.state.workspace.baseRef,
    launchPrompt: prompt,
    command: runtimeCommandPlaceholder(runtime, prompt),
    pid: null,
    status: "prepared",
    note: input.note?.trim() ?? "",
  };
}

async function runSubprocessWorkerLaunch(
  launch: WorkerRuntimeDescriptor,
  signal?: AbortSignal,
  onUpdate?: (text: string) => void,
): Promise<WorkerExecutionResult> {
  const [command, ...args] = launch.command;
  const proc = spawn(command, args, {
    cwd: launch.workspaceDir,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdoutBuffer = "";
  let stderr = "";
  let output = "";

  const processLine = (line: string) => {
    if (!line.trim()) return;
    try {
      const event = JSON.parse(line) as {
        type?: string;
        message?: { role?: string; content?: Array<{ type?: string; text?: string }> };
      };
      if (event.type === "message_end" && event.message?.role === "assistant") {
        output = (event.message.content ?? [])
          .filter((block) => block.type === "text")
          .map((block) => block.text ?? "")
          .join("\n")
          .trim();
        onUpdate?.(output);
      }
    } catch {
      stderr += `${line}\n`;
    }
  };

  proc.stdout.on("data", (chunk: Buffer | string) => {
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() ?? "";
    for (const line of lines) {
      processLine(line);
    }
  });

  proc.stderr.on("data", (chunk: Buffer | string) => {
    stderr += chunk.toString();
  });

  const abortHandler = () => proc.kill();
  signal?.addEventListener("abort", abortHandler, { once: true });

  return await new Promise<WorkerExecutionResult>((resolve) => {
    proc.on("close", (code) => {
      signal?.removeEventListener("abort", abortHandler);
      if (signal?.aborted) {
        resolve({ status: "cancelled", output, error: "Cancelled" });
        return;
      }
      if (stdoutBuffer.trim()) {
        processLine(stdoutBuffer.trim());
      }
      if (code === 0) {
        resolve({ status: "completed", output, error: stderr.trim() || null });
      } else {
        resolve({ status: "failed", output, error: stderr.trim() || `Worker process exited with code ${code}` });
      }
    });
    proc.on("error", (error) => {
      signal?.removeEventListener("abort", abortHandler);
      resolve({ status: "failed", output, error: error.message });
    });
  });
}

async function runSdkWorkerLaunch(
  launch: WorkerRuntimeDescriptor,
  signal?: AbortSignal,
  onUpdate?: (text: string) => void,
  sdkSessionConfig?: WorkerSdkSessionConfig,
): Promise<WorkerExecutionResult> {
  let output = "";
  let terminalError: string | null = null;
  let toolExecutionCount = 0;
  let lastAssistantStopReason: string | null = null;
  let lastAssistantContentCount = 0;
  let session: Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;

  try {
    const ledgerRoot = sdkSessionConfig?.ledgerRoot ?? launch.workspaceDir;
    const extensionRoot = sdkSessionConfig?.extensionRoot ?? launch.workspaceDir;
    const additionalExtensionPaths = [
      ...resolveWorkspaceExtensionPaths(extensionRoot),
      ...(sdkSessionConfig?.cliExtensionPaths ?? []),
    ];
    const resourceLoader = new DefaultResourceLoader({
      cwd: launch.workspaceDir,
      agentDir: sdkSessionConfig?.agentDir,
      additionalExtensionPaths,
    });
    await resourceLoader.reload();

    const created = await createAgentSession({
      cwd: ledgerRoot,
      agentDir: sdkSessionConfig?.agentDir,
      modelRegistry: sdkSessionConfig?.modelRegistry,
      model: sdkSessionConfig?.model,
      thinkingLevel: sdkSessionConfig?.thinkingLevel,
      tools: createCodingTools(launch.workspaceDir),
      resourceLoader,
      sessionManager: SessionManager.inMemory(ledgerRoot),
    });
    session = created.session;
  } catch (error) {
    return {
      status: "failed",
      output: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }

  if (!session) {
    return { status: "failed", output: "", error: "SDK worker session was not created" };
  }

  const unsubscribe = session.subscribe((event: unknown) => {
    const messageEvent = event as {
      type?: string;
      assistantMessageEvent?: { type?: string; delta?: string };
      toolName?: string;
      message?: {
        role?: string;
        content?: Array<{ type?: string; text?: string }>;
        stopReason?: string;
        errorMessage?: string;
      };
    };
    if (messageEvent.type === "message_update" && messageEvent.assistantMessageEvent?.type === "text_delta") {
      output += messageEvent.assistantMessageEvent.delta ?? "";
      onUpdate?.(output);
      return;
    }

    if (messageEvent.type === "tool_execution_start") {
      toolExecutionCount += 1;
      return;
    }

    if (messageEvent.type === "message_end" && messageEvent.message?.role === "assistant") {
      lastAssistantStopReason = messageEvent.message.stopReason ?? null;
      lastAssistantContentCount = messageEvent.message.content?.length ?? 0;
      if (!output.trim()) {
        output = (messageEvent.message.content ?? [])
          .filter((block) => block.type === "text")
          .map((block) => block.text ?? "")
          .join("\n")
          .trim();
        if (output) {
          onUpdate?.(output);
        }
      }

      if (messageEvent.message.stopReason === "error") {
        terminalError = messageEvent.message.errorMessage?.trim() || "SDK worker session ended with an empty assistant error";
      }
    }
  });

  const abortHandler = () => session.abort();
  signal?.addEventListener("abort", abortHandler, { once: true });

  try {
    await session.prompt(launch.launchPrompt);
    if (signal?.aborted) {
      return { status: "cancelled", output, error: "Cancelled" };
    }
    if (terminalError) {
      return { status: "failed", output: output.trim(), error: terminalError };
    }
    if (!output.trim() && toolExecutionCount === 0 && lastAssistantContentCount === 0) {
      return {
        status: "failed",
        output: "",
        error: `SDK worker session ended with an empty assistant turn${lastAssistantStopReason ? ` (stopReason: ${lastAssistantStopReason})` : ""}`,
      };
    }
    return { status: "completed", output: output.trim(), error: null };
  } catch (error) {
    if (signal?.aborted) {
      return { status: "cancelled", output: output.trim(), error: "Cancelled" };
    }
    return {
      status: "failed",
      output: output.trim(),
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    unsubscribe();
    signal?.removeEventListener("abort", abortHandler);
    await session.dispose();
  }
}

async function runRpcWorkerLaunch(
  launch: WorkerRuntimeDescriptor,
  _signal?: AbortSignal,
  _onUpdate?: (text: string) => void,
): Promise<WorkerExecutionResult> {
  return {
    status: "failed",
    output: "",
    error: `RPC worker runtime fallback is not implemented yet for ${launch.workerId}`,
  };
}

export async function runWorkerLaunch(
  launch: WorkerRuntimeDescriptor,
  signal?: AbortSignal,
  onUpdate?: (text: string) => void,
  sdkSessionConfig?: WorkerSdkSessionConfig,
): Promise<WorkerExecutionResult> {
  switch (launch.runtime) {
    case "subprocess":
      return runSubprocessWorkerLaunch(launch, signal, onUpdate);
    case "sdk":
      return runSdkWorkerLaunch(launch, signal, onUpdate, sdkSessionConfig);
    case "rpc":
      return runRpcWorkerLaunch(launch, signal, onUpdate);
    default:
      return {
        status: "failed",
        output: "",
        error: `Unsupported worker runtime: ${(launch as { runtime?: string }).runtime ?? "unknown"}`,
      };
  }
}

export function writeRuntimeDescriptor(pathToFile: string, descriptor: WorkerRuntimeDescriptor): void {
  void pathToFile;
  void descriptor;
}
