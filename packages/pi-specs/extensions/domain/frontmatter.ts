export type FrontmatterValue = string | null | string[];

export interface ParsedMarkdownArtifact {
  frontmatter: Record<string, FrontmatterValue>;
  body: string;
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

function serializeScalar(value: string | null): string {
  if (value === null) {
    return "null";
  }
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}

export function serializeMarkdownArtifact(frontmatter: Record<string, FrontmatterValue>, body: string): string {
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
  lines.push("---", "", body.trimEnd());
  return `${lines.join("\n").trimEnd()}\n`;
}

export function parseMarkdownArtifact(text: string, path: string): ParsedMarkdownArtifact {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines[0] !== "---") {
    throw new Error(`Markdown artifact ${path} is missing frontmatter`);
  }
  const endIndex = lines.indexOf("---", 1);
  if (endIndex === -1) {
    throw new Error(`Markdown artifact ${path} has unterminated frontmatter`);
  }

  const frontmatter: Record<string, FrontmatterValue> = {};
  let currentArrayKey: string | null = null;
  for (const line of lines.slice(1, endIndex)) {
    if (!line.trim()) {
      continue;
    }
    if (line.startsWith("  - ")) {
      if (!currentArrayKey) {
        throw new Error(`Invalid array entry in ${path}`);
      }
      const current = (frontmatter[currentArrayKey] as string[] | undefined) ?? [];
      current.push(parseScalar(line.slice(4)) ?? "");
      frontmatter[currentArrayKey] = current;
      continue;
    }
    currentArrayKey = null;
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      throw new Error(`Invalid frontmatter line in ${path}: ${line}`);
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

  return {
    frontmatter,
    body: lines
      .slice(endIndex + 1)
      .join("\n")
      .trim(),
  };
}

export function renderSection(title: string, body: string): string {
  return `## ${title}\n${body.trim()}`.trimEnd();
}

export function renderBulletList(values: string[], empty = "(none)"): string {
  if (values.length === 0) {
    return empty;
  }
  return values.map((value) => `- ${value}`).join("\n");
}

export function parseSections(body: string): Record<string, string> {
  const sectionPattern = /^## (.+)$/gm;
  const matches = [...body.matchAll(sectionPattern)];
  const sections: Record<string, string> = {};
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const next = matches[index + 1];
    const start = (match.index ?? 0) + match[0].length;
    const end = next?.index ?? body.length;
    sections[match[1].trim()] = body.slice(start, end).trim();
  }
  return sections;
}

export function parseBulletLines(section: string | undefined): string[] {
  if (!section) {
    return [];
  }
  return section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}
