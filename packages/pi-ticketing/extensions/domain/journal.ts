import { existsSync, readFileSync } from "node:fs";
import type { JournalEntry, JournalKind } from "./models.js";
import { getJournalPath } from "./paths.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createJournalEntry(
  ticketId: string,
  kind: JournalKind,
  text: string,
  createdAt: string,
  metadata: Record<string, unknown> = {},
  index: number,
): JournalEntry {
  return {
    id: `${ticketId}-journal-${String(index).padStart(4, "0")}`,
    ticketId,
    createdAt,
    kind,
    text: text.trim(),
    metadata,
  };
}

export function readJournalEntries(cwd: string, ticketId: string): JournalEntry[] {
  const filePath = getJournalPath(cwd, ticketId);
  if (!existsSync(filePath)) {
    return [];
  }
  const lines = readFileSync(filePath, "utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const entries: JournalEntry[] = [];
  for (const line of lines) {
    const parsed = JSON.parse(line) as unknown;
    if (!isRecord(parsed)) {
      continue;
    }
    entries.push({
      id: typeof parsed.id === "string" ? parsed.id : `${ticketId}-journal-unknown`,
      ticketId: typeof parsed.ticketId === "string" ? parsed.ticketId : ticketId,
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : new Date(0).toISOString(),
      kind: typeof parsed.kind === "string" ? (parsed.kind as JournalKind) : "note",
      text: typeof parsed.text === "string" ? parsed.text : "",
      metadata: isRecord(parsed.metadata) ? parsed.metadata : {},
    });
  }
  return entries.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}
