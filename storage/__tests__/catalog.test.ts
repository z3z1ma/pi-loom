import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LoomRuntimeAttachment } from "../contract.js";
import { createEntityId, createLinkId, createRepositoryId } from "../ids.js";
import { ensureLoomCatalogDirs, getLoomCatalogPaths } from "../locations.js";
import {
  clearPersistedScopeBinding,
  discoverWorkspaceScope,
  enrollRepositoryInScope,
  readPersistedScopeBinding,
  resolveWorkspaceIdentity,
  selectActiveScope,
  unenrollRepositoryInScope,
} from "../repository.js";
import { SqliteLoomCatalog } from "../sqlite.js";
import { exportSyncBundle, hydrateSyncBundle } from "../sync.js";
import { openWorkspaceStorage } from "../workspace.js";
import { createSeededGitWorkspace, createSeededParentGitWorkspace, runTestGit } from "./helpers/git-fixture.js";

function createWorkspace(): { cwd: string; cleanup: () => void } {
  return createSeededGitWorkspace({
    prefix: "pi-storage-workspace-",
    packageName: "pi-loom-fixture",
    remoteUrl: "git@github.com:example/pi-loom.git",
    piLoomRoot: false,
  });
}

function createParentWorkspaceWithChildren(): { cwd: string; repositories: string[]; cleanup: () => void } {
  return createSeededParentGitWorkspace({
    prefix: "pi-storage-parent-workspace-",
    repositories: [
      { name: "service-a", remoteUrl: "git@github.com:example/service-a.git" },
      { name: "service-b", remoteUrl: "git@github.com:example/service-b.git" },
    ],
  });
}

function createParentWorkspaceWithSiblingClones(): { cwd: string; repositories: string[]; cleanup: () => void } {
  return createSeededParentGitWorkspace({
    prefix: "pi-storage-parent-clones-",
    repositories: [
      { name: "service-a", remoteUrl: "git@github.com:example/service-a.git" },
      { name: "service-a-clone", remoteUrl: "git@github.com:example/service-a.git" },
    ],
  });
}

async function seedCanonicalCatalog(
  cwd: string,
  catalog: SqliteLoomCatalog,
): Promise<{ entityIds: string[]; runtimeAttachment: LoomRuntimeAttachment }> {
  const identity = resolveWorkspaceIdentity(cwd);
  if (!identity.repository || !identity.worktree) {
    throw new Error("Expected unambiguous repository and worktree identity when seeding canonical catalog.");
  }
  const timestamps = {
    createdAt: identity.space.createdAt,
    updatedAt: identity.space.updatedAt,
  };

  await catalog.upsertSpace(identity.space);
  await catalog.upsertRepository(identity.repository);
  await catalog.upsertWorktree(identity.worktree);

  const constitutionId = createEntityId("constitution", identity.space.id, "constitution", "constitution");
  const ticketId = createEntityId("ticket", identity.space.id, "t-9001", "t-9001");
  const initiativeId = createEntityId("initiative", identity.space.id, "storage-migration", "storage-migration");

  await catalog.upsertEntity({
    id: constitutionId,
    kind: "constitution",
    spaceId: identity.space.id,
    owningRepositoryId: identity.repository.id,
    displayId: "constitution",
    title: "Constitution",
    summary: "Constitution brief.",
    status: "active",
    version: 1,
    tags: ["constitution"],
    attributes: {},
    ...timestamps,
  });
  await catalog.upsertEntity({
    id: initiativeId,
    kind: "initiative",
    spaceId: identity.space.id,
    owningRepositoryId: identity.repository.id,
    displayId: "storage-migration",
    title: "Storage Migration",
    summary: "Canonical initiative record.",
    status: "active",
    version: 1,
    tags: ["initiative"],
    attributes: {},
    ...timestamps,
  });
  await catalog.upsertEntity({
    id: ticketId,
    kind: "ticket",
    spaceId: identity.space.id,
    owningRepositoryId: identity.repository.id,
    displayId: "t-9001",
    title: "Migrate storage",
    summary: "SQLite-only ticket.",
    status: "open",
    version: 1,
    tags: ["ticket"],
    attributes: {},
    ...timestamps,
  });

  await catalog.upsertLink({
    id: createLinkId("belongs_to", ticketId, initiativeId),
    kind: "belongs_to",
    fromEntityId: ticketId,
    toEntityId: initiativeId,
    metadata: {},
    ...timestamps,
  });
  await catalog.appendEvent({
    id: "event-ticket-created",
    entityId: ticketId,
    kind: "created",
    sequence: 1,
    createdAt: timestamps.createdAt,
    actor: "test",
    payload: { status: "open" },
  });

  const runtimeAttachment: LoomRuntimeAttachment = {
    id: "runtime-worker-1",
    worktreeId: identity.worktree.id,
    kind: "worker_runtime",
    locator: "worker-runtime:runtime-worker",
    processId: 1001,
    leaseExpiresAt: "2026-03-16T00:05:00.000Z",
    metadata: { workerId: "runtime-worker" },
    ...timestamps,
  };
  await catalog.upsertRuntimeAttachment(runtimeAttachment);

  return { entityIds: [constitutionId, initiativeId, ticketId], runtimeAttachment };
}

