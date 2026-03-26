import { stableJsonStringify } from "./projections.js";

export type ProjectionFrontmatterValue = string | null | string[];

export interface ParsedProjectionDocument {
  frontmatter: Record<string, ProjectionFrontmatterValue>;
  body: string;
  sectionOrder: string[];
  sections: Record<string, string>;
}

export interface ParsedProjectionBulletBlock {
  header: string;
  fields: Record<string, string>;
}

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

export function parseProjectionDocument(text: string, filePath: string): ParsedProjectionDocument {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines[0] !== "---") {
    throw new Error(`Projection ${filePath} is missing frontmatter.`);
  }
  const endIndex = lines.indexOf("---", 1);
  if (endIndex === -1) {
    throw new Error(`Projection ${filePath} has unterminated frontmatter.`);
  }

  const frontmatter: Record<string, ProjectionFrontmatterValue> = {};
  let currentArrayKey: string | null = null;
  for (const line of lines.slice(1, endIndex)) {
    if (!line.trim()) {
      continue;
    }
    if (line.startsWith("  - ")) {
      if (!currentArrayKey) {
        throw new Error(`Projection ${filePath} has an invalid frontmatter array entry.`);
      }
      const current = (frontmatter[currentArrayKey] as string[] | undefined) ?? [];
      current.push(parseScalar(line.slice(4)) ?? "");
      frontmatter[currentArrayKey] = current;
      continue;
    }

    currentArrayKey = null;
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      throw new Error(`Projection ${filePath} has an invalid frontmatter line: ${line}`);
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    if (!rawValue) {
      frontmatter[key] = [];
      currentArrayKey = key;
      continue;
    }

    const parsedValue = parseScalar(rawValue);
    frontmatter[key] = parsedValue === "[]" ? [] : parsedValue;
  }

  const body = lines
    .slice(endIndex + 1)
    .join("\n")
    .trim();
  const { order: sectionOrder, sections } = parseProjectionSections(body);
  return { frontmatter, body, sectionOrder, sections };
}

export function parseProjectionSections(body: string): { order: string[]; sections: Record<string, string> } {
  const sectionPattern = /^## (.+)$/gm;
  const matches = [...body.matchAll(sectionPattern)];
  const order: string[] = [];
  const sections: Record<string, string> = {};
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const next = matches[index + 1];
    const title = match[1]?.trim() ?? "";
    if (!title) {
      continue;
    }
    const start = (match.index ?? 0) + match[0].length;
    const end = next?.index ?? body.length;
    order.push(title);
    sections[title] = body.slice(start, end).trim();
  }
  return { order, sections };
}

export function parseProjectionBulletList(section: string | undefined, emptyLabel = "(none)"): string[] {
  const trimmed = section?.trim() ?? "";
  if (!trimmed || trimmed === emptyLabel) {
    return [];
  }
  return trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}

export function parseProjectionBulletBlocks(
  section: string | undefined,
  emptyLabel = "(none)",
): ParsedProjectionBulletBlock[] {
  const trimmed = section?.trim() ?? "";
  if (!trimmed || trimmed === emptyLabel) {
    return [];
  }

  const blocks: ParsedProjectionBulletBlock[] = [];
  let current: ParsedProjectionBulletBlock | null = null;
  for (const rawLine of trimmed.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      continue;
    }
    if (line.startsWith("- ")) {
      current = { header: line.slice(2).trim(), fields: {} };
      blocks.push(current);
      continue;
    }
    if (!current) {
      throw new Error(`Invalid projection bullet block line: ${line}`);
    }
    const fieldMatch = line.match(/^\s{2,}([^:]+):\s*(.*)$/);
    if (!fieldMatch) {
      throw new Error(`Invalid projection bullet block field: ${line}`);
    }
    current.fields[fieldMatch[1].trim()] = fieldMatch[2].trim();
  }
  return blocks;
}

export function assertProtectedProjectionContentUnchanged(input: {
  canonicalContent: string;
  currentContent: string;
  editableSections: readonly string[];
  filePath: string;
}): ParsedProjectionDocument {
  const canonical = parseProjectionDocument(input.canonicalContent, input.filePath);
  const current = parseProjectionDocument(input.currentContent, input.filePath);

  if (stableJsonStringify(canonical.frontmatter) !== stableJsonStringify(current.frontmatter)) {
    throw new Error(`Projection ${input.filePath} does not allow frontmatter edits.`);
  }
  if (stableJsonStringify(canonical.sectionOrder) !== stableJsonStringify(current.sectionOrder)) {
    throw new Error(`Projection ${input.filePath} must preserve generated section ordering.`);
  }

  const editable = new Set(input.editableSections);
  for (const section of canonical.sectionOrder) {
    if (editable.has(section)) {
      continue;
    }
    if ((canonical.sections[section] ?? "") !== (current.sections[section] ?? "")) {
      throw new Error(`Projection ${input.filePath} does not allow edits in generated section ${section}.`);
    }
  }

  return current;
}
