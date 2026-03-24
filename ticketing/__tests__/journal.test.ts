import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findEntityByDisplayId } from "#storage/entities.js";
import { openWorkspaceStorage } from "#storage/workspace.js";
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

  it("appends journal entries in chronological order in the canonical ticket record", async () => {
    const store = createTicketStore(workspace);

    vi.setSystemTime(new Date("2024-02-01T00:00:00.000Z"));
    const created = await store.createTicketAsync({ title: "Maintain ordered journal" });
    vi.setSystemTime(new Date("2024-02-01T00:00:01.000Z"));
    await store.addJournalEntryAsync(created.summary.id, "progress", "Investigated issue", { step: 1 });
    vi.setSystemTime(new Date("2024-02-01T00:00:02.000Z"));
    await store.addJournalEntryAsync(created.summary.id, "decision", "Rolled forward fix", { step: 2 });

    const readBack = await createTicketStore(workspace).readTicketAsync(created.summary.id);
    expect(readBack.journal.map((entry) => entry.id)).toEqual([
      "t-0001-journal-0001",
      "t-0001-journal-0002",
      "t-0001-journal-0003",
    ]);
    expect(readBack.journal.map((entry) => entry.kind)).toEqual(["state", "progress", "decision"]);
    expect(readBack.journal.map((entry) => entry.text)).toEqual([
      "Created ticket Maintain ordered journal",
      "Investigated issue",
      "Rolled forward fix",
    ]);
    expect(readBack.journal.map((entry) => entry.metadata)).toEqual([{ action: "create" }, { step: 1 }, { step: 2 }]);

    const { storage, identity } = await openWorkspaceStorage(workspace);
    const entity = await findEntityByDisplayId(storage, identity.space.id, "ticket", created.summary.id);
    expect(entity).toBeTruthy();
    if (!entity) {
      throw new Error("Expected ticket entity to exist");
    }

    expect(entity.attributes).toMatchObject({
      record: {
        journal: [
          {
            id: "t-0001-journal-0001",
            kind: "state",
            text: "Created ticket Maintain ordered journal",
            metadata: { action: "create" },
          },
          { id: "t-0001-journal-0002", kind: "progress", text: "Investigated issue", metadata: { step: 1 } },
          { id: "t-0001-journal-0003", kind: "decision", text: "Rolled forward fix", metadata: { step: 2 } },
        ],
      },
    });
  }, 30000);
});
