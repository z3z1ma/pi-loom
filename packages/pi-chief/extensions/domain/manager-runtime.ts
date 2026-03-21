import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRalphStore } from "@pi-loom/pi-ralph/extensions/domain/store.js";
import {
  captureParentHarnessSpawnEnv,
  runRalphLaunch,
  type RalphExecutionResult,
} from "@pi-loom/pi-ralph/extensions/domain/runtime.js";
import type { ManagerReadResult } from "./models.js";
import { createManagerStore } from "./manager-store.js";

const MANAGER_DAEMON_PATH = fileURLToPath(new URL("./manager-daemon.ts", import.meta.url));
const WORKER_LAUNCHER_PATH = fileURLToPath(new URL("./worker-launcher.ts", import.meta.url));

function hasPendingOperatorOutput(manager: ManagerReadResult): boolean {
  return manager.messages.some(
    (message) => message.direction === "manager_to_operator" && message.status !== "resolved",
  );
}

function buildManagerLoopInstructions(managerId: string, runId: string): string[] {
  return [
    `You are one bounded chief-manager iteration for durable manager ${managerId}.`,
    `Your own Ralph run id is ${runId}. Read the manager first before acting.`,
    "A manager is a Ralph loop above ticket-bound worker Ralph loops in git worktrees.",
    "If the manager starts from broad context, create any needed research/spec/plan/ticket structure now.",
    "Use manager_record to attach newly created ids, summarize what changed, emit operator-facing messages, and record worker outcomes.",
    "Use manager_reconcile when ticket workers should exist and any queued workers should be started in the background.",
    "When reviewing worker results, inspect the linked worker Ralph runs directly with ralph_read and decide whether to queue another worker iteration, mark the worker complete, escalate, or perform free-form git fan-in with bash before recording the outcome.",
    "Do not poll or sleep in this step. The TypeScript daemon watches storage between bounded iterations.",
    "Before you stop, always call ralph_checkpoint for your own run and also leave chief state behind via manager_reconcile or manager_record.",
    "A clean subprocess exit without ralph_checkpoint or without any manager durable-state update is a failure.",
  ];
}

function spawnTsProcess(scriptPath: string, cwd: string, args: string[], detached: boolean): void {
  const proc = spawn(process.execPath, ["--experimental-strip-types", scriptPath, ...args], {
    cwd,
    detached,
    stdio: detached ? "ignore" : "inherit",
    shell: false,
    env: {
      ...process.env,
      ...captureParentHarnessSpawnEnv(),
    },
  });
  if (detached) {
    proc.unref();
  }
}

export interface ManagerWaitOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
}

async function persistManagerRuntimeFailure(
  cwd: string,
  managerId: string,
  execution: RalphExecutionResult,
  iterationId: string,
): Promise<void> {
  const store = createManagerStore(cwd);
  const manager = await store.readManagerAsync(managerId);
  const ralphStore = createRalphStore(cwd);
  await ralphStore.appendIterationAsync(manager.state.ralphRunId, {
    id: iterationId,
    status: "failed",
    summary: execution.stderr || execution.output || "Manager subprocess exited unsuccessfully before finishing the iteration.",
    workerSummary:
      execution.exitCode === 0
        ? "The subprocess returned success without durable Ralph iteration state."
        : `Subprocess exited with code ${execution.exitCode}.`,
    notes: ["Manager subprocess exited without leaving a durable post-iteration checkpoint."],
  });
  await ralphStore.decideRunAsync(manager.state.ralphRunId, {
    runtimeFailure: true,
    summary: execution.stderr || execution.output || "Manager subprocess exited unsuccessfully before finishing the iteration.",
    decidedBy: "runtime",
  });
}

export async function runManagerLoopOnce(cwd: string, managerId: string): Promise<void> {
  const store = createManagerStore(cwd);
  const beforeManager = await store.readManagerAsync(managerId);
  const ralphStore = createRalphStore(cwd);
  const currentRun = await ralphStore.readRunAsync(beforeManager.state.ralphRunId);
  const instructions = buildManagerLoopInstructions(beforeManager.state.managerId, beforeManager.state.ralphRunId);
  const prepared =
    currentRun.state.postIteration === null
      ? await ralphStore.prepareLaunchAsync(beforeManager.state.ralphRunId, {
          focus: beforeManager.state.objective || beforeManager.state.summary || beforeManager.state.title,
          instructions,
        })
      : await ralphStore.resumeRunAsync(beforeManager.state.ralphRunId, {
          focus: beforeManager.state.objective || beforeManager.state.summary || beforeManager.state.title,
          instructions,
        });

  const execution = await runRalphLaunch(cwd, prepared.launch, undefined, undefined, {
    PI_CHIEF_INTERNAL_MANAGER: "1",
  });
  const afterRun = await ralphStore.readRunAsync(beforeManager.state.ralphRunId);
  if (
    execution.exitCode !== 0 ||
    afterRun.state.postIteration?.iterationId !== prepared.launch.iterationId ||
    afterRun.state.postIteration?.decision === null ||
    afterRun.state.postIteration === null
  ) {
    await persistManagerRuntimeFailure(cwd, managerId, execution, prepared.launch.iterationId);
  }

  const afterManager = await store.readManagerAsync(managerId);
  if (afterManager.state.updatedAt === beforeManager.state.updatedAt) {
    await store.recordManagerStepAsync(managerId, {
      status: "waiting_for_input",
      summary: "Manager loop exited without leaving new durable chief state.",
      operatorMessages: [
        {
          kind: "escalation",
          text: "Manager loop exited without leaving new durable chief state. Inspect the manager context before resuming.",
        },
      ],
    });
  }
}

export function startManagerDaemon(cwd: string, managerId: string): void {
  spawnTsProcess(MANAGER_DAEMON_PATH, cwd, [cwd, managerId], true);
}

export function startWorkerLaunchProcess(cwd: string, workerId: string): void {
  spawnTsProcess(WORKER_LAUNCHER_PATH, cwd, [cwd, workerId], true);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForManagerUpdate(
  cwd: string,
  managerId: string,
  options: ManagerWaitOptions = {},
): Promise<ManagerReadResult> {
  const timeoutMs = options.timeoutMs ?? 1000 * 60 * 5;
  const pollIntervalMs = options.pollIntervalMs ?? 1000;
  const store = createManagerStore(cwd);
  const deadline = Date.now() + timeoutMs;
  let latest = await store.readManagerAsync(managerId);

  while (Date.now() < deadline) {
    latest = await store.readManagerAsync(managerId);
    if (
      hasPendingOperatorOutput(latest) ||
      latest.state.status === "waiting_for_input" ||
      latest.state.status === "completed" ||
      latest.state.status === "failed" ||
      latest.state.status === "archived"
    ) {
      return latest;
    }
    await sleep(pollIntervalMs);
  }

  return latest;
}

export function isWorkerLaunchRunning(worker: { launch?: { status?: string } | null }): boolean {
  return worker.launch?.status === "running";
}
