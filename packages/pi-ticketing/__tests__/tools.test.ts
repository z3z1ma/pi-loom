import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { findEntityByDisplayId } from "@pi-loom/pi-storage/storage/entities.js";
import { openWorkspaceStorage } from "@pi-loom/pi-storage/storage/workspace.js";
import { describe, expect, it, vi } from "vitest";

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
    Boolean: () => ({ type: "boolean" }),
    String: (options?: Record<string, unknown>) => ({ type: "string", ...(options ?? {}) }),
  },
}));

type MockPi = {
  tools: Map<string, ToolDefinition>;
  registerTool: ReturnType<typeof vi.fn>;
};

function createTempWorkspace(): { cwd: string; cleanup: () => void } {
  const cwd = mkdtempSync(join(tmpdir(), "pi-ticketing-tools-"));
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

function resultDetails<T>(value: unknown): T {
  return value as T;
}

function firstText(value: unknown): string {
  const content = value as Array<{ type: string; text?: string }>;
  return content[0]?.text ?? "";
}

describe("ticket tools", () => {
  it("register tool definitions with prompt snippets, prompt guidelines, and reopen support", async () => {
    const mockPi = createMockPi();
    const { registerTicketTools } = await import("../extensions/tools/ticket.js");
    registerTicketTools(mockPi as unknown as ExtensionAPI);

    expect([...mockPi.tools.keys()].sort()).toEqual([
      "ticket_checkpoint",
      "ticket_graph",
      "ticket_list",
      "ticket_read",
      "ticket_write",
    ]);

    for (const tool of mockPi.tools.values()) {
      expect(tool.promptSnippet).toEqual(expect.any(String));
      expect(tool.promptSnippet?.length).toBeGreaterThan(20);
      expect(tool.promptGuidelines).toEqual(expect.arrayContaining([expect.any(String)]));
    }

    const writeTool = getTool(mockPi, "ticket_write");
    expect(writeTool.promptSnippet).toContain("Persist substantial work intent");
    expect(writeTool.promptGuidelines).toContain(
      "Create ticket bodies as complete, self-contained units of work with concrete context, acceptance criteria, plan, dependencies, risks, provenance, and verification expectations rather than minimal blurbs; a capable newcomer should be able to understand why the task exists, what generally needs to happen, and what done looks like.",
    );
    expect(
      (writeTool.parameters as unknown as { properties: { action: { enum: string[] } } }).properties.action.enum,
    ).toContain("reopen");
    expect(getTool(mockPi, "ticket_checkpoint").promptGuidelines).toContain(
      "Use checkpoints for reusable durable handoff records, not ephemeral chat summaries.",
    );
    expect(getTool(mockPi, "ticket_read").promptGuidelines).toContain(
      "Use the full ticket body, acceptance criteria, provenance, and journal as the execution record; do not overwrite a complete unit of work with a thinner restatement that would leave a newcomer unsure why the work exists or how to recognize completion.",
    );
    expect(getTool(mockPi, "ticket_checkpoint").promptGuidelines).toContain(
      "Checkpoint bodies should preserve the critical execution detail needed for truthful resumption, including state, decisions, risks, acceptance progress, and verification status, so a later worker can tell what remains and how completion will be judged.",
    );
  });

  it("returns machine-usable shapes for list, read, write, graph, and checkpoint flows", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      const mockPi = createMockPi();
      const { registerTicketTools } = await import("../extensions/tools/ticket.js");
      registerTicketTools(mockPi as unknown as ExtensionAPI);
      const ctx = createContext(cwd);

      const ticketWrite = getTool(mockPi, "ticket_write");
      const ticketList = getTool(mockPi, "ticket_list");
      const ticketRead = getTool(mockPi, "ticket_read");
      const ticketGraph = getTool(mockPi, "ticket_graph");
      const ticketCheckpoint = getTool(mockPi, "ticket_checkpoint");

      const blockerResult = await ticketWrite.execute(
        "call-1",
        { action: "create", title: "Blocker" },
        undefined,
        undefined,
        ctx,
      );
      const blockerId = resultDetails<{ ticket: { summary: { id: string } } }>(blockerResult.details).ticket.summary.id;

      const createResult = await ticketWrite.execute(
        "call-2",
        {
          action: "create",
          title: "Implement tool behavior coverage",
          summary: "Cover machine outputs",
          acceptance: ["Tool outputs include the expected machine-readable details."],
          initiativeIds: ["initiative-coverage"],
          researchIds: ["research-tooling"],
          labels: ["tooling"],
        },
        undefined,
        undefined,
        ctx,
      );
      const ticketId = resultDetails<{ ticket: { summary: { id: string } } }>(createResult.details).ticket.summary.id;
      expect(createResult).toMatchObject({
        content: [{ type: "text", text: expect.stringContaining(ticketId) }],
        details: {
          action: "create",
          ticket: {
            summary: { id: ticketId, title: "Implement tool behavior coverage" },
          },
        },
      });
      expect(firstText(createResult.content)).toContain(
        "Acceptance: Tool outputs include the expected machine-readable details.",
      );
      expect(firstText(createResult.content)).toContain("Initiatives: initiative-coverage");
      expect(firstText(createResult.content)).toContain("Labels: tooling");

      const dependencyResult = await ticketWrite.execute(
        "call-3",
        { action: "add_dependency", ref: ticketId, dependency: blockerId },
        undefined,
        undefined,
        ctx,
      );
      expect(
        resultDetails<{ ticket: { summary: { deps: string[] } } }>(dependencyResult.details).ticket.summary.deps,
      ).toContain(blockerId);

      const listResult = await ticketList.execute("call-4", { includeClosed: false }, undefined, undefined, ctx);
      expect(listResult.details).toMatchObject({
        tickets: expect.arrayContaining([
          expect.objectContaining({ id: blockerId }),
          expect.objectContaining({ id: ticketId }),
        ]),
      });
      expect(firstText(listResult.content)).toContain(ticketId);

      const readResult = await ticketRead.execute("call-5", { ref: `#${ticketId}` }, undefined, undefined, ctx);
      expect(readResult.details).toMatchObject({
        ticket: {
          summary: { id: ticketId },
          journal: expect.arrayContaining([expect.objectContaining({ kind: "state" })]),
        },
      });
      expect(firstText(readResult.content)).toContain(
        "Acceptance: Tool outputs include the expected machine-readable details.",
      );

      const graphResult = await ticketGraph.execute("call-6", { ref: ticketId }, undefined, undefined, ctx);
      expect(graphResult.details).toMatchObject({
        graph: {
          nodes: expect.objectContaining({
            [ticketId]: expect.objectContaining({ deps: [blockerId] }),
          }),
        },
        node: expect.objectContaining({ id: ticketId, deps: [blockerId] }),
      });

      const checkpointCreate = await ticketCheckpoint.execute(
        "call-7",
        { action: "create", ref: ticketId, title: "handoff", body: "next steps" },
        undefined,
        undefined,
        ctx,
      );
      expect(checkpointCreate.details).toMatchObject({
        action: "create",
        ticket: {
          summary: { id: ticketId },
          checkpoints: [expect.objectContaining({ id: expect.any(String), title: "handoff" })],
        },
      });

      const checkpointRead = await ticketCheckpoint.execute(
        "call-8",
        { action: "read", ref: ticketId },
        undefined,
        undefined,
        ctx,
      );
      expect(checkpointRead.details).toMatchObject({
        checkpoints: [expect.objectContaining({ id: expect.any(String), title: "handoff", body: "next steps" })],
      });
    } finally {
      cleanup();
    }
  }, 30000);

  it("returns machine-usable details for journal, attachment, close, and reopen mutations", async () => {
    const { cwd, cleanup } = createTempWorkspace();
    try {
      writeFileSync(join(cwd, "evidence.txt"), "captured evidence\n", "utf-8");
      const mockPi = createMockPi();
      const { registerTicketTools } = await import("../extensions/tools/ticket.js");
      registerTicketTools(mockPi as unknown as ExtensionAPI);
      const ctx = createContext(cwd);
      const ticketWrite = getTool(mockPi, "ticket_write");
      const ticketList = getTool(mockPi, "ticket_list");

      const created = await ticketWrite.execute(
        "call-1",
        { action: "create", title: "Exercise write actions" },
        undefined,
        undefined,
        ctx,
      );
      const ticketId = resultDetails<{ ticket: { summary: { id: string } } }>(created.details).ticket.summary.id;

      const journalResult = await ticketWrite.execute(
        "call-2",
        { action: "add_journal_entry", ref: ticketId, journalKind: "progress", text: "Captured repro" },
        undefined,
        undefined,
        ctx,
      );
      expect(journalResult.details).toMatchObject({
        action: "add_journal_entry",
        ticket: {
          summary: { id: ticketId },
          journal: expect.arrayContaining([expect.objectContaining({ kind: "progress", text: "Captured repro" })]),
        },
      });

      const attachmentResult = await ticketWrite.execute(
        "call-3",
        { action: "attach_artifact", ref: ticketId, artifact: { label: "evidence", path: "evidence.txt" } },
        undefined,
        undefined,
        ctx,
      );
      expect(attachmentResult.details).toMatchObject({
        action: "attach_artifact",
        ticket: {
          summary: { id: ticketId },
          attachments: [
            expect.objectContaining({
              label: "evidence",
              sourceRef: "attachment-source:t-0001:attachment-0001:evidence.txt",
              artifactRef: null,
              metadata: expect.objectContaining({
                inlineContentBase64: Buffer.from("captured evidence\n", "utf-8").toString("base64"),
                inlineEncoding: "base64",
                inlineSourceType: "filesystem",
              }),
            }),
          ],
        },
      });

      const { storage, identity } = await openWorkspaceStorage(cwd);
      const ticketEntity = await findEntityByDisplayId(storage, identity.space.id, "ticket", ticketId);
      expect(ticketEntity).toBeTruthy();
      if (!ticketEntity) {
        throw new Error("Expected ticket entity to exist");
      }
      expect(ticketEntity.attributes).toMatchObject({
        record: {
          attachments: [
            {
              label: "evidence",
              sourceRef: "attachment-source:t-0001:attachment-0001:evidence.txt",
              artifactRef: null,
              metadata: {
                inlineContentBase64: Buffer.from("captured evidence\n", "utf-8").toString("base64"),
                inlineEncoding: "base64",
                inlineSourceType: "filesystem",
              },
            },
          ],
        },
      });

      const closeResult = await ticketWrite.execute(
        "call-4",
        { action: "close", ref: ticketId, verification: "verified by targeted tool test" },
        undefined,
        undefined,
        ctx,
      );
      expect(closeResult.details).toMatchObject({
        action: "close",
        ticket: {
          summary: { id: ticketId, status: "closed", closed: true },
          journal: expect.arrayContaining([
            expect.objectContaining({ kind: "verification", text: "verified by targeted tool test" }),
          ]),
        },
      });

      const reopenResult = await ticketWrite.execute(
        "call-5",
        { action: "reopen", ref: ticketId },
        undefined,
        undefined,
        ctx,
      );
      expect(reopenResult.details).toMatchObject({
        action: "reopen",
        ticket: {
          summary: { id: ticketId, status: "ready", closed: false },
        },
      });
      expect(firstText(reopenResult.content)).toContain("Stored status: open");

      const reopenedList = await ticketList.execute(
        "call-6",
        { includeClosed: false, status: "ready" },
        undefined,
        undefined,
        ctx,
      );
      expect(reopenedList.details).toMatchObject({
        tickets: expect.arrayContaining([expect.objectContaining({ id: ticketId, status: "ready", closed: false })]),
      });

      const reopenedRead = await getTool(mockPi, "ticket_read").execute(
        "call-7",
        { ref: ticketId },
        undefined,
        undefined,
        ctx,
      );
      expect(reopenedRead.details).toMatchObject({
        ticket: {
          summary: { id: ticketId, status: "ready", closed: false },
          journal: expect.arrayContaining([
            expect.objectContaining({ kind: "attachment", text: "Attached evidence" }),
            expect.objectContaining({ kind: "verification", text: "verified by targeted tool test" }),
            expect.objectContaining({ kind: "state", text: "Reopened ticket" }),
          ]),
        },
      });

      const reopenedEntity = await findEntityByDisplayId(storage, identity.space.id, "ticket", ticketId);
      expect(reopenedEntity).toBeTruthy();
      if (!reopenedEntity) {
        throw new Error("Expected reopened ticket entity to exist");
      }
      expect(reopenedEntity.attributes).toMatchObject({
        record: {
          attachments: [expect.objectContaining({ label: "evidence", artifactRef: null })],
          ticket: { frontmatter: { status: "open" }, closed: false },
        },
      });
    } finally {
      cleanup();
    }
  }, 15000);

});
