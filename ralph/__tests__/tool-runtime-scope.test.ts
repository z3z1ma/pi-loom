import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { createPlanStore } from "#plans/domain/store.js";
import {
  createSeededGitWorkspace,
  createSeededParentGitWorkspace,
  runTestGit,
} from "#storage/__tests__/helpers/git-fixture.js";
import { findEntityByDisplayId } from "#storage/entities.js";
import {
  PI_LOOM_RUNTIME_REPOSITORY_ID_ENV,
  PI_LOOM_RUNTIME_SPACE_ID_ENV,
  PI_LOOM_RUNTIME_WORKTREE_ID_ENV,
  PI_LOOM_RUNTIME_WORKTREE_PATH_ENV,
  runtimeScopeToEnv,
} from "#storage/runtime-scope.js";
import { selectActiveScope } from "#storage/scope.js";
import { closeAllWorkspaceStorage, openRepositoryWorkspaceStorage, openWorkspaceStorage } from "#storage/workspace.js";
import { createTicketStore } from "#ticketing/domain/store.js";
import type { ExecuteRalphLoopResult } from "../domain/loop.js";
import { createRalphStore } from "../domain/store.js";

function createMockPi(): {
  tools: Map<string, ToolDefinition>;
  registerTool: ReturnType<typeof vi.fn>;
} {
  const tools = new Map<string, ToolDefinition>();
  return {
    tools,
    registerTool: vi.fn((definition: ToolDefinition) => {
      tools.set(definition.name, definition);
    }),
  };
}

function getTool(mockPi: { tools: Map<string, ToolDefinition> }, name: string): ToolDefinition {
  const tool = mockPi.tools.get(name);
  expect(tool).toBeDefined();
  if (!tool) {
    throw new Error(`Missing tool ${name}`);
  }
  return tool;
}

function createContext(cwd: string): ExtensionContext {
  return { cwd, sessionManager: { getBranch: () => [] } } as unknown as ExtensionContext;
}

async function recordBoundTicketActivity(
  workspace: string,
  ticketId: string,
  repositoryId: string,
  worktreeId: string,
  journalText: string,
) {
  const ticketStore = createTicketStore(workspace, { repositoryId, worktreeId });
  await ticketStore.updateTicketAsync(ticketId, { status: "in_progress" });
  await ticketStore.addJournalEntryAsync(ticketId, "progress", journalText);
}

