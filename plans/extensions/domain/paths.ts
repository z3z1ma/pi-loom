import { resolve } from "node:path";
import { normalizePlanId } from "./normalize.js";

export interface PlansPaths {
  rootDir: string;
  plansDir: string;
}

export function getPlansPaths(cwd: string): PlansPaths {
  return {
    rootDir: resolve(cwd),
    plansDir: "plan",
  };
}

export function getPlanDir(_cwd: string, planId: string): string {
  return `plan:${normalizePlanId(planId)}`;
}

export function getPlanStatePath(cwd: string, planId: string): string {
  return `${getPlanDir(cwd, planId)}:state`;
}

export function getPlanPacketPath(cwd: string, planId: string): string {
  return `${getPlanDir(cwd, planId)}:packet`;
}

export function getPlanMarkdownPath(cwd: string, planId: string): string {
  return `${getPlanDir(cwd, planId)}:document`;
}
