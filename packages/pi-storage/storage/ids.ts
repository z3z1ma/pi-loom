import { createHash, randomBytes } from "node:crypto";
import type { LoomEntityKind, LoomId } from "./contract.js";

function compactHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function createRandomLoomId(prefix: string): LoomId {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
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

export function createWorktreeId(repositoryId: LoomId, logicalKey: string, branch: string): LoomId {
  return createStableLoomId("worktree", [repositoryId, logicalKey, branch]);
}

export function createEntityId(
  kind: LoomEntityKind,
  spaceId: LoomId,
  displayId: string | null,
  fallbackKey: string,
): LoomId {
  void spaceId;
  void displayId;
  void fallbackKey;
  return createRandomLoomId(kind);
}

export function createLinkId(kind: string, fromEntityId: LoomId, toEntityId: LoomId): LoomId {
  return createStableLoomId("link", [kind, fromEntityId, toEntityId]);
}

export function createEventId(entityId: LoomId, sequence: number): LoomId {
  return createStableLoomId("event", [entityId, String(sequence)]);
}
