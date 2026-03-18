import { resolve } from "node:path";
import type { SpecArtifactName } from "./models.js";
import { normalizeCapabilityId, normalizeChangeId } from "./normalize.js";

export interface SpecsPaths {
  rootDir: string;
  specsDir: string;
  changesDir: string;
  capabilitiesDir: string;
  archiveDir: string;
}

export function getSpecsPaths(cwd: string): SpecsPaths {
  return {
    rootDir: resolve(cwd),
    specsDir: "spec-change",
    changesDir: "spec-change",
    capabilitiesDir: "spec-capability",
    archiveDir: "spec-archive",
  };
}

export function getChangeDir(_cwd: string, changeId: string): string {
  return `spec-change:${normalizeChangeId(changeId)}`;
}

export function getChangeArtifactPath(cwd: string, changeId: string, artifact: SpecArtifactName): string {
  return `${getChangeDir(cwd, changeId)}:${artifact}`;
}

export function getChangeStatePath(cwd: string, changeId: string): string {
  return `${getChangeDir(cwd, changeId)}:state`;
}

export function getDecisionLogPath(cwd: string, changeId: string): string {
  return `${getChangeDir(cwd, changeId)}:decisions`;
}

export function getChangeSpecsDir(cwd: string, changeId: string): string {
  return `${getChangeDir(cwd, changeId)}:capabilities`;
}

export function getCapabilityDeltaPath(cwd: string, changeId: string, capabilityId: string): string {
  return `${getChangeSpecsDir(cwd, changeId)}:${normalizeCapabilityId(capabilityId)}`;
}

export function getCanonicalCapabilityPath(_cwd: string, capabilityId: string): string {
  return `spec-capability:${normalizeCapabilityId(capabilityId)}`;
}

export function getArchivedChangeDir(_cwd: string, date: string, changeId: string): string {
  return `spec-archive:${date}-${normalizeChangeId(changeId)}`;
}
