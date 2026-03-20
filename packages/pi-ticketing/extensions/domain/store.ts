import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { PlanState } from "@pi-loom/pi-plans/extensions/domain/models.js";
import type { LoomCanonicalStorage } from "@pi-loom/pi-storage/storage/contract.js";
import {
  findEntityByDisplayId,
  upsertEntityByDisplayIdWithLifecycleEvents,
} from "@pi-loom/pi-storage/storage/entities.js";
import { createLinkId } from "@pi-loom/pi-storage/storage/ids.js";
import type { ProjectedEntityLinkInput } from "@pi-loom/pi-storage/storage/links.js";
import { assertProjectedEntityLinksResolvable, syncProjectedEntityLinks } from "@pi-loom/pi-storage/storage/links.js";
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
const TICKET_PROJECTION_OWNER = "ticket-store" as const;

interface TicketEntityAttributes {
  record: TicketReadResult;
}

interface PlanEntityAttributes {
  state: PlanState;
}

type WorkspaceIdentity = Awaited<ReturnType<typeof openWorkspaceStorage>>["identity"];

function hasStructuredTicketAttributes(attributes: unknown): attributes is TicketEntityAttributes {
  return Boolean(attributes && typeof attributes === "object" && "record" in attributes);
}

function hasStructuredPlanAttributes(attributes: unknown): attributes is PlanEntityAttributes {
  return Boolean(attributes && typeof attributes === "object" && "state" in attributes);
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

  constructor(cwd: string) {
    this.cwd = resolve(cwd);
  }

  initLedger(): { initialized: true; root: string } {
    return { initialized: true, root: getLoomCatalogPaths().catalogPath };
  }

  private async upsertCanonicalRecordWithStorage(
    storage: LoomCanonicalStorage,
    identity: WorkspaceIdentity,
    record: TicketReadResult,
    options: { validateProjectedLinks?: boolean; syncProjectedLinks?: boolean } = {},
  ): Promise<TicketReadResult> {
    const existing = await findEntityByDisplayId(storage, identity.space.id, ENTITY_KIND, record.summary.id);
    const version = (existing?.version ?? 0) + 1;
    const summary = summarizeTickets([record.ticket])[0];
    if (!summary) {
      throw new Error(`Missing canonical ticket summary for ${record.ticket.frontmatter.id}`);
    }
    const canonicalRecord: TicketReadResult = {
      ...record,
      summary,
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

  private async upsertCanonicalRecord(record: TicketReadResult): Promise<TicketReadResult> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    return storage.transact((tx) => this.upsertCanonicalRecordWithStorage(tx, identity, record));
  }

  async syncExternalRefWithStorage(
    storage: LoomCanonicalStorage,
    identity: WorkspaceIdentity,
    ref: string,
    externalRef: string,
    present: boolean,
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
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const updated = await storage.transact((tx) =>
      this.syncExternalRefWithStorage(tx, identity, ref, externalRef, true),
    );
    return this.readTicketAsync(updated.summary.id);
  }

  async removeExternalRefAsync(ref: string, externalRef: string): Promise<TicketReadResult> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const updated = await storage.transact((tx) =>
      this.syncExternalRefWithStorage(tx, identity, ref, externalRef, false),
    );
    return this.readTicketAsync(updated.summary.id);
  }
}

export function createTicketStore(cwd: string): TicketStore {
  return new TicketStore(cwd);
}
