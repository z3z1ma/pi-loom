import { createRequire } from "node:module";
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
import { ensureLoomCatalogDirs, getLoomCatalogPaths } from "./locations.js";

interface SqliteStatementLike {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): unknown;
}

interface SqliteDatabaseLike {
  prepare(sql: string): SqliteStatementLike;
  exec(sql: string): unknown;
  close(): void;
}

type SqliteDatabaseCtor = new (databasePath: string) => SqliteDatabaseLike;

const require = createRequire(import.meta.url);

async function resolveDatabaseCtor(): Promise<SqliteDatabaseCtor> {
  if (typeof (globalThis as { Bun?: unknown }).Bun !== "undefined") {
    const bunSqliteSpecifier = "bun:sqlite";
    const bunSqlite = (await import(bunSqliteSpecifier)) as { Database?: SqliteDatabaseCtor };
    if (!bunSqlite.Database) {
      throw new Error("Unable to load bun:sqlite Database constructor");
    }
    return bunSqlite.Database;
  }

  const betterSqlite = require("better-sqlite3") as SqliteDatabaseCtor | { default?: SqliteDatabaseCtor };
  const ctor =
    typeof betterSqlite === "function"
      ? (betterSqlite as SqliteDatabaseCtor)
      : ((betterSqlite as { default?: SqliteDatabaseCtor }).default ?? null);
  if (!ctor) {
    throw new Error("Unable to load better-sqlite3 Database constructor");
  }
  return ctor;
}

const LoadedSqliteDatabase = await resolveDatabaseCtor();

function encode(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function decode<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.length === 0) {
    return fallback;
  }
  return JSON.parse(value) as T;
}

type SqliteNamedParams = Record<string, unknown>;

export function toSqliteNamedParams(params: SqliteNamedParams): SqliteNamedParams {
  return Object.entries(params).reduce<SqliteNamedParams>((bindings, [key, value]) => {
    const bareKey = key.startsWith("@") || key.startsWith(":") || key.startsWith("$") ? key.slice(1) : key;
    bindings[bareKey] = value;
    bindings[`@${bareKey}`] = value;
    bindings[`:${bareKey}`] = value;
    bindings[`$${bareKey}`] = value;
    return bindings;
  }, {});
}

function runNamed(statement: SqliteStatementLike, params: SqliteNamedParams): void {
  statement.run(toSqliteNamedParams(params));
}

