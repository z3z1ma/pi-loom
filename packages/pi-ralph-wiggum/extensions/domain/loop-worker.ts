import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { ExecuteRalphLoopResult, RalphLoopProgressUpdate } from "./loop.js";
import { executeRalphLoop } from "./loop.js";

type RalphWorkerModel = {
  provider?: string;
  id?: string;
} | null;

export interface RalphLoopWorkerInput {
  workerType?: "ralph-loop";
  cwd: string;
  runId: string;
  jobId: string;
  model: RalphWorkerModel;
}

type RalphLoopWorkerMessage =
  | { type: "progress"; update: RalphLoopProgressUpdate }
  | { type: "result"; result: ExecuteRalphLoopResult }
  | { type: "error"; message: string; stack?: string };

type RalphLoopWorkerControl = { type: "abort" };

const WORKER_ABORT_GRACE_MS = 2_000;
const WORKER_PROGRESS_FLUSH_MS = 75;

function normalizeProgressUpdate(update: string | RalphLoopProgressUpdate): RalphLoopProgressUpdate {
  return typeof update === "string" ? { text: update, kind: "assistant_output" } : update;
}

export function toWorkerModel(model: unknown): RalphWorkerModel {
  if (!model || typeof model !== "object") {
    return null;
  }
  const candidate = model as { provider?: unknown; id?: unknown };
  return {
    provider: typeof candidate.provider === "string" ? candidate.provider : undefined,
    id: typeof candidate.id === "string" ? candidate.id : undefined,
  };
}

export function runRalphLoopInWorker(
  input: RalphLoopWorkerInput,
  signal: AbortSignal | undefined,
  onUpdate?: (update: RalphLoopProgressUpdate) => void | Promise<void>,
): Promise<ExecuteRalphLoopResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./loop-worker.ts", import.meta.url), {
      workerData: { ...input, workerType: "ralph-loop" satisfies RalphLoopWorkerInput["workerType"] },
      execArgv: process.execArgv,
    });
    let settled = false;
    let abortTimer: NodeJS.Timeout | null = null;
    let progressTimer: NodeJS.Timeout | null = null;
    let pendingProgressUpdate: RalphLoopProgressUpdate | null = null;

    const clearAbortTimer = () => {
      if (!abortTimer) {
        return;
      }
      clearTimeout(abortTimer);
      abortTimer = null;
    };

    const clearProgressTimer = () => {
      if (!progressTimer) {
        return;
      }
      clearTimeout(progressTimer);
      progressTimer = null;
    };

    const flushProgress = () => {
      const update = pendingProgressUpdate;
      pendingProgressUpdate = null;
      if (!update) {
        return;
      }
      const timer = setTimeout(() => {
        void Promise.resolve(onUpdate?.(update)).catch(() => {});
      }, 0);
      timer.unref?.();
    };

    const queueProgress = (update: RalphLoopProgressUpdate) => {
      if (update.kind !== "assistant_output") {
        flushProgress();
        const timer = setTimeout(() => {
          void Promise.resolve(onUpdate?.(update)).catch(() => {});
        }, 0);
        timer.unref?.();
        return;
      }
      pendingProgressUpdate = update;
      if (progressTimer) {
        return;
      }
      progressTimer = setTimeout(() => {
        progressTimer = null;
        flushProgress();
      }, WORKER_PROGRESS_FLUSH_MS);
      progressTimer.unref?.();
    };

    const cleanup = () => {
      clearAbortTimer();
      clearProgressTimer();
      signal?.removeEventListener("abort", abortWorker);
      worker.removeAllListeners();
    };

    const settle = (fn: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      fn();
    };

    const abortWorker = () => {
      worker.postMessage({ type: "abort" } satisfies RalphLoopWorkerControl);
      if (!abortTimer) {
        abortTimer = setTimeout(() => {
          void worker.terminate();
        }, WORKER_ABORT_GRACE_MS);
        abortTimer.unref?.();
      }
    };

    worker.on("message", (message: RalphLoopWorkerMessage) => {
      if (message.type === "progress") {
        queueProgress(message.update);
        return;
      }
      if (message.type === "result") {
        clearProgressTimer();
        pendingProgressUpdate = null;
        settle(() => resolve(message.result));
        return;
      }
      clearProgressTimer();
      pendingProgressUpdate = null;
      settle(() => {
        const error = new Error(message.message);
        if (message.stack) {
          error.stack = message.stack;
        }
        reject(error);
      });
    });

    worker.on("error", (error) => {
      settle(() => reject(error));
    });

    worker.on("exit", (code) => {
      if (settled) {
        return;
      }
      settle(() => {
        if (signal?.aborted) {
          reject(new Error("Aborted"));
          return;
        }
        reject(new Error(`Ralph worker exited unexpectedly with code ${code}.`));
      });
    });

    if (signal?.aborted) {
      abortWorker();
    } else {
      signal?.addEventListener("abort", abortWorker, { once: true });
    }
  });
}

async function runWorkerMain(): Promise<void> {
  const port = parentPort;
  if (!port) {
    return;
  }
  const input = workerData as RalphLoopWorkerInput;
  const abortController = new AbortController();
  port.on("message", (message: RalphLoopWorkerControl) => {
    if (message?.type === "abort") {
      abortController.abort(new Error("Aborted"));
    }
  });

  try {
    const result = await executeRalphLoop(
      {
        cwd: input.cwd,
        model: (input.model ?? undefined) as ExtensionContext["model"],
        sessionManager: ({ getBranch: () => [] } as unknown) as ExtensionContext["sessionManager"],
      },
      { ref: input.runId },
      abortController.signal,
      {
        jobId: input.jobId,
        onUpdate: (update) => {
          port.postMessage({ type: "progress", update: normalizeProgressUpdate(update) } satisfies RalphLoopWorkerMessage);
        },
      },
    );
    port.postMessage({ type: "result", result } satisfies RalphLoopWorkerMessage);
  } catch (error) {
    port.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    } satisfies RalphLoopWorkerMessage);
  }
}

if (!isMainThread) {
  const data = workerData as Partial<RalphLoopWorkerInput> | undefined;
  if (data?.workerType === "ralph-loop") {
    void runWorkerMain();
  }
}
