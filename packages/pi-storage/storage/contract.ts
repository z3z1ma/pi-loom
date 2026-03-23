export const LOOM_STORAGE_CONTRACT_VERSION = 4 as const;

export const LOOM_ENTITY_KINDS = [
  "constitution",
  "research",
  "initiative",
  "spec_change",
  "spec_capability",
  "plan",
  "ticket",
  "worker",
  "critique",
  "ralph_run",
  "documentation",
  "artifact",
] as const;

export const LOOM_LINK_KINDS = [
  "depends_on",
  "blocks",
  "belongs_to",
  "references",
  "implements",
  "documents",
  "critiques",
  "spawned_from",
  "scoped_to_repository",
] as const;

export const LOOM_EVENT_KINDS = [
  "created",
  "updated",
  "status_changed",
  "linked",
  "unlinked",
  "imported",
  "exported",
  "decision_recorded",
] as const;

export const LOOM_RUNTIME_ATTACHMENT_KINDS = [
  "worker_runtime",
  "manager_runtime",
  "launch_descriptor",
  "local_process",
] as const;

export const LOOM_WORKTREE_STATUSES = ["attached", "suspended", "retired"] as const;

export type LoomEntityKind = (typeof LOOM_ENTITY_KINDS)[number];
export type LoomLinkKind = (typeof LOOM_LINK_KINDS)[number];
export type LoomEventKind = (typeof LOOM_EVENT_KINDS)[number];
export type LoomRuntimeAttachmentKind = (typeof LOOM_RUNTIME_ATTACHMENT_KINDS)[number];
export type LoomWorktreeStatus = (typeof LOOM_WORKTREE_STATUSES)[number];

export type LoomId = string;

export interface LoomAuditFields {
  createdAt: string;
  updatedAt: string;
}

export interface LoomSpaceRecord extends LoomAuditFields {
  id: LoomId;
  slug: string;
  title: string;
  description: string;
  repositoryIds: LoomId[];
}

export interface LoomRepositoryRecord extends LoomAuditFields {
  id: LoomId;
  spaceId: LoomId;
  slug: string;
  displayName: string;
  defaultBranch: string | null;
  remoteUrls: string[];
}

export interface LoomWorktreeRecord extends LoomAuditFields {
  id: LoomId;
  repositoryId: LoomId;
  branch: string;
  baseRef: string;
  logicalKey: string;
  status: LoomWorktreeStatus;
}

export type LoomScopeBindingSource = "cwd" | "selection" | "persisted";

export interface LoomActiveScopeRepositoryBinding {
  repositoryId: LoomId;
  worktreeId: LoomId | null;
  source: LoomScopeBindingSource;
}

export interface LoomActiveScopeRecord extends LoomAuditFields {
  spaceId: LoomId;
  repositoryId: LoomId | null;
  worktreeId: LoomId | null;
  bindingSource: LoomScopeBindingSource;
  isAmbiguous: boolean;
  candidateRepositoryIds: LoomId[];
}

export interface LoomEntityRecord extends LoomAuditFields {
  id: LoomId;
  kind: LoomEntityKind;
  spaceId: LoomId;
  owningRepositoryId: LoomId | null;
  displayId: string | null;
  title: string;
  summary: string;
  status: string;
  version: number;
  tags: string[];
  attributes: Record<string, unknown>;
}

export interface LoomEntityLinkRecord extends LoomAuditFields {
  id: LoomId;
  kind: LoomLinkKind;
  fromEntityId: LoomId;
  toEntityId: LoomId;
  metadata: Record<string, unknown>;
}

export interface LoomEntityEventRecord {
  id: LoomId;
  entityId: LoomId;
  kind: LoomEventKind;
  sequence: number;
  createdAt: string;
  actor: string;
  payload: Record<string, unknown>;
}

export interface LoomRuntimeAttachment extends LoomAuditFields {
  id: LoomId;
  worktreeId: LoomId;
  kind: LoomRuntimeAttachmentKind;
  locator: string;
  processId: number | null;
  leaseExpiresAt: string | null;
  metadata: Record<string, unknown>;
}

export interface LoomCanonicalStorage {
  readonly contractVersion: typeof LOOM_STORAGE_CONTRACT_VERSION;
  readonly backendKind: string;
  getSpace(id: LoomId): Promise<LoomSpaceRecord | null>;
  listRepositories(spaceId: LoomId): Promise<LoomRepositoryRecord[]>;
  listWorktrees(repositoryId: LoomId): Promise<LoomWorktreeRecord[]>;
  getEntity(id: LoomId): Promise<LoomEntityRecord | null>;
  getEntityByDisplayId(spaceId: LoomId, kind: LoomEntityKind, displayId: string): Promise<LoomEntityRecord | null>;
  listEntities(spaceId?: LoomId, kind?: LoomEntityKind): Promise<LoomEntityRecord[]>;
  listLinks(entityId: LoomId): Promise<LoomEntityLinkRecord[]>;
  listEvents(entityId: LoomId): Promise<LoomEntityEventRecord[]>;
  listRuntimeAttachments(worktreeId?: LoomId): Promise<LoomRuntimeAttachment[]>;
  upsertSpace(record: LoomSpaceRecord): Promise<void>;
  upsertRepository(record: LoomRepositoryRecord): Promise<void>;
  upsertWorktree(record: LoomWorktreeRecord): Promise<void>;
  upsertEntity(record: LoomEntityRecord): Promise<void>;
  removeEntity(id: LoomId): Promise<void>;
  upsertLink(record: LoomEntityLinkRecord): Promise<void>;
  removeLink(id: LoomId): Promise<void>;
  appendEvent(record: LoomEntityEventRecord): Promise<void>;
  removeEvent(id: LoomId): Promise<void>;
  upsertRuntimeAttachment(record: LoomRuntimeAttachment): Promise<void>;
  removeRuntimeAttachment(id: LoomId): Promise<void>;
  transact<T>(run: (tx: LoomCanonicalTransaction) => Promise<T>): Promise<T>;
}

export interface LoomCanonicalTransaction extends LoomCanonicalStorage {
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface LoomRuntimeStateStore {
  listRuntimeAttachments(worktreeId?: LoomId): Promise<LoomRuntimeAttachment[]>;
  upsertRuntimeAttachment(record: LoomRuntimeAttachment): Promise<void>;
  removeRuntimeAttachment(id: LoomId): Promise<void>;
}
