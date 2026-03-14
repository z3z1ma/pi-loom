import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDocumentationDashboard } from "../extensions/domain/dashboard.js";
import type { DocumentationState } from "../extensions/domain/models.js";
import { renderUpdateDescriptor, renderUpdatePrompt } from "../extensions/domain/render.js";
import {
  getDocsUpdateLaunchConfig,
  getPiSpawnCommand,
  resolveDocsPackageRoot,
  resolvePiCliScript,
} from "../extensions/domain/runtime.js";

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
    lastRevisionId: null,
    ...overrides,
  };
}

describe("docs runtime spawn resolution", () => {
  it("roots docs update launch config at the docs package, not the caller workspace", () => {
    const launch = getDocsUpdateLaunchConfig("/tmp/caller-workspace/nested", "Update docs", {
      execPath: "/usr/local/bin/node",
      argv1: "/custom-fork/dist/omp-cli.js",
      existsSync: (filePath) => filePath === "/custom-fork/dist/omp-cli.js",
    });

    expect(launch.extensionRoot).toBe(resolveDocsPackageRoot());
    expect(launch.spawn).toEqual({
      command: "/usr/local/bin/node",
      args: [
        "/custom-fork/dist/omp-cli.js",
        "-e",
        resolveDocsPackageRoot(),
        "--mode",
        "json",
        "-p",
        "--no-session",
        "Update docs",
      ],
    });
  });

  it("resolves the docs package root from the package source, not the caller workspace", () => {
    expect(resolveDocsPackageRoot()).toBe(resolve("packages/pi-docs"));
  });

  it("reuses the current script entrypoint when running under a JS runtime", () => {
    const command = getPiSpawnCommand(["--mode", "json"], {
      execPath: "/usr/local/bin/node",
      argv1: "/custom-fork/dist/omp-cli.js",
      existsSync: (filePath) => filePath === "/custom-fork/dist/omp-cli.js",
    });

    expect(command).toEqual({
      command: "/usr/local/bin/node",
      args: ["/custom-fork/dist/omp-cli.js", "--mode", "json"],
    });
  });

  it("reuses the current executable when running as a standalone binary", () => {
    const command = getPiSpawnCommand(["--mode", "json"], {
      execPath: "/opt/tools/omp",
      argv1: "update documentation",
      existsSync: () => false,
    });

    expect(command).toEqual({
      command: "/opt/tools/omp",
      args: ["--mode", "json"],
    });
  });

  it("falls back to the package bin script when only package metadata is available", () => {
    const packageJsonPath = "/pkg/package.json";
    const packageJson = JSON.stringify({ bin: { pi: "dist/cli.js" } });

    expect(
      resolvePiCliScript({
        execPath: "/usr/local/bin/node",
        argv1: "user prompt",
        existsSync: (filePath) => filePath === "/pkg/dist/cli.js",
        readFileSync: (filePath) => {
          if (filePath !== packageJsonPath) {
            throw new Error(`Unexpected path ${filePath}`);
          }
          return packageJson;
        },
        resolvePackageJson: () => packageJsonPath,
      }),
    ).toBe("/pkg/dist/cli.js");
  });
});

describe("docs repo-relative path rendering", () => {
  it("stores dashboard paths relative to the workspace root and drops generated timestamps", () => {
    const dashboard = buildDocumentationDashboard(
      createState(),
      [],
      "/tmp/workspace/.loom/docs/overviews/documentation-memory-system/packet.md",
      "/tmp/workspace/.loom/docs/overviews/documentation-memory-system/doc.md",
      "/tmp/workspace/.loom/docs/overviews/documentation-memory-system",
    );

    expect(dashboard.doc.path).toBe(".loom/docs/overviews/documentation-memory-system");
    expect(dashboard.packetPath).toBe(".loom/docs/overviews/documentation-memory-system/packet.md");
    expect(dashboard.documentPath).toBe(".loom/docs/overviews/documentation-memory-system/doc.md");
    expect(dashboard).not.toHaveProperty("generatedAt");
  });

  it("keeps update prompts rooted at the repo-relative packet path", () => {
    const state = createState();

    expect(renderUpdateDescriptor("/tmp/workspace/packages/pi-docs", state)).toContain(
      "Packet: .loom/docs/overviews/documentation-memory-system/packet.md",
    );
    expect(renderUpdatePrompt("/tmp/workspace/packages/pi-docs", state)).toContain(
      "Perform the documentation maintenance described in .loom/docs/overviews/documentation-memory-system/packet.md.",
    );
    expect(renderUpdatePrompt("/tmp/workspace/packages/pi-docs", state)).not.toContain("../");
  });
});
