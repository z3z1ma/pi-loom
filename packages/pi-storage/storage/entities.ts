import type {
  LoomCanonicalStorage,
  LoomEntityEventRecord,
  LoomEntityKind,
  LoomEntityRecord,
  LoomProjectionKind,
  LoomProjectionMaterialization,
  LoomProjectionRecord,
} from "./contract.js";
import { createEntityId, createEventId, createProjectionId } from "./ids.js";

export interface UpsertEntityInput {
  kind: LoomEntityKind;
  spaceId: string;
  owningRepositoryId: string | null;
  displayId: string;
  title: string;
  summary: string;
  status: string;
  version: number;
  tags?: string[];
  pathScopes?: LoomEntityRecord["pathScopes"];
  attributes: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export async function findEntityByDisplayId(
  storage: LoomCanonicalStorage,
  spaceId: string,
  kind: LoomEntityKind,
  displayId: string,
): Promise<LoomEntityRecord | null> {
  const entities = await storage.listEntities(spaceId, kind);
  return entities.find((entity) => entity.displayId === displayId) ?? null;
}

export async function upsertEntityByDisplayId(
  storage: LoomCanonicalStorage,
  input: UpsertEntityInput,
): Promise<LoomEntityRecord> {
  const existing = await findEntityByDisplayId(storage, input.spaceId, input.kind, input.displayId);
  const entity: LoomEntityRecord = {
    id: existing?.id ?? createEntityId(input.kind, input.spaceId, input.displayId, `${input.kind}:${input.displayId}`),
    kind: input.kind,
    spaceId: input.spaceId,
    owningRepositoryId: input.owningRepositoryId,
    displayId: input.displayId,
    title: input.title,
    summary: input.summary,
    status: input.status,
    version: input.version,
    tags: input.tags ?? [],
    pathScopes: input.pathScopes ?? [],
    attributes: input.attributes,
    createdAt: existing?.createdAt ?? input.createdAt,
    updatedAt: input.updatedAt,
  };
  await storage.upsertEntity(entity);
  return entity;
}

export async function appendEntityEvent(
  storage: LoomCanonicalStorage,
  entityId: string,
  kind: LoomEntityEventRecord["kind"],
  actor: string,
  payload: Record<string, unknown>,
  createdAt: string,
): Promise<LoomEntityEventRecord> {
  const existing = await storage.listEvents(entityId);
  const event: LoomEntityEventRecord = {
    id: createEventId(entityId, existing.length + 1),
    entityId,
    kind,
    sequence: existing.length + 1,
    createdAt,
    actor,
    payload,
  };
  await storage.appendEvent(event);
  return event;
}

export async function upsertProjectionForEntity(
  storage: LoomCanonicalStorage,
  entityId: string,
  kind: LoomProjectionKind,
  materialization: LoomProjectionMaterialization,
  repositoryId: string | null,
  relativePath: string | null,
  content: string | null,
  version: number,
  createdAt: string,
  updatedAt: string,
): Promise<LoomProjectionRecord> {
  const projection: LoomProjectionRecord = {
    id: createProjectionId(kind, entityId, relativePath),
    entityId,
    kind,
    materialization,
    repositoryId,
    relativePath,
    contentHash: null,
    version,
    content,
    createdAt,
    updatedAt,
  };
  await storage.upsertProjection(projection);
  return projection;
}