function migrate(db: SqliteDatabaseLike): void {
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS spaces (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      repository_ids_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS repositories (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      slug TEXT NOT NULL,
      display_name TEXT NOT NULL,
      default_branch TEXT,
      remote_urls_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS worktrees (
      id TEXT PRIMARY KEY,
      repository_id TEXT NOT NULL,
      branch TEXT NOT NULL,
      base_ref TEXT NOT NULL,
      logical_path TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      space_id TEXT NOT NULL,
      owning_repository_id TEXT,
      display_id TEXT,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      status TEXT NOT NULL,
      version INTEGER NOT NULL,
      tags_json TEXT NOT NULL,
      path_scopes_json TEXT NOT NULL,
      attributes_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE,
      FOREIGN KEY (owning_repository_id) REFERENCES repositories(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS links (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      from_entity_id TEXT NOT NULL,
      to_entity_id TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (from_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
      FOREIGN KEY (to_entity_id) REFERENCES entities(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      actor TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS runtime_attachments (
      id TEXT PRIMARY KEY,
      worktree_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      local_path TEXT NOT NULL,
      process_id INTEGER,
      lease_expires_at TEXT,
      metadata_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (worktree_id) REFERENCES worktrees(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_repositories_space ON repositories(space_id);
    CREATE INDEX IF NOT EXISTS idx_worktrees_repository ON worktrees(repository_id);
    CREATE INDEX IF NOT EXISTS idx_entities_space_kind ON entities(space_id, kind);
    CREATE INDEX IF NOT EXISTS idx_entities_display_id ON entities(display_id);
    CREATE INDEX IF NOT EXISTS idx_links_from_entity ON links(from_entity_id);
    CREATE INDEX IF NOT EXISTS idx_events_entity_sequence ON events(entity_id, sequence);
    CREATE INDEX IF NOT EXISTS idx_runtime_attachments_worktree ON runtime_attachments(worktree_id);
  `);

  db.exec("DROP TABLE IF EXISTS projections");
}

function rowToSpace(row: Record<string, unknown>): LoomSpaceRecord {
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    description: String(row.description),
    repositoryIds: decode(row.repository_ids_json, [] as string[]),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function rowToRepository(row: Record<string, unknown>): LoomRepositoryRecord {
  return {
    id: String(row.id),
    spaceId: String(row.space_id),
    slug: String(row.slug),
    displayName: String(row.display_name),
    defaultBranch: row.default_branch ? String(row.default_branch) : null,
    remoteUrls: decode(row.remote_urls_json, [] as string[]),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function rowToWorktree(row: Record<string, unknown>): LoomWorktreeRecord {
  return {
    id: String(row.id),
    repositoryId: String(row.repository_id),
    branch: String(row.branch),
    baseRef: String(row.base_ref),
    logicalPath: String(row.logical_path),
    status: row.status as LoomWorktreeRecord["status"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function rowToEntity(row: Record<string, unknown>): LoomEntityRecord {
  return {
    id: String(row.id),
    kind: row.kind as LoomEntityRecord["kind"],
    spaceId: String(row.space_id),
    owningRepositoryId: row.owning_repository_id ? String(row.owning_repository_id) : null,
    displayId: row.display_id ? String(row.display_id) : null,
    title: String(row.title),
    summary: String(row.summary),
    status: String(row.status),
    version: Number(row.version),
    tags: decode(row.tags_json, [] as string[]),
    pathScopes: decode(row.path_scopes_json, [] as LoomEntityRecord["pathScopes"]),
    attributes: decode(row.attributes_json, {} as Record<string, unknown>),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function rowToLink(row: Record<string, unknown>): LoomEntityLinkRecord {
  return {
    id: String(row.id),
    kind: row.kind as LoomEntityLinkRecord["kind"],
    fromEntityId: String(row.from_entity_id),
    toEntityId: String(row.to_entity_id),
    metadata: decode(row.metadata_json, {} as Record<string, unknown>),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function rowToEvent(row: Record<string, unknown>): LoomEntityEventRecord {
  return {
    id: String(row.id),
    entityId: String(row.entity_id),
    kind: row.kind as LoomEntityEventRecord["kind"],
    sequence: Number(row.sequence),
    createdAt: String(row.created_at),
    actor: String(row.actor),
    payload: decode(row.payload_json, {} as Record<string, unknown>),
  };
}

function rowToRuntimeAttachment(row: Record<string, unknown>): LoomRuntimeAttachment {
  return {
    id: String(row.id),
    worktreeId: String(row.worktree_id),
    kind: row.kind as LoomRuntimeAttachment["kind"],
    localPath: String(row.local_path),
    processId: typeof row.process_id === "number" ? Number(row.process_id) : null,
    leaseExpiresAt: row.lease_expires_at ? String(row.lease_expires_at) : null,
    metadata: decode(row.metadata_json, {} as Record<string, unknown>),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

class SqliteLoomCatalogTx implements LoomCanonicalTransaction {
  readonly contractVersion = LOOM_STORAGE_CONTRACT_VERSION;
  readonly backendKind = "sqlite" as const;

  constructor(
    protected readonly db: SqliteDatabaseLike,
    private active = true,
  ) {}

  async commit(): Promise<void> {
    if (this.active) {
      this.db.exec("COMMIT");
      this.active = false;
    }
  }

  async rollback(): Promise<void> {
    if (this.active) {
      this.db.exec("ROLLBACK");
      this.active = false;
    }
  }

  async getSpace(id: string): Promise<LoomSpaceRecord | null> {
    const row = this.db.prepare("SELECT * FROM spaces WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? rowToSpace(row) : null;
  }

  async listRepositories(spaceId: string): Promise<LoomRepositoryRecord[]> {
    return this.db
      .prepare("SELECT * FROM repositories WHERE space_id = ? ORDER BY slug")
      .all(spaceId)
      .map((row: unknown) => rowToRepository(row as Record<string, unknown>));
  }

  async listWorktrees(repositoryId: string): Promise<LoomWorktreeRecord[]> {
    return this.db
      .prepare("SELECT * FROM worktrees WHERE repository_id = ? ORDER BY logical_path")
      .all(repositoryId)
      .map((row: unknown) => rowToWorktree(row as Record<string, unknown>));
  }

  async getEntity(id: string): Promise<LoomEntityRecord | null> {
    const row = this.db.prepare("SELECT * FROM entities WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? rowToEntity(row) : null;
  }

  async getEntityByDisplayId(spaceId: string, kind: LoomEntityRecord["kind"], displayId: string): Promise<LoomEntityRecord | null> {
    const row = this.db
      .prepare("SELECT * FROM entities WHERE space_id = ? AND kind = ? AND display_id = ? LIMIT 1")
      .get(spaceId, kind, displayId) as Record<string, unknown> | undefined;
    return row ? rowToEntity(row) : null;
  }

  async listEntities(spaceId?: string, kind?: LoomEntityRecord["kind"]): Promise<LoomEntityRecord[]> {
    if (spaceId && kind) {
      return this.db
        .prepare("SELECT * FROM entities WHERE space_id = ? AND kind = ? ORDER BY id")
        .all(spaceId, kind)
        .map((row: unknown) => rowToEntity(row as Record<string, unknown>));
    }
    if (spaceId) {
      return this.db
        .prepare("SELECT * FROM entities WHERE space_id = ? ORDER BY id")
        .all(spaceId)
        .map((row: unknown) => rowToEntity(row as Record<string, unknown>));
    }
    if (kind) {
      return this.db
        .prepare("SELECT * FROM entities WHERE kind = ? ORDER BY id")
        .all(kind)
        .map((row: unknown) => rowToEntity(row as Record<string, unknown>));
    }
    return this.db
      .prepare("SELECT * FROM entities ORDER BY id")
      .all()
      .map((row: unknown) => rowToEntity(row as Record<string, unknown>));
  }

  async listLinks(entityId: string): Promise<LoomEntityLinkRecord[]> {
    return this.db
      .prepare("SELECT * FROM links WHERE from_entity_id = ? OR to_entity_id = ? ORDER BY id")
      .all(entityId, entityId)
      .map((row: unknown) => rowToLink(row as Record<string, unknown>));
  }

  async listEvents(entityId: string): Promise<LoomEntityEventRecord[]> {
    return this.db
      .prepare("SELECT * FROM events WHERE entity_id = ? ORDER BY sequence")
      .all(entityId)
      .map((row: unknown) => rowToEvent(row as Record<string, unknown>));
  }

  async listRuntimeAttachments(worktreeId?: string): Promise<LoomRuntimeAttachment[]> {
    if (worktreeId) {
      return this.db
        .prepare("SELECT * FROM runtime_attachments WHERE worktree_id = ? ORDER BY id")
        .all(worktreeId)
        .map((row: unknown) => rowToRuntimeAttachment(row as Record<string, unknown>));
    }
    return this.db
      .prepare("SELECT * FROM runtime_attachments ORDER BY id")
      .all()
      .map((row: unknown) => rowToRuntimeAttachment(row as Record<string, unknown>));
  }

  async upsertSpace(record: LoomSpaceRecord): Promise<void> {
    runNamed(
      this.db.prepare(`
        INSERT INTO spaces (id, slug, title, description, repository_ids_json, created_at, updated_at)
        VALUES (@id, @slug, @title, @description, @repository_ids_json, @created_at, @updated_at)
        ON CONFLICT(id) DO UPDATE SET
          slug = excluded.slug,
          title = excluded.title,
          description = excluded.description,
          repository_ids_json = excluded.repository_ids_json,
          updated_at = excluded.updated_at
      `),
      {
        id: record.id,
        slug: record.slug,
        title: record.title,
        description: record.description,
        repository_ids_json: encode(record.repositoryIds),
        created_at: record.createdAt,
        updated_at: record.updatedAt,
      },
    );
  }

  async upsertRepository(record: LoomRepositoryRecord): Promise<void> {
    runNamed(
      this.db.prepare(`
        INSERT INTO repositories (id, space_id, slug, display_name, default_branch, remote_urls_json, created_at, updated_at)
        VALUES (@id, @space_id, @slug, @display_name, @default_branch, @remote_urls_json, @created_at, @updated_at)
        ON CONFLICT(id) DO UPDATE SET
          space_id = excluded.space_id,
          slug = excluded.slug,
          display_name = excluded.display_name,
          default_branch = excluded.default_branch,
          remote_urls_json = excluded.remote_urls_json,
          updated_at = excluded.updated_at
      `),
      {
        id: record.id,
        space_id: record.spaceId,
        slug: record.slug,
        display_name: record.displayName,
        default_branch: record.defaultBranch,
        remote_urls_json: encode(record.remoteUrls),
        created_at: record.createdAt,
        updated_at: record.updatedAt,
      },
    );
  }

  async upsertWorktree(record: LoomWorktreeRecord): Promise<void> {
    runNamed(
      this.db.prepare(`
        INSERT INTO worktrees (id, repository_id, branch, base_ref, logical_path, status, created_at, updated_at)
        VALUES (@id, @repository_id, @branch, @base_ref, @logical_path, @status, @created_at, @updated_at)
        ON CONFLICT(id) DO UPDATE SET
          repository_id = excluded.repository_id,
          branch = excluded.branch,
          base_ref = excluded.base_ref,
          logical_path = excluded.logical_path,
          status = excluded.status,
          updated_at = excluded.updated_at
      `),
      {
        id: record.id,
        repository_id: record.repositoryId,
        branch: record.branch,
        base_ref: record.baseRef,
        logical_path: record.logicalPath,
        status: record.status,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
      },
    );
  }

  async upsertEntity(record: LoomEntityRecord): Promise<void> {
    runNamed(
      this.db.prepare(`
        INSERT INTO entities (id, kind, space_id, owning_repository_id, display_id, title, summary, status, version, tags_json, path_scopes_json, attributes_json, created_at, updated_at)
        VALUES (@id, @kind, @space_id, @owning_repository_id, @display_id, @title, @summary, @status, @version, @tags_json, @path_scopes_json, @attributes_json, @created_at, @updated_at)
        ON CONFLICT(id) DO UPDATE SET
          kind = excluded.kind,
          space_id = excluded.space_id,
          owning_repository_id = excluded.owning_repository_id,
          display_id = excluded.display_id,
          title = excluded.title,
          summary = excluded.summary,
          status = excluded.status,
          version = excluded.version,
          tags_json = excluded.tags_json,
          path_scopes_json = excluded.path_scopes_json,
          attributes_json = excluded.attributes_json,
          updated_at = excluded.updated_at
      `),
      {
        id: record.id,
        kind: record.kind,
        space_id: record.spaceId,
        owning_repository_id: record.owningRepositoryId,
        display_id: record.displayId,
        title: record.title,
        summary: record.summary,
        status: record.status,
        version: record.version,
        tags_json: encode(record.tags),
        path_scopes_json: encode(record.pathScopes),
        attributes_json: encode(record.attributes),
        created_at: record.createdAt,
        updated_at: record.updatedAt,
      },
    );
  }

  async upsertLink(record: LoomEntityLinkRecord): Promise<void> {
    runNamed(
      this.db.prepare(`
        INSERT INTO links (id, kind, from_entity_id, to_entity_id, metadata_json, created_at, updated_at)
        VALUES (@id, @kind, @from_entity_id, @to_entity_id, @metadata_json, @created_at, @updated_at)
        ON CONFLICT(id) DO UPDATE SET
          kind = excluded.kind,
          from_entity_id = excluded.from_entity_id,
          to_entity_id = excluded.to_entity_id,
          metadata_json = excluded.metadata_json,
          updated_at = excluded.updated_at
      `),
      {
        id: record.id,
        kind: record.kind,
        from_entity_id: record.fromEntityId,
        to_entity_id: record.toEntityId,
        metadata_json: encode(record.metadata),
        created_at: record.createdAt,
        updated_at: record.updatedAt,
      },
    );
  }

  async appendEvent(record: LoomEntityEventRecord): Promise<void> {
    runNamed(
      this.db.prepare(`
        INSERT INTO events (id, entity_id, kind, sequence, created_at, actor, payload_json)
        VALUES (@id, @entity_id, @kind, @sequence, @created_at, @actor, @payload_json)
        ON CONFLICT(id) DO UPDATE SET
          kind = excluded.kind,
          sequence = excluded.sequence,
          actor = excluded.actor,
          payload_json = excluded.payload_json
      `),
      {
        id: record.id,
        entity_id: record.entityId,
        kind: record.kind,
        sequence: record.sequence,
        created_at: record.createdAt,
        actor: record.actor,
        payload_json: encode(record.payload),
      },
    );
  }

  async upsertRuntimeAttachment(record: LoomRuntimeAttachment): Promise<void> {
    runNamed(
      this.db.prepare(`
        INSERT INTO runtime_attachments (id, worktree_id, kind, local_path, process_id, lease_expires_at, metadata_json, created_at, updated_at)
        VALUES (@id, @worktree_id, @kind, @local_path, @process_id, @lease_expires_at, @metadata_json, @created_at, @updated_at)
        ON CONFLICT(id) DO UPDATE SET
          worktree_id = excluded.worktree_id,
          kind = excluded.kind,
          local_path = excluded.local_path,
          process_id = excluded.process_id,
          lease_expires_at = excluded.lease_expires_at,
          metadata_json = excluded.metadata_json,
          updated_at = excluded.updated_at
      `),
      {
        id: record.id,
        worktree_id: record.worktreeId,
        kind: record.kind,
        local_path: record.localPath,
        process_id: record.processId,
        lease_expires_at: record.leaseExpiresAt,
        metadata_json: encode(record.metadata),
        created_at: record.createdAt,
        updated_at: record.updatedAt,
      },
    );
  }

  async removeRuntimeAttachment(id: string): Promise<void> {
    this.db.prepare("DELETE FROM runtime_attachments WHERE id = ?").run(id);
  }

  async transact<T>(run: (tx: LoomCanonicalTransaction) => Promise<T>): Promise<T> {
    const nested = new SqliteLoomCatalogTx(this.db);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = await run(nested);
      await nested.commit();
      return result;
    } catch (error) {
      await nested.rollback();
      throw error;
    }
  }
}

export class SqliteLoomCatalog extends SqliteLoomCatalogTx implements LoomCanonicalStorage {
  declare readonly db: SqliteDatabaseLike;

  constructor(databasePath = ensureLoomCatalogDirs(getLoomCatalogPaths()).catalogPath) {
    const db = new LoadedSqliteDatabase(databasePath);
    migrate(db);
    super(db, false);
    this.db = db;
  }

  close(): void {
    this.db.close();
  }
}
