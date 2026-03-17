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
const OVERLAY_MAX_HEIGHT = 28;

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
      expect(rendered).toContain("🕒 Recent timeline");
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
});
