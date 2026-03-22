import { resolve } from "node:path";
import { createConstitutionalStore } from "@pi-loom/pi-constitution/extensions/domain/store.js";
import type { ResearchState } from "@pi-loom/pi-research/extensions/domain/models.js";
import { createResearchStore } from "@pi-loom/pi-research/extensions/domain/store.js";
import { SPEC_STATUSES, type SpecChangeRecord } from "@pi-loom/pi-specs/extensions/domain/models.js";
import { createSpecStore } from "@pi-loom/pi-specs/extensions/domain/store.js";
import {
  appendEntityEvent,
  findEntityByDisplayId,
  upsertEntityByDisplayIdWithLifecycleEvents,
} from "@pi-loom/pi-storage/storage/entities.js";
import type { ProjectedEntityLinkInput } from "@pi-loom/pi-storage/storage/links.js";
import { assertProjectedEntityLinksResolvable, syncProjectedEntityLinks } from "@pi-loom/pi-storage/storage/links.js";
import { filterAndSortListEntries } from "@pi-loom/pi-storage/storage/list-search.js";
import { getLoomCatalogPaths } from "@pi-loom/pi-storage/storage/locations.js";
import { openWorkspaceStorage } from "@pi-loom/pi-storage/storage/workspace.js";
import {
  TICKET_STATUSES,
  type TicketReadResult,
  type TicketSummary,
} from "@pi-loom/pi-ticketing/extensions/domain/models.js";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import { buildInitiativeDashboard } from "./dashboard.js";
import type {
  CreateInitiativeInput,
  InitiativeDashboard,
  InitiativeDashboardMilestone,
  InitiativeDecisionKind,
  InitiativeDecisionRecord,
  InitiativeListFilter,
  InitiativeMilestone,
  InitiativeMilestoneHealth,
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

function resolveInitiativeId(ref: string): string {
  return normalizeInitiativeId(ref.split(/[\\/]/).pop() ?? ref);
}

function applyStatusLifecycle(state: InitiativeState, nextStatus: InitiativeState["status"], timestamp: string): void {
  const previousStatus = state.status;
  state.status = nextStatus;

  if (nextStatus !== "completed") {
    state.completedAt = null;
  } else if (previousStatus !== "completed") {
    state.completedAt = timestamp;
  }

  if (nextStatus !== "archived") {
    state.archivedAt = null;
  } else if (previousStatus !== "archived") {
    state.archivedAt = timestamp;
  }
}

function hasStructuredInitiativeAttributes(attributes: unknown): attributes is InitiativeEntityAttributes {
  return Boolean(attributes && typeof attributes === "object" && "state" in attributes);
}

function zeroCounts<T extends string>(values: readonly T[]): Record<T, number> {
  return Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>;
}

function milestoneHealth(milestone: InitiativeMilestone, linkedTickets: TicketSummary[]): InitiativeMilestoneHealth {
  if (milestone.status === "completed") return "complete";
  if (milestone.status === "blocked") return "at_risk";
  if (linkedTickets.some((ticket) => ticket.status === "blocked")) return "at_risk";
  if (milestone.status === "in_progress") return "active";
  if (linkedTickets.length > 0 && linkedTickets.every((ticket) => ticket.status === "closed")) return "complete";
  return "pending";
}

function buildMilestoneDashboard(
  milestone: InitiativeMilestone,
  ticketsById: Map<string, TicketSummary>,
): InitiativeDashboardMilestone {
  const linkedTickets = milestone.ticketIds
    .map((ticketId) => ticketsById.get(ticketId))
    .filter((ticket): ticket is TicketSummary => ticket !== undefined);
  return {
    id: milestone.id,
    title: milestone.title,
    status: milestone.status,
    health: milestoneHealth(milestone, linkedTickets),
    description: milestone.description,
    specChangeIds: [...milestone.specChangeIds],
    ticketIds: [...milestone.ticketIds],
    linkedOpenTicketCount: linkedTickets.filter((ticket) => ticket.status !== "closed").length,
    linkedCompletedTicketCount: linkedTickets.filter((ticket) => ticket.status === "closed").length,
  };
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

  private async buildDashboardWithoutRoadmaps(state: InitiativeState): Promise<InitiativeDashboard> {
    const specStore = createSpecStore(this.cwd);
    const ticketStore = createTicketStore(this.cwd);
    const researchStore = createResearchStore(this.cwd);
    const { storage, identity } = await openWorkspaceStorage(this.cwd);

    const linkedResearch = (
      await Promise.all(
        state.researchIds.map(async (researchId) => {
          const entity = await findEntityByDisplayId(storage, identity.space.id, "research", researchId);
          if (entity?.attributes && typeof entity.attributes === "object" && "state" in entity.attributes) {
            const researchState = (entity.attributes as { state: ResearchState }).state;
            return {
              id: researchState.researchId,
              title: researchState.title,
              status: researchState.status,
              updatedAt: researchState.updatedAt,
              ref: `research:${researchState.researchId}`,
            };
          }
          try {
            const record = await researchStore.readResearch(researchId);
            return {
              id: record.state.researchId,
              title: record.state.title,
              status: record.state.status,
              updatedAt: record.state.updatedAt,
              ref: record.summary.ref,
            };
          } catch (error) {
            if (error instanceof Error && error.message.startsWith("Unknown research:")) {
              return null;
            }
            throw error;
          }
        }),
      )
    )
      .filter((summary): summary is NonNullable<typeof summary> => summary !== null)
      .sort((left, right) => left.id.localeCompare(right.id));

    const [allSpecs, allTickets] = await Promise.all([
      specStore.listChanges({ includeArchived: true }),
      ticketStore.listTicketsAsync({ includeClosed: true }),
    ]);
    const linkedSpecs = allSpecs.filter((summary) => state.specChangeIds.includes(summary.id));
    const linkedTickets = allTickets.filter((summary) => state.ticketIds.includes(summary.id));
    const missingSpecIds = state.specChangeIds.filter((id) => !linkedSpecs.some((summary) => summary.id === id));
    const missingTicketIds = state.ticketIds.filter((id) => !linkedTickets.some((summary) => summary.id === id));
    const specCounts = zeroCounts(SPEC_STATUSES);
    const ticketCounts = zeroCounts(TICKET_STATUSES);
    for (const spec of linkedSpecs) specCounts[spec.status] += 1;
    for (const ticket of linkedTickets) ticketCounts[ticket.status] += 1;
    const ticketsById = new Map(linkedTickets.map((ticket) => [ticket.id, ticket]));

    return {
      initiative: {
        id: state.initiativeId,
        title: state.title,
        status: state.status,
        objective: state.objective,
        statusSummary: state.statusSummary,
        targetWindow: state.targetWindow,
        owners: [...state.owners],
        tags: [...state.tags],
        capabilityIds: [...state.capabilityIds],
        roadmapRefs: [...state.roadmapRefs],
        updatedAt: state.updatedAt,
      },
      linkedRoadmap: {
        total: 0,
        items: [],
      },
      linkedResearch: {
        total: linkedResearch.length,
        items: linkedResearch,
      },
      linkedSpecs: {
        total: linkedSpecs.length,
        counts: specCounts,
        items: linkedSpecs,
      },
      linkedTickets: {
        total: linkedTickets.length,
        counts: ticketCounts,
        ready: ticketCounts.ready,
        blocked: ticketCounts.blocked,
        inProgress: ticketCounts.in_progress,
        review: ticketCounts.review,
        closed: ticketCounts.closed,
        items: linkedTickets,
      },
      milestones: state.milestones.map((milestone) => buildMilestoneDashboard(milestone, ticketsById)),
      openRisks: [...state.risks],
      unlinkedReferences: {
        roadmapRefs: [],
        specChangeIds: normalizeStringList([
          ...allSpecs
            .filter((summary) => summary.initiativeIds.includes(state.initiativeId))
            .map((summary) => summary.id)
            .filter((id) => !state.specChangeIds.includes(id)),
          ...missingSpecIds,
        ]),
        ticketIds: normalizeStringList([
          ...allTickets
            .filter((summary) => summary.initiativeIds.includes(state.initiativeId))
            .map((summary) => summary.id)
            .filter((id) => !state.ticketIds.includes(id)),
          ...missingTicketIds,
        ]),
      },
    };
  }

  private async buildRecord(state: InitiativeState, decisions: InitiativeDecisionRecord[]): Promise<InitiativeRecord> {
    const initiativeDir = getInitiativeDir(this.cwd, state.initiativeId);
    const dashboard =
      state.roadmapRefs.length === 0
        ? await this.buildDashboardWithoutRoadmaps(state)
        : await buildInitiativeDashboard(this.cwd, state);
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
    const initiativeId = resolveInitiativeId(ref);
    const entity = await findEntityByDisplayId(storage, identity.space.id, ENTITY_KIND, initiativeId);
    if (!entity) throw new Error(`Unknown initiative: ${initiativeId}`);
    if (!hasStructuredInitiativeAttributes(entity.attributes)) {
      throw new Error(`Initiative entity ${initiativeId} is missing structured attributes`);
    }
    const attributes = entity.attributes;
    return this.buildRecord(attributes.state, attributes.decisions ?? []);
  }

  private async persistRecord(
    state: InitiativeState,
    decisions: InitiativeDecisionRecord[],
  ): Promise<InitiativeRecord> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const record = await this.buildRecord(state, decisions);
    const previous = await findEntityByDisplayId(storage, identity.space.id, ENTITY_KIND, state.initiativeId);
    const version = (previous?.version ?? 0) + 1;
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
          createdAt: previous?.createdAt ?? record.state.createdAt,
          updatedAt: record.state.updatedAt,
        },
        {
          actor: "initiative-store",
          createdPayload: { change: "initiative_persisted" },
          updatedPayload: { change: "initiative_persisted" },
          skipUpdatedEvent: true,
        },
      );

      if (!previous) {
        await appendEntityEvent(
          tx,
          entity.id,
          "created",
          "initiative-store",
          {
            entityKind: ENTITY_KIND,
            displayId: record.state.initiativeId,
            version: entity.version,
            status: entity.status,
            change: "initiative_persisted",
          },
          record.state.createdAt,
        );
      } else {
        if (previous.status !== entity.status) {
          await appendEntityEvent(
            tx,
            entity.id,
            "status_changed",
            "initiative-store",
            {
              entityKind: ENTITY_KIND,
              displayId: record.state.initiativeId,
              version: entity.version,
              previousStatus: previous.status,
              nextStatus: entity.status,
            },
            record.state.updatedAt,
          );
        }
        await appendEntityEvent(
          tx,
          entity.id,
          "updated",
          "initiative-store",
          {
            entityKind: ENTITY_KIND,
            displayId: record.state.initiativeId,
            version: entity.version,
            status: entity.status,
            previousVersion: previous.version,
            change: "initiative_persisted",
          },
          record.state.updatedAt,
        );
      }
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
        await store.setInitiativeIdsAsync(ticketId, nextInitiativeIds, { allowClosed: true });
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
    const summaries: Array<{ summary: InitiativeSummary; state: InitiativeState }> = [];
    for (const entity of await storage.listEntities(identity.space.id, ENTITY_KIND)) {
      if (hasStructuredInitiativeAttributes(entity.attributes)) {
        summaries.push({
          summary: summarizeInitiative(
            this.cwd,
            entity.attributes.state,
            getInitiativeDir(this.cwd, entity.attributes.state.initiativeId),
          ),
          state: entity.attributes.state,
        });
        continue;
      }
      throw new Error(`Initiative entity ${entity.displayId} is missing structured attributes`);
    }
    return filterAndSortListEntries(
      summaries
        .filter(({ summary }) => {
          if (!filter.includeArchived && summary.status === "archived") return false;
          if (filter.status && summary.status !== filter.status) return false;
          if (filter.tag && !summary.tags.includes(filter.tag)) return false;
          return true;
        })
        .map(({ summary, state }) => ({
          item: summary,
          id: summary.id,
          createdAt: state.createdAt,
          updatedAt: summary.updatedAt,
          fields: [
            { value: summary.id, weight: 10 },
            { value: summary.title, weight: 10 },
            { value: state.objective, weight: 8 },
            { value: state.statusSummary, weight: 7 },
            { value: state.outcomes.join(" "), weight: 6 },
            { value: state.tags.join(" "), weight: 7 },
            { value: state.owners.join(" "), weight: 6 },
            { value: state.roadmapRefs.join(" "), weight: 5 },
            { value: state.researchIds.join(" "), weight: 5 },
            { value: state.specChangeIds.join(" "), weight: 5 },
            { value: state.ticketIds.join(" "), weight: 5 },
            { value: state.capabilityIds.join(" "), weight: 4 },
            { value: state.scope.join(" "), weight: 4 },
            { value: state.nonGoals.join(" "), weight: 3 },
            { value: state.successMetrics.join(" "), weight: 4 },
            { value: state.risks.join(" "), weight: 3 },
            { value: state.targetWindow, weight: 3 },
            { value: state.supersedes.join(" "), weight: 2 },
            {
              value: state.milestones
                .map((milestone) =>
                  [
                    milestone.id,
                    milestone.title,
                    milestone.description,
                    milestone.specChangeIds.join(" "),
                    milestone.ticketIds.join(" "),
                  ].join(" "),
                )
                .join(" "),
              weight: 4,
            },
          ],
        })),
      { text: filter.text, sort: filter.sort },
    );
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
        await storage.removeEntity(entity.id);
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
      applyStatusLifecycle(state, normalizeStatus(updates.status), currentTimestamp());
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
