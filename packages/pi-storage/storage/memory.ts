import type {
  LoomCanonicalStorage,
  LoomCanonicalTransaction,
  LoomEntityEventRecord,
  LoomEntityLinkRecord,
  LoomEntityRecord,
  LoomProjectionRecord,
  LoomRepositoryRecord,
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
  private readonly projections = new Map<string, LoomProjectionRecord>();

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

  async listProjections(entityId: string): Promise<LoomProjectionRecord[]> {
    return [...this.projections.values()].filter((record) => record.entityId === entityId).map(clone);
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
    this.entities.set(record.id, clone(record));
  }

  async upsertLink(record: LoomEntityLinkRecord): Promise<void> {
    this.links.set(record.id, clone(record));
  }

  async appendEvent(record: LoomEntityEventRecord): Promise<void> {
    this.events.set(record.id, clone(record));
  }

  async upsertProjection(record: LoomProjectionRecord): Promise<void> {
    this.projections.set(record.id, clone(record));
  }

  async transact<T>(run: (tx: LoomCanonicalTransaction) => Promise<T>): Promise<T> {
    const snapshot = {
      spaces: clone([...this.spaces.entries()]),
      repositories: clone([...this.repositories.entries()]),
      worktrees: clone([...this.worktrees.entries()]),
      entities: clone([...this.entities.entries()]),
      links: clone([...this.links.entries()]),
      events: clone([...this.events.entries()]),
      projections: clone([...this.projections.entries()]),
    };

    const tx: LoomCanonicalTransaction = {
      ...this,
      commit: async () => undefined,
      rollback: async () => {
        this.spaces.clear();
        this.repositories.clear();
        this.worktrees.clear();
        this.entities.clear();
        this.links.clear();
        this.events.clear();
        this.projections.clear();
        for (const [id, record] of snapshot.spaces) this.spaces.set(id, record);
        for (const [id, record] of snapshot.repositories) this.repositories.set(id, record);
        for (const [id, record] of snapshot.worktrees) this.worktrees.set(id, record);
        for (const [id, record] of snapshot.entities) this.entities.set(id, record);
        for (const [id, record] of snapshot.links) this.links.set(id, record);
        for (const [id, record] of snapshot.events) this.events.set(id, record);
        for (const [id, record] of snapshot.projections) this.projections.set(id, record);
      },
    };

    return run(tx);
  }
}
