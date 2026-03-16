import { describe, expect, it } from "vitest";
import {
  assertRepoRelativePath,
  isRepoRelativePath,
  LOOM_ENTITY_KINDS,
  LOOM_PROJECTION_KINDS,
  LOOM_STORAGE_CONTRACT_VERSION,
  type LoomCanonicalStorage,
  type LoomEntityRecord,
  type LoomProjectionRecord,
  type LoomRuntimeAttachment,
  type LoomSpaceRecord,
} from "../storage/contract.js";

describe("pi-storage contract", () => {
  it("covers the core Loom entity kinds needed by the migration", () => {
    expect(LOOM_ENTITY_KINDS).toEqual(
      expect.arrayContaining([
        "constitution",
        "research",
        "initiative",
        "spec_change",
        "plan",
        "ticket",
        "worker",
        "critique",
        "ralph_run",
        "documentation",
        "artifact",
      ]),
    );
  });

  it("keeps constitution, docs, and specs markdown bodies representable as repo materialized projections", () => {
    expect(LOOM_PROJECTION_KINDS).toEqual(
      expect.arrayContaining(["constitution_markdown_body", "documentation_markdown_body", "spec_markdown_body"]),
    );
  });

  it("accepts repo-relative path scopes and rejects absolute or parent-escaping paths", () => {
    expect(isRepoRelativePath(".loom/specs/changes/change-1/proposal.md")).toBe(true);
    expect(isRepoRelativePath(".")).toBe(true);
    expect(isRepoRelativePath("../outside.md")).toBe(false);
    expect(isRepoRelativePath("/tmp/absolute.md")).toBe(false);
    expect(() => assertRepoRelativePath("../outside.md")).toThrow("Expected repo-relative path");
  });

  it("separates canonical storage records from clone-local runtime attachments", async () => {
    const space: LoomSpaceRecord = {
      id: "space-001",
      slug: "core-platform",
      title: "Core Platform",
      description: "Cross-repo coordination space",
      repositoryIds: ["repo-001"],
      createdAt: "2026-03-16T00:00:00.000Z",
      updatedAt: "2026-03-16T00:00:00.000Z",
    };

    const entity: LoomEntityRecord = {
      id: "entity-001",
      kind: "ticket",
      spaceId: space.id,
      owningRepositoryId: "repo-001",
      displayId: "t-0044",
      title: "Extract storage contract",
      summary: "Seed the backend-agnostic contract",
      status: "open",
      version: 1,
      tags: ["storage"],
      pathScopes: [
        {
          repositoryId: "repo-001",
          relativePath: assertRepoRelativePath(".loom/tickets/t-0044.md"),
          role: "projection",
        },
      ],
      attributes: { source: "test" },
      createdAt: "2026-03-16T00:00:00.000Z",
      updatedAt: "2026-03-16T00:00:00.000Z",
    };

    const projection: LoomProjectionRecord = {
      id: "projection-001",
      entityId: entity.id,
      kind: "spec_markdown_body",
      materialization: "repo_materialized",
      repositoryId: "repo-001",
      relativePath: assertRepoRelativePath(".loom/specs/changes/sqlite-first-canonical-storage-substrate/design.md"),
      contentHash: "sha256:abc",
      version: 1,
      content: "# Design\n\nProjection body.\n",
      createdAt: "2026-03-16T00:00:00.000Z",
      updatedAt: "2026-03-16T00:00:00.000Z",
    };

    const runtimeAttachment: LoomRuntimeAttachment = {
      id: "runtime-001",
      worktreeId: "worktree-001",
      kind: "worker_runtime",
      localPath: "/Users/example/.loom/runtime/workers/worktree-001",
      processId: 1234,
      leaseExpiresAt: "2026-03-16T01:00:00.000Z",
      metadata: { host: "dev-machine" },
    };

    const storage: LoomCanonicalStorage = {
      contractVersion: LOOM_STORAGE_CONTRACT_VERSION,
      backendKind: "test",
      async getSpace() {
        return space;
      },
      async listRepositories() {
        return [];
      },
      async listWorktrees() {
        return [];
      },
      async getEntity() {
        return entity;
      },
      async listEntities() {
        return [entity];
      },
      async listLinks() {
        return [];
      },
      async listEvents() {
        return [];
      },
      async listProjections() {
        return [projection];
      },
      async upsertSpace() {},
      async upsertRepository() {},
      async upsertWorktree() {},
      async upsertEntity() {},
      async upsertLink() {},
      async appendEvent() {},
      async upsertProjection() {},
      async transact(run) {
        return run({
          ...storage,
          async commit() {},
          async rollback() {},
        });
      },
    };

    expect(storage.contractVersion).toBe(1);
    expect((await storage.getEntity(entity.id))?.displayId).toBe("t-0044");
    expect((await storage.listProjections(entity.id))[0]?.relativePath).toContain(
      "sqlite-first-canonical-storage-substrate",
    );
    expect(runtimeAttachment.localPath).toContain(".loom/runtime/workers");
  });
});
