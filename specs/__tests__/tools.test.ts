import { mkdtempSync, rmSync } from "node:fs";
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
    const { registerSpecTools } = await import("../tools/spec.js");
    registerSpecTools(mockPi as unknown as ExtensionAPI);

    expect([...mockPi.tools.keys()].sort()).toEqual(["spec_analyze", "spec_list", "spec_read", "spec_write"]);

    for (const tool of mockPi.tools.values()) {
      expect(tool.promptSnippet).toEqual(expect.any(String));
      expect(tool.promptSnippet?.length).toBeGreaterThan(20);
      expect(tool.promptGuidelines).toEqual(expect.arrayContaining([expect.any(String)]));
    }

    expect(getTool(mockPi, "spec_write").promptGuidelines).toContain(
      "Capture enough bounded detail for the specification layer: problem framing, desired behavior, rationale, assumptions, constraints, dependencies, tradeoffs, scenarios, edge cases, acceptance, verification, provenance, and open questions where they still exist.",
    );
    expect(getTool(mockPi, "spec_write").promptGuidelines).toContain(
      "When proposing a specification, title it around the behavior or capability being specified rather than an implementation-task verb or migration delta.",
    );
    expect(getTool(mockPi, "spec_write").promptGuidelines).toContain(
      "`clarify`, `specify`, and other spec mutations are for mutable specs only. After `finalize`, the spec becomes read-only; after `archive`, it is terminal and remains available only for reading, lineage, and capability provenance.",
    );
    expect(getTool(mockPi, "spec_write").description).toContain(
      "keeping specifications declarative and implementation-decoupled while plans and tickets stay execution-aware",
    );
    expect(getTool(mockPi, "spec_read").promptGuidelines).toContain(
      "Treat plans as the implementation bridge and tickets as the execution ledger; the specification defines the behavior they must honor.",
    );
    expect(getTool(mockPi, "spec_analyze").promptGuidelines).toContain(
      "Analysis and checklist generation mutate stored artifacts, so they are only valid while the spec is still mutable; rerun them before finalize, not after finalize or archive.",
    );
    expect(
      (
        getTool(mockPi, "spec_read").parameters as unknown as {
          properties: {
            repositoryId: { type: string; optional: boolean };
            worktreeId: { type: string; optional: boolean };
          };
        }
      ).properties.repositoryId,
    ).toMatchObject({ type: "string", optional: true });
    expect(
      (
        getTool(mockPi, "spec_write").parameters as unknown as {
          properties: {
            repositoryId: { type: string; optional: boolean };
            worktreeId: { type: string; optional: boolean };
          };
        }
      ).properties.worktreeId,
    ).toMatchObject({ type: "string", optional: true });
    expect(
      (
        getTool(mockPi, "spec_analyze").parameters as unknown as {
          properties: {
            repositoryId: { type: string; optional: boolean };
            worktreeId: { type: string; optional: boolean };
          };
        }
      ).properties.repositoryId,
    ).toMatchObject({ type: "string", optional: true });
  });

  it("returns machine-usable shapes for list, read, write, and analyze flows", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      process.env.PI_LOOM_ROOT = join(cwd, ".pi-loom-test");
      const mockPi = createMockPi();
      const { registerSpecTools } = await import("../tools/spec.js");
      registerSpecTools(mockPi as unknown as ExtensionAPI);
      const ctx = createContext(cwd);

      const specWrite = getTool(mockPi, "spec_write");
      const specList = getTool(mockPi, "spec_list");
      const specRead = getTool(mockPi, "spec_read");
      const specAnalyze = getTool(mockPi, "spec_analyze");

      const created = await specWrite.execute(
        "call-1",
        { action: "propose", title: "Dark theme support", summary: "The product supports a dark visual theme." },
        undefined,
        undefined,
        ctx,
      );
      expect(created.details).toMatchObject({
        action: "propose",
        change: {
          summary: {
            id: "dark-theme-support",
            status: "proposed",
            repository: expect.objectContaining({ id: expect.any(String), slug: expect.any(String) }),
          },
        },
      });

      const specified = await specWrite.execute(
        "call-2",
        {
          action: "specify",
          ref: "dark-theme-support",
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
      expect(specified.details).toMatchObject({
        action: "specify",
        change: {
          state: { status: "specified", capabilities: [expect.objectContaining({ id: "theme-toggling" })] },
        },
      });

      const analyzed = await specAnalyze.execute(
        "call-3",
        { ref: "dark-theme-support", mode: "both" },
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
        "call-4",
        { action: "finalize", ref: "dark-theme-support" },
        undefined,
        undefined,
        ctx,
      );
      expect(finalized.details).toMatchObject({
        action: "finalize",
        change: { summary: { status: "finalized" } },
      });

      const listed = await specList.execute("call-5", { includeArchived: true }, undefined, undefined, ctx);
      expect(listed.details).toMatchObject({
        changes: [
          expect.objectContaining({
            id: "dark-theme-support",
            repository: expect.objectContaining({ id: expect.any(String), slug: expect.any(String) }),
          }),
        ],
      });

      const read = await specRead.execute("call-6", { ref: "dark-theme-support" }, undefined, undefined, ctx);
      expect(read.details).toMatchObject({
        change: {
          summary: {
            id: "dark-theme-support",
            repository: expect.objectContaining({ id: expect.any(String), slug: expect.any(String) }),
          },
          state: { capabilities: [expect.objectContaining({ id: "theme-toggling" })] },
        },
      });

      await expect(
        specWrite.execute(
          "call-7",
          {
            action: "clarify",
            ref: "dark-theme-support",
            question: "Can we keep editing this?",
            answer: "No.",
          },
          undefined,
          undefined,
          ctx,
        ),
      ).rejects.toThrow("Spec dark-theme-support is finalized and cannot record clarifications.");

      await expect(
        specAnalyze.execute("call-8", { ref: "dark-theme-support", mode: "analysis" }, undefined, undefined, ctx),
      ).rejects.toThrow("Spec dark-theme-support is finalized and cannot refresh analysis.");

      const archived = await specWrite.execute(
        "call-9",
        { action: "archive", ref: "dark-theme-support" },
        undefined,
        undefined,
        ctx,
      );
      expect(archived.details).toMatchObject({
        action: "archive",
        change: { summary: { status: "archived" } },
      });

      await expect(
        specWrite.execute(
          "call-10",
          {
            action: "specify",
            ref: "dark-theme-support",
            capabilities: [
              {
                title: "Late edit",
                requirements: ["This should not land."],
              },
            ],
          },
          undefined,
          undefined,
          ctx,
        ),
      ).rejects.toThrow("Spec dark-theme-support is archived and cannot change specification details.");
    } finally {
      cleanup();
    }
  }, 15000);
});
