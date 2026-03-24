import { createHash } from "node:crypto";
import { resolve } from "node:path";

export interface RalphPaths {
  rootDir: string;
  ralphDir: string;
}

export interface RalphArtifactPaths {
  dir: string;
  state: string;
  packet: string;
  run: string;
  iterations: string;
  launch: string;
  runtime: string;
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
  const withoutPrefix = withoutAt.startsWith("ralph-run:") ? withoutAt.slice("ralph-run:".length) : withoutAt;
  const runToken = withoutPrefix.split(":")[0] ?? withoutPrefix;
  return normalizeRalphRunId(runToken);
}

export function deriveRalphRunId(planRef: string | null, ticketRef: string): string {
  const normalizedPlanRef = planRef?.trim() || "ticket-only";
  const planSlug = slugifyRalphValue(normalizedPlanRef).slice(0, 24);
  const ticketSlug = slugifyRalphValue(ticketRef).slice(0, 24);
  const suffix = createHash("sha256").update(`${normalizedPlanRef}\u241f${ticketRef}`).digest("hex").slice(0, 12);
  return normalizeRalphRunId(`plan-${planSlug}--ticket-${ticketSlug}-${suffix}`);
}

export function getRalphPaths(cwd: string): RalphPaths {
  return {
    rootDir: resolve(cwd),
    ralphDir: "ralph-run",
  };
}

export function getRalphRunDir(_cwd: string, runId: string): string {
  return `ralph-run:${normalizeRalphRunId(runId)}`;
}

export function getRalphStatePath(cwd: string, runId: string): string {
  return `${getRalphRunDir(cwd, runId)}:state`;
}

export function getRalphPacketPath(cwd: string, runId: string): string {
  return `${getRalphRunDir(cwd, runId)}:packet`;
}

export function getRalphRunMarkdownPath(cwd: string, runId: string): string {
  return `${getRalphRunDir(cwd, runId)}:run`;
}

export function getRalphIterationsPath(cwd: string, runId: string): string {
  return `${getRalphRunDir(cwd, runId)}:iterations`;
}

export function getRalphLaunchPath(cwd: string, runId: string): string {
  return `${getRalphRunDir(cwd, runId)}:launch`;
}

export function getRalphRuntimePath(cwd: string, runId: string): string {
  return `${getRalphRunDir(cwd, runId)}:runtime`;
}

export function getRalphArtifactPaths(cwd: string, runId: string): RalphArtifactPaths {
  return {
    dir: getRalphRunDir(cwd, runId),
    state: getRalphStatePath(cwd, runId),
    packet: getRalphPacketPath(cwd, runId),
    run: getRalphRunMarkdownPath(cwd, runId),
    iterations: getRalphIterationsPath(cwd, runId),
    launch: getRalphLaunchPath(cwd, runId),
    runtime: getRalphRuntimePath(cwd, runId),
  };
}
