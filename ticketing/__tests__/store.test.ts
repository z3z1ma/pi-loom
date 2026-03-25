import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSeededGitWorkspace, createSeededParentGitWorkspace } from "#storage/__tests__/helpers/git-fixture.js";
import { findEntityByDisplayId } from "#storage/entities.js";
import { closeAllWorkspaceStorage, openWorkspaceStorage } from "#storage/workspace.js";
import { parseTicket, serializeTicket } from "../domain/frontmatter.js";
import { ticketGraphNodeKey } from "../domain/graph.js";
import { getCheckpointRef, getTicketRef } from "../domain/paths.js";
import { createTicketStore } from "../domain/store.js";

function createParentWorkspaceWithChildren(): { cwd: string; cleanup: () => void } {
  const workspace = createSeededParentGitWorkspace({
    prefix: "pi-ticketing-store-multi-",
    repositories: [
      { name: "service-a", remoteUrl: "git@github.com:example/service-a.git" },
      { name: "service-b", remoteUrl: "git@github.com:example/service-b.git" },
    ],
  });

  return {
    cwd: workspace.cwd,
    cleanup: () => {
      closeAllWorkspaceStorage();
      workspace.cleanup();
    },
  };
}

describe("TicketStore canonical storage", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "pi-ticketing-store-"));
    process.env.PI_LOOM_ROOT = join(workspace, ".pi-loom-test");
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.PI_LOOM_ROOT;
    rmSync(workspace, { recursive: true, force: true });
  });

  it("derives repo-prefixed ticket display ids for seeded git workspaces", async () => {
    const { cwd, cleanup } = createSeededGitWorkspace({
      prefix: "pi-ticketing-prefix-",
      packageName: "pi-loom",
      remoteUrl: "https://github.com/example/pi-loom.git",
    });
    try {
      const store = createTicketStore(cwd);
      vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
      const created = await store.createTicketAsync({ title: "Prefixed ticket id" });
      expect(created.summary.id).toBe("pl-0001");
      expect(created.summary.ref).toBe("ticket:pl-0001");
    } finally {
      cleanup();
    }
  }, 15000);

  it("writes canonical ticket records and preserves stable refs across close and reopen", async () => {
    const store = createTicketStore(workspace);
    vi.setSystemTime(new Date("2024-01-02T03:04:05.000Z"));
    const created = await store.createTicketAsync({
      title: "Launch control refuses login",
      type: "bug",
      priority: "high",
      tags: ["ops", "sev1"],
      links: ["runbook"],
      initiativeIds: ["platform-modernization"],
      researchIds: ["evaluate-theme-architecture"],
      acceptance: ["Operators can log in again"],
      labels: ["auth"],
      summary: "Login failures block responders.",
      context: "Observed during morning cutover.",
      plan: "Inspect auth gateway and revert bad rollout.",
      notes: "Pager engaged.",
      verification: "Smoke test pending.",
      journalSummary: "Initial intake recorded.",
    });

    const ticketRef = getTicketRef(created.summary.id);
    expect(created.ticket.closed).toBe(false);
    expect(created.ticket.ref).toBe(ticketRef);
    expect(created.summary.ref).toBe(ticketRef);
    expect(created.ticket.frontmatter).toMatchObject({
      id: "t-0001",
      title: "Launch control refuses login",
      status: "open",
      priority: "high",
      type: "bug",
      tags: ["ops", "sev1"],
      links: ["runbook"],
      "initiative-ids": ["platform-modernization"],
      "research-ids": ["evaluate-theme-architecture"],
      acceptance: ["Operators can log in again"],
      labels: ["auth"],
      "created-at": "2024-01-02T03:04:05.000Z",
      "updated-at": "2024-01-02T03:04:05.000Z",
    });
    expect(created.ticket.body).toMatchObject({
      summary: "Login failures block responders.",
      context: "Observed during morning cutover.",
      plan: "Inspect auth gateway and revert bad rollout.",
      notes: "Pager engaged.",
      verification: "Smoke test pending.",
      journalSummary: "Initial intake recorded.",
    });
    expect(created.summary.initiativeIds).toEqual(["platform-modernization"]);
    expect(created.summary.researchIds).toEqual(["evaluate-theme-architecture"]);

    vi.setSystemTime(new Date("2024-01-02T04:00:00.000Z"));
    const checkpointed = await store.recordCheckpointAsync(created.summary.id, {
      title: "Captured login traces",
      body: "Saved packet captures for later comparison.",
    });
    expect(checkpointed.checkpoints).toEqual([
      expect.objectContaining({
        id: "cp-0001",
        checkpointRef: getCheckpointRef("cp-0001"),
      }),
    ]);

    vi.setSystemTime(new Date("2024-01-02T05:06:07.000Z"));
    const closed = await store.closeTicketAsync(created.summary.id, "Smoke test passed.");
    expect(closed.ticket.closed).toBe(true);
    expect(closed.ticket.ref).toBe(ticketRef);
    expect(closed.summary.ref).toBe(ticketRef);
    expect(closed.ticket.frontmatter.status).toBe("closed");
    expect(closed.ticket.frontmatter["updated-at"]).toBe("2024-01-02T05:06:07.000Z");
    expect(closed.ticket.body.verification).toBe("Smoke test pending.\n\nSmoke test passed.");
    expect(await store.listTicketsAsync({ includeClosed: true })).toEqual([
      expect.objectContaining({ id: created.summary.id, ref: ticketRef }),
    ]);

    vi.setSystemTime(new Date("2024-01-02T06:00:00.000Z"));
    const reopened = await store.reopenTicketAsync(created.summary.id);
    expect(reopened.ticket.closed).toBe(false);
    expect(reopened.ticket.frontmatter.status).toBe("open");
    expect(reopened.ticket.frontmatter["updated-at"]).toBe("2024-01-02T06:00:00.000Z");
    expect(reopened.ticket.ref).toBe(ticketRef);
    expect(reopened.summary.ref).toBe(ticketRef);

    const { storage, identity } = await openWorkspaceStorage(workspace);
    const entity = await findEntityByDisplayId(storage, identity.space.id, "ticket", created.summary.id);
    expect(entity).toBeTruthy();
    if (!entity) {
      throw new Error("Expected ticket entity to exist");
    }

    expect(entity.displayId).toBe(created.summary.id);
    expect(entity.id).not.toBe(created.summary.id);

    expect(entity.version).toBe(4);
    expect(entity.attributes).toMatchObject({
      record: {
        ticket: {
          closed: false,
          ref: ticketRef,
          frontmatter: {
            status: "open",
            "updated-at": "2024-01-02T06:00:00.000Z",
          },
          body: {
            verification: "Smoke test pending.\n\nSmoke test passed.",
          },
        },
        checkpoints: [
          {
            id: "cp-0001",
            title: "Captured login traces",
            body: "Saved packet captures for later comparison.",
            checkpointRef: getCheckpointRef("cp-0001"),
          },
        ],
      },
    });
  }, 30000);

  it("persists sequential ticket writes in sqlite by incrementing the canonical entity version", async () => {
    const store = createTicketStore(workspace);

    vi.setSystemTime(new Date("2024-01-03T00:00:01.000Z"));
    const created = await store.createTicketAsync({ title: "Track audit trail" });
    vi.setSystemTime(new Date("2024-01-03T00:00:02.000Z"));
    await store.addNoteAsync(created.summary.id, "Captured incident notes");
    vi.setSystemTime(new Date("2024-01-03T00:00:03.000Z"));
    await store.closeTicketAsync(created.summary.id, "Verified closure");
    vi.setSystemTime(new Date("2024-01-03T00:00:04.000Z"));
    await store.reopenTicketAsync(created.summary.id);

    const { storage, identity } = await openWorkspaceStorage(workspace);
    const entity = await findEntityByDisplayId(storage, identity.space.id, "ticket", created.summary.id);
    expect(entity).toBeTruthy();
    if (!entity) {
      throw new Error("Expected ticket entity to exist");
    }

    expect(entity.version).toBe(4);
    expect(entity.attributes).toMatchObject({
      record: {
        ticket: {
          closed: false,
          archived: false,
          archivedAt: null,
          ref: getTicketRef(created.summary.id),
          frontmatter: {
            status: "open",
            "updated-at": "2024-01-03T00:00:04.000Z",
          },
          body: {
            notes: "- 2024-01-03T00:00:02.000Z Captured incident notes",
            verification: "Verified closure",
          },
        },
        journal: [
          { kind: "state", text: "Created ticket Track audit trail", metadata: { action: "create" } },
          { kind: "note", text: "Captured incident notes", metadata: {} },
          { kind: "verification", text: "Verified closure", metadata: { action: "close" } },
          { kind: "state", text: "Reopened ticket", metadata: { action: "reopen", status: "open" } },
        ],
      },
    });
  }, 30000);

  it("archives only closed tickets and excludes them from default lists", async () => {
    const store = createTicketStore(workspace);

    vi.setSystemTime(new Date("2024-01-04T00:00:00.000Z"));
    const archivedCandidate = await store.createTicketAsync({ title: "Archive me" });
    vi.setSystemTime(new Date("2024-01-04T00:00:01.000Z"));
    const closedArchivedCandidate = await store.createTicketAsync({ title: "Archive me while closed" });
    vi.setSystemTime(new Date("2024-01-04T00:00:02.000Z"));
    await store.closeTicketAsync(closedArchivedCandidate.summary.id, "done");

    vi.setSystemTime(new Date("2024-01-04T00:00:03.000Z"));
    await expect(store.archiveTicketAsync(archivedCandidate.summary.id)).rejects.toThrow(
      `Ticket ${archivedCandidate.summary.id} must be closed before it can be archived.`,
    );

    vi.setSystemTime(new Date("2024-01-04T00:00:04.000Z"));
    const archived = await store.archiveTicketAsync(closedArchivedCandidate.summary.id);
    expect(archived.summary).toMatchObject({
      id: closedArchivedCandidate.summary.id,
      archived: true,
      archivedAt: "2024-01-04T00:00:04.000Z",
      status: "closed",
      closed: true,
    });
    expect(archived.ticket).toMatchObject({ archived: true, archivedAt: "2024-01-04T00:00:04.000Z", closed: true });

    await expect(store.listTicketsAsync({ includeClosed: true })).resolves.toEqual([
      expect.objectContaining({ id: archivedCandidate.summary.id, archived: false, closed: false, status: "ready" }),
    ]);
    await expect(store.listTicketsAsync({ includeClosed: true, includeArchived: true })).resolves.toEqual([
      expect.objectContaining({
        id: closedArchivedCandidate.summary.id,
        archived: true,
        archivedAt: "2024-01-04T00:00:04.000Z",
        status: "closed",
        closed: true,
      }),
      expect.objectContaining({ id: archivedCandidate.summary.id, archived: false, status: "ready", closed: false }),
    ]);

    await expect(store.readTicketAsync(closedArchivedCandidate.summary.id)).resolves.toMatchObject({
      summary: { id: closedArchivedCandidate.summary.id, archived: true, status: "closed", closed: true },
      ticket: { archived: true, archivedAt: "2024-01-04T00:00:04.000Z", closed: true },
    });
  }, 30000);

  it("deletes tickets directly and scrubs remaining dependency and parent references", async () => {
    const store = createTicketStore(workspace);

    vi.setSystemTime(new Date("2024-01-05T00:00:00.000Z"));
    const parent = await store.createTicketAsync({ title: "Parent ticket" });
    vi.setSystemTime(new Date("2024-01-05T00:00:01.000Z"));
    const archivedCandidate = await store.createTicketAsync({ title: "Delete me later" });
    vi.setSystemTime(new Date("2024-01-05T00:00:02.000Z"));
    const dependent = await store.createTicketAsync({
      title: "Depends on deleted",
      deps: [archivedCandidate.summary.id],
    });
    vi.setSystemTime(new Date("2024-01-05T00:00:03.000Z"));
    const child = await store.createTicketAsync({ title: "Child of deleted", parent: archivedCandidate.summary.id });

    vi.setSystemTime(new Date("2024-01-05T00:00:04.000Z"));
    await store.closeTicketAsync(archivedCandidate.summary.id, "done");
    vi.setSystemTime(new Date("2024-01-05T00:00:05.000Z"));
    const deleted = await store.deleteTicketAsync(archivedCandidate.summary.id);

    expect(deleted).toEqual({
      action: "delete",
      deletedTicketId: archivedCandidate.summary.id,
      affectedTicketIds: [dependent.summary.id, child.summary.id],
    });

    await expect(store.readTicketAsync(archivedCandidate.summary.id)).rejects.toThrow(
      `Unknown ticket: ${archivedCandidate.summary.id}`,
    );

    const rereadDependent = await store.readTicketAsync(dependent.summary.id);
    expect(rereadDependent.ticket.frontmatter.deps).toEqual([]);
    expect(rereadDependent.blockers).toEqual([]);

    const rereadChild = await store.readTicketAsync(child.summary.id);
    expect(rereadChild.ticket.frontmatter.parent).toBeNull();

    const remaining = await store.listTicketsAsync({ includeClosed: true, includeArchived: true });
    expect(remaining.map((ticket) => ticket.id)).toEqual([child.summary.id, dependent.summary.id, parent.summary.id]);
  }, 30000);

  it("uses explicit repository scope for repository-bound ticket operations in ambiguous workspaces", async () => {
    const multiRepo = createParentWorkspaceWithChildren();
    const loomRoot = join(multiRepo.cwd, ".pi-loom-scoped-store-test");
    process.env.PI_LOOM_ROOT = loomRoot;

    try {
      const { identity } = await openWorkspaceStorage(multiRepo.cwd);
      const repositories = [...identity.repositories].sort((left, right) =>
        left.displayName.localeCompare(right.displayName),
      );
      const serviceA = repositories[0];
      const serviceB = repositories[1];
      if (!serviceA || !serviceB) {
        throw new Error("Expected two repositories in the multi-repo scope.");
      }

      closeAllWorkspaceStorage();

      vi.setSystemTime(new Date("2024-01-06T12:00:00.000Z"));
      const scopedA = createTicketStore(multiRepo.cwd, { repositoryId: serviceA.id });
      const serviceATicket = await scopedA.createTicketAsync({
        title: "Scoped service A execution",
        summary: "Repository-targeted write without ambient selection.",
      });

      vi.setSystemTime(new Date("2024-01-06T12:00:01.000Z"));
      const checkpointed = await scopedA.recordCheckpointAsync(serviceATicket.summary.id, {
        title: "service-a handoff",
        body: "Scoped checkpoint write succeeds without ambient selection.",
      });
      expect(checkpointed.summary.repository).toMatchObject({ id: serviceA.id });
      expect(checkpointed.checkpoints).toEqual([
        expect.objectContaining({
          title: "service-a handoff",
          body: "Scoped checkpoint write succeeds without ambient selection.",
        }),
      ]);

      vi.setSystemTime(new Date("2024-01-06T12:00:02.000Z"));
      const scopedB = createTicketStore(multiRepo.cwd, { repositoryId: serviceB.id });
      const serviceBTicket = await scopedB.createTicketAsync({
        title: "Scoped service B execution",
        summary: "Second repository write without ambient selection.",
      });

      closeAllWorkspaceStorage();

      await expect(
        createTicketStore(multiRepo.cwd).createTicketAsync({ title: "Ambient ambiguous write" }),
      ).rejects.toThrow(/ambiguous; select a repository/i);
      await expect(
        createTicketStore(multiRepo.cwd, { repositoryId: serviceA.id }).readTicketAsync(serviceATicket.summary.id),
      ).resolves.toMatchObject({
        summary: { id: serviceATicket.summary.id, repository: expect.objectContaining({ id: serviceA.id }) },
        checkpoints: [expect.objectContaining({ title: "service-a handoff" })],
      });
      await expect(
        createTicketStore(multiRepo.cwd, { repositoryId: serviceB.id }).readTicketAsync(serviceBTicket.summary.id),
      ).resolves.toMatchObject({
        summary: { id: serviceBTicket.summary.id, repository: expect.objectContaining({ id: serviceB.id }) },
      });

      const graph = await createTicketStore(multiRepo.cwd, { repositoryId: serviceA.id }).graphAsync();
      expect(graph.nodes[ticketGraphNodeKey(serviceATicket.summary)]).toMatchObject({
        key: ticketGraphNodeKey(serviceATicket.summary),
        id: serviceATicket.summary.id,
        repository: expect.objectContaining({ id: serviceA.id }),
      });
    } finally {
      delete process.env.PI_LOOM_ROOT;
      multiRepo.cleanup();
    }
  }, 60000);

  it("resolves relative attachment paths against the selected repository root and fails closed when ambient scope is ambiguous", async () => {
    const multiRepo = createParentWorkspaceWithChildren();
    const loomRoot = join(multiRepo.cwd, ".pi-loom-attachment-scope-test");
    process.env.PI_LOOM_ROOT = loomRoot;

    try {
      mkdirSync(join(multiRepo.cwd, "service-a", "artifacts"), { recursive: true });
      mkdirSync(join(multiRepo.cwd, "service-b", "artifacts"), { recursive: true });
      writeFileSync(join(multiRepo.cwd, "service-a", "artifacts", "evidence.txt"), "service-a evidence\n", "utf-8");
      writeFileSync(join(multiRepo.cwd, "service-b", "artifacts", "evidence.txt"), "service-b evidence\n", "utf-8");

      const { identity } = await openWorkspaceStorage(multiRepo.cwd);
      const repositories = [...identity.repositories].sort((left, right) =>
        left.displayName.localeCompare(right.displayName),
      );
      const serviceA = repositories[0];
      const serviceB = repositories[1];
      if (!serviceA || !serviceB) {
        throw new Error("Expected two repositories in the multi-repo scope.");
      }

      closeAllWorkspaceStorage();

      vi.setSystemTime(new Date("2024-01-06T12:10:00.000Z"));
      const scopedA = createTicketStore(multiRepo.cwd, { repositoryId: serviceA.id });
      const created = await scopedA.createTicketAsync({
        title: "Scoped attachment resolution",
        summary: "Relative attachment paths should resolve inside the selected repository.",
      });

      vi.setSystemTime(new Date("2024-01-06T12:10:01.000Z"));
      const attached = await scopedA.attachArtifactAsync(created.summary.id, {
        label: "repo-evidence",
        path: "artifacts/evidence.txt",
      });
      expect(attached.attachments).toEqual([
        expect.objectContaining({
          label: "repo-evidence",
          metadata: expect.objectContaining({
            inlineContentBase64: Buffer.from("service-a evidence\n", "utf-8").toString("base64"),
            sourcePath: {
              repositoryId: serviceA.id,
              repositorySlug: serviceA.slug,
              worktreeId: expect.any(String),
              relativePath: "artifacts/evidence.txt",
              displayPath: `${serviceA.slug}:artifacts/evidence.txt`,
            },
          }),
        }),
      ]);

      closeAllWorkspaceStorage();

      await expect(
        createTicketStore(multiRepo.cwd).attachArtifactAsync(created.summary.id, {
          label: "ambiguous-repo-evidence",
          path: "artifacts/evidence.txt",
        }),
      ).rejects.toThrow(/ambiguous; select a repository/i);

      await expect(
        scopedA.attachArtifactAsync(created.summary.id, {
          label: "escaped-repo-evidence",
          path: "../service-b/artifacts/evidence.txt",
        }),
      ).rejects.toThrow(/escapes repository/i);
    } finally {
      delete process.env.PI_LOOM_ROOT;
      multiRepo.cleanup();
    }
  }, 60000);

  it("resolves truthful human-facing refs and freezes structural edits while closed", async () => {
    const store = createTicketStore(workspace);

    vi.setSystemTime(new Date("2024-01-06T00:00:00.000Z"));
    const blocker = await store.createTicketAsync({ title: "Existing dependency" });
    vi.setSystemTime(new Date("2024-01-06T00:00:01.000Z"));
    const created = await store.createTicketAsync({
      title: "Freeze structural edits",
      initiativeIds: ["initiative-a"],
      researchIds: ["research-a"],
      externalRefs: ["plan:plan-a"],
    });

    await expect(store.readTicketAsync(created.summary.id)).resolves.toMatchObject({
      summary: { id: created.summary.id },
    });
    await expect(store.readTicketAsync(`#${created.summary.id}`)).resolves.toMatchObject({
      summary: { id: created.summary.id },
    });
    await expect(store.readTicketAsync(`@${created.summary.id}`)).resolves.toMatchObject({
      summary: { id: created.summary.id },
    });
    await expect(store.readTicketAsync(`ticket:${created.summary.id}`)).resolves.toMatchObject({
      summary: { id: created.summary.id },
    });
    await expect(store.readTicketAsync(`${created.summary.id}.md`)).resolves.toMatchObject({
      summary: { id: created.summary.id },
    });
    await expect(store.readTicketAsync(`tickets/${created.summary.id}.md`)).resolves.toMatchObject({
      summary: { id: created.summary.id },
    });

    vi.setSystemTime(new Date("2024-01-06T00:00:02.000Z"));
    await store.closeTicketAsync(created.summary.id, "verified closed");

    await expect(store.startTicketAsync(created.summary.id)).rejects.toThrow(
      `Closed ticket ${created.summary.id} cannot be started; use reopen before editing it.`,
    );
    await expect(store.addDependencyAsync(created.summary.id, blocker.summary.id)).rejects.toThrow(
      `Closed ticket ${created.summary.id} cannot add dependencies; use reopen before editing it.`,
    );
    await expect(store.setInitiativeIdsAsync(created.summary.id, ["initiative-b"])).rejects.toThrow(
      `Closed ticket ${created.summary.id} cannot change initiative links; use reopen before editing it.`,
    );
    await expect(store.setResearchIdsAsync(created.summary.id, ["research-b"])).rejects.toThrow(
      `Closed ticket ${created.summary.id} cannot change research links; use reopen before editing it.`,
    );
    await expect(store.addExternalRefAsync(created.summary.id, "plan:plan-b")).rejects.toThrow(
      `Closed ticket ${created.summary.id} cannot add external refs; use reopen before editing it.`,
    );

    vi.setSystemTime(new Date("2024-01-06T00:00:03.000Z"));
    const checkpointed = await store.recordCheckpointAsync(created.summary.id, {
      title: "closed handoff",
      body: "append-only checkpoint remains allowed",
    });
    expect(checkpointed.checkpoints).toEqual([
      expect.objectContaining({ title: "closed handoff", body: "append-only checkpoint remains allowed" }),
    ]);

    vi.setSystemTime(new Date("2024-01-06T00:00:04.000Z"));
    const attached = await store.attachArtifactAsync(created.summary.id, {
      label: "closure-evidence",
      content: "opaque ids stay internal",
    });
    expect(attached.attachments).toEqual([
      expect.objectContaining({
        label: "closure-evidence",
        sourceRef: expect.stringContaining(`${created.summary.id}:`),
      }),
    ]);

    vi.setSystemTime(new Date("2024-01-06T00:00:05.000Z"));
    await store.reopenTicketAsync(created.summary.id);
    vi.setSystemTime(new Date("2024-01-06T00:00:06.000Z"));
    const reopened = await store.addDependencyAsync(created.summary.id, blocker.summary.id);
    expect(reopened.summary).toMatchObject({ id: created.summary.id, closed: false, status: "blocked" });
    expect(reopened.ticket.frontmatter).toMatchObject({
      status: "open",
      deps: [blocker.summary.id],
      "initiative-ids": ["initiative-a"],
      "research-ids": ["research-a"],
      "external-refs": ["plan:plan-a"],
    });
  }, 30000);

  it("persists branch intent fields and rejects conflicting combinations", async () => {
    const store = createTicketStore(workspace);

    vi.setSystemTime(new Date("2024-01-07T00:00:00.000Z"));
    const allocator = await store.createTicketAsync({
      title: "Allocator-backed branch intent",
      branchMode: "allocator",
      branchFamily: "UDP-100",
    });
    expect(allocator.ticket.frontmatter).toMatchObject({
      "branch-mode": "allocator",
      "branch-family": "UDP-100",
      "exact-branch-name": null,
    });

    const serialized = serializeTicket(allocator.ticket);
    const reparsed = parseTicket(serialized, allocator.summary.id, false);
    expect(reparsed.frontmatter).toMatchObject({
      "branch-mode": "allocator",
      "branch-family": "UDP-100",
      "exact-branch-name": null,
    });

    vi.setSystemTime(new Date("2024-01-07T00:10:00.000Z"));
    const exact = await store.updateTicketAsync(allocator.summary.id, {
      branchMode: "exact",
      exactBranchName: "release/udp-100-hotfix",
    });
    expect(exact.ticket.frontmatter).toMatchObject({
      "branch-mode": "exact",
      "branch-family": "UDP-100",
      "exact-branch-name": "release/udp-100-hotfix",
    });

    vi.setSystemTime(new Date("2024-01-07T00:20:00.000Z"));
    const cleared = await store.updateTicketAsync(allocator.summary.id, {
      branchMode: "none",
    });
    expect(cleared.ticket.frontmatter).toMatchObject({
      "branch-mode": "none",
      "branch-family": null,
      "exact-branch-name": null,
    });

    await expect(
      store.createTicketAsync({
        title: "Invalid exact branch",
        branchMode: "exact",
      }),
    ).rejects.toThrow("exactBranchName is required when branchMode is exact");
    await expect(
      store.createTicketAsync({
        title: "Invalid allocator branch",
        branchMode: "allocator",
        exactBranchName: "release/udp-100-hotfix",
      }),
    ).rejects.toThrow("branchFamily is required when branchMode is allocator");
    await expect(
      store.createTicketAsync({
        title: "Invalid none branch",
        branchFamily: "UDP-100",
      }),
    ).rejects.toThrow("branchFamily and exactBranchName must be omitted when branchMode is none");
  }, 30000);
});
