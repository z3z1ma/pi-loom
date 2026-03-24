export function currentTimestamp(now: Date = new Date()): string {
  return now.toISOString();
}

export function normalizeOptionalString(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
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
    const next = value.trim();
    if (!next || seen.has(next)) {
      continue;
    }
    seen.add(next);
    normalized.push(next);
  }
  return normalized.sort((left, right) => left.localeCompare(right));
}

export function summarizeText(value: string | null | undefined, fallback: string, limit = 280): string {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return fallback;
  }
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit - 1)}…`;
}

export function nextSequenceId(prefix: string, existingIds: readonly string[]): string {
  const regex = new RegExp(`^${prefix}-(\\d+)$`);
  const max = existingIds.reduce((currentMax, id) => {
    const match = regex.exec(id);
    if (!match) {
      return currentMax;
    }
    const value = Number.parseInt(match[1] ?? "0", 10);
    return Number.isFinite(value) ? Math.max(currentMax, value) : currentMax;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

export function latestById<T extends { id: string }>(entries: readonly T[]): T[] {
  const latest = new Map<string, T>();
  for (const entry of entries) {
    latest.set(entry.id, entry);
  }
  return [...latest.values()].sort((left, right) => left.id.localeCompare(right.id));
}
