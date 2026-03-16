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
import { inferMediaType, readAttachments } from "./attachments.js";
import { parseCheckpoint, readCheckpointIndex, serializeCheckpoint, withCheckpointPath } from "./checkpoints.js";
import { createEmptyBody, parseTicket, serializeTicket } from "./frontmatter.js";
import { buildTicketGraph, findDependencyCycle } from "./graph.js";
import { createJournalEntry, readJournalEntries } from "./journal.js";
import type {
  AttachArtifactInput,
  AttachmentRecord,
  AuditRecord,
  CheckpointRecord,
  CreateCheckpointInput,
  CreateTicketInput,
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
      throw new Error(`Closed ticket ${ticketId} cannot be updated; reopen by moving it manually if needed.`);
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
}

export function createTicketStore(cwd: string): TicketStore {
  return new TicketStore(cwd);
}
