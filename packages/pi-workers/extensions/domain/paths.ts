import { join, resolve } from "node:path";

export interface WorkerPaths {
  rootDir: string;
  loomDir: string;
  workersDir: string;
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
  const fileName = withoutAt.split(/[\\/]/).pop() ?? withoutAt;
  const withoutExtension = fileName.replace(/\.(json|jsonl|md)$/i, "");
  const withoutArtifact =
    withoutExtension === "state" ||
    withoutExtension === "worker" ||
    withoutExtension === "messages" ||
    withoutExtension === "checkpoints" ||
    withoutExtension === "launch"
      ? (withoutAt.split(/[\\/]/).slice(-2, -1)[0] ?? withoutExtension)
      : withoutExtension;
  return normalizeWorkerId(withoutArtifact);
}

export function getWorkerPaths(cwd: string): WorkerPaths {
  const rootDir = resolve(cwd);
  const loomDir = join(rootDir, ".loom");
  return {
    rootDir,
    loomDir,
    workersDir: join(loomDir, "workers"),
    runtimeDir: join(loomDir, "runtime", "workers"),
  };
}

export function getWorkerDir(cwd: string, workerId: string): string {
  return join(getWorkerPaths(cwd).workersDir, normalizeWorkerId(workerId));
}

export function getWorkerRuntimeDir(cwd: string, workerId: string): string {
  return join(getWorkerPaths(cwd).runtimeDir, normalizeWorkerId(workerId));
}

export function getWorkerArtifactPaths(cwd: string, workerId: string): WorkerArtifactPaths {
  const dir = getWorkerDir(cwd, workerId);
  return {
    dir,
    state: join(dir, "state.json"),
    worker: join(dir, "worker.md"),
    messages: join(dir, "messages.jsonl"),
    checkpoints: join(dir, "checkpoints.jsonl"),
    launch: join(dir, "launch.json"),
  };
}
