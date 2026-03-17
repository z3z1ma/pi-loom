import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertRepoRelativePath } from "../storage/contract.js";
import { createEntityId, createProjectionId } from "../storage/ids.js";
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

async function seedCanonicalCatalog(cwd: string, catalog: SqliteLoomCatalog): Promise<{ entityIds: string[] }> {
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
        relativePath: assertRepoRelativePath(".loom/constitution/brief.md"),
        role: "projection",
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
        relativePath: assertRepoRelativePath(".loom/specs/changes/db-migration/proposal.md"),
        role: "projection",
      },
      {
        repositoryId: identity.repository.id,
        relativePath: assertRepoRelativePath(".loom/specs/changes/db-migration/state.json"),
        role: "canonical",
      },
    ],
    attributes: { stage: "planned" },
    ...timestamps,
  });

  await catalog.upsertProjection({
    id: createProjectionId("markdown", constitutionId, ".loom/constitution/brief.md"),
    entityId: constitutionId,
    kind: "constitution_markdown_body",
    materialization: "repo_materialized",
    repositoryId: identity.repository.id,
    relativePath: assertRepoRelativePath(".loom/constitution/brief.md"),
    contentHash: null,
    version: 1,
    content: "# Brief\n\nConstitution brief.\n",
    ...timestamps,
  });
  await catalog.upsertProjection({
    id: createProjectionId("markdown", specId, ".loom/specs/changes/db-migration/proposal.md"),
    entityId: specId,
    kind: "spec_markdown_body",
    materialization: "repo_materialized",
    repositoryId: identity.repository.id,
    relativePath: assertRepoRelativePath(".loom/specs/changes/db-migration/proposal.md"),
    contentHash: null,
    version: 1,
    content: "# DB Migration\n\nMain proposal body.\n",
    ...timestamps,
  });

  return { entityIds: [constitutionId, specId] };
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
          "projections.json",
          `repo-materialized/${exported.bundle.repositoryId}/.loom/constitution/brief.md`,
          `repo-materialized/${exported.bundle.repositoryId}/.loom/specs/changes/db-migration/proposal.md`,
        ]),
      );
      expect(exported.files.some((file) => file.endsWith(".sqlite"))).toBe(false);
      expect(
        existsSync(
          path.join(bundleDir, "repo-materialized", exported.bundle.repositoryId, ".loom", "constitution", "brief.md"),
        ),
      ).toBe(true);

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
        const specEntity = hydratedEntities.find((entity) => entity.displayId === "db-migration");
        const projections = await targetCatalog.listProjections(specEntity?.id ?? "missing");
        expect(
          projections.some((projection) => projection.relativePath === ".loom/specs/changes/db-migration/proposal.md"),
        ).toBe(true);
        expect(
          readFileSync(
            path.join(
              bundleDir,
              "repo-materialized",
              exported.bundle.repositoryId,
              ".loom",
              "constitution",
              "brief.md",
            ),
            "utf-8",
          ),
        ).toContain("Constitution brief");
      } finally {
        targetCatalog.close();
      }
    } finally {
      sourceCatalog.close();
      cleanup();
    }
  });

  it("detects conflicting entity versions during hydration", async () => {
    const { cwd, cleanup } = createWorkspace();
    cleanupPaths.push(cwd);
    const catalogRoot = mkdtempSync(path.join(tmpdir(), "pi-storage-sync-conflict-"));
    cleanupPaths.push(catalogRoot);
    process.env.PI_LOOM_ROOT = catalogRoot;
    ensureLoomCatalogDirs(getLoomCatalogPaths());

    const sourceCatalog = new SqliteLoomCatalog();
    try {
      await seedCanonicalCatalog(cwd, sourceCatalog);
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
        const entitiesPath = path.join(bundleDir, "entities.json");
        const entities = JSON.parse(readFileSync(entitiesPath, "utf-8")) as Array<Record<string, unknown>>;
        entities[0] = { ...entities[0], title: "Conflicting title" };
        writeFileSync(entitiesPath, `${JSON.stringify(entities, null, 2)}\n`, "utf-8");
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
