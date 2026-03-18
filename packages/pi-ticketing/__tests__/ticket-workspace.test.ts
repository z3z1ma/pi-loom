import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionCommandContext, Theme } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { createTicketStore, type TicketStore } from "../extensions/domain/store.js";
import {
  loadTicketWorkspaceSnapshot,
  openInteractiveTicketWorkspace,
  type TicketWorkspaceAction,
  type TicketWorkspaceSnapshot,
} from "../extensions/ui/ticket-workspace.js";

interface FakeCustomComponent {
  render(width: number): string[];
  handleInput(data: string): void;
}

type FakeCustomFactory = (
  tui: { requestRender: () => void },
  theme: Theme,
  keybindings: unknown,
  done: (result: TicketWorkspaceAction | null) => void,
) => FakeCustomComponent;

const OVERLAY_WIDTH = 96;
const OVERLAY_MAX_HEIGHT = 40;

function createTempWorkspace(): { cwd: string; cleanup: () => void } {
  const cwd = mkdtempSync(join(tmpdir(), "pi-ticketing-workbench-"));
  return {
    cwd,
    cleanup: () => rmSync(cwd, { recursive: true, force: true }),
  };
}

function createTheme(): Theme {
  return {
    fg: (_color: string, text: string) => text,
    bg: (_color: string, text: string) => text,
    bold: (text: string) => text,
  } as unknown as Theme;
}

