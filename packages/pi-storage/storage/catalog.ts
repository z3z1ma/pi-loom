import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { LoomCanonicalStorage } from "./contract.js";
import { isRepoRelativePath } from "./contract.js";

export async function materializeRepositoryProjections(
  cwd: string,
  storage: LoomCanonicalStorage,
  entityIds: readonly string[],
): Promise<string[]> {
  const writtenPaths: string[] = [];
  for (const entityId of entityIds) {
    const projections = await storage.listProjections(entityId);
    for (const projection of projections) {
      if (
        projection.materialization !== "repo_materialized" ||
        !projection.relativePath ||
        projection.content === null
      ) {
        continue;
      }
      if (!isRepoRelativePath(projection.relativePath)) {
        throw new Error(`Projection path must stay repo-relative: ${projection.relativePath}`);
      }
      const absolutePath = path.join(cwd, projection.relativePath);
      mkdirSync(path.dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, projection.content, "utf-8");
      writtenPaths.push(projection.relativePath);
    }
  }
  return writtenPaths.sort((left, right) => left.localeCompare(right));
}
