import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { closeAllWorkspaceStorage } from "#storage/workspace.js";

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

function createParentWorkspaceWithChildren(): { cwd: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "pi-ticket-scope-tools-"));
  const createRepository = (name: string, remoteUrl: string) => {
    const repoRoot = join(root, name);
    mkdirSync(repoRoot, { recursive: true });
    execFileSync("git", ["init"], { cwd: repoRoot, encoding: "utf-8" });
    execFileSync("git", ["config", "user.name", "Pi Loom Tests"], { cwd: repoRoot, encoding: "utf-8" });
    execFileSync("git", ["config", "user.email", "tests@example.com"], { cwd: repoRoot, encoding: "utf-8" });
    execFileSync("git", ["remote", "add", "origin", remoteUrl], { cwd: repoRoot, encoding: "utf-8" });
    writeFileSync(join(repoRoot, "package.json"), `${JSON.stringify({ name })}\n`, "utf-8");
    writeFileSync(join(repoRoot, "README.md"), "seed\n", "utf-8");
    execFileSync("git", ["add", "."], { cwd: repoRoot, encoding: "utf-8" });
    execFileSync("git", ["commit", "-m", "seed"], { cwd: repoRoot, encoding: "utf-8" });
  };
  createRepository("service-a", "git@github.com:example/service-a.git");
  createRepository("service-b", "git@github.com:example/service-b.git");
  return {
    cwd: root,
    cleanup: () => {
      closeAllWorkspaceStorage();
      rmSync(root, { recursive: true, force: true });
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
      });

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
      });

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
});
