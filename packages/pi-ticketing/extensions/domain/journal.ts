import type { JournalEntry, JournalKind } from "./models.js";

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
