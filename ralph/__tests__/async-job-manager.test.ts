import { afterEach, describe, expect, it, vi } from "vitest";
import { AsyncJobManager } from "../domain/async-job-manager.js";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

describe("AsyncJobManager", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("swallows progress callback failures without failing the job", async () => {
    const manager = new AsyncJobManager<"iteration", { runId: string }>({ retentionMs: 1_000 });
    const progress = vi.fn(async () => {
      throw new Error("renderer exploded");
    });

    const jobId = manager.register(
      "iteration",
      "bounded run",
      async ({ reportProgress }) => {
        await reportProgress("started", { step: 1 });
        return "done";
      },
      {
        metadata: { runId: "run-123" },
        onProgress: progress,
      },
    );

    const [job] = await manager.waitForJobs([jobId]);

    expect(progress).toHaveBeenCalledWith("started", { step: 1 });
    expect(job).toMatchObject({
      id: jobId,
      type: "iteration",
      status: "completed",
      result: "done",
      metadata: { runId: "run-123" },
      progress: {
        text: "started",
        details: { step: 1 },
      },
    });
  });

  it("cancels a running job and ignores cancellation after completion", async () => {
    const manager = new AsyncJobManager({ retentionMs: 1_000 });
    const aborted = createDeferred<void>();

    const jobId = manager.register("iteration", "cancel me", async ({ signal }) => {
      signal.addEventListener(
        "abort",
        () => {
          aborted.resolve();
        },
        { once: true },
      );
      await aborted.promise;
      throw new Error("aborted");
    });

    const waitForCancellation = manager.waitForJobs([jobId]);

    expect(manager.cancel(jobId)).toBe(true);
    expect(manager.cancel(jobId)).toBe(false);

    const [job] = await waitForCancellation;
    await manager.waitForAll();

    expect(job.status).toBe("cancelled");
    expect(manager.getJob(jobId)?.status).toBe("cancelled");
    expect(manager.cancel(jobId)).toBe(false);
  });

  it("evicts terminal jobs after the retention window", async () => {
    vi.useFakeTimers();
    const manager = new AsyncJobManager({ retentionMs: 50 });

    const jobId = manager.register("iteration", "short job", async () => "done");

    await manager.waitForAll();
    expect(manager.getJob(jobId)?.status).toBe("completed");

    await vi.advanceTimersByTimeAsync(51);

    expect(manager.getJob(jobId)).toBeUndefined();
    expect(manager.getAllJobs()).toEqual([]);
  });

  it("deduplicates preferred ids when the same custom id is reused", async () => {
    const manager = new AsyncJobManager({ retentionMs: 1_000 });

    const first = manager.register("iteration", "alpha", async () => "ok", { id: "run-42" });
    const second = manager.register("iteration", "beta", async () => "ok", { id: "run-42" });

    await manager.waitForAll();

    expect(first).toBe("run-42");
    expect(second).toBe("run-42-2");
  });

  it("waits for any tracked job without caller polling", async () => {
    const manager = new AsyncJobManager({ retentionMs: 1_000 });
    const first = createDeferred<string>();
    const second = createDeferred<string>();

    const firstJobId = manager.register("iteration", "first", async () => first.promise);
    manager.register("iteration", "second", async () => second.promise);

    const waitForAny = manager.waitForAnyJob({ jobIds: [firstJobId] });
    first.resolve("first done");

    await expect(waitForAny).resolves.toEqual([
      expect.objectContaining({
        id: firstJobId,
        status: "completed",
        result: "first done",
      }),
    ]);

    second.resolve("second done");
    await manager.waitForAll();
  });

  it("does not resolve waiters on progress-only updates", async () => {
    vi.useFakeTimers();
    const manager = new AsyncJobManager({ retentionMs: 1_000 });
    const release = createDeferred<string>();

    const jobId = manager.register("iteration", "progressing", async ({ reportProgress }) => {
      await reportProgress("step 1");
      await reportProgress("step 2");
      return release.promise;
    });

    const waitPromise = manager.waitForJobs([jobId], { timeoutMs: 20 });
    await vi.advanceTimersByTimeAsync(20);

    await expect(waitPromise).resolves.toEqual([
      expect.objectContaining({ id: jobId, status: "running", progress: expect.objectContaining({ text: "step 2" }) }),
    ]);

    release.resolve("done");
    await manager.waitForAll();
  });

  it("returns current known statuses on timeout and ignores unknown ids", async () => {
    vi.useFakeTimers();
    const manager = new AsyncJobManager({ retentionMs: 1_000 });
    const hanging = createDeferred<string>();

    const completedJobId = manager.register("iteration", "done", async () => "done");
    const runningJobId = manager.register("iteration", "running", async ({ signal }) => {
      signal.addEventListener(
        "abort",
        () => {
          hanging.resolve("cancelled");
        },
        { once: true },
      );
      return hanging.promise;
    });

    await manager.waitForJobs([completedJobId]);

    const timedWait = manager.waitForJobs([completedJobId, runningJobId, "missing-job"], { timeoutMs: 20 });
    const unknownOnlyWait = manager.waitForJobs(["missing-job"], { timeoutMs: 20 });

    await vi.advanceTimersByTimeAsync(20);

    await expect(unknownOnlyWait).resolves.toEqual([]);
    await expect(timedWait).resolves.toEqual([
      expect.objectContaining({ id: completedJobId, status: "completed", result: "done" }),
      expect.objectContaining({ id: runningJobId, status: "running" }),
    ]);

    expect(manager.cancel(runningJobId)).toBe(true);
    await manager.waitForAll();
  });
});
