import {
  MUTABLE_TICKET_STATUSES,
  type MutableTicketStatus,
  REVIEW_STATUSES,
  TICKET_DOCS_DISPOSITIONS,
  TICKET_BRANCH_MODES,
  TICKET_PRIORITIES,
  TICKET_RISKS,
  TICKET_TYPES,
  type TicketBranchMode,
  type TicketDocsDisposition,
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

const TICKET_ID_PATTERN = /^(?<prefix>[a-z][a-z0-9]{0,5})-(?<sequence>\d{4})$/i;

export function parseTicketIdParts(value: string): { prefix: string; sequence: number } {
  const trimmed = value.trim().toLowerCase();
  const match = TICKET_ID_PATTERN.exec(trimmed);
  if (!match?.groups) {
    throw new Error(`Invalid ticket id: ${value}`);
  }
  return {
    prefix: match.groups.prefix,
    sequence: Number.parseInt(match.groups.sequence, 10),
  };
}

export function formatTicketId(prefix: string, sequence: number): string {
  const normalizedPrefix = prefix.trim().toLowerCase();
  if (!/^[a-z][a-z0-9]{0,5}$/.test(normalizedPrefix)) {
    throw new Error(`Invalid ticket prefix: ${prefix}`);
  }
  if (!Number.isFinite(sequence) || sequence < 0) {
    throw new Error(`Invalid ticket sequence: ${sequence}`);
  }
  return `${normalizedPrefix}-${String(Math.trunc(sequence)).padStart(4, "0")}`;
}

export function normalizeTicketId(value: string): string {
  const parsed = parseTicketIdParts(value);
  return formatTicketId(parsed.prefix, parsed.sequence);
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

export function normalizeBranchMode(value: string | undefined): TicketBranchMode {
  return expectEnum("branch mode", value, TICKET_BRANCH_MODES, "none");
}

export function normalizeDocsDisposition(value: string | undefined): TicketDocsDisposition {
  return expectEnum("docs disposition", value, TICKET_DOCS_DISPOSITIONS, "waive");
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

export interface NormalizedTicketBranchIntent {
  branchMode: TicketBranchMode;
  branchFamily: string | null;
  exactBranchName: string | null;
}

export function normalizeTicketBranchIntent(input: {
  branchMode?: string;
  branchFamily?: string | null;
  exactBranchName?: string | null;
}): NormalizedTicketBranchIntent {
  const branchMode = normalizeBranchMode(input.branchMode);
  const branchFamily = normalizeOptionalString(input.branchFamily);
  const exactBranchName = normalizeOptionalString(input.exactBranchName);

  if (branchMode === "none") {
    if (branchFamily || exactBranchName) {
      throw new Error("branchFamily and exactBranchName must be omitted when branchMode is none");
    }
    return { branchMode, branchFamily: null, exactBranchName: null };
  }

  if (branchMode === "allocator") {
    if (!branchFamily) {
      throw new Error("branchFamily is required when branchMode is allocator");
    }
    if (exactBranchName) {
      throw new Error("exactBranchName must be omitted when branchMode is allocator");
    }
    return { branchMode, branchFamily, exactBranchName: null };
  }

  if (!exactBranchName) {
    throw new Error("exactBranchName is required when branchMode is exact");
  }
  return { branchMode, branchFamily, exactBranchName };
}

export function currentTimestamp(now: Date = new Date()): string {
  return now.toISOString();
}
