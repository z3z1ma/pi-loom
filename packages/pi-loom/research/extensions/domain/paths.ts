import { resolve } from "node:path";
import type { ResearchArtifactKind } from "./models.js";
import { normalizeArtifactId, normalizeResearchId } from "./normalize.js";

export interface ResearchPaths {
  rootDir: string;
  researchDir: string;
}

export function getResearchPaths(cwd: string): ResearchPaths {
  return {
    rootDir: resolve(cwd),
    researchDir: "research",
  };
}

export function getResearchDir(_cwd: string, researchId: string): string {
  return `research:${normalizeResearchId(researchId)}`;
}

export function getResearchMarkdownPath(cwd: string, researchId: string): string {
  return `${getResearchDir(cwd, researchId)}:document`;
}

export function getResearchStatePath(cwd: string, researchId: string): string {
  return `${getResearchDir(cwd, researchId)}:state`;
}

export function getResearchHypothesesPath(cwd: string, researchId: string): string {
  return `${getResearchDir(cwd, researchId)}:hypotheses`;
}

export function getResearchArtifactsPath(cwd: string, researchId: string): string {
  return `${getResearchDir(cwd, researchId)}:artifacts`;
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
  return `${getResearchDir(cwd, researchId)}:${artifactDirectoryName(kind)}`;
}

export function getResearchArtifactPath(
  cwd: string,
  researchId: string,
  kind: ResearchArtifactKind,
  artifactId: string,
): string {
  return `${getResearchArtifactDir(cwd, researchId, kind)}:${normalizeArtifactId(artifactId)}`;
}
