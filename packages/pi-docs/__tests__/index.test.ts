import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionContext,
  ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import { upsertEntityByDisplayIdWithLifecycleEvents } from "@pi-loom/pi-storage/storage/entities.js";
import { openRepositoryWorkspaceStorage, openWorkspaceStorage } from "@pi-loom/pi-storage/storage/workspace.js";
import { describe, expect, it, vi } from "vitest";
import { createDocumentationStore } from "../extensions/domain/store.js";

vi.mock("@mariozechner/pi-ai", () => ({
  StringEnum: (values: readonly string[]) => ({ type: "string", enum: [...values] }),
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

type RegisteredHandlers = Map<string, (event: unknown, ctx: ExtensionContext) => unknown>;
type RegisteredTools = Map<string, ToolDefinition>;

type MockPi = {
  tools: RegisteredTools;
  handlers: RegisteredHandlers;
  registerTool: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
};

function createTempWorkspace(): { cwd: string; cleanup: () => void } {
  const cwd = mkdtempSync(join(tmpdir(), "pi-docs-index-"));
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
  const tools: RegisteredTools = new Map();
  const handlers: RegisteredHandlers = new Map();

  return {
    tools,
    handlers,
    registerTool: vi.fn((definition: ToolDefinition) => {
      tools.set(definition.name, definition);
    }),
    on: vi.fn((event: string, handler: (event: unknown, ctx: ExtensionContext) => unknown) => {
      handlers.set(event, handler);
    }),
  };
}

function getHandler(mockPi: MockPi, eventName: string): (event: unknown, ctx: ExtensionContext) => unknown {
  const handler = mockPi.handlers.get(eventName);
  expect(handler).toBeDefined();
  if (!handler) {
    throw new Error(`Missing handler ${eventName}`);
  }
  return handler;
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

describe("pi-docs extension", () => {
  it("registers docs tools and lifecycle hooks without any slash commands", async () => {
    const mockPi = createMockPi();
    const { default: piDocs } = await import("../extensions/index.js");

    piDocs(mockPi as unknown as ExtensionAPI);

    expect(mockPi).not.toHaveProperty("commands");
    expect((mockPi as unknown as { registerCommand?: unknown }).registerCommand).toBeUndefined();
    expect([...mockPi.tools.keys()].sort()).toEqual([
      "docs_dashboard",
      "docs_list",
      "docs_packet",
      "docs_read",
      "docs_update",
      "docs_write",
    ]);
    expect(mockPi.handlers.has("session_start")).toBe(true);
    expect(mockPi.handlers.has("before_agent_start")).toBe(true);
  });

  it("initializes docs storage through the session_start lifecycle hook", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const mockPi = createMockPi();
      const { default: piDocs } = await import("../extensions/index.js");
      piDocs(mockPi as unknown as ExtensionAPI);
      const docsStore = createDocumentationStore(cwd);

      const sessionStart = getHandler(mockPi, "session_start");

      await sessionStart({ type: "session_start" }, { cwd } as ExtensionContext);
      await expect(docsStore.listDocs()).resolves.toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("lists and reads canonical snapshot documentation entities", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const docsStore = createDocumentationStore(cwd);
      const docId = await seedCanonicalDocumentationSnapshot(cwd);

      await expect(docsStore.listDocs()).resolves.toEqual([
        expect.objectContaining({
          id: docId,
          ref: `documentation:${docId}`,
          revisionCount: 1,
          sourceKind: "workspace",
        }),
      ]);

      await expect(docsStore.readDoc(docId)).resolves.toMatchObject({
        summary: { id: docId, ref: `documentation:${docId}` },
        state: { lastRevisionId: "rev-001" },
        revisions: [expect.objectContaining({ id: "rev-001", changedSections: ["Fresh Updater", "Summary"] })],
      });
    } finally {
      cleanup();
    }
  });

  it("fails direct reads for malformed documentation snapshots", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const { storage, identity } = await openRepositoryWorkspaceStorage(cwd);
      await upsertEntityByDisplayIdWithLifecycleEvents(
        storage,
        {
          kind: "documentation",
          spaceId: identity.space.id,
          owningRepositoryId: identity.repository.id,
          displayId: "broken-documentation-snapshot",
          title: "Broken documentation snapshot",
          summary: "Broken documentation snapshot.",
          status: "active",
          version: 1,
          tags: ["overview"],
          attributes: {
            snapshot: {
              state: {
                docId: "broken-documentation-snapshot",
                title: "Broken documentation snapshot",
                status: "active",
                docType: "overview",
                sectionGroup: "overviews",
                createdAt: "2026-03-17T00:36:38.511Z",
                updatedAt: "2026-03-17T00:36:40.314Z",
                summary: "Broken documentation snapshot.",
                audience: ["ai"],
                scopePaths: [],
                contextRefs: {
                  roadmapItemIds: [],
                  initiativeIds: [],
                  researchIds: [],
                  specChangeIds: [],
                  ticketIds: [],
                  critiqueIds: [],
                },
                sourceTarget: { kind: "workspace", ref: "repo" },
                updateReason: "Broken data.",
                guideTopics: [],
                linkedOutputPaths: [],
                lastRevisionId: null,
              },
              revisions: [],
            },
          },
          createdAt: "2026-03-17T00:36:38.511Z",
          updatedAt: "2026-03-17T00:36:40.314Z",
        },
        {
          actor: "test",
          createdPayload: { change: "seeded_broken_documentation_snapshot" },
          updatedPayload: { change: "seeded_broken_documentation_snapshot" },
        },
      );

      await expect(createDocumentationStore(cwd).readDoc("broken-documentation-snapshot")).rejects.toThrow(
        "Documentation snapshot is missing documentBody",
      );
    } finally {
      cleanup();
    }
  });

  it("augments the system prompt with docs doctrine before agent start", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const mockPi = createMockPi();
      const { default: piDocs } = await import("../extensions/index.js");
      piDocs(mockPi as unknown as ExtensionAPI);
      const beforeAgentStart = getHandler(mockPi, "before_agent_start");

      const result = (await beforeAgentStart(
        { systemPrompt: "Base system prompt" } as BeforeAgentStartEvent,
        { cwd } as ExtensionContext,
      )) as { systemPrompt: string };

      expect(result.systemPrompt).toContain("Base system prompt");
      expect(result.systemPrompt).toContain(
        "Documentation is the durable explanatory Loom layer for accepted system reality after completed work materially changes how the repository should be understood.",
      );
      expect(result.systemPrompt).toContain("Documentation state is persisted in SQLite via pi-storage.");
      expect(result.systemPrompt).toContain(
        "Prefer docs packets and durable high-level documentation over chat-only explanations.",
      );
    } finally {
      cleanup();
    }
  });
});
