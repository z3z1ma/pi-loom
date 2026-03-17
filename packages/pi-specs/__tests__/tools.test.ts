import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

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
  const cwd = mkdtempSync(join(tmpdir(), "pi-specs-tools-"));
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

describe("spec tools", () => {
  it("registers tool definitions with prompt snippets and prompt guidelines", async () => {
    const mockPi = createMockPi();
    const { registerSpecTools } = await import("../extensions/tools/spec.js");
    registerSpecTools(mockPi as unknown as ExtensionAPI);

    expect([...mockPi.tools.keys()].sort()).toEqual([
      "spec_analyze",
      "spec_list",
      "spec_project_tickets",
      "spec_read",
      "spec_write",
    ]);

    for (const tool of mockPi.tools.values()) {
      expect(tool.promptSnippet).toEqual(expect.any(String));
      expect(tool.promptSnippet?.length).toBeGreaterThan(20);
      expect(tool.promptGuidelines).toEqual(expect.arrayContaining([expect.any(String)]));
    }

    expect(getTool(mockPi, "spec_project_tickets").promptSnippet).toContain(
      "Generate execution tickets only after the spec is finalized, validated, and detailed enough",
    );
    expect(getTool(mockPi, "spec_write").promptGuidelines).toContain(
      "Capture enough bounded detail for the spec layer: problem framing, rationale, assumptions, constraints, dependencies, tradeoffs, scenarios, edge cases, acceptance, verification, provenance, and open questions where they still exist.",
    );
    expect(getTool(mockPi, "spec_project_tickets").promptGuidelines).toContain(
      "Require substantial specification detail before projection so tickets inherit complete requirements, rationale, dependencies, edge cases, and verification expectations.",
    );
  });

  it("returns machine-usable shapes for list, read, write, analyze, and project flows", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      process.env.PI_LOOM_ROOT = join(cwd, ".pi-loom-test");
      const mockPi = createMockPi();
      const { registerSpecTools } = await import("../extensions/tools/spec.js");
      registerSpecTools(mockPi as unknown as ExtensionAPI);
      const ctx = createContext(cwd);

      const specWrite = getTool(mockPi, "spec_write");
      const specList = getTool(mockPi, "spec_list");
      const specRead = getTool(mockPi, "spec_read");
      const specAnalyze = getTool(mockPi, "spec_analyze");
      const specProject = getTool(mockPi, "spec_project_tickets");

      const created = await specWrite.execute(
        "call-1",
        { action: "propose", title: "Add dark mode", summary: "Support a dark theme." },
        undefined,
        undefined,
        ctx,
      );
      expect(created.details).toMatchObject({
        action: "propose",
        change: {
          summary: { id: "add-dark-mode", status: "proposed" },
        },
      });

      const planned = await specWrite.execute(
        "call-2",
        {
          action: "plan",
          ref: "add-dark-mode",
          designNotes: "Use CSS variables and persistence.",
          capabilities: [
            {
              title: "Theme toggling",
              summary: "Allow switching themes.",
              requirements: ["Users can toggle dark mode."],
              acceptance: ["Theme changes immediately."],
              scenarios: ["User toggles the theme from settings."],
            },
          ],
        },
        undefined,
        undefined,
        ctx,
      );
      expect(planned.details).toMatchObject({
        action: "plan",
        change: {
          state: { capabilities: [expect.objectContaining({ id: "theme-toggling" })] },
        },
      });

      const tasked = await specWrite.execute(
        "call-3",
        {
          action: "tasks",
          ref: "add-dark-mode",
          tasks: [{ title: "Implement theme toggle", requirements: ["req-001"] }],
        },
        undefined,
        undefined,
        ctx,
      );
      expect(tasked.details).toMatchObject({
        action: "tasks",
        change: {
          state: { tasks: [expect.objectContaining({ id: "task-001" })] },
        },
      });

      const analyzed = await specAnalyze.execute(
        "call-4",
        { ref: "add-dark-mode", mode: "both" },
        undefined,
        undefined,
        ctx,
      );
      expect(analyzed.details).toMatchObject({
        mode: "both",
        change: {
          analysis: expect.stringContaining("Specification quality gates"),
          checklist: expect.stringContaining("This checklist validates specification quality"),
        },
      });

      const finalized = await specWrite.execute(
        "call-5",
        { action: "finalize", ref: "add-dark-mode" },
        undefined,
        undefined,
        ctx,
      );
      expect(finalized.details).toMatchObject({
        action: "finalize",
        change: { summary: { status: "finalized" } },
      });

      const projected = await specProject.execute("call-6", { ref: "add-dark-mode" }, undefined, undefined, ctx);
      expect(projected.details).toMatchObject({
        change: {
          projection: {
            tickets: [expect.objectContaining({ taskId: "task-001", ticketId: expect.any(String) })],
          },
        },
      });

      const listed = await specList.execute("call-7", { includeArchived: true }, undefined, undefined, ctx);
      expect(listed.details).toMatchObject({
        changes: [expect.objectContaining({ id: "add-dark-mode" })],
      });

      const read = await specRead.execute("call-8", { ref: "add-dark-mode" }, undefined, undefined, ctx);
      expect(read.details).toMatchObject({
        change: {
          summary: { id: "add-dark-mode" },
          projection: { tickets: [expect.objectContaining({ taskId: "task-001" })] },
        },
      });
    } finally {
      cleanup();
    }
  }, 15000);

  it("rehydrates archived filesystem-imported spec entities for canonical list and read flows", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      process.env.PI_LOOM_ROOT = join(cwd, ".pi-loom-test");
      const mockPi = createMockPi();
      const { registerSpecTools } = await import("../extensions/tools/spec.js");
      registerSpecTools(mockPi as unknown as ExtensionAPI);
      const ctx = createContext(cwd);

      const specWrite = getTool(mockPi, "spec_write");
      const specList = getTool(mockPi, "spec_list");
      const specRead = getTool(mockPi, "spec_read");

      await specWrite.execute(
        "call-1",
        { action: "propose", title: "Filesystem imported spec", summary: "Repair archived canonical state from files." },
        undefined,
        undefined,
        ctx,
      );
      await specWrite.execute(
        "call-2",
        {
          action: "plan",
          ref: "filesystem-imported-spec",
          designNotes: "Keep canonical reads on SQLite after repair.",
          capabilities: [
            {
              title: "Repair imported entities",
              summary: "Recover archived specs from projection files.",
              requirements: ["Canonical read/list tolerate imported entities."],
              acceptance: ["Archived imported specs are rehydrated before canonical reads continue."],
              scenarios: ["Listing specs with an archived filesystem-imported entity succeeds."],
            },
          ],
        },
        undefined,
        undefined,
        ctx,
      );
      await specWrite.execute(
        "call-3",
        {
          action: "tasks",
          ref: "filesystem-imported-spec",
          tasks: [{ title: "Repair canonical store", requirements: ["req-001"] }],
        },
        undefined,
        undefined,
        ctx,
      );
      await specWrite.execute("call-4", { action: "finalize", ref: "filesystem-imported-spec" }, undefined, undefined, ctx);
      await specWrite.execute("call-5", { action: "archive", ref: "filesystem-imported-spec" }, undefined, undefined, ctx);

      await specWrite.execute(
        "call-6",
        { action: "propose", title: "Still structured", summary: "Keep a mixed canonical list." },
        undefined,
        undefined,
        ctx,
      );

      const [{ findEntityByDisplayId, upsertEntityByDisplayId }, { openWorkspaceStorage }] = await Promise.all([
        import("../../pi-storage/storage/entities.js"),
        import("../../pi-storage/storage/workspace.js"),
      ]);
      const { storage, identity } = await openWorkspaceStorage(cwd);
      const entity = await findEntityByDisplayId(storage, identity.space.id, "spec_change", "filesystem-imported-spec");
      expect(entity).toBeTruthy();
      if (!entity) {
        throw new Error("Expected spec entity to exist");
      }

      const archivedDate = entity.updatedAt.slice(0, 10);
      const archivedDir = join(cwd, ".loom", "specs", "archive", `${archivedDate}-filesystem-imported-spec`);
      const archivedRoot = `.loom/specs/archive/${archivedDate}-filesystem-imported-spec`;
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
            [`${archivedRoot}/state.json`]: readFileSync(join(archivedDir, "state.json"), "utf-8"),
            [`${archivedRoot}/proposal.md`]: readFileSync(join(archivedDir, "proposal.md"), "utf-8"),
            [`${archivedRoot}/design.md`]: readFileSync(join(archivedDir, "design.md"), "utf-8"),
            [`${archivedRoot}/tasks.md`]: readFileSync(join(archivedDir, "tasks.md"), "utf-8"),
            [`${archivedRoot}/analysis.md`]: readFileSync(join(archivedDir, "analysis.md"), "utf-8"),
            [`${archivedRoot}/checklist.md`]: readFileSync(join(archivedDir, "checklist.md"), "utf-8"),
          },
        },
        createdAt: entity.createdAt,
        updatedAt: new Date().toISOString(),
      });

      const listed = await specList.execute("call-7", { includeArchived: true }, undefined, undefined, ctx);
      expect(listed.details).toMatchObject({
        changes: expect.arrayContaining([
          expect.objectContaining({ id: "filesystem-imported-spec", archived: true }),
          expect.objectContaining({ id: "still-structured", archived: false }),
        ]),
      });

      const read = await specRead.execute("call-8", { ref: "filesystem-imported-spec" }, undefined, undefined, ctx);
      expect(read.details).toMatchObject({
        change: {
          summary: { id: "filesystem-imported-spec", archived: true },
          state: { archivedPath: expect.stringContaining(".loom/specs/archive/") },
        },
      });

      const repaired = await findEntityByDisplayId(storage, identity.space.id, "spec_change", "filesystem-imported-spec");
      expect(repaired?.attributes).toMatchObject({
        state: expect.objectContaining({ changeId: "filesystem-imported-spec", archivedPath: expect.any(String) }),
      });
    } finally {
      cleanup();
    }
  }, 15000);
});
