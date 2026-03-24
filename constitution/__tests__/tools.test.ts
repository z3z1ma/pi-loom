import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
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
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-constitution-tools-"));
  return {
    cwd,
    cleanup: () => {
      delete process.env.PI_LOOM_ROOT;
      fs.rmSync(cwd, { recursive: true, force: true });
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

describe("constitution tools", () => {
  it("registers tool definitions with prompt snippets and prompt guidelines", async () => {
    const mockPi = createMockPi();
    const { registerConstitutionTools } = await import("../tools/constitution.js");
    registerConstitutionTools(mockPi as unknown as ExtensionAPI);

    expect([...mockPi.tools.keys()].sort()).toEqual([
      "constitution_dashboard",
      "constitution_read",
      "constitution_roadmap",
      "constitution_write",
    ]);

    for (const tool of mockPi.tools.values()) {
      expect(tool.promptSnippet).toEqual(expect.any(String));
      expect(tool.promptSnippet?.length).toBeGreaterThan(20);
      expect(tool.promptGuidelines).toEqual(expect.arrayContaining([expect.any(String)]));
    }

    expect(getTool(mockPi, "constitution_write").promptSnippet).toContain("Persist project-defining vision");
    expect(getTool(mockPi, "constitution_roadmap").promptGuidelines).toEqual(
      expect.arrayContaining([expect.stringContaining("stable within the constitution aggregate")]),
    );
  });

  it("returns machine-usable shapes for read, write, roadmap, and dashboard flows", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      process.env.PI_LOOM_ROOT = path.join(cwd, ".pi-loom-test");
      const mockPi = createMockPi();
      const { registerConstitutionTools } = await import("../tools/constitution.js");
      registerConstitutionTools(mockPi as unknown as ExtensionAPI);
      const ctx = createContext(cwd);

      const constitutionWrite = getTool(mockPi, "constitution_write");
      const constitutionRead = getTool(mockPi, "constitution_read");
      const constitutionRoadmap = getTool(mockPi, "constitution_roadmap");
      const constitutionDashboard = getTool(mockPi, "constitution_dashboard");

      const initialized = await constitutionWrite.execute(
        "call-1",
        { action: "init", title: "Pi Loom" },
        undefined,
        undefined,
        ctx,
      );
      expect(initialized.details).toMatchObject({ action: "init", initialized: { initialized: true } });

      const vision = await constitutionWrite.execute(
        "call-2",
        {
          action: "update_vision",
          visionSummary: "Preserve project-defining intent as durable AI-native memory.",
          visionNarrative: "Constitutional memory should ground agents before they make strategic changes.",
        },
        undefined,
        undefined,
        ctx,
      );
      expect(vision.details).toMatchObject({
        action: "update_vision",
        constitution: { state: { completeness: { vision: true } } },
      });

      const principles = await constitutionWrite.execute(
        "call-3",
        {
          action: "update_principles",
          principles: [
            {
              title: "Long-horizon truthfulness",
              summary: "Durable layers must tell future agents what is true now.",
              rationale: "Strategic drift often begins with undocumented assumptions.",
            },
          ],
        },
        undefined,
        undefined,
        ctx,
      );
      expect(principles.details).toMatchObject({
        action: "update_principles",
        constitution: { state: { principles: [expect.objectContaining({ id: "principle-001" })] } },
      });

      const replacedPrinciples = await constitutionWrite.execute(
        "call-3b",
        {
          action: "update_principles",
          principles: [
            {
              title: "Truthful boundaries",
              summary: "Public semantics should match what the store actually persists.",
              rationale: "Replacing the list keeps the section authoritative.",
            },
          ],
        },
        undefined,
        undefined,
        ctx,
      );
      expect(replacedPrinciples.details).toMatchObject({
        action: "update_principles",
        constitution: {
          state: { principles: [expect.objectContaining({ id: "principle-001", title: "Truthful boundaries" })] },
        },
      });

      const constraints = await constitutionWrite.execute(
        "call-4",
        {
          action: "update_constraints",
          constraints: [
            {
              title: "Repo-visible durability",
              summary: "Constitutional memory must live in repo-visible files.",
            },
          ],
        },
        undefined,
        undefined,
        ctx,
      );
      expect(constraints.details).toMatchObject({
        action: "update_constraints",
        constitution: { state: { constraints: [expect.objectContaining({ id: "constraint-001" })] } },
      });

      const replacedConstraints = await constitutionWrite.execute(
        "call-4b",
        {
          action: "update_constraints",
          constraints: [
            {
              title: "Repo-visible source of truth",
              summary: "Durable constitution sections should be rewritten as complete lists.",
            },
          ],
        },
        undefined,
        undefined,
        ctx,
      );
      expect(replacedConstraints.details).toMatchObject({
        action: "update_constraints",
        constitution: {
          state: {
            constraints: [expect.objectContaining({ id: "constraint-001", title: "Repo-visible source of truth" })],
          },
        },
      });

      const roadmap = await constitutionWrite.execute(
        "call-5",
        {
          action: "update_roadmap",
          strategicDirectionSummary: "Ship constitutional memory before deeper downstream integrations.",
          currentFocus: ["Package scaffold", "Prompt loading"],
        },
        undefined,
        undefined,
        ctx,
      );
      expect(roadmap.details).toMatchObject({
        action: "update_roadmap",
        constitution: { state: { completeness: { roadmap: true } } },
      });

      const createdRoadmapItem = await constitutionRoadmap.execute(
        "call-6",
        {
          action: "create_item",
          title: "Launch constitutional memory",
          status: "active",
          horizon: "now",
          summary: "Introduce the constitutional package and compiled brief.",
          initiativeIds: ["constitutional-foundation"],
        },
        undefined,
        undefined,
        ctx,
      );
      expect(createdRoadmapItem.details).toMatchObject({
        action: "create_item",
        constitution: { state: { roadmapItems: [expect.objectContaining({ id: "item-001" })] } },
      });

      const listedRoadmapItems = await constitutionRoadmap.execute(
        "call-6b",
        { action: "list_items", status: "active" },
        undefined,
        undefined,
        ctx,
      );
      expect(listedRoadmapItems.details).toMatchObject({
        action: "list_items",
        filters: { status: "active", horizon: null },
        items: [expect.objectContaining({ id: "item-001", title: "Launch constitutional memory" })],
      });
      expect(listedRoadmapItems.content[0]).toMatchObject({
        text: expect.stringContaining("item-001 [now/active] Launch constitutional memory"),
      });

      const linked = await constitutionRoadmap.execute(
        "call-7",
        { action: "link_initiative", itemId: "item-001", initiativeId: "strategy-sync" },
        undefined,
        undefined,
        ctx,
      );
      expect(linked.details).toMatchObject({
        action: "link_initiative",
        constitution: {
          state: {
            initiativeIds: ["constitutional-foundation", "strategy-sync"],
          },
        },
      });

      const read = await constitutionRead.execute("call-8", { section: "brief" }, undefined, undefined, ctx);
      expect(read.details).toMatchObject({ brief: expect.any(String) });
      expect(read.content[0]).toMatchObject({
        text: expect.stringContaining("Preserve project-defining intent as durable AI-native memory."),
      });

      const readRoadmapItem = await constitutionRead.execute(
        "call-10",
        { itemId: path.join("roadmap", "item-001.md") },
        undefined,
        undefined,
        ctx,
      );
      expect(readRoadmapItem.details).toMatchObject({
        item: { id: "item-001", title: "Launch constitutional memory" },
      });

      const dashboard = await constitutionDashboard.execute("call-9", {}, undefined, undefined, ctx);
      expect(dashboard.details).toMatchObject({
        dashboard: {
          roadmap: { total: 1, activeItemIds: ["item-001"] },
          linkedWork: { initiativeIds: ["constitutional-foundation", "strategy-sync"] },
        },
      });
    } finally {
      cleanup();
    }
  }, 15000);
});
