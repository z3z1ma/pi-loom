import { createRalphStore } from "@pi-loom/pi-ralph/extensions/domain/store.js";
import { runRalphLaunch, type RalphExecutionResult } from "@pi-loom/pi-ralph/extensions/domain/runtime.js";
import type { ManagerReadResult } from "./models.js";
import { createManagerStore } from "./manager-store.js";
import { runWorkerLaunch } from "./runtime.js";
import { createWorkerStore } from "./store.js";

interface ManagerSchedulerState {
  running: boolean;
  scheduled: boolean;
}

const managerSchedulers = new Map<string, ManagerSchedulerState>();
const managerRuntimeEnvs = new Map<string, Record<string, string | undefined>>();
const workerSchedulers = new Map<string, Promise<void>>();

function managerJobKey(cwd: string, managerId: string): string {
  return `${cwd}::${managerId}`;
}

function workerJobKey(cwd: string, workerId: string): string {
  return `${cwd}::${workerId}`;
}

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
    "Use manager_reconcile when ticket workers should exist and any queued workers should be started in the background scheduler.",
    "When reviewing worker results, inspect the linked worker Ralph runs directly with ralph_read and decide whether to queue another worker iteration, mark the worker complete, escalate, or perform free-form git fan-in with bash before recording the outcome.",
    "Do not poll or sleep in this step. The in-process Chief scheduler reacts to durable worker and manager state changes between bounded iterations.",
    "Before you stop, always call ralph_checkpoint for your own run and also leave chief state behind via manager_reconcile or manager_record.",
    "A clean session-runtime exit without ralph_checkpoint or without any manager durable-state update is a failure.",
  ];
}

function workerNeedsManager(worker: { state: { status: string } }): boolean {
  return worker.state.status === "waiting_for_manager" || worker.state.status === "failed" || worker.state.status === "completed";
}

function readManagerWorkers(cwd: string, workerIds: string[]) {
  const workerStore = createWorkerStore(cwd);
  return workerIds.flatMap((workerId) => {
    try {
      return [workerStore.readWorker(workerId)];
    } catch {
      return [];
    }
  });
}

function shouldInvokeManager(cwd: string, manager: ManagerReadResult): boolean {
  const workers = readManagerWorkers(cwd, manager.state.workerIds);
  const workerSignature = workers
    .map((worker) => `${worker.state.workerId}:${worker.state.status}:${worker.state.summary}`)
    .sort()
    .join("|");

  return (
    workers.length === 0 ||
    manager.state.linkedRefs.ticketIds.length !== workers.length ||
    workers.some((worker) => workerNeedsManager(worker)) ||
    workerSignature !== manager.state.workerSignature
  );
}

function maybeClearManagerRuntimeEnv(cwd: string, managerId: string): void {
  const key = managerJobKey(cwd, managerId);
  const scheduler = managerSchedulers.get(key);
  if (scheduler?.running || scheduler?.scheduled) {
    return;
  }

  try {
    const manager = createManagerStore(cwd).readManager(managerId);
    if (
      ["completed", "failed", "archived"].includes(manager.state.status) ||
      manager.state.status === "waiting_for_input"
    ) {
      managerRuntimeEnvs.delete(key);
    }
  } catch {
    managerRuntimeEnvs.delete(key);
  }
}

async function reportManagerSchedulerFailure(cwd: string, managerId: string, error: unknown): Promise<void> {
  const store = createManagerStore(cwd);
  const message = error instanceof Error ? error.message : String(error);
  try {
    const manager = await store.readManagerAsync(managerId);
    if (["completed", "failed", "archived"].includes(manager.state.status)) {
      return;
    }
    await store.recordManagerStepAsync(managerId, {
      status: "waiting_for_input",
      summary: message,
      operatorMessages: [
        {
          kind: "escalation",
          text: `Chief scheduler hit an unrecoverable runtime error: ${message}`,
        },
      ],
    });
  } catch {
    // Leave durable state untouched if we cannot even read or update the manager anymore.
  }
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
    summary: execution.stderr || execution.output || "Manager session runtime exited unsuccessfully before finishing the iteration.",
    workerSummary:
      execution.exitCode === 0
        ? "The session-backed manager launch returned without durable Ralph iteration state."
        : `Session runtime exited with code ${execution.exitCode}.`,
    notes: ["Manager session runtime exited without leaving a durable post-iteration checkpoint."],
  });
  await ralphStore.decideRunAsync(manager.state.ralphRunId, {
    runtimeFailure: true,
    summary: execution.stderr || execution.output || "Manager session runtime exited unsuccessfully before finishing the iteration.",
    decidedBy: "runtime",
  });
}

