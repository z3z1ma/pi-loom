import type {
  ApprovalStatus,
  ConsolidationStatus,
  ManagerRef,
  ManagerRefKind,
  MessageAwaiting,
  MessageDirection,
  MessageKind,
  MessageStatus,
  WorkerConsolidationOutcome,
  WorkerRuntimeKind,
  WorkerTelemetry,
  WorkerTelemetryState,
  WorkerWorkspaceDescriptor,
  WorkspaceStrategy,
} from "./models.js";
import {
  APPROVAL_STATUSES,
  CONSOLIDATION_STATUSES,
  CONSOLIDATION_STRATEGIES,
  DEFAULT_WORKER_RUNTIME_KIND,
  MANAGER_REF_KINDS,
  MESSAGE_AWAITING,
  MESSAGE_DIRECTIONS,
  MESSAGE_KINDS,
  MESSAGE_STATUSES,
  WORKER_RUNTIME_KINDS,
  WORKER_TELEMETRY_STATES,
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
  return trimmed ? trimmed : null;
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

function expectEnum<T extends string>(
  label: string,
  value: string | null | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if ((allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  throw new Error(`Invalid ${label}: ${value}`);
}

export function normalizeManagerRefKind(value: string | null | undefined): ManagerRefKind {
  return expectEnum("manager reference kind", value, MANAGER_REF_KINDS, "operator");
}

export function normalizeWorkspaceStrategy(value: string | null | undefined): WorkspaceStrategy {
  return expectEnum("workspace strategy", value, WORKSPACE_STRATEGIES, "git-worktree");
}

export function normalizeMessageDirection(value: string | null | undefined): MessageDirection {
  return expectEnum("message direction", value, MESSAGE_DIRECTIONS, "worker_to_manager");
}

export function normalizeMessageAwaiting(value: string | null | undefined): MessageAwaiting {
  return expectEnum("message awaiting state", value, MESSAGE_AWAITING, "none");
}

export function normalizeMessageKind(value: string | null | undefined): MessageKind {
  return expectEnum("message kind", value, MESSAGE_KINDS, "note");
}

export function normalizeMessageStatus(value: string | null | undefined): MessageStatus {
  return expectEnum("message status", value, MESSAGE_STATUSES, "pending");
}

export function normalizeTelemetryState(value: string | null | undefined): WorkerTelemetryState {
  return expectEnum("worker telemetry state", value, WORKER_TELEMETRY_STATES, "unknown");
}

export function normalizeRuntimeKind(value: string | null | undefined): WorkerRuntimeKind {
  return expectEnum("worker runtime kind", value, WORKER_RUNTIME_KINDS, DEFAULT_WORKER_RUNTIME_KIND);
}

export function normalizeApprovalStatus(value: string | null | undefined): ApprovalStatus {
  return expectEnum("worker approval status", value, APPROVAL_STATUSES, "not_requested");
}

export function normalizeConsolidationStatus(value: string | null | undefined): ConsolidationStatus {
  return expectEnum("worker consolidation status", value, CONSOLIDATION_STATUSES, "not_started");
}

export function normalizeManagerRef(input: Partial<ManagerRef> | undefined): ManagerRef {
  return {
    kind: normalizeManagerRefKind(input?.kind),
    ref: normalizeOptionalString(input?.ref) ?? "operator",
    label: normalizeOptionalString(input?.label),
  };
}

export function normalizeWorkspaceDescriptor(
  input: Partial<WorkerWorkspaceDescriptor> | undefined,
): WorkerWorkspaceDescriptor {
  return {
    repositoryRoot: normalizeOptionalString(input?.repositoryRoot) ?? ".",
    strategy: normalizeWorkspaceStrategy(input?.strategy),
    baseRef: normalizeOptionalString(input?.baseRef) ?? "HEAD",
    branch: normalizeOptionalString(input?.branch) ?? "worker",
    labels: normalizeStringList(input?.labels),
    logicalPath: normalizeOptionalString(input?.logicalPath) ?? ".loom/runtime/workers",
  };
}

export function normalizeTelemetry(input: Partial<WorkerTelemetry> | undefined): WorkerTelemetry {
  return {
    state: normalizeTelemetryState(input?.state),
    summary: normalizeOptionalString(input?.summary) ?? "",
    heartbeatAt: normalizeOptionalString(input?.heartbeatAt),
    checkpointId: normalizeOptionalString(input?.checkpointId),
    pendingMessages:
      typeof input?.pendingMessages === "number" && Number.isFinite(input.pendingMessages) && input.pendingMessages >= 0
        ? Math.floor(input.pendingMessages)
        : 0,
    notes: normalizeStringList(input?.notes),
  };
}

export function normalizeConsolidationOutcome(
  input: Partial<WorkerConsolidationOutcome> | undefined,
): WorkerConsolidationOutcome {
  return {
    status: normalizeConsolidationStatus(input?.status),
    strategy: input?.strategy
      ? expectEnum("consolidation strategy", input.strategy, CONSOLIDATION_STRATEGIES, "merge")
      : null,
    summary: normalizeOptionalString(input?.summary) ?? "",
    validation: normalizeStringList(input?.validation),
    conflicts: normalizeStringList(input?.conflicts),
    followUps: normalizeStringList(input?.followUps),
    decidedAt: normalizeOptionalString(input?.decidedAt),
  };
}

export function ensureRelativeOrLogicalPath(value: string | null | undefined, label: string): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  if (normalized.startsWith("/") || /^[A-Za-z]:[\\/]/.test(normalized)) {
    throw new Error(`${label} must be repo-relative or logical, not absolute: ${normalized}`);
  }
  return normalized;
}
