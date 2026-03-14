import {
  CRITIQUE_FINDING_CONFIDENCE,
  CRITIQUE_FINDING_KINDS,
  CRITIQUE_FINDING_SEVERITIES,
  CRITIQUE_FINDING_STATUSES,
  CRITIQUE_FOCUS_AREAS,
  CRITIQUE_RUN_KINDS,
  CRITIQUE_STATUSES,
  CRITIQUE_TARGET_KINDS,
  CRITIQUE_VERDICTS,
  type CritiqueContextRefs,
  type CritiqueFindingConfidence,
  type CritiqueFindingKind,
  type CritiqueFindingSeverity,
  type CritiqueFindingStatus,
  type CritiqueFocusArea,
  type CritiqueRunKind,
  type CritiqueStatus,
  type CritiqueTargetKind,
  type CritiqueVerdict,
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

export function normalizeCritiqueId(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(trimmed)) {
    throw new Error(`Invalid critique id: ${value}`);
  }
  return trimmed;
}

export function normalizeCritiqueRef(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Critique reference is required");
  }
  const withoutAt = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  const fileName = withoutAt.split(/[\\/]/).pop() ?? withoutAt;
  const withoutExtension = fileName.replace(/\.(json|jsonl|md)$/i, "");
  const withoutState =
    withoutExtension === "state" ? (withoutAt.split(/[\\/]/).slice(-2, -1)[0] ?? withoutExtension) : withoutExtension;
  return normalizeCritiqueId(withoutState);
}

export function normalizeStatus(value: string | undefined): CritiqueStatus {
  return expectEnum("critique status", value, CRITIQUE_STATUSES, "proposed");
}

export function normalizeTargetKind(value: string | undefined): CritiqueTargetKind {
  return expectEnum("critique target kind", value, CRITIQUE_TARGET_KINDS, "workspace");
}

export function normalizeFocusAreas(values: readonly string[] | undefined): CritiqueFocusArea[] {
  return normalizeList(values).map((value) =>
    expectEnum("critique focus area", value, CRITIQUE_FOCUS_AREAS, "correctness"),
  );
}

export function normalizeVerdict(value: string | undefined): CritiqueVerdict {
  return expectEnum("critique verdict", value, CRITIQUE_VERDICTS, "concerns");
}

export function normalizeRunKind(value: string | undefined): CritiqueRunKind {
  return expectEnum("critique run kind", value, CRITIQUE_RUN_KINDS, "adversarial");
}

export function normalizeFindingKind(value: string | undefined): CritiqueFindingKind {
  return expectEnum("critique finding kind", value, CRITIQUE_FINDING_KINDS, "bug");
}

export function normalizeFindingSeverity(value: string | undefined): CritiqueFindingSeverity {
  return expectEnum("critique finding severity", value, CRITIQUE_FINDING_SEVERITIES, "medium");
}

export function normalizeFindingConfidence(value: string | undefined): CritiqueFindingConfidence {
  return expectEnum("critique finding confidence", value, CRITIQUE_FINDING_CONFIDENCE, "medium");
}

export function normalizeFindingStatus(value: string | undefined): CritiqueFindingStatus {
  return expectEnum("critique finding status", value, CRITIQUE_FINDING_STATUSES, "open");
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

export function normalizeContextRefs(input: Partial<CritiqueContextRefs> | undefined): CritiqueContextRefs {
  return {
    roadmapItemIds: normalizeList(input?.roadmapItemIds),
    initiativeIds: normalizeList(input?.initiativeIds),
    researchIds: normalizeList(input?.researchIds),
    specChangeIds: normalizeList(input?.specChangeIds),
    ticketIds: normalizeList(input?.ticketIds),
  };
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

export function isActiveFindingStatus(status: CritiqueFindingStatus): boolean {
  return status === "open" || status === "accepted";
}
