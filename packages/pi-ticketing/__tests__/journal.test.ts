import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readJournalEntries } from "../extensions/domain/journal.js";
import { getJournalPath } from "../extensions/domain/paths.js";
import { createTicketStore } from "../extensions/domain/store.js";

describe("ticket journal persistence", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "pi-ticketing-journal-"));
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(workspace, { recursive: true, force: true });
  });

  it("appends journal entries in chronological order", () => {
    const store = createTicketStore(workspace);

    vi.setSystemTime(new Date("2024-02-01T00:00:00.000Z"));
    const created = store.createTicket({ title: "Maintain ordered journal" });
    vi.setSystemTime(new Date("2024-02-01T00:00:01.000Z"));
    store.addJournalEntry(created.ticket.frontmatter.id, "progress", "Investigated issue", { step: 1 });
    vi.setSystemTime(new Date("2024-02-01T00:00:02.000Z"));
    store.addJournalEntry(created.ticket.frontmatter.id, "decision", "Rolled forward fix", { step: 2 });

    const journalPath = getJournalPath(workspace, created.ticket.frontmatter.id);
    expect(existsSync(journalPath)).toBe(true);

    const fileEntries = readFileSync(journalPath, "utf-8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { id: string; kind: string; text: string });
    expect(fileEntries.map((entry) => entry.id)).toEqual([
      "t-0001-journal-0001",
      "t-0001-journal-0002",
      "t-0001-journal-0003",
    ]);
    expect(fileEntries.map((entry) => entry.kind)).toEqual(["state", "progress", "decision"]);
    expect(fileEntries.map((entry) => entry.text)).toEqual([
      "Created ticket Maintain ordered journal",
      "Investigated issue",
      "Rolled forward fix",
    ]);

    const readBack = readJournalEntries(workspace, created.ticket.frontmatter.id);
    expect(readBack.map((entry) => entry.id)).toEqual(fileEntries.map((entry) => entry.id));
    expect(readBack.map((entry) => entry.metadata)).toEqual([{ action: "create" }, { step: 1 }, { step: 2 }]);
  });
});
