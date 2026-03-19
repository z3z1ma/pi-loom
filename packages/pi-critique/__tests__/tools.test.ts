import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

let persistDurableRun = true;

const runCritiqueLaunch = vi.fn(async (cwd: string, launch: { critiqueId: string }) => {
  if (persistDurableRun) {
    const { createCritiqueStore } = await import("../extensions/domain/store.js");
    await createCritiqueStore(cwd).recordRunAsync(launch.critiqueId, {
      kind: "adversarial",
      verdict: "pass",
      summary: "Fresh critic verdict: launch descriptor reviewed.",
    });
  }

  return {
    command: "pi",
    args: ["--mode", "json"],
    exitCode: 0,
    output: "Fresh critic verdict: launch descriptor reviewed.",
    stderr: "",
  };
});

vi.mock("@mariozechner/pi-ai", () => ({
  StringEnum: (values: readonly string[]) => ({ type: "string", enum: [...values] }),
}));

vi.mock("../extensions/domain/runtime.js", () => ({
  runCritiqueLaunch,
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
  const cwd = mkdtempSync(join(tmpdir(), "pi-critique-tools-"));
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

describe("critique tools", () => {
  it("registers tool definitions with prompt snippets and prompt guidelines", async () => {
    const mockPi = createMockPi();
    const { registerCritiqueTools } = await import("../extensions/tools/critique.js");
    registerCritiqueTools(mockPi as unknown as ExtensionAPI);

    expect([...mockPi.tools.keys()].sort()).toEqual([
      "critique_dashboard",
      "critique_finding",
      "critique_launch",
      "critique_list",
      "critique_read",
      "critique_run",
      "critique_write",
    ]);

    for (const tool of mockPi.tools.values()) {
      expect(tool.promptSnippet).toEqual(expect.any(String));
      expect(tool.promptSnippet?.length).toBeGreaterThan(20);
      expect(tool.promptGuidelines).toEqual(expect.arrayContaining([expect.any(String)]));
    }

    expect(getTool(mockPi, "critique_launch").promptSnippet).toContain("fresh-context critique");
    expect(getTool(mockPi, "critique_launch").promptGuidelines).toEqual(
      expect.arrayContaining([expect.stringContaining("long timeout")]),
    );
  });

  it("returns machine-usable shapes for create, launch, run, finding, dashboard, and list flows", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const mockPi = createMockPi();
      const { registerCritiqueTools } = await import("../extensions/tools/critique.js");
      registerCritiqueTools(mockPi as unknown as ExtensionAPI);
      const ctx = createContext(cwd);

      const critiqueWrite = getTool(mockPi, "critique_write");
      const critiqueRead = getTool(mockPi, "critique_read");
      const critiqueLaunch = getTool(mockPi, "critique_launch");
      const critiqueRun = getTool(mockPi, "critique_run");
      const critiqueFinding = getTool(mockPi, "critique_finding");
      const critiqueDashboard = getTool(mockPi, "critique_dashboard");
      const critiqueList = getTool(mockPi, "critique_list");

      const created = await critiqueWrite.execute(
        "call-1",
        {
          action: "create",
          title: "Critique workspace plan",
          target: { kind: "workspace", ref: "repo", path: "packages/pi-critique" },
          focusAreas: ["architecture", "tests"],
          reviewQuestion: "Is critique durable and reviewable from a fresh context?",
          scopePaths: ["packages/pi-critique"],
          nonGoals: ["Do not change Ralph loop execution."],
        },
        undefined,
        undefined,
        ctx,
      );
      expect(created.details).toMatchObject({
        action: "create",
        critique: {
          summary: { id: "critique-workspace-plan", targetKind: "workspace", targetRef: "repo" },
        },
      });

      const packet = await critiqueRead.execute(
        "call-2",
        { ref: "critique-workspace-plan", mode: "packet" },
        undefined,
        undefined,
        ctx,
      );
      const packetText = packet.content[0];
      expect(packet.details).toMatchObject({
        critique: { id: "critique-workspace-plan" },
      });
      expect(packetText).toMatchObject({ type: "text" });
      if (packetText?.type !== "text") {
        throw new Error("Expected packet text content");
      }
      expect(packetText.text).toContain("Fresh Context Protocol");

      const launched = await critiqueLaunch.execute(
        "call-3",
        { ref: "critique-workspace-plan" },
        undefined,
        undefined,
        ctx,
      );
      expect(launched.details).toMatchObject({
        critique: {
          runs: [expect.objectContaining({ id: "run-001", verdict: "pass" })],
        },
        launch: { runtime: "descriptor_only", critiqueId: "critique-workspace-plan" },
        execution: { command: "pi", exitCode: 0 },
      });
      expect(runCritiqueLaunch).toHaveBeenCalledTimes(1);
      expect(launched.content).toEqual([{ type: "text", text: "Fresh critic verdict: launch descriptor reviewed." }]);

      const withRun = await critiqueRun.execute(
        "call-4",
        {
          ref: "critique-workspace-plan",
          kind: "adversarial",
          summary: "The launch boundary exists but needs stronger tests.",
          verdict: "needs_revision",
          freshContext: true,
          focusAreas: ["tests"],
        },
        undefined,
        undefined,
        ctx,
      );
      expect(withRun.details).toMatchObject({
        critique: {
          runs: [
            expect.objectContaining({ id: "run-001", verdict: "pass" }),
            expect.objectContaining({ id: "run-002", verdict: "needs_revision" }),
          ],
        },
      });

      const withFinding = await critiqueFinding.execute(
        "call-5",
        {
          action: "create",
          ref: "critique-workspace-plan",
          runId: "run-002",
          kind: "missing_test",
          severity: "high",
          confidence: "high",
          title: "Missing launch verification",
          summary: "The fresh launch descriptor was not verified by tests.",
          evidence: ["No targeted launch test existed yet."],
          recommendedAction: "Add coverage for descriptor-only launch semantics.",
        },
        undefined,
        undefined,
        ctx,
      );
      expect(withFinding.details).toMatchObject({
        critique: {
          findings: [expect.objectContaining({ id: "finding-001", status: "open" })],
        },
      });

      const ticketified = await critiqueFinding.execute(
        "call-6",
        {
          action: "ticketify",
          ref: "critique-workspace-plan",
          id: "finding-001",
          ticketTitle: "Add critique launch verification",
        },
        undefined,
        undefined,
        ctx,
      );
      expect(ticketified.details).toMatchObject({
        critique: {
          state: { followupTicketIds: ["t-0001"] },
          findings: [expect.objectContaining({ id: "finding-001", linkedTicketId: "t-0001", status: "accepted" })],
        },
      });

      const dashboard = await critiqueDashboard.execute(
        "call-7",
        { ref: "critique-workspace-plan" },
        undefined,
        undefined,
        ctx,
      );
      expect(dashboard.details).toMatchObject({
        dashboard: {
          critique: { id: "critique-workspace-plan" },
          counts: { runs: 2, findings: 1, followupTickets: 1 },
        },
      });

      const listed = await critiqueList.execute("call-8", { targetKind: "workspace" }, undefined, undefined, ctx);
      expect(listed.details).toMatchObject({
        critiques: [expect.objectContaining({ id: "critique-workspace-plan", verdict: "needs_revision" })],
      });
    } finally {
      cleanup();
    }
  }, 120000);

  it("fails critique_launch when the fresh critic exits without persisting a durable critique run", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      persistDurableRun = false;
      const mockPi = createMockPi();
      const { registerCritiqueTools } = await import("../extensions/tools/critique.js");
      registerCritiqueTools(mockPi as unknown as ExtensionAPI);
      const ctx = createContext(cwd);

      const critiqueWrite = getTool(mockPi, "critique_write");
      const critiqueLaunch = getTool(mockPi, "critique_launch");

      await critiqueWrite.execute(
        "call-1",
        {
          action: "create",
          title: "Critique missing durable run",
          target: { kind: "workspace", ref: "repo" },
        },
        undefined,
        undefined,
        ctx,
      );

      await expect(
        critiqueLaunch.execute("call-2", { ref: "critique-missing-durable-run" }, undefined, undefined, ctx),
      ).rejects.toThrow("without appending a durable critique run through critique_run");
    } finally {
      persistDurableRun = true;
      cleanup();
    }
  }, 30000);
});
