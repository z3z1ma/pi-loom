import {
  PLAN_SOURCE_TARGET_KINDS,
  PLAN_STATUSES,
  type PlanContextRefs,
  type PlanDecisionRecord,
  type PlanDiscoveryRecord,
  type PlanSourceTargetKind,
  type PlanStatus,
  type PlanTicketLink,
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

export function normalizePlanId(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(trimmed)) {
    throw new Error(`Invalid plan id: ${value}`);
  }
  return trimmed;
}

export function normalizePlanRef(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Plan reference is required");
  }
  const withoutAt = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  const fileName = withoutAt.split(/[\\/]/).pop() ?? withoutAt;
  const withoutExtension = fileName.replace(/\.(json|md)$/i, "");
  const withoutState =
    withoutExtension === "state" ? (withoutAt.split(/[\\/]/).slice(-2, -1)[0] ?? withoutExtension) : withoutExtension;
  return normalizePlanId(withoutState);
}

export function normalizePlanStatus(value: string | undefined): PlanStatus {
  return expectEnum("plan status", value, PLAN_STATUSES, "active");
}

export function normalizePlanSourceTargetKind(value: string | undefined): PlanSourceTargetKind {
  return expectEnum("plan source target kind", value, PLAN_SOURCE_TARGET_KINDS, "workspace");
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

export function normalizeContextRefs(input: Partial<PlanContextRefs> | undefined): PlanContextRefs {
  return {
    roadmapItemIds: normalizeList(input?.roadmapItemIds),
    initiativeIds: normalizeList(input?.initiativeIds),
    researchIds: normalizeList(input?.researchIds),
    specChangeIds: normalizeList(input?.specChangeIds),
    ticketIds: normalizeList(input?.ticketIds),
    critiqueIds: normalizeList(input?.critiqueIds),
    docIds: normalizeList(input?.docIds),
  };
}

export function normalizeTicketId(value: string): string {
  const trimmed = value.trim();
  if (!/^t-\d{4}$/i.test(trimmed)) {
    throw new Error(`Invalid ticket id: ${value}`);
  }
  return trimmed.toLowerCase();
}

export function normalizeTicketRole(value: string | null | undefined): string | null {
  return normalizeOptionalString(value);
}

export function normalizePlanTicketLinks(links: readonly PlanTicketLink[] | undefined): PlanTicketLink[] {
  const deduped = new Map<string, PlanTicketLink>();
  for (const link of links ?? []) {
    const ticketId = normalizeTicketId(link.ticketId);
    deduped.set(ticketId, {
      ticketId,
      role: normalizeTicketRole(link.role),
      order: Number.isFinite(link.order) ? Math.max(1, Math.trunc(link.order)) : deduped.size + 1,
    });
  }
  return [...deduped.values()].sort(
    (left, right) => left.order - right.order || left.ticketId.localeCompare(right.ticketId),
  );
}

export function normalizeDiscoveries(records: readonly PlanDiscoveryRecord[] | undefined): PlanDiscoveryRecord[] {
  return (records ?? [])
    .map((record) => ({
      note: record.note.trim(),
      evidence: record.evidence.trim(),
    }))
    .filter((record) => record.note.length > 0);
}

export function normalizeDecisions(records: readonly PlanDecisionRecord[] | undefined): PlanDecisionRecord[] {
  return (records ?? [])
    .map((record) => ({
      decision: record.decision.trim(),
      rationale: record.rationale.trim(),
      date: record.date.trim(),
      author: record.author.trim(),
    }))
    .filter((record) => record.decision.length > 0);
}

export function currentTimestamp(now: Date = new Date()): string {
  return now.toISOString();
}

export function summarizeText(value: string, fallback: string, limit = 240): string {
  const normalized = value
    .replace(/[`*_>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return fallback;
  }
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit - 1)}…`;
}
