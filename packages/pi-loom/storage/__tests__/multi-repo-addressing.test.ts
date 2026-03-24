import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createPlanStore } from "#plans/extensions/domain/store.js";
import { createResearchStore } from "#research/extensions/domain/store.js";
import { createSpecStore } from "#specs/extensions/domain/store.js";
import { createTicketStore } from "#ticketing/extensions/domain/store.js";
import { discoverWorkspaceScope, revokeActiveScopeSelection, selectActiveScope } from "../repository.js";
import { closeAllWorkspaceStorage, openRepositoryWorkspaceStorage, openWorkspaceStorage } from "../workspace.js";

function createParentWorkspaceWithChildren(): { cwd: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "pi-loom-multi-repo-addressing-"));
  const createRepository = (name: string, remoteUrl: string) => {
    const repoRoot = join(root, name);
    mkdirSync(repoRoot, { recursive: true });
    execFileSync("git", ["init"], { cwd: repoRoot, encoding: "utf-8" });
    execFileSync("git", ["config", "user.name", "Pi Loom Tests"], { cwd: repoRoot, encoding: "utf-8" });
    execFileSync("git", ["config", "user.email", "tests@example.com"], { cwd: repoRoot, encoding: "utf-8" });
    execFileSync("git", ["remote", "add", "origin", remoteUrl], { cwd: repoRoot, encoding: "utf-8" });
    writeFileSync(join(repoRoot, "package.json"), JSON.stringify({ name }, null, 2));
    writeFileSync(join(repoRoot, "README.md"), `# ${name}\n`);
    execFileSync("git", ["add", "."], { cwd: repoRoot, encoding: "utf-8" });
    execFileSync("git", ["commit", "-m", "seed"], { cwd: repoRoot, encoding: "utf-8" });
  };

  createRepository("service-a", "git@github.com:example/service-a.git");
  createRepository("service-b", "git@github.com:example/service-b.git");

  return {
    cwd: root,
    cleanup: () => {
      closeAllWorkspaceStorage();
      rmSync(root, { recursive: true, force: true });
    },
  };
}

