import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assessProjectionFileState,
  createProjectionManifest,
  createProjectionManifestEntry,
  createProjectionRevisionToken,
  ensureProjectionWorkspace,
  hashProjectionContent,
  readProjectionManifest,
  resolveProjectionFilePath,
  stableJsonStringify,
  writeProjectionFile,
  writeProjectionManifest,
} from "../projections.js";
import { createSeededGitWorkspace } from "./helpers/git-fixture.js";

describe("workspace projection substrate", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
    delete process.env.PI_LOOM_ROOT;
  });

  it("bootstraps enabled family directories and preserves user gitignore edits idempotently", () => {
    const workspace = createSeededGitWorkspace({
      prefix: "pi-storage-projections-bootstrap-",
      packageName: "pi-loom-projection-bootstrap-fixture",
      remoteUrl: "git@github.com:example/pi-loom.git",
    });
    cleanups.push(workspace.cleanup);

    const gitignorePath = path.join(workspace.cwd, ".loom", ".gitignore");
    mkdirSync(path.dirname(gitignorePath), { recursive: true });
    writeFileSync(gitignorePath, "custom-cache/\n", "utf-8");

    const first = ensureProjectionWorkspace(workspace.cwd, { enabledFamilies: ["tickets", "specs"] });
    expect(first.config.enabledFamilies).toEqual(["specs", "tickets"]);
    expect(first.gitignore.status).toBe("updated");
    expect(first.families).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ family: "specs", created: true }),
        expect.objectContaining({ family: "tickets", created: true }),
      ]),
    );
    expect(existsSync(path.join(workspace.cwd, ".loom", "specs"))).toBe(true);
    expect(existsSync(path.join(workspace.cwd, ".loom", "tickets"))).toBe(true);

    const gitignore = readFileSync(gitignorePath, "utf-8");
    expect(gitignore).toContain("custom-cache/");
    expect(gitignore.match(/BEGIN pi-loom workspace projections/g)).toHaveLength(1);
    expect(gitignore).toContain("tickets/");
    expect(gitignore).toContain(".reconcile/");

    const second = ensureProjectionWorkspace(workspace.cwd, { enabledFamilies: ["specs", "tickets"] });
    expect(second.gitignore.status).toBe("unchanged");
    expect(second.families).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ family: "specs", created: false }),
        expect.objectContaining({ family: "tickets", created: false }),
      ]),
    );
    expect(readFileSync(gitignorePath, "utf-8")).toBe(gitignore);
  });

  it("builds deterministic manifest entries and skips unchanged manifest rewrites", () => {
    const workspace = createSeededGitWorkspace({
      prefix: "pi-storage-projections-manifest-",
      packageName: "pi-loom-projection-manifest-fixture",
      remoteUrl: "git@github.com:example/pi-loom.git",
    });
    cleanups.push(workspace.cleanup);

    const sharedSemanticInput = { version: 7, fields: ["summary", "body"] };
    const tokenA = createProjectionRevisionToken({
      canonicalRef: "spec:alpha",
      semanticInput: sharedSemanticInput,
      baseVersion: 7,
    });
    const tokenB = createProjectionRevisionToken({
      canonicalRef: "spec:alpha",
      semanticInput: { fields: ["summary", "body"], version: 7 },
      baseVersion: 7,
    });
    expect(tokenA).toBe(tokenB);

    const alphaEntry = createProjectionManifestEntry({
      canonicalRef: "spec:alpha",
      relativePath: "alpha.md",
      renderedContent: "Alpha body\n",
      revision: { canonicalRef: "spec:alpha", semanticInput: sharedSemanticInput, baseVersion: 7 },
      editability: { mode: "sections", editableSections: ["Body", "Summary", "Body"] },
      metadata: { editable: true, sectionCount: 2 },
    });
    const betaEntry = createProjectionManifestEntry({
      canonicalRef: "spec:beta",
      relativePath: "nested/../beta.md",
      renderedContent: "Beta body\n",
      revision: { canonicalRef: "spec:beta", semanticInput: { version: 2 }, baseVersion: 2 },
      editability: { mode: "read_only" },
      metadata: { editable: false },
    });

    const manifest = createProjectionManifest("specs", [betaEntry, alphaEntry], {
      retentionPolicy: { mode: "all-records" },
    });
    const manifestPath = path.join(workspace.cwd, ".loom", "specs", "manifest.json");
    const firstWrite = writeProjectionManifest(manifestPath, manifest);
    const firstStat = statSync(manifestPath);

    expect(firstWrite.status).toBe("created");
    expect(manifest.entries.map((entry) => entry.relativePath)).toEqual(["alpha.md", "beta.md"]);
    expect(manifest.entries[0]).toMatchObject({
      canonicalRef: "spec:alpha",
      baseVersion: 7,
      contentHash: hashProjectionContent("Alpha body\n"),
      editability: { mode: "sections", editableSections: ["Body", "Summary"] },
      metadata: { editable: true, sectionCount: 2 },
    });

    const manifestJson = JSON.parse(readFileSync(manifestPath, "utf-8")) as Record<string, unknown>;
    expect(manifestJson).toMatchObject({
      schemaVersion: 1,
      family: "specs",
      metadata: { retentionPolicy: { mode: "all-records" } },
    });
    expect(stableJsonStringify(manifestJson)).toBe(readFileSync(manifestPath, "utf-8").trimEnd());
    expect(readProjectionManifest(manifestPath)).toEqual(manifest);

    const secondWrite = writeProjectionManifest(
      manifestPath,
      createProjectionManifest("specs", [alphaEntry, betaEntry], {
        retentionPolicy: { mode: "all-records" },
      }),
    );
    const secondStat = statSync(manifestPath);
    expect(secondWrite.status).toBe("unchanged");
    expect(secondStat.mtimeMs).toBe(firstStat.mtimeMs);
  });

  it("writes projection files with low churn and normalized family paths", () => {
    const workspace = createSeededGitWorkspace({
      prefix: "pi-storage-projections-file-",
      packageName: "pi-loom-projection-file-fixture",
      remoteUrl: "git@github.com:example/pi-loom.git",
    });
    cleanups.push(workspace.cleanup);

    const projectionPath = resolveProjectionFilePath(workspace.cwd, "plans", "nested/../plan.md");
    const first = writeProjectionFile(projectionPath, "Plan body");
    const firstStat = statSync(projectionPath);
    const second = writeProjectionFile(projectionPath, "Plan body\n");
    const secondStat = statSync(projectionPath);

    expect(projectionPath).toBe(path.join(workspace.cwd, ".loom", "plans", "plan.md"));
    expect(first.status).toBe("created");
    expect(second.status).toBe("unchanged");
    expect(first.contentHash).toBe(hashProjectionContent("Plan body\n"));
    expect(secondStat.mtimeMs).toBe(firstStat.mtimeMs);
  });

  it("reports clean modified and missing projection file states from the manifest contract", () => {
    const workspace = createSeededGitWorkspace({
      prefix: "pi-storage-projections-dirty-",
      packageName: "pi-loom-projection-dirty-fixture",
      remoteUrl: "git@github.com:example/pi-loom.git",
    });
    cleanups.push(workspace.cleanup);

    const entry = createProjectionManifestEntry({
      canonicalRef: "plan:workspace-projections-rollout-plan",
      relativePath: "2026/workspace-projections-rollout-plan.md",
      renderedContent: "Original plan body\n",
      revision: {
        canonicalRef: "plan:workspace-projections-rollout-plan",
        semanticInput: { version: 3, sections: ["Purpose / Big Picture", "Plan of Work"] },
        baseVersion: 3,
      },
      editability: { mode: "full" },
    });
    const projectionPath = resolveProjectionFilePath(workspace.cwd, "plans", entry.relativePath);

    writeProjectionFile(projectionPath, "Original plan body\n");
    expect(assessProjectionFileState(workspace.cwd, "plans", entry)).toMatchObject({
      kind: "clean",
      absolutePath: projectionPath,
      relativePath: entry.relativePath,
      expectedContentHash: entry.contentHash,
      actualContentHash: entry.contentHash,
      revisionToken: entry.revisionToken,
      baseVersion: 3,
    });

    writeFileSync(projectionPath, "Locally edited plan body\n", "utf-8");
    expect(assessProjectionFileState(workspace.cwd, "plans", entry)).toMatchObject({
      kind: "modified",
      actualContentHash: hashProjectionContent("Locally edited plan body\n"),
    });

    rmSync(projectionPath, { force: true });
    expect(assessProjectionFileState(workspace.cwd, "plans", entry)).toMatchObject({
      kind: "missing",
      actualContentHash: null,
    });
  });
});
