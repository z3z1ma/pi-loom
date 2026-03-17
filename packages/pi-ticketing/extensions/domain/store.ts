import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import {
  findEntityByDisplayId,
  upsertEntityByDisplayId,
  upsertProjectionForEntity,
} from "@pi-loom/pi-storage/storage/entities.js";
import { openWorkspaceStorage } from "@pi-loom/pi-storage/storage/workspace.js";
import { inferMediaType, readAttachments } from "./attachments.js";
import {
  parseCheckpoint,
  readCheckpointIdsFromRecord,
  readCheckpointIndex,
  serializeCheckpoint,
  withCheckpointPath,
} from "./checkpoints.js";
import { createEmptyBody, parseTicket, serializeTicket } from "./frontmatter.js";
import { buildTicketGraph, findDependencyCycle, summarizeTicket } from "./graph.js";
import { createJournalEntry, readJournalEntries } from "./journal.js";
import type {
  AttachArtifactInput,
  AttachmentRecord,
  AuditRecord,
  CheckpointRecord,
  CreateCheckpointInput,
  CreateTicketInput,
  JournalEntry,
  JournalKind,
  TicketGraphResult,
  TicketListFilter,
  TicketReadResult,
  TicketRecord,
  TicketSummary,
  UpdateTicketInput,
} from "./models.js";
import { currentTimestamp, normalizeOptionalString, normalizeStringList, normalizeTicketRef } from "./normalize.js";
import {
  getArtifactPath,
  getAttachmentsIndexPath,
  getAuditPath,
  getCheckpointIndexPath,
  getCheckpointPath,
  getJournalPath,
  getLedgerPaths,
  getTicketPath,
} from "./paths.js";
import { filterTickets, summarizeTickets } from "./query.js";

const ENTITY_KIND = "ticket" as const;

interface TicketEntityAttributes {
  record: TicketReadResult;
}

interface FilesystemImportedEntityAttributes {
  importedFrom?: string;
  filesByPath?: Record<string, string>;
}

function hasStructuredTicketAttributes(attributes: unknown): attributes is TicketEntityAttributes {
  return Boolean(attributes && typeof attributes === "object" && "record" in attributes);
}

function hasFilesystemImportedTicketAttributes(attributes: unknown): attributes is FilesystemImportedEntityAttributes {
  return Boolean(attributes && typeof attributes === "object" && "filesByPath" in attributes);
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function writeFileAtomic(path: string, content: string): void {
  ensureDir(dirname(path));
  const tempPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tempPath, content, "utf-8");
  renameSync(tempPath, path);
}

