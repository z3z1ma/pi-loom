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

export class LoomEntityStaleWriteError extends Error {
  constructor(
    readonly kind: LoomEntityKind,
    readonly displayId: string,
    readonly attemptedVersion: number,
    readonly currentVersion: number,
  ) {
    super(
      `Stale ${kind} write for ${displayId}: attempted version ${attemptedVersion}, current version is ${currentVersion}`,
    );
    this.name = "LoomEntityStaleWriteError";
  }
}

export async function findEntityByDisplayId(
  storage: LoomCanonicalStorage,
  spaceId: string,
  kind: LoomEntityKind,
  displayId: string,
): Promise<LoomEntityRecord | null> {
  return storage.getEntityByDisplayId(spaceId, kind, displayId);
}

function assertFreshEntityWrite(previous: LoomEntityRecord | null, input: UpsertEntityInput): void {
  if (previous && input.version <= previous.version) {
    throw new LoomEntityStaleWriteError(input.kind, input.displayId, input.version, previous.version);
  }
}

function materializeEntity(previous: LoomEntityRecord | null, input: UpsertEntityInput): LoomEntityRecord {
  return {
    id: previous?.id ?? createEntityId(input.kind, input.spaceId, input.displayId, `${input.kind}:${input.displayId}`),
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
    createdAt: previous?.createdAt ?? input.createdAt,
    updatedAt: input.updatedAt,
  };
}

async function transactEntityUpsert<T>(
  storage: LoomCanonicalStorage,
  input: UpsertEntityInput,
  run: (tx: LoomCanonicalStorage, entity: LoomEntityRecord, previous: LoomEntityRecord | null) => Promise<T>,
): Promise<T> {
  return storage.transact(async (tx) => {
    const previous = await findEntityByDisplayId(tx, input.spaceId, input.kind, input.displayId);
    assertFreshEntityWrite(previous, input);
    const entity = materializeEntity(previous, input);
    await tx.upsertEntity(entity);
    return run(tx, entity, previous);
  });
}

export async function upsertEntityByDisplayId(
  storage: LoomCanonicalStorage,
  input: UpsertEntityInput,
): Promise<LoomEntityRecord> {
  return transactEntityUpsert(storage, input, async (_tx, entity) => entity);
}

export async function upsertEntityByDisplayIdWithLifecycleEvents(
  storage: LoomCanonicalStorage,
  input: UpsertEntityInput,
  options: EntityLifecycleEventOptions,
): Promise<UpsertEntityResult> {
  return transactEntityUpsert(storage, input, async (tx, entity, previous) => {
    const events: LoomEntityEventRecord[] = [];
    const basePayload = {
      entityKind: input.kind,
      displayId: input.displayId,
      version: entity.version,
    } satisfies Record<string, unknown>;

    if (!previous) {
      events.push(
        await appendEntityEventInTransaction(
          tx,
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
        await appendEntityEventInTransaction(
          tx,
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
        await appendEntityEventInTransaction(
          tx,
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
  });
}

async function appendEntityEventInTransaction(
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
    id: createEventId(),
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

export async function appendEntityEvent(
  storage: LoomCanonicalStorage,
  entityId: string,
  kind: LoomEntityEventRecord["kind"],
  actor: string,
  payload: Record<string, unknown>,
  createdAt: string,
): Promise<LoomEntityEventRecord> {
  return storage.transact(async (tx) => appendEntityEventInTransaction(tx, entityId, kind, actor, payload, createdAt));
}
