import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { findEntityByDisplayId, upsertEntityByDisplayId } from "@pi-loom/pi-storage/storage/entities.js";
import { openWorkspaceStorage } from "@pi-loom/pi-storage/storage/workspace.js";
import { describe, expect, it, vi } from "vitest";
import { createResearchStore } from "../extensions/domain/store.js";

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

type MockPi = {
  tools: Map<string, ToolDefinition>;
  registerTool: ReturnType<typeof vi.fn>;
};

function createTempWorkspace(): { cwd: string; cleanup: () => void } {
  const cwd = mkdtempSync(join(tmpdir(), "pi-research-tools-"));
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

describe("research tools", () => {
  it("registers tool definitions with prompt snippets and guidelines", async () => {
    const mockPi = createMockPi();
    const { registerResearchTools } = await import("../extensions/tools/research.js");
    registerResearchTools(mockPi as unknown as ExtensionAPI);

    expect([...mockPi.tools.keys()].sort()).toEqual([
      "research_artifact",
      "research_dashboard",
      "research_hypothesis",
      "research_list",
      "research_map",
      "research_read",
      "research_write",
    ]);

    for (const tool of mockPi.tools.values()) {
      expect(tool.promptSnippet).toEqual(expect.any(String));
      expect(tool.promptSnippet?.length).toBeGreaterThan(20);
      expect(tool.promptGuidelines).toEqual(expect.arrayContaining([expect.any(String)]));
    }

    expect(getTool(mockPi, "research_hypothesis").promptSnippet).toContain("Persist structured reasoning");
    expect(getTool(mockPi, "research_artifact").promptSnippet).toContain("current-state records");
    expect(getTool(mockPi, "research_read").promptGuidelines).toContain(
      'Use `research_write` with `action: "create"` to start new research; `research_read` only loads existing records and will fail for unknown refs.',
    );
    expect(
      (
        getTool(mockPi, "research_read").parameters as unknown as {
          properties: {
            repositoryId: { type: string; optional: boolean };
            worktreeId: { type: string; optional: boolean };
          };
        }
      ).properties.repositoryId,
    ).toMatchObject({ type: "string", optional: true });
    expect(
      (
        getTool(mockPi, "research_write").parameters as unknown as {
          properties: {
            repositoryId: { type: string; optional: boolean };
            worktreeId: { type: string; optional: boolean };
          };
        }
      ).properties.worktreeId,
    ).toMatchObject({ type: "string", optional: true });
    expect(
      (
        getTool(mockPi, "research_dashboard").parameters as unknown as {
          properties: {
            repositoryId: { type: string; optional: boolean };
            worktreeId: { type: string; optional: boolean };
          };
        }
      ).properties.repositoryId,
    ).toMatchObject({ type: "string", optional: true });
  });

  it("returns machine-usable shapes for list, read, write, hypothesis, artifact, dashboard, and map flows", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      process.env.PI_LOOM_ROOT = join(cwd, ".pi-loom-test");
      const mockPi = createMockPi();
      const { registerResearchTools } = await import("../extensions/tools/research.js");
      registerResearchTools(mockPi as unknown as ExtensionAPI);
      const ctx = createContext(cwd);

      const researchWrite = getTool(mockPi, "research_write");
      const researchList = getTool(mockPi, "research_list");
      const researchRead = getTool(mockPi, "research_read");
      const researchHypothesis = getTool(mockPi, "research_hypothesis");
      const researchArtifact = getTool(mockPi, "research_artifact");
      const researchDashboard = getTool(mockPi, "research_dashboard");
      const researchMap = getTool(mockPi, "research_map");

      const created = await researchWrite.execute(
        "call-1",
        {
          action: "create",
          title: "Evaluate theme architecture",
          question: "Should theme state move into a shared service?",
          keywords: ["theme", "architecture"],
        },
        undefined,
        undefined,
        ctx,
      );
      expect(created.details).toMatchObject({
        action: "create",
        research: {
          summary: {
            id: "evaluate-theme-architecture",
            status: "proposed",
            repository: expect.objectContaining({ id: expect.any(String), slug: expect.any(String) }),
          },
        },
      });

      const hypothesis = await researchHypothesis.execute(
        "call-2",
        {
          ref: "evaluate-theme-architecture",
          statement: "A shared service reduces duplicated persistence logic.",
          evidence: ["Storage reads are duplicated today."],
          status: "supported",
          confidence: "high",
        },
        undefined,
        undefined,
        ctx,
      );
      expect(hypothesis.details).toMatchObject({
        research: { hypotheses: [expect.objectContaining({ id: "hyp-001", status: "supported" })] },
      });

      const artifact = await researchArtifact.execute(
        "call-3",
        {
          ref: "evaluate-theme-architecture",
          kind: "experiment",
          title: "Prototype",
          summary: "Centralized theme writes.",
          body: "Prototype notes",
          linkedHypothesisIds: ["hyp-001"],
        },
        undefined,
        undefined,
        ctx,
      );
      expect(artifact.details).toMatchObject({
        research: {
          artifacts: [expect.objectContaining({ id: "artifact-001", kind: "experiment" })],
        },
      });

      const listed = await researchList.execute("call-4", { includeArchived: true }, undefined, undefined, ctx);
      expect(listed.details).toMatchObject({
        research: [
          expect.objectContaining({
            id: "evaluate-theme-architecture",
            repository: expect.objectContaining({ id: expect.any(String), slug: expect.any(String) }),
          }),
        ],
      });

      const read = await researchRead.execute(
        "call-5",
        { ref: "evaluate-theme-architecture" },
        undefined,
        undefined,
        ctx,
      );
      expect(read.details).toMatchObject({
        research: {
          summary: {
            id: "evaluate-theme-architecture",
            repository: expect.objectContaining({ id: expect.any(String), slug: expect.any(String) }),
          },
          hypotheses: [expect.objectContaining({ id: "hyp-001" })],
          artifacts: [expect.objectContaining({ id: "artifact-001" })],
        },
      });

      const dashboard = await researchDashboard.execute(
        "call-6",
        { ref: "evaluate-theme-architecture" },
        undefined,
        undefined,
        ctx,
      );
      expect(dashboard.details).toMatchObject({
        dashboard: {
          hypotheses: { total: 1, counts: { supported: 1 } },
          artifacts: { total: 1, counts: { experiment: 1 } },
        },
      });

      const map = await researchMap.execute(
        "call-7",
        { ref: "evaluate-theme-architecture" },
        undefined,
        undefined,
        ctx,
      );
      expect(map.details).toMatchObject({
        map: {
          nodes: expect.objectContaining({
            "evaluate-theme-architecture": expect.objectContaining({ kind: "research" }),
            "artifact-001": expect.objectContaining({ kind: "artifact" }),
            "hyp-001": expect.objectContaining({ kind: "hypothesis" }),
          }),
        },
      });
    } finally {
      cleanup();
    }
  }, 15000);

  it("persists artifact metadata canonically when metadata is updated without a new body", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      process.env.PI_LOOM_ROOT = join(cwd, ".pi-loom-test");
      const mockPi = createMockPi();
      const { registerResearchTools } = await import("../extensions/tools/research.js");
      registerResearchTools(mockPi as unknown as ExtensionAPI);
      const ctx = createContext(cwd);

      const researchWrite = getTool(mockPi, "research_write");
      const researchRead = getTool(mockPi, "research_read");
      const researchArtifact = getTool(mockPi, "research_artifact");

      await researchWrite.execute(
        "call-1",
        {
          action: "create",
          title: "Evaluate theme architecture",
        },
        undefined,
        undefined,
        ctx,
      );

      await researchArtifact.execute(
        "call-2",
        {
          ref: "evaluate-theme-architecture",
          id: "artifact-001",
          kind: "experiment",
          title: "Prototype",
          summary: "Centralized theme writes.",
          body: "Original prototype notes",
        },
        undefined,
        undefined,
        ctx,
      );

      await researchArtifact.execute(
        "call-3",
        {
          ref: "evaluate-theme-architecture",
          id: "artifact-001",
          kind: "experiment",
          title: "Prototype",
          summary: "Revised summary only.",
          tags: ["updated"],
        },
        undefined,
        undefined,
        ctx,
      );

      const read = await researchRead.execute(
        "call-4",
        { ref: "evaluate-theme-architecture" },
        undefined,
        undefined,
        ctx,
      );
      expect(read.details).toMatchObject({
        research: {
          artifacts: [
            expect.objectContaining({
              id: "artifact-001",
              kind: "experiment",
              summary: "Revised summary only.",
              tags: ["updated"],
            }),
          ],
        },
      });

      const { storage, identity } = await openWorkspaceStorage(cwd);
      const entity = await findEntityByDisplayId(storage, identity.space.id, "research", "evaluate-theme-architecture");
      expect(entity).toBeTruthy();
      if (!entity) {
        throw new Error("Expected research entity to exist");
      }
      expect(entity.attributes).not.toHaveProperty("artifacts");

      expect(await storage.listEntities(identity.space.id, "artifact")).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            displayId: "research:evaluate-theme-architecture:artifact:experiment:artifact-001",
            attributes: expect.objectContaining({
              projectionOwner: "research-store:artifacts",
              artifactType: "research-artifact",
              payload: expect.objectContaining({
                id: "artifact-001",
                kind: "experiment",
                summary: "Revised summary only.",
                tags: ["updated"],
                body: "Original prototype notes",
              }),
            }),
          }),
        ]),
      );
    } finally {
      cleanup();
    }
  });

  it("fails truthfully on unknown research refs and accepts canonical research refs for reads", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      process.env.PI_LOOM_ROOT = join(cwd, ".pi-loom-test");
      const mockPi = createMockPi();
      const { registerResearchTools } = await import("../extensions/tools/research.js");
      registerResearchTools(mockPi as unknown as ExtensionAPI);
      const ctx = createContext(cwd);

      const researchWrite = getTool(mockPi, "research_write");
      const researchRead = getTool(mockPi, "research_read");
      const researchHypothesis = getTool(mockPi, "research_hypothesis");
      const researchArtifact = getTool(mockPi, "research_artifact");

      await researchWrite.execute(
        "call-1",
        {
          action: "create",
          title: "Evaluate theme architecture",
          keywords: ["theme", "architecture"],
        },
        undefined,
        undefined,
        ctx,
      );

      await expect(
        researchRead.execute("call-2", { ref: "research:evaluate-theme-architecture" }, undefined, undefined, ctx),
      ).resolves.toMatchObject({
        details: {
          research: {
            summary: { id: "evaluate-theme-architecture" },
          },
        },
      });

      const listedByKeyword = await getTool(mockPi, "research_list").execute(
        "call-3",
        { exactKeyword: "theme" },
        undefined,
        undefined,
        ctx,
      );
      expect(listedByKeyword.details).toMatchObject({
        research: [expect.objectContaining({ id: "evaluate-theme-architecture" })],
      });

      await expect(
        researchRead.execute("call-4", { ref: "research:missing-research" }, undefined, undefined, ctx),
      ).rejects.toThrow("Unknown research: missing-research");
      await expect(
        researchHypothesis.execute(
          "call-5",
          {
            ref: "research:missing-research",
            statement: "Missing refs must fail truthfully.",
          },
          undefined,
          undefined,
          ctx,
        ),
      ).rejects.toThrow("Unknown research: missing-research");
      await expect(
        researchArtifact.execute(
          "call-6",
          {
            ref: "research:missing-research",
            kind: "note",
            title: "Missing target",
          },
          undefined,
          undefined,
          ctx,
        ),
      ).rejects.toThrow("Unknown research: missing-research");
      await expect(
        researchWrite.execute(
          "call-7",
          {
            action: "link_initiative",
            ref: "research:missing-research",
            initiativeId: "theme-modernization",
          },
          undefined,
          undefined,
          ctx,
        ),
      ).rejects.toThrow("Unknown research: missing-research");

      expect(await createResearchStore(cwd).listResearch({ includeArchived: true })).toEqual([
        expect.objectContaining({ id: "evaluate-theme-architecture" }),
      ]);
    } finally {
      cleanup();
    }
  });

  it("keeps research readable when linked initiative, spec, or ticket refs are stale", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      process.env.PI_LOOM_ROOT = join(cwd, ".pi-loom-test");
      const mockPi = createMockPi();
      const { registerResearchTools } = await import("../extensions/tools/research.js");
      registerResearchTools(mockPi as unknown as ExtensionAPI);
      const ctx = createContext(cwd);

      const researchWrite = getTool(mockPi, "research_write");
      const researchList = getTool(mockPi, "research_list");
      const researchRead = getTool(mockPi, "research_read");
      const researchDashboard = getTool(mockPi, "research_dashboard");
      const researchMap = getTool(mockPi, "research_map");

      await researchWrite.execute(
        "call-1",
        {
          action: "create",
          title: "Evaluate control surfaces",
        },
        undefined,
        undefined,
        ctx,
      );

      const canonical = await createResearchStore(cwd).readResearch("evaluate-control-surfaces");

      const { storage, identity } = await openWorkspaceStorage(cwd);
      const entity = await findEntityByDisplayId(storage, identity.space.id, "research", "evaluate-control-surfaces");
      expect(entity).toBeTruthy();
      if (!entity) {
        throw new Error("Expected research entity to exist");
      }
      await upsertEntityByDisplayId(storage, {
        kind: entity.kind,
        spaceId: entity.spaceId,
        owningRepositoryId: entity.owningRepositoryId,
        displayId: entity.displayId ?? entity.id,
        title: entity.title,
        summary: entity.summary,
        status: entity.status,
        version: entity.version + 1,
        tags: entity.tags,
        attributes: {
          ...(entity.attributes as Record<string, unknown>),
          state: {
            ...canonical.state,
            initiativeIds: ["workspace-backed-manager-worker-coordination"],
            specChangeIds: ["manager-worker-runtime-contract"],
            ticketIds: ["ticket-404"],
          },
        },
        createdAt: entity.createdAt,
        updatedAt: new Date().toISOString(),
      });

      const listed = await researchList.execute("call-list", { includeArchived: true }, undefined, undefined, ctx);
      expect(listed.details).toMatchObject({
        research: [expect.objectContaining({ id: "evaluate-control-surfaces" })],
      });

      const read = await researchRead.execute(
        "call-2",
        { ref: "evaluate-control-surfaces" },
        undefined,
        undefined,
        ctx,
      );
      expect(read.details).toMatchObject({
        research: {
          summary: { id: "evaluate-control-surfaces" },
          state: {
            initiativeIds: ["workspace-backed-manager-worker-coordination"],
            specChangeIds: ["manager-worker-runtime-contract"],
            ticketIds: ["ticket-404"],
          },
          dashboard: {
            linkedInitiatives: { total: 0, items: [] },
            linkedSpecs: { total: 0, items: [] },
            linkedTickets: { total: 0, items: [] },
            unresolvedReferences: {
              initiativeIds: ["workspace-backed-manager-worker-coordination"],
              specChangeIds: ["manager-worker-runtime-contract"],
              ticketIds: ["ticket-404"],
            },
          },
          map: {
            nodes: expect.objectContaining({
              "initiative:workspace-backed-manager-worker-coordination": expect.objectContaining({
                kind: "initiative",
                missing: true,
              }),
              "spec:manager-worker-runtime-contract": expect.objectContaining({ kind: "spec", missing: true }),
              "ticket:ticket-404": expect.objectContaining({ kind: "ticket", missing: true }),
            }),
            edges: expect.arrayContaining([
              expect.objectContaining({
                from: "evaluate-control-surfaces",
                to: "initiative:workspace-backed-manager-worker-coordination",
                relation: "links_initiative",
              }),
              expect.objectContaining({
                from: "evaluate-control-surfaces",
                to: "spec:manager-worker-runtime-contract",
                relation: "links_spec",
              }),
              expect.objectContaining({
                from: "evaluate-control-surfaces",
                to: "ticket:ticket-404",
                relation: "links_ticket",
              }),
            ]),
          },
        },
      });

      const dashboard = await researchDashboard.execute(
        "call-3",
        { ref: "evaluate-control-surfaces" },
        undefined,
        undefined,
        ctx,
      );
      expect(dashboard.details).toMatchObject({
        dashboard: {
          unresolvedReferences: {
            initiativeIds: ["workspace-backed-manager-worker-coordination"],
            specChangeIds: ["manager-worker-runtime-contract"],
            ticketIds: ["ticket-404"],
          },
        },
      });

      const map = await researchMap.execute("call-4", { ref: "evaluate-control-surfaces" }, undefined, undefined, ctx);
      expect(map.details).toMatchObject({
        map: {
          nodes: expect.objectContaining({
            "initiative:workspace-backed-manager-worker-coordination": expect.objectContaining({ missing: true }),
            "spec:manager-worker-runtime-contract": expect.objectContaining({ missing: true }),
            "ticket:ticket-404": expect.objectContaining({ missing: true }),
          }),
        },
      });
    } finally {
      cleanup();
    }
  }, 30000);
});