function writeJson(path: string, value: unknown): void {
  writeFileAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

function nextNumericId(existingIds: string[], prefix: string): string {
  const max = existingIds.reduce((currentMax, currentId) => {
    const numeric = Number.parseInt(currentId.replace(`${prefix}-`, ""), 10);
    return Number.isFinite(numeric) ? Math.max(currentMax, numeric) : currentMax;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

function mediaTypeExtension(mediaType: string): string {
  switch (mediaType) {
    case "text/plain":
      return ".txt";
    case "text/markdown":
      return ".md";
    case "application/json":
      return ".json";
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpg";
    case "application/pdf":
      return ".pdf";
    default:
      return ".bin";
  }
}

function parseJsonText<T>(content: string): T {
  return JSON.parse(content) as T;
}

function parseJournalEntriesText(ticketId: string, content: string): JournalEntry[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const entries: JournalEntry[] = [];
  for (const line of lines) {
    const parsed = JSON.parse(line) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      continue;
    }
    const record = parsed as Record<string, unknown>;
    entries.push({
      id: typeof record.id === "string" ? record.id : `${ticketId}-journal-unknown`,
      ticketId: typeof record.ticketId === "string" ? record.ticketId : ticketId,
      createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date(0).toISOString(),
      kind: typeof record.kind === "string" ? (record.kind as JournalKind) : "note",
      text: typeof record.text === "string" ? record.text : "",
      metadata:
        record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
          ? (record.metadata as Record<string, unknown>)
          : {},
    });
  }
  return entries.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function parseAttachmentsText(ticketId: string, content: string): AttachmentRecord[] {
  const parsed = parseJsonText<unknown>(content);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object" && !Array.isArray(entry)))
    .map((entry) => ({
      id: typeof entry.id === "string" ? entry.id : "",
      ticketId: typeof entry.ticketId === "string" ? entry.ticketId : ticketId,
      createdAt: typeof entry.createdAt === "string" ? entry.createdAt : new Date(0).toISOString(),
      label: typeof entry.label === "string" ? entry.label : "artifact",
      mediaType: typeof entry.mediaType === "string" ? entry.mediaType : "application/octet-stream",
      artifactPath: typeof entry.artifactPath === "string" ? entry.artifactPath : null,
      sourcePath: typeof entry.sourcePath === "string" ? entry.sourcePath : null,
      description: typeof entry.description === "string" ? entry.description : "",
      metadata:
        entry.metadata && typeof entry.metadata === "object" && !Array.isArray(entry.metadata)
          ? (entry.metadata as Record<string, unknown>)
          : {},
    }))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function relativeOrAbsolute(cwd: string, filePath: string): string {
  if (!isAbsolute(filePath)) {
    return filePath;
  }
  const relativePath = relative(cwd, filePath);
  return relativePath || filePath;
}

export class TicketStore {
  readonly cwd: string;

  constructor(cwd: string) {
    this.cwd = resolve(cwd);
  }

  initLedger(): { initialized: true; root: string } {
    const paths = getLedgerPaths(this.cwd);
    ensureDir(paths.ticketsDir);
    ensureDir(paths.closedTicketsDir);
    ensureDir(paths.auditDir);
    ensureDir(paths.checkpointsDir);
    ensureDir(paths.artifactsDir);
    return { initialized: true, root: paths.loomDir };
  }

  private async upsertCanonicalRecord(record: TicketReadResult): Promise<TicketReadResult> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const existing = await findEntityByDisplayId(storage, identity.space.id, ENTITY_KIND, record.summary.id);
    const version = (existing?.version ?? 0) + 1;
    const entity = await upsertEntityByDisplayId(storage, {
      kind: ENTITY_KIND,
      spaceId: identity.space.id,
      owningRepositoryId: identity.repository.id,
      displayId: record.summary.id,
      title: record.summary.title,
      summary: record.ticket.body.summary,
      status: record.summary.status,
      version,
      tags: record.ticket.frontmatter.tags,
      pathScopes: [
        { repositoryId: identity.repository.id, relativePath: record.summary.path, role: "canonical" },
        {
          repositoryId: identity.repository.id,
          relativePath: relativeOrAbsolute(this.cwd, getJournalPath(this.cwd, record.summary.id)),
          role: "projection",
        },
      ],
      attributes: { record },
      createdAt: existing?.createdAt ?? record.summary.createdAt,
      updatedAt: record.summary.updatedAt,
    });
    const ticketPath = resolve(this.cwd, record.summary.path);
    if (existsSync(ticketPath)) {
      await upsertProjectionForEntity(
        storage,
        entity.id,
        "ticket_markdown_projection",
        "repo_materialized",
        identity.repository.id,
        record.summary.path,
        readFileSync(ticketPath, "utf-8"),
        version,
        record.summary.createdAt,
        record.summary.updatedAt,
      );
    }
    return record;
  }

  private entityRecord(entity: { attributes: unknown }): TicketReadResult {
    return (entity.attributes as TicketEntityAttributes).record;
  }

  private readImportedEntityRecord(ticketId: string, attributes: unknown): TicketReadResult | null {
    if (!hasFilesystemImportedTicketAttributes(attributes) || !attributes.filesByPath) {
      return null;
    }
    const openPath = relativeOrAbsolute(this.cwd, getTicketPath(this.cwd, ticketId, false));
    const closedPath = relativeOrAbsolute(this.cwd, getTicketPath(this.cwd, ticketId, true));
    const ticketPath = openPath in attributes.filesByPath ? openPath : closedPath in attributes.filesByPath ? closedPath : null;
    if (!ticketPath) {
      return null;
    }
    const ticket = parseTicket(attributes.filesByPath[ticketPath], ticketPath, ticketPath === closedPath);
    const journalPath = relativeOrAbsolute(this.cwd, getJournalPath(this.cwd, ticketId));
    const attachmentsPath = relativeOrAbsolute(this.cwd, getAttachmentsIndexPath(this.cwd, ticketId));
    const checkpointIndexPath = relativeOrAbsolute(this.cwd, getCheckpointIndexPath(this.cwd, ticketId));
    const checkpointIds = readCheckpointIdsFromRecord(parseJsonText<unknown>(attributes.filesByPath[checkpointIndexPath] ?? "[]"));
    const checkpoints = checkpointIds.flatMap((checkpointId) => {
      const checkpointPath = relativeOrAbsolute(this.cwd, getCheckpointPath(this.cwd, checkpointId));
      const checkpointText =
        attributes.filesByPath?.[checkpointPath] ??
        (existsSync(resolve(this.cwd, checkpointPath)) ? readFileSync(resolve(this.cwd, checkpointPath), "utf-8") : null);
      return checkpointText ? [withCheckpointPath(parseCheckpoint(checkpointText, checkpointPath), checkpointPath)] : [];
    });
    return {
      ticket,
      summary: summarizeTicket(ticket, ticket.closed ? "closed" : ticket.frontmatter.status),
      journal: parseJournalEntriesText(ticketId, attributes.filesByPath[journalPath] ?? ""),
      attachments: parseAttachmentsText(ticketId, attributes.filesByPath[attachmentsPath] ?? "[]"),
      checkpoints,
      children: [],
      blockers: [],
    };
  }

  private async repairTicketToCanonical(ticketId: string, attributes?: unknown): Promise<TicketReadResult> {
    const imported = this.readImportedEntityRecord(ticketId, attributes);
    if (imported) {
      return this.upsertCanonicalRecord(imported);
    }
    const openPath = getTicketPath(this.cwd, ticketId, false);
    const closedPath = getTicketPath(this.cwd, ticketId, true);
    if (existsSync(openPath) || existsSync(closedPath)) {
      return this.upsertCanonicalRecord(this.readTicketProjection(ticketId));
    }
    throw new Error(`Ticket entity ${ticketId} is missing structured attributes`);
  }

  private materializeCanonicalRecord(record: TicketReadResult): void {
    this.initLedger();
    const ticketId = record.summary.id;
    const targetPath = resolve(this.cwd, record.ticket.path);
    const openPath = getTicketPath(this.cwd, ticketId, false);
    const closedPath = getTicketPath(this.cwd, ticketId, true);
    this.writeTicket({ ...record.ticket, path: targetPath });
    if (record.ticket.closed) {
      rmSync(openPath, { force: true });
    } else {
      rmSync(closedPath, { force: true });
    }
    writeFileAtomic(
      getJournalPath(this.cwd, ticketId),
      `${record.journal.map((entry) => JSON.stringify(entry)).join("\n")}${record.journal.length > 0 ? "\n" : ""}`,
    );
    this.writeAttachments(ticketId, record.attachments);
    this.writeCheckpointIndex(
      ticketId,
      record.checkpoints.map((checkpoint) => checkpoint.id),
    );
    for (const checkpoint of record.checkpoints) {
      writeFileAtomic(
        resolve(this.cwd, checkpoint.path),
        serializeCheckpoint({ ...checkpoint, path: resolve(this.cwd, checkpoint.path) }),
      );
    }
  }

  private canonicalSummaries(records: TicketReadResult[]): TicketSummary[] {
    return summarizeTickets(records.map((record) => record.ticket));
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
    return {
      ...record,
      summary: this.toOutputSummary(summary),
      ticket: this.toOutputTicket({ ...record.ticket, path: resolve(this.cwd, record.ticket.path) }),
      checkpoints: record.checkpoints.map((checkpoint) =>
        this.toOutputCheckpoint({ ...checkpoint, path: resolve(this.cwd, checkpoint.path) }),
      ),
      children: graph.nodes[record.summary.id]?.children ?? [],
      blockers: graph.nodes[record.summary.id]?.blockedBy ?? [],
    };
  }

  private async canonicalRecords(): Promise<TicketReadResult[]> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const records = new Map<string, TicketReadResult>();
    for (const entity of await storage.listEntities(identity.space.id, ENTITY_KIND)) {
      const ticketId = this.resolveTicketRef(entity.displayId);
      const record = hasStructuredTicketAttributes(entity.attributes)
        ? this.entityRecord(entity)
        : await this.repairTicketToCanonical(ticketId, entity.attributes);
      records.set(ticketId, record);
    }
    return [...records.values()].sort((left, right) => left.summary.id.localeCompare(right.summary.id));
  }

  private readTicketFile(path: string, closed: boolean): TicketRecord {
    return parseTicket(readFileSync(path, "utf-8"), path, closed);
  }

  private ticketFilePaths(closed: boolean): string[] {
    const directory = closed ? getLedgerPaths(this.cwd).closedTicketsDir : getLedgerPaths(this.cwd).ticketsDir;
    if (!existsSync(directory)) {
      return [];
    }
    return readdirSync(directory)
      .filter((entry) => entry.endsWith(".md"))
      .filter((entry) => !entry.endsWith(".snapshot.md"))
      .map((entry) => join(directory, entry))
      .sort((left, right) => basename(left).localeCompare(basename(right)));
  }

  loadAllTickets(): TicketRecord[] {
    this.initLedger();
    return [
      ...this.ticketFilePaths(false).map((path) => this.readTicketFile(path, false)),
      ...this.ticketFilePaths(true).map((path) => this.readTicketFile(path, true)),
    ].sort((left, right) => left.frontmatter.id.localeCompare(right.frontmatter.id));
  }

  private loadTicketById(ticketId: string): TicketRecord {
    for (const record of this.loadAllTickets()) {
      if (record.frontmatter.id === ticketId) {
        return record;
      }
    }
    throw new Error(`Unknown ticket: ${ticketId}`);
  }

  resolveTicketRef(ref: string): string {
    return normalizeTicketRef(ref);
  }

  private nextTicketId(): string {
    return nextNumericId(
      this.loadAllTickets().map((ticket) => ticket.frontmatter.id),
      "t",
    );
  }

  private nextCheckpointId(): string {
    const paths = getLedgerPaths(this.cwd);
    if (!existsSync(paths.checkpointsDir)) {
      return "cp-0001";
    }
    const ids = readdirSync(paths.checkpointsDir)
      .filter((entry) => entry.endsWith(".md"))
      .map((entry) => entry.slice(0, -3));
    return nextNumericId(ids, "cp");
  }

  private nextArtifactId(): string {
    const paths = getLedgerPaths(this.cwd);
    if (!existsSync(paths.artifactsDir)) {
      return "artifact-0001";
    }
    const ids = readdirSync(paths.artifactsDir).map((entry) => entry.replace(/\.[^.]+$/, ""));
    return nextNumericId(ids, "artifact");
  }

  private writeTicket(record: TicketRecord): void {
    writeFileAtomic(record.path, serializeTicket(record));
  }

  private appendJournal(
    ticketId: string,
    kind: JournalKind,
    text: string,
    createdAt: string,
    metadata: Record<string, unknown>,
  ): void {
    this.initLedger();
    const journalPath = getJournalPath(this.cwd, ticketId);
    const existing = readJournalEntries(this.cwd, ticketId);
    const entry = createJournalEntry(ticketId, kind, text, createdAt, metadata, existing.length + 1);
    appendFileSync(journalPath, `${JSON.stringify(entry)}\n`, "utf-8");
  }

  private appendAudit(
    action: string,
    ticketId: string | null,
    createdAt: string,
    payload: Record<string, unknown>,
  ): void {
    this.initLedger();
    const auditPath = getAuditPath(this.cwd, createdAt.slice(0, 10));
    const record: AuditRecord = {
      id: `${createdAt}-${action}`,
      createdAt,
      action,
      ticketId,
      payload,
    };
    appendFileSync(auditPath, `${JSON.stringify(record)}\n`, "utf-8");
  }

  private writeAttachments(ticketId: string, attachments: AttachmentRecord[]): void {
    writeJson(getAttachmentsIndexPath(this.cwd, ticketId), attachments);
  }

  private writeCheckpointIndex(ticketId: string, checkpointIds: string[]): void {
    writeJson(getCheckpointIndexPath(this.cwd, ticketId), checkpointIds);
  }

  private toOutputTicket(record: TicketRecord): TicketRecord {
    return {
      ...record,
      path: relativeOrAbsolute(this.cwd, record.path),
    };
  }

  private toOutputSummary(summary: TicketSummary): TicketSummary {
    return {
      ...summary,
      path: relativeOrAbsolute(this.cwd, summary.path),
    };
  }

  private toOutputCheckpoint(checkpoint: CheckpointRecord): CheckpointRecord {
    return withCheckpointPath(checkpoint, relativeOrAbsolute(this.cwd, checkpoint.path));
  }

  private ticketChildren(ticketId: string): string[] {
    return this.loadAllTickets()
      .filter((record) => record.frontmatter.parent === ticketId)
      .map((record) => record.frontmatter.id)
      .sort((left, right) => left.localeCompare(right));
  }

  listTickets(filter: TicketListFilter = {}): TicketSummary[] {
    return filterTickets(summarizeTickets(this.loadAllTickets()), filter).map((summary) =>
      this.toOutputSummary(summary),
    );
  }

  graph(): TicketGraphResult {
    return buildTicketGraph(this.listTickets({ includeClosed: true }));
  }

  readTicket(ref: string): TicketReadResult {
    const ticketId = this.resolveTicketRef(ref);
    const record = this.loadTicketById(ticketId);
    const summaries = this.listTickets({ includeClosed: true });
    const summary = summaries.find((entry) => entry.id === ticketId);
    if (!summary) {
      throw new Error(`Unknown ticket: ${ticketId}`);
    }
    const graph = buildTicketGraph(summaries);
    const checkpointIds = readCheckpointIndex(getCheckpointIndexPath(this.cwd, ticketId));
    const checkpoints = checkpointIds.map((checkpointId) => {
      const path = getCheckpointPath(this.cwd, checkpointId);
      return parseCheckpoint(readFileSync(path, "utf-8"), path);
    });
    return {
      ticket: this.toOutputTicket(record),
      summary: this.toOutputSummary(summary),
      journal: readJournalEntries(this.cwd, ticketId),
      attachments: readAttachments(this.cwd, ticketId),
      checkpoints: checkpoints.map((checkpoint) => this.toOutputCheckpoint(checkpoint)),
      children: this.ticketChildren(ticketId),
      blockers: graph.nodes[ticketId]?.blockedBy ?? [],
    };
  }

  createTicket(input: CreateTicketInput): TicketReadResult {
    this.initLedger();
    const timestamp = currentTimestamp();
    const ticketId = this.nextTicketId();
    const record: TicketRecord = {
      frontmatter: {
        id: ticketId,
        title: input.title.trim(),
        status: "open",
        priority: input.priority ?? "medium",
        type: input.type ?? "task",
        "created-at": timestamp,
        "updated-at": timestamp,
        tags: normalizeStringList(input.tags),
        deps: [],
        links: normalizeStringList(input.links),
        "initiative-ids": normalizeStringList(input.initiativeIds),
        "research-ids": normalizeStringList(input.researchIds),
        "spec-change": normalizeOptionalString(input.specChange),
        "spec-capabilities": normalizeStringList(input.specCapabilities),
        "spec-requirements": normalizeStringList(input.specRequirements),
        parent: normalizeOptionalString(input.parent),
        assignee: normalizeOptionalString(input.assignee),
        acceptance: normalizeStringList(input.acceptance),
        labels: normalizeStringList(input.labels),
        risk: input.risk ?? "medium",
        "review-status": input.reviewStatus ?? "none",
        "external-refs": normalizeStringList(input.externalRefs),
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
      path: getTicketPath(this.cwd, ticketId, false),
    };
    if (input.deps?.length) {
      record.frontmatter.deps = input.deps.map((dep) => this.resolveTicketRef(dep));
    }
    this.validateRelationships(record.frontmatter.id, record.frontmatter.deps, record.frontmatter.parent);
    this.writeTicket(record);
    this.appendJournal(ticketId, "state", `Created ticket ${record.frontmatter.title}`, timestamp, {
      action: "create",
    });
    this.appendAudit("create_ticket", ticketId, timestamp, { title: record.frontmatter.title });
    return this.readTicket(ticketId);
  }

  private validateRelationships(ticketId: string, deps: string[], parent: string | null): void {
    const allTickets = this.listTickets({ includeClosed: true });
    const depIds = normalizeStringList(deps).map((dep) => this.resolveTicketRef(dep));
    for (const depId of depIds) {
      this.loadTicketById(depId);
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
      this.loadTicketById(parentId);
    }
  }

  private assertTransitionAllowed(ticketId: string, deps: string[], status: "open" | "in_progress" | "review"): void {
    if (status === "open") {
      return;
    }

    const summaries = this.listTickets({ includeClosed: true });
    const blockedBy = normalizeStringList(deps).filter((depId) => {
      const dependency = summaries.find((summary) => summary.id === depId);
      return dependency !== undefined && dependency.status !== "closed";
    });

    if (blockedBy.length > 0) {
      throw new Error(`Ticket ${ticketId} cannot transition to ${status} while blocked by: ${blockedBy.join(", ")}`);
    }
  }

  updateTicket(ref: string, updates: UpdateTicketInput): TicketReadResult {
    const ticketId = this.resolveTicketRef(ref);
    const record = this.loadTicketById(ticketId);
    if (record.closed) {
      throw new Error(`Closed ticket ${ticketId} cannot be updated; use reopen before editing it.`);
    }
    const timestamp = currentTimestamp();
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
    if (updates.specChange !== undefined)
      record.frontmatter["spec-change"] = normalizeOptionalString(updates.specChange);
    if (updates.specCapabilities !== undefined)
      record.frontmatter["spec-capabilities"] = normalizeStringList(updates.specCapabilities);
    if (updates.specRequirements !== undefined)
      record.frontmatter["spec-requirements"] = normalizeStringList(updates.specRequirements);
    if (updates.parent !== undefined) record.frontmatter.parent = normalizeOptionalString(updates.parent);
    if (updates.assignee !== undefined) record.frontmatter.assignee = normalizeOptionalString(updates.assignee);
    if (updates.acceptance !== undefined) record.frontmatter.acceptance = normalizeStringList(updates.acceptance);
    if (updates.labels !== undefined) record.frontmatter.labels = normalizeStringList(updates.labels);
    if (updates.risk !== undefined) record.frontmatter.risk = updates.risk;
    if (updates.reviewStatus !== undefined) record.frontmatter["review-status"] = updates.reviewStatus;
    if (updates.externalRefs !== undefined)
      record.frontmatter["external-refs"] = normalizeStringList(updates.externalRefs);
    if (updates.status !== undefined) record.frontmatter.status = updates.status;
    if (updates.summary !== undefined) record.body.summary = updates.summary.trim();
    if (updates.context !== undefined) record.body.context = updates.context.trim();
    if (updates.plan !== undefined) record.body.plan = updates.plan.trim();
    if (updates.notes !== undefined) record.body.notes = updates.notes.trim();
    if (updates.verification !== undefined) record.body.verification = updates.verification.trim();
    if (updates.journalSummary !== undefined) record.body.journalSummary = updates.journalSummary.trim();
    this.validateRelationships(ticketId, record.frontmatter.deps, record.frontmatter.parent);
    if (record.frontmatter.status !== "closed") {
      this.assertTransitionAllowed(ticketId, record.frontmatter.deps, record.frontmatter.status);
    }
    record.frontmatter["updated-at"] = timestamp;
    this.writeTicket(record);
    this.appendJournal(ticketId, "state", "Updated ticket metadata", timestamp, { action: "update" });
    this.appendAudit("update_ticket", ticketId, timestamp, { updates });
    return this.readTicket(ticketId);
  }

  addExternalRef(ref: string, externalRef: string): TicketReadResult {
    const ticketId = this.resolveTicketRef(ref);
    const record = this.loadTicketById(ticketId);
    const normalizedRef = externalRef.trim();
    if (!normalizedRef || record.frontmatter["external-refs"].includes(normalizedRef)) {
      return this.readTicket(ticketId);
    }
    const timestamp = currentTimestamp();
    record.frontmatter["external-refs"] = normalizeStringList([...record.frontmatter["external-refs"], normalizedRef]);
    record.frontmatter["updated-at"] = timestamp;
    this.writeTicket(record);
    this.appendJournal(ticketId, "state", `Added external reference ${normalizedRef}`, timestamp, {
      externalRef: normalizedRef,
    });
    this.appendAudit("add_external_ref", ticketId, timestamp, { externalRef: normalizedRef });
    return this.readTicket(ticketId);
  }

  setInitiativeIds(ref: string, initiativeIds: string[]): TicketReadResult {
    const ticketId = this.resolveTicketRef(ref);
    const record = this.loadTicketById(ticketId);
    const timestamp = currentTimestamp();
    record.frontmatter["initiative-ids"] = normalizeStringList(initiativeIds);
    record.frontmatter["updated-at"] = timestamp;
    this.writeTicket(record);
    this.appendJournal(ticketId, "state", "Updated ticket initiative links", timestamp, { initiativeIds });
    this.appendAudit("set_ticket_initiatives", ticketId, timestamp, { initiativeIds });
    return this.readTicket(ticketId);
  }

  setResearchIds(ref: string, researchIds: string[]): TicketReadResult {
    const ticketId = this.resolveTicketRef(ref);
    const record = this.loadTicketById(ticketId);
    const timestamp = currentTimestamp();
    record.frontmatter["research-ids"] = normalizeStringList(researchIds);
    record.frontmatter["updated-at"] = timestamp;
    this.writeTicket(record);
    this.appendJournal(ticketId, "state", "Updated ticket research links", timestamp, { researchIds });
    this.appendAudit("set_ticket_research", ticketId, timestamp, { researchIds });
    return this.readTicket(ticketId);
  }

  startTicket(ref: string): TicketReadResult {
    return this.transitionTicket(ref, "in_progress", "Started work");
  }

  private transitionTicket(ref: string, status: "in_progress" | "review", journalText: string): TicketReadResult {
    const ticketId = this.resolveTicketRef(ref);
    const record = this.loadTicketById(ticketId);
    this.assertTransitionAllowed(ticketId, record.frontmatter.deps, status);
    const timestamp = currentTimestamp();
    record.frontmatter.status = status;
    record.frontmatter["updated-at"] = timestamp;
    this.writeTicket(record);
    this.appendJournal(ticketId, "state", journalText, timestamp, { status });
    this.appendAudit("transition_ticket", ticketId, timestamp, { status });
    return this.readTicket(ticketId);
  }

  closeTicket(ref: string, verificationNote?: string): TicketReadResult {
    const ticketId = this.resolveTicketRef(ref);
    const record = this.loadTicketById(ticketId);
    const timestamp = currentTimestamp();
    record.frontmatter.status = "closed";
    record.frontmatter["updated-at"] = timestamp;
    if (verificationNote?.trim()) {
      record.body.verification = [record.body.verification, verificationNote.trim()].filter(Boolean).join("\n\n");
    }
    const closedPath = getTicketPath(this.cwd, ticketId, true);
    writeFileAtomic(closedPath, serializeTicket({ frontmatter: record.frontmatter, body: record.body }));
    if (record.path !== closedPath) {
      rmSync(record.path, { force: true });
    }
    record.path = closedPath;
    record.closed = true;
    this.appendJournal(ticketId, "verification", verificationNote?.trim() || "Closed ticket", timestamp, {
      action: "close",
    });
    this.appendAudit("close_ticket", ticketId, timestamp, { verificationNote: verificationNote ?? null });
    return this.readTicket(ticketId);
  }

  reopenTicket(ref: string): TicketReadResult {
    const ticketId = this.resolveTicketRef(ref);
    const record = this.loadTicketById(ticketId);
    if (!record.closed) {
      throw new Error(`Ticket ${ticketId} is not closed.`);
    }
    const timestamp = currentTimestamp();
    record.frontmatter.status = "open";
    record.frontmatter["updated-at"] = timestamp;
    const openPath = getTicketPath(this.cwd, ticketId, false);
    writeFileAtomic(openPath, serializeTicket({ frontmatter: record.frontmatter, body: record.body }));
    if (record.path !== openPath) {
      rmSync(record.path, { force: true });
    }
    record.path = openPath;
    record.closed = false;
    this.appendJournal(ticketId, "state", "Reopened ticket", timestamp, { action: "reopen", status: "open" });
    this.appendAudit("reopen_ticket", ticketId, timestamp, {});
    return this.readTicket(ticketId);
  }

  addNote(ref: string, text: string): TicketReadResult {
    const ticketId = this.resolveTicketRef(ref);
    const record = this.loadTicketById(ticketId);
    const timestamp = currentTimestamp();
    const note = `- ${timestamp} ${text.trim()}`;
    record.body.notes = [record.body.notes, note].filter(Boolean).join("\n");
    record.frontmatter["updated-at"] = timestamp;
    this.writeTicket(record);
    this.appendJournal(ticketId, "note", text.trim(), timestamp, {});
    this.appendAudit("add_note", ticketId, timestamp, { text });
    return this.readTicket(ticketId);
  }

  addJournalEntry(
    ref: string,
    kind: JournalKind,
    text: string,
    metadata: Record<string, unknown> = {},
  ): TicketReadResult {
    const ticketId = this.resolveTicketRef(ref);
    const record = this.loadTicketById(ticketId);
    const timestamp = currentTimestamp();
    record.frontmatter["updated-at"] = timestamp;
    this.writeTicket(record);
    this.appendJournal(ticketId, kind, text.trim(), timestamp, metadata);
    this.appendAudit("add_journal_entry", ticketId, timestamp, { kind, text, metadata });
    return this.readTicket(ticketId);
  }

  addDependency(ref: string, depRef: string): TicketReadResult {
    const ticketId = this.resolveTicketRef(ref);
    const depId = this.resolveTicketRef(depRef);
    const record = this.loadTicketById(ticketId);
    if (record.frontmatter.deps.includes(depId)) {
      return this.readTicket(ticketId);
    }
    this.validateRelationships(ticketId, [...record.frontmatter.deps, depId], record.frontmatter.parent);
    const timestamp = currentTimestamp();
    record.frontmatter.deps = normalizeStringList([...record.frontmatter.deps, depId]);
    record.frontmatter["updated-at"] = timestamp;
    this.writeTicket(record);
    this.appendJournal(ticketId, "state", `Added dependency on ${depId}`, timestamp, { dependency: depId });
    this.appendAudit("add_dependency", ticketId, timestamp, { dependency: depId });
    return this.readTicket(ticketId);
  }

  removeDependency(ref: string, depRef: string): TicketReadResult {
    const ticketId = this.resolveTicketRef(ref);
    const depId = this.resolveTicketRef(depRef);
    const record = this.loadTicketById(ticketId);
    const nextDeps = record.frontmatter.deps.filter((dependency) => dependency !== depId);
    const timestamp = currentTimestamp();
    record.frontmatter.deps = nextDeps;
    record.frontmatter["updated-at"] = timestamp;
    this.writeTicket(record);
    this.appendJournal(ticketId, "state", `Removed dependency on ${depId}`, timestamp, { dependency: depId });
    this.appendAudit("remove_dependency", ticketId, timestamp, { dependency: depId });
    return this.readTicket(ticketId);
  }

  attachArtifact(ref: string, input: AttachArtifactInput): TicketReadResult {
    const ticketId = this.resolveTicketRef(ref);
    const record = this.loadTicketById(ticketId);
    this.initLedger();
    const timestamp = currentTimestamp();
    const attachments = readAttachments(this.cwd, ticketId);
    const mediaType = inferMediaType(input.path, input.mediaType);
    let artifactPath: string | null = null;
    let sourcePath: string | null = null;
    if (!input.path?.trim() && input.content === undefined) {
      throw new Error("Attachment requires either path or content");
    }

    if (input.path?.trim()) {
      const normalizedPath = input.path.trim().startsWith("@") ? input.path.trim().slice(1) : input.path.trim();
      const absoluteSource = resolve(this.cwd, normalizedPath);
      if (!existsSync(absoluteSource)) {
        throw new Error(`Attachment source does not exist: ${input.path}`);
      }
      sourcePath = relative(this.cwd, absoluteSource);
    }

    if (input.content !== undefined) {
      const artifactId = this.nextArtifactId();
      artifactPath = relative(this.cwd, getArtifactPath(this.cwd, artifactId, mediaTypeExtension(mediaType)));
      writeFileAtomic(resolve(this.cwd, artifactPath), input.content);
    } else if (sourcePath) {
      const absoluteSource = resolve(this.cwd, sourcePath);
      const artifactId = this.nextArtifactId();
      artifactPath = relative(
        this.cwd,
        getArtifactPath(this.cwd, artifactId, extname(absoluteSource) || mediaTypeExtension(mediaType)),
      );
      copyFileSync(absoluteSource, resolve(this.cwd, artifactPath));
    }

    const attachment: AttachmentRecord = {
      id: `attachment-${String(attachments.length + 1).padStart(4, "0")}`,
      ticketId,
      createdAt: timestamp,
      label: input.label.trim(),
      mediaType,
      artifactPath,
      sourcePath,
      description: input.description?.trim() ?? "",
      metadata: input.metadata ?? {},
    };
    this.writeAttachments(ticketId, [...attachments, attachment]);
    record.frontmatter["updated-at"] = timestamp;
    this.writeTicket(record);
    this.appendJournal(ticketId, "attachment", `Attached ${attachment.label}`, timestamp, {
      artifactPath,
      sourcePath,
    });
    this.appendAudit("attach_artifact", ticketId, timestamp, { label: attachment.label });
    return this.readTicket(ticketId);
  }

  recordCheckpoint(ref: string, input: CreateCheckpointInput): TicketReadResult {
    const ticketId = this.resolveTicketRef(ref);
    const record = this.loadTicketById(ticketId);
    this.initLedger();
    const timestamp = currentTimestamp();
    const checkpointId = this.nextCheckpointId();
    const checkpoint: CheckpointRecord = {
      id: checkpointId,
      ticketId,
      title: input.title.trim(),
      createdAt: timestamp,
      body: input.body.trim(),
      path: getCheckpointPath(this.cwd, checkpointId),
      supersedes: input.supersedes ?? null,
    };
    writeFileAtomic(checkpoint.path, serializeCheckpoint(checkpoint));
    const checkpointIds = readCheckpointIndex(getCheckpointIndexPath(this.cwd, ticketId));
    this.writeCheckpointIndex(ticketId, [...checkpointIds, checkpointId]);
    record.frontmatter["updated-at"] = timestamp;
    this.writeTicket(record);
    this.appendJournal(ticketId, "checkpoint", `Recorded checkpoint ${checkpointId}`, timestamp, { checkpointId });
    this.appendAudit("record_checkpoint", ticketId, timestamp, { checkpointId, title: checkpoint.title });
    return this.readTicket(ticketId);
  }

  async initLedgerAsync(): Promise<{ initialized: true; root: string }> {
    return this.initLedger();
  }

  listTicketsProjection(filter: TicketListFilter = {}): TicketSummary[] {
    return this.listTickets(filter);
  }

  readTicketProjection(ref: string): TicketReadResult {
    return this.readTicket(ref);
  }

  graphProjection(): TicketGraphResult {
    return this.graph();
  }

  addExternalRefProjection(ref: string, externalRef: string): TicketReadResult {
    return this.addExternalRef(ref, externalRef);
  }

  setInitiativeIdsProjection(ref: string, initiativeIds: string[]): TicketReadResult {
    return this.setInitiativeIds(ref, initiativeIds);
  }

  setResearchIdsProjection(ref: string, researchIds: string[]): TicketReadResult {
    return this.setResearchIds(ref, researchIds);
  }

  addJournalEntryProjection(
    ref: string,
    kind: JournalKind,
    text: string,
    metadata: Record<string, unknown> = {},
  ): TicketReadResult {
    return this.addJournalEntry(ref, kind, text, metadata);
  }

  async listTicketsAsync(filter: TicketListFilter = {}): Promise<TicketSummary[]> {
    const summaries = this.canonicalSummaries(await this.canonicalRecords());
    return filterTickets(summaries, filter).map((summary) => this.toOutputSummary(summary));
  }

  async graphAsync(): Promise<TicketGraphResult> {
    return this.canonicalGraph(await this.canonicalRecords());
  }

  async readTicketAsync(ref: string): Promise<TicketReadResult> {
    const ticketId = this.resolveTicketRef(ref);
    let records = await this.canonicalRecords();
    let record = records.find((entry) => entry.summary.id === ticketId);
    if (!record) {
      await this.repairTicketToCanonical(ticketId);
      records = await this.canonicalRecords();
      record = records.find((entry) => entry.summary.id === ticketId);
    }
    if (!record) {
      throw new Error(`Unknown ticket: ${ticketId}`);
    }
    return this.toCanonicalReadResult(record, this.canonicalSummaries(records), this.canonicalGraph(records));
  }

  async createTicketAsync(input: CreateTicketInput): Promise<TicketReadResult> {
    this.initLedger();
    const timestamp = currentTimestamp();
    const existing = await this.canonicalRecords();
    const ticketId = nextNumericId(existing.map((record) => record.summary.id), "t");
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
        "spec-change": normalizeOptionalString(input.specChange),
        "spec-capabilities": normalizeStringList(input.specCapabilities),
        "spec-requirements": normalizeStringList(input.specRequirements),
        parent: normalizeOptionalString(input.parent),
        assignee: normalizeOptionalString(input.assignee),
        acceptance: normalizeStringList(input.acceptance),
        labels: normalizeStringList(input.labels),
        risk: input.risk ?? "medium",
        "review-status": input.reviewStatus ?? "none",
        "external-refs": normalizeStringList(input.externalRefs),
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
      path: getTicketPath(this.cwd, ticketId, false),
    };
    const provisionalRecords = [...existing, { ticket: ticketRecord, summary: summarizeTicket(ticketRecord, "ready"), journal: [], attachments: [], checkpoints: [], children: [], blockers: [] }];
    this.validateRelationships(ticketId, ticketRecord.frontmatter.deps, ticketRecord.frontmatter.parent);
    const journal = [createJournalEntry(ticketId, "state", `Created ticket ${ticketRecord.frontmatter.title}`, timestamp, { action: "create" }, 1)];
    const result: TicketReadResult = { ticket: ticketRecord, summary: summarizeTicket(ticketRecord, "ready"), journal, attachments: [], checkpoints: [], children: [], blockers: [] };
    this.materializeCanonicalRecord(result);
    this.appendAudit("create_ticket", ticketId, timestamp, { title: ticketRecord.frontmatter.title });
    await this.upsertCanonicalRecord(result);
    return this.toCanonicalReadResult(result, this.canonicalSummaries(provisionalRecords), this.canonicalGraph(provisionalRecords));
  }

  async updateTicketAsync(ref: string, updates: UpdateTicketInput): Promise<TicketReadResult> {
    const current = await this.readTicketAsync(ref);
    if (current.ticket.closed) {
      throw new Error(`Closed ticket ${current.summary.id} cannot be updated; use reopen before editing it.`);
    }
    const timestamp = currentTimestamp();
    const record: TicketRecord = { ...current.ticket, frontmatter: { ...current.ticket.frontmatter }, body: { ...current.ticket.body } };
    if (updates.title !== undefined) record.frontmatter.title = updates.title.trim();
    if (updates.priority !== undefined) record.frontmatter.priority = updates.priority;
    if (updates.type !== undefined) record.frontmatter.type = updates.type;
    if (updates.tags !== undefined) record.frontmatter.tags = normalizeStringList(updates.tags);
    if (updates.deps !== undefined) record.frontmatter.deps = updates.deps.map((dep) => this.resolveTicketRef(dep));
    if (updates.links !== undefined) record.frontmatter.links = normalizeStringList(updates.links);
    if (updates.initiativeIds !== undefined) record.frontmatter["initiative-ids"] = normalizeStringList(updates.initiativeIds);
    if (updates.researchIds !== undefined) record.frontmatter["research-ids"] = normalizeStringList(updates.researchIds);
    if (updates.specChange !== undefined) record.frontmatter["spec-change"] = normalizeOptionalString(updates.specChange);
    if (updates.specCapabilities !== undefined) record.frontmatter["spec-capabilities"] = normalizeStringList(updates.specCapabilities);
    if (updates.specRequirements !== undefined) record.frontmatter["spec-requirements"] = normalizeStringList(updates.specRequirements);
    if (updates.parent !== undefined) record.frontmatter.parent = normalizeOptionalString(updates.parent);
    if (updates.assignee !== undefined) record.frontmatter.assignee = normalizeOptionalString(updates.assignee);
    if (updates.acceptance !== undefined) record.frontmatter.acceptance = normalizeStringList(updates.acceptance);
    if (updates.labels !== undefined) record.frontmatter.labels = normalizeStringList(updates.labels);
    if (updates.risk !== undefined) record.frontmatter.risk = updates.risk;
    if (updates.reviewStatus !== undefined) record.frontmatter["review-status"] = updates.reviewStatus;
    if (updates.externalRefs !== undefined) record.frontmatter["external-refs"] = normalizeStringList(updates.externalRefs);
    if (updates.status !== undefined) record.frontmatter.status = updates.status;
    if (updates.summary !== undefined) record.body.summary = updates.summary.trim();
    if (updates.context !== undefined) record.body.context = updates.context.trim();
    if (updates.plan !== undefined) record.body.plan = updates.plan.trim();
    if (updates.notes !== undefined) record.body.notes = updates.notes.trim();
    if (updates.verification !== undefined) record.body.verification = updates.verification.trim();
    if (updates.journalSummary !== undefined) record.body.journalSummary = updates.journalSummary.trim();
    this.validateRelationships(record.frontmatter.id, record.frontmatter.deps, record.frontmatter.parent);
    if (record.frontmatter.status !== "closed") {
      this.assertTransitionAllowed(record.frontmatter.id, record.frontmatter.deps, record.frontmatter.status);
    }
    record.frontmatter["updated-at"] = timestamp;
    const result: TicketReadResult = {
      ...current,
      ticket: record,
      summary: summarizeTicket(record, current.summary.status),
      journal: [...current.journal, createJournalEntry(record.frontmatter.id, "state", "Updated ticket metadata", timestamp, { action: "update" }, current.journal.length + 1)],
    };
    this.materializeCanonicalRecord(result);
    this.appendAudit("update_ticket", record.frontmatter.id, timestamp, { updates });
    await this.upsertCanonicalRecord(result);
    return this.readTicketAsync(record.frontmatter.id);
  }

  async startTicketAsync(ref: string): Promise<TicketReadResult> {
    const current = await this.readTicketAsync(ref);
    this.assertTransitionAllowed(current.summary.id, current.ticket.frontmatter.deps, "in_progress");
    const timestamp = currentTimestamp();
    current.ticket.frontmatter.status = "in_progress";
    current.ticket.frontmatter["updated-at"] = timestamp;
    current.journal = [...current.journal, createJournalEntry(current.summary.id, "state", "Started work", timestamp, { status: "in_progress" }, current.journal.length + 1)];
    this.materializeCanonicalRecord(current);
    this.appendAudit("transition_ticket", current.summary.id, timestamp, { status: "in_progress" });
    await this.upsertCanonicalRecord(current);
    return this.readTicketAsync(current.summary.id);
  }

  async closeTicketAsync(ref: string, verificationNote?: string): Promise<TicketReadResult> {
    const current = await this.readTicketAsync(ref);
    const timestamp = currentTimestamp();
    current.ticket.frontmatter.status = "closed";
    current.ticket.frontmatter["updated-at"] = timestamp;
    current.ticket.closed = true;
    current.ticket.path = getTicketPath(this.cwd, current.summary.id, true);
    if (verificationNote?.trim()) {
      current.ticket.body.verification = [current.ticket.body.verification, verificationNote.trim()].filter(Boolean).join("\n\n");
    }
    current.journal = [...current.journal, createJournalEntry(current.summary.id, "verification", verificationNote?.trim() || "Closed ticket", timestamp, { action: "close" }, current.journal.length + 1)];
    this.materializeCanonicalRecord(current);
    this.appendAudit("close_ticket", current.summary.id, timestamp, { verificationNote: verificationNote ?? null });
    await this.upsertCanonicalRecord(current);
    return this.readTicketAsync(current.summary.id);
  }

  async reopenTicketAsync(ref: string): Promise<TicketReadResult> {
    const current = await this.readTicketAsync(ref);
    if (!current.ticket.closed) {
      throw new Error(`Ticket ${current.summary.id} is not closed.`);
    }
    const timestamp = currentTimestamp();
    current.ticket.frontmatter.status = "open";
    current.ticket.frontmatter["updated-at"] = timestamp;
    current.ticket.closed = false;
    current.ticket.path = getTicketPath(this.cwd, current.summary.id, false);
    current.journal = [...current.journal, createJournalEntry(current.summary.id, "state", "Reopened ticket", timestamp, { action: "reopen", status: "open" }, current.journal.length + 1)];
    this.materializeCanonicalRecord(current);
    this.appendAudit("reopen_ticket", current.summary.id, timestamp, {});
    await this.upsertCanonicalRecord(current);
    return this.readTicketAsync(current.summary.id);
  }

  async addNoteAsync(ref: string, text: string): Promise<TicketReadResult> {
    const current = await this.readTicketAsync(ref);
    const timestamp = currentTimestamp();
    const note = `- ${timestamp} ${text.trim()}`;
    current.ticket.body.notes = [current.ticket.body.notes, note].filter(Boolean).join("\n");
    current.ticket.frontmatter["updated-at"] = timestamp;
    current.journal = [...current.journal, createJournalEntry(current.summary.id, "note", text.trim(), timestamp, {}, current.journal.length + 1)];
    this.materializeCanonicalRecord(current);
    this.appendAudit("add_note", current.summary.id, timestamp, { text });
    await this.upsertCanonicalRecord(current);
    return this.readTicketAsync(current.summary.id);
  }

  async addJournalEntryAsync(
    ref: string,
    kind: JournalKind,
    text: string,
    metadata: Record<string, unknown> = {},
  ): Promise<TicketReadResult> {
    const current = await this.readTicketAsync(ref);
    const timestamp = currentTimestamp();
    current.ticket.frontmatter["updated-at"] = timestamp;
    current.journal = [...current.journal, createJournalEntry(current.summary.id, kind, text.trim(), timestamp, metadata, current.journal.length + 1)];
    this.materializeCanonicalRecord(current);
    this.appendAudit("add_journal_entry", current.summary.id, timestamp, { kind, text, metadata });
    await this.upsertCanonicalRecord(current);
    return this.readTicketAsync(current.summary.id);
  }

  async addDependencyAsync(ref: string, depRef: string): Promise<TicketReadResult> {
    const current = await this.readTicketAsync(ref);
    const depId = this.resolveTicketRef(depRef);
    if (current.ticket.frontmatter.deps.includes(depId)) {
      return current;
    }
    this.validateRelationships(current.summary.id, [...current.ticket.frontmatter.deps, depId], current.ticket.frontmatter.parent);
    const timestamp = currentTimestamp();
    current.ticket.frontmatter.deps = normalizeStringList([...current.ticket.frontmatter.deps, depId]);
    current.ticket.frontmatter["updated-at"] = timestamp;
    current.journal = [...current.journal, createJournalEntry(current.summary.id, "state", `Added dependency on ${depId}`, timestamp, { dependency: depId }, current.journal.length + 1)];
    this.materializeCanonicalRecord(current);
    this.appendAudit("add_dependency", current.summary.id, timestamp, { dependency: depId });
    await this.upsertCanonicalRecord(current);
    return this.readTicketAsync(current.summary.id);
  }

  async removeDependencyAsync(ref: string, depRef: string): Promise<TicketReadResult> {
    const current = await this.readTicketAsync(ref);
    const depId = this.resolveTicketRef(depRef);
    const timestamp = currentTimestamp();
    current.ticket.frontmatter.deps = current.ticket.frontmatter.deps.filter((dependency) => dependency !== depId);
    current.ticket.frontmatter["updated-at"] = timestamp;
    current.journal = [...current.journal, createJournalEntry(current.summary.id, "state", `Removed dependency on ${depId}`, timestamp, { dependency: depId }, current.journal.length + 1)];
    this.materializeCanonicalRecord(current);
    this.appendAudit("remove_dependency", current.summary.id, timestamp, { dependency: depId });
    await this.upsertCanonicalRecord(current);
    return this.readTicketAsync(current.summary.id);
  }

  async attachArtifactAsync(ref: string, input: AttachArtifactInput): Promise<TicketReadResult> {
    const current = await this.readTicketAsync(ref);
    this.initLedger();
    const timestamp = currentTimestamp();
    const mediaType = inferMediaType(input.path, input.mediaType);
    let artifactPath: string | null = null;
    let sourcePath: string | null = null;
    if (!input.path?.trim() && input.content === undefined) {
      throw new Error("Attachment requires either path or content");
    }
    if (input.path?.trim()) {
      const normalizedPath = input.path.trim().startsWith("@") ? input.path.trim().slice(1) : input.path.trim();
      const absoluteSource = resolve(this.cwd, normalizedPath);
      if (!existsSync(absoluteSource)) {
        throw new Error(`Attachment source does not exist: ${input.path}`);
      }
      sourcePath = relative(this.cwd, absoluteSource);
    }
    if (input.content !== undefined) {
      const artifactId = this.nextArtifactId();
      artifactPath = relative(this.cwd, getArtifactPath(this.cwd, artifactId, mediaTypeExtension(mediaType)));
      writeFileAtomic(resolve(this.cwd, artifactPath), input.content);
    } else if (sourcePath) {
      const absoluteSource = resolve(this.cwd, sourcePath);
      const artifactId = this.nextArtifactId();
      artifactPath = relative(this.cwd, getArtifactPath(this.cwd, artifactId, extname(absoluteSource) || mediaTypeExtension(mediaType)));
      copyFileSync(absoluteSource, resolve(this.cwd, artifactPath));
    }
    const attachment: AttachmentRecord = {
      id: `attachment-${String(current.attachments.length + 1).padStart(4, "0")}`,
      ticketId: current.summary.id,
      createdAt: timestamp,
      label: input.label.trim(),
      mediaType,
      artifactPath,
      sourcePath,
      description: input.description?.trim() ?? "",
      metadata: input.metadata ?? {},
    };
    current.attachments = [...current.attachments, attachment];
    current.ticket.frontmatter["updated-at"] = timestamp;
    current.journal = [...current.journal, createJournalEntry(current.summary.id, "attachment", `Attached ${attachment.label}`, timestamp, { artifactPath, sourcePath }, current.journal.length + 1)];
    this.materializeCanonicalRecord(current);
    this.appendAudit("attach_artifact", current.summary.id, timestamp, { label: attachment.label });
    await this.upsertCanonicalRecord(current);
    return this.readTicketAsync(current.summary.id);
  }

  async recordCheckpointAsync(ref: string, input: CreateCheckpointInput): Promise<TicketReadResult> {
    const current = await this.readTicketAsync(ref);
    const timestamp = currentTimestamp();
    const checkpointId = this.nextCheckpointId();
    const checkpoint: CheckpointRecord = {
      id: checkpointId,
      ticketId: current.summary.id,
      title: input.title.trim(),
      createdAt: timestamp,
      body: input.body.trim(),
      path: relativeOrAbsolute(this.cwd, getCheckpointPath(this.cwd, checkpointId)),
      supersedes: input.supersedes ?? null,
    };
    current.checkpoints = [...current.checkpoints, checkpoint];
    current.ticket.frontmatter["updated-at"] = timestamp;
    current.journal = [...current.journal, createJournalEntry(current.summary.id, "checkpoint", `Recorded checkpoint ${checkpointId}`, timestamp, { checkpointId }, current.journal.length + 1)];
    this.materializeCanonicalRecord(current);
    this.appendAudit("record_checkpoint", current.summary.id, timestamp, { checkpointId, title: checkpoint.title });
    await this.upsertCanonicalRecord(current);
    return this.readTicketAsync(current.summary.id);
  }

  async setInitiativeIdsAsync(ref: string, initiativeIds: string[]): Promise<TicketReadResult> {
    const current = await this.readTicketAsync(ref);
    const timestamp = currentTimestamp();
    current.ticket.frontmatter["initiative-ids"] = normalizeStringList(initiativeIds);
    current.ticket.frontmatter["updated-at"] = timestamp;
    current.journal = [...current.journal, createJournalEntry(current.summary.id, "state", "Updated ticket initiative links", timestamp, { initiativeIds }, current.journal.length + 1)];
    this.materializeCanonicalRecord(current);
    this.appendAudit("set_ticket_initiatives", current.summary.id, timestamp, { initiativeIds });
    await this.upsertCanonicalRecord(current);
    return this.readTicketAsync(current.summary.id);
  }

  async setResearchIdsAsync(ref: string, researchIds: string[]): Promise<TicketReadResult> {
    const current = await this.readTicketAsync(ref);
    const timestamp = currentTimestamp();
    current.ticket.frontmatter["research-ids"] = normalizeStringList(researchIds);
    current.ticket.frontmatter["updated-at"] = timestamp;
    current.journal = [...current.journal, createJournalEntry(current.summary.id, "state", "Updated ticket research links", timestamp, { researchIds }, current.journal.length + 1)];
    this.materializeCanonicalRecord(current);
    this.appendAudit("set_ticket_research", current.summary.id, timestamp, { researchIds });
    await this.upsertCanonicalRecord(current);
    return this.readTicketAsync(current.summary.id);
  }

  async addExternalRefAsync(ref: string, externalRef: string): Promise<TicketReadResult> {
    const current = await this.readTicketAsync(ref);
    const normalizedRef = externalRef.trim();
    if (!normalizedRef || current.ticket.frontmatter["external-refs"].includes(normalizedRef)) {
      return current;
    }
    const timestamp = currentTimestamp();
    current.ticket.frontmatter["external-refs"] = normalizeStringList([...current.ticket.frontmatter["external-refs"], normalizedRef]);
    current.ticket.frontmatter["updated-at"] = timestamp;
    current.journal = [...current.journal, createJournalEntry(current.summary.id, "state", `Added external reference ${normalizedRef}`, timestamp, { externalRef: normalizedRef }, current.journal.length + 1)];
    this.materializeCanonicalRecord(current);
    this.appendAudit("add_external_ref", current.summary.id, timestamp, { externalRef: normalizedRef });
    await this.upsertCanonicalRecord(current);
    return this.readTicketAsync(current.summary.id);
  }
}

export function createTicketStore(cwd: string): TicketStore {
  return new TicketStore(cwd);
}
