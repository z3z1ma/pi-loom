import { SPEC_STATUSES, type SpecStatus } from "./models.js";

function normalizeList(values: readonly string[] | undefined): string[] {
  if (!values) {
    return [];
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const item = value.trim();
    if (!item || seen.has(item)) {
      continue;
    }
    seen.add(item);
    normalized.push(item);
  }
  return normalized.sort((left, right) => left.localeCompare(right));
}

function expectEnum<T extends string>(label: string, value: string | undefined, allowed: readonly T[], fallback: T): T {
  if (value === undefined || value === "") {
    return fallback;
  }
  if ((allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  throw new Error(`Invalid ${label}: ${value}`);
}

export function slugifyTitle(title: string): string {
  const normalized = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized) {
    throw new Error("Title must contain at least one alphanumeric character");
  }
  return normalized;
}

export function normalizeChangeId(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(trimmed)) {
    throw new Error(`Invalid change id: ${value}`);
  }
  return trimmed;
}

export function normalizeCapabilityId(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(trimmed)) {
    throw new Error(`Invalid capability id: ${value}`);
  }
  return trimmed;
}

export function normalizeRequirementId(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!/^req-\d{3}$/.test(trimmed)) {
    throw new Error(`Invalid requirement id: ${value}`);
  }
  return trimmed;
}

export function normalizeTaskId(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!/^task-\d{3}$/.test(trimmed)) {
    throw new Error(`Invalid task id: ${value}`);
  }
  return trimmed;
}

export function normalizeStatus(value: string | undefined): SpecStatus {
  return expectEnum("spec status", value, SPEC_STATUSES, "proposed");
}

export function normalizeOptionalString(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function normalizeStringList(values: readonly string[] | undefined): string[] {
  return normalizeList(values);
}

export function currentTimestamp(now: Date = new Date()): string {
  return now.toISOString();
}

export function nextSequenceId(existingIds: string[], prefix: string, width = 3): string {
  const max = existingIds.reduce((currentMax, currentId) => {
    const numeric = Number.parseInt(currentId.replace(`${prefix}-`, ""), 10);
    return Number.isFinite(numeric) ? Math.max(currentMax, numeric) : currentMax;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(width, "0")}`;
}
