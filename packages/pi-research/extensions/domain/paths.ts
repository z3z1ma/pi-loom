import { join, resolve } from "node:path";
import type { ResearchArtifactKind } from "./models.js";
import { normalizeArtifactId, normalizeResearchId } from "./normalize.js";

export interface ResearchPaths {
  rootDir: string;
  loomDir: string;
  researchDir: string;
}

export function getResearchPaths(cwd: string): ResearchPaths {
  const rootDir = resolve(cwd);
  const loomDir = join(rootDir, ".loom");
  return {
    rootDir,
    loomDir,
    researchDir: join(loomDir, "research"),
  };
}

export function getResearchDir(cwd: string, researchId: string): string {
  return join(getResearchPaths(cwd).researchDir, normalizeResearchId(researchId));
}

export function getResearchMarkdownPath(cwd: string, researchId: string): string {
  return join(getResearchDir(cwd, researchId), "research.md");
}

export function getResearchStatePath(cwd: string, researchId: string): string {
  return join(getResearchDir(cwd, researchId), "state.json");
}

export function getResearchHypothesesPath(cwd: string, researchId: string): string {
  return join(getResearchDir(cwd, researchId), "hypotheses.jsonl");
}

export function getResearchArtifactsPath(cwd: string, researchId: string): string {
  return join(getResearchDir(cwd, researchId), "artifacts.json");
}

export function getResearchDashboardPath(cwd: string, researchId: string): string {
  return join(getResearchDir(cwd, researchId), "dashboard.json");
}

export function artifactDirectoryName(kind: ResearchArtifactKind): string {
  switch (kind) {
    case "note":
      return "notes";
    case "experiment":
      return "experiments";
    case "source":
      return "sources";
    case "dataset":
      return "datasets";
    case "log":
      return "logs";
    case "summary":
      return "summaries";
  }
}

export function getResearchArtifactDir(cwd: string, researchId: string, kind: ResearchArtifactKind): string {
  return join(getResearchDir(cwd, researchId), artifactDirectoryName(kind));
}

export function getResearchArtifactPath(
  cwd: string,
  researchId: string,
  kind: ResearchArtifactKind,
  artifactId: string,
): string {
  return join(getResearchArtifactDir(cwd, researchId, kind), `${normalizeArtifactId(artifactId)}.md`);
}