describe("multi-repository addressing integration", () => {
  it("keeps ticket, plan, research, and spec lists broad at space scope while allowing repository narrowing", async () => {
    const workspace = createParentWorkspaceWithChildren();
    const loomRoot = mkdtempSync(join(tmpdir(), "pi-loom-multi-repo-state-"));
    process.env.PI_LOOM_ROOT = loomRoot;

    try {
      const { identity } = await openWorkspaceStorage(workspace.cwd);
      const repositories = [...identity.repositories].sort((left, right) =>
        left.displayName.localeCompare(right.displayName),
      );
      const firstRepository = repositories[0];
      const secondRepository = repositories[1];
      expect(firstRepository?.displayName).toBe("service-a");
      expect(secondRepository?.displayName).toBe("service-b");
      if (!firstRepository || !secondRepository) {
        throw new Error("Expected two repositories in the multi-repo scope.");
      }

      const selectRepository = async (repositoryId: string) => {
        const { storage } = await openWorkspaceStorage(workspace.cwd);
        await selectActiveScope(workspace.cwd, { repositoryId }, storage);
        closeAllWorkspaceStorage();
      };

      await selectRepository(firstRepository.id);
      const firstTicket = await createTicketStore(workspace.cwd).createTicketAsync({
        title: "Service A execution",
        summary: "Repository-qualified addressing for service A.",
      });
      const firstPlan = await createPlanStore(workspace.cwd).createPlan({
        title: "Service A rollout",
        summary: "Repository-qualified plan for service A.",
        sourceTarget: { kind: "workspace", ref: "service-a-workspace" },
      });
      const firstResearch = await createResearchStore(workspace.cwd).createResearch({
        title: "Service A investigation",
        question: "How should service A qualify repository-scoped results?",
      });
      const firstSpec = await createSpecStore(workspace.cwd).createChange({
        title: "Service A addressing",
        summary: "Service A repository qualification.",
      });

      await selectRepository(secondRepository.id);
      const secondTicket = await createTicketStore(workspace.cwd).createTicketAsync({
        title: "Service B execution",
        summary: "Repository-qualified addressing for service B.",
      });
      const secondPlan = await createPlanStore(workspace.cwd).createPlan({
        title: "Service B rollout",
        summary: "Repository-qualified plan for service B.",
        sourceTarget: { kind: "workspace", ref: "service-b-workspace" },
      });
      const secondResearch = await createResearchStore(workspace.cwd).createResearch({
        title: "Service B investigation",
        question: "How should service B qualify repository-scoped results?",
      });
      const secondSpec = await createSpecStore(workspace.cwd).createChange({
        title: "Service B addressing",
        summary: "Service B repository qualification.",
      });

      revokeActiveScopeSelection(workspace.cwd);
      closeAllWorkspaceStorage();

      const tickets = await createTicketStore(workspace.cwd).listTicketsAsync({
        includeClosed: true,
        includeArchived: true,
      });
      expect(tickets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: firstTicket.summary.id,
            repository: expect.objectContaining({ id: firstRepository.id }),
          }),
          expect.objectContaining({
            id: secondTicket.summary.id,
            repository: expect.objectContaining({ id: secondRepository.id }),
          }),
        ]),
      );
      expect(
        (
          await createTicketStore(workspace.cwd).listTicketsAsync({
            repositoryId: firstRepository.id,
            includeClosed: true,
            includeArchived: true,
          })
        ).map((ticket) => ticket.id),
      ).toEqual([firstTicket.summary.id]);

      const plans = await createPlanStore(workspace.cwd).listPlans();
      expect(plans).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: firstPlan.summary.id,
            repository: expect.objectContaining({ id: firstRepository.id }),
          }),
          expect.objectContaining({
            id: secondPlan.summary.id,
            repository: expect.objectContaining({ id: secondRepository.id }),
          }),
        ]),
      );
      expect(
        (await createPlanStore(workspace.cwd).listPlans({ repositoryId: secondRepository.id })).map((plan) => plan.id),
      ).toEqual([secondPlan.summary.id]);

      const research = await createResearchStore(workspace.cwd).listResearch({ includeArchived: true });
      expect(research).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: firstResearch.summary.id,
            repository: expect.objectContaining({ id: firstRepository.id }),
          }),
          expect.objectContaining({
            id: secondResearch.summary.id,
            repository: expect.objectContaining({ id: secondRepository.id }),
          }),
        ]),
      );
      expect(
        (
          await createResearchStore(workspace.cwd).listResearch({
            repositoryId: firstRepository.id,
            includeArchived: true,
          })
        ).map((entry) => entry.id),
      ).toEqual([firstResearch.summary.id]);

      const specs = await createSpecStore(workspace.cwd).listChanges({ includeArchived: true });
      expect(specs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: firstSpec.summary.id,
            repository: expect.objectContaining({ id: firstRepository.id }),
          }),
          expect.objectContaining({
            id: secondSpec.summary.id,
            repository: expect.objectContaining({ id: secondRepository.id }),
          }),
        ]),
      );
      expect(
        (
          await createSpecStore(workspace.cwd).listChanges({ repositoryId: secondRepository.id, includeArchived: true })
        ).map((entry) => entry.id),
      ).toEqual([secondSpec.summary.id]);
    } finally {
      delete process.env.PI_LOOM_ROOT;
      rmSync(loomRoot, { recursive: true, force: true });
      workspace.cleanup();
    }
  }, 60000);

  it("allows repository-targeted plan, research, and spec reads and writes without an active repository selection", async () => {
    const workspace = createParentWorkspaceWithChildren();
    const loomRoot = mkdtempSync(join(tmpdir(), "pi-loom-multi-repo-scoped-state-"));
    process.env.PI_LOOM_ROOT = loomRoot;

    try {
      const { identity } = await openWorkspaceStorage(workspace.cwd);
      const repositories = [...identity.repositories].sort((left, right) =>
        left.displayName.localeCompare(right.displayName),
      );
      const serviceA = repositories[0];
      const serviceB = repositories[1];
      if (!serviceA || !serviceB) {
        throw new Error("Expected two repositories in the multi-repo scope.");
      }

      revokeActiveScopeSelection(workspace.cwd);
      closeAllWorkspaceStorage();

      const scopedPlanStore = createPlanStore(workspace.cwd, { repositoryId: serviceA.id });
      const scopedResearchStore = createResearchStore(workspace.cwd, { repositoryId: serviceB.id });
      const scopedSpecStore = createSpecStore(workspace.cwd, { repositoryId: serviceA.id });

      const plan = await scopedPlanStore.createPlan({
        title: "Scoped service A rollout",
        summary: "Repository-targeted plan write without active selection.",
        sourceTarget: { kind: "workspace", ref: "service-a-workspace" },
      });
      const research = await scopedResearchStore.createResearch({
        title: "Scoped service B investigation",
        question: "Can explicit repository-targeted reads avoid ambient ambiguity?",
      });
      const spec = await scopedSpecStore.createChange({
        title: "Scoped service A addressing",
        summary: "Repository-targeted spec write without active selection.",
      });

      closeAllWorkspaceStorage();

      await expect(
        createPlanStore(workspace.cwd).createPlan({
          title: "Ambient ambiguous rollout",
          sourceTarget: { kind: "workspace", ref: "ambiguous" },
        }),
      ).rejects.toThrow(/ambiguous; select a repository/i);

      await expect(
        createPlanStore(workspace.cwd, { repositoryId: serviceA.id }).readPlan(plan.summary.id),
      ).resolves.toMatchObject({
        summary: { id: plan.summary.id, repository: expect.objectContaining({ id: serviceA.id }) },
      });
      await expect(
        createResearchStore(workspace.cwd, { repositoryId: serviceB.id }).readResearch(research.summary.id),
      ).resolves.toMatchObject({
        summary: { id: research.summary.id, repository: expect.objectContaining({ id: serviceB.id }) },
      });
      await expect(
        createSpecStore(workspace.cwd, { repositoryId: serviceA.id }).readChange(spec.summary.id),
      ).resolves.toMatchObject({
        summary: { id: spec.summary.id, repository: expect.objectContaining({ id: serviceA.id }) },
      });

      await expect(
        createResearchStore(workspace.cwd, { repositoryId: serviceA.id }).createResearch({
          researchId: research.summary.id,
          title: research.state.title,
        }),
      ).rejects.toThrow(`Research already exists: ${research.summary.id}`);
    } finally {
      delete process.env.PI_LOOM_ROOT;
      rmSync(loomRoot, { recursive: true, force: true });
      workspace.cleanup();
    }
  }, 60000);

  it("preserves space-level reads when one enrolled repository becomes locally unavailable and blocks repo-bound actions", async () => {
    const workspace = createParentWorkspaceWithChildren();
    const loomRoot = mkdtempSync(join(tmpdir(), "pi-loom-multi-repo-degraded-state-"));
    process.env.PI_LOOM_ROOT = loomRoot;

    try {
      const { identity } = await openWorkspaceStorage(workspace.cwd);
      const repositories = [...identity.repositories].sort((left, right) =>
        left.displayName.localeCompare(right.displayName),
      );
      const serviceA = repositories[0];
      const serviceB = repositories[1];
      if (!serviceA || !serviceB) {
        throw new Error("Expected two repositories in the multi-repo scope.");
      }

      const selectRepository = async (repositoryId: string) => {
        const { storage } = await openWorkspaceStorage(workspace.cwd);
        await selectActiveScope(workspace.cwd, { repositoryId }, storage);
        closeAllWorkspaceStorage();
      };

      await selectRepository(serviceA.id);
      const serviceATicket = await createTicketStore(workspace.cwd).createTicketAsync({
        title: "Service A ticket",
        summary: "Remains readable at space scope.",
      });
      await selectRepository(serviceB.id);
      const serviceBTicket = await createTicketStore(workspace.cwd).createTicketAsync({
        title: "Service B ticket",
        summary: "Must remain visible even when the local clone disappears.",
      });

      closeAllWorkspaceStorage();
      rmSync(join(workspace.cwd, "service-b"), { recursive: true, force: true });

      const reopened = await openWorkspaceStorage(workspace.cwd);
      expect(reopened.identity.repository?.id).toBe(serviceB.id);
      expect(reopened.identity.worktree).toBeNull();

      const scope = await discoverWorkspaceScope(workspace.cwd, reopened.storage);
      const degradedRepository = scope.enrolledRepositories.find((entry) => entry.repository.id === serviceB.id);
      expect(degradedRepository).toMatchObject({
        repository: { id: serviceB.id, displayName: "service-b" },
        locallyAvailable: false,
      });
      expect(degradedRepository?.unavailableReason).toContain("no locally available worktree");
      expect(scope.diagnostics.join("\n")).toContain("service-b");

      const tickets = await createTicketStore(workspace.cwd).listTicketsAsync({
        includeClosed: true,
        includeArchived: true,
      });
      expect(tickets.map((ticket) => ticket.id)).toEqual(
        expect.arrayContaining([serviceATicket.summary.id, serviceBTicket.summary.id]),
      );

      await expect(openRepositoryWorkspaceStorage(workspace.cwd)).rejects.toThrow(
        /service-b .* no locally available worktree/i,
      );
    } finally {
      delete process.env.PI_LOOM_ROOT;
      rmSync(loomRoot, { recursive: true, force: true });
      workspace.cleanup();
    }
  }, 60000);
});
