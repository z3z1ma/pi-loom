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
  it("roots docs update launch config at the unified pi-loom package, not the caller workspace", () => {
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
    expect(resolveDocsPackageRoot()).toBe(resolve("."));
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

  it("reuses an extensionless shebang script entrypoint when running under a JS runtime", () => {
    const command = getPiSpawnCommand(["--mode", "json"], {
      execPath: "/usr/local/bin/node",
      argv1: "/custom-fork/bin/pi",
      existsSync: (filePath) => filePath === "/custom-fork/bin/pi",
      readFileSync: (filePath) => {
        if (filePath !== "/custom-fork/bin/pi") {
          throw new Error(`Unexpected path ${filePath}`);
        }
        return "#!/usr/bin/env node\nconsole.log('pi');\n";
      },
    });

    expect(command).toEqual({
      command: "/usr/local/bin/node",
      args: ["/custom-fork/bin/pi", "--mode", "json"],
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

  it("accepts an extensionless shebang package bin script", () => {
    const packageJsonPath = "/pkg/package.json";
    const packageJson = JSON.stringify({ bin: { pi: "dist/cli" } });

    expect(
      resolvePiCliScript({
        execPath: "/usr/local/bin/node",
        argv1: "user prompt",
        existsSync: (filePath) => filePath === "/pkg/dist/cli",
        readFileSync: (filePath) => {
          if (filePath === packageJsonPath) {
            return packageJson;
          }
          if (filePath === "/pkg/dist/cli") {
            return "#!/usr/bin/env node\nconsole.log('pi');\n";
          }
          throw new Error(`Unexpected path ${filePath}`);
        },
        resolvePackageJson: () => packageJsonPath,
      }),
    ).toBe("/pkg/dist/cli");
  });
});

describe("docs reference rendering", () => {
  it("stores dashboard refs instead of repo-relative paths and drops generated timestamps", () => {
    const dashboard = buildDocumentationDashboard(createState(), []);

    expect(dashboard.doc.ref).toBe("documentation:documentation-memory-system");
    expect(dashboard.packetRef).toBe("documentation:documentation-memory-system:packet");
    expect(dashboard.documentRef).toBe("documentation:documentation-memory-system:document");
    expect(dashboard).not.toHaveProperty("generatedAt");
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
