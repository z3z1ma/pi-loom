import type {
  LoomCanonicalStorage,
  LoomEntityEventRecord,
  LoomEntityKind,
  LoomEntityRecord,
} from "./contract.js";
import { createEntityId, createEventId } from "./ids.js";

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
  return storage.getEntityByDisplayId(spaceId, kind, displayId);
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
