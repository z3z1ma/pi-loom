import type { LoomRepositoryRecord } from "./contract.js";

export interface LoomRepositoryQualifier {
  id: string;
  slug: string;
  displayName: string;
}

export function resolveRepositoryQualifier(
  repositories: readonly LoomRepositoryRecord[],
  repositoryId: string | null | undefined,
): LoomRepositoryQualifier | null {
  if (!repositoryId) {
    return null;
  }
  const repository = repositories.find((entry) => entry.id === repositoryId);
  if (!repository) {
    return null;
  }
  return {
    id: repository.id,
    slug: repository.slug,
    displayName: repository.displayName,
  };
}
