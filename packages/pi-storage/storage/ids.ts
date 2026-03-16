import { createHash, randomUUID } from "node:crypto";
import type { LoomEntityKind, LoomId } from "./contract.js";

function compactHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function createRandomLoomId(prefix: string): LoomId {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

export function createStableLoomId(prefix: string, parts: readonly string[]): LoomId {
  return `${prefix}_${compactHash(parts.join("\u241f"))}`;
}

export function createSpaceId(slug: string): LoomId {
  return createStableLoomId("space", [slug]);
}

export function createRepositoryId(remoteUrls: readonly string[], fallbackKey: string): LoomId {
  const sortedUrls = [...remoteUrls]
    .map((value) => value.trim())
    .filter(Boolean)
    .sort();
  return createStableLoomId("repo", sortedUrls.length > 0 ? sortedUrls : [fallbackKey]);
}

export function createWorktreeId(repositoryId: LoomId, logicalPath: string, branch: string): LoomId {
  return createStableLoomId("worktree", [repositoryId, logicalPath, branch]);
}

export function createEntityId(
  kind: LoomEntityKind,
  spaceId: LoomId,
  displayId: string | null,
  fallbackKey: string,
): LoomId {
  if (displayId?.trim()) {
    return createStableLoomId(kind, [spaceId, displayId.trim()]);
  }
  return createStableLoomId(kind, [spaceId, fallbackKey]);
}

export function createLinkId(kind: string, fromEntityId: LoomId, toEntityId: LoomId): LoomId {
  return createStableLoomId("link", [kind, fromEntityId, toEntityId]);
}

export function createProjectionId(kind: string, entityId: LoomId, relativePath: string | null): LoomId {
  return createStableLoomId("projection", [kind, entityId, relativePath ?? "(db-only)"]);
}

export function createEventId(entityId: LoomId, sequence: number): LoomId {
  return createStableLoomId("event", [entityId, String(sequence)]);
}
