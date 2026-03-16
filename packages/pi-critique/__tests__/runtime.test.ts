import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPiSpawnCommand, resolveExtensionPackageRoot, resolvePiCliScript } from "../extensions/domain/runtime.js";
import { createCritiqueStore } from "../extensions/domain/store.js";

describe("critique runtime spawn resolution", () => {
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
      argv1: "review target",
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

  it("roots extension launches at the critique package instead of the caller workspace", () => {
    expect(
      resolveExtensionPackageRoot(fileURLToPath(new URL("../extensions/domain/runtime.ts", import.meta.url))),
    ).toBe(dirname(fileURLToPath(new URL("../package.json", import.meta.url))));
  });
});

describe("critique verdict derivation", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "pi-critique-runtime-"));
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(workspace, { recursive: true, force: true });
  });

  it("does not keep a pass verdict once an active finding is recorded", () => {
    const critiqueStore = createCritiqueStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T10:00:00.000Z"));
    const critique = critiqueStore.createCritique({
      title: "Workspace review",
      target: {
        kind: "workspace",
        ref: "pi-critique",
        path: "packages/pi-critique",
      },
    });

    vi.setSystemTime(new Date("2026-03-15T10:05:00.000Z"));
    const withRun = critiqueStore.recordRun(critique.state.critiqueId, {
      kind: "verification",
      verdict: "pass",
      summary: "Initial verification did not find issues.",
    });
    const firstRun = withRun.runs[0];
    expect(firstRun).toBeDefined();

    vi.setSystemTime(new Date("2026-03-15T10:10:00.000Z"));
    const withFinding = critiqueStore.addFinding(critique.state.critiqueId, {
      runId: firstRun?.id ?? "missing-run",
      kind: "bug",
      severity: "medium",
      title: "Late finding",
      summary: "A concrete issue was found after the initial pass verdict.",
      recommendedAction: "Keep the critique verdict non-pass until the finding is resolved.",
    });

    expect(withFinding.state.openFindingIds).toEqual(["finding-001"]);
    expect(withFinding.state.currentVerdict).toBe("concerns");
  });
});
