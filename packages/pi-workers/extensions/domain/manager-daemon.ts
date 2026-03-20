import { createManagerStore } from "./manager-store.js";
import { isWorkerLaunchRunning, runManagerAgentStep } from "./manager-runtime.js";
import { createWorkerStore } from "./store.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function workerNeedsManagerStep(status: string): boolean {
  return ["waiting_for_review", "blocked", "completed", "failed", "retired", "archived"].includes(status);
}

async function main(): Promise<void> {
  const [, , cwdArg, managerIdArg] = process.argv;
  const cwd = cwdArg?.trim();
  const managerId = managerIdArg?.trim();
  if (!cwd || !managerId) {
    throw new Error("Usage: manager-daemon.ts <cwd> <managerId>");
  }

  const managerStore = createManagerStore(cwd);
  const workerStore = createWorkerStore(cwd);

  while (true) {
    const manager = await managerStore.readManagerAsync(managerId);
    if (["completed", "failed", "archived"].includes(manager.state.status)) {
      return;
    }
    const pendingOutput = manager.messages.some(
      (message) => message.direction === "manager_to_operator" && message.status !== "resolved",
    );
    if (pendingOutput || manager.state.status === "waiting_for_input") {
      return;
    }

    const workers = manager.state.workerIds.flatMap((workerId) => {
      try {
        return [workerStore.readWorker(workerId)];
      } catch {
        return [];
      }
    });
    const anyRunning = workers.some((worker) => isWorkerLaunchRunning(worker));
    const workerSignature = workers
      .map(
        (worker) =>
          `${worker.state.workerId}:${worker.state.status}:${worker.state.latestTelemetry.summary || worker.state.latestCheckpointSummary || worker.state.summary}`,
      )
      .sort()
      .join("|");
    const allWorkersNeedManagerStep = workers.length > 0 && workers.every((worker) => workerNeedsManagerStep(worker.state.status));
    if (anyRunning) {
      await sleep(1000);
      continue;
    }

    const shouldInvokeAgent =
      manager.state.lastRunAt === null ||
      workers.length === 0 ||
      manager.state.linkedRefs.ticketIds.length !== workers.length ||
      workerSignature !== manager.state.workerSignature ||
      allWorkersNeedManagerStep;
    if (!shouldInvokeAgent) {
      await sleep(1000);
      continue;
    }

    await runManagerAgentStep(cwd, managerId);
    await sleep(250);
  }
}

void main().catch(() => {
  process.exitCode = 1;
});
