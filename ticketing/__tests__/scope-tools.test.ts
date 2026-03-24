import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { createSeededParentGitWorkspace } from "#storage/__tests__/helpers/git-fixture.js";
import { discoverWorkspaceScope, selectActiveScope, writePersistedScopeBinding } from "#storage/repository.js";
import { closeAllWorkspaceStorage, openWorkspaceStorage } from "#storage/workspace.js";

vi.mock("@mariozechner/pi-ai", () => ({
  StringEnum: (values: readonly string[]) => ({ type: "string", enum: [...values] }),
}));

vi.mock("@sinclair/typebox", () => ({
  Type: {
    Array: (value: unknown) => ({ type: "array", items: value }),
    Boolean: (options?: Record<string, unknown>) => ({ type: "boolean", ...(options ?? {}) }),
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

function firstTextContent(result: { content?: Array<{ type: string; text?: string }> }): string {
  return result.content?.find((entry) => entry.type === "text" && typeof entry.text === "string")?.text ?? "";
}

function createParentWorkspaceWithChildren(): { cwd: string; cleanup: () => void } {
  const workspace = createSeededParentGitWorkspace({
    prefix: "pi-ticket-scope-tools-",
    repositories: [
      { name: "service-a", remoteUrl: "git@github.com:example/service-a.git" },
      { name: "service-b", remoteUrl: "git@github.com:example/service-b.git" },
    ],
  });
  return {
    cwd: workspace.cwd,
    cleanup: () => {
      closeAllWorkspaceStorage();
      workspace.cleanup();
    },
  };
}

describe("scope tools", () => {
  it("registers scope_read and scope_write alongside ticket tools", async () => {
    const mockPi = createMockPi();
    const { registerScopeTools } = await import("../tools/scope.js");
    registerScopeTools(mockPi as unknown as ExtensionAPI);

    expect([...mockPi.tools.keys()].sort()).toEqual(["scope_read", "scope_write"]);
    expect(getTool(mockPi, "scope_read").promptSnippet).toContain("multi-repository scope");
    expect(getTool(mockPi, "scope_write").promptGuidelines).toContain(
      "Select only enrolled repositories; enroll a discovered candidate first instead of silently promoting it.",
    );
  });

  it("reads, selects, revokes, unenrolls, and reenrolls scope through headless tools", async () => {
    const workspace = createParentWorkspaceWithChildren();
    const loomRoot = mkdtempSync(join(tmpdir(), "pi-ticket-scope-state-"));
    process.env.PI_LOOM_ROOT = loomRoot;
    try {
      const mockPi = createMockPi();
      const { registerScopeTools } = await import("../tools/scope.js");
      registerScopeTools(mockPi as unknown as ExtensionAPI);
      const ctx = createContext(workspace.cwd);
      const scopeRead = getTool(mockPi, "scope_read");
      const scopeWrite = getTool(mockPi, "scope_write");

      const initial = await scopeRead.execute("call-1", {}, undefined, undefined, ctx);
      expect(initial.details).toMatchObject({
        scope: {
          identity: { activeScope: { isAmbiguous: true, repositoryId: null } },
          enrolledRepositories: expect.arrayContaining([
            expect.objectContaining({ repository: expect.objectContaining({ displayName: "service-a" }) }),
            expect.objectContaining({ repository: expect.objectContaining({ displayName: "service-b" }) }),
          ]),
          candidateRepositories: [],
        },
        scopeSummary: {
          activeScope: {
            state: "ambiguous",
            repository: null,
            worktree: null,
            ambiguityReason: expect.stringContaining("Multiple repositories"),
          },
          discovery: { startedInsideRepository: false, enrolledRepositoryCount: 2, unenrolledCandidateCount: 0 },
          persistedBinding: { status: "none" },
        },
      });
      expect(firstTextContent(initial)).toContain(
        "Discovery: startedInsideRepository=no activeRepositorySource=(none)",
      );
      expect(firstTextContent(initial)).toContain("Persisted binding: none");

      const firstRepositoryId = (
        initial.details as { scope: { enrolledRepositories: Array<{ repository: { id: string } }> } }
      ).scope.enrolledRepositories[0]?.repository.id;
      expect(firstRepositoryId).toBeTruthy();

      const selected = await scopeWrite.execute(
        "call-2",
        { action: "select", repositoryId: firstRepositoryId },
        undefined,
        undefined,
        ctx,
      );
      expect(selected.details).toMatchObject({
        action: "select",
        identity: { activeScope: { isAmbiguous: false, bindingSource: "persisted", repositoryId: firstRepositoryId } },
        scopeSummary: {
          activeScope: { state: "resolved", repository: { id: firstRepositoryId } },
          persistedBinding: { status: "active", source: "persisted", repositoryId: firstRepositoryId },
        },
      });
      expect(firstTextContent(selected)).toContain("Action: select");
      expect(firstTextContent(selected)).toContain("Persisted binding: active source=persisted");

      const revoked = await scopeWrite.execute("call-3", { action: "revoke" }, undefined, undefined, ctx);
      expect(revoked.details).toMatchObject({
        action: "revoke",
        scope: { identity: { activeScope: { isAmbiguous: true, repositoryId: null } } },
      });

      const unenrolled = await scopeWrite.execute(
        "call-4",
        { action: "unenroll", repositoryId: firstRepositoryId },
        undefined,
        undefined,
        ctx,
      );
      expect(unenrolled.details).toMatchObject({
        action: "unenroll",
        scope: {
          enrolledRepositories: [
            expect.not.objectContaining({ repository: expect.objectContaining({ id: firstRepositoryId }) }),
          ],
          candidateRepositories: expect.arrayContaining([
            expect.objectContaining({ repository: expect.objectContaining({ id: firstRepositoryId }) }),
          ]),
        },
      });

      const reenrolled = await scopeWrite.execute(
        "call-5",
        { action: "enroll", repositoryId: firstRepositoryId },
        undefined,
        undefined,
        ctx,
      );
      expect(reenrolled.details).toMatchObject({
        action: "enroll",
        scope: {
          enrolledRepositories: expect.arrayContaining([
            expect.objectContaining({ repository: expect.objectContaining({ id: firstRepositoryId }) }),
          ]),
        },
      });
    } finally {
      delete process.env.PI_LOOM_ROOT;
      closeAllWorkspaceStorage();
      workspace.cleanup();
      rmSync(loomRoot, { recursive: true, force: true });
    }
  }, 20000);

  it("surfaces ignored stale persisted bindings in headless scope diagnostics", async () => {
    const workspace = createParentWorkspaceWithChildren();
    const loomRoot = mkdtempSync(join(tmpdir(), "pi-ticket-scope-stale-binding-"));
    process.env.PI_LOOM_ROOT = loomRoot;
    try {
      const mockPi = createMockPi();
      const { registerScopeTools } = await import("../tools/scope.js");
      registerScopeTools(mockPi as unknown as ExtensionAPI);
      const ctx = createContext(workspace.cwd);
      const scopeRead = getTool(mockPi, "scope_read");
      const { storage } = await openWorkspaceStorage(workspace.cwd);
      const discovered = await discoverWorkspaceScope(workspace.cwd, storage);

      writePersistedScopeBinding({
        scopeRoot: workspace.cwd,
        spaceId: discovered.identity.space.id,
        repositoryId: "repo-missing",
        worktreeId: null,
        bindingSource: "persisted",
        selectedAt: "2026-03-24T08:30:00.000Z",
        staleReason: null,
      });

      const result = await scopeRead.execute("call-stale", {}, undefined, undefined, ctx);
      expect(result.details).toMatchObject({
        scopeSummary: {
          activeScope: { state: "ambiguous" },
          persistedBinding: { status: "ignored", source: "persisted", repositoryId: "repo-missing" },
        },
      });
      expect(
        (result.details as { scopeSummary: { diagnostics: Array<{ kind: string }> } }).scopeSummary.diagnostics,
      ).toContainEqual(expect.objectContaining({ kind: "stale_binding" }));
      expect(firstTextContent(result)).toContain("Persisted binding: ignored source=persisted repository=repo-missing");
      expect(firstTextContent(result)).toContain(
        "[stale_binding] Persisted repository binding repo-missing is stale and was ignored.",
      );
    } finally {
      delete process.env.PI_LOOM_ROOT;
      closeAllWorkspaceStorage();
      workspace.cleanup();
      rmSync(loomRoot, { recursive: true, force: true });
    }
  }, 20000);

  it("surfaces selected repository unavailability without hiding the active binding", async () => {
    const workspace = createParentWorkspaceWithChildren();
    const loomRoot = mkdtempSync(join(tmpdir(), "pi-ticket-scope-unavailable-binding-"));
    process.env.PI_LOOM_ROOT = loomRoot;
    try {
      const mockPi = createMockPi();
      const { registerScopeTools } = await import("../tools/scope.js");
      registerScopeTools(mockPi as unknown as ExtensionAPI);
      const ctx = createContext(workspace.cwd);
      const scopeRead = getTool(mockPi, "scope_read");
      const { storage } = await openWorkspaceStorage(workspace.cwd);
      const discovered = await discoverWorkspaceScope(workspace.cwd, storage);
      const selectedRepositoryId = discovered.enrolledRepositories.find(
        (entry) => entry.repository.displayName === "service-b",
      )?.repository.id;
      expect(selectedRepositoryId).toBeTruthy();

      await selectActiveScope(workspace.cwd, { repositoryId: selectedRepositoryId }, storage);
      closeAllWorkspaceStorage();
      rmSync(join(workspace.cwd, "service-b"), { recursive: true, force: true });

      const result = await scopeRead.execute("call-unavailable", {}, undefined, undefined, ctx);
      expect(result.details).toMatchObject({
        scopeSummary: {
          activeScope: { state: "resolved", repository: { id: selectedRepositoryId, locallyAvailable: false } },
          persistedBinding: { status: "active", source: "persisted", repositoryId: selectedRepositoryId },
        },
      });
      expect(
        (result.details as { scopeSummary: { diagnostics: Array<{ kind: string }> } }).scopeSummary.diagnostics,
      ).toContainEqual(expect.objectContaining({ kind: "repository_unavailable" }));
      expect(firstTextContent(result)).toContain("Persisted binding: active source=persisted");
      expect(firstTextContent(result)).toContain("availability=unavailable:");
      expect(firstTextContent(result)).toContain("[repository_unavailable]");
    } finally {
      delete process.env.PI_LOOM_ROOT;
      closeAllWorkspaceStorage();
      workspace.cleanup();
      rmSync(loomRoot, { recursive: true, force: true });
    }
  }, 30000);
});
