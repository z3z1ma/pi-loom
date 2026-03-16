import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { importWorkspaceSnapshot, materializeRepositoryProjections } from "../storage/catalog.js";
import { createEntityId, createRepositoryId } from "../storage/ids.js";
import { ensureLoomCatalogDirs, getLoomCatalogPaths } from "../storage/locations.js";
import { resolveWorkspaceIdentity } from "../storage/repository.js";
import { SqliteLoomCatalog } from "../storage/sqlite.js";

function createWorkspace(): { cwd: string; cleanup: () => void } {
  const cwd = mkdtempSync(path.join(tmpdir(), "pi-storage-workspace-"));
  execFileSync("git", ["init"], { cwd, encoding: "utf-8" });
  execFileSync("git", ["config", "user.name", "Pi Loom Tests"], { cwd, encoding: "utf-8" });
  execFileSync("git", ["config", "user.email", "tests@example.com"], { cwd, encoding: "utf-8" });
  execFileSync("git", ["remote", "add", "origin", "git@github.com:example/pi-loom.git"], {
    cwd,
    encoding: "utf-8",
  });
  writeFileSync(path.join(cwd, "package.json"), '{"name":"pi-loom-fixture"}\n', "utf-8");
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

describe("pi-storage sqlite catalog", () => {
  const cleanupPaths: string[] = [];

  afterEach(() => {
    for (const cleanupPath of cleanupPaths.splice(0)) {
      rmSync(cleanupPath, { recursive: true, force: true });
    }
    delete process.env.PI_LOOM_ROOT;
  });

  it("creates stable repository and entity identifiers", () => {
    const repoIdA = createRepositoryId(["git@github.com:example/pi-loom.git"], "fallback");
    const repoIdB = createRepositoryId(["git@github.com:example/pi-loom.git"], "different-fallback");
    const entityIdA = createEntityId("ticket", "space_core", "t-0045", "ticket:t-0045");
    const entityIdB = createEntityId("ticket", "space_core", "t-0045", "ticket:t-0045");

    expect(repoIdA).toBe(repoIdB);
    expect(entityIdA).toBe(entityIdB);
  });

  it("resolves repository identity independent of checkout location when a remote exists", () => {
    const { cwd, cleanup } = createWorkspace();
    cleanupPaths.push(cwd);
    try {
      const identity = resolveWorkspaceIdentity(cwd);
      expect(identity.repository.remoteUrls).toEqual(["git@github.com:example/pi-loom.git"]);
      expect(identity.repository.id).toContain("repo_");
      expect(identity.worktree.repositoryId).toBe(identity.repository.id);
      expect(identity.space.repositoryIds).toEqual([identity.repository.id]);
      expect(identity.worktree.logicalPath.startsWith("worktree:")).toBe(true);
      expect(identity.worktree.logicalPath.startsWith("/")).toBe(false);
    } finally {
      cleanup();
    }
  });

  it("imports workspace state into sqlite and rematerializes constitution/docs/spec markdown bodies", async () => {
    const { cwd, cleanup } = createWorkspace();
    cleanupPaths.push(cwd);
    const catalogRoot = mkdtempSync(path.join(tmpdir(), "pi-storage-catalog-"));
    cleanupPaths.push(catalogRoot);
    process.env.PI_LOOM_ROOT = catalogRoot;
    ensureLoomCatalogDirs(getLoomCatalogPaths());

    writeWorkspaceFile(cwd, ".loom/constitution/brief.md", "# Brief\n\nConstitution brief.\n");
    writeWorkspaceFile(cwd, ".loom/docs/overviews/architecture/doc.md", "# Architecture\n\nHuman-facing doc body.\n");
    writeWorkspaceFile(
      cwd,
      ".loom/docs/overviews/architecture/state.json",
      `${JSON.stringify({ docId: "architecture", title: "Architecture", status: "active" }, null, 2)}\n`,
    );
    writeWorkspaceFile(cwd, ".loom/specs/changes/db-migration/proposal.md", "# DB Migration\n\nMain proposal body.\n");
    writeWorkspaceFile(
      cwd,
      ".loom/specs/changes/db-migration/state.json",
      `${JSON.stringify({ changeId: "db-migration", title: "DB Migration", status: "planned" }, null, 2)}\n`,
    );
    writeWorkspaceFile(
      cwd,
      ".loom/specs/changes/db-migration/analysis.md",
      "# Analysis\n\nMachine-oriented analysis.\n",
    );
    writeWorkspaceFile(
      cwd,
      ".loom/initiatives/storage-migration/state.json",
      `${JSON.stringify({ initiativeId: "storage-migration", title: "Storage Migration", status: "active" }, null, 2)}\n`,
    );
    writeWorkspaceFile(
      cwd,
      ".loom/tickets/t-9001.md",
      [
        "---",
        "id: t-9001",
        "title: Migrate storage",
        "status: open",
        "initiative-ids:",
        "  - storage-migration",
        "spec-change: db-migration",
        "---",
        "",
        "# Migrate storage",
        "",
        "Ticket body.",
        "",
      ].join("\n"),
    );
    writeWorkspaceFile(cwd, ".loom/workers/runtime-worker/worker.md", "# Runtime Worker\n\nDurable worker summary.\n");
    writeWorkspaceFile(
      cwd,
      ".loom/workers/runtime-worker/state.json",
      `${JSON.stringify({ workerId: "runtime-worker", title: "Runtime Worker", status: "waiting_for_review" }, null, 2)}\n`,
    );
    writeWorkspaceFile(
      cwd,
      ".loom/workers/runtime-worker/launch.json",
      `${JSON.stringify({ note: "local runtime only" }, null, 2)}\n`,
    );

    const catalog = new SqliteLoomCatalog();
    try {
      const imported = await importWorkspaceSnapshot(cwd, catalog);
      expect(imported.importedEntityIds.length).toBeGreaterThan(0);

      const entities = await catalog.listEntities();
      const ticketEntity = entities.find((entity) => entity.displayId === "t-9001");
      const initiativeEntity = entities.find((entity) => entity.displayId === "storage-migration");
      const specEntity = entities.find((entity) => entity.displayId === "db-migration");
      const workerEntity = entities.find((entity) => entity.displayId === "runtime-worker");
      expect(ticketEntity).toBeDefined();
      expect(initiativeEntity).toBeDefined();
      expect(specEntity).toBeDefined();
      expect(workerEntity?.kind).toBe("worker");
      expect(workerEntity?.attributes).toMatchObject({
        importedFrom: "filesystem",
        filesByPath: expect.objectContaining({
          ".loom/workers/runtime-worker/worker.md": expect.stringContaining("Durable worker summary"),
        }),
      });
      expect(
        (workerEntity?.attributes.filesByPath as Record<string, string>)[".loom/workers/runtime-worker/launch.json"],
      ).toBeUndefined();
      const ticketLinks = await catalog.listLinks(ticketEntity?.id ?? "missing");
      expect(ticketLinks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "belongs_to", toEntityId: initiativeEntity?.id }),
          expect.objectContaining({ kind: "references", toEntityId: specEntity?.id }),
        ]),
      );

      const projectionPaths = await materializeRepositoryProjections(cwd, catalog, imported.importedEntityIds);
      expect(projectionPaths).toEqual(
        expect.arrayContaining([
          ".loom/constitution/brief.md",
          ".loom/docs/overviews/architecture/doc.md",
          ".loom/specs/changes/db-migration/proposal.md",
        ]),
      );

      const analysisPath = path.join(cwd, ".loom", "specs", "changes", "db-migration", "analysis.md");
      unlinkSync(path.join(cwd, ".loom", "constitution", "brief.md"));
      unlinkSync(path.join(cwd, ".loom", "docs", "overviews", "architecture", "doc.md"));
      unlinkSync(path.join(cwd, ".loom", "specs", "changes", "db-migration", "proposal.md"));
      await materializeRepositoryProjections(cwd, catalog, imported.importedEntityIds);

      expect(readFileSync(path.join(cwd, ".loom", "constitution", "brief.md"), "utf-8")).toContain(
        "Constitution brief",
      );
      expect(readFileSync(path.join(cwd, ".loom", "docs", "overviews", "architecture", "doc.md"), "utf-8")).toContain(
        "Human-facing doc body",
      );
      expect(
        readFileSync(path.join(cwd, ".loom", "specs", "changes", "db-migration", "proposal.md"), "utf-8"),
      ).toContain("Main proposal body");
      expect(existsSync(analysisPath)).toBe(true);
      expect(readFileSync(analysisPath, "utf-8")).toContain("Machine-oriented analysis");
    } finally {
      catalog.close();
      cleanup();
    }
  });
});
