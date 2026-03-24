import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LoomRuntimeAttachment } from "../contract.js";
import { createEntityId } from "../ids.js";
import { ensureLoomCatalogDirs, getLoomCatalogPaths } from "../locations.js";
import { discoverWorkspaceScope, requireResolvedRepositoryIdentity, resolveWorkspaceIdentity } from "../repository.js";
import { SqliteLoomCatalog } from "../sqlite.js";
import { exportSyncBundle, hydrateSyncBundle } from "../sync.js";
import { createSeededGitWorkspace, createSeededParentGitWorkspace } from "./helpers/git-fixture.js";

function createWorkspace(): { cwd: string; cleanup: () => void } {
  return createSeededGitWorkspace({
    prefix: "pi-storage-sync-workspace-",
    packageName: "pi-loom-sync-fixture",
    remoteUrl: "git@github.com:example/pi-loom.git",
    piLoomRoot: false,
  });
}

function createParentWorkspaceWithChildren(): { cwd: string; repositories: string[]; cleanup: () => void } {
  return createSeededParentGitWorkspace({
    prefix: "pi-storage-sync-parent-",
    repositories: [
      { name: "service-a", remoteUrl: "git@github.com:example/service-a.git" },
      { name: "service-b", remoteUrl: "git@github.com:example/service-b.git" },
    ],
  });
}

async function seedCanonicalCatalog(
  cwd: string,
  catalog: SqliteLoomCatalog,
): Promise<{ entityIds: string[]; runtimeAttachment: LoomRuntimeAttachment }> {
  const identity = requireResolvedRepositoryIdentity(resolveWorkspaceIdentity(cwd));
  const timestamps = {
    createdAt: identity.space.createdAt,
    updatedAt: identity.space.updatedAt,
  };

  await catalog.upsertSpace(identity.space);
  await catalog.upsertRepository(identity.repository);
  await catalog.upsertWorktree(identity.worktree);

  const constitutionId = createEntityId("constitution", identity.space.id, "constitution", "constitution");
  const specId = createEntityId("spec_change", identity.space.id, "db-migration", "db-migration");

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
    id: specId,
    kind: "spec_change",
    spaceId: identity.space.id,
    owningRepositoryId: identity.repository.id,
    displayId: "db-migration",
    title: "DB Migration",
    summary: "Main proposal body.",
    status: "specified",
    version: 1,
    tags: ["spec_change"],
    attributes: { stage: "specified" },
    ...timestamps,
  });

  await catalog.appendEvent({
    id: "event-spec-created",
    entityId: specId,
    kind: "created",
    sequence: 1,
    createdAt: timestamps.createdAt,
    actor: "test",
    payload: { status: "specified" },
  });

  const runtimeAttachment: LoomRuntimeAttachment = {
    id: "runtime-spec-worker",
    worktreeId: identity.worktree.id,
    kind: "worker_runtime",
    locator: "worker-runtime:db-migration",
    processId: 2002,
    leaseExpiresAt: "2026-03-16T00:10:00.000Z",
    metadata: { specId },
    ...timestamps,
  };
  await catalog.upsertRuntimeAttachment(runtimeAttachment);

  return { entityIds: [constitutionId, specId], runtimeAttachment };
}

