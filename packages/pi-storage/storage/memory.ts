import { AsyncLocalStorage } from "node:async_hooks";
import type {
  LoomCanonicalStorage,
  LoomCanonicalTransaction,
  LoomEntityEventRecord,
  LoomEntityLinkRecord,
  LoomEntityRecord,
  LoomRepositoryRecord,
  LoomRuntimeAttachment,
  LoomSpaceRecord,
  LoomWorktreeRecord,
} from "./contract.js";
import { LOOM_STORAGE_CONTRACT_VERSION } from "./contract.js";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

interface MemoryExecutionContext {
  transactionDepth: number;
}

interface MemoryCatalogSnapshot {
  spaces: Array<[string, LoomSpaceRecord]>;
  repositories: Array<[string, LoomRepositoryRecord]>;
  worktrees: Array<[string, LoomWorktreeRecord]>;
  entities: Array<[string, LoomEntityRecord]>;
  links: Array<[string, LoomEntityLinkRecord]>;
  events: Array<[string, LoomEntityEventRecord]>;
  runtimeAttachments: Array<[string, LoomRuntimeAttachment]>;
}

class MemoryExecutionGate {
  private locked = false;
  private readonly waiters: Array<() => void> = [];
  private readonly context = new AsyncLocalStorage<MemoryExecutionContext>();

  async runExclusive<T>(run: () => T | Promise<T>): Promise<T> {
    const current = this.context.getStore();
    if (current) {
      return await run();
    }

    if (this.locked) {
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
      });
    }
    this.locked = true;

    try {
      return await this.context.run({ transactionDepth: 0 }, async () => await run());
    } finally {
      const next = this.waiters.shift();
      if (next) {
        next();
      } else {
        this.locked = false;
      }
    }
  }

  currentTransactionDepth(): number {
    return this.context.getStore()?.transactionDepth ?? 0;
  }

  async runNestedTransaction<T>(run: () => Promise<T>): Promise<T> {
    const current = this.context.getStore();
    if (!current) {
      return run();
    }
    return this.context.run({ transactionDepth: current.transactionDepth + 1 }, run);
  }
}

class InMemoryLoomCatalogTx implements LoomCanonicalTransaction {
  readonly contractVersion = LOOM_STORAGE_CONTRACT_VERSION;
  readonly backendKind = "memory" as const;

  constructor(
    private readonly catalog: InMemoryLoomCatalog,
    private active = true,
    private readonly snapshot?: MemoryCatalogSnapshot,
  ) {}

  async commit(): Promise<void> {
    this.active = false;
  }

  async rollback(): Promise<void> {
    if (!this.active || !this.snapshot) {
      return;
    }
    this.catalog.restore(this.snapshot);
    this.active = false;
  }

  async getSpace(id: string): Promise<LoomSpaceRecord | null> {
    return this.catalog.getSpace(id);
  }

  async listRepositories(spaceId: string): Promise<LoomRepositoryRecord[]> {
    return this.catalog.listRepositories(spaceId);
  }

  async listWorktrees(repositoryId: string): Promise<LoomWorktreeRecord[]> {
    return this.catalog.listWorktrees(repositoryId);
  }

  async getEntity(id: string): Promise<LoomEntityRecord | null> {
    return this.catalog.getEntity(id);
  }

  async getEntityByDisplayId(
    spaceId: string,
    kind: LoomEntityRecord["kind"],
    displayId: string,
  ): Promise<LoomEntityRecord | null> {
    return this.catalog.getEntityByDisplayId(spaceId, kind, displayId);
  }

  async listEntities(spaceId?: string, kind?: LoomEntityRecord["kind"]): Promise<LoomEntityRecord[]> {
    return this.catalog.listEntities(spaceId, kind);
  }

  async listLinks(entityId: string): Promise<LoomEntityLinkRecord[]> {
    return this.catalog.listLinks(entityId);
  }

  async listEvents(entityId: string): Promise<LoomEntityEventRecord[]> {
    return this.catalog.listEvents(entityId);
  }

  async listRuntimeAttachments(worktreeId?: string): Promise<LoomRuntimeAttachment[]> {
    return this.catalog.listRuntimeAttachments(worktreeId);
  }

  async upsertSpace(record: LoomSpaceRecord): Promise<void> {
    return this.catalog.upsertSpace(record);
  }

  async upsertRepository(record: LoomRepositoryRecord): Promise<void> {
    return this.catalog.upsertRepository(record);
  }

  async upsertWorktree(record: LoomWorktreeRecord): Promise<void> {
    return this.catalog.upsertWorktree(record);
  }

  async upsertEntity(record: LoomEntityRecord): Promise<void> {
    return this.catalog.upsertEntity(record);
  }

