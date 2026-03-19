import type { LoomCanonicalStorage, LoomEntityKind, LoomEntityLinkRecord, LoomId, LoomLinkKind } from "./contract.js";
import { createLinkId } from "./ids.js";

const PROJECTION_OWNER_KEY = "projectionOwner" as const;

export interface ProjectedEntityLinkInput {
  kind: LoomLinkKind;
  targetKind: LoomEntityKind;
  targetDisplayId: string;
  required?: boolean;
  metadata?: Record<string, unknown>;
}

export interface AssertProjectedEntityLinksInput {
  storage: LoomCanonicalStorage;
  spaceId: LoomId;
  projectionOwner: string;
  desired: ProjectedEntityLinkInput[];
}

export interface SyncProjectedEntityLinksInput {
  storage: LoomCanonicalStorage;
  spaceId: LoomId;
  fromEntityId: LoomId;
  projectionOwner: string;
  desired: ProjectedEntityLinkInput[];
  timestamp: string;
}

export interface SyncProjectedEntityLinksResult {
  upserted: LoomEntityLinkRecord[];
  removedIds: LoomId[];
  skippedTargets: Array<{ kind: LoomEntityKind; displayId: string }>;
}

interface ResolvedProjectedLinkTarget {
  input: ProjectedEntityLinkInput;
  targetId: LoomId;
}

export function projectedLinkMetadata(
  projectionOwner: string,
  metadata: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...metadata,
    [PROJECTION_OWNER_KEY]: projectionOwner,
  };
}

function isManagedProjectedLink(link: LoomEntityLinkRecord, fromEntityId: LoomId, projectionOwner: string): boolean {
  return (
    link.fromEntityId === fromEntityId &&
    typeof link.metadata[PROJECTION_OWNER_KEY] === "string" &&
    link.metadata[PROJECTION_OWNER_KEY] === projectionOwner
  );
}

function missingTargetError(
  projectionOwner: string,
  missingTargets: Array<{ kind: LoomEntityKind; displayId: string }>,
): Error {
  const detail = missingTargets.map((target) => `${target.kind}:${target.displayId}`).join(", ");
  return new Error(`Missing projected link targets for ${projectionOwner}: ${detail}`);
}

async function resolveProjectedLinkTargets(
  storage: LoomCanonicalStorage,
  spaceId: LoomId,
  desired: ProjectedEntityLinkInput[],
): Promise<{
  resolvedTargets: ResolvedProjectedLinkTarget[];
  skippedTargets: Array<{ kind: LoomEntityKind; displayId: string }>;
  missingRequiredTargets: Array<{ kind: LoomEntityKind; displayId: string }>;
}> {
  const resolvedTargets: ResolvedProjectedLinkTarget[] = [];
  const skippedTargets: Array<{ kind: LoomEntityKind; displayId: string }> = [];
  const missingRequiredTargets: Array<{ kind: LoomEntityKind; displayId: string }> = [];

  for (const link of desired) {
    const targetDisplayId = link.targetDisplayId.trim();
    if (!targetDisplayId) {
      if (link.required !== false) {
        missingRequiredTargets.push({ kind: link.targetKind, displayId: "(empty)" });
      }
      continue;
    }
    const target = await storage.getEntityByDisplayId(spaceId, link.targetKind, targetDisplayId);
    if (!target) {
      const missingTarget = { kind: link.targetKind, displayId: targetDisplayId };
      if (link.required === false) {
        skippedTargets.push(missingTarget);
      } else {
        missingRequiredTargets.push(missingTarget);
      }
      continue;
    }

    resolvedTargets.push({ input: link, targetId: target.id });
  }

  return { resolvedTargets, skippedTargets, missingRequiredTargets };
}

export async function assertProjectedEntityLinksResolvable({
  storage,
  spaceId,
  projectionOwner,
  desired,
}: AssertProjectedEntityLinksInput): Promise<void> {
  const { missingRequiredTargets } = await resolveProjectedLinkTargets(storage, spaceId, desired);
  if (missingRequiredTargets.length > 0) {
    throw missingTargetError(projectionOwner, missingRequiredTargets);
  }
}

export async function syncProjectedEntityLinks({
  storage,
  spaceId,
  fromEntityId,
  projectionOwner,
  desired,
  timestamp,
}: SyncProjectedEntityLinksInput): Promise<SyncProjectedEntityLinksResult> {
  const existingManaged = (await storage.listLinks(fromEntityId)).filter((link) =>
    isManagedProjectedLink(link, fromEntityId, projectionOwner),
  );
  const existingManagedById = new Map(existingManaged.map((link) => [link.id, link]));
  const desiredById = new Map<string, LoomEntityLinkRecord>();
  const { resolvedTargets, skippedTargets, missingRequiredTargets } = await resolveProjectedLinkTargets(
    storage,
    spaceId,
    desired,
  );

  if (missingRequiredTargets.length > 0) {
    throw missingTargetError(projectionOwner, missingRequiredTargets);
  }

  for (const target of resolvedTargets) {
    const linkId = createLinkId(target.input.kind, fromEntityId, target.targetId);
    const existing = existingManagedById.get(linkId);
    desiredById.set(linkId, {
      id: linkId,
      kind: target.input.kind,
      fromEntityId,
      toEntityId: target.targetId,
      metadata: projectedLinkMetadata(projectionOwner, target.input.metadata),
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    });
  }

  const desiredRecords = [...desiredById.values()];
  const removedIds: LoomId[] = [];
  const removedRecords: LoomEntityLinkRecord[] = [];
  const upsertedIds: LoomId[] = [];

  try {
    for (const record of desiredRecords) {
      await storage.upsertLink(record);
      upsertedIds.push(record.id);
    }

    for (const existing of existingManaged) {
      if (!desiredById.has(existing.id)) {
        await storage.removeLink(existing.id);
        removedIds.push(existing.id);
        removedRecords.push(existing);
      }
    }
  } catch (error) {
    for (const removedRecord of removedRecords) {
      await storage.upsertLink(removedRecord);
    }
    for (const upsertedId of [...upsertedIds].reverse()) {
      const original = existingManagedById.get(upsertedId);
      if (original) {
        await storage.upsertLink(original);
      } else {
        await storage.removeLink(upsertedId);
      }
    }
    throw error;
  }

  return {
    upserted: desiredRecords,
    removedIds,
    skippedTargets,
  };
}
