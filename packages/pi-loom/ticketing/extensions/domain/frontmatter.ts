import type { TicketBody, TicketFrontmatter, TicketRecord } from "./models.js";
import {
  normalizeOptionalString,
  normalizePriority,
  normalizeReviewStatus,
  normalizeRisk,
  normalizeStatus,
  normalizeStringList,
  normalizeTicketId,
  normalizeType,
} from "./normalize.js";
import { getTicketRef } from "./paths.js";

const SECTION_TITLES = ["Summary", "Context", "Plan", "Notes", "Verification", "Journal Summary"] as const;

function parseScalar(value: string): string | null {
  if (value === "null") {
    return null;
  }
  if (value === "[]") {
    return "[]";
  }
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replaceAll('\\"', '"');
  }
  return value;
}

function serializeScalar(value: string | null): string {
  if (value === null) {
    return "null";
  }
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}

function ensureFrontmatterDefaults(frontmatter: Partial<TicketFrontmatter>): TicketFrontmatter {
  return {
    id: normalizeTicketId(frontmatter.id ?? "t-0000"),
    title: frontmatter.title?.trim() || "Untitled",
    status: normalizeStatus(frontmatter.status),
    priority: normalizePriority(frontmatter.priority),
    type: normalizeType(frontmatter.type),
    "created-at": frontmatter["created-at"] ?? new Date(0).toISOString(),
    "updated-at": frontmatter["updated-at"] ?? new Date(0).toISOString(),
    tags: normalizeStringList(frontmatter.tags),
    deps: normalizeStringList(frontmatter.deps),
    links: normalizeStringList(frontmatter.links),
    "initiative-ids": normalizeStringList(frontmatter["initiative-ids"]),
    "research-ids": normalizeStringList(frontmatter["research-ids"]),
    parent: normalizeOptionalString(frontmatter.parent),
    assignee: normalizeOptionalString(frontmatter.assignee),
    acceptance: normalizeStringList(frontmatter.acceptance),
    labels: normalizeStringList(frontmatter.labels),
    risk: normalizeRisk(frontmatter.risk),
    "review-status": normalizeReviewStatus(frontmatter["review-status"]),
    "external-refs": normalizeStringList(frontmatter["external-refs"]),
  };
}

export function createEmptyBody(overrides?: Partial<TicketBody>): TicketBody {
  return {
    summary: overrides?.summary?.trim() ?? "",
    context: overrides?.context?.trim() ?? "",
    plan: overrides?.plan?.trim() ?? "",
    notes: overrides?.notes?.trim() ?? "",
    verification: overrides?.verification?.trim() ?? "",
    journalSummary: overrides?.journalSummary?.trim() ?? "",
  };
}

