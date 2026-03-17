import { join, resolve } from "node:path";
import { normalizePlanId } from "./normalize.js";

export interface PlansPaths {
  rootDir: string;
  loomDir: string;
  plansDir: string;
}

export function getPlansPaths(cwd: string): PlansPaths {
  const rootDir = resolve(cwd);
  const loomDir = join(rootDir, ".loom");
  const plansDir = join(loomDir, "plans");
  return {
    rootDir,
    loomDir,
    plansDir,
  };
}

export function getPlanDir(cwd: string, planId: string): string {
  return join(getPlansPaths(cwd).plansDir, normalizePlanId(planId));
}

export function getPlanStatePath(cwd: string, planId: string): string {
  return join(getPlanDir(cwd, planId), "state.json");
}

export function getPlanPacketPath(cwd: string, planId: string): string {
  return join(getPlanDir(cwd, planId), "packet.md");
}

export function getPlanMarkdownPath(cwd: string, planId: string): string {
  return join(getPlanDir(cwd, planId), "plan.md");
}
