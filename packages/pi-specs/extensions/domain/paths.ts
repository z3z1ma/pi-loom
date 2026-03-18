import { join, resolve } from "node:path";
import type { SpecArtifactName } from "./models.js";
import { normalizeCapabilityId, normalizeChangeId } from "./normalize.js";

export interface SpecsPaths {
  rootDir: string;
  loomDir: string;
  specsDir: string;
  changesDir: string;
  capabilitiesDir: string;
  archiveDir: string;
}

export function getSpecsPaths(cwd: string): SpecsPaths {
  const rootDir = resolve(cwd);
  const loomDir = join(rootDir, ".loom");
  const specsDir = join(loomDir, "specs");
  return {
    rootDir,
    loomDir,
    specsDir,
    changesDir: join(specsDir, "changes"),
    capabilitiesDir: join(specsDir, "capabilities"),
    archiveDir: join(specsDir, "archive"),
  };
}

export function getChangeDir(cwd: string, changeId: string): string {
  return join(getSpecsPaths(cwd).changesDir, normalizeChangeId(changeId));
}

export function getChangeArtifactPath(cwd: string, changeId: string, artifact: SpecArtifactName): string {
  return join(getChangeDir(cwd, changeId), `${artifact}.md`);
}

export function getChangeStatePath(cwd: string, changeId: string): string {
  return join(getChangeDir(cwd, changeId), "state.json");
}

export function getDecisionLogPath(cwd: string, changeId: string): string {
  return join(getChangeDir(cwd, changeId), "decisions.jsonl");
}

export function getChangeSpecsDir(cwd: string, changeId: string): string {
  return join(getChangeDir(cwd, changeId), "specs");
}

export function getCapabilityDeltaPath(cwd: string, changeId: string, capabilityId: string): string {
  return join(getChangeSpecsDir(cwd, changeId), `${normalizeCapabilityId(capabilityId)}.md`);
}

export function getCanonicalCapabilityPath(cwd: string, capabilityId: string): string {
  return join(getSpecsPaths(cwd).capabilitiesDir, `${normalizeCapabilityId(capabilityId)}.md`);
}

export function getArchivedChangeDir(cwd: string, date: string, changeId: string): string {
  return join(getSpecsPaths(cwd).archiveDir, `${date}-${normalizeChangeId(changeId)}`);
}