export function serializeTicket(record: Pick<TicketRecord, "frontmatter" | "body">): string {
  const frontmatter = ensureFrontmatterDefaults(record.frontmatter);
  const lines = ["---"];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
        continue;
      }
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${serializeScalar(item)}`);
      }
      continue;
    }
    lines.push(`${key}: ${serializeScalar(value)}`);
  }
  lines.push("---", "");

  const body = createEmptyBody(record.body);
  const sections: Record<(typeof SECTION_TITLES)[number], string> = {
    Summary: body.summary,
    Context: body.context,
    Plan: body.plan,
    Notes: body.notes,
    Verification: body.verification,
    "Journal Summary": body.journalSummary,
  };

  for (const section of SECTION_TITLES) {
    lines.push(`## ${section}`);
    lines.push(sections[section] || "");
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function parseTicket(text: string, sourceLabel: string, closed: boolean): TicketRecord {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines[0] !== "---") {
    throw new Error(`Ticket file ${sourceLabel} is missing frontmatter`);
  }
  const endIndex = lines.indexOf("---", 1);
  if (endIndex === -1) {
    throw new Error(`Ticket file ${sourceLabel} has unterminated frontmatter`);
  }

  const frontmatterRaw: Record<string, unknown> = {};
  let currentArrayKey: string | null = null;
  for (const line of lines.slice(1, endIndex)) {
    if (!line.trim()) {
      continue;
    }
    if (line.startsWith("  - ")) {
      if (!currentArrayKey) {
        throw new Error(`Invalid array entry in ${sourceLabel}`);
      }
      const current = (frontmatterRaw[currentArrayKey] as string[] | undefined) ?? [];
      current.push(parseScalar(line.slice(4)) ?? "");
      frontmatterRaw[currentArrayKey] = current;
      continue;
    }
    currentArrayKey = null;
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      throw new Error(`Invalid frontmatter line in ${sourceLabel}: ${line}`);
    }
    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    if (!rawValue) {
      frontmatterRaw[key] = [];
      currentArrayKey = key;
      continue;
    }
    const parsedValue = parseScalar(rawValue);
    frontmatterRaw[key] = parsedValue === "[]" ? [] : parsedValue;
  }

  const content = lines.slice(endIndex + 1).join("\n");
  const body = createEmptyBody();
  const sectionPattern = /^## (Summary|Context|Plan|Notes|Verification|Journal Summary)$/gm;
  const matches = [...content.matchAll(sectionPattern)];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const next = matches[index + 1];
    const sectionName = match[1];
    const start = (match.index ?? 0) + match[0].length;
    const end = next?.index ?? content.length;
    const value = content.slice(start, end).trim();
    switch (sectionName) {
      case "Summary":
        body.summary = value;
        break;
      case "Context":
        body.context = value;
        break;
      case "Plan":
        body.plan = value;
        break;
      case "Notes":
        body.notes = value;
        break;
      case "Verification":
        body.verification = value;
        break;
      case "Journal Summary":
        body.journalSummary = value;
        break;
    }
  }

  const frontmatter = ensureFrontmatterDefaults({
    id: String(frontmatterRaw.id ?? "t-0000"),
    title: typeof frontmatterRaw.title === "string" ? frontmatterRaw.title : "Untitled",
    status:
      typeof frontmatterRaw.status === "string" ? (frontmatterRaw.status as TicketFrontmatter["status"]) : undefined,
    priority:
      typeof frontmatterRaw.priority === "string"
        ? (frontmatterRaw.priority as TicketFrontmatter["priority"])
        : undefined,
    type: typeof frontmatterRaw.type === "string" ? (frontmatterRaw.type as TicketFrontmatter["type"]) : undefined,
    "created-at": typeof frontmatterRaw["created-at"] === "string" ? frontmatterRaw["created-at"] : undefined,
    "updated-at": typeof frontmatterRaw["updated-at"] === "string" ? frontmatterRaw["updated-at"] : undefined,
    tags: Array.isArray(frontmatterRaw.tags) ? (frontmatterRaw.tags as string[]) : [],
    deps: Array.isArray(frontmatterRaw.deps) ? (frontmatterRaw.deps as string[]) : [],
    links: Array.isArray(frontmatterRaw.links) ? (frontmatterRaw.links as string[]) : [],
    "initiative-ids": Array.isArray(frontmatterRaw["initiative-ids"])
      ? (frontmatterRaw["initiative-ids"] as string[])
      : [],
    "research-ids": Array.isArray(frontmatterRaw["research-ids"]) ? (frontmatterRaw["research-ids"] as string[]) : [],
    parent:
      typeof frontmatterRaw.parent === "string" || frontmatterRaw.parent === null
        ? (frontmatterRaw.parent as string | null)
        : null,
    assignee:
      typeof frontmatterRaw.assignee === "string" || frontmatterRaw.assignee === null
        ? (frontmatterRaw.assignee as string | null)
        : null,
    acceptance: Array.isArray(frontmatterRaw.acceptance) ? (frontmatterRaw.acceptance as string[]) : [],
    labels: Array.isArray(frontmatterRaw.labels) ? (frontmatterRaw.labels as string[]) : [],
    risk: typeof frontmatterRaw.risk === "string" ? (frontmatterRaw.risk as TicketFrontmatter["risk"]) : undefined,
    "review-status":
      typeof frontmatterRaw["review-status"] === "string"
        ? (frontmatterRaw["review-status"] as TicketFrontmatter["review-status"])
        : undefined,
    "external-refs": Array.isArray(frontmatterRaw["external-refs"])
      ? (frontmatterRaw["external-refs"] as string[])
      : [],
  });

  return {
    frontmatter,
    body,
    closed,
    archived: false,
    archivedAt: null,
    ref: getTicketRef(frontmatter.id),
  };
}
