import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { importWorkspaceSnapshot } from "../storage/catalog.js";
import { ensureLoomCatalogDirs, getLoomCatalogPaths } from "../storage/locations.js";
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

function writeWorkspaceFile(cwd: string, relativePath: string, content: string): void {
  const absolutePath = path.join(cwd, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content, "utf-8");
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

    writeWorkspaceFile(cwd, ".loom/constitution/brief.md", "# Brief\n\nConstitution brief.\n");
    writeWorkspaceFile(cwd, ".loom/specs/changes/db-migration/proposal.md", "# DB Migration\n\nMain proposal body.\n");
    writeWorkspaceFile(
      cwd,
      ".loom/specs/changes/db-migration/state.json",
      `${JSON.stringify({ changeId: "db-migration", title: "DB Migration", status: "planned" }, null, 2)}\n`,
    );

    const sourceCatalog = new SqliteLoomCatalog();
    try {
      await importWorkspaceSnapshot(cwd, sourceCatalog);
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
        expect(hydrated.hydratedEntityIds.length).toBe(hydratedEntities.length);
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

    writeWorkspaceFile(cwd, ".loom/constitution/brief.md", "# Brief\n\nConstitution brief.\n");

    const sourceCatalog = new SqliteLoomCatalog();
    try {
      await importWorkspaceSnapshot(cwd, sourceCatalog);
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
