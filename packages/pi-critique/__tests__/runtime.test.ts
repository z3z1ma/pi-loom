import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getPiSpawnCommand, resolveExtensionPackageRoot, resolvePiCliScript } from "../extensions/domain/runtime.js";

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
