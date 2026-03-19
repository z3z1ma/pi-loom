import type { LoomCanonicalStorage, LoomEntityKind, LoomEntityRecord, LoomId } from "./contract.js";
import { findEntityByDisplayId, upsertEntityByDisplayIdWithLifecycleEvents } from "./entities.js";
import { type ProjectedEntityLinkInput, syncProjectedEntityLinks } from "./links.js";

const PROJECTION_OWNER_KEY = "projectionOwner" as const;

export interface ProjectedArtifactOwner {
  entityId: LoomId;
  kind: LoomEntityKind;
  displayId: string;
}

export interface ProjectedArtifactEntityAttributes<TPayload extends Record<string, unknown> = Record<string, unknown>>
  extends Record<string, unknown> {
  projectionOwner: string;
  artifactType: string;
  owner: ProjectedArtifactOwner;
  payload: TPayload;
}

export interface ProjectedArtifactInput<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  artifactType: string;
  displayId: string;
  title: string;
  summary: string;
  status?: string;
  tags?: string[];
  payload: TPayload;
  links?: ProjectedEntityLinkInput[];
}

export interface SyncProjectedArtifactsInput<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  storage: LoomCanonicalStorage;
  spaceId: LoomId;
  owningRepositoryId: LoomId | null;
  owner: ProjectedArtifactOwner;
  projectionOwner: string;
  desired: ProjectedArtifactInput<TPayload>[];
  timestamp: string;
  actor?: string | null;
}

export interface SyncProjectedArtifactsResult {
  upsertedDisplayIds: string[];
  removedDisplayIds: string[];
}

export function projectedArtifactAttributes<TPayload extends Record<string, unknown>>(
  projectionOwner: string,
  artifactType: string,
  owner: ProjectedArtifactOwner,
  payload: TPayload,
): ProjectedArtifactEntityAttributes<TPayload> {
  return {
    [PROJECTION_OWNER_KEY]: projectionOwner,
    artifactType,
    owner,
    payload,
  };
}

export function hasProjectedArtifactAttributes(
  value: unknown,
): value is ProjectedArtifactEntityAttributes<Record<string, unknown>> {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const owner = candidate.owner as Record<string, unknown> | undefined;
  return (
    typeof candidate[PROJECTION_OWNER_KEY] === "string" &&
    typeof candidate.artifactType === "string" &&
    Boolean(owner) &&
    typeof owner?.entityId === "string" &&
    typeof owner?.kind === "string" &&
    typeof owner?.displayId === "string" &&
    typeof candidate.payload === "object" &&
    candidate.payload !== null
  );
}

function isManagedProjectedArtifact(
  entity: LoomEntityRecord,
  owner: ProjectedArtifactOwner,
  projectionOwner: string,
): entity is LoomEntityRecord & { attributes: ProjectedArtifactEntityAttributes<Record<string, unknown>> } {
  return (
    entity.kind === "artifact" &&
    entity.displayId !== null &&
    hasProjectedArtifactAttributes(entity.attributes) &&
    entity.attributes.projectionOwner === projectionOwner &&
    entity.attributes.owner.entityId === owner.entityId
  );
}

function artifactTags(input: ProjectedArtifactInput, owner: ProjectedArtifactOwner): string[] {
  return [input.artifactType, owner.displayId, ...(input.tags ?? [])]
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);
}

function artifactLinks(input: ProjectedArtifactInput, owner: ProjectedArtifactOwner): ProjectedEntityLinkInput[] {
  return [
    {
      kind: "belongs_to",
      targetKind: owner.kind,
      targetDisplayId: owner.displayId,
    },
    ...(input.links ?? []),
  ];
}

export async function syncProjectedArtifacts<TPayload extends Record<string, unknown>>({
  storage,
  spaceId,
  owningRepositoryId,
  owner,
  projectionOwner,
  desired,
  timestamp,
  actor,
}: SyncProjectedArtifactsInput<TPayload>): Promise<SyncProjectedArtifactsResult> {
  const existingManaged = (await storage.listEntities(spaceId, "artifact")).filter((entity) =>
    isManagedProjectedArtifact(entity, owner, projectionOwner),
  );
  const existingByDisplayId = new Map(existingManaged.map((entity) => [entity.displayId ?? entity.id, entity]));
  const desiredDisplayIds = new Set<string>();
  const upsertedDisplayIds: string[] = [];
  const removedDisplayIds: string[] = [];
  const eventActor = actor ?? projectionOwner;

  for (const artifact of desired) {
    const displayId = artifact.displayId.trim();
    if (!displayId) {
      throw new Error(`Projected artifact display id cannot be blank for ${projectionOwner}`);
    }
    desiredDisplayIds.add(displayId);
    const existing =
      existingByDisplayId.get(displayId) ?? (await findEntityByDisplayId(storage, spaceId, "artifact", displayId));
    let entityId: string | null = null;
    let emittedLifecycleEvents: LoomId[] = [];
    try {
      const { entity, events } = await upsertEntityByDisplayIdWithLifecycleEvents(
        storage,
        {
          kind: "artifact",
          spaceId,
          owningRepositoryId,
          displayId,
          title: artifact.title,
          summary: artifact.summary,
          status: artifact.status ?? "active",
          version: (existing?.version ?? 0) + 1,
          tags: artifactTags(artifact, owner),
          attributes: projectedArtifactAttributes(projectionOwner, artifact.artifactType, owner, artifact.payload),
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp,
        },
        {
          actor: eventActor,
          createdPayload: {
            change: "artifact_projected",
            artifactType: artifact.artifactType,
            ownerDisplayId: owner.displayId,
          },
          updatedPayload: {
            change: "artifact_projected",
            artifactType: artifact.artifactType,
            ownerDisplayId: owner.displayId,
          },
        },
      );
      entityId = entity.id;
      emittedLifecycleEvents = events.map((event) => event.id);
      await syncProjectedEntityLinks({
        storage,
        spaceId,
        fromEntityId: entity.id,
        projectionOwner: `${projectionOwner}:links`,
        desired: artifactLinks(artifact, owner),
        timestamp,
        actor: eventActor,
      });
    } catch (error) {
      for (const eventId of [...emittedLifecycleEvents].reverse()) {
        await storage.removeEvent(eventId);
      }
      if (existing) {
        await storage.upsertEntity(existing);
      } else if (entityId) {
        await storage.removeEntity(entityId);
      }
      throw error;
    }
    upsertedDisplayIds.push(displayId);
  }

  for (const entity of existingManaged) {
    const displayId = entity.displayId ?? entity.id;
    if (desiredDisplayIds.has(displayId)) {
      continue;
    }
    await storage.removeEntity(entity.id);
    removedDisplayIds.push(displayId);
  }

  return { upsertedDisplayIds, removedDisplayIds };
}
