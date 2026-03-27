import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createSeededGitWorkspace } from "#storage/__tests__/helpers/git-fixture.js";
import {
  PI_LOOM_RUNTIME_REPOSITORY_ID_ENV,
  PI_LOOM_RUNTIME_SPACE_ID_ENV,
  PI_LOOM_RUNTIME_WORKTREE_ID_ENV,
  PI_LOOM_RUNTIME_WORKTREE_PATH_ENV,
} from "#storage/runtime-scope.js";
import type { DocumentationGovernanceSurface, DocumentationReadResult, DocumentationState } from "../domain/models.js";
import { buildDocumentationOverview } from "../domain/overview.js";
import { renderUpdateDescriptor, renderUpdatePrompt } from "../domain/render.js";
import { getDocsUpdateLaunchConfig, resolveDocsPackageRoot, runDocsUpdate } from "../domain/runtime.js";

function createState(overrides: Partial<DocumentationState> = {}): DocumentationState {
  return {
    docId: "documentation-memory-system",
    title: "Documentation Memory System",
    status: "active",
    docType: "overview",
    sectionGroup: "overviews",
    topicId: "documentation-memory",
    topicRole: "owner",
    createdAt: "2026-03-15T00:00:00.000Z",
    updatedAt: "2026-03-15T00:00:00.000Z",
    summary: "Durable documentation memory.",
    audience: ["ai", "human"],
    scopePaths: [],
    contextRefs: {
      roadmapItemIds: [],
      initiativeIds: [],
      researchIds: [],
      specChangeIds: [],
      ticketIds: [],
      critiqueIds: [],
    },
    sourceTarget: {
      kind: "workspace",
      ref: "workspace",
    },
    verifiedAt: null,
    verificationSource: null,
    successorDocId: null,
    retirementReason: null,
    updateReason: "Sync durable docs.",
    guideTopics: [],
    linkedOutputPaths: [],
    upstreamPath: null,
    lastRevisionId: null,
    ...overrides,
  };
}

function createGovernance(overrides: Partial<DocumentationGovernanceSurface> = {}): DocumentationGovernanceSurface {
  return {
    publicationStatus: overrides.publicationStatus ?? "current-owner",
    publicationSummary:
      overrides.publicationSummary ?? "Current canonical overview for governed topic documentation-memory.",
    recommendedAction: overrides.recommendedAction ?? "update-current-owner",
    currentOwnerDocId: overrides.currentOwnerDocId ?? "documentation-memory-system",
    currentOwnerTitle: overrides.currentOwnerTitle ?? "Documentation Memory System",
    activeOwnerDocIds: overrides.activeOwnerDocIds ?? ["documentation-memory-system"],
    successorDocId: overrides.successorDocId ?? null,
    successorTitle: overrides.successorTitle ?? null,
    predecessorDocIds: overrides.predecessorDocIds ?? [],
    relatedDocs: overrides.relatedDocs ?? [],
  };
}

function createReadResult(overrides: Partial<DocumentationState> = {}): DocumentationReadResult {
  const state = createState(overrides);
  const governance = createGovernance();
  return {
    state,
    summary: {
      id: state.docId,
      title: state.title,
      status: state.status,
      docType: state.docType,
      sectionGroup: state.sectionGroup,
      topicId: state.topicId,
      topicRole: state.topicRole,
      updatedAt: state.updatedAt,
      repository: null,
      sourceKind: state.sourceTarget.kind,
      sourceRef: state.sourceTarget.ref,
      summary: state.summary,
      upstreamPath: state.upstreamPath,
      verifiedAt: state.verifiedAt,
      successorDocId: state.successorDocId,
      revisionCount: 0,
      ref: `documentation:${state.docId}`,
      governance,
    },
    packet: "packet",
    document: "# Documentation Memory System",
    revisions: [],
    overview: buildDocumentationOverview(state, [], governance),
    governance,
  };
}

