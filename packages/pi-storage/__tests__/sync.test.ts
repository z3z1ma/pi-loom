import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertRepoRelativePath, type LoomRuntimeAttachment } from "../storage/contract.js";
import { createEntityId } from "../storage/ids.js";
import { ensureLoomCatalogDirs, getLoomCatalogPaths } from "../storage/locations.js";
import { resolveWorkspaceIdentity } from "../storage/repository.js";
import { SqliteLoomCatalog } from "../storage/sqlite.js";
import { exportSyncBundle, hydrateSyncBundle } from "../storage/sync.js";

function createWorkspace(): { cwd: string; cleanup: () => void } {
  const cwd = mkdtempSync(path.join(tmpdir(), "pi-storage-sync-workspace-"));
  execFileSync("git", ["init"], { cwd, encoding: "utf-8" });
  execFileSync("git", ["config", "user.name", "Pi Loom Tests"], { cwd, encoding: "utf-8" });
  execFileSync("git", ["config", "user.email", "tests@example.com"], { cwd, encoding: "utf-8" });
  execFileSync("git", ["remote", "add", "origin", "git@github.com:example/pi-loom.git"], {
    cwd,
    encoding: "utf-8",
  });
  writeFileSync(path.join(cwd, "package.json"), '{"name":"pi-loom-sync-fixture"}\n', "utf-8");
  writeFileSync(path.join(cwd, "README.md"), "seed\n", "utf-8");
  execFileSync("git", ["add", "package.json", "README.md"], { cwd, encoding: "utf-8" });
  execFileSync("git", ["commit", "-m", "seed"], { cwd, encoding: "utf-8" });
  return { cwd, cleanup: () => rmSync(cwd, { recursive: true, force: true }) };
}

async function seedCanonicalCatalog(
  cwd: string,
  catalog: SqliteLoomCatalog,
): Promise<{ entityIds: string[]; runtimeAttachment: LoomRuntimeAttachment }> {
  const identity = resolveWorkspaceIdentity(cwd);
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
    pathScopes: [
      {
        repositoryId: identity.repository.id,
        relativePath: assertRepoRelativePath(".loom/constitution/state.json"),
        role: "canonical",
      },
    ],
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
    status: "planned",
    version: 1,
    tags: ["spec_change"],
    pathScopes: [
      {
        repositoryId: identity.repository.id,
        relativePath: assertRepoRelativePath(".loom/specs/changes/db-migration/state.json"),
        role: "canonical",
      },
    ],
    attributes: { stage: "planned" },
    ...timestamps,
  });

  await catalog.appendEvent({
    id: "event-spec-created",
    entityId: specId,
    kind: "created",
    sequence: 1,
    createdAt: timestamps.createdAt,
    actor: "test",
    payload: { status: "planned" },
  });

  const runtimeAttachment: LoomRuntimeAttachment = {
    id: "runtime-spec-worker",
    worktreeId: identity.worktree.id,
    kind: "worker_runtime",
    localPath: path.join(cwd, ".loom", "runtime", "workers", "db-migration"),
    processId: 2002,
    leaseExpiresAt: "2026-03-16T00:10:00.000Z",
    metadata: { specId },
    ...timestamps,
  };
  await catalog.upsertRuntimeAttachment(runtimeAttachment);

  return { entityIds: [constitutionId, specId], runtimeAttachment };
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
        expect.arrayContaining([
          "bundle.json",
          "entities.json",
          "events.json",
          "runtime-attachments.json",
        ]),
      );
      expect(exported.files.some((file) => file.endsWith(".sqlite"))).toBe(false);
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
        const hydratedEntities = await targetCatalog.listEntities();
        expect(hydrated.hydratedEntityIds).toEqual(seeded.entityIds.slice().sort((left, right) => left.localeCompare(right)));
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
  });

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
        await expect(hydrateSyncBundle(targetCatalog, bundleDir)).rejects.toThrow("Sync conflict detected");
      } finally {
        targetCatalog.close();
      }
    } finally {
      sourceCatalog.close();
      cleanup();
    }
  });
});
