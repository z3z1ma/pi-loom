import { existsSync, readFileSync, realpathSync, rmSync } from "node:fs";
import path, { basename, resolve } from "node:path";
import type { PlanState } from "#plans/domain/models.js";
import type { LoomCanonicalStorage } from "#storage/contract.js";
import { findEntityByDisplayId, upsertEntityByDisplayIdWithLifecycleEvents } from "#storage/entities.js";
import { createLinkId } from "#storage/ids.js";
import type { ProjectedEntityLinkInput } from "#storage/links.js";
import { assertProjectedEntityLinksResolvable, syncProjectedEntityLinks } from "#storage/links.js";
import { getLoomCatalogPaths } from "#storage/locations.js";
import { assertWorkspaceProjectionFamiliesClean, hasExportedProjectionFamily } from "#storage/projection-lifecycle.js";
import {
  type LoomProjectionSelectionInput,
  normalizeProjectionSelection,
  projectionEntryMatchesSelection,
} from "#storage/projection-selection.js";
import {
  assessProjectionFileState,
  createProjectionManifest,
  createProjectionManifestEntry,
  ensureProjectionWorkspace,
  type LoomProjectionWriteResult,
  readProjectionManifest,
  resolveProjectionFilePath,
  writeProjectionFile,
  writeProjectionManifest,
} from "#storage/projections.js";
import { createPortableRepositoryPath, normalizePortableRelativePath } from "#storage/repository-path.js";
import { resolveRepositoryQualifier } from "#storage/repository-qualifier.js";
import {
  type LoomExplicitScopeInput,
  openRepositoryWorkspaceStorage,
  openScopedWorkspaceStorage,
} from "#storage/workspace.js";
import { inferMediaType } from "./attachments.js";
import { createEmptyBody, parseTicket, serializeTicket } from "./frontmatter.js";
import { buildTicketGraph, findDependencyCycle, getTicketGraphNodeForSummary, summarizeTicket } from "./graph.js";
import { createJournalEntry } from "./journal.js";
import type {
  AttachArtifactInput,
  AttachmentRecord,
  CheckpointRecord,
  CreateCheckpointInput,
  CreateTicketInput,
  DeleteTicketResult,
  JournalKind,
  TicketGraphResult,
  TicketListFilter,
  TicketReadResult,
  TicketRecord,
  TicketSummary,
  UpdateTicketInput,
} from "./models.js";
import {
  currentTimestamp,
  formatTicketId,
  normalizeOptionalString,
  normalizeStringList,
  normalizeTicketBranchIntent,
  normalizeTicketRef,
  parseTicketIdParts,
} from "./normalize.js";
import { getAttachmentSourceRef, getCheckpointRef, getTicketRef } from "./paths.js";
import { filterTickets, summarizeTickets } from "./query.js";

const ENTITY_KIND = "ticket" as const;
const TICKET_PROJECTION_OWNER = "ticket-store" as const;
const DEFAULT_TICKET_PROJECTION_RECENT_WINDOW_DAYS = 14 as const;
const TICKET_PROJECTION_PIN_LABEL = "projection:pinned" as const;
const TICKET_PROJECTION_REASON_ORDER = ["open", "active_plan_linked", "recent", "pinned"] as const;

type TicketProjectionInclusionReason = (typeof TICKET_PROJECTION_REASON_ORDER)[number];

interface TicketEntityAttributes {
  record: TicketReadResult;
}

interface PlanEntityAttributes {
  state: PlanState;
}

type WorkspaceIdentity = Awaited<ReturnType<typeof openScopedWorkspaceStorage>>["identity"];
type RepositoryWorkspaceIdentity = Awaited<ReturnType<typeof openRepositoryWorkspaceStorage>>["identity"];

type QualifiedRepositoryPath = ReturnType<typeof createPortableRepositoryPath>;

interface ResolvedAttachmentSource {
  absoluteSource: string;
  sourcePath: QualifiedRepositoryPath | null;
}

interface TicketWorkspaceProjectionOptions {
  recentWindowDays?: number;
  pinLabel?: string;
  now?: string;
}

interface TicketWorkspaceProjectionRecord {
  ticketId: string;
  relativePath: string;
  inclusionReasons: TicketProjectionInclusionReason[];
  activePlanIds: string[];
  write: LoomProjectionWriteResult;
}

interface TicketWorkspaceProjectionSyncResult {
  repositoryRoot: string;
  manifestPath: string;
  recentWindowDays: number;
  pinLabel: string;
  projected: TicketWorkspaceProjectionRecord[];
  prunedRelativePaths: string[];
  manifest: LoomProjectionWriteResult;
  gitignore: LoomProjectionWriteResult;
}

interface TicketWorkspaceProjectionCurrentEntry {
  record: TicketReadResult;
  selection: TicketProjectionSelection;
  renderedContent: string;
}

interface TicketWorkspaceProjectionSnapshot {
  repositoryRoot: string;
  workspace: ReturnType<typeof ensureProjectionWorkspace>;
  manifestPath: string;
  recentWindowDays: number;
  pinLabel: string;
  currentEntries: TicketWorkspaceProjectionCurrentEntry[];
  manifest: ReturnType<typeof createProjectionManifest>;
}

interface TicketWorkspaceProjectionReconcileResult {
  updated: TicketReadResult[];
  clean: string[];
}

interface RepositoryTicketProjectionCandidate {
  entityVersion: number;
  record: TicketReadResult;
}

interface TicketProjectionSelection {
  candidate: RepositoryTicketProjectionCandidate;
  relativePath: string;
  inclusionReasons: TicketProjectionInclusionReason[];
  activePlanIds: string[];
}

function isPathInsideRoot(rootPath: string, candidatePath: string): boolean {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function hasStructuredTicketAttributes(attributes: unknown): attributes is TicketEntityAttributes {
  return Boolean(attributes && typeof attributes === "object" && "record" in attributes);
}

function hasStructuredPlanAttributes(attributes: unknown): attributes is PlanEntityAttributes {
  return Boolean(attributes && typeof attributes === "object" && "state" in attributes);
}

function normalizeProjectionReasonOrder(
  reasons: Iterable<TicketProjectionInclusionReason>,
): TicketProjectionInclusionReason[] {
  const reasonSet = new Set(reasons);
  return TICKET_PROJECTION_REASON_ORDER.filter((reason) => reasonSet.has(reason));
}

function normalizeTicketProjectionRecentWindowDays(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_TICKET_PROJECTION_RECENT_WINDOW_DAYS;
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("Ticket projection recentWindowDays must be a non-negative integer.");
  }
  return value;
}

function normalizeTicketProjectionClock(now: string | undefined): { timestamp: string; epochMs: number } {
  const parsed = now?.trim() ? Date.parse(now) : Date.now();
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid ticket projection timestamp: ${String(now)}`);
  }
  return { timestamp: new Date(parsed).toISOString(), epochMs: parsed };
}

function parseUpdatedAtMs(value: string, ticketId: string): number {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Ticket ${ticketId} has invalid updated-at timestamp ${value}`);
  }
  return parsed;
}

function ticketProjectionRelativePath(ticketId: string): string {
  return `${ticketId}.md`;
}

function activePlanIdsForTicket(record: TicketReadResult, activePlanIds: Set<string>): string[] {
  return normalizeStringList(
    record.ticket.frontmatter["external-refs"]
      .map((externalRef) => parsePlanExternalRef(externalRef))
      .filter((planId): planId is string => Boolean(planId && activePlanIds.has(planId))),
  );
}

function selectTicketProjectionReasons(
  record: TicketReadResult,
  activePlanIds: Set<string>,
  recentCutoffMs: number,
  pinLabel: string,
): { inclusionReasons: TicketProjectionInclusionReason[]; activePlanIds: string[] } {
  if (record.ticket.archived || record.summary.archived) {
    return { inclusionReasons: [], activePlanIds: [] };
  }

  const plans = activePlanIdsForTicket(record, activePlanIds);
  const inclusionReasons: TicketProjectionInclusionReason[] = [];
  if (record.summary.status !== "closed") {
    inclusionReasons.push("open");
  }
  if (plans.length > 0) {
    inclusionReasons.push("active_plan_linked");
  }
  if (parseUpdatedAtMs(record.summary.updatedAt, record.summary.id) >= recentCutoffMs) {
    inclusionReasons.push("recent");
  }
  if (record.ticket.frontmatter.labels.includes(pinLabel)) {
    inclusionReasons.push("pinned");
  }

  return {
    inclusionReasons: normalizeProjectionReasonOrder(inclusionReasons),
    activePlanIds: plans,
  };
}