describe("pi-storage sqlite catalog backup flow", () => {
  const cleanupPaths: string[] = [];

  afterEach(() => {
    for (const cleanupPath of cleanupPaths.splice(0)) {
      rmSync(cleanupPath, { recursive: true, force: true });
    }
    delete process.env.PI_LOOM_ROOT;
  });

  it("creates stable repository ids and opaque entity ids", () => {
    const repoIdA = createRepositoryId(["git@github.com:example/pi-loom.git"], "fallback");
    const repoIdB = createRepositoryId(["git@github.com:example/pi-loom.git"], "different-fallback");
    const entityIdA = createEntityId("ticket", "space_core", "t-0045", "ticket:t-0045");
    const entityIdB = createEntityId("ticket", "space_core", "t-0045", "ticket:t-0045");

    expect(repoIdA).toBe(repoIdB);
    expect(entityIdA).toMatch(/^ticket_[0-9a-f]{16}$/);
    expect(entityIdB).toMatch(/^ticket_[0-9a-f]{16}$/);
    expect(entityIdA).not.toBe(entityIdB);
  });

  it("resolves repository identity independent of checkout location when a remote exists", () => {
    const { cwd, cleanup } = createWorkspace();
    cleanupPaths.push(cwd);
    try {
      const identity = resolveWorkspaceIdentity(cwd);
      expect(identity.repository).toBeTruthy();
      expect(identity.worktree).toBeTruthy();
      expect(identity.activeScope.isAmbiguous).toBe(false);
      expect(identity.repository?.remoteUrls).toEqual(["git@github.com:example/pi-loom.git"]);
      expect(identity.repository?.id).toContain("repo_");
      expect(identity.worktree?.repositoryId).toBe(identity.repository?.id);
      expect(identity.space.repositoryIds).toEqual([identity.repository?.id]);
      expect(identity.worktree?.logicalKey.startsWith("worktree:")).toBe(true);
      expect(identity.worktree?.logicalKey.startsWith("/")).toBe(false);
    } finally {
      cleanup();
    }
  }, 15000);

  it("surfaces an ambiguous active scope instead of inventing a parent-directory repository when multiple child repos exist", () => {
    const { cwd, repositories, cleanup } = createParentWorkspaceWithChildren();
    cleanupPaths.push(cwd);
    try {
      expect(repositories).toHaveLength(2);
      const identity = resolveWorkspaceIdentity(cwd);
      expect(identity.space.title).toContain("pi-storage-parent-workspace-");
      expect(identity.repositories.map((repository) => repository.displayName).sort()).toEqual([
        "service-a",
        "service-b",
      ]);
      expect(identity.space.repositoryIds).toHaveLength(2);
      expect(identity.activeScope.isAmbiguous).toBe(true);
      expect(identity.activeScope.repositoryId).toBeNull();
      expect(identity.activeScope.worktreeId).toBeNull();
    } finally {
      cleanup();
    }
  }, 15000);

  it("keeps same-repository clones on the same branch as distinct worktrees", () => {
    const first = createWorkspace();
    const second = createWorkspace();
    cleanupPaths.push(first.cwd, second.cwd);
    try {
      const firstIdentity = resolveWorkspaceIdentity(first.cwd);
      const secondIdentity = resolveWorkspaceIdentity(second.cwd);
      expect(firstIdentity.repository?.id).toBe(secondIdentity.repository?.id);
      expect(firstIdentity.worktree?.id).not.toBe(secondIdentity.worktree?.id);
      expect(firstIdentity.worktree?.logicalKey).not.toBe(secondIdentity.worktree?.logicalKey);
    } finally {
      first.cleanup();
      second.cleanup();
    }
  }, 15000);

  it("keeps sibling clones of the same repository distinct under one parent workspace", async () => {
    const { cwd, repositories, cleanup } = createParentWorkspaceWithSiblingClones();
    cleanupPaths.push(cwd);
    process.env.PI_LOOM_ROOT = mkdtempSync(path.join(tmpdir(), "pi-storage-parent-clones-state-"));
    cleanupPaths.push(process.env.PI_LOOM_ROOT);
    try {
      expect(repositories).toHaveLength(2);
      const { identity } = await openWorkspaceStorage(cwd);
      expect(identity.space.repositoryIds).toHaveLength(1);
      expect(identity.repositories).toHaveLength(1);
      expect(identity.worktrees).toHaveLength(2);
      expect(identity.repository?.id).toBe(identity.repositories[0]?.id);
      expect(identity.worktree).toBeTruthy();

      const [firstWorktree, secondWorktree] = [...identity.worktrees].sort((left, right) =>
        left.logicalKey.localeCompare(right.logicalKey),
      );
      expect(firstWorktree?.repositoryId).toBe(identity.repositories[0]?.id);
      expect(secondWorktree?.repositoryId).toBe(identity.repositories[0]?.id);
      expect(firstWorktree?.id).not.toBe(secondWorktree?.id);
      expect(firstWorktree?.logicalKey).not.toBe(secondWorktree?.logicalKey);
    } finally {
      cleanup();
    }
  }, 15000);

  it("uses a valid persisted binding to resolve an ambiguous parent-directory startup", async () => {
    const { cwd, cleanup } = createParentWorkspaceWithChildren();
    cleanupPaths.push(cwd);
    process.env.PI_LOOM_ROOT = mkdtempSync(path.join(tmpdir(), "pi-storage-scope-binding-"));
    cleanupPaths.push(process.env.PI_LOOM_ROOT);
    try {
      const { storage } = await openWorkspaceStorage(cwd);
      const initial = await discoverWorkspaceScope(cwd, storage);
      expect(initial.identity.activeScope.isAmbiguous).toBe(true);
      const selectedRepositoryId = initial.enrolledRepositories[0]?.repository.id;
      expect(selectedRepositoryId).toBeTruthy();
      const selected = await selectActiveScope(cwd, { repositoryId: selectedRepositoryId }, storage);
      expect(selected.activeScope.isAmbiguous).toBe(false);
      expect(selected.activeScope.bindingSource).toBe("persisted");
      expect(selected.repository?.id).toBe(selectedRepositoryId);

      const reopened = (await discoverWorkspaceScope(cwd, storage)).identity;
      expect(reopened.activeScope.isAmbiguous).toBe(false);
      expect(reopened.activeScope.bindingSource).toBe("persisted");
      expect(reopened.repository?.id).toBe(selectedRepositoryId);
    } finally {
      clearPersistedScopeBinding(cwd);
      cleanup();
    }
  }, 45000);

  it("surfaces contradictory persisted bindings as diagnostics instead of silently overriding live discovery", async () => {
    const first = createParentWorkspaceWithChildren();
    const second = createParentWorkspaceWithChildren();
    cleanupPaths.push(first.cwd, second.cwd);
    process.env.PI_LOOM_ROOT = mkdtempSync(path.join(tmpdir(), "pi-storage-scope-contradiction-"));
    cleanupPaths.push(process.env.PI_LOOM_ROOT);
    try {
      const { storage } = await openWorkspaceStorage(first.cwd);
      const initial = await discoverWorkspaceScope(first.cwd, storage);
      const selectedRepositoryId = initial.enrolledRepositories[0]?.repository.id;
      expect(selectedRepositoryId).toBeTruthy();
      await selectActiveScope(first.cwd, { repositoryId: selectedRepositoryId }, storage);
      expect(readPersistedScopeBinding(first.cwd)?.spaceId).toBe(initial.identity.space.id);

      const contradicted = await discoverWorkspaceScope(second.cwd, storage);
      expect(contradicted.identity.activeScope.isAmbiguous).toBe(true);
      expect(contradicted.identity.space.id).not.toBe(initial.identity.space.id);
      expect(contradicted.identity.repository).toBeNull();
      expect(contradicted.binding).toBeNull();
    } finally {
      clearPersistedScopeBinding(first.cwd);
      clearPersistedScopeBinding(second.cwd);
      first.cleanup();
      second.cleanup();
    }
  }, 45000);

  it("distinguishes enrolled repositories from discovered unenrolled candidates and keeps discovery bounded to direct children", async () => {
    const { cwd, cleanup } = createParentWorkspaceWithChildren();
    cleanupPaths.push(cwd);
    process.env.PI_LOOM_ROOT = mkdtempSync(path.join(tmpdir(), "pi-storage-scope-enrollment-"));
    cleanupPaths.push(process.env.PI_LOOM_ROOT);
    try {
      const nestedGrandchild = path.join(cwd, "service-a", "nested-grandchild");
      mkdirSync(nestedGrandchild, { recursive: true });
      runTestGit(nestedGrandchild, "init");

      const { storage } = await openWorkspaceStorage(cwd);
      const initial = await discoverWorkspaceScope(cwd, storage);
      expect(initial.enrolledRepositories).toHaveLength(2);
      expect(initial.candidateRepositories).toHaveLength(0);
      const repositoryToUnenroll = initial.enrolledRepositories[1]?.repository.id;
      expect(repositoryToUnenroll).toBeTruthy();

      const afterUnenroll = await unenrollRepositoryInScope(cwd, repositoryToUnenroll as string, storage);
      expect(afterUnenroll.enrolledRepositories).toHaveLength(1);
      expect(afterUnenroll.candidateRepositories).toHaveLength(1);
      expect(afterUnenroll.candidateRepositories[0]?.repository.id).toBe(repositoryToUnenroll);
      expect(
        afterUnenroll.enrolledRepositories
          .concat(afterUnenroll.candidateRepositories)
          .map((entry) => entry.repository.displayName)
          .sort(),
      ).toEqual(["service-a", "service-b"]);

      const reenrolled = await enrollRepositoryInScope(cwd, repositoryToUnenroll as string, storage);
      expect(reenrolled.enrolledRepositories).toHaveLength(2);
      expect(reenrolled.candidateRepositories).toHaveLength(0);
    } finally {
      clearPersistedScopeBinding(cwd);
      cleanup();
    }
  }, 45000);

  it("exports sqlite-backed state into an explicit backup bundle without materializing workspace files", async () => {
    const { cwd, cleanup } = createWorkspace();
    cleanupPaths.push(cwd);
    const catalogRoot = mkdtempSync(path.join(tmpdir(), "pi-storage-catalog-"));
    cleanupPaths.push(catalogRoot);
    process.env.PI_LOOM_ROOT = catalogRoot;
    ensureLoomCatalogDirs(getLoomCatalogPaths());

    const sourceCatalog = new SqliteLoomCatalog();
    try {
      const seeded = await seedCanonicalCatalog(cwd, sourceCatalog);
      const bundleDir = mkdtempSync(path.join(tmpdir(), "pi-storage-catalog-bundle-"));
      cleanupPaths.push(bundleDir);
      const exported = await exportSyncBundle(cwd, sourceCatalog, bundleDir);

      expect(exported.files).toEqual(
        expect.arrayContaining([
          "bundle.json",
          "spaces.json",
          "repositories.json",
          "worktrees.json",
          "entities.json",
          "links.json",
          "events.json",
          "runtime-attachments.json",
        ]),
      );
      expect(JSON.parse(readFileSync(path.join(bundleDir, "bundle.json"), "utf-8"))).toMatchObject({
        spaceId: exported.bundle.spaceId,
        partial: false,
        scope: { kind: "space" },
      });

      const targetCatalogRoot = mkdtempSync(path.join(tmpdir(), "pi-storage-catalog-target-"));
      cleanupPaths.push(targetCatalogRoot);
      process.env.PI_LOOM_ROOT = targetCatalogRoot;
      ensureLoomCatalogDirs(getLoomCatalogPaths());
      const targetCatalog = new SqliteLoomCatalog();
      try {
        const hydrated = await hydrateSyncBundle(targetCatalog, bundleDir);
        expect(hydrated.bundle).toEqual(exported.bundle);
        expect(hydrated.hydratedEntityIds).toEqual(
          seeded.entityIds.slice().sort((left, right) => left.localeCompare(right)),
        );
        expect(await targetCatalog.listRuntimeAttachments(seeded.runtimeAttachment.worktreeId)).toEqual([
          seeded.runtimeAttachment,
        ]);
        const ticketEntity = (await targetCatalog.listEntities()).find((entity) => entity.displayId === "t-9001");
        expect(ticketEntity).toMatchObject({ title: "Migrate storage", status: "open" });
        expect(await targetCatalog.listLinks(ticketEntity?.id ?? "missing")).toEqual([
          expect.objectContaining({ kind: "belongs_to" }),
        ]);
      } finally {
        targetCatalog.close();
      }
    } finally {
      sourceCatalog.close();
      cleanup();
    }
  }, 15000);
});