function createInteractiveContext(cwd: string, custom: ReturnType<typeof vi.fn>): ExtensionCommandContext {
  return {
    cwd,
    hasUI: true,
    ui: {
      custom,
    },
  } as unknown as ExtensionCommandContext;
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("ticket overlay workbench", () => {
  it("supports h and l for tab travel", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const store = createTicketStore(cwd);
      await store.createTicketAsync({ title: "Vim tab travel" });
      const snapshot = await loadTicketWorkspaceSnapshot(store, { kind: "home" });
      let rendered = "";

      const custom = vi.fn(async (factory: FakeCustomFactory) => {
        const component = factory({ requestRender: () => {} }, createTheme(), {}, () => undefined);
        component.handleInput("l");
        component.handleInput("h");
        rendered = component.render(OVERLAY_WIDTH).join("\n");
        return null;
      });

      await openInteractiveTicketWorkspace(createInteractiveContext(cwd, custom), store, snapshot);
      expect(rendered).toContain("✨ Overview");
    } finally {
      cleanup();
    }
  });

  it("closes cleanly on Escape and keeps the rendered shell bounded", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const store = createTicketStore(cwd);
      for (let index = 0; index < 12; index += 1) {
        await store.createTicketAsync({ title: `Ticket ${index + 1}` });
      }
      const snapshot = await loadTicketWorkspaceSnapshot(store, { kind: "list" });
      let lineCount = 0;

      const custom = vi.fn(async (factory: FakeCustomFactory) => {
        return await new Promise<TicketWorkspaceAction | null>((resolve) => {
          const component = factory({ requestRender: () => {} }, createTheme(), {}, resolve);
          lineCount = component.render(OVERLAY_WIDTH).length;
          component.handleInput("\u001b");
        });
      });

      const action = await openInteractiveTicketWorkspace(createInteractiveContext(cwd, custom), store, snapshot);
      expect(action).toBeNull();
      expect(lineCount).toBeLessThanOrEqual(OVERLAY_MAX_HEIGHT);
    } finally {
      cleanup();
    }
  });

  it("keeps the detail tab bounded within the fixed overlay height", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const store = createTicketStore(cwd);
      const created = await store.createTicketAsync({
        title: "Deep detail",
        summary: Array.from({ length: 24 }, (_, index) => `Summary line ${index + 1}`).join("\n"),
      });
      const snapshot = await loadTicketWorkspaceSnapshot(store, { kind: "detail", ref: created.summary.id });
      let lineCount = 0;

      const custom = vi.fn(async (factory: FakeCustomFactory) => {
        const component = factory({ requestRender: () => {} }, createTheme(), {}, () => undefined);
        await settle();
        lineCount = component.render(OVERLAY_WIDTH).length;
        return null;
      });

      await openInteractiveTicketWorkspace(createInteractiveContext(cwd, custom), store, snapshot);
      expect(lineCount).toBeLessThanOrEqual(OVERLAY_MAX_HEIGHT);
    } finally {
      cleanup();
    }
  });

  it("keeps detail render lines newline-free while scrolling multiline sections", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const store = createTicketStore(cwd);
      const created = await store.createTicketAsync({
        title: "Multiline detail",
        summary: Array.from({ length: 8 }, (_, index) => `Summary line ${index + 1}`).join("\n"),
        plan: Array.from({ length: 8 }, (_, index) => `Plan line ${index + 1}`).join("\n"),
        notes: Array.from({ length: 8 }, (_, index) => `Notes line ${index + 1}`).join("\n"),
      });
      const snapshot = await loadTicketWorkspaceSnapshot(store, { kind: "detail", ref: created.summary.id });
      let firstRender: string[] = [];
      let secondRender: string[] = [];

      const custom = vi.fn(async (factory: FakeCustomFactory) => {
        const component = factory({ requestRender: () => {} }, createTheme(), {}, () => undefined);
        await settle();
        firstRender = component.render(OVERLAY_WIDTH);
        component.handleInput("\u001b[B");
        component.handleInput("\u001b[B");
        component.handleInput("\u001b[B");
        secondRender = component.render(OVERLAY_WIDTH);
        return null;
      });

      await openInteractiveTicketWorkspace(createInteractiveContext(cwd, custom), store, snapshot);
      expect(firstRender.length).toBeLessThanOrEqual(OVERLAY_MAX_HEIGHT);
      expect(secondRender.length).toBeLessThanOrEqual(OVERLAY_MAX_HEIGHT);
      expect(firstRender.every((line) => !line.includes("\n"))).toBe(true);
      expect(secondRender.every((line) => !line.includes("\n"))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("clamps detail scrolling at the maximum visible range", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const store = createTicketStore(cwd);
      const created = await store.createTicketAsync({
        title: "Clamp detail",
        summary: Array.from({ length: 18 }, (_, index) => `Summary line ${index + 1}`).join("\n"),
        plan: Array.from({ length: 18 }, (_, index) => `Plan line ${index + 1}`).join("\n"),
      });
      const snapshot = await loadTicketWorkspaceSnapshot(store, { kind: "detail", ref: created.summary.id });
      let renderedAfterManyDown = "";
      let renderedAfterMoreDown = "";

      const custom = vi.fn(async (factory: FakeCustomFactory) => {
        const component = factory({ requestRender: () => {} }, createTheme(), {}, () => undefined);
        await settle();
        void component.render(OVERLAY_WIDTH);
        for (let index = 0; index < 200; index += 1) {
          component.handleInput("\u001b[B");
        }
        renderedAfterManyDown = component.render(OVERLAY_WIDTH).join("\n");
        for (let index = 0; index < 40; index += 1) {
          component.handleInput("\u001b[B");
        }
        renderedAfterMoreDown = component.render(OVERLAY_WIDTH).join("\n");
        return null;
      });

      await openInteractiveTicketWorkspace(createInteractiveContext(cwd, custom), store, snapshot);
      expect(renderedAfterManyDown).toContain("… ");
      expect(renderedAfterMoreDown).toBe(renderedAfterManyDown);
    } finally {
      cleanup();
    }
  });

  it("changes the visible detail content when scrolling within range", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const store = createTicketStore(cwd);
      const created = await store.createTicketAsync({
        title: "Scrollable detail",
        summary: Array.from({ length: 24 }, (_, index) => `Summary line ${index + 1}`).join("\n"),
        plan: Array.from({ length: 24 }, (_, index) => `Plan line ${index + 1}`).join("\n"),
        notes: Array.from({ length: 24 }, (_, index) => `Notes line ${index + 1}`).join("\n"),
      });
      const snapshot = await loadTicketWorkspaceSnapshot(store, { kind: "detail", ref: created.summary.id });
      let firstRender = "";
      let secondRender = "";

      const custom = vi.fn(async (factory: FakeCustomFactory) => {
        const component = factory({ requestRender: () => {} }, createTheme(), {}, () => undefined);
        await settle();
        firstRender = component.render(OVERLAY_WIDTH).join("\n");
        component.handleInput("\u001b[B");
        secondRender = component.render(OVERLAY_WIDTH).join("\n");
        return null;
      });

      await openInteractiveTicketWorkspace(createInteractiveContext(cwd, custom), store, snapshot);
      expect(firstRender).not.toBe(secondRender);
    } finally {
      cleanup();
    }
  });

  it("keeps narrow list layouts within the overlay height budget", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const store = createTicketStore(cwd);
      for (let index = 0; index < 10; index += 1) {
        await store.createTicketAsync({ title: `Narrow ${index + 1}` });
      }
      const snapshot = await loadTicketWorkspaceSnapshot(store, { kind: "list" });
      let lineCount = 0;

      const custom = vi.fn(async (factory: FakeCustomFactory) => {
        const component = factory({ requestRender: () => {} }, createTheme(), {}, () => undefined);
        await settle();
        lineCount = component.render(80).length;
        return null;
      });

      await openInteractiveTicketWorkspace(createInteractiveContext(cwd, custom), store, snapshot);
      expect(lineCount).toBeLessThanOrEqual(OVERLAY_MAX_HEIGHT);
    } finally {
      cleanup();
    }
  });

  it("keeps narrow overview layouts within the overlay height budget", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const store = createTicketStore(cwd);
      for (let index = 0; index < 10; index += 1) {
        await store.createTicketAsync({ title: `Overview ${index + 1}` });
      }
      const snapshot = await loadTicketWorkspaceSnapshot(store, { kind: "home" });
      let lineCount = 0;

      const custom = vi.fn(async (factory: FakeCustomFactory) => {
        const component = factory({ requestRender: () => {} }, createTheme(), {}, () => undefined);
        await settle();
        lineCount = component.render(80).length;
        return null;
      });

      await openInteractiveTicketWorkspace(createInteractiveContext(cwd, custom), store, snapshot);
      expect(lineCount).toBeLessThanOrEqual(OVERLAY_MAX_HEIGHT);
    } finally {
      cleanup();
    }
  });

  it("lets overview selection scroll deeper ready items into view", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const store = createTicketStore(cwd);
      let targetId = "";
      for (let index = 0; index < 4; index += 1) {
        const created = await store.createTicketAsync({ title: `Overview ready ${index + 1}` });
        if (index === 3) {
          targetId = created.summary.id;
        }
      }
      const snapshot = await loadTicketWorkspaceSnapshot(store, { kind: "home" });
      let rendered = "";

      const custom = vi.fn(async (factory: FakeCustomFactory) => {
        const component = factory({ requestRender: () => {} }, createTheme(), {}, () => undefined);
        component.handleInput("\u001b[B");
        component.handleInput("\u001b[B");
        component.handleInput("\u001b[B");
        rendered = component.render(OVERLAY_WIDTH).join("\n");
        return null;
      });

      await openInteractiveTicketWorkspace(createInteractiveContext(cwd, custom), store, snapshot);
      expect(rendered).toContain(targetId);
      expect(rendered).toContain("Overview ready 4");
    } finally {
      cleanup();
    }
  });

  it("returns to the prior tab when Esc is pressed after tabbing into detail", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const store = createTicketStore(cwd);
      await store.createTicketAsync({ title: "Back target" });
      const snapshot = await loadTicketWorkspaceSnapshot(store, { kind: "list" });
      let rendered = "";

      const custom = vi.fn(async (factory: FakeCustomFactory) => {
        const component = factory({ requestRender: () => {} }, createTheme(), {}, () => undefined);
        component.handleInput("\u001b[C");
        component.handleInput("\u001b[C");
        component.handleInput("\u001b[C");
        component.handleInput("\u001b");
        rendered = component.render(OVERLAY_WIDTH).join("\n");
        return null;
      });

      await openInteractiveTicketWorkspace(createInteractiveContext(cwd, custom), store, snapshot);
      expect(rendered).toContain("Recent timeline");
      expect(rendered).toContain("Esc close");
    } finally {
      cleanup();
    }
  });

  it("preserves the current selection when cycling into the detail tab", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const store = createTicketStore(cwd);
      await store.createTicketAsync({ title: "First ticket" });
      const second = await store.createTicketAsync({ title: "Second ticket" });
      const snapshot = await loadTicketWorkspaceSnapshot(store, { kind: "list" });
      let rendered = "";

      const custom = vi.fn(async (factory: FakeCustomFactory) => {
        const component = factory({ requestRender: () => {} }, createTheme(), {}, () => undefined);
        component.handleInput("\u001b[B");
        component.handleInput("\u001b[C");
        component.handleInput("\u001b[C");
        component.handleInput("\u001b[C");
        await settle();
        rendered = component.render(160).join("\n");
        return null;
      });

      await openInteractiveTicketWorkspace(createInteractiveContext(cwd, custom), store, snapshot);
      expect(rendered).toContain(second.summary.id);
      expect(rendered).toContain("Second ticket");
    } finally {
      cleanup();
    }
  });

  it("falls back to summary detail when a detail load fails", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const store = createTicketStore(cwd);
      const created = await store.createTicketAsync({ title: "Fallback detail" });
      const snapshot: TicketWorkspaceSnapshot = {
        view: { kind: "detail", ref: created.summary.id },
        tickets: await store.listTicketsAsync({ includeClosed: true }),
        graph: await store.graphAsync(),
        detail: null,
      };
      let rendered = "";
      const failingStore = {
        readTicketAsync: vi.fn(async () => {
          throw new Error("unavailable");
        }),
      } as unknown as TicketStore;

      const custom = vi.fn(async (factory: FakeCustomFactory) => {
        const component = factory({ requestRender: () => {} }, createTheme(), {}, () => undefined);
        await settle();
        rendered = component.render(160).join("\n");
        return null;
      });

      await openInteractiveTicketWorkspace(createInteractiveContext(cwd, custom), failingStore, snapshot);
      expect(rendered).toContain(`Detail unavailable for ${created.summary.id}`);
      expect(rendered).toContain("Fallback detail");
    } finally {
      cleanup();
    }
  });

  it("tolerates direct detail snapshot loads that fail before the workbench opens", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const store = createTicketStore(cwd);
      const created = await store.createTicketAsync({ title: "Direct detail fallback" });
      const tickets = await store.listTicketsAsync({ includeClosed: true });
      const graph = await store.graphAsync();
      const failingStore = {
        listTicketsAsync: vi.fn(async () => tickets),
        graphAsync: vi.fn(async () => graph),
        readTicketAsync: vi.fn(async () => {
          throw new Error("unavailable");
        }),
      } as unknown as TicketStore;

      const snapshot = await loadTicketWorkspaceSnapshot(failingStore, { kind: "detail", ref: created.summary.id });
      expect(snapshot.detail).toBeNull();

      let rendered = "";
      const custom = vi.fn(async (factory: FakeCustomFactory) => {
        const component = factory({ requestRender: () => {} }, createTheme(), {}, () => undefined);
        await settle();
        rendered = component.render(OVERLAY_WIDTH).join("\n");
        return null;
      });

      await openInteractiveTicketWorkspace(createInteractiveContext(cwd, custom), failingStore, snapshot);
      expect(rendered).toContain(`Detail unavailable for ${created.summary.id}`);
      expect(rendered).toContain("Direct detail fallback");
    } finally {
      cleanup();
    }
  });

  it("does not open actions for an unresolved direct-detail fallback ref", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const store = createTicketStore(cwd);
      const created = await store.createTicketAsync({ title: "Missing direct detail" });
      const tickets: Awaited<ReturnType<TicketStore["listTicketsAsync"]>> = [];
      const graph = await store.graphAsync();
      const failingStore = {
        listTicketsAsync: vi.fn(async () => tickets),
        graphAsync: vi.fn(async () => graph),
        readTicketAsync: vi.fn(async () => {
          throw new Error("unavailable");
        }),
      } as unknown as TicketStore;

      const snapshot = await loadTicketWorkspaceSnapshot(failingStore, { kind: "detail", ref: created.summary.id });

      const custom = vi.fn(async (factory: FakeCustomFactory) => {
        const component = factory({ requestRender: () => {} }, createTheme(), {}, () => undefined);
        component.handleInput("\r");
        await settle();
        return null;
      });

      const action = await openInteractiveTicketWorkspace(
        createInteractiveContext(cwd, custom),
        failingStore,
        snapshot,
      );
      expect(action).toBeNull();
    } finally {
      cleanup();
    }
  });

  it("offers reopen for a closed ticket even when detail data is unavailable", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const store = createTicketStore(cwd);
      const created = await store.createTicketAsync({ title: "Closed ticket" });
      await store.closeTicketAsync(created.summary.id, "verified");
      const snapshot = await loadTicketWorkspaceSnapshot(store, { kind: "list" });
      const failingStore = {
        readTicketAsync: vi.fn(async () => {
          throw new Error("unavailable");
        }),
      } as unknown as TicketStore;

      const custom = vi.fn(async (factory: FakeCustomFactory) => {
        return await new Promise<TicketWorkspaceAction | null>((resolve) => {
          const component = factory({ requestRender: () => {} }, createTheme(), {}, resolve);
          component.handleInput("a");
          component.handleInput("\u001b[B");
          component.handleInput("\r");
          component.handleInput("\r");
        });
      });

      const action = await openInteractiveTicketWorkspace(
        createInteractiveContext(cwd, custom),
        failingStore,
        snapshot,
      );
      expect(action).toEqual({ kind: "status", ref: created.summary.id, status: "reopen" });
    } finally {
      cleanup();
    }
  });

  it("keeps the highlighted edit field visible when bounded menus scroll", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const store = createTicketStore(cwd);
      const created = await store.createTicketAsync({ title: "Menu scroll" });
      const snapshot = await loadTicketWorkspaceSnapshot(store, { kind: "detail", ref: created.summary.id });
      let rendered = "";

      const custom = vi.fn(async (factory: FakeCustomFactory) => {
        const component = factory({ requestRender: () => {} }, createTheme(), {}, () => undefined);
        component.handleInput("a");
        component.handleInput("\u001b[B");
        component.handleInput("\u001b[B");
        component.handleInput("\u001b[B");
        component.handleInput("\r");
        for (let index = 0; index < 10; index += 1) {
          component.handleInput("\u001b[B");
        }
        rendered = component.render(OVERLAY_WIDTH).join("\n");
        return null;
      });

      await openInteractiveTicketWorkspace(createInteractiveContext(cwd, custom), store, snapshot);
      expect(rendered).toContain("Edit journal summary");
      expect(rendered).toContain("11/12");
    } finally {
      cleanup();
    }
  });

  it("uses the board to focus actionable work instead of listing closed backlog items", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const store = createTicketStore(cwd);
      const ready = await store.createTicketAsync({ title: "Ready board item" });
      const closed = await store.createTicketAsync({ title: "Closed board item" });
      await store.closeTicketAsync(closed.summary.id, "done");
      const snapshot = await loadTicketWorkspaceSnapshot(store, { kind: "board" });
      let rendered = "";

      const custom = vi.fn(async (factory: FakeCustomFactory) => {
        const component = factory({ requestRender: () => {} }, createTheme(), {}, () => undefined);
        rendered = component.render(OVERLAY_WIDTH).join("\n");
        return null;
      });

      await openInteractiveTicketWorkspace(createInteractiveContext(cwd, custom), store, snapshot);
      expect(rendered).toContain("Action board");
      expect(rendered).toContain(ready.summary.id);
      expect(rendered).not.toContain(closed.summary.id);
      expect(rendered).toContain("closed hidden 1");
    } finally {
      cleanup();
    }
  });

  it("renders the timeline as a grouped activity feed", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const store = createTicketStore(cwd);
      await store.createTicketAsync({ title: "Timeline feed item" });
      const snapshot = await loadTicketWorkspaceSnapshot(store, { kind: "timeline" });
      let rendered = "";

      const custom = vi.fn(async (factory: FakeCustomFactory) => {
        const component = factory({ requestRender: () => {} }, createTheme(), {}, () => undefined);
        rendered = component.render(OVERLAY_WIDTH).join("\n");
        return null;
      });

      await openInteractiveTicketWorkspace(createInteractiveContext(cwd, custom), store, snapshot);
      expect(rendered).toContain("Recent timeline");
      expect(rendered).toContain("Grouped by update day");
      expect(rendered).toContain("Today");
      expect(rendered).toContain("Timeline feed item");
    } finally {
      cleanup();
    }
  });

  it("renders interactive detail as curated sections instead of the raw ticket dump", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const store = createTicketStore(cwd);
      const created = await store.createTicketAsync({
        title: "Curated detail",
        summary: "Explain the problem clearly.",
        plan: "Ship the plan.",
        notes: "Track the important note.",
      });
      const snapshot = await loadTicketWorkspaceSnapshot(store, { kind: "detail", ref: created.summary.id });
      let rendered = "";

      const custom = vi.fn(async (factory: FakeCustomFactory) => {
        const component = factory({ requestRender: () => {} }, createTheme(), {}, () => undefined);
        rendered = component.render(OVERLAY_WIDTH).join("\n");
        return null;
      });

      await openInteractiveTicketWorkspace(createInteractiveContext(cwd, custom), store, snapshot);
      expect(rendered).toContain("Summary");
      expect(rendered).toContain("Plan");
      expect(rendered).toContain("Acceptance");
      expect(rendered).not.toContain("Stored status:");
      expect(rendered).not.toContain("Spec capabilities:");
    } finally {
      cleanup();
    }
  });

  it("keeps the selected timeline row visible when moving down through the feed", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const store = createTicketStore(cwd);
      let targetId = "";
      for (let index = 0; index < 8; index += 1) {
        const created = await store.createTicketAsync({ title: `Timeline visible ${index + 1}` });
        if (index === 6) {
          targetId = created.summary.id;
        }
      }
      const snapshot = await loadTicketWorkspaceSnapshot(store, { kind: "timeline" });
      let rendered = "";

      const custom = vi.fn(async (factory: FakeCustomFactory) => {
        const component = factory({ requestRender: () => {} }, createTheme(), {}, () => undefined);
        for (let index = 0; index < 6; index += 1) {
          component.handleInput("\u001b[B");
        }
        rendered = component.render(OVERLAY_WIDTH).join("\n");
        return null;
      });

      await openInteractiveTicketWorkspace(createInteractiveContext(cwd, custom), store, snapshot);
      expect(rendered).toContain(targetId);
      expect(rendered).toContain("Timeline visible 7");
    } finally {
      cleanup();
    }
  });

  it("filters the list tab from slash search and clears back to normal navigation on Escape", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const store = createTicketStore(cwd);
      await store.createTicketAsync({ title: "Alpha task" });
      await store.createTicketAsync({ title: "Beta bug" });
      await store.createTicketAsync({ title: "Gamma chore" });
      const snapshot = await loadTicketWorkspaceSnapshot(store, { kind: "list" });
      let searchRender = "";
      let clearedRender = "";
      let rendered = "";

      const custom = vi.fn(async (factory: FakeCustomFactory) => {
        const component = factory({ requestRender: () => {} }, createTheme(), {}, () => undefined);
        component.handleInput("/");
        component.handleInput("b");
        component.handleInput("e");
        rendered = component.render(OVERLAY_WIDTH).join("\n");
        component.handleInput("\u001b");
        clearedRender = component.render(OVERLAY_WIDTH).join("\n");
        searchRender = rendered;
        return null;
      });

      await openInteractiveTicketWorkspace(createInteractiveContext(cwd, custom), store, snapshot);
      expect(searchRender).toContain("Search: /be");
      expect(searchRender).toContain("Beta bug");
      expect(searchRender).not.toContain("Alpha task");
      expect(clearedRender).toContain("Search: press / to filter the list");
      expect(clearedRender).toContain("Alpha task");
      expect(clearedRender).toContain("Gamma chore");
    } finally {
      cleanup();
    }
  });

  it("renders a stable empty state when list search finds no matches", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const store = createTicketStore(cwd);
      await store.createTicketAsync({ title: "Alpha task" });
      const snapshot = await loadTicketWorkspaceSnapshot(store, { kind: "list" });
      let rendered = "";

      const custom = vi.fn(async (factory: FakeCustomFactory) => {
        const component = factory({ requestRender: () => {} }, createTheme(), {}, () => undefined);
        component.handleInput("/");
        component.handleInput("z");
        component.handleInput("z");
        rendered = component.render(OVERLAY_WIDTH).join("\n");
        component.handleInput("\r");
        return null;
      });

      await openInteractiveTicketWorkspace(createInteractiveContext(cwd, custom), store, snapshot);
      expect(rendered).toContain("No tickets match /zz");
      expect(rendered).toContain("Press Esc to clear search.");
    } finally {
      cleanup();
    }
  });

  it("offers an archive action and excludes archived tickets from refreshed default snapshots", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const store = createTicketStore(cwd);
      const archived = await store.createTicketAsync({ title: "Archive me" });
      await store.closeTicketAsync(archived.summary.id, "done");
      await store.createTicketAsync({ title: "Keep me" });
      const snapshot = await loadTicketWorkspaceSnapshot(store, { kind: "list" });

      const custom = vi.fn(async (factory: FakeCustomFactory) => {
        return await new Promise<TicketWorkspaceAction | null>((resolve) => {
          const component = factory({ requestRender: () => {} }, createTheme(), {}, resolve);
          component.handleInput("a");
          component.handleInput("\u001b[B");
          component.handleInput("\u001b[B");
          component.handleInput("\u001b[B");
          component.handleInput("\r");
        });
      });

      const action = await openInteractiveTicketWorkspace(createInteractiveContext(cwd, custom), store, snapshot);
      expect(action).toEqual({ kind: "archive", ref: archived.summary.id, nextView: { kind: "list" } });

      await store.archiveTicketAsync(archived.summary.id);
      const refreshed = await loadTicketWorkspaceSnapshot(store, { kind: "list" });
      expect(refreshed.tickets.map((ticket) => ticket.id)).toEqual(["t-0002"]);
    } finally {
      cleanup();
    }
  });

  it("offers a delete action for archived tickets", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const store = createTicketStore(cwd);
      const archived = await store.createTicketAsync({ title: "Delete me" });
      await store.closeTicketAsync(archived.summary.id, "done");
      await store.archiveTicketAsync(archived.summary.id);
      const snapshot = await loadTicketWorkspaceSnapshot(store, { kind: "detail", ref: archived.summary.id });
      snapshot.tickets = [archived.summary];

      const custom = vi.fn(async (factory: FakeCustomFactory) => {
        return await new Promise<TicketWorkspaceAction | null>((resolve) => {
          const component = factory({ requestRender: () => {} }, createTheme(), {}, resolve);
          component.handleInput("a");
          component.handleInput("\u001b[B");
          component.handleInput("\u001b[B");
          component.handleInput("\r");
        });
      });

      const action = await openInteractiveTicketWorkspace(createInteractiveContext(cwd, custom), store, snapshot);
      expect(action).toEqual({ kind: "delete", ref: archived.summary.id, nextView: { kind: "list" } });
    } finally {
      cleanup();
    }
  });
});
