import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { createRalphStore } from "@pi-loom/pi-ralph/extensions/domain/store.js";
import { runRalphLaunch } from "@pi-loom/pi-ralph/extensions/domain/runtime.js";
import type { RalphLaunchDescriptor } from "@pi-loom/pi-ralph/extensions/domain/models.js";
import type { PrepareWorkerLaunchInput, WorkerReadResult, WorkerRuntimeDescriptor } from "./models.js";
import { DEFAULT_WORKER_RUNTIME_KIND } from "./models.js";
import { getWorkerRuntimeDir } from "./paths.js";
import { renderWorkerLaunchPrompt } from "./render.js";

export interface WorkerExecutionResult {
  status: "completed" | "failed" | "cancelled";
  output: string;
  error: string | null;
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
      runGit(cwd, ["worktree", "add", "-b", worker.state.workspace.branch, runtimeRoot, worker.state.workspace.baseRef]);
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

function linkedRalphRunId(worker: WorkerReadResult): string {
  const [runId, ...rest] = worker.state.linkedRefs.ralphRunIds;
  if (!runId || rest.length > 0) {
    throw new Error(`Worker ${worker.state.workerId} must link exactly one Ralph run before launch.`);
  }
  return runId;
}

function prepareLinkedRalphLaunch(
  cwd: string,
  worker: WorkerReadResult,
  input: PrepareWorkerLaunchInput,
): RalphLaunchDescriptor {
  const store = createRalphStore(cwd);
  const runId = linkedRalphRunId(worker);
  const instructions = [
    `Execute the next Ralph iteration in worktree ${worker.state.workspace.branch}.`,
    `Use worker ${worker.state.workerId} as the manager-facing wrapper for run ${runId}.`,
    "Leave durable worker checkpoint, inbox, approval, and consolidation state truthful before stopping.",
  ];
  const result =
    input.resume === true
      ? store.resumeRun(runId, { instructions })
      : store.prepareLaunch(runId, { instructions, focus: worker.state.objective || worker.state.summary });
  return result.launch;
}

export function prepareWorkerLaunchDescriptor(
  cwd: string,
  worker: WorkerReadResult,
  input: PrepareWorkerLaunchInput = {},
): WorkerRuntimeDescriptor {
  const workspaceDir = ensureWorkerWorkspace(cwd, worker);
  const prompt = input.prompt?.trim() || renderWorkerLaunchPrompt(worker);
  const ralphLaunch = prepareLinkedRalphLaunch(cwd, worker, input);
  return {
    workerId: worker.state.workerId,
    ralphRunId: ralphLaunch.runId,
    iterationId: ralphLaunch.iterationId,
    iteration: ralphLaunch.iteration,
    createdAt: ralphLaunch.createdAt,
    updatedAt: ralphLaunch.createdAt,
    runtime: ralphLaunch.runtime ?? DEFAULT_WORKER_RUNTIME_KIND,
    resume: ralphLaunch.resume,
    workspaceDir,
    branch: worker.state.workspace.branch,
    baseRef: worker.state.workspace.baseRef,
    packetRef: ralphLaunch.packetRef,
    ralphLaunchRef: ralphLaunch.launchRef,
    instructions: [...ralphLaunch.instructions],
    launchPrompt: prompt,
    command: ["pi", "ralph", ralphLaunch.resume ? "resume" : "launch", ralphLaunch.runId],
    pid: null,
    status: "prepared",
    note: input.note?.trim() ?? "Prepared linked Ralph iteration.",
  };
}

export async function runWorkerLaunch(
  launch: WorkerRuntimeDescriptor,
  signal?: AbortSignal,
  onUpdate?: (text: string) => void,
): Promise<WorkerExecutionResult> {
  if (!launch.ralphRunId || !launch.iterationId || !launch.packetRef || !launch.ralphLaunchRef) {
    return {
      status: "failed",
      output: "",
      error: "Worker launch descriptor is missing linked Ralph run metadata.",
    };
  }
  const instructions = Array.isArray(launch.instructions) ? launch.instructions : [];
  const execution = await runRalphLaunch(
    launch.workspaceDir,
    {
      runId: launch.ralphRunId,
      iterationId: launch.iterationId,
      iteration: launch.iteration,
      createdAt: launch.createdAt,
      runtime: launch.runtime,
      packetRef: launch.packetRef,
      launchRef: launch.ralphLaunchRef,
      resume: launch.resume,
      instructions: [...instructions],
    },
    signal,
    onUpdate,
  );

  if (signal?.aborted) {
    return { status: "cancelled", output: execution.output.trim(), error: execution.stderr.trim() || "Cancelled" };
  }

  if (execution.exitCode !== 0) {
    return {
      status: "failed",
      output: execution.output.trim(),
      error: execution.stderr.trim() || `Linked Ralph iteration exited with code ${execution.exitCode}`,
    };
  }

  return {
    status: "completed",
    output: execution.output.trim(),
    error: execution.stderr.trim() || null,
  };
}

export function writeRuntimeDescriptor(pathToFile: string, descriptor: WorkerRuntimeDescriptor): void {
  void pathToFile;
  void descriptor;
}
