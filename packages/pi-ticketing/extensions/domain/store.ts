import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { findEntityByDisplayId, upsertEntityByDisplayId } from "@pi-loom/pi-storage/storage/entities.js";
import { getLoomCatalogPaths } from "@pi-loom/pi-storage/storage/locations.js";
import { openWorkspaceStorage } from "@pi-loom/pi-storage/storage/workspace.js";
import { inferMediaType } from "./attachments.js";
import { createEmptyBody } from "./frontmatter.js";
import { buildTicketGraph, findDependencyCycle, summarizeTicket } from "./graph.js";
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
import { currentTimestamp, normalizeOptionalString, normalizeStringList, normalizeTicketId } from "./normalize.js";
import { getAttachmentSourceRef, getCheckpointRef, getTicketRef } from "./paths.js";
import { filterTickets, summarizeTickets } from "./query.js";

const ENTITY_KIND = "ticket" as const;

interface TicketEntityAttributes {
  record: TicketReadResult;
}

type WorkspaceIdentity = Awaited<ReturnType<typeof openWorkspaceStorage>>["identity"];

interface SqliteMutationTarget {
  db: {
    prepare(sql: string): {
      run(...params: unknown[]): unknown;
    };
  };
}

function hasStructuredTicketAttributes(attributes: unknown): attributes is TicketEntityAttributes {
  return Boolean(attributes && typeof attributes === "object" && "record" in attributes);
}

