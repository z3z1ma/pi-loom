import { describe, expect, it } from "vitest";
import {
  LOOM_BRANCH_RESERVATION_STATUSES,
  LOOM_ENTITY_KINDS,
  LOOM_RUNTIME_ATTACHMENT_KINDS,
  LOOM_STORAGE_CONTRACT_VERSION,
  type LoomBranchReservationRecord,
  type LoomCanonicalStorage,
  type LoomEntityRecord,
  type LoomRuntimeAttachment,
  type LoomSpaceRecord,
} from "../contract.js";

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

  it("keeps runtime attachment kinds representable in the sqlite-backed contract", () => {
    expect(LOOM_RUNTIME_ATTACHMENT_KINDS).toEqual(
      expect.arrayContaining(["worker_runtime", "manager_runtime", "launch_descriptor", "local_process"]),
    );
  });

  it("keeps branch reservation statuses representable in the storage contract", () => {
    expect(LOOM_BRANCH_RESERVATION_STATUSES).toEqual(expect.arrayContaining(["reserved", "provisioned", "retired"]));
  });

  it("keeps canonical entities and runtime attachments in the same storage contract", async () => {
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
      attributes: { source: "test" },
      createdAt: "2026-03-16T00:00:00.000Z",
      updatedAt: "2026-03-16T00:00:00.000Z",
    };

    const runtimeAttachment: LoomRuntimeAttachment = {
      id: "runtime-001",
      worktreeId: "worktree-001",
      kind: "worker_runtime",
      locator: "worker-runtime:worktree-001",
      processId: 1234,
      leaseExpiresAt: "2026-03-16T01:00:00.000Z",
      metadata: { host: "dev-machine" },
      createdAt: "2026-03-16T00:00:00.000Z",
      updatedAt: "2026-03-16T00:30:00.000Z",
    };
    const branchReservation: LoomBranchReservationRecord = {
      id: "branch-001",
      repositoryId: "repo-001",
      branchFamily: "UDP-100",
      familySequence: 0,
      branchName: "UDP-100",
      status: "reserved",
      ownerKey: "ticket:pl-0109",
      ownerEntityId: entity.id,
      ownerEntityKind: "ticket",
      metadata: { source: "test" },
      createdAt: "2026-03-16T00:00:00.000Z",
      updatedAt: "2026-03-16T00:30:00.000Z",
    };

    const storage: LoomCanonicalStorage = {
      contractVersion: LOOM_STORAGE_CONTRACT_VERSION,
      backendKind: "sqlite",
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
      async getEntityByDisplayId() {
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
      async listRuntimeAttachments() {
        return [runtimeAttachment];
      },
      async getBranchReservation() {
        return branchReservation;
      },
      async listBranchReservations() {
        return [branchReservation];
      },
      async upsertSpace() {},
      async upsertRepository() {},
      async upsertWorktree() {},
      async upsertEntity() {},
      async removeEntity() {},
      async upsertLink() {},
      async removeLink() {},
      async appendEvent() {},
      async removeEvent() {},
      async upsertRuntimeAttachment() {},
      async removeRuntimeAttachment() {},
      async upsertBranchReservation() {},
      async removeBranchReservation() {},
      async transact(run) {
        return run({
          ...storage,
          async commit() {},
          async rollback() {},
        });
      },
    };

    expect(storage.contractVersion).toBe(LOOM_STORAGE_CONTRACT_VERSION);
    expect((await storage.getEntity(entity.id))?.displayId).toBe("t-0044");
    expect((await storage.listRuntimeAttachments(runtimeAttachment.worktreeId))[0]).toMatchObject({
      id: runtimeAttachment.id,
      updatedAt: "2026-03-16T00:30:00.000Z",
    });
    expect((await storage.getBranchReservation(branchReservation.id))?.branchName).toBe("UDP-100");
    expect(runtimeAttachment.locator).toBe("worker-runtime:worktree-001");
  });
});
