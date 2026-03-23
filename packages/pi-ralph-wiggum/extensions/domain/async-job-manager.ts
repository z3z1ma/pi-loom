const DEFAULT_RETENTION_MS = 5 * 60 * 1000;
const DEFAULT_MAX_RUNNING_JOBS = 15;

export type AsyncJobStatus = "running" | "completed" | "failed" | "cancelled";

export interface AsyncJobProgress {
  text: string;
  details?: Record<string, unknown>;
  timestamp: number;
  sequence: number;
}

export interface AsyncJob<TJobType extends string = string, TMetadata = unknown, TResult = string> {
  id: string;
  type: TJobType;
  label: string;
  status: AsyncJobStatus;
  startTime: number;
  endTime?: number;
  metadata?: TMetadata;
  progress?: AsyncJobProgress;
  result?: TResult;
  error?: unknown;
  errorText?: string;
}

export interface AsyncJobManagerOptions {
  retentionMs?: number;
  maxRunningJobs?: number;
}

export interface AsyncJobRegisterOptions<TMetadata> {
  id?: string;
  metadata?: TMetadata;
  onProgress?: (text: string, details?: Record<string, unknown>) => void | Promise<void>;
}

export interface AsyncJobContext {
  jobId: string;
  signal: AbortSignal;
  reportProgress: (text: string, details?: Record<string, unknown>) => Promise<void>;
}

export interface AsyncJobWaitOptions {
  timeoutMs?: number;
}

interface AsyncJobRecord<TJobType extends string, TMetadata, TResult> extends AsyncJob<TJobType, TMetadata, TResult> {
  abortController: AbortController;
  promise: Promise<void>;
}

interface AsyncJobWaiter<TJobType extends string, TMetadata, TResult> {
  mode: "all" | "any";
  jobIds: string[] | null;
  resolve: (jobs: AsyncJob<TJobType, TMetadata, TResult>[]) => void;
  timeout?: NodeJS.Timeout;
}

export class AsyncJobManager<TJobType extends string = string, TMetadata = unknown, TResult = string> {
  readonly #jobs = new Map<string, AsyncJobRecord<TJobType, TMetadata, TResult>>();
  readonly #evictionTimers = new Map<string, NodeJS.Timeout>();
  readonly #waiters = new Set<AsyncJobWaiter<TJobType, TMetadata, TResult>>();
  readonly #retentionMs: number;
  readonly #maxRunningJobs: number;

  constructor(options: AsyncJobManagerOptions = {}) {
    this.#retentionMs = Math.max(0, Math.floor(options.retentionMs ?? DEFAULT_RETENTION_MS));
    this.#maxRunningJobs = Math.max(1, Math.floor(options.maxRunningJobs ?? DEFAULT_MAX_RUNNING_JOBS));
  }

  register(
    type: TJobType,
    label: string,
    run: (ctx: AsyncJobContext) => Promise<TResult>,
    options: AsyncJobRegisterOptions<TMetadata> = {},
  ): string {
    if (this.getRunningJobs().length >= this.#maxRunningJobs) {
      throw new Error(
        `Background job limit reached (${this.#maxRunningJobs}). Wait for running jobs to finish or cancel one.`,
      );
    }

    const id = this.#resolveJobId(options.id);
    const abortController = new AbortController();
    let progressSequence = 0;

    const job: AsyncJobRecord<TJobType, TMetadata, TResult> = {
      id,
      type,
      label,
      status: "running",
      startTime: Date.now(),
      metadata: options.metadata,
      abortController,
      promise: Promise.resolve(),
    };

    const reportProgress = async (text: string, details?: Record<string, unknown>): Promise<void> => {
      progressSequence += 1;
      job.progress = {
        text,
        details,
        timestamp: Date.now(),
        sequence: progressSequence,
      };
      if (!options.onProgress) {
        return;
      }

      try {
        await options.onProgress(text, details);
      } catch {
        // Progress rendering must never change job outcome.
      }
    };

    job.promise = (async () => {
      try {
        const result = await run({
          jobId: id,
          signal: abortController.signal,
          reportProgress,
        });
        if (job.status === "cancelled") {
          job.result = result;
          job.endTime = job.endTime ?? Date.now();
          this.#notifyWaiters();
          this.#scheduleEviction(id);
          return;
        }

        job.status = "completed";
        job.result = result;
        job.endTime = Date.now();
        this.#notifyWaiters();
        this.#scheduleEviction(id);
      } catch (error) {
        if (job.status === "cancelled") {
          job.error = error;
          job.errorText = getErrorText(error);
          job.endTime = job.endTime ?? Date.now();
          this.#notifyWaiters();
          this.#scheduleEviction(id);
          return;
        }

        job.status = "failed";
        job.error = error;
        job.errorText = getErrorText(error);
        job.endTime = Date.now();
        this.#notifyWaiters();
        this.#scheduleEviction(id);
      }
    })();

    this.#jobs.set(id, job);
    this.#notifyWaiters();
    return id;
  }

