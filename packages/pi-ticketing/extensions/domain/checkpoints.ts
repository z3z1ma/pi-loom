import { existsSync, readFileSync } from "node:fs";
import type { CheckpointRecord } from "./models.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function serializeCheckpoint(record: CheckpointRecord): string {
  return [
    "---",
    `id: ${record.id}`,
    `ticket: ${record.ticketId}`,
    `title: ${JSON.stringify(record.title)}`,
    `created-at: ${record.createdAt}`,
    `supersedes: ${record.supersedes ? record.supersedes : "null"}`,
    "---",
    "",
    record.body.trim(),
    "",
  ].join("\n");
}

export function parseCheckpoint(text: string, path: string): CheckpointRecord {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines[0] !== "---") {
    throw new Error(`Checkpoint file ${path} is missing frontmatter`);
  }
  const endIndex = lines.indexOf("---", 1);
  if (endIndex === -1) {
    throw new Error(`Checkpoint file ${path} has unterminated frontmatter`);
  }
  const fields: Record<string, string | null> = {};
  for (const line of lines.slice(1, endIndex)) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    fields[key] = rawValue === "null" ? null : rawValue.startsWith('"') ? JSON.parse(rawValue) : rawValue;
  }
  return {
    id: fields.id ?? "",
    ticketId: fields.ticket ?? "",
    title: fields.title ?? "",
    createdAt: fields["created-at"] ?? new Date(0).toISOString(),
    supersedes: fields.supersedes ?? null,
    body: lines
      .slice(endIndex + 1)
      .join("\n")
      .trim(),
    path,
  };
}

export function withCheckpointPath(record: CheckpointRecord, path: string): CheckpointRecord {
  return {
    ...record,
    path,
  };
}

export function readCheckpointIndex(indexPath: string): string[] {
  if (!existsSync(indexPath)) {
    return [];
  }
  const parsed = JSON.parse(readFileSync(indexPath, "utf-8")) as unknown;
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter((value): value is string => typeof value === "string");
}

export function readCheckpointIdsFromRecord(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

export function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}
