import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@mariozechner/pi-coding-agent";
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
  return {
    cwd,
    cleanup: () => rmSync(cwd, { recursive: true, force: true }),
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
          state: { lastRevisionId: "rev-001" },
          revisions: [expect.objectContaining({ id: "rev-001" })],
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
          revisionCount: 1,
          lastRevision: { id: "rev-001" },
        },
      });

      const listed = await docsList.execute("call-6", { docType: "overview" }, undefined, undefined, ctx);
      expect(listed.details).toMatchObject({
        docs: [expect.objectContaining({ id: "documentation-memory-system", revisionCount: 1 })],
      });
    } finally {
      cleanup();
    }
  }, 15000);

  it("rehydrates filesystem-imported docs for canonical list and read flows", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      process.env.PI_LOOM_ROOT = join(cwd, ".pi-loom-test");
      const mockPi = createMockPi();
      const { registerDocsTools } = await import("../extensions/tools/docs.js");
      registerDocsTools(mockPi as unknown as ExtensionAPI);
      const ctx = createContext(cwd);

      const docsWrite = getTool(mockPi, "docs_write");
      const docsRead = getTool(mockPi, "docs_read");
      const docsList = getTool(mockPi, "docs_list");

      await docsWrite.execute(
        "call-1",
        {
          action: "create",
          title: "Filesystem imported doc",
          docType: "overview",
          summary: "Repair imported documentation entities from SQLite snapshots.",
          audience: ["ai"],
          scopePaths: ["packages/pi-docs"],
          contextRefs: { critiqueIds: ["missing-critique"] },
          sourceTarget: { kind: "workspace", ref: "repo" },
          updateReason: "Create a canonical repair fixture.",
          document: [
            "## Summary",
            "Canonical docs should repair imported entities without rereading projection files.",
            "",
            "## Boundaries",
            "Missing linked critiques should stay truthful and non-crashing.",
          ].join("\n"),
        },
        undefined,
        undefined,
        ctx,
      );
      await docsWrite.execute(
        "call-2",
        {
          action: "update",
          ref: "filesystem-imported-doc",
          updateReason: "Record a durable revision before import repair.",
          changedSections: ["Summary"],
          document: [
            "## Summary",
            "Canonical docs should repair imported entities from SQLite snapshots.",
            "",
            "## Boundaries",
            "Missing linked critiques should stay truthful and non-crashing.",
          ].join("\n"),
        },
        undefined,
        undefined,
        ctx,
      );
      await docsWrite.execute(
        "call-3",
        {
          action: "create",
          title: "Still structured doc",
          docType: "overview",
          summary: "Keep a mixed canonical list.",
          audience: ["human"],
          sourceTarget: { kind: "workspace", ref: "repo" },
        },
        undefined,
        undefined,
        ctx,
      );

      const [{ findEntityByDisplayId, upsertEntityByDisplayId }, { openWorkspaceStorage }] = await Promise.all([
        import("../../pi-storage/storage/entities.js"),
        import("../../pi-storage/storage/workspace.js"),
      ]);
      const { storage, identity } = await openWorkspaceStorage(cwd);
      const entity = await findEntityByDisplayId(
        storage,
        identity.space.id,
        "documentation",
        "filesystem-imported-doc",
      );
      expect(entity).toBeTruthy();
      if (!entity) {
        throw new Error("Expected documentation entity to exist");
      }

      const docRoot = ".loom/docs/overviews/filesystem-imported-doc";
      const docDir = join(cwd, docRoot);
      await upsertEntityByDisplayId(storage, {
        kind: entity.kind,
        spaceId: entity.spaceId,
        owningRepositoryId: entity.owningRepositoryId,
        displayId: entity.displayId,
        title: entity.title,
        summary: entity.summary,
        status: entity.status,
        version: entity.version + 1,
        tags: entity.tags,
        pathScopes: entity.pathScopes,
        attributes: {
          importedFrom: "filesystem",
          filesByPath: {
            [`${docRoot}/state.json`]: readFileSync(join(docDir, "state.json"), "utf-8"),
            [`${docRoot}/doc.md`]: readFileSync(join(docDir, "doc.md"), "utf-8"),
            [`${docRoot}/packet.md`]: readFileSync(join(docDir, "packet.md"), "utf-8"),
            [`${docRoot}/revisions.jsonl`]: readFileSync(join(docDir, "revisions.jsonl"), "utf-8"),
          },
        },
        createdAt: entity.createdAt,
        updatedAt: new Date().toISOString(),
      });
      rmSync(docDir, { recursive: true, force: true });

      const listed = await docsList.execute("call-4", { docType: "overview" }, undefined, undefined, ctx);
      expect(listed.details).toMatchObject({
        docs: expect.arrayContaining([
          expect.objectContaining({ id: "filesystem-imported-doc", revisionCount: 1 }),
          expect.objectContaining({ id: "still-structured-doc" }),
        ]),
      });

      const read = await docsRead.execute("call-5", { ref: "filesystem-imported-doc" }, undefined, undefined, ctx);
      expect(read.details).toMatchObject({
        documentation: {
          summary: { id: "filesystem-imported-doc", revisionCount: 1 },
          state: { docId: "filesystem-imported-doc" },
        },
      });

      const repaired = await findEntityByDisplayId(
        storage,
        identity.space.id,
        "documentation",
        "filesystem-imported-doc",
      );
      expect(repaired?.attributes).toMatchObject({
        record: {
          state: expect.objectContaining({ docId: "filesystem-imported-doc" }),
          revisions: [expect.objectContaining({ id: "rev-001" })],
        },
      });
    } finally {
      cleanup();
    }
  }, 15000);
});
