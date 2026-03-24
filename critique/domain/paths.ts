import { resolve } from "node:path";
import { normalizeCritiqueId } from "./normalize.js";

export interface CritiquePaths {
  rootDir: string;
  critiquesDir: string;
}

export function getCritiquePaths(cwd: string): CritiquePaths {
  return {
    rootDir: resolve(cwd),
    critiquesDir: "critique",
  };
}

export function getCritiqueDir(_cwd: string, critiqueId: string): string {
  return `critique:${normalizeCritiqueId(critiqueId)}`;
}

export function getCritiqueStatePath(cwd: string, critiqueId: string): string {
  return `${getCritiqueDir(cwd, critiqueId)}:state`;
}

export function getCritiquePacketPath(cwd: string, critiqueId: string): string {
  return `${getCritiqueDir(cwd, critiqueId)}:packet`;
}

export function getCritiqueMarkdownPath(cwd: string, critiqueId: string): string {
  return `${getCritiqueDir(cwd, critiqueId)}:document`;
}

export function getCritiqueRunsPath(cwd: string, critiqueId: string): string {
  return `${getCritiqueDir(cwd, critiqueId)}:runs`;
}

export function getCritiqueFindingsPath(cwd: string, critiqueId: string): string {
  return `${getCritiqueDir(cwd, critiqueId)}:findings`;
}

export function getCritiqueLaunchPath(cwd: string, critiqueId: string): string {
  return `${getCritiqueDir(cwd, critiqueId)}:launch`;
}
