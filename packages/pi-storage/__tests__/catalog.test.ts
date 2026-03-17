import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertRepoRelativePath } from "../storage/contract.js";
import { materializeRepositoryProjections } from "../storage/catalog.js";
import { createEntityId, createLinkId, createProjectionId, createRepositoryId } from "../storage/ids.js";
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
  const documentationId = createEntityId("documentation", identity.space.id, "architecture", "architecture");
  const specId = createEntityId("spec_change", identity.space.id, "db-migration", "db-migration");
  const initiativeId = createEntityId("initiative", identity.space.id, "storage-migration", "storage-migration");
  const ticketId = createEntityId("ticket", identity.space.id, "t-9001", "t-9001");
  const workerId = createEntityId("worker", identity.space.id, "runtime-worker", "runtime-worker");

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
    id: documentationId,
    kind: "documentation",
    spaceId: identity.space.id,
    owningRepositoryId: identity.repository.id,
    displayId: "architecture",
    title: "Architecture",
    summary: "Human-facing doc body.",
    status: "active",
    version: 1,
    tags: ["documentation"],
    pathScopes: [
      {
        repositoryId: identity.repository.id,
        relativePath: assertRepoRelativePath(".loom/docs/overviews/architecture/doc.md"),
        role: "projection",
      },
    ],
    attributes: { docType: "overview" },
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
    pathScopes: [
      {
        repositoryId: identity.repository.id,
        relativePath: assertRepoRelativePath(".loom/initiatives/storage-migration/state.json"),
        role: "canonical",
      },
    ],
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
    summary: "Ticket body.",
    status: "open",
    version: 1,
    tags: ["ticket"],
    pathScopes: [
      {
        repositoryId: identity.repository.id,
        relativePath: assertRepoRelativePath(".loom/tickets/t-9001.md"),
        role: "canonical",
      },
    ],
    attributes: {},
    ...timestamps,
  });
  await catalog.upsertEntity({
    id: workerId,
    kind: "worker",
    spaceId: identity.space.id,
    owningRepositoryId: identity.repository.id,
    displayId: "runtime-worker",
    title: "Runtime Worker",
    summary: "Durable worker summary.",
    status: "waiting_for_review",
    version: 1,
    tags: ["worker"],
    pathScopes: [
      {
        repositoryId: identity.repository.id,
        relativePath: assertRepoRelativePath(".loom/workers/runtime-worker/state.json"),
        role: "canonical",
      },
      {
        repositoryId: identity.repository.id,
        relativePath: assertRepoRelativePath(".loom/workers/runtime-worker/worker.md"),
        role: "projection",
      },
    ],
    attributes: { runtime: "managed" },
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
  await catalog.upsertLink({
    id: createLinkId("references", ticketId, specId),
    kind: "references",
    fromEntityId: ticketId,
    toEntityId: specId,
    metadata: {},
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
    id: createProjectionId("markdown", documentationId, ".loom/docs/overviews/architecture/doc.md"),
    entityId: documentationId,
    kind: "documentation_markdown_body",
    materialization: "repo_materialized",
    repositoryId: identity.repository.id,
    relativePath: assertRepoRelativePath(".loom/docs/overviews/architecture/doc.md"),
    contentHash: null,
    version: 1,
    content: "# Architecture\n\nHuman-facing doc body.\n",
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

  return { entityIds: [constitutionId, documentationId, initiativeId, specId, ticketId, workerId] };
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

  it("materializes constitution/docs/spec markdown bodies from canonical sqlite records", async () => {
    const { cwd, cleanup } = createWorkspace();
    cleanupPaths.push(cwd);
    const catalogRoot = mkdtempSync(path.join(tmpdir(), "pi-storage-catalog-"));
    cleanupPaths.push(catalogRoot);
    process.env.PI_LOOM_ROOT = catalogRoot;
    ensureLoomCatalogDirs(getLoomCatalogPaths());

    writeWorkspaceFile(
      cwd,
      ".loom/specs/changes/db-migration/analysis.md",
      "# Analysis\n\nMachine-oriented analysis.\n",
    );

    const catalog = new SqliteLoomCatalog();
    try {
      const seeded = await seedCanonicalCatalog(cwd, catalog);

      const entities = await catalog.listEntities();
      const ticketEntity = entities.find((entity) => entity.displayId === "t-9001");
      const initiativeEntity = entities.find((entity) => entity.displayId === "storage-migration");
      const specEntity = entities.find((entity) => entity.displayId === "db-migration");
      const workerEntity = entities.find((entity) => entity.displayId === "runtime-worker");
      expect(ticketEntity).toBeDefined();
      expect(ticketEntity).toMatchObject({ title: "Migrate storage", status: "open" });
      expect(initiativeEntity).toBeDefined();
      expect(specEntity).toBeDefined();
      expect(workerEntity).toMatchObject({
        kind: "worker",
        summary: "Durable worker summary.",
        attributes: { runtime: "managed" },
      });
      const ticketLinks = await catalog.listLinks(ticketEntity?.id ?? "missing");
      expect(ticketLinks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "belongs_to", toEntityId: initiativeEntity?.id }),
          expect.objectContaining({ kind: "references", toEntityId: specEntity?.id }),
        ]),
      );

      const projectionPaths = await materializeRepositoryProjections(cwd, catalog, seeded.entityIds);
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
      await materializeRepositoryProjections(cwd, catalog, seeded.entityIds);

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
