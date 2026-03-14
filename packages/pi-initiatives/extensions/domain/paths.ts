import { join, resolve } from "node:path";
import { normalizeInitiativeId } from "./normalize.js";

export interface InitiativePaths {
  rootDir: string;
  loomDir: string;
  initiativesDir: string;
}

export function getInitiativesPaths(cwd: string): InitiativePaths {
  const rootDir = resolve(cwd);
  const loomDir = join(rootDir, ".loom");
  return {
    rootDir,
    loomDir,
    initiativesDir: join(loomDir, "initiatives"),
  };
}

export function getInitiativeDir(cwd: string, initiativeId: string): string {
  return join(getInitiativesPaths(cwd).initiativesDir, normalizeInitiativeId(initiativeId));
}

export function getInitiativeBriefPath(cwd: string, initiativeId: string): string {
  return join(getInitiativeDir(cwd, initiativeId), "initiative.md");
}

export function getInitiativeStatePath(cwd: string, initiativeId: string): string {
  return join(getInitiativeDir(cwd, initiativeId), "state.json");
}

export function getInitiativeDecisionsPath(cwd: string, initiativeId: string): string {
  return join(getInitiativeDir(cwd, initiativeId), "decisions.jsonl");
}

export function getInitiativeDashboardPath(cwd: string, initiativeId: string): string {
  return join(getInitiativeDir(cwd, initiativeId), "dashboard.json");
}
