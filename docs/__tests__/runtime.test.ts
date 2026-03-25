import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PI_LOOM_RUNTIME_REPOSITORY_ID_ENV,
  PI_LOOM_RUNTIME_SPACE_ID_ENV,
  PI_LOOM_RUNTIME_WORKTREE_ID_ENV,
  PI_LOOM_RUNTIME_WORKTREE_PATH_ENV,
} from "#storage/runtime-scope.js";
import { buildDocumentationOverview } from "../domain/overview.js";
import type { DocumentationState } from "../domain/models.js";
import { renderUpdateDescriptor, renderUpdatePrompt } from "../domain/render.js";
import { getDocsUpdateLaunchConfig, resolveDocsPackageRoot } from "../domain/runtime.js";

function createState(overrides: Partial<DocumentationState> = {}): DocumentationState {
  return {
    docId: "documentation-memory-system",
    title: "Documentation Memory System",
    status: "active",
    docType: "overview",
    sectionGroup: "overviews",
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
    updateReason: "Sync durable docs.",
    guideTopics: [],
    linkedOutputPaths: [],
    upstreamPath: null,
    lastRevisionId: null,
    ...overrides,
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
    const overview = buildDocumentationOverview(createState(), []);

    expect(overview.doc.ref).toBe("documentation:documentation-memory-system");
    expect(overview.packetRef).toBe("documentation:documentation-memory-system:packet");
    expect(overview.documentRef).toBe("documentation:documentation-memory-system:document");
    expect(overview).not.toHaveProperty("generatedAt");
  });

  it("keeps update prompts rooted at the documentation packet ref", () => {
    const state = createState();

    expect(renderUpdateDescriptor("/tmp/workspace/docs", state)).toContain(
      "Packet ref: documentation:documentation-memory-system:packet",
    );
    expect(renderUpdatePrompt("/tmp/workspace/docs", state)).toContain(
      "Perform the documentation maintenance described in documentation:documentation-memory-system:packet.",
    );
    expect(renderUpdatePrompt("/tmp/workspace/docs", state)).not.toContain("../");
  });
});
