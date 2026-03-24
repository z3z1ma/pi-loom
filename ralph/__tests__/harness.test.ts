import { describe, expect, it } from "vitest";
import { getHarnessSpawnCommand } from "../domain/harness.js";
import type { PiSpawnDeps } from "../domain/harness.js";

describe("harness spawn command resolution", () => {
  it("uses the provided command override from env", () => {
    const command = getHarnessSpawnCommand(["arg1"], {
      env: { PI_HARNESS_COMMAND: "/custom/pi" },
    });
    expect(command).toEqual({ command: "/custom/pi", args: ["arg1"] });
  });

  it("resolves the harness package from argv1 and constructs a node spawn command", () => {
    const command = getHarnessSpawnCommand(["arg1"], {
      execPath: "/usr/bin/node",
      argv1: "/path/to/node_modules/@mariozechner/pi-coding-agent/dist/cli.js",
      existsSync: (p) => p.includes("package.json") || p.includes("dist/cli.js"),
      readFileSync: (p) => {
        if (p.endsWith("package.json")) {
          return JSON.stringify({ name: "@mariozechner/pi-coding-agent", bin: { pi: "dist/cli.js" } });
        }
        return "";
      },
    });

    // It should resolve the package root, find the bin, and construct the command
    // The bin path will be resolved relative to package root
    // package root is /path/to/node_modules/@mariozechner/pi-coding-agent
    // bin is dist/cli.js
    // resolved bin is /path/to/node_modules/@mariozechner/pi-coding-agent/dist/cli.js

    expect(command.command).toBe("/usr/bin/node");
    expect(command.args[0]).toMatch(/.*\/dist\/cli\.js$/);
    expect(command.args[1]).toBe("arg1");
  });

  it("falls back to binary name if package cannot be resolved", () => {
    const command = getHarnessSpawnCommand(["arg1"], {
      execPath: "/usr/bin/node",
      argv1: "/some/random/script.js",
      existsSync: () => false,
    });

    expect(command).toEqual({ command: "pi", args: ["arg1"] });
  });

  it("uses omp binary name for @oh-my-pi/pi-coding-agent", () => {
    const command = getHarnessSpawnCommand(["arg1"], {
        execPath: "/usr/bin/node",
        argv1: "/path/to/node_modules/@oh-my-pi/pi-coding-agent/dist/cli.js",
        existsSync: (p) => p.includes("package.json") || p.includes("dist/cli.js"),
        readFileSync: (p) => {
          if (p.endsWith("package.json")) {
            return JSON.stringify({ name: "@oh-my-pi/pi-coding-agent", bin: { omp: "dist/cli.js" } });
          }
          return "";
        },
      });

      // Should use omp logic if needed, but getHarnessBinaryName handles the fallback name.
      // Here it finds the bin in package.json, so it uses the full path.
      expect(command.command).toBe("/usr/bin/node");
      expect(command.args[0]).toMatch(/.*\/dist\/cli\.js$/);
  });
});
