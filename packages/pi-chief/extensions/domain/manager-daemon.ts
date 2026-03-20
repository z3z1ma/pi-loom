import { runManagerLoopOnce, isWorkerLaunchRunning } from "./manager-runtime.js";
import { createManagerStore } from "./manager-store.js";
import { createWorkerStore } from "./store.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function workerNeedsManager(worker: { state: { status: string } }): boolean {
  return worker.state.status === "waiting_for_manager" || worker.state.status === "failed" || worker.state.status === "completed";
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

    if (workers.some((worker) => isWorkerLaunchRunning(worker))) {
      await sleep(1000);
      continue;
    }

    const workerSignature = workers
      .map((worker) => `${worker.state.workerId}:${worker.state.status}:${worker.state.summary}`)
      .sort()
      .join("|");

    const shouldInvokeManager =
      workers.length === 0 ||
      manager.state.linkedRefs.ticketIds.length !== workers.length ||
      workers.some((worker) => workerNeedsManager(worker)) ||
      workerSignature !== manager.state.workerSignature;

    if (!shouldInvokeManager) {
      await sleep(1000);
      continue;
    }

    await runManagerLoopOnce(cwd, managerId);
    await sleep(250);
  }
}

void main().catch(() => {
  process.exitCode = 1;
});
