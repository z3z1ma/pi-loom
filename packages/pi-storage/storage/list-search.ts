export const LOOM_LIST_SORTS = [
  "relevance",
  "updated_desc",
  "updated_asc",
  "created_desc",
  "created_asc",
  "id_asc",
  "id_desc",
] as const;

export type LoomListSort = (typeof LOOM_LIST_SORTS)[number];

export interface ListSearchField {
  value: string | null | undefined;
  weight: number;
}

export interface ListSearchEntry<T> {
  item: T;
  id: string;
  updatedAt: string | null | undefined;
  createdAt: string | null | undefined;
  fields: ListSearchField[];
}

export interface ListSearchOptions {
  text?: string | null | undefined;
  sort?: LoomListSort | null | undefined;
}

interface NormalizedField {
  weight: number;
  normalized: string;
  tokens: string[];
}

interface RankedEntry<T> {
  entry: ListSearchEntry<T>;
  score: number;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function tokenize(value: string): string[] {
  return value
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function compareNullableStrings(
  left: string | null | undefined,
  right: string | null | undefined,
  descending: boolean,
): number {
  const leftValue = normalizeText(left);
  const rightValue = normalizeText(right);
  const direction = descending ? -1 : 1;
  return leftValue.localeCompare(rightValue) * direction;
}

function compareIsoTimestamps(
  left: string | null | undefined,
  right: string | null | undefined,
  descending: boolean,
): number {
  const leftValue = normalizeText(left);
  const rightValue = normalizeText(right);
  const direction = descending ? -1 : 1;
  if (leftValue && rightValue) {
    return leftValue.localeCompare(rightValue) * direction;
  }
  if (leftValue) {
    return -1 * direction;
  }
  if (rightValue) {
    return 1 * direction;
  }
  return 0;
}

function normalizeFields(fields: ListSearchField[]): NormalizedField[] {
  return fields
    .map((field) => ({
      weight: field.weight,
      normalized: normalizeText(field.value),
    }))
    .filter((field) => field.normalized.length > 0)
    .map((field) => ({
      ...field,
      tokens: tokenize(field.normalized),
    }));
}

function tokenMatchesField(field: NormalizedField, token: string): boolean {
  return field.tokens.some(
    (candidate) => candidate === token || candidate.startsWith(token) || candidate.includes(token),
  );
}

function scoreField(field: NormalizedField, query: string, queryTokens: string[]): number {
  let score = 0;
  if (field.normalized === query) {
    score += field.weight * 1000;
  } else if (field.tokens.includes(query)) {
    score += field.weight * 900;
  } else if (field.normalized.startsWith(query)) {
    score += field.weight * 800;
  } else if (field.tokens.some((candidate) => candidate.startsWith(query))) {
    score += field.weight * 700;
  } else if (field.normalized.includes(query)) {
    score += field.weight * 600;
  }

  for (const token of queryTokens) {
    if (field.tokens.includes(token)) {
      score += field.weight * 140;
      continue;
    }
    if (field.tokens.some((candidate) => candidate.startsWith(token))) {
      score += field.weight * 100;
      continue;
    }
    if (field.normalized.includes(token)) {
      score += field.weight * 60;
    }
  }

  return score;
}

function scoreEntry<T>(entry: ListSearchEntry<T>, query: string): RankedEntry<T> | null {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return { entry, score: 0 };
  }

  const normalizedFields = normalizeFields(entry.fields);
  if (normalizedFields.length === 0) {
    return null;
  }

  const queryTokens = tokenize(normalizedQuery);
  const tokens = queryTokens.length > 0 ? queryTokens : [normalizedQuery];
  const wholeQueryMatch = normalizedFields.some(
    (field) =>
      field.normalized === normalizedQuery ||
      field.tokens.includes(normalizedQuery) ||
      field.normalized.startsWith(normalizedQuery) ||
      field.tokens.some((candidate) => candidate.startsWith(normalizedQuery)) ||
      field.normalized.includes(normalizedQuery),
  );
  const allTokensMatched = tokens.every((token) => normalizedFields.some((field) => tokenMatchesField(field, token)));

  if (!wholeQueryMatch && !allTokensMatched) {
    return null;
  }

  const score = normalizedFields.reduce((total, field) => total + scoreField(field, normalizedQuery, tokens), 0);
  return {
    entry,
    score: score + (wholeQueryMatch ? 250 : 0) + (allTokensMatched ? 150 : 0),
  };
}

function compareEntries<T>(left: RankedEntry<T>, right: RankedEntry<T>, sort: LoomListSort): number {
  switch (sort) {
    case "updated_desc":
      return (
        compareIsoTimestamps(left.entry.updatedAt, right.entry.updatedAt, true) ||
        compareIsoTimestamps(left.entry.createdAt, right.entry.createdAt, true) ||
        compareNullableStrings(left.entry.id, right.entry.id, false)
      );
    case "updated_asc":
      return (
        compareIsoTimestamps(left.entry.updatedAt, right.entry.updatedAt, false) ||
        compareIsoTimestamps(left.entry.createdAt, right.entry.createdAt, false) ||
        compareNullableStrings(left.entry.id, right.entry.id, false)
      );
    case "created_desc":
      return (
        compareIsoTimestamps(left.entry.createdAt, right.entry.createdAt, true) ||
        compareIsoTimestamps(left.entry.updatedAt, right.entry.updatedAt, true) ||
        compareNullableStrings(left.entry.id, right.entry.id, false)
      );
    case "created_asc":
      return (
        compareIsoTimestamps(left.entry.createdAt, right.entry.createdAt, false) ||
        compareIsoTimestamps(left.entry.updatedAt, right.entry.updatedAt, false) ||
        compareNullableStrings(left.entry.id, right.entry.id, false)
      );
    case "id_desc":
      return compareNullableStrings(left.entry.id, right.entry.id, true);
    case "id_asc":
      return compareNullableStrings(left.entry.id, right.entry.id, false);
    case "relevance":
      return (
        right.score - left.score ||
        compareIsoTimestamps(left.entry.updatedAt, right.entry.updatedAt, true) ||
        compareIsoTimestamps(left.entry.createdAt, right.entry.createdAt, true) ||
        compareNullableStrings(left.entry.id, right.entry.id, false)
      );
  }
}

export function filterAndSortListEntries<T>(entries: ListSearchEntry<T>[], options: ListSearchOptions = {}): T[] {
  const text = normalizeText(options.text);
  const ranked = text
    ? entries.map((entry) => scoreEntry(entry, text)).filter((entry): entry is RankedEntry<T> => entry !== null)
    : entries.map((entry) => ({ entry, score: 0 }));
  const sort = options.sort ?? (text ? "relevance" : "updated_desc");
  return ranked.sort((left, right) => compareEntries(left, right, sort)).map(({ entry }) => entry.item);
}
