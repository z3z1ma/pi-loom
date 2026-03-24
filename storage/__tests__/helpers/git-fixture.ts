import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeWorkspaceStorage } from "../../workspace.js";

const TEST_GIT_RUNNER = [
  "import os",
  "import subprocess",
  "import sys",
  "",
  "cwd = sys.argv[1]",
  "git_args = sys.argv[2:]",
  "env = os.environ.copy()",
  'env["GIT_TERMINAL_PROMPT"] = "0"',
  'env["GIT_ASKPASS"] = "true"',
  "result = subprocess.run(",
  '    ["git", "-c", "core.hooksPath=/dev/null", *git_args],',
  "    cwd=cwd,",
  "    env=env,",
  "    text=True,",
  "    capture_output=True,",
  ")",
  "if result.stdout:",
  "    sys.stdout.write(result.stdout)",
  "if result.returncode != 0:",
  "    if result.stderr:",
  "        sys.stderr.write(result.stderr)",
  "    raise SystemExit(result.returncode)",
].join("\n");

export function runTestGit(cwd: string, ...args: string[]): string {
  return execFileSync(process.env.PYTHON ?? "python3", ["-c", TEST_GIT_RUNNER, cwd, ...args], {
    encoding: "utf-8",
  });
}

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

interface SeededParentGitWorkspaceRepository {
  name: string;
  remoteUrl: string;
  files?: Record<string, string>;
}

interface SeededParentGitWorkspaceOptions {
  prefix: string;
  repositories: SeededParentGitWorkspaceRepository[];
}

interface SeededParentGitWorkspace {
  cwd: string;
  repositories: string[];
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
  runTestGit(templateDir, "init");
  runTestGit(templateDir, "config", "user.name", "Pi Loom Tests");
  runTestGit(templateDir, "config", "user.email", "tests@example.com");
  if (options.remoteUrl) {
    runTestGit(templateDir, "remote", "add", "origin", options.remoteUrl);
  }

  const baseFiles: Record<string, string> = {
    "README.md": "seed\n",
    ...(options.packageName ? { "package.json": `${JSON.stringify({ name: options.packageName })}\n` } : {}),
    ...(options.files ?? {}),
  };

  for (const [relativePath, content] of Object.entries(baseFiles)) {
    writeFileSync(path.join(templateDir, relativePath), content, "utf-8");
  }

  runTestGit(templateDir, "add", ".");
  runTestGit(templateDir, "commit", "-m", "seed");
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

export function createSeededParentGitWorkspace(options: SeededParentGitWorkspaceOptions): SeededParentGitWorkspace {
  const cwd = mkdtempSync(path.join(tmpdir(), options.prefix));
  const repositories = options.repositories.map((repository) => {
    const repoRoot = path.join(cwd, repository.name);
    mkdirSync(repoRoot, { recursive: true });
    copyTemplate(
      ensureTemplate({
        prefix: `${options.prefix}${repository.name}-`,
        packageName: repository.name,
        remoteUrl: repository.remoteUrl,
        files: repository.files,
        piLoomRoot: false,
      }),
      repoRoot,
    );
    return repoRoot;
  });
  return {
    cwd,
    repositories,
    cleanup: () => {
      closeWorkspaceStorage(cwd);
      rmSync(cwd, { recursive: true, force: true });
    },
  };
}

export function commitWorkspaceFiles(cwd: string, message: string, ...relativePaths: string[]): void {
  runTestGit(cwd, "add", ...relativePaths);
  runTestGit(cwd, "commit", "-m", message);
}
