import {
  DOC_AUDIENCES,
  DOC_SECTION_GROUPS,
  DOC_SOURCE_TARGET_KINDS,
  DOC_STATUSES,
  DOC_TYPES,
  type DocAudience,
  type DocSectionGroup,
  type DocSourceTargetKind,
  type DocStatus,
  type DocsContextRefs,
  type DocType,
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

export function normalizeDocId(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(trimmed)) {
    throw new Error(`Invalid documentation id: ${value}`);
  }
  return trimmed;
}

export function normalizeDocRef(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Documentation reference is required");
  }
  const withoutAt = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  const fileName = withoutAt.split(/[\\/]/).pop() ?? withoutAt;
  const withoutExtension = fileName.replace(/\.(json|jsonl|md)$/i, "");
  const withoutState =
    withoutExtension === "state" ? (withoutAt.split(/[\\/]/).slice(-2, -1)[0] ?? withoutExtension) : withoutExtension;
  return normalizeDocId(withoutState);
}

export function normalizeDocStatus(value: string | undefined): DocStatus {
  return expectEnum("documentation status", value, DOC_STATUSES, "active");
}

export function normalizeDocType(value: string | undefined): DocType {
  return expectEnum("documentation type", value, DOC_TYPES, "overview");
}

export function normalizeSectionGroup(value: string | undefined): DocSectionGroup {
  return expectEnum("documentation section group", value, DOC_SECTION_GROUPS, "overviews");
}

export function sectionGroupForDocType(docType: DocType): DocSectionGroup {
  switch (docType) {
    case "overview":
      return "overviews";
    case "guide":
    case "workflow":
    case "faq":
      return "guides";
    case "concept":
      return "concepts";
    case "operations":
      return "operations";
  }
}

export function normalizeAudience(values: readonly string[] | undefined): DocAudience[] {
  const normalized = normalizeList(values).map((value) =>
    expectEnum("documentation audience", value, DOC_AUDIENCES, "ai"),
  );
  return normalized.length > 0 ? normalized : ["ai", "human"];
}

export function normalizeSourceTargetKind(value: string | undefined): DocSourceTargetKind {
  return expectEnum("documentation source target kind", value, DOC_SOURCE_TARGET_KINDS, "workspace");
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

export function normalizeContextRefs(input: Partial<DocsContextRefs> | undefined): DocsContextRefs {
  return {
    roadmapItemIds: normalizeList(input?.roadmapItemIds),
    initiativeIds: normalizeList(input?.initiativeIds),
    researchIds: normalizeList(input?.researchIds),
    specChangeIds: normalizeList(input?.specChangeIds),
    ticketIds: normalizeList(input?.ticketIds),
    critiqueIds: normalizeList(input?.critiqueIds),
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

export function summarizeDocument(document: string, limit = 240): string {
  const normalized = document
    .replace(/^#\s+.+$/gm, "")
    .replace(/[`*_>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return "Documentation record awaiting first substantive revision.";
  }
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit - 1)}…`;
}

export function extractMarkdownSections(document: string): string[] {
  const sections = document
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^##\s+/.test(line))
    .map((line) => line.replace(/^##\s+/, "").trim());
  return normalizeStringList(sections);
}
