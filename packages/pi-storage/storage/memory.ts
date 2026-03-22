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

  async getSpace(id: string): Promise<LoomSpaceRecord | null> {
    return clone(this.spaces.get(id) ?? null);
  }

  async listRepositories(spaceId: string): Promise<LoomRepositoryRecord[]> {
    return [...this.repositories.values()].filter((record) => record.spaceId === spaceId).map(clone);
  }

  async listWorktrees(repositoryId: string): Promise<LoomWorktreeRecord[]> {
    return [...this.worktrees.values()].filter((record) => record.repositoryId === repositoryId).map(clone);
  }

  async getEntity(id: string): Promise<LoomEntityRecord | null> {
    return clone(this.entities.get(id) ?? null);
  }

  async getEntityByDisplayId(
    spaceId: string,
    kind: LoomEntityRecord["kind"],
    displayId: string,
  ): Promise<LoomEntityRecord | null> {
    for (const entity of this.entities.values()) {
      if (entity.spaceId === spaceId && entity.kind === kind && entity.displayId === displayId) {
        return clone(entity);
      }
    }
    return null;
  }

  async listEntities(spaceId?: string, kind?: LoomEntityRecord["kind"]): Promise<LoomEntityRecord[]> {
    return [...this.entities.values()]
      .filter((record) => (spaceId ? record.spaceId === spaceId : true))
      .filter((record) => (kind ? record.kind === kind : true))
      .map(clone);
  }

  async listLinks(entityId: string): Promise<LoomEntityLinkRecord[]> {
    return [...this.links.values()]
      .filter((record) => record.fromEntityId === entityId || record.toEntityId === entityId)
      .map(clone);
  }

  async listEvents(entityId: string): Promise<LoomEntityEventRecord[]> {
    return [...this.events.values()]
      .filter((record) => record.entityId === entityId)
      .sort((left, right) => left.sequence - right.sequence)
      .map(clone);
  }

  async listRuntimeAttachments(worktreeId?: string): Promise<LoomRuntimeAttachment[]> {
    return [...this.runtimeAttachments.values()]
      .filter((record) => (worktreeId ? record.worktreeId === worktreeId : true))
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(clone);
  }

  async upsertSpace(record: LoomSpaceRecord): Promise<void> {
    this.spaces.set(record.id, clone(record));
  }

  async upsertRepository(record: LoomRepositoryRecord): Promise<void> {
    this.repositories.set(record.id, clone(record));
  }

  async upsertWorktree(record: LoomWorktreeRecord): Promise<void> {
    this.worktrees.set(record.id, clone(record));
  }

  async upsertEntity(record: LoomEntityRecord): Promise<void> {
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
  }

  async removeEntity(id: string): Promise<void> {
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
  }

  async upsertLink(record: LoomEntityLinkRecord): Promise<void> {
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
  }

  async removeLink(id: string): Promise<void> {
    this.links.delete(id);
  }

  async appendEvent(record: LoomEntityEventRecord): Promise<void> {
    if (this.events.has(record.id)) {
      throw new Error(`Event already exists: ${record.id}`);
    }
    for (const existing of this.events.values()) {
      if (existing.entityId === record.entityId && existing.sequence === record.sequence) {
        throw new Error(`Event sequence already exists for ${record.entityId}: ${record.sequence}`);
      }
    }
    this.events.set(record.id, clone(record));
  }

  async removeEvent(id: string): Promise<void> {
    this.events.delete(id);
  }

  async upsertRuntimeAttachment(record: LoomRuntimeAttachment): Promise<void> {
    this.runtimeAttachments.set(record.id, clone(record));
  }

  async removeRuntimeAttachment(id: string): Promise<void> {
    this.runtimeAttachments.delete(id);
  }

  async transact<T>(run: (tx: LoomCanonicalTransaction) => Promise<T>): Promise<T> {
    const snapshot = {
      spaces: clone([...this.spaces.entries()]),
      repositories: clone([...this.repositories.entries()]),
      worktrees: clone([...this.worktrees.entries()]),
      entities: clone([...this.entities.entries()]),
      links: clone([...this.links.entries()]),
      events: clone([...this.events.entries()]),
      runtimeAttachments: clone([...this.runtimeAttachments.entries()]),
    };

    const tx: LoomCanonicalTransaction = {
      contractVersion: this.contractVersion,
      backendKind: this.backendKind,
      getSpace: this.getSpace.bind(this),
      listRepositories: this.listRepositories.bind(this),
      listWorktrees: this.listWorktrees.bind(this),
      getEntity: this.getEntity.bind(this),
      getEntityByDisplayId: this.getEntityByDisplayId.bind(this),
      listEntities: this.listEntities.bind(this),
      listLinks: this.listLinks.bind(this),
      listEvents: this.listEvents.bind(this),
      listRuntimeAttachments: this.listRuntimeAttachments.bind(this),
      upsertSpace: this.upsertSpace.bind(this),
      upsertRepository: this.upsertRepository.bind(this),
      upsertWorktree: this.upsertWorktree.bind(this),
      upsertEntity: this.upsertEntity.bind(this),
      removeEntity: this.removeEntity.bind(this),
      upsertLink: this.upsertLink.bind(this),
      removeLink: this.removeLink.bind(this),
      appendEvent: this.appendEvent.bind(this),
      removeEvent: this.removeEvent.bind(this),
      upsertRuntimeAttachment: this.upsertRuntimeAttachment.bind(this),
      removeRuntimeAttachment: this.removeRuntimeAttachment.bind(this),
      transact: this.transact.bind(this),
      commit: async () => undefined,
      rollback: async () => {
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
      },
    };

    return run(tx);
  }
}
