import {
  CONSTITUTION_DECISION_KINDS,
  type ConstitutionalEntry,
  type ConstitutionalEntryInput,
  type ConstitutionDecisionKind,
  ROADMAP_ITEM_HORIZONS,
  ROADMAP_ITEM_STATUSES,
  type RoadmapItem,
  type RoadmapItemHorizon,
  type RoadmapItemInput,
  type RoadmapItemStatus,
  type UpdateRoadmapItemInput,
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

export function normalizeProjectId(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(trimmed)) {
    throw new Error(`Invalid project id: ${value}`);
  }
  return trimmed;
}

export function normalizeRoadmapItemId(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!/^item-\d{3}$/.test(trimmed)) {
    throw new Error(`Invalid roadmap item id: ${value}`);
  }
  return trimmed;
}

export function normalizeEntryId(value: string, kind: "principle" | "constraint"): string {
  const trimmed = value.trim().toLowerCase();
  const pattern = new RegExp(`^${kind}-\\d{3}$`);
  if (!pattern.test(trimmed)) {
    throw new Error(`Invalid ${kind} id: ${value}`);
  }
  return trimmed;
}

export function normalizeRoadmapItemStatus(value: string | undefined): RoadmapItemStatus {
  return expectEnum("roadmap item status", value, ROADMAP_ITEM_STATUSES, "candidate");
}

export function normalizeRoadmapItemHorizon(value: string | undefined): RoadmapItemHorizon {
  return expectEnum("roadmap item horizon", value, ROADMAP_ITEM_HORIZONS, "next");
}

export function normalizeDecisionKind(value: string | undefined): ConstitutionDecisionKind {
  return expectEnum("constitution decision kind", value, CONSTITUTION_DECISION_KINDS, "clarification");
}

export function normalizeStringList(values: readonly string[] | undefined): string[] {
  return normalizeList(values);
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

export function nextSequenceId(existingIds: string[], prefix: string, width = 3): string {
  const max = existingIds.reduce((currentMax, currentId) => {
    const numeric = Number.parseInt(currentId.replace(`${prefix}-`, ""), 10);
    return Number.isFinite(numeric) ? Math.max(currentMax, numeric) : currentMax;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(width, "0")}`;
}

export function normalizeEntry(
  input: ConstitutionalEntryInput,
  kind: "principle" | "constraint",
  existingIds: string[],
): ConstitutionalEntry {
  const entryId = input.id ? normalizeEntryId(input.id, kind) : nextSequenceId(existingIds, kind);
  const title = input.title.trim();
  if (!title) {
    throw new Error(`${kind} title is required`);
  }
  const summary = input.summary.trim();
  if (!summary) {
    throw new Error(`${kind} summary is required`);
  }
  return {
    id: entryId,
    title,
    summary,
    rationale: input.rationale?.trim() ?? "",
  };
}

export function normalizeRoadmapItem(
  input: RoadmapItemInput | UpdateRoadmapItemInput,
  existingIds: string[],
  updatedAt: string,
): RoadmapItem {
  const itemId = "id" in input && input.id ? normalizeRoadmapItemId(input.id) : nextSequenceId(existingIds, "item");
  const title = input.title?.trim() ?? "";
  if (!title) {
    throw new Error("roadmap item title is required");
  }
  return {
    id: itemId,
    title,
    status: normalizeRoadmapItemStatus(input.status),
    horizon: normalizeRoadmapItemHorizon(input.horizon),
    summary: input.summary?.trim() ?? "",
    rationale: input.rationale?.trim() ?? "",
    initiativeIds: normalizeStringList(input.initiativeIds),
    researchIds: normalizeStringList(input.researchIds),
    specChangeIds: normalizeStringList(input.specChangeIds),
    updatedAt,
  };
}

export function normalizeRoadmapItemState(item: RoadmapItem): RoadmapItem {
  return {
    id: normalizeRoadmapItemId(item.id),
    title: item.title.trim(),
    status: normalizeRoadmapItemStatus(item.status),
    horizon: normalizeRoadmapItemHorizon(item.horizon),
    summary: item.summary ?? "",
    rationale: item.rationale ?? "",
    initiativeIds: normalizeStringList(item.initiativeIds),
    researchIds: normalizeStringList(item.researchIds),
    specChangeIds: normalizeStringList(item.specChangeIds),
    updatedAt: item.updatedAt,
  };
}
