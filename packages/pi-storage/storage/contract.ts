import path from "node:path";

export const LOOM_STORAGE_CONTRACT_VERSION = 1 as const;

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
  "owns_projection",
  "scoped_to_repository",
] as const;

export const LOOM_EVENT_KINDS = [
  "created",
  "updated",
  "status_changed",
  "linked",
  "unlinked",
  "projected",
  "hydrated",
  "imported",
  "exported",
  "decision_recorded",
] as const;

export const LOOM_PROJECTION_KINDS = [
  "constitution_markdown_body",
  "documentation_markdown_body",
  "spec_markdown_body",
  "plan_markdown_projection",
  "ticket_markdown_projection",
  "checkpoint_markdown_projection",
  "packet_markdown_projection",
  "dashboard_projection",
  "artifact_manifest",
  "sync_bundle",
] as const;

export const LOOM_PROJECTION_MATERIALIZATIONS = ["repo_materialized", "generated_on_demand", "db_only"] as const;

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
export type LoomProjectionKind = (typeof LOOM_PROJECTION_KINDS)[number];
export type LoomProjectionMaterialization = (typeof LOOM_PROJECTION_MATERIALIZATIONS)[number];
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
  logicalPath: string;
  status: LoomWorktreeStatus;
}

export interface LoomPathScope {
  repositoryId: LoomId;
  relativePath: string;
  role: "canonical" | "projection" | "artifact";
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
  pathScopes: LoomPathScope[];
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

export interface LoomProjectionRecord extends LoomAuditFields {
  id: LoomId;
  entityId: LoomId;
  kind: LoomProjectionKind;
  materialization: LoomProjectionMaterialization;
  repositoryId: LoomId | null;
  relativePath: string | null;
  contentHash: string | null;
  version: number;
  content: string | null;
}

export interface LoomRuntimeAttachment {
  id: LoomId;
  worktreeId: LoomId;
  kind: LoomRuntimeAttachmentKind;
  localPath: string;
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
  listEntities(spaceId?: LoomId, kind?: LoomEntityKind): Promise<LoomEntityRecord[]>;
  listLinks(entityId: LoomId): Promise<LoomEntityLinkRecord[]>;
  listEvents(entityId: LoomId): Promise<LoomEntityEventRecord[]>;
  listProjections(entityId: LoomId): Promise<LoomProjectionRecord[]>;
  upsertSpace(record: LoomSpaceRecord): Promise<void>;
  upsertRepository(record: LoomRepositoryRecord): Promise<void>;
  upsertWorktree(record: LoomWorktreeRecord): Promise<void>;
  upsertEntity(record: LoomEntityRecord): Promise<void>;
  upsertLink(record: LoomEntityLinkRecord): Promise<void>;
  appendEvent(record: LoomEntityEventRecord): Promise<void>;
  upsertProjection(record: LoomProjectionRecord): Promise<void>;
  transact<T>(run: (tx: LoomCanonicalTransaction) => Promise<T>): Promise<T>;
}

export interface LoomCanonicalTransaction extends LoomCanonicalStorage {
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface LoomRuntimeStateStore {
  getRuntimeAttachments(worktreeId: LoomId): Promise<LoomRuntimeAttachment[]>;
  putRuntimeAttachment(record: LoomRuntimeAttachment): Promise<void>;
  removeRuntimeAttachment(id: LoomId): Promise<void>;
}

export function isRepoRelativePath(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  if (path.isAbsolute(trimmed)) {
    return false;
  }

  const normalized = trimmed.replace(/\\/g, "/");
  if (normalized === ".") {
    return true;
  }

  return normalized !== ".." && !normalized.startsWith("../");
}

export function assertRepoRelativePath(value: string): string {
  if (!isRepoRelativePath(value)) {
    throw new Error(`Expected repo-relative path, received: ${value}`);
  }
  return value;
}
