import {
  HYPOTHESIS_CONFIDENCE_LEVELS,
  HYPOTHESIS_STATUSES,
  type HypothesisConfidence,
  RESEARCH_ARTIFACT_KINDS,
  RESEARCH_STATUSES,
  type ResearchArtifactKind,
  type ResearchHypothesisStatus,
  type ResearchStatus,
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

export function normalizeResearchId(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(trimmed)) {
    throw new Error(`Invalid research id: ${value}`);
  }
  return trimmed;
}

export function normalizeHypothesisId(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!/^hyp-\d{3}$/.test(trimmed)) {
    throw new Error(`Invalid hypothesis id: ${value}`);
  }
  return trimmed;
}

export function normalizeArtifactId(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!/^artifact-\d{3}$/.test(trimmed)) {
    throw new Error(`Invalid artifact id: ${value}`);
  }
  return trimmed;
}

export function normalizeResearchStatus(value: string | undefined): ResearchStatus {
  return expectEnum("research status", value, RESEARCH_STATUSES, "proposed");
}

export function normalizeHypothesisStatus(value: string | undefined): ResearchHypothesisStatus {
  return expectEnum("hypothesis status", value, HYPOTHESIS_STATUSES, "open");
}

export function normalizeHypothesisConfidence(value: string | undefined): HypothesisConfidence {
  return expectEnum("hypothesis confidence", value, HYPOTHESIS_CONFIDENCE_LEVELS, "medium");
}

export function normalizeArtifactKind(value: string | undefined): ResearchArtifactKind {
  return expectEnum("research artifact kind", value, RESEARCH_ARTIFACT_KINDS, "note");
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