  async removeEntity(id: string): Promise<void> {
    return this.catalog.removeEntity(id);
  }

  async upsertLink(record: LoomEntityLinkRecord): Promise<void> {
    return this.catalog.upsertLink(record);
  }

  async removeLink(id: string): Promise<void> {
    return this.catalog.removeLink(id);
  }

  async appendEvent(record: LoomEntityEventRecord): Promise<void> {
    return this.catalog.appendEvent(record);
  }

  async removeEvent(id: string): Promise<void> {
    return this.catalog.removeEvent(id);
  }

  async upsertRuntimeAttachment(record: LoomRuntimeAttachment): Promise<void> {
    return this.catalog.upsertRuntimeAttachment(record);
  }

  async removeRuntimeAttachment(id: string): Promise<void> {
    return this.catalog.removeRuntimeAttachment(id);
  }

  async transact<T>(run: (tx: LoomCanonicalTransaction) => Promise<T>): Promise<T> {
    return this.catalog.transactNested(run);
  }
}

export class InMemoryLoomCatalog implements LoomCanonicalStorage {
  readonly contractVersion = LOOM_STORAGE_CONTRACT_VERSION;
  readonly backendKind = "memory" as const;

  private readonly spaces = new Map<string, LoomSpaceRecord>();
  private readonly repositories = new Map<string, LoomRepositoryRecord>();
  private readonly worktrees = new Map<string, LoomWorktreeRecord>();
  private readonly entities = new Map<string, LoomEntityRecord>();
  private readonly links = new Map<string, LoomEntityLinkRecord>();
  private readonly events = new Map<string, LoomEntityEventRecord>();
  private readonly runtimeAttachments = new Map<string, LoomRuntimeAttachment>();
  private readonly gate = new MemoryExecutionGate();

  private async serialize<T>(run: () => T | Promise<T>): Promise<T> {
    return this.gate.runExclusive(async () => await run());
  }

  snapshot(): MemoryCatalogSnapshot {
    return {
      spaces: clone([...this.spaces.entries()]),
      repositories: clone([...this.repositories.entries()]),
      worktrees: clone([...this.worktrees.entries()]),
      entities: clone([...this.entities.entries()]),
      links: clone([...this.links.entries()]),
      events: clone([...this.events.entries()]),
      runtimeAttachments: clone([...this.runtimeAttachments.entries()]),
    };
  }

  restore(snapshot: MemoryCatalogSnapshot): void {
    this.spaces.clear();
    this.repositories.clear();
    this.worktrees.clear();
    this.entities.clear();
    this.links.clear();
    this.events.clear();
    this.runtimeAttachments.clear();
    for (const [id, record] of snapshot.spaces) this.spaces.set(id, record);
    for (const [id, record] of snapshot.repositories) this.repositories.set(id, record);
    for (const [id, record] of snapshot.worktrees) this.worktrees.set(id, record);
    for (const [id, record] of snapshot.entities) this.entities.set(id, record);
    for (const [id, record] of snapshot.links) this.links.set(id, record);
    for (const [id, record] of snapshot.events) this.events.set(id, record);
    for (const [id, record] of snapshot.runtimeAttachments) this.runtimeAttachments.set(id, record);
  }

  async getSpace(id: string): Promise<LoomSpaceRecord | null> {
    return this.serialize(() => clone(this.spaces.get(id) ?? null));
  }

  async listRepositories(spaceId: string): Promise<LoomRepositoryRecord[]> {
    return this.serialize(() =>
      [...this.repositories.values()].filter((record) => record.spaceId === spaceId).map(clone),
    );
  }

  async listWorktrees(repositoryId: string): Promise<LoomWorktreeRecord[]> {
    return this.serialize(() =>
      [...this.worktrees.values()].filter((record) => record.repositoryId === repositoryId).map(clone),
    );
  }

  async getEntity(id: string): Promise<LoomEntityRecord | null> {
    return this.serialize(() => clone(this.entities.get(id) ?? null));
  }

  async getEntityByDisplayId(
    spaceId: string,
    kind: LoomEntityRecord["kind"],
    displayId: string,
  ): Promise<LoomEntityRecord | null> {
    return this.serialize(() => {
      for (const entity of this.entities.values()) {
        if (entity.spaceId === spaceId && entity.kind === kind && entity.displayId === displayId) {
          return clone(entity);
        }
      }
      return null;
    });
  }

  async listEntities(spaceId?: string, kind?: LoomEntityRecord["kind"]): Promise<LoomEntityRecord[]> {
    return this.serialize(() =>
      [...this.entities.values()]
        .filter((record) => (spaceId ? record.spaceId === spaceId : true))
        .filter((record) => (kind ? record.kind === kind : true))
        .map(clone),
    );
  }