describe("ralph tool runtime scope integration", () => {
  it("keeps ralph_run pinned to the selected sibling worktree from a parent workspace", async () => {
    const workspace = createSeededParentGitWorkspace({
      prefix: "pi-ralph-tool-sibling-worktrees-",
      repositories: [
        { name: "service-a", remoteUrl: "git@github.com:example/service-a.git" },
        { name: "service-a-clone", remoteUrl: "git@github.com:example/service-a.git" },
      ],
    });
    const loomRoot = mkdtempSync(join(tmpdir(), "pi-ralph-tool-sibling-worktrees-state-"));
    const previousRuntimeEnv = {
      root: process.env.PI_LOOM_ROOT,
      spaceId: process.env[PI_LOOM_RUNTIME_SPACE_ID_ENV],
      repositoryId: process.env[PI_LOOM_RUNTIME_REPOSITORY_ID_ENV],
      worktreeId: process.env[PI_LOOM_RUNTIME_WORKTREE_ID_ENV],
    };
    process.env.PI_LOOM_ROOT = loomRoot;
    delete process.env[PI_LOOM_RUNTIME_SPACE_ID_ENV];
    delete process.env[PI_LOOM_RUNTIME_REPOSITORY_ID_ENV];
    delete process.env[PI_LOOM_RUNTIME_WORKTREE_ID_ENV];

    const runtimeModule = await import("../domain/runtime.js");
    const runtimeSpy = vi.spyOn(runtimeModule, "runRalphLaunch");

    try {
      const { storage, identity } = await openWorkspaceStorage(workspace.cwd);
      expect(identity.repositories).toHaveLength(1);
      expect(identity.worktrees).toHaveLength(2);
      const repository = identity.repositories[0];
      if (!repository) {
        throw new Error("Missing canonical repository identity for sibling worktrees");
      }

      const [untouchedWorktree, targetWorktree] = [...identity.worktrees].sort((left, right) =>
        left.logicalKey.localeCompare(right.logicalKey),
      );
      if (!untouchedWorktree || !targetWorktree) {
        throw new Error("Missing sibling worktree identities");
      }

      const selected = await selectActiveScope(
        workspace.cwd,
        { repositoryId: repository.id, worktreeId: targetWorktree.id },
        storage,
      );
      expect(selected.worktree?.id).toBe(targetWorktree.id);
      closeAllWorkspaceStorage();

      const { identity: scopedIdentity } = await openRepositoryWorkspaceStorage(workspace.cwd, {
        repositoryId: repository.id,
      });
      expect(scopedIdentity.worktree.id).toBe(targetWorktree.id);

      const ticketStore = createTicketStore(workspace.cwd, {
        repositoryId: repository.id,
        worktreeId: targetWorktree.id,
      });
      const ticket = await ticketStore.createTicketAsync({
        title: "Sibling worktree Ralph tool ticket",
        summary: "Launch ralph_run from the parent workspace without drifting onto the sibling clone.",
        plan: "Run one bounded iteration through the operator-facing tool path while the target repository has two local sibling worktrees.",
        verification:
          "Inspect the launch env and persisted runtime artifact scope and confirm the sibling worktree stays untouched.",
      });

      const planStore = createPlanStore(workspace.cwd, {
        repositoryId: repository.id,
        worktreeId: targetWorktree.id,
      });
      const plan = await planStore.createPlan({
        title: "Sibling worktree Ralph tool plan",
        summary: "Exercise parent-workspace ralph_run scoping when one canonical repository has two local clones.",
        sourceTarget: { kind: "workspace", ref: repository.slug },
      });
      await planStore.linkPlanTicket(plan.state.planId, { ticketId: ticket.summary.id, role: "execution" });

      const mockPi = createMockPi();
      const { registerRalphTools } = await import("../tools/ralph.js");
      registerRalphTools(mockPi as unknown as ExtensionAPI);

      let launchEnv: Record<string, string | undefined> | undefined;
      runtimeSpy.mockImplementationOnce(async (_cwd, launch, _signal, _onUpdate, extraEnv) => {
        launchEnv = extraEnv ?? {};
        await recordBoundTicketActivity(
          workspace.cwd,
          launch.ticketRef,
          repository.id,
          targetWorktree.id,
          `Recorded ${launch.iterationId} through ralph_run for selected sibling worktree ${targetWorktree.id}.`,
        );
        return {
          command: "pi",
          args: ["session-runtime"],
          exitCode: 0,
          output: "sibling worktree ralph_run scoped launch ok",
          stderr: "",
          usage: { measured: true, input: 8, output: 13, cacheRead: 0, cacheWrite: 0, totalTokens: 21 },
          status: "completed",
          completedAt: new Date().toISOString(),
        };
      });

      const result = await getTool(mockPi, "ralph_run").execute(
        "call-sibling-worktree-run",
        {
          ticketRef: ticket.summary.id,
          planRef: plan.state.planId,
          background: false,
        },
        undefined,
        undefined,
        createContext(workspace.cwd),
      );
      const loopResult = (result.details as { result: ExecuteRalphLoopResult }).result;

      expect(launchEnv).toMatchObject({
        [PI_LOOM_RUNTIME_SPACE_ID_ENV]: scopedIdentity.space.id,
        [PI_LOOM_RUNTIME_REPOSITORY_ID_ENV]: repository.id,
        [PI_LOOM_RUNTIME_WORKTREE_ID_ENV]: targetWorktree.id,
      });
      expect(loopResult.run.runtimeArtifacts.at(-1)).toMatchObject({
        runtimeScope: {
          spaceId: scopedIdentity.space.id,
          repositoryId: repository.id,
          worktreeId: targetWorktree.id,
        },
      });
      expect(
        loopResult.run.runtimeArtifacts.some((artifact) => artifact.runtimeScope?.worktreeId === untouchedWorktree.id),
      ).toBe(false);

      const updatedTicket = await createTicketStore(workspace.cwd, {
        repositoryId: repository.id,
        worktreeId: targetWorktree.id,
      }).readTicketAsync(ticket.summary.id);
      expect(
        updatedTicket.journal.some((entry) => entry.text.includes(`selected sibling worktree ${targetWorktree.id}`)),
      ).toBe(true);

      closeAllWorkspaceStorage();
      const reopened = await openWorkspaceStorage(workspace.cwd);
      expect(reopened.identity.repository?.id).toBe(repository.id);
      expect(reopened.identity.worktree?.id).toBe(targetWorktree.id);
      expect(reopened.identity.activeScope.worktreeId).toBe(targetWorktree.id);

      const runEntity = await findEntityByDisplayId(
        reopened.storage,
        reopened.identity.space.id,
        "ralph_run",
        loopResult.run.state.runId,
      );
      expect(runEntity).toMatchObject({ owningRepositoryId: repository.id });
    } finally {
      runtimeSpy.mockRestore();
      closeAllWorkspaceStorage();
      if (previousRuntimeEnv.root === undefined) {
        delete process.env.PI_LOOM_ROOT;
      } else {
        process.env.PI_LOOM_ROOT = previousRuntimeEnv.root;
      }
      if (previousRuntimeEnv.spaceId === undefined) {
        delete process.env[PI_LOOM_RUNTIME_SPACE_ID_ENV];
      } else {
        process.env[PI_LOOM_RUNTIME_SPACE_ID_ENV] = previousRuntimeEnv.spaceId;
      }
      if (previousRuntimeEnv.repositoryId === undefined) {
        delete process.env[PI_LOOM_RUNTIME_REPOSITORY_ID_ENV];
      } else {
        process.env[PI_LOOM_RUNTIME_REPOSITORY_ID_ENV] = previousRuntimeEnv.repositoryId;
      }
      if (previousRuntimeEnv.worktreeId === undefined) {
        delete process.env[PI_LOOM_RUNTIME_WORKTREE_ID_ENV];
      } else {
        process.env[PI_LOOM_RUNTIME_WORKTREE_ID_ENV] = previousRuntimeEnv.worktreeId;
      }
      rmSync(loomRoot, { recursive: true, force: true });
      workspace.cleanup();
    }
  }, 120000);

  it("reads packet state from the nested Ralph worktree when ctx.cwd still points at the parent repo", async () => {
    const workspace = createSeededGitWorkspace({
      prefix: "pi-ralph-tool-nested-worktree-",
      packageName: "pi-ralph-tool-nested-worktree",
      remoteUrl: "git@github.com:example/pi-ralph-tool-nested-worktree.git",
      piLoomRoot: false,
    });
    const childWorktree = join(workspace.cwd, ".ralph-worktrees", "ralph-ticket-123");
    runTestGit(workspace.cwd, "worktree", "add", "-b", "ralph/ticket-123", childWorktree);

    const loomRoot = mkdtempSync(join(tmpdir(), "pi-ralph-tool-nested-worktree-state-"));
    const previousRuntimeEnv = {
      root: process.env.PI_LOOM_ROOT,
      pwd: process.env.PWD,
      spaceId: process.env[PI_LOOM_RUNTIME_SPACE_ID_ENV],
      repositoryId: process.env[PI_LOOM_RUNTIME_REPOSITORY_ID_ENV],
      worktreeId: process.env[PI_LOOM_RUNTIME_WORKTREE_ID_ENV],
      worktreePath: process.env[PI_LOOM_RUNTIME_WORKTREE_PATH_ENV],
    };
    process.env.PI_LOOM_ROOT = loomRoot;

    try {
      closeAllWorkspaceStorage();
      const { identity: parentIdentity } = await openWorkspaceStorage(workspace.cwd);
      const repository = parentIdentity.repository;
      const parentWorktree = parentIdentity.worktree;
      expect(repository).toBeDefined();
      expect(parentWorktree).toBeDefined();
      if (!repository || !parentWorktree) {
        throw new Error("Missing parent repository/worktree identity");
      }

      const { identity: childIdentity } = await openWorkspaceStorage(childWorktree);
      const childRepository = childIdentity.repository;
      const nestedWorktree = childIdentity.worktree;
      expect(childRepository?.id).toBe(repository.id);
      expect(nestedWorktree).toBeDefined();
      expect(nestedWorktree?.id).not.toBe(parentWorktree.id);
      if (!childRepository || !nestedWorktree) {
        throw new Error("Missing nested worktree identity");
      }

      const ticketStore = createTicketStore(childWorktree, {
        repositoryId: childRepository.id,
        worktreeId: nestedWorktree.id,
      });
      const ticket = await ticketStore.createTicketAsync({
        title: "Nested worktree Ralph read ticket",
        summary:
          "Read the Ralph packet from a child worktree even when the host ctx.cwd still points at the parent repo.",
        plan: "Seed a repository-bound Ralph run in the nested worktree, then exercise ralph_read through the tool path with stale parent runtime env.",
        verification:
          "The ralph_read packet call should resolve the child-worktree run instead of failing with an unknown parent worktree id.",
      });

      const planStore = createPlanStore(childWorktree, {
        repositoryId: childRepository.id,
        worktreeId: nestedWorktree.id,
      });
      const plan = await planStore.createPlan({
        title: "Nested worktree Ralph read plan",
        summary: "Exercise stale parent ctx.cwd handling when reading a child worktree Ralph packet.",
        sourceTarget: { kind: "workspace", ref: childRepository.slug },
      });
      await planStore.linkPlanTicket(plan.state.planId, { ticketId: ticket.summary.id, role: "execution" });

      const run = createRalphStore(childWorktree).createRun({
        title: "Nested worktree Ralph read run",
        objective: "Keep packet reads bound to the actual child worktree session when the tool host lags behind.",
        linkedRefs: {
          planIds: [plan.state.planId],
          ticketIds: [ticket.summary.id],
        },
        scope: {
          mode: "execute",
          repositoryId: childRepository.id,
          specChangeId: null,
          planId: plan.state.planId,
          ticketId: ticket.summary.id,
          roadmapItemIds: [],
          initiativeIds: [],
          researchIds: [],
          critiqueIds: [],
          docIds: [],
        },
        packetContext: {
          capturedAt: new Date().toISOString(),
          constitutionBrief: "Keep Ralph packet reads on the truthful worktree.",
          specContext: null,
          planContext: "Nested worktree packet context.",
          ticketContext: "Bound ticket ledger lives in the nested worktree.",
          priorIterationLearnings: [],
          operatorNotes: null,
        },
      });

      const staleParentScope = runtimeScopeToEnv({
        spaceId: parentIdentity.space.id,
        repositoryId: repository.id,
        worktreeId: parentWorktree.id,
        worktreePath: workspace.cwd,
      });
      process.env[PI_LOOM_RUNTIME_SPACE_ID_ENV] = staleParentScope[PI_LOOM_RUNTIME_SPACE_ID_ENV];
      process.env[PI_LOOM_RUNTIME_REPOSITORY_ID_ENV] = staleParentScope[PI_LOOM_RUNTIME_REPOSITORY_ID_ENV];
      process.env[PI_LOOM_RUNTIME_WORKTREE_ID_ENV] = staleParentScope[PI_LOOM_RUNTIME_WORKTREE_ID_ENV];
      process.env[PI_LOOM_RUNTIME_WORKTREE_PATH_ENV] = staleParentScope[PI_LOOM_RUNTIME_WORKTREE_PATH_ENV];
      process.env.PWD = childWorktree;

      const mockPi = createMockPi();
      const { registerRalphTools } = await import("../tools/ralph.js");
      registerRalphTools(mockPi as unknown as ExtensionAPI);

      const packet = await getTool(mockPi, "ralph_read").execute(
        "call-nested-worktree-packet",
        {
          ticketRef: ticket.summary.id,
          planRef: plan.state.planId,
          mode: "packet",
        },
        undefined,
        undefined,
        createContext(workspace.cwd),
      );

      const details = (packet as { details: { run: { id: string }; packet: string } }).details;
      expect(details.run.id).toBe(run.summary.id);
      expect(details.packet).toContain(`- governing plan: ${plan.state.planId}`);
      expect(details.packet).toContain(`- active ticket: ${ticket.summary.id}`);
    } finally {
      closeAllWorkspaceStorage();
      if (previousRuntimeEnv.root === undefined) {
        delete process.env.PI_LOOM_ROOT;
      } else {
        process.env.PI_LOOM_ROOT = previousRuntimeEnv.root;
      }
      if (previousRuntimeEnv.pwd === undefined) {
        delete process.env.PWD;
      } else {
        process.env.PWD = previousRuntimeEnv.pwd;
      }
      if (previousRuntimeEnv.spaceId === undefined) {
        delete process.env[PI_LOOM_RUNTIME_SPACE_ID_ENV];
      } else {
        process.env[PI_LOOM_RUNTIME_SPACE_ID_ENV] = previousRuntimeEnv.spaceId;
      }
      if (previousRuntimeEnv.repositoryId === undefined) {
        delete process.env[PI_LOOM_RUNTIME_REPOSITORY_ID_ENV];
      } else {
        process.env[PI_LOOM_RUNTIME_REPOSITORY_ID_ENV] = previousRuntimeEnv.repositoryId;
      }
      if (previousRuntimeEnv.worktreeId === undefined) {
        delete process.env[PI_LOOM_RUNTIME_WORKTREE_ID_ENV];
      } else {
        process.env[PI_LOOM_RUNTIME_WORKTREE_ID_ENV] = previousRuntimeEnv.worktreeId;
      }
      if (previousRuntimeEnv.worktreePath === undefined) {
        delete process.env[PI_LOOM_RUNTIME_WORKTREE_PATH_ENV];
      } else {
        process.env[PI_LOOM_RUNTIME_WORKTREE_PATH_ENV] = previousRuntimeEnv.worktreePath;
      }
      rmSync(loomRoot, { recursive: true, force: true });
      workspace.cleanup();
    }
  }, 120000);

  it("creates the bound Ralph run on demand when reading packet mode for a linked plan ticket", async () => {
    const workspace = createSeededGitWorkspace({
      prefix: "pi-ralph-tool-create-on-read-",
      packageName: "pi-ralph-tool-create-on-read",
      remoteUrl: "git@github.com:example/pi-ralph-tool-create-on-read.git",
      piLoomRoot: false,
    });
    const loomRoot = mkdtempSync(join(tmpdir(), "pi-ralph-tool-create-on-read-state-"));
    const previousRuntimeEnv = {
      root: process.env.PI_LOOM_ROOT,
      spaceId: process.env[PI_LOOM_RUNTIME_SPACE_ID_ENV],
      repositoryId: process.env[PI_LOOM_RUNTIME_REPOSITORY_ID_ENV],
      worktreeId: process.env[PI_LOOM_RUNTIME_WORKTREE_ID_ENV],
      worktreePath: process.env[PI_LOOM_RUNTIME_WORKTREE_PATH_ENV],
    };
    process.env.PI_LOOM_ROOT = loomRoot;

    try {
      closeAllWorkspaceStorage();
      const { identity } = await openWorkspaceStorage(workspace.cwd);
      const repository = identity.repository;
      const worktree = identity.worktree;
      expect(repository).toBeDefined();
      expect(worktree).toBeDefined();
      if (!repository || !worktree) {
        throw new Error("Missing repository/worktree identity for packet creation test");
      }

      const ticketStore = createTicketStore(workspace.cwd, {
        repositoryId: repository.id,
        worktreeId: worktree.id,
      });
      const ticket = await ticketStore.createTicketAsync({
        title: "Packet read creates Ralph run",
        summary:
          "Ensure packet-mode reads create the bound Ralph run when a linked plan ticket has no durable run yet.",
        plan: "Create a repository-bound ticket and plan without seeding a Ralph run, then call ralph_read mode=packet through the tool path.",
        verification:
          "The packet read should return a packet, persist a durable Ralph run, and bind that run back to the exact plan/ticket pair.",
      });

      const planStore = createPlanStore(workspace.cwd, {
        repositoryId: repository.id,
        worktreeId: worktree.id,
      });
      const plan = await planStore.createPlan({
        title: "Packet read creates Ralph run plan",
        summary: "Exercise on-demand Ralph run creation through the packet read tool path.",
        sourceTarget: { kind: "workspace", ref: repository.slug },
      });
      await planStore.linkPlanTicket(plan.state.planId, { ticketId: ticket.summary.id, role: "execution" });

      const mockPi = createMockPi();
      const { registerRalphTools } = await import("../tools/ralph.js");
      registerRalphTools(mockPi as unknown as ExtensionAPI);

      const packet = await getTool(mockPi, "ralph_read").execute(
        "call-create-on-read-packet",
        {
          ticketRef: ticket.summary.id,
          planRef: plan.state.planId,
          mode: "packet",
        },
        undefined,
        undefined,
        createContext(workspace.cwd),
      );

      const details = (packet as { details: { run: { id: string }; packet: string } }).details;
      const createdRun = await createRalphStore(workspace.cwd).readRunAsync(details.run.id);

      expect(details.packet).toContain(`- governing plan: ${plan.state.planId}`);
      expect(details.packet).toContain(`- active ticket: ${ticket.summary.id}`);
      expect(createdRun.state.scope).toMatchObject({
        repositoryId: repository.id,
        planId: plan.state.planId,
        ticketId: ticket.summary.id,
      });

      closeAllWorkspaceStorage();
      const reopened = await openWorkspaceStorage(workspace.cwd);
      const runEntity = await findEntityByDisplayId(
        reopened.storage,
        reopened.identity.space.id,
        "ralph_run",
        details.run.id,
      );
      expect(runEntity).toMatchObject({ owningRepositoryId: repository.id });
    } finally {
      closeAllWorkspaceStorage();
      if (previousRuntimeEnv.root === undefined) {
        delete process.env.PI_LOOM_ROOT;
      } else {
        process.env.PI_LOOM_ROOT = previousRuntimeEnv.root;
      }
      if (previousRuntimeEnv.spaceId === undefined) {
        delete process.env[PI_LOOM_RUNTIME_SPACE_ID_ENV];
      } else {
        process.env[PI_LOOM_RUNTIME_SPACE_ID_ENV] = previousRuntimeEnv.spaceId;
      }
      if (previousRuntimeEnv.repositoryId === undefined) {
        delete process.env[PI_LOOM_RUNTIME_REPOSITORY_ID_ENV];
      } else {
        process.env[PI_LOOM_RUNTIME_REPOSITORY_ID_ENV] = previousRuntimeEnv.repositoryId;
      }
      if (previousRuntimeEnv.worktreeId === undefined) {
        delete process.env[PI_LOOM_RUNTIME_WORKTREE_ID_ENV];
      } else {
        process.env[PI_LOOM_RUNTIME_WORKTREE_ID_ENV] = previousRuntimeEnv.worktreeId;
      }
      if (previousRuntimeEnv.worktreePath === undefined) {
        delete process.env[PI_LOOM_RUNTIME_WORKTREE_PATH_ENV];
      } else {
        process.env[PI_LOOM_RUNTIME_WORKTREE_PATH_ENV] = previousRuntimeEnv.worktreePath;
      }
      rmSync(loomRoot, { recursive: true, force: true });
      workspace.cleanup();
    }
  }, 120000);
});
