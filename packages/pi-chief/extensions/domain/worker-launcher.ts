import { runWorkerLaunch } from "./runtime.js";
import { createWorkerStore } from "./store.js";

async function main(): Promise<void> {
  const [, , cwdArg, workerIdArg] = process.argv;
  const cwd = cwdArg?.trim();
  const workerId = workerIdArg?.trim();
  if (!cwd || !workerId) {
    throw new Error("Usage: worker-launcher.ts <cwd> <workerId>");
  }

  const store = createWorkerStore(cwd);
  const worker = await store.readWorkerAsync(workerId);
  if (!worker.launch || worker.launch.status !== "running") {
    return;
  }
  const execution = await runWorkerLaunch(worker.launch);
  await store.finishLaunchExecutionAsync(workerId, execution);
}

void main().catch(() => {
  process.exitCode = 1;
});