  cancel(jobId: string): boolean {
    const job = this.#jobs.get(jobId);
    if (!job || job.status !== "running") {
      return false;
    }

    job.status = "cancelled";
    job.endTime = Date.now();
    job.abortController.abort();
    this.#notifyWaiters();
    this.#scheduleEviction(jobId);
    return true;
  }

  cancelAll(): number {
    let cancelled = 0;
    for (const job of this.#jobs.values()) {
      if (job.status !== "running") {
        continue;
      }
      cancelled += this.cancel(job.id) ? 1 : 0;
    }
    return cancelled;
  }

  getJob(jobId: string): AsyncJob<TJobType, TMetadata, TResult> | undefined {
    const job = this.#jobs.get(jobId);
    return job ? cloneJob(job) : undefined;
  }

  getRunningJobs(): AsyncJob<TJobType, TMetadata, TResult>[] {
    return Array.from(this.#jobs.values())
      .filter((job) => job.status === "running")
      .map((job) => cloneJob(job));
  }

  getAllJobs(): AsyncJob<TJobType, TMetadata, TResult>[] {
    return Array.from(this.#jobs.values()).map((job) => cloneJob(job));
  }

  async waitForJobs(
    jobIds: readonly string[],
    options: AsyncJobWaitOptions = {},
  ): Promise<AsyncJob<TJobType, TMetadata, TResult>[]> {
    const trackedIds = uniqueKnownJobIds(this.#jobs, jobIds);
    if (trackedIds.length === 0) {
      return [];
    }

    const current = this.#collectJobs(trackedIds);
    if (current.every((job) => isTerminalStatus(job.status))) {
      return current;
    }

    return this.#wait("all", trackedIds, options.timeoutMs);
  }

  async waitForAnyJob(
    options: AsyncJobWaitOptions & { jobIds?: readonly string[] } = {},
  ): Promise<AsyncJob<TJobType, TMetadata, TResult>[]> {
    const trackedIds = options.jobIds ? uniqueKnownJobIds(this.#jobs, options.jobIds) : Array.from(this.#jobs.keys());
    if (trackedIds.length === 0) {
      return [];
    }

    const current = this.#collectJobs(trackedIds);
    const terminalJobs = current.filter((job) => isTerminalStatus(job.status));
    if (terminalJobs.length > 0) {
      return terminalJobs;
    }

    return this.#wait("any", trackedIds, options.timeoutMs);
  }

  async waitForAll(): Promise<void> {
    await Promise.all(Array.from(this.#jobs.values()).map((job) => job.promise));
  }

  dispose(): void {
    this.cancelAll();
    this.#clearEvictionTimers();
    for (const waiter of this.#waiters) {
      if (waiter.timeout) {
        clearTimeout(waiter.timeout);
      }
      waiter.resolve([]);
    }
    this.#waiters.clear();
    this.#jobs.clear();
  }

  #resolveJobId(preferredId?: string): string {
    const base = preferredId?.trim();
    if (!base) {
      return `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }
    if (!this.#jobs.has(base)) {
      return base;
    }

    let suffix = 2;
    let candidate = `${base}-${suffix}`;
    while (this.#jobs.has(candidate)) {
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
    return candidate;
  }

  #scheduleEviction(jobId: string): void {
    const existingTimer = this.#evictionTimers.get(jobId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    if (this.#retentionMs === 0) {
      this.#evictionTimers.delete(jobId);
      this.#jobs.delete(jobId);
      this.#notifyWaiters();
      return;
    }

    const timer = setTimeout(() => {
      this.#evictionTimers.delete(jobId);
      this.#jobs.delete(jobId);
      this.#notifyWaiters();
    }, this.#retentionMs);
    timer.unref?.();
    this.#evictionTimers.set(jobId, timer);
  }

  #clearEvictionTimers(): void {
    for (const timer of this.#evictionTimers.values()) {
      clearTimeout(timer);
    }
    this.#evictionTimers.clear();
  }

  #collectJobs(jobIds: readonly string[]): AsyncJob<TJobType, TMetadata, TResult>[] {
    return jobIds
      .map((jobId) => this.#jobs.get(jobId))
      .filter((job): job is AsyncJobRecord<TJobType, TMetadata, TResult> => Boolean(job))
      .map((job) => cloneJob(job));
  }

  #wait(mode: "all" | "any", jobIds: string[], timeoutMs?: number): Promise<AsyncJob<TJobType, TMetadata, TResult>[]> {
    return new Promise((resolve) => {
      const waiter: AsyncJobWaiter<TJobType, TMetadata, TResult> = {
        mode,
        jobIds,
        resolve: (jobs) => resolve(jobs),
      };

      if (timeoutMs !== undefined) {
        const boundedTimeoutMs = Math.max(0, timeoutMs);
        waiter.timeout = setTimeout(() => {
          this.#settleWaiter(waiter, true);
        }, boundedTimeoutMs);
        waiter.timeout.unref?.();
      }

      this.#waiters.add(waiter);
      this.#settleWaiter(waiter, false);
    });
  }

  #notifyWaiters(): void {
    for (const waiter of Array.from(this.#waiters)) {
      this.#settleWaiter(waiter, false);
    }
  }

  #settleWaiter(waiter: AsyncJobWaiter<TJobType, TMetadata, TResult>, timedOut: boolean): void {
    const jobs = this.#collectJobs(waiter.jobIds ?? Array.from(this.#jobs.keys()));
    const result = timedOut ? jobs : this.#selectWaitResult(waiter.mode, jobs);
    if (result === null) {
      return;
    }

    this.#waiters.delete(waiter);
    if (waiter.timeout) {
      clearTimeout(waiter.timeout);
    }
    waiter.resolve(result);
  }

  #selectWaitResult(
    mode: "all" | "any",
    jobs: AsyncJob<TJobType, TMetadata, TResult>[],
  ): AsyncJob<TJobType, TMetadata, TResult>[] | null {
    if (jobs.length === 0) {
      return [];
    }

    if (mode === "all") {
      return jobs.every((job) => isTerminalStatus(job.status)) ? jobs : null;
    }

    const terminalJobs = jobs.filter((job) => isTerminalStatus(job.status));
    return terminalJobs.length > 0 ? terminalJobs : null;
  }
}

function uniqueKnownJobIds<TJobType extends string, TMetadata, TResult>(
  jobs: Map<string, AsyncJobRecord<TJobType, TMetadata, TResult>>,
  jobIds: readonly string[],
): string[] {
  const knownJobIds = new Set<string>();
  for (const jobId of jobIds) {
    const normalizedJobId = jobId.trim();
    if (!normalizedJobId || !jobs.has(normalizedJobId)) {
      continue;
    }
    knownJobIds.add(normalizedJobId);
  }
  return Array.from(knownJobIds);
}

function cloneJob<TJobType extends string, TMetadata, TResult>(
  job: AsyncJobRecord<TJobType, TMetadata, TResult>,
): AsyncJob<TJobType, TMetadata, TResult> {
  return {
    id: job.id,
    type: job.type,
    label: job.label,
    status: job.status,
    startTime: job.startTime,
    endTime: job.endTime,
    metadata: job.metadata,
    progress: job.progress
      ? {
          text: job.progress.text,
          details: job.progress.details,
          timestamp: job.progress.timestamp,
          sequence: job.progress.sequence,
        }
      : undefined,
    result: job.result,
    error: job.error,
    errorText: job.errorText,
  };
}

function isTerminalStatus(status: AsyncJobStatus): boolean {
  return status !== "running";
}

function getErrorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