function createTicketProjectionManifestEntry(
  selection: TicketProjectionSelection,
  renderedContent: string,
  pinLabel: string,
) {
  return createProjectionManifestEntry({
    canonicalRef: getTicketRef(selection.candidate.record.summary.id),
    relativePath: selection.relativePath,
    renderedContent,
    revision: {
      canonicalRef: getTicketRef(selection.candidate.record.summary.id),
      baseVersion: selection.candidate.entityVersion,
      semanticInput: {
        projection: "ticket-markdown-v1",
        inclusionReasons: selection.inclusionReasons,
        activePlanIds: selection.activePlanIds,
        pinLabel,
      },
    },
    editability: { mode: "full" },
    metadata: {
      inclusionReasons: selection.inclusionReasons,
      activePlanIds: selection.activePlanIds,
      pinned: selection.inclusionReasons.includes("pinned"),
    },
  });
}

function nextNumericId(existingIds: string[], prefix: string): string {
  const max = existingIds.reduce((currentMax, currentId) => {
    const numeric = Number.parseInt(currentId.replace(`${prefix}-`, ""), 10);
    return Number.isFinite(numeric) ? Math.max(currentMax, numeric) : currentMax;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

function tokenizePrefixSource(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function deriveBaseTicketPrefix(label: string): string {
  const tokens = tokenizePrefixSource(label);
  if (tokens.length === 0) {
    return "t";
  }
  if (tokens.length === 1) {
    return tokens[0].slice(0, 2) || "t";
  }
  return (
    tokens
      .map((token) => token[0])
      .join("")
      .slice(0, 6) || "t"
  );
}

function expandedTicketPrefixCandidates(label: string, basePrefix: string): string[] {
  const tokens = tokenizePrefixSource(label);
  if (tokens.length === 0) {
    return [basePrefix];
  }
  const candidates = new Set<string>([basePrefix]);
  const flattened = tokens.length === 1 ? tokens[0] : `${tokens[0][0] ?? ""}${tokens.slice(1).join("")}`;
  for (let length = Math.max(basePrefix.length + 1, 2); length <= Math.min(6, flattened.length); length += 1) {
    candidates.add(flattened.slice(0, length));
  }
  return [...candidates].filter((candidate) => /^[a-z][a-z0-9]{0,5}$/.test(candidate));
}

function resolveRepositoryTicketPrefixLabel(identity: WorkspaceIdentity): string {
  if (!identity.repository || identity.repository.remoteUrls.length === 0) {
    return "";
  }
  return identity.repository.displayName || identity.repository.slug;
}

function inferExistingTicketPrefix(ticketId: string): string | null {
  try {
    return parseTicketIdParts(ticketId).prefix;
  } catch {
    return null;
  }
}

function parseTicketRef(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Ticket reference is required");
  }
  const withoutPrefix = trimmed.startsWith("ticket:") ? trimmed.slice("ticket:".length) : trimmed;
  return normalizeTicketRef(withoutPrefix);
}

function parsePlanExternalRef(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("plan:")) {
    return null;
  }
  const planId = trimmed.slice("plan:".length).trim();
  return planId ? planId : null;
}

function projectedLinksForTicket(record: TicketReadResult): ProjectedEntityLinkInput[] {
  const desired: ProjectedEntityLinkInput[] = [];
  const frontmatter = record.ticket.frontmatter;

  for (const dependencyId of frontmatter.deps) {
    desired.push({
      kind: "depends_on",
      targetKind: "ticket",
      targetDisplayId: dependencyId,
    });
  }

  for (const initiativeId of frontmatter["initiative-ids"]) {
    desired.push({
      kind: "belongs_to",
      targetKind: "initiative",
      targetDisplayId: initiativeId,
      required: false,
    });
  }

  if (frontmatter.parent) {
    desired.push({
      kind: "belongs_to",
      targetKind: "ticket",
      targetDisplayId: frontmatter.parent,
    });
  }

  for (const externalRef of frontmatter["external-refs"]) {
    const planId = parsePlanExternalRef(externalRef);
    if (planId) {
      desired.push({ kind: "belongs_to", targetKind: "plan", targetDisplayId: planId, required: false });
    }
  }

  for (const researchId of frontmatter["research-ids"]) {
    desired.push({
      kind: "references",
      targetKind: "research",
      targetDisplayId: researchId,
      required: false,
    });
  }

  return desired;
}

export class TicketStore {
  readonly cwd: string;
  readonly scope: Required<LoomExplicitScopeInput>;

  constructor(cwd: string, scope: LoomExplicitScopeInput = {}) {
    this.cwd = resolve(cwd);
    this.scope = {
      spaceId: scope.spaceId ?? null,
      repositoryId: scope.repositoryId ?? null,
      worktreeId: scope.worktreeId ?? null,
    };
  }

  initLedger(): { initialized: true; root: string } {
    return { initialized: true, root: getLoomCatalogPaths().catalogPath };
  }

  private async openWorkspaceStorage() {
    return openScopedWorkspaceStorage(this.cwd, this.scope);
  }

  private async openRepositoryWorkspaceStorage() {
    return openRepositoryWorkspaceStorage(this.cwd, this.scope);
  }

  private resolveLocalRepositoryRoot(identity: RepositoryWorkspaceIdentity): string {
    const matchingCandidate =
      identity.discovery.candidates.find(
        (candidate) =>
          candidate.repository.id === identity.repository.id && candidate.worktree.id === identity.worktree.id,
      ) ?? identity.discovery.candidates.find((candidate) => candidate.repository.id === identity.repository.id);
    if (!matchingCandidate) {
      throw new Error(
        `Repository ${identity.repository.displayName} [${identity.repository.id}] has no locally available worktree root under ${identity.discovery.scopeRoot}.`,
      );
    }
    return resolve(matchingCandidate.workspaceRoot);
  }

  private async resolveAttachmentSource(pathInput: string): Promise<ResolvedAttachmentSource> {
    const { identity } = await this.openRepositoryWorkspaceStorage();
    const repositoryRoot = this.resolveLocalRepositoryRoot(identity);
    const requestedPath = pathInput.trim().startsWith("@") ? pathInput.trim().slice(1) : pathInput.trim();
    const absoluteCandidate = path.isAbsolute(requestedPath)
      ? path.resolve(requestedPath)
      : path.resolve(repositoryRoot, requestedPath);
    if (!existsSync(absoluteCandidate)) {
      throw new Error(`Attachment source does not exist: ${pathInput}`);
    }

    const resolvedRepositoryRoot = realpathSync.native(repositoryRoot);
    const absoluteSource = realpathSync.native(absoluteCandidate);
    const sourcePath = isPathInsideRoot(resolvedRepositoryRoot, absoluteSource)
      ? createPortableRepositoryPath({
          repositoryId: identity.repository.id,
          repositorySlug: identity.repository.slug,
          worktreeId: identity.worktree.id,
          relativePath: normalizePortableRelativePath(path.relative(resolvedRepositoryRoot, absoluteSource)),
        })
      : null;

    if (!path.isAbsolute(requestedPath) && !sourcePath) {
      throw new Error(
        `Attachment path ${pathInput} escapes repository ${identity.repository.displayName} [${identity.repository.id}]; use an absolute path for non-repository files.`,
      );
    }

    return { absoluteSource, sourcePath };
  }

  private async upsertCanonicalRecordWithStorage(
    storage: LoomCanonicalStorage,
    identity: WorkspaceIdentity,
    record: TicketReadResult,
    options: {
      allowDirtyProjectionWrite?: boolean;
      validateProjectedLinks?: boolean;
      syncProjectedLinks?: boolean;
    } = {},
  ): Promise<TicketReadResult> {
    if (!identity.repository) {
      throw new Error(
        `Active scope for ${identity.space.id} is ambiguous; select a repository before repository-bound operations.`,
      );
    }
    if (!options.allowDirtyProjectionWrite) {
      assertWorkspaceProjectionFamiliesClean(this.cwd, "ticket persistence", ["tickets"]);
    }
    const existing = await findEntityByDisplayId(storage, identity.space.id, ENTITY_KIND, record.summary.id);
    const version = (existing?.version ?? 0) + 1;
    const summary = summarizeTickets([record.ticket])[0];
    if (!summary) {
      throw new Error(`Missing canonical ticket summary for ${record.ticket.frontmatter.id}`);
    }
    const canonicalRecord: TicketReadResult = {
      ...record,
      summary: {
        ...summary,
        repository: resolveRepositoryQualifier([identity.repository], identity.repository.id),
      },
    };
    if (options.validateProjectedLinks !== false) {
      await assertProjectedEntityLinksResolvable({
        storage,
        spaceId: identity.space.id,
        projectionOwner: TICKET_PROJECTION_OWNER,
        desired: projectedLinksForTicket(canonicalRecord),
      });
    }
    const { entity } = await upsertEntityByDisplayIdWithLifecycleEvents(
      storage,
      {
        kind: ENTITY_KIND,
        spaceId: identity.space.id,
        owningRepositoryId: identity.repository.id,
        displayId: canonicalRecord.summary.id,
        title: canonicalRecord.summary.title,
        summary: canonicalRecord.ticket.body.summary,
        status: canonicalRecord.summary.status,
        version,
        tags: canonicalRecord.ticket.frontmatter.tags,
        attributes: { record: canonicalRecord },
        createdAt: existing?.createdAt ?? canonicalRecord.summary.createdAt,
        updatedAt: canonicalRecord.summary.updatedAt,
      },
      {
        actor: "ticket-store",
        createdPayload: { change: "ticket_persisted" },
        updatedPayload: { change: "ticket_persisted" },
      },
    );
    if (options.syncProjectedLinks !== false) {
      await syncProjectedEntityLinks({
        storage,
        spaceId: identity.space.id,
        fromEntityId: entity.id,
        projectionOwner: TICKET_PROJECTION_OWNER,
        desired: projectedLinksForTicket(canonicalRecord),
        timestamp: canonicalRecord.summary.updatedAt,
      });
    }
    return canonicalRecord;
  }

  private async upsertCanonicalRecord(
    record: TicketReadResult,
    options: { allowDirtyProjectionWrite?: boolean } = {},
  ): Promise<TicketReadResult> {
    const { storage, identity } = await this.openRepositoryWorkspaceStorage();
    const canonical = await storage.transact((tx) =>
      this.upsertCanonicalRecordWithStorage(tx, identity, record, options),
    );
    if (hasExportedProjectionFamily(this.cwd, "tickets")) {
      await this.syncTicketWorkspaceProjectionAsync();
    }
    return canonical;
  }

  async syncExternalRefWithStorage(
    storage: LoomCanonicalStorage,
    identity: WorkspaceIdentity,
    ref: string,
    externalRef: string,
    present: boolean,
    options: { allowClosed?: boolean } = {},
  ): Promise<TicketReadResult> {
    const ticketId = this.resolveTicketRef(ref);
    const entity = await findEntityByDisplayId(storage, identity.space.id, ENTITY_KIND, ticketId);
    if (!entity) {
      throw new Error(`Unknown ticket: ${ticketId}`);
    }
    if (!hasStructuredTicketAttributes(entity.attributes)) {
      throw new Error(`Ticket entity ${ticketId} is missing structured attributes`);
    }

    const normalizedRef = externalRef.trim();
    const current = this.entityRecord(entity);
    if (!normalizedRef) {
      return current;
    }

    const hasRef = current.ticket.frontmatter["external-refs"].includes(normalizedRef);
    if (present === hasRef) {
      return current;
    }
    if (!options.allowClosed) {
      this.assertReopenedBeforeStructuralEdit(current, `${present ? "add" : "remove"} external refs`);
    }

    const timestamp = currentTimestamp();
    current.ticket.frontmatter["external-refs"] = present
      ? normalizeStringList([...current.ticket.frontmatter["external-refs"], normalizedRef])
      : current.ticket.frontmatter["external-refs"].filter((value) => value !== normalizedRef);
    current.ticket.frontmatter["updated-at"] = timestamp;
    current.journal = [
      ...current.journal,
      createJournalEntry(
        current.summary.id,
        "state",
        `${present ? "Added" : "Removed"} external reference ${normalizedRef}`,
        timestamp,
        { externalRef: normalizedRef },
        current.journal.length + 1,
      ),
    ];

    if (present) {
      return this.upsertCanonicalRecordWithStorage(storage, identity, current);
    }

    const updated = await this.upsertCanonicalRecordWithStorage(storage, identity, current, {
      validateProjectedLinks: false,
      syncProjectedLinks: false,
    });
    const planId = parsePlanExternalRef(normalizedRef);
    if (planId) {
      const planEntity = await findEntityByDisplayId(storage, identity.space.id, "plan", planId);
      if (planEntity) {
        await storage.removeLink(createLinkId("belongs_to", entity.id, planEntity.id));
      }
    }
    return updated;
  }

  private entityRecord(
    entity: { attributes: unknown; owningRepositoryId?: string | null },
    repositories: WorkspaceIdentity["repositories"] = [],
  ): TicketReadResult {
    const record = (entity.attributes as TicketEntityAttributes).record;
    const repository = resolveRepositoryQualifier(repositories, entity.owningRepositoryId ?? null);
    return {
      ...record,
      ticket: {
        ...record.ticket,
        archived: record.ticket.archived ?? false,
        archivedAt: record.ticket.archivedAt ?? null,
      },
      summary: {
        ...record.summary,
        repository,
        archived: record.summary.archived ?? false,
        archivedAt: record.summary.archivedAt ?? null,
      },
    };
  }

  private canonicalSummaries(records: TicketReadResult[]): TicketSummary[] {
    const repositoryByTicketId = new Map(records.map((record) => [record.summary.id, record.summary.repository]));
    return summarizeTickets(records.map((record) => record.ticket)).map((summary) => ({
      ...summary,
      repository: repositoryByTicketId.get(summary.id) ?? null,
    }));
  }

  private canonicalGraph(records: TicketReadResult[]): TicketGraphResult {
    return buildTicketGraph(this.canonicalSummaries(records));
  }

  private toCanonicalReadResult(
    record: TicketReadResult,
    summaries: TicketSummary[],
    graph: TicketGraphResult,
  ): TicketReadResult {
    const summary = summaries.find((entry) => entry.id === record.summary.id);
    if (!summary) {
      throw new Error(`Unknown ticket: ${record.summary.id}`);
    }
    const node = getTicketGraphNodeForSummary(graph, summary);
    return {
      ...record,
      summary,
      ticket: record.ticket,
      checkpoints: record.checkpoints,
      children: node?.children.map((child) => child.qualifiedId) ?? [],
      blockers: node?.blockedBy.map((blocker) => blocker.qualifiedId) ?? [],
    };
  }

  private async canonicalRecords(): Promise<TicketReadResult[]> {
    const { storage, identity } = await this.openWorkspaceStorage();
    const records = new Map<string, TicketReadResult>();
    for (const entity of await storage.listEntities(identity.space.id, ENTITY_KIND)) {
      const ticketId = this.resolveTicketRef(entity.displayId ?? entity.id);
      if (!hasStructuredTicketAttributes(entity.attributes)) {
        throw new Error(`Ticket entity ${ticketId} is missing structured attributes`);
      }
      const record = this.entityRecord(entity, identity.repositories);
      records.set(ticketId, record);
    }
    return [...records.values()].sort((left, right) => left.summary.id.localeCompare(right.summary.id));
  }

  resolveTicketRef(ref: string): string {
    return parseTicketRef(ref);
  }

  private async resolveTicketDisplayPrefix(
    storage: LoomCanonicalStorage,
    identity: WorkspaceIdentity,
  ): Promise<string> {
    const repository = identity.repository;
    if (!repository) {
      throw new Error(
        `Active scope for ${identity.space.id} is ambiguous; select a repository before repository-bound operations.`,
      );
    }
    const ticketEntities = await storage.listEntities(identity.space.id, ENTITY_KIND);
    const currentRepoPrefixes = ticketEntities
      .filter((entity) => entity.owningRepositoryId === repository.id)
      .map((entity) => inferExistingTicketPrefix(entity.displayId ?? ""))
      .filter((value): value is string => Boolean(value));
    if (currentRepoPrefixes.length > 0) {
      const counts = new Map<string, number>();
      for (const prefix of currentRepoPrefixes) {
        counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
      }
      return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0][0];
    }

    const label = resolveRepositoryTicketPrefixLabel(identity);
    if (!label) {
      return "t";
    }

    const usedByOtherRepos = new Set(
      ticketEntities
        .filter((entity) => entity.owningRepositoryId !== null && entity.owningRepositoryId !== repository.id)
        .map((entity) => inferExistingTicketPrefix(entity.displayId ?? ""))
        .filter((value): value is string => Boolean(value)),
    );
    const basePrefix = deriveBaseTicketPrefix(label);
    for (const candidate of expandedTicketPrefixCandidates(label, basePrefix)) {
      if (!usedByOtherRepos.has(candidate)) {
        return candidate;
      }
    }
    let suffix = 2;
    while (usedByOtherRepos.has(`${basePrefix}${suffix}`)) {
      suffix += 1;
    }
    return `${basePrefix}${suffix}`;
  }

  private nextTicketId(records: TicketReadResult[], prefix: string): string {
    const max = records.reduce((currentMax, record) => {
      try {
        const parsed = parseTicketIdParts(record.summary.id);
        if (parsed.prefix !== prefix) {
          return currentMax;
        }
        return Math.max(currentMax, parsed.sequence);
      } catch {
        return currentMax;
      }
    }, 0);
    return formatTicketId(prefix, max + 1);
  }

  private nextCheckpointId(records: TicketReadResult[]): string {
    return nextNumericId(
      records.flatMap((record) => record.checkpoints.map((checkpoint) => checkpoint.id)),
      "cp",
    );
  }

  private validateRelationships(
    ticketId: string,
    deps: string[],
    parent: string | null,
    allTickets: TicketSummary[],
  ): void {
    const depIds = normalizeStringList(deps).map((dep) => this.resolveTicketRef(dep));
    for (const depId of depIds) {
      if (!allTickets.some((ticket) => ticket.id === depId)) {
        throw new Error(`Unknown ticket: ${depId}`);
      }
      const cycle = findDependencyCycle(allTickets, ticketId, depId);
      if (cycle) {
        throw new Error(`Dependency cycle rejected: ${cycle.join(" -> ")}`);
      }
    }
    if (parent) {
      const parentId = this.resolveTicketRef(parent);
      if (parentId === ticketId) {
        throw new Error("A ticket cannot be its own parent");
      }
      if (!allTickets.some((ticket) => ticket.id === parentId)) {
        throw new Error(`Unknown ticket: ${parentId}`);
      }
    }
  }

  private assertTransitionAllowed(
    ticketId: string,
    deps: string[],
    status: "open" | "in_progress" | "review",
    summaries: TicketSummary[],
  ): void {
    if (status === "open") {
      return;
    }

    const blockedBy = normalizeStringList(deps).filter((depId) => {
      const dependency = summaries.find((summary) => summary.id === depId);
      return dependency !== undefined && dependency.status !== "closed";
    });

    if (blockedBy.length > 0) {
      throw new Error(`Ticket ${ticketId} cannot transition to ${status} while blocked by: ${blockedBy.join(", ")}`);
    }
  }

  private assertArchiveAllowed(record: TicketRecord): void {
    if (!record.closed) {
      throw new Error(`Ticket ${record.frontmatter.id} must be closed before it can be archived.`);
    }
  }

  private assertReopenedBeforeStructuralEdit(record: TicketReadResult, action: string): void {
    if (record.ticket.closed) {
      throw new Error(`Closed ticket ${record.summary.id} cannot ${action}; use reopen before editing it.`);
    }
  }

  async initLedgerAsync(): Promise<{ initialized: true; root: string }> {
    return this.initLedger();
  }

  async listTicketsAsync(filter: TicketListFilter = {}): Promise<TicketSummary[]> {
    return filterTickets(await this.canonicalRecords(), filter);
  }

  async graphAsync(): Promise<TicketGraphResult> {
    return this.canonicalGraph(await this.canonicalRecords());
  }

  async readTicketAsync(ref: string): Promise<TicketReadResult> {
    const ticketId = this.resolveTicketRef(ref);
    const records = await this.canonicalRecords();
    const record = records.find((entry) => entry.summary.id === ticketId);
    if (!record) {
      throw new Error(`Unknown ticket: ${ticketId}`);
    }
    return this.toCanonicalReadResult(record, this.canonicalSummaries(records), this.canonicalGraph(records));
  }

  private async prepareTicketWorkspaceProjectionSnapshot(
    options: TicketWorkspaceProjectionOptions = {},
  ): Promise<TicketWorkspaceProjectionSnapshot> {
    const recentWindowDays = normalizeTicketProjectionRecentWindowDays(options.recentWindowDays);
    const pinLabel = normalizeOptionalString(options.pinLabel) ?? TICKET_PROJECTION_PIN_LABEL;
    const { epochMs } = normalizeTicketProjectionClock(options.now);
    const recentCutoffMs = epochMs - recentWindowDays * 24 * 60 * 60 * 1000;
    const { storage, identity } = await this.openRepositoryWorkspaceStorage();
    const repository = identity.repository;
    if (!repository) {
      throw new Error(
        `Active scope for ${identity.space.id} is ambiguous; select a repository before repository-bound operations.`,
      );
    }

    const repositoryRoot = this.resolveLocalRepositoryRoot(identity);
    const workspace = ensureProjectionWorkspace(repositoryRoot, { enabledFamilies: ["tickets"] });
    const ticketFamily = workspace.families.find((family) => family.family === "tickets");
    if (!ticketFamily) {
      throw new Error("Projection workspace bootstrap did not enable the tickets family.");
    }

    const activePlanIds = new Set<string>();
    for (const planEntity of await storage.listEntities(identity.space.id, "plan")) {
      if (!hasStructuredPlanAttributes(planEntity.attributes)) {
        continue;
      }
      if (planEntity.attributes.state.status === "active" && planEntity.displayId) {
        activePlanIds.add(planEntity.displayId);
      }
    }

    const candidates: RepositoryTicketProjectionCandidate[] = [];
    for (const entity of await storage.listEntities(identity.space.id, ENTITY_KIND)) {
      if (entity.owningRepositoryId !== repository.id) {
        continue;
      }
      const ticketId = this.resolveTicketRef(entity.displayId ?? entity.id);
      if (!hasStructuredTicketAttributes(entity.attributes)) {
        throw new Error(`Ticket entity ${ticketId} is missing structured attributes`);
      }
      candidates.push({
        entityVersion: entity.version,
        record: this.entityRecord(entity, identity.repositories),
      });
    }

    const currentEntries = candidates
      .map((candidate) => {
        const membership = selectTicketProjectionReasons(candidate.record, activePlanIds, recentCutoffMs, pinLabel);
        const selection = {
          candidate,
          relativePath: ticketProjectionRelativePath(candidate.record.summary.id),
          inclusionReasons: membership.inclusionReasons,
          activePlanIds: membership.activePlanIds,
        } satisfies TicketProjectionSelection;
        return {
          record: candidate.record,
          selection,
          renderedContent: serializeTicket(candidate.record.ticket),
        } satisfies TicketWorkspaceProjectionCurrentEntry;
      })
      .filter((entry) => entry.selection.inclusionReasons.length > 0)
      .sort((left, right) => left.record.summary.id.localeCompare(right.record.summary.id));

    const manifest = createProjectionManifest(
      "tickets",
      currentEntries.map((entry) =>
        createTicketProjectionManifestEntry(entry.selection, entry.renderedContent, pinLabel),
      ),
      {
        retentionPolicy: {
          recentWindowDays,
          pinLabel,
          activePlanStatus: "active",
          openStatuses: ["open", "ready", "in_progress", "blocked", "review"],
          archivedTicketsProjected: false,
        },
      },
    );

    return {
      repositoryRoot,
      workspace,
      manifestPath: ticketFamily.manifestPath,
      recentWindowDays,
      pinLabel,
      currentEntries,
      manifest,
    };
  }

  async syncTicketWorkspaceProjectionAsync(
    options: TicketWorkspaceProjectionOptions = {},
  ): Promise<TicketWorkspaceProjectionSyncResult> {
    const snapshot = await this.prepareTicketWorkspaceProjectionSnapshot(options);
    const projected = snapshot.currentEntries.map((entry) => {
      const absolutePath = resolveProjectionFilePath(snapshot.repositoryRoot, "tickets", entry.selection.relativePath);
      const write = writeProjectionFile(absolutePath, entry.renderedContent);
      return {
        ticketId: entry.record.summary.id,
        relativePath: entry.selection.relativePath,
        inclusionReasons: entry.selection.inclusionReasons,
        activePlanIds: entry.selection.activePlanIds,
        write,
      } satisfies TicketWorkspaceProjectionRecord;
    });

    const previousManifest = readProjectionManifest(snapshot.manifestPath);
    const retainedRelativePaths = new Set(projected.map((entry) => entry.relativePath));
    const prunedRelativePaths =
      previousManifest?.entries
        .map((entry) => entry.relativePath)
        .filter((relativePath) => !retainedRelativePaths.has(relativePath))
        .sort((left, right) => left.localeCompare(right)) ?? [];
    for (const relativePath of prunedRelativePaths) {
      rmSync(resolveProjectionFilePath(snapshot.repositoryRoot, "tickets", relativePath), { force: true });
    }
    const manifestWrite = writeProjectionManifest(snapshot.manifestPath, snapshot.manifest);

    return {
      repositoryRoot: snapshot.repositoryRoot,
      manifestPath: snapshot.manifestPath,
      recentWindowDays: snapshot.recentWindowDays,
      pinLabel: snapshot.pinLabel,
      projected,
      prunedRelativePaths,
      manifest: manifestWrite,
      gitignore: snapshot.workspace.gitignore,
    };
  }

  async reconcileTicketWorkspaceProjectionsAsync(
    selectionInput: LoomProjectionSelectionInput = {},
    options: TicketWorkspaceProjectionOptions = {},
  ): Promise<TicketWorkspaceProjectionReconcileResult> {
    const selection = normalizeProjectionSelection(selectionInput);
    const snapshot = await this.prepareTicketWorkspaceProjectionSnapshot(options);
    const manifest = readProjectionManifest(snapshot.manifestPath);
    if (!manifest) {
      throw new Error("Projection family tickets has no manifest. Export it before reconciling.");
    }
    const manifestEntriesByPath = new Map(manifest.entries.map((entry) => [entry.relativePath, entry]));
    const clean: string[] = [];
    const planned: Array<{ current: TicketReadResult; parsed: TicketRecord }> = [];
    let matchedSelection = false;

    for (const entry of snapshot.currentEntries) {
      const currentEntry = createTicketProjectionManifestEntry(
        entry.selection,
        entry.renderedContent,
        snapshot.pinLabel,
      );
      if (!projectionEntryMatchesSelection("tickets", currentEntry, selection)) {
        continue;
      }
      matchedSelection = true;
      const manifestEntry = manifestEntriesByPath.get(currentEntry.relativePath);
      if (!manifestEntry) {
        throw new Error(
          `Projection tickets/${currentEntry.relativePath} is not exported. Refresh it before reconciling.`,
        );
      }
      const state = assessProjectionFileState(snapshot.repositoryRoot, "tickets", manifestEntry);
      if (state.kind === "missing") {
        throw new Error(`Projection tickets/${currentEntry.relativePath} is missing. Refresh it before reconciling.`);
      }
      if (state.kind !== "modified") {
        clean.push(`tickets/${currentEntry.relativePath}`);
        continue;
      }
      if (
        manifestEntry.revisionToken !== currentEntry.revisionToken ||
        manifestEntry.baseVersion !== currentEntry.baseVersion
      ) {
        throw new Error(`Projection tickets/${currentEntry.relativePath} is stale. Refresh it before reconciling.`);
      }
      const parsed = parseTicket(
        readFileSync(state.absolutePath, "utf-8"),
        `tickets/${currentEntry.relativePath}`,
        entry.record.ticket.closed,
      );
      if (parsed.frontmatter.id !== entry.record.summary.id) {
        throw new Error(
          `Projection tickets/${currentEntry.relativePath} must preserve ticket id ${entry.record.summary.id}.`,
        );
      }
      if (
        parsed.frontmatter["created-at"] !== entry.record.ticket.frontmatter["created-at"] ||
        parsed.frontmatter["updated-at"] !== entry.record.ticket.frontmatter["updated-at"]
      ) {
        throw new Error(
          `Projection tickets/${currentEntry.relativePath} does not allow editing created-at or updated-at.`,
        );
      }
      if (serializeTicket(parsed) === serializeTicket(entry.record.ticket)) {
        clean.push(`tickets/${currentEntry.relativePath}`);
        continue;
      }
      planned.push({ current: entry.record, parsed });
    }

    if (selection.hasSelection && !matchedSelection) {
      throw new Error("No ticket projections matched the requested selection.");
    }

    const updated: TicketReadResult[] = [];
    for (const item of planned) {
      const current = await this.readTicketAsync(item.current.summary.id);
      const parsed = item.parsed;
      const desiredStatus = parsed.frontmatter.status;
      const currentClosed = current.ticket.closed;
      const desiredClosed = desiredStatus === "closed";
      const hasNonStatusChanges =
        serializeTicket({
          frontmatter: { ...current.ticket.frontmatter, status: current.ticket.frontmatter.status },
          body: current.ticket.body,
        }) !==
        serializeTicket({
          frontmatter: { ...parsed.frontmatter, status: current.ticket.frontmatter.status },
          body: parsed.body,
        });

      if (currentClosed && desiredClosed && hasNonStatusChanges) {
        throw new Error(`Closed ticket ${current.summary.id} must be reopened before its projection can change.`);
      }

      if (currentClosed && !desiredClosed) {
        await this.reopenTicketAsync(current.summary.id, { allowDirtyProjectionWrite: true });
      }

      const updatePatch: UpdateTicketInput = {
        title: parsed.frontmatter.title,
        priority: parsed.frontmatter.priority,
        type: parsed.frontmatter.type,
        tags: parsed.frontmatter.tags,
        deps: parsed.frontmatter.deps,
        links: parsed.frontmatter.links,
        initiativeIds: parsed.frontmatter["initiative-ids"],
        researchIds: parsed.frontmatter["research-ids"],
        parent: parsed.frontmatter.parent,
        assignee: parsed.frontmatter.assignee,
        acceptance: parsed.frontmatter.acceptance,
        labels: parsed.frontmatter.labels,
        risk: parsed.frontmatter.risk,
        reviewStatus: parsed.frontmatter["review-status"],
        externalRefs: parsed.frontmatter["external-refs"],
        branchMode: parsed.frontmatter["branch-mode"],
        branchFamily: parsed.frontmatter["branch-family"],
        exactBranchName: parsed.frontmatter["exact-branch-name"],
        summary: parsed.body.summary,
        context: parsed.body.context,
        plan: parsed.body.plan,
        notes: parsed.body.notes,
        verification: parsed.body.verification,
        journalSummary: parsed.body.journalSummary,
      };
      if (desiredStatus !== "closed" && desiredStatus !== "in_progress") {
        updatePatch.status = desiredStatus;
      }

      let next = await this.updateTicketAsync(current.summary.id, updatePatch, { allowDirtyProjectionWrite: true });
      if (!currentClosed && desiredClosed) {
        next = await this.closeTicketAsync(current.summary.id, undefined, { allowDirtyProjectionWrite: true });
      } else if (desiredStatus === "in_progress" && next.ticket.frontmatter.status !== "in_progress") {
        next = await this.startTicketAsync(current.summary.id, { allowDirtyProjectionWrite: true });
      }
      updated.push(next);
    }

    return { updated, clean };
  }

  async createTicketAsync(input: CreateTicketInput): Promise<TicketReadResult> {
    this.initLedger();
    const timestamp = currentTimestamp();
    const { storage, identity } = await this.openRepositoryWorkspaceStorage();
    const existing = await this.canonicalRecords();
    const ticketPrefix = await this.resolveTicketDisplayPrefix(storage, identity);
    const ticketId = this.nextTicketId(existing, ticketPrefix);
    const branchIntent = normalizeTicketBranchIntent({
      branchMode: input.branchMode,
      branchFamily: input.branchFamily,
      exactBranchName: input.exactBranchName,
    });
    const ticketRecord: TicketRecord = {
      frontmatter: {
        id: ticketId,
        title: input.title.trim(),
        status: "open",
        priority: input.priority ?? "medium",
        type: input.type ?? "task",
        "created-at": timestamp,
        "updated-at": timestamp,
        tags: normalizeStringList(input.tags),
        deps: normalizeStringList(input.deps).map((dep) => this.resolveTicketRef(dep)),
        links: normalizeStringList(input.links),
        "initiative-ids": normalizeStringList(input.initiativeIds),
        "research-ids": normalizeStringList(input.researchIds),
        parent: normalizeOptionalString(input.parent) ? this.resolveTicketRef(input.parent as string) : null,
        assignee: normalizeOptionalString(input.assignee),
        acceptance: normalizeStringList(input.acceptance),
        labels: normalizeStringList(input.labels),
        risk: input.risk ?? "medium",
        "review-status": input.reviewStatus ?? "none",
        "external-refs": normalizeStringList(input.externalRefs),
        "branch-mode": branchIntent.branchMode,
        "branch-family": branchIntent.branchFamily,
        "exact-branch-name": branchIntent.exactBranchName,
      },
      body: createEmptyBody({
        summary: input.summary,
        context: input.context,
        plan: input.plan,
        notes: input.notes,
        verification: input.verification,
        journalSummary: input.journalSummary,
      }),
      closed: false,
      archived: false,
      archivedAt: null,
      ref: getTicketRef(ticketId),
    };
    const provisionalRecords = [
      ...existing,
      {
        ticket: ticketRecord,
        summary: {
          ...summarizeTicket(ticketRecord, "ready"),
          repository: resolveRepositoryQualifier([identity.repository], identity.repository.id),
        },
        journal: [],
        attachments: [],
        checkpoints: [],
        children: [],
        blockers: [],
      },
    ];
    this.validateRelationships(
      ticketId,
      ticketRecord.frontmatter.deps,
      ticketRecord.frontmatter.parent,
      this.canonicalSummaries(existing),
    );
    const journal = [
      createJournalEntry(
        ticketId,
        "state",
        `Created ticket ${ticketRecord.frontmatter.title}`,
        timestamp,
        { action: "create" },
        1,
      ),
    ];
    const result: TicketReadResult = {
      ticket: ticketRecord,
      summary: {
        ...summarizeTicket(ticketRecord, "ready"),
        repository: resolveRepositoryQualifier([identity.repository], identity.repository.id),
      },
      journal,
      attachments: [],
      checkpoints: [],
      children: [],
      blockers: [],
    };
    await this.upsertCanonicalRecord(result);
    return this.toCanonicalReadResult(
      result,
      this.canonicalSummaries(provisionalRecords),
      this.canonicalGraph(provisionalRecords),
    );
  }

  async updateTicketAsync(
    ref: string,
    updates: UpdateTicketInput,
    options: { allowDirtyProjectionWrite?: boolean } = {},
  ): Promise<TicketReadResult> {
    const current = await this.readTicketAsync(ref);
    const hasUpdates = Object.values(updates).some((value) => value !== undefined);
    if (current.ticket.closed && hasUpdates) {
      this.assertReopenedBeforeStructuralEdit(current, "be updated");
    }
    const timestamp = currentTimestamp();
    const record: TicketRecord = {
      ...current.ticket,
      frontmatter: { ...current.ticket.frontmatter },
      body: { ...current.ticket.body },
    };
    const nextBranchMode = updates.branchMode ?? record.frontmatter["branch-mode"];
    const nextBranchFamily =
      updates.branchFamily !== undefined
        ? updates.branchFamily
        : updates.branchMode === "none"
          ? null
          : record.frontmatter["branch-family"];
    const nextExactBranchName =
      updates.exactBranchName !== undefined
        ? updates.exactBranchName
        : updates.branchMode && updates.branchMode !== "exact"
          ? null
          : record.frontmatter["exact-branch-name"];
    if (updates.title !== undefined) record.frontmatter.title = updates.title.trim();
    if (updates.priority !== undefined) record.frontmatter.priority = updates.priority;
    if (updates.type !== undefined) record.frontmatter.type = updates.type;
    if (updates.tags !== undefined) record.frontmatter.tags = normalizeStringList(updates.tags);
    if (updates.deps !== undefined) record.frontmatter.deps = updates.deps.map((dep) => this.resolveTicketRef(dep));
    if (updates.links !== undefined) record.frontmatter.links = normalizeStringList(updates.links);
    if (updates.initiativeIds !== undefined)
      record.frontmatter["initiative-ids"] = normalizeStringList(updates.initiativeIds);
    if (updates.researchIds !== undefined)
      record.frontmatter["research-ids"] = normalizeStringList(updates.researchIds);
    if (updates.parent !== undefined)
      record.frontmatter.parent = normalizeOptionalString(updates.parent)
        ? this.resolveTicketRef(updates.parent as string)
        : null;
    if (updates.assignee !== undefined) record.frontmatter.assignee = normalizeOptionalString(updates.assignee);
    if (updates.acceptance !== undefined) record.frontmatter.acceptance = normalizeStringList(updates.acceptance);
    if (updates.labels !== undefined) record.frontmatter.labels = normalizeStringList(updates.labels);
    if (updates.risk !== undefined) record.frontmatter.risk = updates.risk;
    if (updates.reviewStatus !== undefined) record.frontmatter["review-status"] = updates.reviewStatus;
    if (updates.externalRefs !== undefined)
      record.frontmatter["external-refs"] = normalizeStringList(updates.externalRefs);
    const branchIntent = normalizeTicketBranchIntent({
      branchMode: nextBranchMode,
      branchFamily: nextBranchFamily,
      exactBranchName: nextExactBranchName,
    });
    record.frontmatter["branch-mode"] = branchIntent.branchMode;
    record.frontmatter["branch-family"] = branchIntent.branchFamily;
    record.frontmatter["exact-branch-name"] = branchIntent.exactBranchName;
    if (updates.status !== undefined) record.frontmatter.status = updates.status;
    if (updates.summary !== undefined) record.body.summary = updates.summary.trim();
    if (updates.context !== undefined) record.body.context = updates.context.trim();
    if (updates.plan !== undefined) record.body.plan = updates.plan.trim();
    if (updates.notes !== undefined) record.body.notes = updates.notes.trim();
    if (updates.verification !== undefined) record.body.verification = updates.verification.trim();
    if (updates.journalSummary !== undefined) record.body.journalSummary = updates.journalSummary.trim();
    const existingRecords = await this.canonicalRecords();
    this.validateRelationships(
      record.frontmatter.id,
      record.frontmatter.deps,
      record.frontmatter.parent,
      this.canonicalSummaries(existingRecords),
    );
    if (record.frontmatter.status !== "closed") {
      this.assertTransitionAllowed(
        record.frontmatter.id,
        record.frontmatter.deps,
        record.frontmatter.status,
        this.canonicalSummaries(existingRecords),
      );
    }
    record.frontmatter["updated-at"] = timestamp;
    const result: TicketReadResult = {
      ...current,
      ticket: record,
      summary: summarizeTicket(record, current.summary.status),
      journal: [
        ...current.journal,
        createJournalEntry(
          record.frontmatter.id,
          "state",
          "Updated ticket metadata",
          timestamp,
          { action: "update" },
          current.journal.length + 1,
        ),
      ],
    };
    await this.upsertCanonicalRecord(result, options);
    return this.readTicketAsync(record.frontmatter.id);
  }

  async archiveTicketAsync(ref: string): Promise<TicketReadResult> {
    const current = await this.readTicketAsync(ref);
    this.assertArchiveAllowed(current.ticket);
    if (current.ticket.archived) {
      return current;
    }
    const timestamp = currentTimestamp();
    current.ticket.archived = true;
    current.ticket.archivedAt = timestamp;
    current.ticket.frontmatter["updated-at"] = timestamp;
    current.journal = [
      ...current.journal,
      createJournalEntry(
        current.summary.id,
        "state",
        "Archived ticket",
        timestamp,
        { action: "archive" },
        current.journal.length + 1,
      ),
    ];
    await this.upsertCanonicalRecord(current);
    return this.readTicketAsync(current.summary.id);
  }

  async deleteTicketAsync(ref: string): Promise<DeleteTicketResult> {
    const ticketId = this.resolveTicketRef(ref);

    const timestamp = currentTimestamp();
    const records = await this.canonicalRecords();
    const target = records.find((record) => record.summary.id === ticketId);
    if (!target) {
      throw new Error(`Unknown ticket: ${ticketId}`);
    }

    const remainingRecords = records.filter((record) => record.summary.id !== ticketId);
    const affected = new Map<string, TicketReadResult>();
    for (const record of remainingRecords) {
      const nextDeps = record.ticket.frontmatter.deps.filter((dependency) => dependency !== ticketId);
      const nextParent = record.ticket.frontmatter.parent === ticketId ? null : record.ticket.frontmatter.parent;
      if (
        nextDeps.length === record.ticket.frontmatter.deps.length &&
        nextParent === record.ticket.frontmatter.parent
      ) {
        continue;
      }
      const updatedRecord: TicketReadResult = {
        ...record,
        ticket: {
          ...record.ticket,
          frontmatter: {
            ...record.ticket.frontmatter,
            deps: nextDeps,
            parent: nextParent,
            "updated-at": timestamp,
          },
        },
        journal: [
          ...record.journal,
          createJournalEntry(
            record.summary.id,
            "state",
            `Removed deleted ticket ${ticketId} from ticket relationships`,
            timestamp,
            { action: "delete", deletedTicketId: ticketId },
            record.journal.length + 1,
          ),
        ],
      };
      affected.set(record.summary.id, updatedRecord);
    }

    const canonicalRemaining = remainingRecords.map((record) => affected.get(record.summary.id) ?? record);
    const summaries = this.canonicalSummaries(canonicalRemaining);
    const graph = this.canonicalGraph(canonicalRemaining);
    const canonicalAffected = [...affected.values()].map((record) =>
      this.toCanonicalReadResult(record, summaries, graph),
    );

    const { storage, identity } = await this.openWorkspaceStorage();
    await storage.transact(async (tx) => {
      const targetEntity = await findEntityByDisplayId(tx, identity.space.id, ENTITY_KIND, ticketId);
      if (!targetEntity) {
        throw new Error(`Unknown ticket: ${ticketId}`);
      }
      for (const planEntity of await tx.listEntities(identity.space.id, "plan")) {
        if (!hasStructuredPlanAttributes(planEntity.attributes)) {
          continue;
        }
        const state = planEntity.attributes.state;
        const linkedTicketIds = state.linkedTickets.map((link) => link.ticketId);
        const contextTicketIds = state.contextRefs.ticketIds;
        if (!linkedTicketIds.includes(ticketId) && !contextTicketIds.includes(ticketId)) {
          continue;
        }
        const nextState: PlanState = {
          ...state,
          linkedTickets: state.linkedTickets.filter((link) => link.ticketId !== ticketId),
          contextRefs: {
            ...state.contextRefs,
            ticketIds: state.contextRefs.ticketIds.filter((id) => id !== ticketId),
          },
          revisionNotes: [
            ...state.revisionNotes,
            {
              timestamp,
              change: `Removed deleted ticket ${ticketId} from plan references.`,
              reason: "Deleted tickets cannot remain active plan membership or context references.",
            },
          ],
          updatedAt: timestamp,
        };
        await tx.upsertEntity({
          ...planEntity,
          title: nextState.title,
          summary: nextState.summary,
          status: nextState.status,
          version: planEntity.version + 1,
          attributes: { state: nextState },
          updatedAt: nextState.updatedAt,
        });
        await tx.removeLink(createLinkId("belongs_to", planEntity.id, targetEntity.id));
        await tx.removeLink(createLinkId("references", planEntity.id, targetEntity.id));
      }
      for (const record of canonicalAffected) {
        await this.upsertCanonicalRecordWithStorage(tx, identity, record);
      }
      await tx.removeEntity(targetEntity.id);
    });

    if (hasExportedProjectionFamily(this.cwd, "tickets")) {
      await this.syncTicketWorkspaceProjectionAsync();
    }

    return {
      action: "delete",
      deletedTicketId: ticketId,
      affectedTicketIds: canonicalAffected
        .map((record) => record.summary.id)
        .sort((left, right) => left.localeCompare(right)),
    };
  }

  async startTicketAsync(
    ref: string,
    options: { allowDirtyProjectionWrite?: boolean } = {},
  ): Promise<TicketReadResult> {
    const current = await this.readTicketAsync(ref);
    this.assertReopenedBeforeStructuralEdit(current, "be started");
    this.assertTransitionAllowed(
      current.summary.id,
      current.ticket.frontmatter.deps,
      "in_progress",
      this.canonicalSummaries(await this.canonicalRecords()),
    );
    const timestamp = currentTimestamp();
    current.ticket.frontmatter.status = "in_progress";
    current.ticket.frontmatter["updated-at"] = timestamp;
    current.journal = [
      ...current.journal,
      createJournalEntry(
        current.summary.id,
        "state",
        "Started work",
        timestamp,
        { status: "in_progress" },
        current.journal.length + 1,
      ),
    ];
    await this.upsertCanonicalRecord(current, options);
    return this.readTicketAsync(current.summary.id);
  }

  async closeTicketAsync(
    ref: string,
    verificationNote?: string,
    options: { allowDirtyProjectionWrite?: boolean } = {},
  ): Promise<TicketReadResult> {
    const current = await this.readTicketAsync(ref);
    const timestamp = currentTimestamp();
    current.ticket.frontmatter.status = "closed";
    current.ticket.frontmatter["updated-at"] = timestamp;
    current.ticket.closed = true;
    if (verificationNote?.trim()) {
      current.ticket.body.verification = [current.ticket.body.verification, verificationNote.trim()]
        .filter(Boolean)
        .join("\n\n");
    }
    current.journal = [
      ...current.journal,
      createJournalEntry(
        current.summary.id,
        "verification",
        verificationNote?.trim() || "Closed ticket",
        timestamp,
        { action: "close" },
        current.journal.length + 1,
      ),
    ];
    await this.upsertCanonicalRecord(current, options);
    return this.readTicketAsync(current.summary.id);
  }

  async reopenTicketAsync(
    ref: string,
    options: { allowDirtyProjectionWrite?: boolean } = {},
  ): Promise<TicketReadResult> {
    const current = await this.readTicketAsync(ref);
    if (!current.ticket.closed) {
      throw new Error(`Ticket ${current.summary.id} is not closed.`);
    }
    const timestamp = currentTimestamp();
    current.ticket.frontmatter.status = "open";
    current.ticket.frontmatter["updated-at"] = timestamp;
    current.ticket.closed = false;
    current.journal = [
      ...current.journal,
      createJournalEntry(
        current.summary.id,
        "state",
        "Reopened ticket",
        timestamp,
        { action: "reopen", status: "open" },
        current.journal.length + 1,
      ),
    ];
    await this.upsertCanonicalRecord(current, options);
    return this.readTicketAsync(current.summary.id);
  }

  async addNoteAsync(ref: string, text: string): Promise<TicketReadResult> {
    const current = await this.readTicketAsync(ref);
    const timestamp = currentTimestamp();
    const note = `- ${timestamp} ${text.trim()}`;
    current.ticket.body.notes = [current.ticket.body.notes, note].filter(Boolean).join("\n");
    current.ticket.frontmatter["updated-at"] = timestamp;
    current.journal = [
      ...current.journal,
      createJournalEntry(current.summary.id, "note", text.trim(), timestamp, {}, current.journal.length + 1),
    ];
    await this.upsertCanonicalRecord(current);
    return this.readTicketAsync(current.summary.id);
  }

  async addJournalEntryAsync(
    ref: string,
    kind: JournalKind,
    text: string,
    metadata: Record<string, unknown> = {},
  ): Promise<TicketReadResult> {
    const { storage, identity } = await this.openWorkspaceStorage();
    const result = await storage.transact((tx) =>
      this.addJournalEntryWithStorage(tx, identity, ref, kind, text, metadata),
    );
    if (hasExportedProjectionFamily(this.cwd, "tickets")) {
      await this.syncTicketWorkspaceProjectionAsync();
    }
    return result;
  }

  async addJournalEntryWithStorage(
    storage: LoomCanonicalStorage,
    identity: WorkspaceIdentity,
    ref: string,
    kind: JournalKind,
    text: string,
    metadata: Record<string, unknown> = {},
  ): Promise<TicketReadResult> {
    const current = await this.readTicketAsync(ref);
    const timestamp = currentTimestamp();
    current.ticket.frontmatter["updated-at"] = timestamp;
    current.journal = [
      ...current.journal,
      createJournalEntry(current.summary.id, kind, text.trim(), timestamp, metadata, current.journal.length + 1),
    ];
    await this.upsertCanonicalRecordWithStorage(storage, identity, current);
    return this.readTicketAsync(current.summary.id);
  }

  async addDependencyAsync(ref: string, depRef: string): Promise<TicketReadResult> {
    const current = await this.readTicketAsync(ref);
    const depId = this.resolveTicketRef(depRef);
    if (current.ticket.frontmatter.deps.includes(depId)) {
      return current;
    }
    this.assertReopenedBeforeStructuralEdit(current, "add dependencies");
    this.validateRelationships(
      current.summary.id,
      [...current.ticket.frontmatter.deps, depId],
      current.ticket.frontmatter.parent,
      this.canonicalSummaries(await this.canonicalRecords()),
    );
    const timestamp = currentTimestamp();
    current.ticket.frontmatter.deps = normalizeStringList([...current.ticket.frontmatter.deps, depId]);
    current.ticket.frontmatter["updated-at"] = timestamp;
    current.journal = [
      ...current.journal,
      createJournalEntry(
        current.summary.id,
        "state",
        `Added dependency on ${depId}`,
        timestamp,
        { dependency: depId },
        current.journal.length + 1,
      ),
    ];
    await this.upsertCanonicalRecord(current);
    return this.readTicketAsync(current.summary.id);
  }

  async removeDependencyAsync(ref: string, depRef: string): Promise<TicketReadResult> {
    const current = await this.readTicketAsync(ref);
    const depId = this.resolveTicketRef(depRef);
    if (!current.ticket.frontmatter.deps.includes(depId)) {
      return current;
    }
    this.assertReopenedBeforeStructuralEdit(current, "remove dependencies");
    const timestamp = currentTimestamp();
    current.ticket.frontmatter.deps = current.ticket.frontmatter.deps.filter((dependency) => dependency !== depId);
    current.ticket.frontmatter["updated-at"] = timestamp;
    current.journal = [
      ...current.journal,
      createJournalEntry(
        current.summary.id,
        "state",
        `Removed dependency on ${depId}`,
        timestamp,
        { dependency: depId },
        current.journal.length + 1,
      ),
    ];
    await this.upsertCanonicalRecord(current);
    return this.readTicketAsync(current.summary.id);
  }

  async attachArtifactAsync(ref: string, input: AttachArtifactInput): Promise<TicketReadResult> {
    const current = await this.readTicketAsync(ref);
    const timestamp = currentTimestamp();
    const mediaType = inferMediaType(input.path, input.mediaType);
    if (!input.path?.trim() && input.content === undefined) {
      throw new Error("Attachment requires either path or content");
    }
    let inlineContentBase64: string | null = null;
    const attachmentId = `attachment-${String(current.attachments.length + 1).padStart(4, "0")}`;
    let sourceRef: string | null = null;
    let sourcePath: QualifiedRepositoryPath | null = null;
    if (input.path?.trim()) {
      const resolvedSource = await this.resolveAttachmentSource(input.path);
      const absoluteSource = resolvedSource.absoluteSource;
      sourcePath = resolvedSource.sourcePath;
      sourceRef = getAttachmentSourceRef(current.summary.id, attachmentId, basename(absoluteSource));
      inlineContentBase64 = readFileSync(absoluteSource).toString("base64");
    } else if (input.content !== undefined) {
      sourceRef = getAttachmentSourceRef(current.summary.id, attachmentId, "inline");
      inlineContentBase64 = Buffer.from(input.content, "utf-8").toString("base64");
    }
    const attachment: AttachmentRecord = {
      id: attachmentId,
      ticketId: current.summary.id,
      createdAt: timestamp,
      label: input.label.trim(),
      mediaType,
      artifactRef: null,
      sourceRef,
      description: input.description?.trim() ?? "",
      metadata: {
        ...(input.metadata ?? {}),
        sourcePath,
        inlineContentBase64,
        inlineEncoding: inlineContentBase64 ? "base64" : null,
        inlineSourceType: input.content !== undefined ? "text" : sourceRef ? "filesystem" : null,
        sourceName: input.path?.trim()
          ? basename(input.path.trim().startsWith("@") ? input.path.trim().slice(1) : input.path.trim())
          : null,
      },
    };
    current.attachments = [...current.attachments, attachment];
    current.ticket.frontmatter["updated-at"] = timestamp;
    current.journal = [
      ...current.journal,
      createJournalEntry(
        current.summary.id,
        "attachment",
        `Attached ${attachment.label}`,
        timestamp,
        { artifactRef: attachment.artifactRef, sourceRef: attachment.sourceRef },
        current.journal.length + 1,
      ),
    ];
    await this.upsertCanonicalRecord(current);
    return this.readTicketAsync(current.summary.id);
  }

  async recordCheckpointAsync(ref: string, input: CreateCheckpointInput): Promise<TicketReadResult> {
    const current = await this.readTicketAsync(ref);
    const timestamp = currentTimestamp();
    const checkpointId = this.nextCheckpointId(await this.canonicalRecords());
    const checkpoint: CheckpointRecord = {
      id: checkpointId,
      ticketId: current.summary.id,
      title: input.title.trim(),
      createdAt: timestamp,
      body: input.body.trim(),
      checkpointRef: getCheckpointRef(checkpointId),
      supersedes: input.supersedes ?? null,
    };
    current.checkpoints = [...current.checkpoints, checkpoint];
    current.ticket.frontmatter["updated-at"] = timestamp;
    current.journal = [
      ...current.journal,
      createJournalEntry(
        current.summary.id,
        "checkpoint",
        `Recorded checkpoint ${checkpointId}`,
        timestamp,
        { checkpointId },
        current.journal.length + 1,
      ),
    ];
    await this.upsertCanonicalRecord(current);
    return this.readTicketAsync(current.summary.id);
  }

  async setInitiativeIdsAsync(
    ref: string,
    initiativeIds: string[],
    options: { allowClosed?: boolean } = {},
  ): Promise<TicketReadResult> {
    const current = await this.readTicketAsync(ref);
    const normalizedInitiativeIds = normalizeStringList(initiativeIds);
    if (
      normalizedInitiativeIds.length === current.ticket.frontmatter["initiative-ids"].length &&
      normalizedInitiativeIds.every((value, index) => value === current.ticket.frontmatter["initiative-ids"][index])
    ) {
      return current;
    }
    if (!options.allowClosed) {
      this.assertReopenedBeforeStructuralEdit(current, "change initiative links");
    }
    const timestamp = currentTimestamp();
    current.ticket.frontmatter["initiative-ids"] = normalizedInitiativeIds;
    current.ticket.frontmatter["updated-at"] = timestamp;
    current.journal = [
      ...current.journal,
      createJournalEntry(
        current.summary.id,
        "state",
        "Updated ticket initiative links",
        timestamp,
        { initiativeIds },
        current.journal.length + 1,
      ),
    ];
    await this.upsertCanonicalRecord(current);
    return this.readTicketAsync(current.summary.id);
  }

  async setResearchIdsAsync(
    ref: string,
    researchIds: string[],
    options: { allowClosed?: boolean } = {},
  ): Promise<TicketReadResult> {
    const current = await this.readTicketAsync(ref);
    const normalizedResearchIds = normalizeStringList(researchIds);
    if (
      normalizedResearchIds.length === current.ticket.frontmatter["research-ids"].length &&
      normalizedResearchIds.every((value, index) => value === current.ticket.frontmatter["research-ids"][index])
    ) {
      return current;
    }
    if (!options.allowClosed) {
      this.assertReopenedBeforeStructuralEdit(current, "change research links");
    }
    const timestamp = currentTimestamp();
    current.ticket.frontmatter["research-ids"] = normalizedResearchIds;
    current.ticket.frontmatter["updated-at"] = timestamp;
    current.journal = [
      ...current.journal,
      createJournalEntry(
        current.summary.id,
        "state",
        "Updated ticket research links",
        timestamp,
        { researchIds },
        current.journal.length + 1,
      ),
    ];
    await this.upsertCanonicalRecord(current);
    return this.readTicketAsync(current.summary.id);
  }

  async addExternalRefAsync(
    ref: string,
    externalRef: string,
    options: { allowClosed?: boolean } = {},
  ): Promise<TicketReadResult> {
    const { storage, identity } = await this.openWorkspaceStorage();
    const updated = await storage.transact((tx) =>
      this.syncExternalRefWithStorage(tx, identity, ref, externalRef, true, options),
    );
    if (hasExportedProjectionFamily(this.cwd, "tickets")) {
      await this.syncTicketWorkspaceProjectionAsync();
    }
    return this.readTicketAsync(updated.summary.id);
  }

  async removeExternalRefAsync(
    ref: string,
    externalRef: string,
    options: { allowClosed?: boolean } = {},
  ): Promise<TicketReadResult> {
    const { storage, identity } = await this.openWorkspaceStorage();
    const updated = await storage.transact((tx) =>
      this.syncExternalRefWithStorage(tx, identity, ref, externalRef, false, options),
    );
    if (hasExportedProjectionFamily(this.cwd, "tickets")) {
      await this.syncTicketWorkspaceProjectionAsync();
    }
    return this.readTicketAsync(updated.summary.id);
  }
}

export function createTicketStore(cwd: string, scope: LoomExplicitScopeInput = {}): TicketStore {
  return new TicketStore(cwd, scope);
}
