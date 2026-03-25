import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { upsertEntityByDisplayIdWithLifecycleEvents } from "../entities.js";
import { selectActiveScope } from "../repository.js";
import {
  PI_LOOM_RUNTIME_REPOSITORY_ID_ENV,
  PI_LOOM_RUNTIME_SPACE_ID_ENV,
  PI_LOOM_RUNTIME_WORKTREE_ID_ENV,
  PI_LOOM_RUNTIME_WORKTREE_PATH_ENV,
  readRuntimeScopeFromEnv,
  readRuntimeScopeFromEnvForCwd,
  resolveEntityRuntimeScope,
  resolveRuntimeScope,
  runtimeScopeToEnv,
} from "../runtime-scope.js";
import { closeAllWorkspaceStorage, openRepositoryWorkspaceStorage, openWorkspaceStorage } from "../workspace.js";
import { createSeededParentGitWorkspace } from "./helpers/git-fixture.js";

describe("runtime scope helpers", () => {
  const cleanupPaths: string[] = [];

  afterEach(() => {
    for (const cleanupPath of cleanupPaths.splice(0)) {
      rmSync(cleanupPath, { recursive: true, force: true });
    }
    delete process.env.PI_LOOM_ROOT;
  });

  it("round-trips runtime scope through environment variables", () => {
    const scope = {
      spaceId: "space-001",
      repositoryId: "repo-001",
      worktreeId: "worktree-001",
      worktreePath: "/tmp/worktree-001",
    };

    expect(runtimeScopeToEnv(scope)).toEqual({
      [PI_LOOM_RUNTIME_SPACE_ID_ENV]: "space-001",
      [PI_LOOM_RUNTIME_REPOSITORY_ID_ENV]: "repo-001",
      [PI_LOOM_RUNTIME_WORKTREE_ID_ENV]: "worktree-001",
      [PI_LOOM_RUNTIME_WORKTREE_PATH_ENV]: "/tmp/worktree-001",
    });
    expect(readRuntimeScopeFromEnv(runtimeScopeToEnv(scope))).toEqual({
      spaceId: "space-001",
      repositoryId: "repo-001",
      worktreeId: "worktree-001",
    });
    expect(readRuntimeScopeFromEnvForCwd("/tmp/worktree-001", runtimeScopeToEnv(scope))).toEqual({
      spaceId: "space-001",
      repositoryId: "repo-001",
      worktreeId: "worktree-001",
    });
    expect(readRuntimeScopeFromEnvForCwd("/tmp/worktree-001/nested", runtimeScopeToEnv(scope))).toEqual({
      spaceId: "space-001",
      repositoryId: "repo-001",
      worktreeId: "worktree-001",
    });
    expect(readRuntimeScopeFromEnvForCwd("/tmp/other-workspace", runtimeScopeToEnv(scope))).toBeUndefined();
    expect(readRuntimeScopeFromEnv({})).toBeUndefined();
  });

  it("ignores parent worktree runtime scope inside nested child worktrees", () => {
    const parentWorktree = mkdtempSync(path.join(tmpdir(), "pi-storage-runtime-parent-worktree-"));
    const childWorktree = path.join(parentWorktree, ".ralph-worktrees", "ralph-ticket-123");
    cleanupPaths.push(parentWorktree);

    mkdirSync(path.join(parentWorktree, ".git"), { recursive: true });
    mkdirSync(path.join(childWorktree, ".git"), { recursive: true });

    const parentScopeEnv = runtimeScopeToEnv({
      spaceId: "space-parent",
      repositoryId: "repo-parent",
      worktreeId: "worktree-parent",
      worktreePath: parentWorktree,
    });
    const childScopeEnv = runtimeScopeToEnv({
      spaceId: "space-parent",
      repositoryId: "repo-parent",
      worktreeId: "worktree-child",
      worktreePath: childWorktree,
    });

    expect(readRuntimeScopeFromEnvForCwd(path.join(parentWorktree, "src"), parentScopeEnv)).toEqual({
      spaceId: "space-parent",
      repositoryId: "repo-parent",
      worktreeId: "worktree-parent",
    });
    expect(readRuntimeScopeFromEnvForCwd(childWorktree, parentScopeEnv)).toBeUndefined();
    expect(readRuntimeScopeFromEnvForCwd(path.join(childWorktree, "nested"), parentScopeEnv)).toBeUndefined();
    expect(readRuntimeScopeFromEnvForCwd(path.join(childWorktree, "nested"), childScopeEnv)).toEqual({
      spaceId: "space-parent",
      repositoryId: "repo-parent",
      worktreeId: "worktree-child",
    });
  });

  it("prefers PWD when the tool host cwd lags behind a nested Ralph worktree", () => {
    const parentWorktree = mkdtempSync(path.join(tmpdir(), "pi-storage-runtime-parent-pwd-"));
    const childWorktree = path.join(parentWorktree, ".ralph-worktrees", "ralph-ticket-456");
    cleanupPaths.push(parentWorktree);

    mkdirSync(path.join(parentWorktree, ".git"), { recursive: true });
    mkdirSync(path.join(childWorktree, ".git"), { recursive: true });

    const parentScopeEnv = {
      ...runtimeScopeToEnv({
        spaceId: "space-parent",
        repositoryId: "repo-parent",
        worktreeId: "worktree-parent",
        worktreePath: parentWorktree,
      }),
      PWD: childWorktree,
    };
    const childScopeEnv = {
      ...runtimeScopeToEnv({
        spaceId: "space-parent",
        repositoryId: "repo-parent",
        worktreeId: "worktree-child",
        worktreePath: childWorktree,
      }),
      PWD: path.join(childWorktree, "nested"),
    };

    expect(readRuntimeScopeFromEnvForCwd(parentWorktree, parentScopeEnv)).toBeUndefined();
    expect(readRuntimeScopeFromEnvForCwd(parentWorktree, childScopeEnv)).toEqual({
      spaceId: "space-parent",
      repositoryId: "repo-parent",
      worktreeId: "worktree-child",
    });
  });

  it("fails closed when runtime scope targets a different Loom space", async () => {
    const workspace = createSeededParentGitWorkspace({
      prefix: "pi-storage-runtime-wrong-space-",
      repositories: [{ name: "service-a", remoteUrl: "git@github.com:example/service-a.git" }],
    });
    const loomRoot = mkdtempSync(path.join(tmpdir(), "pi-storage-runtime-wrong-space-state-"));
    cleanupPaths.push(loomRoot);
    process.env.PI_LOOM_ROOT = loomRoot;

    try {
      const { identity } = await openWorkspaceStorage(workspace.cwd);
      const repositoryId = identity.repository?.id ?? identity.repositories[0]?.id;
      expect(repositoryId).toBeTruthy();
      await expect(resolveRuntimeScope(workspace.cwd, { spaceId: "space-wrong", repositoryId })).rejects.toThrow(
        /targets space space-wrong .* active scope is/i,
      );
    } finally {
      workspace.cleanup();
    }
  }, 15000);

  it("distinguishes canonical repository presence from local clone absence when resolving runtime scope", async () => {
    const workspace = createSeededParentGitWorkspace({
      prefix: "pi-storage-runtime-degraded-",
      repositories: [
        { name: "service-a", remoteUrl: "git@github.com:example/service-a.git" },
        { name: "service-b", remoteUrl: "git@github.com:example/service-b.git" },
      ],
    });
    const loomRoot = mkdtempSync(path.join(tmpdir(), "pi-storage-runtime-degraded-state-"));
    cleanupPaths.push(loomRoot);
    process.env.PI_LOOM_ROOT = loomRoot;

    try {
      const { identity } = await openWorkspaceStorage(workspace.cwd);
      const serviceB = identity.repositories.find((repository) => repository.displayName === "service-b");
      expect(serviceB).toBeDefined();
      if (!serviceB) {
        throw new Error("Missing service-b repository identity");
      }

      const { storage } = await openWorkspaceStorage(workspace.cwd);
      await selectActiveScope(workspace.cwd, { repositoryId: serviceB.id }, storage);
      closeAllWorkspaceStorage();
      rmSync(path.join(workspace.cwd, "service-b"), { recursive: true, force: true });

      await expect(resolveRuntimeScope(workspace.cwd, { repositoryId: serviceB.id })).rejects.toThrow(
        /canonically present .* no locally available worktree/i,
      );
      await expect(resolveRuntimeScope(workspace.cwd, { repositoryId: "repo-missing" })).rejects.toThrow(
        /Unknown repository scope repo-missing/i,
      );
    } finally {
      workspace.cleanup();
    }
  }, 15000);

  it("resolves repository-targeted runtime scope from repository-owned entities in ambiguous parent workspaces", async () => {
    const workspace = createSeededParentGitWorkspace({
      prefix: "pi-storage-runtime-scope-",
      repositories: [
        { name: "service-a", remoteUrl: "git@github.com:example/service-a.git" },
        { name: "service-b", remoteUrl: "git@github.com:example/service-b.git" },
      ],
    });
    const loomRoot = mkdtempSync(path.join(tmpdir(), "pi-storage-runtime-scope-state-"));
    cleanupPaths.push(loomRoot);
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

      const { storage, identity: scopedIdentity } = await openRepositoryWorkspaceStorage(workspace.cwd, {
        repositoryId: serviceA.id,
      });
      await upsertEntityByDisplayIdWithLifecycleEvents(
        storage,
        {
          kind: "documentation",
          spaceId: scopedIdentity.space.id,
          owningRepositoryId: scopedIdentity.repository.id,
          displayId: "runtime-scope-doc",
          title: "Runtime scope doc",
          summary: "Seed runtime scope resolution.",
          status: "active",
          version: 1,
          tags: ["test"],
          attributes: { snapshot: { state: {}, revisions: [], documentBody: "" } },
          createdAt: "2026-03-24T00:00:00.000Z",
          updatedAt: "2026-03-24T00:00:00.000Z",
        },
        {
          actor: "test",
          createdPayload: { change: "seed_runtime_scope" },
          updatedPayload: { change: "seed_runtime_scope" },
        },
      );

      await expect(
        resolveEntityRuntimeScope(workspace.cwd, "documentation", "runtime-scope-doc"),
      ).resolves.toMatchObject({
        spaceId: identity.space.id,
        repositoryId: serviceA.id,
        worktreeId: scopedIdentity.worktree.id,
      });
    } finally {
      workspace.cleanup();
    }
  }, 15000);
});