describe("docs runtime spawn resolution", () => {
  it("roots docs update launch config at the unified pi-loom package, not the caller workspace", () => {
    const launch = getDocsUpdateLaunchConfig("/tmp/caller-workspace/nested", "Update docs", {
      spaceId: "space-001",
      repositoryId: "repo-001",
      worktreeId: "worktree-001",
      worktreePath: "/tmp/worktree-001",
    });

    expect(launch.extensionRoot).toBe(resolveDocsPackageRoot());
    expect(launch.env).toEqual({
      [PI_LOOM_RUNTIME_SPACE_ID_ENV]: "space-001",
      [PI_LOOM_RUNTIME_REPOSITORY_ID_ENV]: "repo-001",
      [PI_LOOM_RUNTIME_WORKTREE_ID_ENV]: "worktree-001",
      [PI_LOOM_RUNTIME_WORKTREE_PATH_ENV]: "/tmp/worktree-001",
    });
  });

  it("resolves the docs package root from the package source, not the caller workspace", () => {
    expect(resolveDocsPackageRoot()).toBe(resolve("."));
  });
});

describe("docs reference rendering", () => {
  it("stores overview refs instead of repo-relative paths and drops generated timestamps", () => {
    const overview = buildDocumentationOverview(createState(), [], createGovernance());

    expect(overview.doc.ref).toBe("documentation:documentation-memory-system");
    expect(overview.packetRef).toBe("documentation:documentation-memory-system:packet");
    expect(overview.documentRef).toBe("documentation:documentation-memory-system:document");
    expect(overview).not.toHaveProperty("generatedAt");
  });

  it("keeps update prompts rooted at the documentation packet ref", () => {
    const result = createReadResult();

    expect(renderUpdateDescriptor("/tmp/workspace/docs", result)).toContain(
      "Packet ref: documentation:documentation-memory-system:packet",
    );
    expect(renderUpdatePrompt("/tmp/workspace/docs", result)).toContain(
      "Perform the documentation maintenance described in documentation:documentation-memory-system:packet.",
    );
    expect(renderUpdatePrompt("/tmp/workspace/docs", result)).toContain(
      "Publication truth: current-owner — Current canonical overview for governed topic documentation-memory.",
    );
    expect(renderUpdatePrompt("/tmp/workspace/docs", result)).not.toContain("../");
  });
});

describe("docs worktree branch policy", () => {
  it("uses managed branch reservations instead of external-ref ordering", async () => {
    const workspace = createSeededGitWorkspace({
      prefix: "pi-docs-runtime-branch-",
      packageName: "pi-loom",
      remoteUrl: "git@github.com:example/pi-loom.git",
    });

    try {
      const ticketStore = (await import("#ticketing/domain/store.js")).createTicketStore(workspace.cwd);
      const created = await ticketStore.createTicketAsync({
        title: "Docs branch reservation ticket",
        branchMode: "allocator",
        branchFamily: "UDP-100",
        externalRefs: ["ZZZ-2", "AAA-1"],
      });

      const worktreeModule = await import("#ralph/domain/worktree.js");
      const harnessModule = await import("#ralph/domain/harness.js");
      const provisionSpy = vi.spyOn(worktreeModule, "provisionWorktree").mockReturnValue(workspace.cwd);
      const harnessSpy = vi.spyOn(harnessModule, "runHarnessLaunch").mockResolvedValue({
        command: "pi",
        args: [],
        exitCode: 0,
        output: "ok",
        stderr: "",
        usage: { measured: false, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
        status: "completed",
        completedAt: new Date().toISOString(),
        events: [],
      });

      await runDocsUpdate(workspace.cwd, "Update docs", undefined, undefined, undefined, created.summary.id);

      expect(provisionSpy).toHaveBeenCalledWith(workspace.cwd, "UDP-100");
      expect(harnessSpy).toHaveBeenCalled();
    } finally {
      workspace.cleanup();
    }
  }, 30000);
});
