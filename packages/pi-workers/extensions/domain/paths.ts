import { join, resolve } from "node:path";

export interface WorkerPaths {
  rootDir: string;
  runtimeDir: string;
}

export interface WorkerArtifactPaths {
  dir: string;
  state: string;
  worker: string;
  messages: string;
  checkpoints: string;
  launch: string;
}

export function slugifyWorkerValue(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized) {
    throw new Error("Worker identifiers must contain at least one alphanumeric character");
  }
  return normalized;
}

export function normalizeWorkerId(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(normalized)) {
    throw new Error(`Invalid worker id: ${value}`);
  }
  return normalized;
}

export function normalizeWorkerRef(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Worker reference is required");
  }
  const withoutAt = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  const withoutPrefix = withoutAt.startsWith("worker:") ? withoutAt.slice("worker:".length) : withoutAt;
  return normalizeWorkerId(withoutPrefix);
}

export function getWorkerPaths(cwd: string): WorkerPaths {
  const rootDir = resolve(cwd);
  return {
    rootDir,
    runtimeDir: join(rootDir, ".pi-loom-runtime", "workers"),
  };
}

export function getWorkerRuntimeDir(cwd: string, workerId: string): string {
  return join(getWorkerPaths(cwd).runtimeDir, normalizeWorkerId(workerId));
}

export function getWorkerArtifactPaths(_cwd: string, workerId: string): WorkerArtifactPaths {
  const normalizedWorkerId = normalizeWorkerId(workerId);
  const dir = `worker:${normalizedWorkerId}`;
  return {
    dir,
    state: `${dir}:state`,
    worker: `${dir}:summary`,
    messages: `${dir}:messages`,
    checkpoints: `${dir}:checkpoints`,
    launch: `${dir}:launch`,
  };
}
