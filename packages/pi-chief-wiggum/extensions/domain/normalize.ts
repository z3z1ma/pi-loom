import type {
  ReviewDecision,
  WorkerRuntimeKind,
  WorkerWorkspaceDescriptor,
  WorkspaceStrategy,
} from "./models.js";
import {
  DEFAULT_WORKER_RUNTIME_KIND,
  REVIEW_DECISIONS,
  WORKER_RUNTIME_KINDS,
  WORKSPACE_STRATEGIES,
} from "./models.js";

export function currentTimestamp(): string {
  return new Date().toISOString();
}

export function normalizeOptionalString(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeStringList(values: readonly string[] | null | undefined): string[] {
  if (!values) {
    return [];
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

export function summarizeText(value: string | null | undefined, maxLength = 120): string {
  const text = normalizeOptionalString(value) ?? "";
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function expectEnum<T extends string>(label: string, value: string | null | undefined, allowed: readonly T[], fallback: T): T {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if ((allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  throw new Error(`Invalid ${label}: ${value}`);
}

export function normalizeWorkspaceStrategy(value: string | null | undefined): WorkspaceStrategy {
  return expectEnum("workspace strategy", value, WORKSPACE_STRATEGIES, "git-worktree");
}

export function normalizeRuntimeKind(value: string | null | undefined): WorkerRuntimeKind {
  return expectEnum("worker runtime kind", value, WORKER_RUNTIME_KINDS, DEFAULT_WORKER_RUNTIME_KIND);
}

export function normalizeReviewDecision(value: string | null | undefined): ReviewDecision {
  return expectEnum("review decision", value, REVIEW_DECISIONS, "approved");
}

export function normalizeWorkspaceDescriptor(input: Partial<WorkerWorkspaceDescriptor> | undefined): WorkerWorkspaceDescriptor {
  return {
    repositoryRoot: normalizeOptionalString(input?.repositoryRoot) ?? ".",
    strategy: normalizeWorkspaceStrategy(input?.strategy),
    baseRef: normalizeOptionalString(input?.baseRef) ?? "HEAD",
    branch: normalizeOptionalString(input?.branch) ?? "worker",
    labels: normalizeStringList(input?.labels),
    workspaceKey: normalizeOptionalString(input?.workspaceKey) ?? "worker-runtime",
  };
}

export function ensureRelativeOrLogicalRef(value: string | null | undefined, label: string): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  if (normalized.startsWith("/") || /^[A-Za-z]:[\\/]/.test(normalized)) {
    throw new Error(`${label} must be repo-relative or logical, not absolute: ${normalized}`);
  }
  return normalized;
}
