import { join, resolve } from "node:path";

export interface RalphPaths {
  rootDir: string;
  loomDir: string;
  ralphDir: string;
}

export interface RalphArtifactPaths {
  dir: string;
  state: string;
  packet: string;
  run: string;
  iterations: string;
  dashboard: string;
  launch: string;
}

export function slugifyRalphValue(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized) {
    throw new Error("Ralph identifiers must contain at least one alphanumeric character");
  }
  return normalized;
}

export function normalizeRalphRunId(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(normalized)) {
    throw new Error(`Invalid Ralph run id: ${value}`);
  }
  return normalized;
}

export function normalizeRalphRunRef(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Ralph run reference is required");
  }
  const withoutAt = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  const fileName = withoutAt.split(/[\\/]/).pop() ?? withoutAt;
  const withoutExtension = fileName.replace(/\.(json|jsonl|md)$/i, "");
  const withoutArtifact =
    withoutExtension === "state" ||
    withoutExtension === "packet" ||
    withoutExtension === "run" ||
    withoutExtension === "iterations" ||
    withoutExtension === "dashboard" ||
    withoutExtension === "launch"
      ? (withoutAt.split(/[\\/]/).slice(-2, -1)[0] ?? withoutExtension)
      : withoutExtension;
  return normalizeRalphRunId(withoutArtifact);
}

export function getRalphPaths(cwd: string): RalphPaths {
  const rootDir = resolve(cwd);
  const loomDir = join(rootDir, ".loom");
  return {
    rootDir,
    loomDir,
    ralphDir: join(loomDir, "ralph"),
  };
}

export function getRalphRunDir(cwd: string, runId: string): string {
  return join(getRalphPaths(cwd).ralphDir, normalizeRalphRunId(runId));
}

export function getRalphStatePath(cwd: string, runId: string): string {
  return join(getRalphRunDir(cwd, runId), "state.json");
}

export function getRalphPacketPath(cwd: string, runId: string): string {
  return join(getRalphRunDir(cwd, runId), "packet.md");
}

export function getRalphRunMarkdownPath(cwd: string, runId: string): string {
  return join(getRalphRunDir(cwd, runId), "run.md");
}

export function getRalphIterationsPath(cwd: string, runId: string): string {
  return join(getRalphRunDir(cwd, runId), "iterations.jsonl");
}

export function getRalphDashboardPath(cwd: string, runId: string): string {
  return join(getRalphRunDir(cwd, runId), "dashboard.json");
}

export function getRalphLaunchPath(cwd: string, runId: string): string {
  return join(getRalphRunDir(cwd, runId), "launch.json");
}

export function getRalphArtifactPaths(cwd: string, runId: string): RalphArtifactPaths {
  return {
    dir: getRalphRunDir(cwd, runId),
    state: getRalphStatePath(cwd, runId),
    packet: getRalphPacketPath(cwd, runId),
    run: getRalphRunMarkdownPath(cwd, runId),
    iterations: getRalphIterationsPath(cwd, runId),
    dashboard: getRalphDashboardPath(cwd, runId),
    launch: getRalphLaunchPath(cwd, runId),
  };
}
