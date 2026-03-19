import type { LoomCanonicalStorage, LoomEntityEventRecord, LoomEntityKind, LoomEntityRecord } from "./contract.js";
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

export interface EntityLifecycleEventOptions {
  actor: string;
  createdPayload?: Record<string, unknown>;
  updatedPayload?: Record<string, unknown>;
  skipUpdatedEvent?: boolean;
}

export interface UpsertEntityResult {
  entity: LoomEntityRecord;
  previous: LoomEntityRecord | null;
  events: LoomEntityEventRecord[];
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

export async function upsertEntityByDisplayIdWithLifecycleEvents(
  storage: LoomCanonicalStorage,
  input: UpsertEntityInput,
  options: EntityLifecycleEventOptions,
): Promise<UpsertEntityResult> {
  const previous = await findEntityByDisplayId(storage, input.spaceId, input.kind, input.displayId);
  const entity = await upsertEntityByDisplayId(storage, input);
  const events: LoomEntityEventRecord[] = [];
  const basePayload = {
    entityKind: input.kind,
    displayId: input.displayId,
    version: entity.version,
  } satisfies Record<string, unknown>;

  if (!previous) {
    events.push(
      await appendEntityEvent(
        storage,
        entity.id,
        "created",
        options.actor,
        { ...basePayload, status: entity.status, ...(options.createdPayload ?? {}) },
        input.createdAt,
      ),
    );
    return { entity, previous: null, events };
  }

  if (previous.status !== entity.status) {
    events.push(
      await appendEntityEvent(
        storage,
        entity.id,
        "status_changed",
        options.actor,
        {
          ...basePayload,
          previousStatus: previous.status,
          nextStatus: entity.status,
        },
        input.updatedAt,
      ),
    );
  }

  if (!options.skipUpdatedEvent) {
    events.push(
      await appendEntityEvent(
        storage,
        entity.id,
        "updated",
        options.actor,
        {
          ...basePayload,
          status: entity.status,
          previousVersion: previous.version,
          ...(options.updatedPayload ?? {}),
        },
        input.updatedAt,
      ),
    );
  }

  return { entity, previous, events };
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
  const nextSequence = (existing.at(-1)?.sequence ?? 0) + 1;
  const event: LoomEntityEventRecord = {
    id: createEventId(entityId, nextSequence),
    entityId,
    kind,
    sequence: nextSequence,
    createdAt,
    actor,
    payload,
  };
  await storage.appendEvent(event);
  return event;
}