  async listLinks(entityId: string): Promise<LoomEntityLinkRecord[]> {
    return this.serialize(() =>
      [...this.links.values()]
        .filter((record) => record.fromEntityId === entityId || record.toEntityId === entityId)
        .map(clone),
    );
  }

  async listEvents(entityId: string): Promise<LoomEntityEventRecord[]> {
    return this.serialize(() =>
      [...this.events.values()]
        .filter((record) => record.entityId === entityId)
        .sort((left, right) => left.sequence - right.sequence)
        .map(clone),
    );
  }

  async listRuntimeAttachments(worktreeId?: string): Promise<LoomRuntimeAttachment[]> {
    return this.serialize(() =>
      [...this.runtimeAttachments.values()]
        .filter((record) => (worktreeId ? record.worktreeId === worktreeId : true))
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(clone),
    );
  }

  async upsertSpace(record: LoomSpaceRecord): Promise<void> {
    return this.serialize(() => {
      this.spaces.set(record.id, clone(record));
    });
  }

  async upsertRepository(record: LoomRepositoryRecord): Promise<void> {
    return this.serialize(() => {
      this.repositories.set(record.id, clone(record));
    });
  }

  async upsertWorktree(record: LoomWorktreeRecord): Promise<void> {
    return this.serialize(() => {
      this.worktrees.set(record.id, clone(record));
    });
  }

  async upsertEntity(record: LoomEntityRecord): Promise<void> {
    return this.serialize(() => {
      for (const existing of this.entities.values()) {
        if (
          existing.id !== record.id &&
          existing.spaceId === record.spaceId &&
          existing.kind === record.kind &&
          existing.displayId !== null &&
          existing.displayId === record.displayId
        ) {
          throw new Error(`Duplicate display id for ${record.kind} in ${record.spaceId}: ${record.displayId}`);
        }
      }
      this.entities.set(record.id, clone(record));
    });
  }

  async removeEntity(id: string): Promise<void> {
    return this.serialize(() => {
      this.entities.delete(id);
      for (const [linkId, link] of [...this.links.entries()]) {
        if (link.fromEntityId === id || link.toEntityId === id) {
          this.links.delete(linkId);
        }
      }
      for (const [eventId, event] of [...this.events.entries()]) {
        if (event.entityId === id) {
          this.events.delete(eventId);
        }
      }
    });
  }

  async upsertLink(record: LoomEntityLinkRecord): Promise<void> {
    return this.serialize(() => {
      for (const existing of this.links.values()) {
        if (
          existing.id !== record.id &&
          existing.kind === record.kind &&
          existing.fromEntityId === record.fromEntityId &&
          existing.toEntityId === record.toEntityId
        ) {
          throw new Error(`Duplicate link edge for ${record.kind}:${record.fromEntityId}->${record.toEntityId}`);
        }
      }
      this.links.set(record.id, clone(record));
    });
  }

  async removeLink(id: string): Promise<void> {
    return this.serialize(() => {
      this.links.delete(id);
    });
  }

  async appendEvent(record: LoomEntityEventRecord): Promise<void> {
    return this.serialize(() => {
      if (this.events.has(record.id)) {
        throw new Error(`Event already exists: ${record.id}`);
      }
      for (const existing of this.events.values()) {
        if (existing.entityId === record.entityId && existing.sequence === record.sequence) {
          throw new Error(`Event sequence already exists for ${record.entityId}: ${record.sequence}`);
        }
      }
      this.events.set(record.id, clone(record));
    });
  }

  async removeEvent(id: string): Promise<void> {
    return this.serialize(() => {
      this.events.delete(id);
    });
  }

  async upsertRuntimeAttachment(record: LoomRuntimeAttachment): Promise<void> {
    return this.serialize(() => {
      this.runtimeAttachments.set(record.id, clone(record));
    });
  }

  async removeRuntimeAttachment(id: string): Promise<void> {
    return this.serialize(() => {
      this.runtimeAttachments.delete(id);
    });
  }

  private async runTransaction<T>(run: (tx: LoomCanonicalTransaction) => Promise<T>, nested: boolean): Promise<T> {
    return this.serialize(async () => {
      const snapshot = this.snapshot();
      const tx = new InMemoryLoomCatalogTx(this, true, snapshot);
      try {
        const result = nested ? await this.gate.runNestedTransaction(() => run(tx)) : await run(tx);
        await tx.commit();
        return result;
      } catch (error) {
        await tx.rollback();
        throw error;
      }
    });
  }

  async transact<T>(run: (tx: LoomCanonicalTransaction) => Promise<T>): Promise<T> {
    return this.runTransaction(run, false);
  }

  async transactNested<T>(run: (tx: LoomCanonicalTransaction) => Promise<T>): Promise<T> {
    return this.runTransaction(run, true);
  }
}
