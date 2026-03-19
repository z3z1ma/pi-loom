import { resolve } from "node:path";
import { createConstitutionalStore } from "@pi-loom/pi-constitution/extensions/domain/store.js";
import { createResearchStore } from "@pi-loom/pi-research/extensions/domain/store.js";
import type { SpecChangeRecord } from "@pi-loom/pi-specs/extensions/domain/models.js";
import { createSpecStore } from "@pi-loom/pi-specs/extensions/domain/store.js";
import {
  appendEntityEvent,
  findEntityByDisplayId,
  upsertEntityByDisplayIdWithLifecycleEvents,
} from "@pi-loom/pi-storage/storage/entities.js";
import type { ProjectedEntityLinkInput } from "@pi-loom/pi-storage/storage/links.js";
import { assertProjectedEntityLinksResolvable, syncProjectedEntityLinks } from "@pi-loom/pi-storage/storage/links.js";
import { getLoomCatalogPaths } from "@pi-loom/pi-storage/storage/locations.js";
import { openWorkspaceStorage } from "@pi-loom/pi-storage/storage/workspace.js";
import type { TicketReadResult } from "@pi-loom/pi-ticketing/extensions/domain/models.js";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import { buildInitiativeDashboard } from "./dashboard.js";
import type {
  CreateInitiativeInput,
  InitiativeDecisionKind,
  InitiativeDecisionRecord,
  InitiativeListFilter,
  InitiativeMilestone,
  InitiativeMilestoneInput,
  InitiativeRecord,
  InitiativeState,
  InitiativeSummary,
  UpdateInitiativeInput,
} from "./models.js";
import {
  currentTimestamp,
  nextSequenceId,
  normalizeDecisionKind,
  normalizeInitiativeId,
  normalizeMilestoneId,
  normalizeMilestoneStatus,
  normalizeOptionalString,
  normalizeStatus,
  normalizeStringList,
  slugifyTitle,
} from "./normalize.js";
import { getInitiativeDir } from "./paths.js";
import { renderInitiativeMarkdown } from "./render.js";

const ENTITY_KIND = "initiative" as const;
const INITIATIVE_LINK_PROJECTION_OWNER = "initiative-store";

interface InitiativeEntityAttributes {
  state: InitiativeState;
  decisions: InitiativeDecisionRecord[];
}

interface SqliteMutationTarget {
  db: {
    prepare(sql: string): {
      run(...params: unknown[]): unknown;
    };
  };
}

function hasStructuredInitiativeAttributes(attributes: unknown): attributes is InitiativeEntityAttributes {
  return Boolean(attributes && typeof attributes === "object" && "state" in attributes);
}

function summarizeInitiative(_cwd: string, state: InitiativeState, ref: string): InitiativeSummary {
  return {
    id: state.initiativeId,
    title: state.title,
    status: state.status,
    milestoneCount: state.milestones.length,
    specChangeCount: state.specChangeIds.length,
    ticketCount: state.ticketIds.length,
    updatedAt: state.updatedAt,
    tags: [...state.tags],
    ref,
  };
}

function normalizeMilestone(input: InitiativeMilestoneInput, existingIds: string[]): InitiativeMilestone {
  const milestoneId = input.id
    ? normalizeMilestoneId(input.id)
    : nextSequenceId(
        existingIds.map((id) => normalizeMilestoneId(id)),
        "milestone",
      );
  return {
    id: milestoneId,
    title: input.title.trim(),
    status: normalizeMilestoneStatus(input.status),
    description: input.description?.trim() ?? "",
    specChangeIds: normalizeStringList(input.specChangeIds),
    ticketIds: normalizeStringList(input.ticketIds),
  };
}

