import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeWorkspaceStorage } from "../../storage/workspace.js";

interface SeededGitWorkspaceOptions {
  prefix: string;
  packageName?: string;
  remoteUrl?: string | null;
  files?: Record<string, string>;
  piLoomRoot?: string | false;
}

interface SeededGitWorkspace {
  cwd: string;
  cleanup: () => void;
}

const templateCache = new Map<string, string>();

function templateKey(options: SeededGitWorkspaceOptions): string {
  return JSON.stringify({
    packageName: options.packageName ?? null,
    remoteUrl: options.remoteUrl ?? null,
    files: options.files ?? {},
  });
}

function ensureTemplate(options: SeededGitWorkspaceOptions): string {
  const key = templateKey(options);
  const existing = templateCache.get(key);
  if (existing) {
    return existing;
  }

  const templateDir = mkdtempSync(path.join(tmpdir(), "pi-loom-git-template-"));
  execFileSync("git", ["init"], { cwd: templateDir, encoding: "utf-8" });
  execFileSync("git", ["config", "user.name", "Pi Loom Tests"], { cwd: templateDir, encoding: "utf-8" });
  execFileSync("git", ["config", "user.email", "tests@example.com"], { cwd: templateDir, encoding: "utf-8" });
  if (options.remoteUrl) {
    execFileSync("git", ["remote", "add", "origin", options.remoteUrl], { cwd: templateDir, encoding: "utf-8" });
  }

  const baseFiles: Record<string, string> = {
    "README.md": "seed\n",
    ...(options.packageName ? { "package.json": `${JSON.stringify({ name: options.packageName })}\n` } : {}),
    ...(options.files ?? {}),
  };

  for (const [relativePath, content] of Object.entries(baseFiles)) {
    writeFileSync(path.join(templateDir, relativePath), content, "utf-8");
  }

  execFileSync("git", ["add", "."], { cwd: templateDir, encoding: "utf-8" });
  execFileSync("git", ["commit", "-m", "seed"], { cwd: templateDir, encoding: "utf-8" });
  templateCache.set(key, templateDir);
  return templateDir;
}

function copyTemplate(templateDir: string, cwd: string): void {
  for (const entry of readdirSync(templateDir)) {
    cpSync(path.join(templateDir, entry), path.join(cwd, entry), { recursive: true });
  }
}

export function createSeededGitWorkspace(options: SeededGitWorkspaceOptions): SeededGitWorkspace {
  const cwd = mkdtempSync(path.join(tmpdir(), options.prefix));
  copyTemplate(ensureTemplate(options), cwd);
  const piLoomRoot = options.piLoomRoot === false ? null : (options.piLoomRoot ?? path.join(cwd, ".pi-loom-test"));
  if (piLoomRoot) {
    process.env.PI_LOOM_ROOT = piLoomRoot;
  }
  return {
    cwd,
    cleanup: () => {
      closeWorkspaceStorage(cwd);
      if (piLoomRoot) {
        delete process.env.PI_LOOM_ROOT;
      }
      rmSync(cwd, { recursive: true, force: true });
    },
  };
}

export function commitWorkspaceFiles(cwd: string, message: string, ...relativePaths: string[]): void {
  execFileSync("git", ["add", ...relativePaths], { cwd, encoding: "utf-8" });
  execFileSync("git", ["commit", "-m", message], { cwd, encoding: "utf-8" });
}
