import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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

  it("roots extension launches at the unified pi-loom package instead of the caller workspace", () => {
    expect(
      resolveExtensionPackageRoot(fileURLToPath(new URL("../extensions/domain/runtime.ts", import.meta.url))),
    ).toBe(resolve("packages/pi-loom"));
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

  it("does not keep a pass verdict once an active finding is recorded", async () => {
    const critiqueStore = createCritiqueStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T10:00:00.000Z"));
    const critique = await critiqueStore.createCritiqueAsync({
      title: "Workspace review",
      target: {
        kind: "workspace",
        ref: "pi-critique",
        locator: "packages/pi-loom/critique",
      },
    });

    vi.setSystemTime(new Date("2026-03-15T10:05:00.000Z"));
    const withRun = await critiqueStore.recordRunAsync(critique.state.critiqueId, {
      kind: "verification",
      verdict: "pass",
      summary: "Initial verification did not find issues.",
    });
    const firstRun = withRun.runs[0];
    expect(firstRun).toBeDefined();

    vi.setSystemTime(new Date("2026-03-15T10:10:00.000Z"));
    const withFinding = await critiqueStore.addFindingAsync(critique.state.critiqueId, {
      runId: firstRun?.id ?? "missing-run",
      kind: "bug",
      severity: "medium",
      title: "Late finding",
      summary: "A concrete issue was found after the initial pass verdict.",
      recommendedAction: "Keep the critique verdict non-pass until the finding is resolved.",
    });

    expect(withFinding.state.openFindingIds).toEqual(["finding-001"]);
    expect(withFinding.state.currentVerdict).toBe("concerns");
  }, 60000);
});
