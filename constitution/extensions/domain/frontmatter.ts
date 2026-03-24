export type FrontmatterValue = string | null | string[];

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

export function renderSection(title: string, body: string): string {
  return `## ${title}\n${body.trim()}`.trimEnd();
}

export function renderBulletList(values: string[], empty = "(none)"): string {
  if (values.length === 0) {
    return empty;
  }
  return values.map((value) => `- ${value}`).join("\n");
}

export function parseFrontmatterScalar(value: string): string | null {
  return parseScalar(value);
}