export async function runManagerLoopOnce(
  cwd: string,
  managerId: string,
  runtimeEnv?: Record<string, string | undefined>,
): Promise<void> {
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
    ...runtimeEnv,
    PI_CHIEF_INTERNAL_MANAGER: "1",
  });
  const afterRun = await ralphStore.readRunAsync(beforeManager.state.ralphRunId);
  const hasDurableCheckpoint =
    afterRun.state.postIteration !== null &&
    afterRun.state.postIteration.iterationId === prepared.launch.iterationId &&
    afterRun.state.postIteration.decision !== null;
  if (!hasDurableCheckpoint) {
    await persistManagerRuntimeFailure(cwd, managerId, execution, prepared.launch.iterationId);
    const afterManager = await store.readManagerAsync(managerId);
    if (!["completed", "failed", "archived"].includes(afterManager.state.status)) {
      await store.recordManagerStepAsync(managerId, {
        status: "waiting_for_input",
        summary: execution.stderr || execution.output || "Manager loop exited without leaving new durable chief state.",
        operatorMessages: [
          {
            kind: "escalation",
            text: "Manager loop exited without leaving a trusted durable manager checkpoint. Inspect the manager context before resuming.",
          },
        ],
      });
    }
    return;
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

async function processManagerUntilIdle(cwd: string, managerId: string): Promise<void> {
  while (true) {
    const store = createManagerStore(cwd);
    let manager: ManagerReadResult;
    try {
      manager = await store.readManagerAsync(managerId);
    } catch {
      return;
    }

    if (["completed", "failed", "archived"].includes(manager.state.status)) {
      return;
    }
    if (hasPendingOperatorOutput(manager) || manager.state.status === "waiting_for_input") {
      return;
    }

    const workers = readManagerWorkers(cwd, manager.state.workerIds);
    if (workers.some((worker) => isWorkerLaunchRunning(worker))) {
      return;
    }

    if (!shouldInvokeManager(cwd, manager)) {
      return;
    }

    await runManagerLoopOnce(cwd, managerId, managerRuntimeEnvs.get(managerJobKey(cwd, managerId)));
  }
}

async function drainManagerLoop(cwd: string, managerId: string): Promise<void> {
  const key = managerJobKey(cwd, managerId);
  const scheduler = managerSchedulers.get(key);
  if (!scheduler || scheduler.running) {
    return;
  }

  scheduler.running = true;
  try {
    while (scheduler.scheduled) {
      scheduler.scheduled = false;
      try {
        await processManagerUntilIdle(cwd, managerId);
      } catch (error) {
        await reportManagerSchedulerFailure(cwd, managerId, error);
      }
    }
  } finally {
    scheduler.running = false;
    if (!scheduler.scheduled) {
      managerSchedulers.delete(key);
      maybeClearManagerRuntimeEnv(cwd, managerId);
      return;
    }
  }

  queueMicrotask(() => {
    void drainManagerLoop(cwd, managerId);
  });
}

export function scheduleManagerLoop(
  cwd: string,
  managerId: string,
  runtimeEnv?: Record<string, string | undefined>,
): void {
  const key = managerJobKey(cwd, managerId);
  if (runtimeEnv) {
    managerRuntimeEnvs.set(key, runtimeEnv);
  }

  const scheduler = managerSchedulers.get(key) ?? { running: false, scheduled: false };
  scheduler.scheduled = true;
  managerSchedulers.set(key, scheduler);
  if (scheduler.running) {
    return;
  }

  queueMicrotask(() => {
    void drainManagerLoop(cwd, managerId);
  });
}

async function finishWorkerLaunchWithFailure(cwd: string, workerId: string, error: unknown): Promise<void> {
  const store = createWorkerStore(cwd);
  const worker = await store.readWorkerAsync(workerId);
  if (worker.launch?.status !== "running") {
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  await store.finishLaunchExecutionAsync(workerId, {
    status: "failed",
    output: "",
    error: message,
  });
}

export function scheduleWorkerLaunch(cwd: string, workerId: string): void {
  const key = workerJobKey(cwd, workerId);
  if (workerSchedulers.has(key)) {
    return;
  }

  const job = (async () => {
    let managerId: string | null = null;
    try {
      const store = createWorkerStore(cwd);
      const worker = await store.readWorkerAsync(workerId);
      managerId = worker.state.managerId;
      if (!worker.launch || worker.launch.status !== "running" || worker.state.status !== "running") {
        return;
      }
      const manager = await createManagerStore(cwd).readManagerAsync(worker.state.managerId);
      if (
        ["waiting_for_input", "completed", "failed", "archived"].includes(manager.state.status) ||
        hasPendingOperatorOutput(manager)
      ) {
        await store.requeueLaunchExecutionAsync(workerId, "Worker launch paused until the manager becomes runnable again.");
        return;
      }
      const execution = await runWorkerLaunch(
        worker.launch,
        undefined,
        undefined,
        managerRuntimeEnvs.get(managerJobKey(cwd, worker.state.managerId)),
      );
      await store.finishLaunchExecutionAsync(workerId, execution);
    } catch (error) {
      try {
        const worker = await createWorkerStore(cwd).readWorkerAsync(workerId);
        managerId = managerId ?? worker.state.managerId;
        await finishWorkerLaunchWithFailure(cwd, workerId, error);
      } catch {
        // Ignore secondary cleanup failures and let the original scheduler continue.
      }
    } finally {
      workerSchedulers.delete(key);
      if (managerId) {
        scheduleManagerLoop(cwd, managerId);
      }
    }
  })();

  workerSchedulers.set(key, job);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ManagerWaitOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export async function waitForManagerUpdate(
  cwd: string,
  managerId: string,
  options: ManagerWaitOptions = {},
): Promise<ManagerReadResult> {
  const timeoutMs = options.timeoutMs ?? 1000 * 60 * 5;
  const pollIntervalMs = options.pollIntervalMs ?? 250;
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
