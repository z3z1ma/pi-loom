import * as path from "node:path";
import { normalizeRoadmapItemId } from "./normalize.js";

export interface ConstitutionalPaths {
  rootDir: string;
  loomDir: string;
  constitutionDir: string;
  roadmapDir: string;
}

export function getConstitutionalPaths(cwd: string): ConstitutionalPaths {
  const rootDir = path.resolve(cwd);
  const loomDir = path.join(rootDir, ".loom");
  const constitutionDir = path.join(loomDir, "constitution");
  return {
    rootDir,
    loomDir,
    constitutionDir,
    roadmapDir: path.join(constitutionDir, "roadmap"),
  };
}

export function getConstitutionalStatePath(cwd: string): string {
  return path.join(getConstitutionalPaths(cwd).constitutionDir, "state.json");
}

export function getConstitutionalBriefPath(cwd: string): string {
  return path.join(getConstitutionalPaths(cwd).constitutionDir, "brief.md");
}

export function getConstitutionalVisionPath(cwd: string): string {
  return path.join(getConstitutionalPaths(cwd).constitutionDir, "vision.md");
}

export function getConstitutionalPrinciplesPath(cwd: string): string {
  return path.join(getConstitutionalPaths(cwd).constitutionDir, "principles.md");
}

export function getConstitutionalConstraintsPath(cwd: string): string {
  return path.join(getConstitutionalPaths(cwd).constitutionDir, "constraints.md");
}

export function getConstitutionalRoadmapPath(cwd: string): string {
  return path.join(getConstitutionalPaths(cwd).constitutionDir, "roadmap.md");
}

export function getConstitutionalDecisionsPath(cwd: string): string {
  return path.join(getConstitutionalPaths(cwd).constitutionDir, "decisions.jsonl");
}

export function getConstitutionalRoadmapItemPath(cwd: string, itemId: string): string {
  return path.join(getConstitutionalPaths(cwd).roadmapDir, `${normalizeRoadmapItemId(itemId)}.md`);
}
