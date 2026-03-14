import {
  MUTABLE_TICKET_STATUSES,
  type MutableTicketStatus,
  REVIEW_STATUSES,
  TICKET_PRIORITIES,
  TICKET_RISKS,
  TICKET_TYPES,
  type TicketPriority,
  type TicketReviewStatus,
  type TicketRisk,
  type TicketType,
} from "./models.js";

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

export function normalizeTicketId(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!/^t-\d{4}$/.test(trimmed)) {
    throw new Error(`Invalid ticket id: ${value}`);
  }
  return trimmed;
}

export function normalizeTicketRef(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Ticket reference is required");
  }
  const withoutAt = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  const withoutHash = withoutAt.startsWith("#") ? withoutAt.slice(1) : withoutAt;
  const fileName = withoutHash.split(/[\\/]/).pop() ?? withoutHash;
  const withoutExtension = fileName.endsWith(".md") ? fileName.slice(0, -3) : fileName;
  return normalizeTicketId(withoutExtension);
}

export function normalizeCheckpointId(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!/^cp-\d{4}$/.test(trimmed)) {
    throw new Error(`Invalid checkpoint id: ${value}`);
  }
  return trimmed;
}

export function normalizeArtifactId(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!/^artifact-\d{4}$/.test(trimmed)) {
    throw new Error(`Invalid artifact id: ${value}`);
  }
  return trimmed;
}

export function normalizeStatus(value: string | undefined): MutableTicketStatus {
  return expectEnum("status", value, MUTABLE_TICKET_STATUSES, "open");
}

export function normalizeType(value: string | undefined): TicketType {
  return expectEnum("type", value, TICKET_TYPES, "task");
}

export function normalizePriority(value: string | undefined): TicketPriority {
  return expectEnum("priority", value, TICKET_PRIORITIES, "medium");
}

export function normalizeRisk(value: string | undefined): TicketRisk {
  return expectEnum("risk", value, TICKET_RISKS, "medium");
}

export function normalizeReviewStatus(value: string | undefined): TicketReviewStatus {
  return expectEnum("review status", value, REVIEW_STATUSES, "none");
}

export function normalizeStringList(values: readonly string[] | undefined): string[] {
  return normalizeList(values);
}

export function splitLines(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
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

export function normalizeOptionalString(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function currentTimestamp(now: Date = new Date()): string {
  return now.toISOString();
}
