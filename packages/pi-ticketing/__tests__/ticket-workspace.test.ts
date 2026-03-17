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
});
