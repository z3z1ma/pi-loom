export interface ParsedMarkdownHeadingDocument {
  title: string;
  body: string;
}

export function parseMarkdownHeadingDocument(markdown: string, filePath: string): ParsedMarkdownHeadingDocument {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const headingIndex = lines.findIndex((line) => line.trim().length > 0);
  if (headingIndex === -1) {
    throw new Error(`Markdown document ${filePath} is empty.`);
  }

  const heading = lines[headingIndex]?.trim() ?? "";
  if (!heading.startsWith("# ")) {
    throw new Error(`Markdown document ${filePath} must start with a level-1 heading.`);
  }

  return {
    title: heading.slice(2).trim(),
    body: lines
      .slice(headingIndex + 1)
      .join("\n")
      .trim(),
  };
}

export function parseMarkdownSections(body: string): Record<string, string> {
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

export function parseMarkdownBulletList(section: string | undefined): string[] {
  if (!section) {
    return [];
  }

  const trimmed = section.trim();
  if (!trimmed || trimmed === "(none)" || trimmed === "(empty)") {
    return [];
  }

  return trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- ") || line.startsWith("* "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}
