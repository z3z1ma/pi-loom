import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export interface LoomCatalogPaths {
  rootDir: string;
  catalogPath: string;
  artifactsDir: string;
  exportsDir: string;
}

export function getLoomCatalogPaths(): LoomCatalogPaths {
  const rootDir = process.env.PI_LOOM_ROOT?.trim() || path.join(homedir(), ".pi", "loom");
  return {
    rootDir,
    catalogPath: path.join(rootDir, "catalog.sqlite"),
    artifactsDir: path.join(rootDir, "artifacts"),
    exportsDir: path.join(rootDir, "exports"),
  };
}

export function ensureLoomCatalogDirs(paths: LoomCatalogPaths = getLoomCatalogPaths()): LoomCatalogPaths {
  mkdirSync(paths.rootDir, { recursive: true });
  mkdirSync(paths.artifactsDir, { recursive: true });
  mkdirSync(paths.exportsDir, { recursive: true });
  return paths;
}