function nextNumericId(existingIds: string[], prefix: string): string {
  const max = existingIds.reduce((currentMax, currentId) => {
    const numeric = Number.parseInt(currentId.replace(`${prefix}-`, ""), 10);
    return Number.isFinite(numeric) ? Math.max(currentMax, numeric) : currentMax;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

function parseTicketRef(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Ticket reference is required");
  }
  const withoutPrefix = trimmed.startsWith("ticket:") ? trimmed.slice("ticket:".length) : trimmed;
  const normalized = withoutPrefix.startsWith("#") ? withoutPrefix.slice(1) : withoutPrefix;
  return normalizeTicketId(normalized);
}

export class TicketStore {
  readonly cwd: string;

  constructor(cwd: string) {
    this.cwd = resolve(cwd);
  }

  initLedger(): { initialized: true; root: string } {
    return { initialized: true, root: getLoomCatalogPaths().catalogPath };
  }

  private async upsertCanonicalRecordWithStorage(
    storage: Awaited<ReturnType<typeof openWorkspaceStorage>>["storage"],
    identity: WorkspaceIdentity,
    record: TicketReadResult,
  ): Promise<TicketReadResult> {
    const existing = await findEntityByDisplayId(storage, identity.space.id, ENTITY_KIND, record.summary.id);
    const version = (existing?.version ?? 0) + 1;
    await upsertEntityByDisplayId(storage, {
      kind: ENTITY_KIND,
      spaceId: identity.space.id,
      owningRepositoryId: identity.repository.id,
      displayId: record.summary.id,
      title: record.summary.title,
      summary: record.ticket.body.summary,
      status: record.summary.status,
      version,
      tags: record.ticket.frontmatter.tags,
      attributes: { record },
      createdAt: existing?.createdAt ?? record.summary.createdAt,
      updatedAt: record.summary.updatedAt,
    });
    return record;
  }

  private async upsertCanonicalRecord(record: TicketReadResult): Promise<TicketReadResult> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    return this.upsertCanonicalRecordWithStorage(storage, identity, record);
  }

  private deleteEntityRow(
    storage: Awaited<ReturnType<typeof openWorkspaceStorage>>["storage"],
    entityId: string,
  ): void {
    (storage as unknown as SqliteMutationTarget).db.prepare("DELETE FROM entities WHERE id = ?").run(entityId);
  }

  private entityRecord(entity: { attributes: unknown }): TicketReadResult {
    const record = (entity.attributes as TicketEntityAttributes).record;
    return {
      ...record,
      ticket: {
        ...record.ticket,
        archived: record.ticket.archived ?? false,
        archivedAt: record.ticket.archivedAt ?? null,
      },
      summary: {
        ...record.summary,
        archived: record.summary.archived ?? false,
        archivedAt: record.summary.archivedAt ?? null,
      },
    };
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
      summary,
      ticket: record.ticket,
      checkpoints: record.checkpoints,
      children: graph.nodes[record.summary.id]?.children ?? [],
      blockers: graph.nodes[record.summary.id]?.blockedBy ?? [],
    };
  }

  private async canonicalRecords(): Promise<TicketReadResult[]> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const records = new Map<string, TicketReadResult>();
    for (const entity of await storage.listEntities(identity.space.id, ENTITY_KIND)) {
      const ticketId = this.resolveTicketRef(entity.displayId ?? entity.id);
      if (!hasStructuredTicketAttributes(entity.attributes)) {
        throw new Error(`Ticket entity ${ticketId} is missing structured attributes`);
      }
      const record = this.entityRecord(entity);
      records.set(ticketId, record);
    }
    return [...records.values()].sort((left, right) => left.summary.id.localeCompare(right.summary.id));
  }

  resolveTicketRef(ref: string): string {
    return parseTicketRef(ref);
  }

  private nextTicketId(records: TicketReadResult[]): string {
    return nextNumericId(
      records.map((record) => record.summary.id),
      "t",
    );
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

  async initLedgerAsync(): Promise<{ initialized: true; root: string }> {
    return this.initLedger();
  }

  async listTicketsAsync(filter: TicketListFilter = {}): Promise<TicketSummary[]> {
    const summaries = this.canonicalSummaries(await this.canonicalRecords());
    return filterTickets(summaries, filter);
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

  async createTicketAsync(input: CreateTicketInput): Promise<TicketReadResult> {
    this.initLedger();
    const timestamp = currentTimestamp();
    const existing = await this.canonicalRecords();
    const ticketId = this.nextTicketId(existing);
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
        parent: normalizeOptionalString(input.parent) ? this.resolveTicketRef(input.parent as string) : null,
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
      archived: false,
      archivedAt: null,
      ref: getTicketRef(ticketId),
    };
    const provisionalRecords = [
      ...existing,
      {
        ticket: ticketRecord,
        summary: summarizeTicket(ticketRecord, "ready"),
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
      summary: summarizeTicket(ticketRecord, "ready"),
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

  async updateTicketAsync(ref: string, updates: UpdateTicketInput): Promise<TicketReadResult> {
    const current = await this.readTicketAsync(ref);
    const hasUpdates = Object.values(updates).some((value) => value !== undefined);
    if (current.ticket.closed && hasUpdates) {
      throw new Error(`Closed ticket ${current.summary.id} cannot be updated; use reopen before editing it.`);
    }
    const timestamp = currentTimestamp();
    const record: TicketRecord = {
      ...current.ticket,
      frontmatter: { ...current.ticket.frontmatter },
      body: { ...current.ticket.body },
    };
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
    await this.upsertCanonicalRecord(result);
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
    const current = await this.readTicketAsync(ticketId);

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

    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    await storage.transact(async (tx) => {
      const targetEntity = await findEntityByDisplayId(tx, identity.space.id, ENTITY_KIND, ticketId);
      if (!targetEntity) {
        throw new Error(`Unknown ticket: ${ticketId}`);
      }
      for (const record of canonicalAffected) {
        await this.upsertCanonicalRecordWithStorage(tx, identity, record);
      }
      this.deleteEntityRow(
        tx as unknown as Awaited<ReturnType<typeof openWorkspaceStorage>>["storage"],
        targetEntity.id,
      );
    });

    return {
      action: "delete",
      deletedTicketId: ticketId,
      affectedTicketIds: canonicalAffected
        .map((record) => record.summary.id)
        .sort((left, right) => left.localeCompare(right)),
    };
  }

  async startTicketAsync(ref: string): Promise<TicketReadResult> {
    const current = await this.readTicketAsync(ref);
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
    await this.upsertCanonicalRecord(current);
    return this.readTicketAsync(current.summary.id);
  }

  async closeTicketAsync(ref: string, verificationNote?: string): Promise<TicketReadResult> {
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
    await this.upsertCanonicalRecord(current);
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
    const current = await this.readTicketAsync(ref);
    const timestamp = currentTimestamp();
    current.ticket.frontmatter["updated-at"] = timestamp;
    current.journal = [
      ...current.journal,
      createJournalEntry(current.summary.id, kind, text.trim(), timestamp, metadata, current.journal.length + 1),
    ];
    await this.upsertCanonicalRecord(current);
    return this.readTicketAsync(current.summary.id);
  }

  async addDependencyAsync(ref: string, depRef: string): Promise<TicketReadResult> {
    const current = await this.readTicketAsync(ref);
    const depId = this.resolveTicketRef(depRef);
    if (current.ticket.frontmatter.deps.includes(depId)) {
      return current;
    }
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
    if (input.path?.trim()) {
      const normalizedPath = input.path.trim().startsWith("@") ? input.path.trim().slice(1) : input.path.trim();
      const absoluteSource = resolve(this.cwd, normalizedPath);
      if (!existsSync(absoluteSource)) {
        throw new Error(`Attachment source does not exist: ${input.path}`);
      }
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

  async setInitiativeIdsAsync(ref: string, initiativeIds: string[]): Promise<TicketReadResult> {
    const current = await this.readTicketAsync(ref);
    const timestamp = currentTimestamp();
    current.ticket.frontmatter["initiative-ids"] = normalizeStringList(initiativeIds);
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

  async setResearchIdsAsync(ref: string, researchIds: string[]): Promise<TicketReadResult> {
    const current = await this.readTicketAsync(ref);
    const timestamp = currentTimestamp();
    current.ticket.frontmatter["research-ids"] = normalizeStringList(researchIds);
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

  async addExternalRefAsync(ref: string, externalRef: string): Promise<TicketReadResult> {
    const current = await this.readTicketAsync(ref);
    const normalizedRef = externalRef.trim();
    if (!normalizedRef || current.ticket.frontmatter["external-refs"].includes(normalizedRef)) {
      return current;
    }
    const timestamp = currentTimestamp();
    current.ticket.frontmatter["external-refs"] = normalizeStringList([
      ...current.ticket.frontmatter["external-refs"],
      normalizedRef,
    ]);
    current.ticket.frontmatter["updated-at"] = timestamp;
    current.journal = [
      ...current.journal,
      createJournalEntry(
        current.summary.id,
        "state",
        `Added external reference ${normalizedRef}`,
        timestamp,
        { externalRef: normalizedRef },
        current.journal.length + 1,
      ),
    ];
    await this.upsertCanonicalRecord(current);
    return this.readTicketAsync(current.summary.id);
  }
}

export function createTicketStore(cwd: string): TicketStore {
  return new TicketStore(cwd);
}
