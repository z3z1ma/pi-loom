import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { upsertEntityByDisplayIdWithLifecycleEvents } from "@pi-loom/pi-storage/storage/entities.js";
import { openWorkspaceStorage } from "@pi-loom/pi-storage/storage/workspace.js";
import { describe, expect, it, vi } from "vitest";

const runDocsUpdate = vi.fn(async (cwd: string) => {
  const { createDocumentationStore } = await import("../extensions/domain/store.js");
  await createDocumentationStore(cwd).updateDoc("documentation-memory-system", {
    updateReason: "Persist fresh maintainer revision.",
    summary: "Updated through a fresh subprocess handoff.",
    changedSections: ["Summary", "Fresh Updater"],
    document: [
      "## Summary",
      "The documentation memory layer keeps high-level docs durable after completed changes.",
      "",
      "## Fresh Updater",
      "docs_update compiles a packet and launches a fresh pi process that persists the revision through docs_write.",
    ].join("\n"),
  });
  return {
    command: "pi",
    args: ["--mode", "json"],
    exitCode: 0,
    output: "Fresh documentation maintainer persisted rev-001.",
    stderr: "",
  };
});

vi.mock("@mariozechner/pi-ai", () => ({
  StringEnum: (values: readonly string[]) => ({ type: "string", enum: [...values] }),
}));

vi.mock("../extensions/domain/runtime.js", () => ({
  runDocsUpdate,
}));

vi.mock("@sinclair/typebox", () => ({
  Type: {
    Array: (value: unknown) => ({ type: "array", items: value }),
    Boolean: () => ({ type: "boolean" }),
    Object: (properties: Record<string, unknown>, options?: Record<string, unknown>) => ({
      type: "object",
      properties,
      ...(options ?? {}),
    }),
    Optional: (value: unknown) => ({ ...((value as Record<string, unknown>) ?? {}), optional: true }),
    String: (options?: Record<string, unknown>) => ({ type: "string", ...(options ?? {}) }),
  },
}));

type MockPi = {
  tools: Map<string, ToolDefinition>;
  registerTool: ReturnType<typeof vi.fn>;
};

function createTempWorkspace(): { cwd: string; cleanup: () => void } {
  const cwd = mkdtempSync(join(tmpdir(), "pi-docs-tools-"));
  process.env.PI_LOOM_ROOT = join(cwd, ".pi-loom-test");
  return {
    cwd,
    cleanup: () => {
      delete process.env.PI_LOOM_ROOT;
      rmSync(cwd, { recursive: true, force: true });
    },
  };
}

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
  return { cwd } as ExtensionContext;
}

async function seedCanonicalDocumentationSnapshot(cwd: string): Promise<string> {
  const { storage, identity } = await openWorkspaceStorage(cwd);
  const docId = "documentation-memory-snapshot";
  const updatedAt = "2026-03-17T00:36:40.314Z";

  await upsertEntityByDisplayIdWithLifecycleEvents(
    storage,
    {
      kind: "documentation",
      spaceId: identity.space.id,
      owningRepositoryId: identity.repository.id,
      displayId: docId,
      title: "Documentation memory snapshot",
      summary: "Canonical docs are stored in snapshot form.",
      status: "active",
      version: 1,
      tags: ["overview", "documentation-memory"],
      attributes: {
        snapshot: {
          state: {
            docId,
            title: "Documentation memory snapshot",
            status: "active",
            docType: "overview",
            sectionGroup: "overviews",
            createdAt: "2026-03-17T00:36:38.511Z",
            updatedAt,
            summary: "Canonical docs are stored in snapshot form.",
            audience: ["ai", "human"],
            scopePaths: ["packages/pi-docs"],
            contextRefs: {
              roadmapItemIds: [],
              initiativeIds: [],
              researchIds: [],
              specChangeIds: [],
              ticketIds: [],
              critiqueIds: [],
            },
            sourceTarget: { kind: "workspace", ref: "repo" },
            updateReason: "Persist canonical documentation snapshots.",
            guideTopics: ["documentation-memory"],
            linkedOutputPaths: ["docs/loom.md"],
            lastRevisionId: "rev-001",
          },
          revisions: [
            {
              id: "rev-001",
              docId,
              createdAt: updatedAt,
              reason: "Initial canonical persistence.",
              summary: "Canonical docs are stored in snapshot form.",
              sourceTarget: { kind: "workspace", ref: "repo" },
              packetHash: "abc123",
              changedSections: ["Summary", "Fresh Updater"],
              linkedContextRefs: {
                roadmapItemIds: [],
                initiativeIds: [],
                researchIds: [],
                specChangeIds: [],
                ticketIds: [],
                critiqueIds: [],
              },
            },
          ],
          documentBody: [
            "## Summary",
            "Canonical docs are persisted in normalized snapshots.",
            "",
            "## Fresh Updater",
            "docs_update reads the current document and revision history from snapshot storage.",
          ].join("\n"),
        },
      },
      createdAt: "2026-03-17T00:36:38.511Z",
      updatedAt,
    },
    {
      actor: "test",
      createdPayload: { change: "seeded_documentation_snapshot" },
      updatedPayload: { change: "seeded_documentation_snapshot" },
    },
  );

  return docId;
}