function buildProjectedReferenceLinks(state: InitiativeState): ProjectedEntityLinkInput[] {
  return [
    ...state.researchIds.map(
      (targetDisplayId): ProjectedEntityLinkInput => ({
        kind: "references",
        targetKind: "research",
        targetDisplayId,
      }),
    ),
    ...state.specChangeIds.map(
      (targetDisplayId): ProjectedEntityLinkInput => ({
        kind: "references",
        targetKind: "spec_change",
        targetDisplayId,
      }),
    ),
    ...state.ticketIds.map(
      (targetDisplayId): ProjectedEntityLinkInput => ({
        kind: "references",
        targetKind: "ticket",
        targetDisplayId,
      }),
    ),
  ];
}

export class InitiativeStore {
  readonly cwd: string;

  constructor(cwd: string) {
    this.cwd = resolve(cwd);
  }

  initLedger(): { initialized: true; root: string } {
    return { initialized: true, root: getLoomCatalogPaths().catalogPath };
  }

  private defaultState(input: CreateInitiativeInput, timestamp: string): InitiativeState {
    const initiativeId = normalizeInitiativeId(input.initiativeId ?? slugifyTitle(input.title));
    const roadmapRefs = normalizeStringList(input.roadmapRefs);
    return {
      initiativeId,
      title: input.title.trim(),
      status: "proposed",
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: null,
      archivedAt: null,
      objective: input.objective?.trim() ?? input.title.trim(),
      outcomes: normalizeStringList(input.outcomes),
      scope: normalizeStringList(input.scope),
      nonGoals: normalizeStringList(input.nonGoals),
      successMetrics: normalizeStringList(input.successMetrics),
      milestones: (input.milestones ?? []).map((milestone) => normalizeMilestone(milestone, [])),
      risks: normalizeStringList(input.risks),
      statusSummary: input.statusSummary?.trim() ?? "",
      targetWindow: normalizeOptionalString(input.targetWindow),
      owners: normalizeStringList(input.owners),
      tags: normalizeStringList(input.tags),
      researchIds: normalizeStringList(input.researchIds),
      specChangeIds: normalizeStringList(input.specChangeIds),
      ticketIds: normalizeStringList(input.ticketIds),
      capabilityIds: normalizeStringList(input.capabilityIds),
      supersedes: normalizeStringList(input.supersedes),
      roadmapRefs,
    };
  }

  private async buildRecord(state: InitiativeState, decisions: InitiativeDecisionRecord[]): Promise<InitiativeRecord> {
    const initiativeDir = getInitiativeDir(this.cwd, state.initiativeId);
    const dashboard = await buildInitiativeDashboard(this.cwd, state);
    return {
      state,
      summary: summarizeInitiative(this.cwd, state, initiativeDir),
      brief: renderInitiativeMarkdown(state, decisions, dashboard),
      decisions,
      dashboard,
    };
  }

  private async loadRecord(ref: string): Promise<InitiativeRecord> {
    this.initLedger();
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const initiativeId = normalizeInitiativeId(ref.split(/[\\/]/).pop() ?? ref);
    let entity = await findEntityByDisplayId(storage, identity.space.id, ENTITY_KIND, initiativeId);
    if (!entity) {
      const timestamp = currentTimestamp();
      const state = this.defaultState({ title: initiativeId, initiativeId }, timestamp);
      ({ entity } = await upsertEntityByDisplayIdWithLifecycleEvents(
        storage,
        {
          kind: ENTITY_KIND,
          spaceId: identity.space.id,
          owningRepositoryId: identity.repository.id,
          displayId: state.initiativeId,
          title: state.title,
          summary: state.statusSummary || state.objective,
          status: state.status,
          version: 1,
          tags: state.tags,
          attributes: { state, decisions: [] },
          createdAt: state.createdAt,
          updatedAt: state.updatedAt,
        },
        {
          actor: "initiative-store",
          createdPayload: { change: "initiative_bootstrapped" },
          updatedPayload: { change: "initiative_bootstrapped" },
        },
      ));
    }
    if (!hasStructuredInitiativeAttributes(entity.attributes)) {
      throw new Error(`Initiative entity ${initiativeId} is missing structured attributes`);
    }
    const attributes = entity.attributes;
    return this.buildRecord(
      attributes.state ?? this.defaultState({ title: initiativeId, initiativeId }, currentTimestamp()),
      attributes.decisions ?? [],
    );
  }