async function seedMultiRepositoryCatalog(
  cwd: string,
  catalog: SqliteLoomCatalog,
): Promise<{
  spaceId: string;
  repositories: { serviceA: string; serviceB: string };
  worktrees: { serviceA: string; serviceB: string };
  entities: { serviceA: string; serviceB: string };
  runtimeAttachments: LoomRuntimeAttachment[];
}> {
  const discovery = await discoverWorkspaceScope(cwd, catalog);
  const serviceA = discovery.enrolledRepositories.find((entry) => entry.repository.displayName === "service-a");
  const serviceB = discovery.enrolledRepositories.find((entry) => entry.repository.displayName === "service-b");
  if (!serviceA?.worktrees[0] || !serviceB?.worktrees[0]) {
    throw new Error("Expected both repositories to resolve to worktrees in the shared space.");
  }

  const timestamps = {
    createdAt: discovery.identity.space.createdAt,
    updatedAt: discovery.identity.space.updatedAt,
  };
  const serviceATicketId = createEntityId("ticket", discovery.identity.space.id, "svc-a-ticket", "svc-a-ticket");
  const serviceBTicketId = createEntityId("ticket", discovery.identity.space.id, "svc-b-ticket", "svc-b-ticket");

  await catalog.upsertEntity({
    id: serviceATicketId,
    kind: "ticket",
    spaceId: discovery.identity.space.id,
    owningRepositoryId: serviceA.repository.id,
    displayId: "svc-a-ticket",
    title: "Service A ticket",
    summary: "A repo-scoped ticket in service A.",
    status: "open",
    version: 1,
    tags: ["ticket"],
    attributes: { repository: "service-a" },
    ...timestamps,
  });
  await catalog.upsertEntity({
    id: serviceBTicketId,
    kind: "ticket",
    spaceId: discovery.identity.space.id,
    owningRepositoryId: serviceB.repository.id,
    displayId: "svc-b-ticket",
    title: "Service B ticket",
    summary: "A repo-scoped ticket in service B.",
    status: "open",
    version: 1,
    tags: ["ticket"],
    attributes: { repository: "service-b" },
    ...timestamps,
  });

  await catalog.upsertLink({
    id: `link-${serviceATicketId}-depends-on-${serviceBTicketId}`,
    kind: "depends_on",
    fromEntityId: serviceATicketId,
    toEntityId: serviceBTicketId,
    metadata: { scope: "cross-repository" },
    ...timestamps,
  });

  await catalog.appendEvent({
    id: "event-service-a-created",
    entityId: serviceATicketId,
    kind: "created",
    sequence: 1,
    createdAt: timestamps.createdAt,
    actor: "test",
    payload: { repository: "service-a" },
  });
  await catalog.appendEvent({
    id: "event-service-b-created",
    entityId: serviceBTicketId,
    kind: "created",
    sequence: 1,
    createdAt: timestamps.createdAt,
    actor: "test",
    payload: { repository: "service-b" },
  });

  const runtimeAttachments: LoomRuntimeAttachment[] = [
    {
      id: "runtime-service-a",
      worktreeId: serviceA.worktrees[0].id,
      kind: "worker_runtime",
      locator: "worker-runtime:service-a",
      processId: 301,
      leaseExpiresAt: "2026-03-16T00:10:00.000Z",
      metadata: { repository: "service-a" },
      ...timestamps,
    },
    {
      id: "runtime-service-b",
      worktreeId: serviceB.worktrees[0].id,
      kind: "worker_runtime",
      locator: "worker-runtime:service-b",
      processId: 302,
      leaseExpiresAt: "2026-03-16T00:20:00.000Z",
      metadata: { repository: "service-b" },
      ...timestamps,
    },
  ];
  for (const attachment of runtimeAttachments) {
    await catalog.upsertRuntimeAttachment(attachment);
  }

  return {
    spaceId: discovery.identity.space.id,
    repositories: { serviceA: serviceA.repository.id, serviceB: serviceB.repository.id },
    worktrees: { serviceA: serviceA.worktrees[0].id, serviceB: serviceB.worktrees[0].id },
    entities: { serviceA: serviceATicketId, serviceB: serviceBTicketId },
    runtimeAttachments,
  };
}

