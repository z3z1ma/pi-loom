import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSpecStore } from "#specs/domain/store.js";
import { createSeededGitWorkspace } from "#storage/__tests__/helpers/git-fixture.js";
import { readProjectionManifest, resolveProjectionFilePath } from "#storage/projections.js";
import { createTicketStore } from "#ticketing/domain/store.js";

vi.mock("@mariozechner/pi-ai", () => ({
  StringEnum: (values: readonly string[]) => ({ type: "string", enum: [...values] }),
}));

vi.mock("@sinclair/typebox", () => ({
  Type: {
    Array: (value: unknown) => ({ type: "array", items: value }),
    Object: (properties: Record<string, unknown>, options?: Record<string, unknown>) => ({
      type: "object",
      properties,
      ...(options ?? {}),
    }),
    Optional: (value: unknown) => ({ ...((value as Record<string, unknown>) ?? {}), optional: true }),
    String: (options?: Record<string, unknown>) => ({ type: "string", ...(options ?? {}) }),
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
});

type MockPi = {
  tools: Map<string, ToolDefinition>;
  registerTool: ReturnType<typeof vi.fn>;
};

function createMockPi(): MockPi {
  const tools = new Map<string, ToolDefinition>();
  return {
    tools,
    registerTool: vi.fn((definition: ToolDefinition) => {
      tools.set(definition.name, definition);
    }),
  };
}

function getTool(mockPi: MockPi, name: string): ToolDefinition {
  const tool = mockPi.tools.get(name);
  expect(tool).toBeDefined();
  if (!tool) {
    throw new Error(`Missing tool ${name}`);
  }
  return tool;
}

function createContext(cwd: string): ExtensionContext {
  return {
    cwd,
    hasUI: false,
    ui: {
      setStatus: vi.fn(),
    },
  } as unknown as ExtensionContext;
}

function firstText(content: Array<{ type: string; text?: string }>): string {
  return content.find((entry) => entry.type === "text")?.text ?? "";
}

describe("bidi projection tools", () => {
  it("registers projection tool definitions independently of ticketing", async () => {
    const mockPi = createMockPi();
    const { registerProjectionTools } = await import("../tools/projections.js");

    registerProjectionTools(mockPi as unknown as ExtensionAPI);

    expect([...mockPi.tools.keys()].sort()).toEqual(["projection_status", "projection_write"]);
  });

  it("reports status and fail-closed reconcile behavior for spec files", async () => {
    const seeded = createSeededGitWorkspace({
      prefix: "pi-bidi-tools-",
      packageName: "pi-bidi-tools",
      remoteUrl: "https://github.com/example/pi-loom.git",
    });
    try {
      process.env.PI_LOOM_ROOT = join(seeded.cwd, ".pi-loom-bidi-tools");
      const mockPi = createMockPi();
      const { registerProjectionTools } = await import("../tools/projections.js");
      registerProjectionTools(mockPi as unknown as ExtensionAPI);

      const ctx = createContext(seeded.cwd);
      const projectionStatus = getTool(mockPi, "projection_status");
      const projectionWrite = getTool(mockPi, "projection_write");
      const specStore = createSpecStore(seeded.cwd);

      const created = await specStore.createChange({
        title: "Workspace projections",
        summary: "Expose readable projections.",
      });
      await specStore.recordClarification(created.state.changeId, "Should generated sections stay read-only?", "Yes.");
      await specStore.updatePlan(created.state.changeId, {
        designNotes: "Render proposal and design surfaces through the shared substrate.",
        capabilities: [
          {
            title: "Projection export",
            summary: "Write deterministic markdown projections.",
            requirements: ["Export proposal and design content"],
            acceptance: ["Re-export without edits is byte stable."],
            scenarios: ["Operator reviews a mutable spec from .loom/specs."],
          },
        ],
      });

      await projectionWrite.execute("call-export", { action: "export", family: "specs" }, undefined, undefined, ctx);
      const proposalPath = resolveProjectionFilePath(seeded.cwd, "specs", "workspace-projections/proposal.md");

      const cleanStatus = await projectionStatus.execute(
        "call-status-clean",
        { family: "specs", relativePaths: ["workspace-projections/proposal.md"] },
        undefined,
        undefined,
        ctx,
      );
      expect(firstText(cleanStatus.content)).toContain("specs: clean=1 modified=0 missing=0");

      writeFileSync(
        proposalPath,
        readFileSync(proposalPath, "utf-8").replace(
          "Expose readable projections.",
          "Expose readable projections through a dedicated sync extension.",
        ),
        "utf-8",
      );

      const dirtyStatus = await projectionStatus.execute(
        "call-status-dirty",
        { family: "specs", relativePaths: ["workspace-projections/proposal.md"] },
        undefined,
        undefined,
        ctx,
      );
      expect(firstText(dirtyStatus.content)).toContain("[modified/sections]");

      writeFileSync(
        proposalPath,
        readFileSync(proposalPath, "utf-8").replace(
          "- req-001: Export proposal and design content",
          "- req-001: Mutate generated requirements",
        ),
        "utf-8",
      );
      await expect(
        projectionWrite.execute(
          "call-protected",
          { action: "reconcile", family: "specs", relativePaths: ["workspace-projections/proposal.md"] },
          undefined,
          undefined,
          ctx,
        ),
      ).rejects.toThrow("generated section Requirements");

      await projectionWrite.execute(
        "call-refresh",
        { action: "refresh", family: "specs" },
        undefined,
        undefined,
        ctx,
      );
      writeFileSync(
        proposalPath,
        readFileSync(proposalPath, "utf-8").replace(
          "Expose readable projections.",
          "Stale local edit",
        ),
        "utf-8",
      );
      await specStore.updateProjectionNarrative("workspace-projections", {
        proposalSummary: "Canonical advanced beyond the exported revision.",
      });
      await expect(
        projectionWrite.execute(
          "call-stale",
          { action: "reconcile", family: "specs", relativePaths: ["workspace-projections/proposal.md"] },
          undefined,
          undefined,
          ctx,
        ),
      ).rejects.toThrow("stale");
    } finally {
      delete process.env.PI_LOOM_ROOT;
      seeded.cleanup();
    }
  }, 30000);

  it("reconciles ticket files without dropping append-only ticket history", async () => {
    const seeded = createSeededGitWorkspace({
      prefix: "pi-bidi-ticket-tools-",
      packageName: "pi-bidi-ticket-tools",
      remoteUrl: "https://github.com/example/pi-loom.git",
    });
    try {
      process.env.PI_LOOM_ROOT = join(seeded.cwd, ".pi-loom-bidi-ticket-tools");
      const mockPi = createMockPi();
      const { registerProjectionTools } = await import("../tools/projections.js");
      registerProjectionTools(mockPi as unknown as ExtensionAPI);

      const ctx = createContext(seeded.cwd);
      const projectionWrite = getTool(mockPi, "projection_write");
      const ticketStore = createTicketStore(seeded.cwd);
      const ticket = await ticketStore.createTicketAsync({ title: "Projection reconcile ticket", summary: "Before" });
      await ticketStore.attachArtifactAsync(ticket.summary.id, { label: "capture", content: "retain me" });
      await ticketStore.addJournalEntryAsync(ticket.summary.id, "note", "Keep the append-only history.");

      await projectionWrite.execute("call-ticket-export", { action: "export", family: "tickets" }, undefined, undefined, ctx);
      const projectionPath = resolveProjectionFilePath(seeded.cwd, "tickets", `${ticket.summary.id}.md`);
      writeFileSync(
        projectionPath,
        readFileSync(projectionPath, "utf-8").replace("## Summary\nBefore", "## Summary\nAfter"),
        "utf-8",
      );

      const reconcile = await projectionWrite.execute(
        "call-ticket-reconcile",
        { action: "reconcile", family: "tickets", relativePaths: [`${ticket.summary.id}.md`] },
        undefined,
        undefined,
        ctx,
      );
      expect(firstText(reconcile.content)).toContain("Loom reconcile");
      expect(readProjectionManifest(resolveProjectionFilePath(seeded.cwd, "tickets", "manifest.json"))?.entries).toEqual([
        expect.objectContaining({ canonicalRef: `ticket:${ticket.summary.id}` }),
      ]);

      const reread = await ticketStore.readTicketAsync(ticket.summary.id);
      expect(reread.ticket.body.summary).toBe("After");
      expect(reread.attachments).toEqual([expect.objectContaining({ label: "capture" })]);
      expect(reread.journal).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "attachment", text: "Attached capture" }),
          expect.objectContaining({ kind: "note", text: "Keep the append-only history." }),
        ]),
      );
    } finally {
      delete process.env.PI_LOOM_ROOT;
      seeded.cleanup();
    }
  }, 30000);
});