  private async persistRecord(
    state: InitiativeState,
    decisions: InitiativeDecisionRecord[],
  ): Promise<InitiativeRecord> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const existing = await findEntityByDisplayId(storage, identity.space.id, ENTITY_KIND, state.initiativeId);
    const version = (existing?.version ?? 0) + 1;
    const record = await this.buildRecord(state, decisions);
    await assertProjectedEntityLinksResolvable({
      storage,
      spaceId: identity.space.id,
      projectionOwner: INITIATIVE_LINK_PROJECTION_OWNER,
      desired: buildProjectedReferenceLinks(record.state),
    });
    await storage.transact(async (tx) => {
      const { entity } = await upsertEntityByDisplayIdWithLifecycleEvents(
        tx,
        {
          kind: ENTITY_KIND,
          spaceId: identity.space.id,
          owningRepositoryId: identity.repository.id,
          displayId: record.state.initiativeId,
          title: record.state.title,
          summary: record.state.statusSummary || record.state.objective,
          status: record.state.status,
          version,
          tags: record.state.tags,
          attributes: { state: record.state, decisions: record.decisions },
          createdAt: existing?.createdAt ?? record.state.createdAt,
          updatedAt: record.state.updatedAt,
        },
        {
          actor: "initiative-store",
          createdPayload: { change: "initiative_persisted" },
          updatedPayload: { change: "initiative_persisted" },
        },
      );
      await syncProjectedEntityLinks({
        storage: tx,
        spaceId: identity.space.id,
        fromEntityId: entity.id,
        projectionOwner: INITIATIVE_LINK_PROJECTION_OWNER,
        // Roadmap refs point at embedded constitution items, so phase 1 projects only canonical entity relationships.
        desired: buildProjectedReferenceLinks(record.state),
        timestamp: record.state.updatedAt,
      });
    });
    return record;
  }

  private async syncSpecMembership(initiativeId: string, previousIds: string[], nextIds: string[]): Promise<void> {
    const store = createSpecStore(this.cwd);
    const impactedIds = normalizeStringList([...previousIds, ...nextIds]);
    for (const changeId of impactedIds) {
      const shouldLink = nextIds.includes(changeId);
      let change: SpecChangeRecord;
      try {
        change = await store.readChange(changeId);
      } catch (error) {
        if (!shouldLink && error instanceof Error && error.message.startsWith("Unknown spec change:")) {
          continue;
        }
        throw error;
      }
      const nextInitiativeIds = shouldLink
        ? normalizeStringList([...change.state.initiativeIds, initiativeId])
        : change.state.initiativeIds.filter((id) => id !== initiativeId);
      if (JSON.stringify(nextInitiativeIds) !== JSON.stringify(change.state.initiativeIds)) {
        await store.setInitiativeIds(changeId, nextInitiativeIds);
      }
    }
  }

  private async syncTicketMembership(initiativeId: string, previousIds: string[], nextIds: string[]): Promise<void> {
    const store = createTicketStore(this.cwd);
    const impactedIds = normalizeStringList([...previousIds, ...nextIds]);
    for (const ticketId of impactedIds) {
      const shouldLink = nextIds.includes(ticketId);
      let ticket: TicketReadResult;
      try {
        ticket = await store.readTicketAsync(ticketId);
      } catch (error) {
        if (!shouldLink && error instanceof Error && error.message.startsWith("Unknown ticket:")) {
          continue;
        }
        throw error;
      }
      const nextInitiativeIds = shouldLink
        ? normalizeStringList([...ticket.summary.initiativeIds, initiativeId])
        : ticket.summary.initiativeIds.filter((id) => id !== initiativeId);
      if (JSON.stringify(nextInitiativeIds) !== JSON.stringify(ticket.summary.initiativeIds)) {
        await store.setInitiativeIdsAsync(ticketId, nextInitiativeIds);
      }
    }
  }

  private async syncRoadmapMembership(initiativeId: string, previousRefs: string[], nextRefs: string[]): Promise<void> {
    const store = createConstitutionalStore(this.cwd);
    const impactedRefs = normalizeStringList([...previousRefs, ...nextRefs]);
    for (const roadmapRef of impactedRefs) {
      const item = await store.readRoadmapItem(roadmapRef);
      const shouldLink = nextRefs.includes(roadmapRef);
      const nextInitiativeIds = shouldLink
        ? normalizeStringList([...item.initiativeIds, initiativeId])
        : item.initiativeIds.filter((id) => id !== initiativeId);
      if (JSON.stringify(nextInitiativeIds) !== JSON.stringify(item.initiativeIds)) {
        await store.upsertRoadmapItem({ id: item.id, initiativeIds: nextInitiativeIds });
      }
    }
  }

  private async syncLinkedEntities(
    initiativeId: string,
    previousRoadmapRefs: string[],
    previousSpecIds: string[],
    previousTicketIds: string[],
    nextRoadmapRefs: string[],
    nextSpecIds: string[],
    nextTicketIds: string[],
  ): Promise<void> {
    await this.syncRoadmapMembership(initiativeId, previousRoadmapRefs, nextRoadmapRefs);
    await this.syncSpecMembership(initiativeId, previousSpecIds, nextSpecIds);
    await this.syncTicketMembership(initiativeId, previousTicketIds, nextTicketIds);
  }

  private async validateLinkedTargets(
    researchIds: string[],
    specChangeIds: string[],
    ticketIds: string[],
  ): Promise<void> {
    const researchStore = createResearchStore(this.cwd);
    const specStore = createSpecStore(this.cwd);
    const ticketStore = createTicketStore(this.cwd);
    await Promise.all([
      ...normalizeStringList(researchIds).map((researchId) => researchStore.readResearch(researchId)),
      ...normalizeStringList(specChangeIds).map((specChangeId) => specStore.readChange(specChangeId)),
      ...normalizeStringList(ticketIds).map((ticketId) => ticketStore.readTicketAsync(ticketId)),
    ]);
  }

  private async persistAndSyncMemberships(
    previous: InitiativeState,
    next: InitiativeState,
    decisions: InitiativeDecisionRecord[],
  ): Promise<InitiativeRecord> {
    const persisted = await this.persistRecord(next, decisions);
    try {
      await this.syncLinkedEntities(
        next.initiativeId,
        previous.roadmapRefs,
        previous.specChangeIds,
        previous.ticketIds,
        next.roadmapRefs,
        next.specChangeIds,
        next.ticketIds,
      );
      return persisted;
    } catch (error) {
      await this.syncLinkedEntities(
        next.initiativeId,
        next.roadmapRefs,
        next.specChangeIds,
        next.ticketIds,
        previous.roadmapRefs,
        previous.specChangeIds,
        previous.ticketIds,
      );
      await this.persistRecord(previous, decisions);
      throw error;
    }
  }

  async listInitiatives(filter: InitiativeListFilter = {}): Promise<InitiativeSummary[]> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const summaries: InitiativeSummary[] = [];
    for (const entity of await storage.listEntities(identity.space.id, ENTITY_KIND)) {
      if (hasStructuredInitiativeAttributes(entity.attributes)) {
        summaries.push(
          summarizeInitiative(
            this.cwd,
            entity.attributes.state,
            getInitiativeDir(this.cwd, entity.attributes.state.initiativeId),
          ),
        );
        continue;
      }
      throw new Error(`Initiative entity ${entity.displayId} is missing structured attributes`);
    }
    return summaries
      .filter((summary) => {
        if (!filter.includeArchived && summary.status === "archived") return false;
        if (filter.status && summary.status !== filter.status) return false;
        if (filter.tag && !summary.tags.includes(filter.tag)) return false;
        if (filter.text) {
          const haystack = `${summary.id} ${summary.title}`.toLowerCase();
          if (!haystack.includes(filter.text.toLowerCase())) return false;
        }
        return true;
      })
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  async readInitiative(ref: string): Promise<InitiativeRecord> {
    return this.loadRecord(ref);
  }

  async createInitiative(input: CreateInitiativeInput): Promise<InitiativeRecord> {
    this.initLedger();
    const timestamp = currentTimestamp();
    const state = this.defaultState(input, timestamp);
    state.roadmapRefs = await createConstitutionalStore(this.cwd).validateRoadmapRefs(input.roadmapRefs ?? []);
    await this.validateLinkedTargets(state.researchIds, state.specChangeIds, state.ticketIds);
    const created = await this.persistRecord(state, []);
    try {
      await this.syncLinkedEntities(
        state.initiativeId,
        [],
        [],
        [],
        state.roadmapRefs,
        state.specChangeIds,
        state.ticketIds,
      );
      return created;
    } catch (error) {
      await this.syncLinkedEntities(
        state.initiativeId,
        state.roadmapRefs,
        state.specChangeIds,
        state.ticketIds,
        [],
        [],
        [],
      );
      const { storage, identity } = await openWorkspaceStorage(this.cwd);
      const entity = await findEntityByDisplayId(storage, identity.space.id, ENTITY_KIND, created.state.initiativeId);
      if (entity) {
        (storage as unknown as SqliteMutationTarget).db.prepare("DELETE FROM entities WHERE id = ?").run(entity.id);
      }
      throw error;
    }
  }

  async updateInitiative(ref: string, updates: UpdateInitiativeInput): Promise<InitiativeRecord> {
    const record = await this.loadRecord(ref);
    const state = { ...record.state };
    const previousState = { ...state };
    if (updates.title !== undefined) state.title = updates.title.trim();
    if (updates.status !== undefined) {
      state.status = normalizeStatus(updates.status);
      if (state.status === "completed") state.completedAt = currentTimestamp();
      if (state.status === "archived") state.archivedAt = currentTimestamp();
    }
    if (updates.objective !== undefined) state.objective = updates.objective.trim();
    if (updates.outcomes !== undefined) state.outcomes = normalizeStringList(updates.outcomes);
    if (updates.scope !== undefined) state.scope = normalizeStringList(updates.scope);
    if (updates.nonGoals !== undefined) state.nonGoals = normalizeStringList(updates.nonGoals);
    if (updates.successMetrics !== undefined) state.successMetrics = normalizeStringList(updates.successMetrics);
    if (updates.risks !== undefined) state.risks = normalizeStringList(updates.risks);
    if (updates.statusSummary !== undefined) state.statusSummary = updates.statusSummary.trim();
    if (updates.targetWindow !== undefined) state.targetWindow = normalizeOptionalString(updates.targetWindow);
    if (updates.owners !== undefined) state.owners = normalizeStringList(updates.owners);
    if (updates.tags !== undefined) state.tags = normalizeStringList(updates.tags);
    if (updates.researchIds !== undefined) state.researchIds = normalizeStringList(updates.researchIds);
    if (updates.specChangeIds !== undefined) state.specChangeIds = normalizeStringList(updates.specChangeIds);
    if (updates.ticketIds !== undefined) state.ticketIds = normalizeStringList(updates.ticketIds);
    if (updates.capabilityIds !== undefined) state.capabilityIds = normalizeStringList(updates.capabilityIds);
    if (updates.supersedes !== undefined) state.supersedes = normalizeStringList(updates.supersedes);
    if (updates.roadmapRefs !== undefined) {
      state.roadmapRefs = await createConstitutionalStore(this.cwd).validateRoadmapRefs(updates.roadmapRefs);
    }
    await this.validateLinkedTargets(state.researchIds, state.specChangeIds, state.ticketIds);
    state.updatedAt = currentTimestamp();
    return this.persistAndSyncMemberships(previousState, state, record.decisions);
  }

  async setResearchIds(ref: string, researchIds: string[]): Promise<InitiativeRecord> {
    const record = await this.loadRecord(ref);
    const state = { ...record.state, researchIds: normalizeStringList(researchIds), updatedAt: currentTimestamp() };
    return this.persistRecord(state, record.decisions);
  }

  async recordDecision(
    ref: string,
    question: string,
    answer: string,
    kind: InitiativeDecisionKind = "decision",
  ): Promise<InitiativeRecord> {
    const record = await this.loadRecord(ref);
    const decision: InitiativeDecisionRecord = {
      id: nextSequenceId(
        record.decisions.map((entry) => entry.id),
        "decision",
      ),
      initiativeId: record.state.initiativeId,
      createdAt: currentTimestamp(),
      kind: normalizeDecisionKind(kind),
      question: question.trim(),
      answer: answer.trim(),
    };
    const decisions = [...record.decisions, decision];
    const state = { ...record.state, updatedAt: decision.createdAt };
    const persisted = await this.persistRecord(state, decisions);
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const entity = await findEntityByDisplayId(storage, identity.space.id, ENTITY_KIND, persisted.state.initiativeId);
    if (entity) {
      await appendEntityEvent(
        storage,
        entity.id,
        "decision_recorded",
        "initiative-store",
        { change: "initiative_decision_recorded", decision },
        decision.createdAt,
      );
    }
    return persisted;
  }

  async linkSpec(ref: string, specChangeId: string): Promise<InitiativeRecord> {
    const record = await this.loadRecord(ref);
    const state = {
      ...record.state,
      specChangeIds: normalizeStringList([...record.state.specChangeIds, specChangeId]),
      updatedAt: currentTimestamp(),
    };
    await this.validateLinkedTargets(state.researchIds, state.specChangeIds, state.ticketIds);
    return this.persistAndSyncMemberships(record.state, state, record.decisions);
  }

  async unlinkSpec(ref: string, specChangeId: string): Promise<InitiativeRecord> {
    const record = await this.loadRecord(ref);
    const state = {
      ...record.state,
      specChangeIds: record.state.specChangeIds.filter((id) => id !== specChangeId.trim()),
      updatedAt: currentTimestamp(),
    };
    return this.persistAndSyncMemberships(record.state, state, record.decisions);
  }

  async linkTicket(ref: string, ticketId: string): Promise<InitiativeRecord> {
    const record = await this.loadRecord(ref);
    const state = {
      ...record.state,
      ticketIds: normalizeStringList([...record.state.ticketIds, ticketId]),
      updatedAt: currentTimestamp(),
    };
    await this.validateLinkedTargets(state.researchIds, state.specChangeIds, state.ticketIds);
    return this.persistAndSyncMemberships(record.state, state, record.decisions);
  }

  async unlinkTicket(ref: string, ticketId: string): Promise<InitiativeRecord> {
    const record = await this.loadRecord(ref);
    const state = {
      ...record.state,
      ticketIds: record.state.ticketIds.filter((id) => id !== ticketId.trim()),
      updatedAt: currentTimestamp(),
    };
    return this.persistAndSyncMemberships(record.state, state, record.decisions);
  }

  async upsertMilestone(ref: string, input: InitiativeMilestoneInput): Promise<InitiativeRecord> {
    const record = await this.loadRecord(ref);
    const state = { ...record.state };
    const milestone = normalizeMilestone(
      input,
      state.milestones.map((existing) => existing.id),
    );
    const index = state.milestones.findIndex((existing) => existing.id === milestone.id);
    if (index === -1) {
      state.milestones.push(milestone);
    } else {
      state.milestones[index] = milestone;
    }
    state.milestones.sort((left, right) => left.id.localeCompare(right.id));
    state.updatedAt = currentTimestamp();
    return this.persistRecord(state, record.decisions);
  }

  async archiveInitiative(ref: string): Promise<InitiativeRecord> {
    return this.updateInitiative(ref, { status: "archived" });
  }
}

export function createInitiativeStore(cwd: string): InitiativeStore {
  return new InitiativeStore(cwd);
}