describe("pi-storage sync bundle", () => {
  const cleanupPaths: string[] = [];

  afterEach(() => {
    for (const cleanupPath of cleanupPaths.splice(0)) {
      rmSync(cleanupPath, { recursive: true, force: true });
    }
    delete process.env.PI_LOOM_ROOT;
  });

  it("exports deterministic sync bundles and hydrates a fresh catalog", async () => {
    const { cwd, cleanup } = createWorkspace();
    cleanupPaths.push(cwd);
    const catalogRoot = mkdtempSync(path.join(tmpdir(), "pi-storage-sync-catalog-"));
    cleanupPaths.push(catalogRoot);
    process.env.PI_LOOM_ROOT = catalogRoot;
    ensureLoomCatalogDirs(getLoomCatalogPaths());

    const sourceCatalog = new SqliteLoomCatalog();
    try {
      const seeded = await seedCanonicalCatalog(cwd, sourceCatalog);
      const bundleDir = mkdtempSync(path.join(tmpdir(), "pi-storage-sync-bundle-"));
      cleanupPaths.push(bundleDir);
      const exported = await exportSyncBundle(cwd, sourceCatalog, bundleDir);

      expect(exported.files).toEqual(
        expect.arrayContaining(["bundle.json", "entities.json", "events.json", "runtime-attachments.json"]),
      );
      expect(exported.files.some((file) => file.endsWith(".sqlite"))).toBe(false);
      expect(exported.bundle).toMatchObject({
        spaceId: requireResolvedRepositoryIdentity(resolveWorkspaceIdentity(cwd)).space.id,
        partial: false,
        scope: { kind: "space" },
      });
      expect(JSON.parse(readFileSync(path.join(bundleDir, "runtime-attachments.json"), "utf-8"))).toEqual([
        seeded.runtimeAttachment,
      ]);

      const targetCatalogRoot = mkdtempSync(path.join(tmpdir(), "pi-storage-sync-target-"));
      cleanupPaths.push(targetCatalogRoot);
      process.env.PI_LOOM_ROOT = targetCatalogRoot;
      ensureLoomCatalogDirs(getLoomCatalogPaths());
      const targetCatalog = new SqliteLoomCatalog();
      try {
        const hydrated = await hydrateSyncBundle(targetCatalog, bundleDir);
        expect(hydrated.bundle).toEqual(exported.bundle);
        const hydratedEntities = await targetCatalog.listEntities();
        expect(hydrated.hydratedEntityIds).toEqual(
          seeded.entityIds.slice().sort((left, right) => left.localeCompare(right)),
        );
        expect(hydratedEntities.length).toBe(seeded.entityIds.length);
        expect(hydratedEntities.some((entity) => entity.displayId === "db-migration")).toBe(true);
        expect(await targetCatalog.listRuntimeAttachments(seeded.runtimeAttachment.worktreeId)).toEqual([
          seeded.runtimeAttachment,
        ]);
        expect(await targetCatalog.listEvents("entity-does-not-exist")).toEqual([]);
        const specEntity = hydratedEntities.find((entity) => entity.displayId === "db-migration");
        expect(await targetCatalog.listEvents(specEntity?.id ?? "missing")).toEqual([
          expect.objectContaining({ id: "event-spec-created", kind: "created" }),
        ]);
      } finally {
        targetCatalog.close();
      }
    } finally {
      sourceCatalog.close();
      cleanup();
    }
  }, 15000);

  it("exports a full-space bundle from an ambiguous parent workspace and preserves cross-repository data", async () => {
    const { cwd, cleanup } = createParentWorkspaceWithChildren();
    cleanupPaths.push(cwd);
    const catalogRoot = mkdtempSync(path.join(tmpdir(), "pi-storage-sync-space-catalog-"));
    cleanupPaths.push(catalogRoot);
    process.env.PI_LOOM_ROOT = catalogRoot;
    ensureLoomCatalogDirs(getLoomCatalogPaths());

    const sourceCatalog = new SqliteLoomCatalog();
    try {
      const seeded = await seedMultiRepositoryCatalog(cwd, sourceCatalog);
      const bundleDir = mkdtempSync(path.join(tmpdir(), "pi-storage-sync-space-bundle-"));
      cleanupPaths.push(bundleDir);
      const exported = await exportSyncBundle(cwd, sourceCatalog, bundleDir);

      expect(exported.bundle).toEqual({
        contractVersion: exported.bundle.contractVersion,
        exportedAt: exported.bundle.exportedAt,
        partial: false,
        scope: { kind: "space" },
        spaceId: seeded.spaceId,
      });
      expect(JSON.parse(readFileSync(path.join(bundleDir, "repositories.json"), "utf-8"))).toHaveLength(2);
      expect(JSON.parse(readFileSync(path.join(bundleDir, "worktrees.json"), "utf-8"))).toHaveLength(2);
      expect(JSON.parse(readFileSync(path.join(bundleDir, "runtime-attachments.json"), "utf-8"))).toEqual(
        expect.arrayContaining(seeded.runtimeAttachments),
      );

      const targetCatalogRoot = mkdtempSync(path.join(tmpdir(), "pi-storage-sync-space-target-"));
      cleanupPaths.push(targetCatalogRoot);
      process.env.PI_LOOM_ROOT = targetCatalogRoot;
      ensureLoomCatalogDirs(getLoomCatalogPaths());
      const targetCatalog = new SqliteLoomCatalog();
      try {
        const hydrated = await hydrateSyncBundle(targetCatalog, bundleDir);
        expect(hydrated.bundle.scope).toEqual({ kind: "space" });
        expect(await targetCatalog.listRepositories(seeded.spaceId)).toHaveLength(2);
        expect(await targetCatalog.listWorktrees(seeded.repositories.serviceA)).toHaveLength(1);
        expect(await targetCatalog.listWorktrees(seeded.repositories.serviceB)).toHaveLength(1);
        const hydratedEntities = await targetCatalog.listEntities(seeded.spaceId);
        expect(hydratedEntities.map((entity) => entity.displayId)).toEqual(
          expect.arrayContaining(["svc-a-ticket", "svc-b-ticket"]),
        );
        expect(await targetCatalog.listLinks(seeded.entities.serviceA)).toEqual([
          expect.objectContaining({ kind: "depends_on", toEntityId: seeded.entities.serviceB }),
        ]);
        expect(await targetCatalog.listRuntimeAttachments(seeded.worktrees.serviceA)).toEqual([
          expect.objectContaining({ id: "runtime-service-a" }),
        ]);
        expect(await targetCatalog.listRuntimeAttachments(seeded.worktrees.serviceB)).toEqual([
          expect.objectContaining({ id: "runtime-service-b" }),
        ]);
      } finally {
        targetCatalog.close();
      }
    } finally {
      sourceCatalog.close();
      cleanup();
    }
  }, 20000);

  it("marks repository-scoped exports as partial and excludes other repositories", async () => {
    const { cwd, cleanup } = createParentWorkspaceWithChildren();
    cleanupPaths.push(cwd);
    const catalogRoot = mkdtempSync(path.join(tmpdir(), "pi-storage-sync-partial-catalog-"));
    cleanupPaths.push(catalogRoot);
    process.env.PI_LOOM_ROOT = catalogRoot;
    ensureLoomCatalogDirs(getLoomCatalogPaths());

    const sourceCatalog = new SqliteLoomCatalog();
    try {
      const seeded = await seedMultiRepositoryCatalog(cwd, sourceCatalog);
      const bundleDir = mkdtempSync(path.join(tmpdir(), "pi-storage-sync-partial-bundle-"));
      cleanupPaths.push(bundleDir);
      const exported = await exportSyncBundle(cwd, sourceCatalog, bundleDir, {
        scope: { kind: "repository", repositoryId: seeded.repositories.serviceA },
      });

      expect(exported.bundle.partial).toBe(true);
      expect(exported.bundle.scope).toEqual({ kind: "repository", repositoryId: seeded.repositories.serviceA });
      expect(JSON.parse(readFileSync(path.join(bundleDir, "repositories.json"), "utf-8"))).toEqual([
        expect.objectContaining({ id: seeded.repositories.serviceA, displayName: "service-a" }),
      ]);
      expect(JSON.parse(readFileSync(path.join(bundleDir, "worktrees.json"), "utf-8"))).toEqual([
        expect.objectContaining({ id: seeded.worktrees.serviceA }),
      ]);
      expect(
        (JSON.parse(readFileSync(path.join(bundleDir, "entities.json"), "utf-8")) as Array<{ displayId: string }>).map(
          (entity) => entity.displayId,
        ),
      ).toEqual(expect.arrayContaining(["svc-a-ticket", `space-enrollment:${seeded.spaceId}`]));
      expect(
        (JSON.parse(readFileSync(path.join(bundleDir, "entities.json"), "utf-8")) as Array<{ displayId: string }>).map(
          (entity) => entity.displayId,
        ),
      ).not.toContain("svc-b-ticket");
      expect(JSON.parse(readFileSync(path.join(bundleDir, "links.json"), "utf-8"))).toEqual([]);
      expect(JSON.parse(readFileSync(path.join(bundleDir, "runtime-attachments.json"), "utf-8"))).toEqual([
        expect.objectContaining({ id: "runtime-service-a", worktreeId: seeded.worktrees.serviceA }),
      ]);
    } finally {
      sourceCatalog.close();
      cleanup();
    }
  }, 20000);

  it("migrates legacy repository-scoped bundle metadata during hydration", async () => {
    const { cwd, cleanup } = createWorkspace();
    cleanupPaths.push(cwd);
    const catalogRoot = mkdtempSync(path.join(tmpdir(), "pi-storage-sync-legacy-catalog-"));
    cleanupPaths.push(catalogRoot);
    process.env.PI_LOOM_ROOT = catalogRoot;
    ensureLoomCatalogDirs(getLoomCatalogPaths());

    const sourceCatalog = new SqliteLoomCatalog();
    try {
      await seedCanonicalCatalog(cwd, sourceCatalog);
      const bundleDir = mkdtempSync(path.join(tmpdir(), "pi-storage-sync-legacy-bundle-"));
      cleanupPaths.push(bundleDir);
      const exported = await exportSyncBundle(cwd, sourceCatalog, bundleDir, {
        scope: {
          kind: "repository",
          repositoryId: requireResolvedRepositoryIdentity(resolveWorkspaceIdentity(cwd)).repository.id,
        },
      });
      writeFileSync(
        path.join(bundleDir, "bundle.json"),
        `${JSON.stringify(
          {
            contractVersion: exported.bundle.contractVersion,
            exportedAt: exported.bundle.exportedAt,
            spaceId: exported.bundle.spaceId,
            repositoryId: requireResolvedRepositoryIdentity(resolveWorkspaceIdentity(cwd)).repository.id,
          },
          null,
          2,
        )}\n`,
        "utf-8",
      );

      const targetCatalogRoot = mkdtempSync(path.join(tmpdir(), "pi-storage-sync-legacy-target-"));
      cleanupPaths.push(targetCatalogRoot);
      process.env.PI_LOOM_ROOT = targetCatalogRoot;
      ensureLoomCatalogDirs(getLoomCatalogPaths());
      const targetCatalog = new SqliteLoomCatalog();
      try {
        const hydrated = await hydrateSyncBundle(targetCatalog, bundleDir);
        expect(hydrated.bundle.partial).toBe(true);
        expect(hydrated.bundle.scope).toEqual({
          kind: "repository",
          repositoryId: requireResolvedRepositoryIdentity(resolveWorkspaceIdentity(cwd)).repository.id,
        });
      } finally {
        targetCatalog.close();
      }
    } finally {
      sourceCatalog.close();
      cleanup();
    }
  }, 15000);

  it("detects conflicting runtime attachments during hydration", async () => {
    const { cwd, cleanup } = createWorkspace();
    cleanupPaths.push(cwd);
    const catalogRoot = mkdtempSync(path.join(tmpdir(), "pi-storage-sync-conflict-"));
    cleanupPaths.push(catalogRoot);
    process.env.PI_LOOM_ROOT = catalogRoot;
    ensureLoomCatalogDirs(getLoomCatalogPaths());

    const sourceCatalog = new SqliteLoomCatalog();
    try {
      const seeded = await seedCanonicalCatalog(cwd, sourceCatalog);
      const bundleDir = mkdtempSync(path.join(tmpdir(), "pi-storage-sync-conflict-bundle-"));
      cleanupPaths.push(bundleDir);
      await exportSyncBundle(cwd, sourceCatalog, bundleDir);

      const targetCatalogRoot = mkdtempSync(path.join(tmpdir(), "pi-storage-sync-conflict-target-"));
      cleanupPaths.push(targetCatalogRoot);
      process.env.PI_LOOM_ROOT = targetCatalogRoot;
      ensureLoomCatalogDirs(getLoomCatalogPaths());
      const targetCatalog = new SqliteLoomCatalog();
      try {
        await hydrateSyncBundle(targetCatalog, bundleDir);
        const attachmentsPath = path.join(bundleDir, "runtime-attachments.json");
        const attachments = JSON.parse(readFileSync(attachmentsPath, "utf-8")) as Array<Record<string, unknown>>;
        attachments[0] = { ...attachments[0], metadata: { specId: seeded.entityIds[1], host: "other-machine" } };
        writeFileSync(attachmentsPath, `${JSON.stringify(attachments, null, 2)}\n`, "utf-8");
        await expect(hydrateSyncBundle(targetCatalog, bundleDir)).rejects.toThrow(
          /repository pi-loom-sync-fixture .*worktree main/,
        );
      } finally {
        targetCatalog.close();
      }
    } finally {
      sourceCatalog.close();
      cleanup();
    }
  }, 15000);
});
