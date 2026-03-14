import { join, resolve } from "node:path";
import { normalizeCritiqueId } from "./normalize.js";

export interface CritiquePaths {
  rootDir: string;
  loomDir: string;
  critiquesDir: string;
}

export function getCritiquePaths(cwd: string): CritiquePaths {
  const rootDir = resolve(cwd);
  const loomDir = join(rootDir, ".loom");
  return {
    rootDir,
    loomDir,
    critiquesDir: join(loomDir, "critiques"),
  };
}

export function getCritiqueDir(cwd: string, critiqueId: string): string {
  return join(getCritiquePaths(cwd).critiquesDir, normalizeCritiqueId(critiqueId));
}

export function getCritiqueStatePath(cwd: string, critiqueId: string): string {
  return join(getCritiqueDir(cwd, critiqueId), "state.json");
}

export function getCritiquePacketPath(cwd: string, critiqueId: string): string {
  return join(getCritiqueDir(cwd, critiqueId), "packet.md");
}

export function getCritiqueMarkdownPath(cwd: string, critiqueId: string): string {
  return join(getCritiqueDir(cwd, critiqueId), "critique.md");
}

export function getCritiqueRunsPath(cwd: string, critiqueId: string): string {
  return join(getCritiqueDir(cwd, critiqueId), "runs.jsonl");
}

export function getCritiqueFindingsPath(cwd: string, critiqueId: string): string {
  return join(getCritiqueDir(cwd, critiqueId), "findings.jsonl");
}

export function getCritiqueDashboardPath(cwd: string, critiqueId: string): string {
  return join(getCritiqueDir(cwd, critiqueId), "dashboard.json");
}

export function getCritiqueLaunchPath(cwd: string, critiqueId: string): string {
  return join(getCritiqueDir(cwd, critiqueId), "launch.json");
}
