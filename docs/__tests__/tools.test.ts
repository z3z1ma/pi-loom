import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { createSeededParentGitWorkspace } from "#storage/__tests__/helpers/git-fixture.js";
import { upsertEntityByDisplayIdWithLifecycleEvents } from "#storage/entities.js";
import { createPortableRepositoryPath } from "#storage/repository-path.js";
import type { LoomRuntimeScope } from "#storage/runtime-scope.js";
import { openRepositoryWorkspaceStorage, openWorkspaceStorage } from "#storage/workspace.js";

const runDocsUpdate = vi.fn(
  async (
    cwd: string,
    _prompt: string,
    _signal: AbortSignal | undefined,
    _onUpdate: unknown,
    scope?: LoomRuntimeScope,
  ) => {
    const { createDocumentationStore } = await import("../domain/store.js");
    await createDocumentationStore(cwd, {
      repositoryId: scope?.repositoryId,
      worktreeId: scope?.worktreeId,
    }).updateDoc("documentation-memory-system", {
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
  },
);

vi.mock("@mariozechner/pi-ai", () => ({
  StringEnum: (values: readonly string[]) => ({ type: "string", enum: [...values] }),
}));

vi.mock("../domain/runtime.js", () => ({
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
  const { storage, identity } = await openRepositoryWorkspaceStorage(cwd);
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
            scopePaths: [
              createPortableRepositoryPath({
                repositoryId: identity.repository.id,
                repositorySlug: identity.repository.slug,
                worktreeId: identity.worktree.id,
                relativePath: "docs",
              }),
            ],
            contextRefs: {
              roadmapItemIds: [],
              initiativeIds: [],
              researchIds: [],
              specChangeIds: [],
              ticketIds: [],
              critiqueIds: [],
            },
            sourceTarget: { kind: "workspace", ref: "repo" },
            upstreamPath: null,
            updateReason: "Persist canonical documentation snapshots.",
            guideTopics: ["documentation-memory"],
            linkedOutputPaths: [
              createPortableRepositoryPath({
                repositoryId: identity.repository.id,
                repositorySlug: identity.repository.slug,
                worktreeId: identity.worktree.id,
                relativePath: "docs/loom.md",
              }),
            ],
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
    const { registerDocsTools } = await import("../tools/docs.js");
    registerDocsTools(mockPi as unknown as ExtensionAPI);

    expect([...mockPi.tools.keys()].sort()).toEqual([
      "docs_list",
      "docs_overview",
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
    expect(getTool(mockPi, "docs_list").promptSnippet).toContain("durable explanations stay consolidated");
    expect(getTool(mockPi, "docs_list").parameters).toMatchObject({
      properties: {
        exactStatus: expect.objectContaining({ enum: ["active", "archived"] }),
      },
    });
    expect(getTool(mockPi, "docs_write").promptGuidelines).toContain(
      "Use update with document content after completed work changes system understanding; write self-contained, high-context explanation rather than API reference snippets or shallow summaries.",
    );
    expect(getTool(mockPi, "docs_write").promptGuidelines).toContain(
      "Updating `contextRefs` replaces the stored ref buckets you send; pass the full desired bucket contents, and use empty arrays to clear incorrect refs.",
    );
    expect(getTool(mockPi, "docs_read").promptSnippet).toContain("existing context, rationale, and boundaries");
  });

  it("returns machine-usable shapes for create, read, packet, update, overview, and list flows", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const mockPi = createMockPi();
      const { registerDocsTools } = await import("../tools/docs.js");
      registerDocsTools(mockPi as unknown as ExtensionAPI);
      const ctx = createContext(cwd);

      const docsWrite = getTool(mockPi, "docs_write");
      const docsRead = getTool(mockPi, "docs_read");
      const docsPacket = getTool(mockPi, "docs_packet");
      const docsUpdate = getTool(mockPi, "docs_update");
      const docsOverview = getTool(mockPi, "docs_overview");
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
          scopePaths: ["docs"],
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
          summary: {
            id: "documentation-memory-system",
            docType: "overview",
            repository: expect.objectContaining({ id: expect.any(String), slug: expect.any(String) }),
          },
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

      const overview = await docsOverview.execute(
        "call-5",
        { ref: "documentation-memory-system" },
        undefined,
        undefined,
        ctx,
      );
      expect(overview.details).toMatchObject({
        overview: {
          doc: {
            id: "documentation-memory-system",
            repository: expect.objectContaining({ id: expect.any(String), slug: expect.any(String) }),
          },
          revisionCount: 2,
          lastRevision: { id: "rev-002" },
        },
      });

      const listed = await docsList.execute("call-6", { exactDocType: "overview" }, undefined, undefined, ctx);
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
      const { registerDocsTools } = await import("../tools/docs.js");
      registerDocsTools(mockPi as unknown as ExtensionAPI);
      const ctx = createContext(cwd);
      const docId = await seedCanonicalDocumentationSnapshot(cwd);

      const docsRead = getTool(mockPi, "docs_read");
      const docsList = getTool(mockPi, "docs_list");

      const read = await docsRead.execute(
        "call-read-document",
        { ref: `${docId}/state.md`, mode: "document" },
        undefined,
        undefined,
        ctx,
      );
      expect(read.details).toMatchObject({
        documentation: {
          id: docId,
          ref: `documentation:${docId}`,
          revisionCount: 1,
          repository: expect.objectContaining({ id: expect.any(String), slug: expect.any(String) }),
        },
      });
      expect(read.content).toEqual([
        {
          type: "text",
          text: expect.stringContaining("Canonical docs are persisted in normalized snapshots."),
        },
      ]);

      const listed = await docsList.execute(
        "call-list-documentation",
        { exactTopic: "documentation-memory" },
        undefined,
        undefined,
        ctx,
      );
      expect(listed.details).toMatchObject({
        docs: [
          expect.objectContaining({
            id: docId,
            ref: `documentation:${docId}`,
            revisionCount: 1,
            repository: expect.objectContaining({ id: expect.any(String), slug: expect.any(String) }),
          }),
        ],
      });
    } finally {
      cleanup();
    }
  });

  it("replaces context refs on update and records archive history through docs_write", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const mockPi = createMockPi();
      const { registerDocsTools } = await import("../tools/docs.js");
      registerDocsTools(mockPi as unknown as ExtensionAPI);
      const ctx = createContext(cwd);

      const docsWrite = getTool(mockPi, "docs_write");
      const docsRead = getTool(mockPi, "docs_read");

      const created = await docsWrite.execute(
        "call-create-archiveable-doc",
        {
          action: "create",
          title: "Archiveable documentation",
          docType: "overview",
          summary: "A doc used to verify archive lifecycle behavior.",
          audience: ["ai", "human"],
          sourceTarget: { kind: "workspace", ref: "repo" },
          contextRefs: {
            roadmapItemIds: ["roadmap-1"],
          },
          updateReason: "Seed an archive lifecycle test document.",
        },
        undefined,
        undefined,
        ctx,
      );

      const docId = (created.details as { documentation: { summary: { id: string } } }).documentation.summary.id;

      const corrected = await docsWrite.execute(
        "call-correct-context-refs",
        {
          action: "update",
          ref: docId,
          summary: "A doc used to verify context ref replacement and archive lifecycle behavior.",
          contextRefs: {},
          updateReason: "Correct the linked context refs.",
        },
        undefined,
        undefined,
        ctx,
      );

      expect(corrected.details).toMatchObject({
        documentation: {
          state: {
            contextRefs: {
              roadmapItemIds: [],
              initiativeIds: [],
              researchIds: [],
              specChangeIds: [],
              ticketIds: [],
              critiqueIds: [],
            },
          },
          revisions: [expect.anything()],
        },
      });

      const archived = await docsWrite.execute(
        "call-archive-doc",
        {
          action: "archive",
          ref: docId,
        },
        undefined,
        undefined,
        ctx,
      );

      expect(archived.details).toMatchObject({
        action: "archive",
        documentation: {
          state: { status: "archived", lastRevisionId: "rev-002" },
          revisions: [
            expect.objectContaining({ id: "rev-001" }),
            expect.objectContaining({
              id: "rev-002",
              reason: "Archive Archiveable documentation after it stops describing the active system state.",
              linkedContextRefs: {
                roadmapItemIds: [],
                initiativeIds: [],
                researchIds: [],
                specChangeIds: [],
                ticketIds: [],
                critiqueIds: [],
              },
            }),
          ],
        },
      });

      await expect(
        docsWrite.execute(
          "call-update-archived-doc",
          {
            action: "update",
            ref: docId,
            summary: "This update must fail because the doc is archived.",
          },
          undefined,
          undefined,
          ctx,
        ),
      ).rejects.toThrow("Cannot update archived documentation");

      const archivedRead = await docsRead.execute(
        "call-read-archived-doc",
        { ref: `${docId}/state.md`, mode: "state" },
        undefined,
        undefined,
        ctx,
      );
      expect(archivedRead.details).toMatchObject({
        state: {
          status: "archived",
          contextRefs: {
            roadmapItemIds: [],
            initiativeIds: [],
            researchIds: [],
            specChangeIds: [],
            ticketIds: [],
            critiqueIds: [],
          },
        },
      });
    } finally {
      cleanup();
    }
  });

  it("passes repository-targeted runtime scope into docs_update for ambiguous parent workspaces", async () => {
    runDocsUpdate.mockClear();
    const workspace = createSeededParentGitWorkspace({
      prefix: "pi-docs-tools-multi-",
      repositories: [
        { name: "service-a", remoteUrl: "git@github.com:example/service-a.git" },
        { name: "service-b", remoteUrl: "git@github.com:example/service-b.git" },
      ],
    });
    const loomRoot = mkdtempSync(join(tmpdir(), "pi-docs-tools-multi-state-"));
    process.env.PI_LOOM_ROOT = loomRoot;

    try {
      const { identity } = await openWorkspaceStorage(workspace.cwd);
      const serviceA = identity.repositories.find(
        (repository) =>
          repository.displayName === "service-a" || repository.remoteUrls.some((url) => url.includes("service-a")),
      );
      expect(serviceA).toBeDefined();
      if (!serviceA) {
        throw new Error("Missing service-a repository identity");
      }

      const { createDocumentationStore } = await import("../domain/store.js");
      await createDocumentationStore(workspace.cwd, { repositoryId: serviceA.id }).createDoc({
        title: "Documentation Memory System",
        docType: "overview",
        summary: "Scoped doc for service-a.",
        audience: ["ai"],
        sourceTarget: { kind: "workspace", ref: "service-a" },
      });

      const mockPi = createMockPi();
      const { registerDocsTools } = await import("../tools/docs.js");
      registerDocsTools(mockPi as unknown as ExtensionAPI);

      await getTool(mockPi, "docs_update").execute(
        "call-scoped-update",
        { ref: "documentation-memory-system" },
        undefined,
        undefined,
        createContext(workspace.cwd),
      );

      expect(runDocsUpdate).toHaveBeenCalledWith(
        workspace.cwd,
        expect.any(String),
        undefined,
        expect.any(Function),
        expect.objectContaining({ repositoryId: serviceA.id }),
        undefined,
        undefined,
      );
    } finally {
      delete process.env.PI_LOOM_ROOT;
      rmSync(loomRoot, { recursive: true, force: true });
      workspace.cleanup();
    }
  }, 15000);
});
