import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { getPiSpawnCommand, resolveRalphExtensionRoot } from "@pi-loom/pi-ralph/extensions/domain/runtime.js";
import type { ManagerReadResult } from "./models.js";
import { createManagerStore } from "./manager-store.js";

const MANAGER_DAEMON_PATH = fileURLToPath(new URL("./manager-daemon.ts", import.meta.url));
const WORKER_LAUNCHER_PATH = fileURLToPath(new URL("./worker-launcher.ts", import.meta.url));

function hasPendingOperatorOutput(manager: ManagerReadResult): boolean {
  return manager.messages.some(
    (message) => message.direction === "manager_to_operator" && message.status !== "resolved",
  );
}

function renderManagerAgentPrompt(managerId: string): string {
  return [
    `You are one bounded orchestration step for durable manager ${managerId}.`,
    "The manager is the orchestration surface above Pi Ralph. Workers are internal ticket-bound Ralph wrappers in managed git worktrees.",
    "",
    "What to do in this one step:",
    "- Read the manager first.",
    "- If the manager has only a broad objective, initiative, spec, plan, free-text goal, or open-ticket objective, do the necessary research/planning/ticket work now.",
    "- Use manager_checkpoint to attach any newly created ticket/plan/spec/initiative ids to the manager so later worker spawning can use them.",
    "- Use manager_dispatch when you want the deterministic runtime to ensure ticket workers exist and start any straightforward background Ralph iterations for them.",
    "- If a worker is ready for merge after operator review, perform any needed free-form git work with bash and then use manager_checkpoint to record the worker outcome truthfully.",
    "- If you need operator input, use manager_checkpoint to emit a manager_to_operator message and set status waiting_for_input, then stop.",
    "- If all orchestration work is complete, use manager_checkpoint to mark the manager completed and summarize the result, then stop.",
    "- Do not poll or sleep in this step. Leave storage polling to the TypeScript daemon. The daemon will only call you again after worker state changes or when no workers exist yet.",
    "",
    "Hard finish contract for this step:",
    "- Before stopping, leave at least one new durable state update behind.",
    "- End this step in exactly one of these ways:",
    "  1. Call manager_dispatch, then stop.",
    "  2. Call manager_checkpoint with status=waiting_for_input and at least one manager_to_operator message, then stop.",
    "  3. Call manager_checkpoint with status=completed and a truthful summary, then stop.",
    "  4. Call manager_checkpoint with linkedRefs and/or workerUpdates that record what changed this step, then stop.",
    "- Never exit this step without dispatching work or checkpointing what changed.",
    "",
    "Primary tools:",
    "- manager_read",
    "- manager_dispatch",
    "- manager_checkpoint",
    "- ticket_* / plan_* / spec_* / initiative_* / research_* / ralph_* as needed",
    "- bash for free-form git operations only when needed",
    "",
    `Begin by reading manager ${managerId}.`,
  ].join("\n");
}

function spawnTsProcess(scriptPath: string, cwd: string, args: string[], detached: boolean): void {
  const proc = spawn(process.execPath, ["--experimental-strip-types", scriptPath, ...args], {
    cwd,
    detached,
    stdio: detached ? "ignore" : "inherit",
    shell: false,
  });
  if (detached) {
    proc.unref();
  }
}

export interface ManagerWaitOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export async function runManagerAgentStep(cwd: string, managerId: string): Promise<void> {
  const extensionRoot = resolveRalphExtensionRoot();
  const prompt = renderManagerAgentPrompt(managerId);
  const command = getPiSpawnCommand(["-e", extensionRoot, "--mode", "json", "-p", "--no-session", prompt]);
  const store = createManagerStore(cwd);
  const before = await store.readManagerAsync(managerId);
  await new Promise<void>((resolve) => {
    const proc = spawn(command.command, command.args, {
      cwd,
      stdio: ["ignore", "ignore", "ignore"],
      shell: false,
      env: { ...process.env, PI_WORKERS_INTERNAL_MANAGER: "1" },
    });
    proc.on("error", () => resolve());
    proc.on("close", () => resolve());
  });
  const after = await store.readManagerAsync(managerId);
  if (after.state.updatedAt === before.state.updatedAt) {
    await store.checkpointManagerAsync(managerId, {
      status: "waiting_for_input",
      summary: "Manager step exited without leaving new durable state.",
      operatorMessages: [
        {
          kind: "escalation",
          text: "Manager step exited without leaving new durable state. Inspect the manager context before resuming.",
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