describe("docs tools", () => {
  it("registers tool definitions with prompt snippets and guidelines", async () => {
    const mockPi = createMockPi();
    const { registerDocsTools } = await import("../extensions/tools/docs.js");
    registerDocsTools(mockPi as unknown as ExtensionAPI);

    expect([...mockPi.tools.keys()].sort()).toEqual([
      "docs_dashboard",
      "docs_list",
      "docs_packet",
      "docs_read",
      "docs_update",
      "docs_write",
    ]);

    for (const tool of mockPi.tools.values()) {
      expect(tool.promptSnippet).toEqual(expect.any(String));
      expect(tool.promptSnippet?.length).toBeGreaterThan(20);
      expect(tool.promptGuidelines).toEqual(expect.arrayContaining([expect.any(String)]));
    }

    expect(getTool(mockPi, "docs_update").promptSnippet).toContain("fresh process");
    expect(getTool(mockPi, "docs_list").promptSnippet).toContain("substantial durable explanations");
    expect(getTool(mockPi, "docs_write").promptGuidelines).toContain(
      "Use update with document content after completed work changes system understanding; write self-contained, high-context explanation rather than API reference snippets or shallow summaries.",
    );
    expect(getTool(mockPi, "docs_read").promptSnippet).toContain("existing context, rationale, and boundaries");
  });

  it("returns machine-usable shapes for create, read, packet, update, dashboard, and list flows", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const mockPi = createMockPi();
      const { registerDocsTools } = await import("../extensions/tools/docs.js");
      registerDocsTools(mockPi as unknown as ExtensionAPI);
      const ctx = createContext(cwd);

      const docsWrite = getTool(mockPi, "docs_write");
      const docsRead = getTool(mockPi, "docs_read");
      const docsPacket = getTool(mockPi, "docs_packet");
      const docsUpdate = getTool(mockPi, "docs_update");
      const docsDashboard = getTool(mockPi, "docs_dashboard");
      const docsList = getTool(mockPi, "docs_list");

      const created = await docsWrite.execute(
        "call-1",
        {
          action: "create",
          title: "Documentation memory system",
          docType: "overview",
          summary: "Explain the durable documentation layer.",
          audience: ["ai", "human"],
          sourceTarget: { kind: "workspace", ref: "repo" },
          scopePaths: ["packages/pi-docs"],
          guideTopics: ["documentation-memory"],
          linkedOutputPaths: ["docs/loom.md"],
          updateReason: "Capture the final Loom memory layer.",
        },
        undefined,
        undefined,
        ctx,
      );
      expect(created.details).toMatchObject({
        action: "create",
        documentation: {
          summary: { id: "documentation-memory-system", docType: "overview" },
        },
      });

      const packet = await docsPacket.execute(
        "call-2",
        { ref: "documentation-memory-system" },
        undefined,
        undefined,
        ctx,
      );
      expect(packet.details).toMatchObject({
        documentation: { id: "documentation-memory-system" },
      });
      expect(packet.content[0]).toMatchObject({ type: "text" });
      if (packet.content[0]?.type !== "text") {
        throw new Error("Expected packet text content");
      }
      expect(packet.content[0].text).toContain("Documentation Boundaries");

      const read = await docsRead.execute(
        "call-3",
        { ref: "documentation-memory-system", mode: "document" },
        undefined,
        undefined,
        ctx,
      );
      expect(read.details).toMatchObject({
        documentation: { id: "documentation-memory-system" },
      });

      const updated = await docsUpdate.execute(
        "call-4",
        { ref: "documentation-memory-system", updateReason: "Persist fresh maintainer revision." },
        undefined,
        undefined,
        ctx,
      );
      expect(updated.details).toMatchObject({
        documentation: {
          state: { lastRevisionId: "rev-002" },
          revisions: [expect.objectContaining({ id: "rev-001" }), expect.objectContaining({ id: "rev-002" })],
        },
        execution: { command: "pi", exitCode: 0 },
      });
      expect(runDocsUpdate).toHaveBeenCalledTimes(1);
      expect(updated.content).toEqual([{ type: "text", text: "Fresh documentation maintainer persisted rev-001." }]);

      const dashboard = await docsDashboard.execute(
        "call-5",
        { ref: "documentation-memory-system" },
        undefined,
        undefined,
        ctx,
      );
      expect(dashboard.details).toMatchObject({
        dashboard: {
          doc: { id: "documentation-memory-system" },
          revisionCount: 2,
          lastRevision: { id: "rev-002" },
        },
      });

      const listed = await docsList.execute("call-6", { docType: "overview" }, undefined, undefined, ctx);
      expect(listed.details).toMatchObject({
        docs: [expect.objectContaining({ id: "documentation-memory-system", revisionCount: 2 })],
      });
    } finally {
      cleanup();
    }
  }, 15000);

  it("reads and lists canonical snapshot documentation through AI-facing tools", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const mockPi = createMockPi();
      const { registerDocsTools } = await import("../extensions/tools/docs.js");
      registerDocsTools(mockPi as unknown as ExtensionAPI);
      const ctx = createContext(cwd);
      const docId = await seedCanonicalDocumentationSnapshot(cwd);

      const docsRead = getTool(mockPi, "docs_read");
      const docsList = getTool(mockPi, "docs_list");

      const read = await docsRead.execute(
        "call-read-document",
        { ref: docId, mode: "document" },
        undefined,
        undefined,
        ctx,
      );
      expect(read.details).toMatchObject({
        documentation: { id: docId, ref: `documentation:${docId}`, revisionCount: 1 },
      });
      expect(read.content).toEqual([
        {
          type: "text",
          text: expect.stringContaining("Canonical docs are persisted in normalized snapshots."),
        },
      ]);

      const listed = await docsList.execute(
        "call-list-documentation",
        { topic: "documentation-memory" },
        undefined,
        undefined,
        ctx,
      );
      expect(listed.details).toMatchObject({
        docs: [expect.objectContaining({ id: docId, ref: `documentation:${docId}`, revisionCount: 1 })],
      });
    } finally {
      cleanup();
    }
  });
});
