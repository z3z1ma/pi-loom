import { resolve } from "node:path";
import { createInitiativeStore } from "@pi-loom/pi-initiatives/extensions/domain/store.js";
import { createSpecStore } from "@pi-loom/pi-specs/extensions/domain/store.js";
import {
  hasProjectedArtifactAttributes,
  type ProjectedArtifactInput,
  syncProjectedArtifacts,
} from "@pi-loom/pi-storage/storage/artifacts.js";
import {
  appendEntityEvent,
  findEntityByDisplayId,
  upsertEntityByDisplayId,
} from "@pi-loom/pi-storage/storage/entities.js";
import type { ProjectedEntityLinkInput } from "@pi-loom/pi-storage/storage/links.js";
import { syncProjectedEntityLinks } from "@pi-loom/pi-storage/storage/links.js";
import { filterAndSortListEntries } from "@pi-loom/pi-storage/storage/list-search.js";
import { getLoomCatalogPaths } from "@pi-loom/pi-storage/storage/locations.js";
import { openWorkspaceStorage } from "@pi-loom/pi-storage/storage/workspace.js";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import { buildResearchDashboard } from "./dashboard.js";
import { buildResearchMap } from "./map.js";
import type {
  CreateResearchInput,
  ResearchArtifactInput,
  ResearchArtifactRecord,
  ResearchHypothesisInput,
  ResearchHypothesisRecord,
  ResearchListFilter,
  ResearchRecord,
  ResearchState,
  ResearchSummary,
  UpdateResearchInput,
} from "./models.js";
import {
  currentTimestamp,
  nextSequenceId,
  normalizeArtifactId,
  normalizeArtifactKind,
  normalizeHypothesisConfidence,
  normalizeHypothesisId,
  normalizeHypothesisStatus,
  normalizeOptionalString,
  normalizeResearchId,
  normalizeResearchStatus,
  normalizeStringList,
  slugifyTitle,
} from "./normalize.js";
import { renderResearchMarkdown } from "./render.js";

const ENTITY_KIND = "research" as const;
const RESEARCH_LINK_PROJECTION_OWNER = "research-store";
const RESEARCH_ARTIFACT_PROJECTION_OWNER = "research-store:artifacts";
const RESEARCH_ARTIFACT_TYPE = "research-artifact";

interface ResearchEntityAttributes {
  state: ResearchState;
  hypotheses: ResearchHypothesisRecord[];
}

interface ResearchArtifactPayload extends ResearchArtifactRecord, Record<string, unknown> {
  body: string;
}

interface ResearchSummaryWithSynthesis extends ResearchSummary {
  state: ResearchState;
  hypotheses: ResearchHypothesisRecord[];
  artifacts: ResearchArtifactRecord[];
  synthesis: string;
}

interface SqliteMutationTarget {
  db: {
    prepare(sql: string): {
      run(...params: unknown[]): unknown;
    };
  };
}

function hasStructuredResearchAttributes(attributes: unknown): attributes is ResearchEntityAttributes {
  return Boolean(attributes && typeof attributes === "object" && "state" in attributes);
}

function isResearchArtifactPayload(payload: unknown): payload is ResearchArtifactPayload {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      typeof (payload as ResearchArtifactPayload).id === "string" &&
      typeof (payload as ResearchArtifactPayload).researchId === "string" &&
      typeof (payload as ResearchArtifactPayload).kind === "string" &&
      typeof (payload as ResearchArtifactPayload).title === "string" &&
      typeof (payload as ResearchArtifactPayload).artifactRef === "string" &&
      typeof (payload as ResearchArtifactPayload).createdAt === "string" &&
      typeof (payload as ResearchArtifactPayload).summary === "string" &&
      Array.isArray((payload as ResearchArtifactPayload).tags) &&
      Array.isArray((payload as ResearchArtifactPayload).linkedHypothesisIds) &&
      typeof (payload as ResearchArtifactPayload).body === "string",
  );
}

function latestHypotheses(history: ResearchHypothesisRecord[]): ResearchHypothesisRecord[] {
  const latest = new Map<string, ResearchHypothesisRecord>();
  for (const entry of history) {
    latest.set(entry.id, entry);
  }
  return [...latest.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function renderSynthesis(
  state: ResearchState,
  hypotheses: ResearchHypothesisRecord[],
  artifacts: ResearchArtifactRecord[],
): string {
  return renderResearchMarkdown(state, hypotheses, artifacts);
}

function summarizeResearch(
  state: ResearchState,
  hypotheses: ResearchHypothesisRecord[],
  artifacts: ResearchArtifactRecord[],
): ResearchSummary {
  return {
    id: state.researchId,
    title: state.title,
    status: state.status,
    hypothesisCount: hypotheses.length,
    artifactCount: artifacts.length,
    linkedInitiativeCount: state.initiativeIds.length,
    linkedSpecCount: state.specChangeIds.length,
    linkedTicketCount: state.ticketIds.length,
    updatedAt: state.updatedAt,
    tags: [...state.tags],
    ref: `research:${state.researchId}`,
  };
}

function sameList(left: string[], right: string[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function stripDynamicState(state: ResearchState): ResearchState {
  return {
    ...state,
    artifactIds: normalizeStringList(state.artifactIds),
  };
}

function buildResearchArtifactRef(
  researchId: string,
  kind: ResearchArtifactRecord["kind"],
  artifactId: string,
): string {
  return `research:${researchId}:artifact:${kind}:${artifactId}`;
}

function normalizeResearchRef(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Research reference is required");
  }
  const basename = trimmed.split(/[\\/]/).pop() ?? trimmed;
  const withoutExtension = basename.toLowerCase().endsWith(".md") ? basename.slice(0, -3) : basename;
  const withoutPrefix = withoutExtension.startsWith("research:")
    ? withoutExtension.slice("research:".length)
    : withoutExtension;
  const researchToken = withoutPrefix.split(":", 1)[0] ?? withoutPrefix;
  return normalizeResearchId(researchToken);
}

function summarizeArtifactPayload(payload: ResearchArtifactPayload): ResearchArtifactRecord {
  return {
    id: normalizeArtifactId(payload.id),
    researchId: normalizeResearchId(payload.researchId),
    kind: normalizeArtifactKind(payload.kind),
    title: payload.title.trim(),
    artifactRef: payload.artifactRef.trim(),
    createdAt: payload.createdAt,
    summary: payload.summary.trim(),
    sourceUri: normalizeOptionalString(payload.sourceUri),
    tags: normalizeStringList(payload.tags),
    linkedHypothesisIds: normalizeStringList(payload.linkedHypothesisIds),
  };
}

function toProjectedResearchArtifactInput(
  artifact: ResearchArtifactPayload,
): ProjectedArtifactInput<ResearchArtifactPayload> {
  return {
    artifactType: RESEARCH_ARTIFACT_TYPE,
    displayId: artifact.artifactRef,
    title: artifact.title,
    summary: artifact.summary,
    status: "active",
    tags: artifact.tags,
    payload: artifact,
  };
}

function buildProjectedReferenceLinks(state: ResearchState): ProjectedEntityLinkInput[] {
  return [
    ...state.initiativeIds.map(
      (targetDisplayId): ProjectedEntityLinkInput => ({
        kind: "references",
        targetKind: "initiative",
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
    ...state.supersedes.map(
      (targetDisplayId): ProjectedEntityLinkInput => ({
        kind: "references",
        targetKind: "research",
        targetDisplayId,
        required: false,
      }),
    ),
  ];
}

export class ResearchStore {
  readonly cwd: string;

  constructor(cwd: string) {
    this.cwd = resolve(cwd);
  }

  initLedger(): { initialized: true; root: string } {
    return { initialized: true, root: getLoomCatalogPaths().catalogPath };
  }

  private defaultState(input: CreateResearchInput, timestamp: string): ResearchState {
    const researchId = normalizeResearchId(input.researchId ?? slugifyTitle(input.title));
    return {
      researchId,
      title: input.title.trim(),
      status: "proposed",
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
      synthesizedAt: null,
      question: input.question?.trim() ?? input.title.trim(),
      objective: input.objective?.trim() ?? input.title.trim(),
      scope: normalizeStringList(input.scope),
      nonGoals: normalizeStringList(input.nonGoals),
      methodology: normalizeStringList(input.methodology),
      keywords: normalizeStringList(input.keywords),
      statusSummary: input.statusSummary?.trim() ?? "",
      conclusions: normalizeStringList(input.conclusions),
      recommendations: normalizeStringList(input.recommendations),
      openQuestions: normalizeStringList(input.openQuestions),
      initiativeIds: normalizeStringList(input.initiativeIds),
      specChangeIds: normalizeStringList(input.specChangeIds),
      ticketIds: normalizeStringList(input.ticketIds),
      capabilityIds: normalizeStringList(input.capabilityIds),
      artifactIds: [],
      sourceRefs: normalizeStringList(input.sourceRefs),
      supersedes: normalizeStringList(input.supersedes),
      tags: normalizeStringList(input.tags),
    };
  }

  private async loadArtifactPayloads(entityId: string): Promise<ResearchArtifactPayload[]> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const payloads: ResearchArtifactPayload[] = [];
    for (const entity of await storage.listEntities(identity.space.id, "artifact")) {
      if (!entity.displayId || !hasProjectedArtifactAttributes(entity.attributes)) {
        continue;
      }
      if (
        entity.attributes.projectionOwner !== RESEARCH_ARTIFACT_PROJECTION_OWNER ||
        entity.attributes.artifactType !== RESEARCH_ARTIFACT_TYPE ||
        entity.attributes.owner.entityId !== entityId ||
        !isResearchArtifactPayload(entity.attributes.payload)
      ) {
        continue;
      }
      payloads.push(entity.attributes.payload);
    }
    return payloads.sort((left, right) => left.id.localeCompare(right.id));
  }

  private async loadArtifactRecords(entityId: string): Promise<ResearchArtifactRecord[]> {
    const payloads = await this.loadArtifactPayloads(entityId);
    return payloads.map(summarizeArtifactPayload);
  }

  private async loadArtifactPayloadsByResearchId(researchId: string): Promise<ResearchArtifactPayload[]> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const entity = await findEntityByDisplayId(
      storage,
      identity.space.id,
      ENTITY_KIND,
      normalizeResearchId(researchId),
    );
    return entity ? this.loadArtifactPayloads(entity.id) : [];
  }

  private async listArtifactRecordsByResearchId(): Promise<Map<string, ResearchArtifactRecord[]>> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const grouped = new Map<string, ResearchArtifactRecord[]>();
    for (const entity of await storage.listEntities(identity.space.id, "artifact")) {
      if (
        entity.displayId === null ||
        !hasProjectedArtifactAttributes(entity.attributes) ||
        entity.attributes.projectionOwner !== RESEARCH_ARTIFACT_PROJECTION_OWNER ||
        entity.attributes.artifactType !== RESEARCH_ARTIFACT_TYPE ||
        !isResearchArtifactPayload(entity.attributes.payload)
      ) {
        continue;
      }
      const payload = entity.attributes.payload;
      const researchId = normalizeResearchId(payload.researchId);
      const artifacts = grouped.get(researchId) ?? [];
      artifacts.push(summarizeArtifactPayload(payload));
      grouped.set(researchId, artifacts);
    }
    for (const artifacts of grouped.values()) {
      artifacts.sort((left, right) => left.id.localeCompare(right.id));
    }
    return grouped;
  }

  private async materializeCanonicalArtifacts(
    state: ResearchState,
    hypothesisHistory: ResearchHypothesisRecord[],
    artifacts: ResearchArtifactRecord[],
  ): Promise<ResearchRecord> {
    const hypotheses = latestHypotheses(hypothesisHistory);
    const normalizedState = stripDynamicState({
      ...state,
      artifactIds: normalizeStringList(artifacts.map((artifact) => artifact.id)),
    });
    const summary = summarizeResearch(normalizedState, hypotheses, artifacts);
    const synthesis = renderSynthesis(normalizedState, hypotheses, artifacts);
    return {
      state: normalizedState,
      summary,
      synthesis,
      hypotheses,
      hypothesisHistory,
      artifacts,
      dashboard: await buildResearchDashboard(this.cwd, normalizedState, hypotheses, artifacts),
      map: await buildResearchMap(this.cwd, normalizedState, hypotheses, artifacts),
    };
  }

  private async loadRecord(ref: string): Promise<ResearchRecord> {
    this.initLedger();
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const researchId = normalizeResearchRef(ref);
    const entity = await findEntityByDisplayId(storage, identity.space.id, ENTITY_KIND, researchId);
    if (!entity) {
      throw new Error(`Unknown research: ${researchId}`);
    }
    if (!entity || !hasStructuredResearchAttributes(entity.attributes)) {
      throw new Error(`Research entity ${researchId} is missing structured attributes`);
    }
    const attributes = entity.attributes;
    return this.materializeCanonicalArtifacts(
      stripDynamicState(attributes.state),
      attributes.hypotheses ?? [],
      await this.loadArtifactRecords(entity.id),
    );
  }

  private async persistRecord(
    state: ResearchState,
    hypothesisHistory: ResearchHypothesisRecord[],
    artifacts: ResearchArtifactPayload[],
  ): Promise<ResearchRecord> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const existing = await findEntityByDisplayId(storage, identity.space.id, ENTITY_KIND, state.researchId);
    const version = (existing?.version ?? 0) + 1;
    const record = await this.materializeCanonicalArtifacts(
      stripDynamicState(state),
      hypothesisHistory,
      artifacts.map(summarizeArtifactPayload),
    );
    await storage.transact(async (tx) => {
      const entity = await upsertEntityByDisplayId(tx, {
        kind: ENTITY_KIND,
        spaceId: identity.space.id,
        owningRepositoryId: identity.repository.id,
        displayId: record.state.researchId,
        title: record.state.title,
        summary: record.state.statusSummary || record.state.question,
        status: record.state.status,
        version,
        tags: record.state.tags,
        attributes: {
          state: record.state,
          hypotheses: record.hypothesisHistory,
        },
        createdAt: existing?.createdAt ?? record.state.createdAt,
        updatedAt: record.state.updatedAt,
      });
      const basePayload = {
        entityKind: ENTITY_KIND,
        displayId: record.state.researchId,
        version: entity.version,
      } satisfies Record<string, unknown>;
      if (!existing) {
        await appendEntityEvent(
          tx,
          entity.id,
          "created",
          "research-store",
          { ...basePayload, status: entity.status, change: "research_persisted" },
          record.state.createdAt,
        );
      } else {
        if (existing.status !== entity.status) {
          await appendEntityEvent(
            tx,
            entity.id,
            "status_changed",
            "research-store",
            {
              ...basePayload,
              previousStatus: existing.status,
              nextStatus: entity.status,
            },
            record.state.updatedAt,
          );
        }
        await appendEntityEvent(
          tx,
          entity.id,
          "updated",
          "research-store",
          {
            ...basePayload,
            status: entity.status,
            previousVersion: existing.version,
            change: "research_persisted",
          },
          record.state.updatedAt,
        );
      }
      await syncProjectedEntityLinks({
        storage: tx,
        spaceId: identity.space.id,
        fromEntityId: entity.id,
        projectionOwner: RESEARCH_LINK_PROJECTION_OWNER,
        desired: buildProjectedReferenceLinks(record.state),
        timestamp: record.state.updatedAt,
      });
      await syncProjectedArtifacts({
        storage: tx,
        spaceId: identity.space.id,
        owningRepositoryId: identity.repository.id,
        owner: {
          entityId: entity.id,
          kind: ENTITY_KIND,
          displayId: record.state.researchId,
        },
        projectionOwner: RESEARCH_ARTIFACT_PROJECTION_OWNER,
        desired: artifacts.map(toProjectedResearchArtifactInput),
        timestamp: record.state.updatedAt,
        actor: "research-store",
      });
    });
    return record;
  }

  private applyListFilter(summary: ResearchSummaryWithSynthesis, filter: ResearchListFilter): boolean {
    if (!filter.includeArchived && summary.status === "archived") return false;
    if (filter.status && summary.status !== filter.status) return false;
    if (filter.tag && !summary.tags.includes(filter.tag)) return false;
    if (filter.keyword) {
      const normalizedKeyword = filter.keyword.trim().toLowerCase();
      if (!summary.state.keywords.some((keyword) => keyword.toLowerCase() === normalizedKeyword)) return false;
    }
    return true;
  }

  async listResearch(filter: ResearchListFilter = {}): Promise<ResearchSummary[]> {
    this.initLedger();
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const artifactsByResearchId = await this.listArtifactRecordsByResearchId();
    const summaries = new Map<string, ResearchSummaryWithSynthesis>();
    for (const entity of await storage.listEntities(identity.space.id, ENTITY_KIND)) {
      const researchId = normalizeResearchId(entity.displayId ?? entity.id);
      if (hasStructuredResearchAttributes(entity.attributes)) {
        const state = stripDynamicState(entity.attributes.state);
        const hypotheses = latestHypotheses(entity.attributes.hypotheses ?? []);
        const artifacts = artifactsByResearchId.get(researchId) ?? [];
        summaries.set(researchId, {
          ...summarizeResearch(state, hypotheses, artifacts),
          state,
          hypotheses,
          artifacts,
          synthesis: renderSynthesis(state, hypotheses, artifacts),
        });
        continue;
      }
      throw new Error(`Research entity ${researchId} is missing structured attributes`);
    }

    return filterAndSortListEntries(
      [...summaries.values()]
        .filter((summary) => this.applyListFilter(summary, filter))
        .map((summary) => ({
          item: summary,
          id: summary.id,
          createdAt: summary.state.createdAt,
          updatedAt: summary.updatedAt,
          fields: [
            { value: summary.id, weight: 10 },
            { value: summary.title, weight: 10 },
            { value: summary.state.question, weight: 9 },
            { value: summary.state.objective, weight: 8 },
            { value: summary.state.statusSummary, weight: 7 },
            { value: summary.state.keywords.join(" "), weight: 8 },
            { value: summary.state.tags.join(" "), weight: 7 },
            { value: summary.state.conclusions.join(" "), weight: 7 },
            { value: summary.state.recommendations.join(" "), weight: 7 },
            { value: summary.state.openQuestions.join(" "), weight: 5 },
            { value: summary.state.methodology.join(" "), weight: 4 },
            { value: summary.state.sourceRefs.join(" "), weight: 4 },
            { value: summary.state.initiativeIds.join(" "), weight: 3 },
            { value: summary.state.specChangeIds.join(" "), weight: 3 },
            { value: summary.state.ticketIds.join(" "), weight: 3 },
            { value: summary.state.capabilityIds.join(" "), weight: 3 },
            { value: summary.state.supersedes.join(" "), weight: 2 },
            {
              value: summary.hypotheses
                .map((hypothesis) =>
                  [
                    hypothesis.id,
                    hypothesis.statement,
                    hypothesis.evidence.join(" "),
                    hypothesis.results.join(" "),
                  ].join(" "),
                )
                .join(" "),
              weight: 4,
            },
            {
              value: summary.artifacts
                .map((artifact) =>
                  [
                    artifact.id,
                    artifact.kind,
                    artifact.title,
                    artifact.summary,
                    artifact.sourceUri,
                    artifact.tags.join(" "),
                  ].join(" "),
                )
                .join(" "),
              weight: 4,
            },
          ],
        })),
      { text: filter.text, sort: filter.sort },
    ).map(
      ({ state: _state, hypotheses: _hypotheses, artifacts: _artifacts, synthesis: _synthesis, ...summary }) => summary,
    );
  }

  async readResearch(ref: string): Promise<ResearchRecord> {
    return this.loadRecord(ref);
  }

  private async syncInitiativeMembership(researchId: string, previousIds: string[], nextIds: string[]): Promise<void> {
    const store = createInitiativeStore(this.cwd);
    const impactedIds = normalizeStringList([...previousIds, ...nextIds]);
    for (const initiativeId of impactedIds) {
      const initiative = await store.readInitiative(initiativeId);
      const shouldLink = nextIds.includes(initiativeId);
      const nextResearchIds = shouldLink
        ? normalizeStringList([...(initiative.state.researchIds ?? []), researchId])
        : (initiative.state.researchIds ?? []).filter((id) => id !== researchId);
      if (!sameList(nextResearchIds, initiative.state.researchIds ?? [])) {
        await store.setResearchIds(initiativeId, nextResearchIds);
      }
    }
  }

  private async syncSpecMembership(researchId: string, previousIds: string[], nextIds: string[]): Promise<void> {
    const store = createSpecStore(this.cwd);
    const impactedIds = normalizeStringList([...previousIds, ...nextIds]);
    for (const changeId of impactedIds) {
      const change = await store.readChange(changeId);
      const shouldLink = nextIds.includes(changeId);
      const nextResearchIds = shouldLink
        ? normalizeStringList([...(change.state.researchIds ?? []), researchId])
        : (change.state.researchIds ?? []).filter((id) => id !== researchId);
      if (!sameList(nextResearchIds, change.state.researchIds ?? [])) {
        await store.setResearchIds(changeId, nextResearchIds);
      }
    }
  }

  private async syncTicketMembership(researchId: string, previousIds: string[], nextIds: string[]): Promise<void> {
    const store = createTicketStore(this.cwd);
    const impactedIds = normalizeStringList([...previousIds, ...nextIds]);
    for (const ticketId of impactedIds) {
      const ticket = await store.readTicketAsync(ticketId);
      const shouldLink = nextIds.includes(ticketId);
      const nextResearchIds = shouldLink
        ? normalizeStringList([...(ticket.summary.researchIds ?? []), researchId])
        : (ticket.summary.researchIds ?? []).filter((id) => id !== researchId);
      if (!sameList(nextResearchIds, ticket.summary.researchIds ?? [])) {
        await store.setResearchIdsAsync(ticketId, nextResearchIds, { allowClosed: true });
      }
    }
  }

  private async syncLinkedEntities(
    researchId: string,
    previousInitiativeIds: string[],
    previousSpecIds: string[],
    previousTicketIds: string[],
    nextInitiativeIds: string[],
    nextSpecIds: string[],
    nextTicketIds: string[],
  ): Promise<void> {
    await this.syncInitiativeMembership(researchId, previousInitiativeIds, nextInitiativeIds);
    await this.syncSpecMembership(researchId, previousSpecIds, nextSpecIds);
    await this.syncTicketMembership(researchId, previousTicketIds, nextTicketIds);
  }

  async createResearch(input: CreateResearchInput): Promise<ResearchRecord> {
    const timestamp = currentTimestamp();
    const state = this.defaultState(input, timestamp);
    const stagedState: ResearchState = {
      ...state,
      initiativeIds: [],
      specChangeIds: [],
      ticketIds: [],
    };
    const staged = await this.persistRecord(stagedState, [], []);
    try {
      await this.syncLinkedEntities(
        state.researchId,
        [],
        [],
        [],
        state.initiativeIds,
        state.specChangeIds,
        state.ticketIds,
      );
      return this.persistRecord(state, [], []);
    } catch (error) {
      const { storage, identity } = await openWorkspaceStorage(this.cwd);
      const entity = await findEntityByDisplayId(storage, identity.space.id, ENTITY_KIND, staged.state.researchId);
      if (entity) {
        (storage as unknown as SqliteMutationTarget).db.prepare("DELETE FROM entities WHERE id = ?").run(entity.id);
      }
      throw error;
    }
  }

  async updateResearch(ref: string, updates: UpdateResearchInput): Promise<ResearchRecord> {
    const record = await this.loadRecord(ref);
    const state = { ...record.state };
    const previousInitiativeIds = [...state.initiativeIds];
    const previousSpecIds = [...state.specChangeIds];
    const previousTicketIds = [...state.ticketIds];
    if (updates.title !== undefined) state.title = updates.title.trim();
    if (updates.status !== undefined) {
      state.status = normalizeResearchStatus(updates.status);
      if (state.status === "archived") state.archivedAt = currentTimestamp();
      if (state.status === "synthesized") state.synthesizedAt = currentTimestamp();
    }
    if (updates.question !== undefined) state.question = updates.question.trim();
    if (updates.objective !== undefined) state.objective = updates.objective.trim();
    if (updates.scope !== undefined) state.scope = normalizeStringList(updates.scope);
    if (updates.nonGoals !== undefined) state.nonGoals = normalizeStringList(updates.nonGoals);
    if (updates.methodology !== undefined) state.methodology = normalizeStringList(updates.methodology);
    if (updates.keywords !== undefined) state.keywords = normalizeStringList(updates.keywords);
    if (updates.statusSummary !== undefined) state.statusSummary = updates.statusSummary.trim();
    if (updates.conclusions !== undefined) state.conclusions = normalizeStringList(updates.conclusions);
    if (updates.recommendations !== undefined) state.recommendations = normalizeStringList(updates.recommendations);
    if (updates.openQuestions !== undefined) state.openQuestions = normalizeStringList(updates.openQuestions);
    if (updates.initiativeIds !== undefined) state.initiativeIds = normalizeStringList(updates.initiativeIds);
    if (updates.specChangeIds !== undefined) state.specChangeIds = normalizeStringList(updates.specChangeIds);
    if (updates.ticketIds !== undefined) state.ticketIds = normalizeStringList(updates.ticketIds);
    if (updates.capabilityIds !== undefined) state.capabilityIds = normalizeStringList(updates.capabilityIds);
    if (updates.sourceRefs !== undefined) state.sourceRefs = normalizeStringList(updates.sourceRefs);
    if (updates.supersedes !== undefined) state.supersedes = normalizeStringList(updates.supersedes);
    if (updates.tags !== undefined) state.tags = normalizeStringList(updates.tags);
    state.updatedAt = currentTimestamp();
    await this.syncLinkedEntities(
      state.researchId,
      previousInitiativeIds,
      previousSpecIds,
      previousTicketIds,
      state.initiativeIds,
      state.specChangeIds,
      state.ticketIds,
    );
    return this.persistRecord(
      state,
      record.hypothesisHistory,
      await this.loadArtifactPayloadsByResearchId(record.state.researchId),
    );
  }

  async recordHypothesis(ref: string, input: ResearchHypothesisInput): Promise<ResearchRecord> {
    const record = await this.loadRecord(ref);
    const history = [...record.hypothesisHistory];
    const normalizedInputId = input.id ? normalizeHypothesisId(input.id) : null;
    const current = normalizedInputId
      ? latestHypotheses(history).find((entry) => entry.id === normalizedInputId)
      : null;
    const timestamp = currentTimestamp();
    const entry: ResearchHypothesisRecord = {
      id:
        current?.id ??
        normalizeHypothesisId(
          input.id ??
            nextSequenceId(
              history.map((candidate) => candidate.id),
              "hyp",
            ),
        ),
      researchId: record.state.researchId,
      statement: input.statement.trim(),
      status: normalizeHypothesisStatus(input.status),
      confidence: normalizeHypothesisConfidence(input.confidence),
      evidence: normalizeStringList(input.evidence),
      results: normalizeStringList(input.results),
      createdAt: current?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    history.push(entry);
    const state = { ...record.state, updatedAt: timestamp };
    const persisted = await this.persistRecord(
      state,
      history,
      await this.loadArtifactPayloadsByResearchId(record.state.researchId),
    );
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const entity = await findEntityByDisplayId(storage, identity.space.id, ENTITY_KIND, persisted.state.researchId);
    if (entity) {
      await appendEntityEvent(
        storage,
        entity.id,
        "updated",
        "research-store",
        {
          change: "research_hypothesis_recorded",
          action: current ? "updated" : "created",
          hypothesisId: entry.id,
          status: entry.status,
          confidence: entry.confidence,
          hypothesis: entry,
        },
        timestamp,
      );
    }
    return persisted;
  }

  async recordArtifact(ref: string, input: ResearchArtifactInput): Promise<ResearchRecord> {
    const record = await this.loadRecord(ref);
    const timestamp = currentTimestamp();
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const researchEntity = await findEntityByDisplayId(
      storage,
      identity.space.id,
      ENTITY_KIND,
      record.state.researchId,
    );
    if (!researchEntity) {
      throw new Error(`Research entity ${record.state.researchId} is missing structured attributes`);
    }
    const artifacts = await this.loadArtifactPayloads(researchEntity.id);
    const normalizedId = input.id
      ? normalizeArtifactId(input.id)
      : nextSequenceId(
          artifacts.map((artifact) => artifact.id),
          "artifact",
        );
    const kind = normalizeArtifactKind(input.kind);
    const existing = artifacts.find((artifact) => artifact.id === normalizedId) ?? null;
    const artifact: ResearchArtifactPayload = {
      id: normalizedId,
      researchId: record.state.researchId,
      kind,
      title: input.title.trim(),
      artifactRef: buildResearchArtifactRef(record.state.researchId, kind, normalizedId),
      createdAt: existing?.createdAt ?? timestamp,
      summary: input.summary?.trim() ?? existing?.summary ?? "",
      body: input.body?.trim() ?? existing?.body ?? "",
      sourceUri: normalizeOptionalString(input.sourceUri ?? existing?.sourceUri ?? null),
      tags: normalizeStringList(input.tags ?? existing?.tags),
      linkedHypothesisIds: normalizeStringList(input.linkedHypothesisIds ?? existing?.linkedHypothesisIds),
    };
    const nextArtifacts = [...artifacts.filter((entry) => entry.id !== artifact.id), artifact].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    const state = { ...record.state, updatedAt: timestamp };
    const persisted = await this.persistRecord(state, record.hypothesisHistory, nextArtifacts);
    await appendEntityEvent(
      storage,
      researchEntity.id,
      "updated",
      "research-store",
      {
        change: "research_artifact_recorded",
        action: existing ? "updated" : "created",
        artifactId: artifact.id,
        artifactKind: artifact.kind,
        artifactRef: artifact.artifactRef,
        artifact: summarizeArtifactPayload(artifact),
      },
      timestamp,
    );
    return persisted;
  }

  async linkInitiative(ref: string, initiativeId: string): Promise<ResearchRecord> {
    const record = await this.loadRecord(ref);
    const state = {
      ...record.state,
      initiativeIds: normalizeStringList([...record.state.initiativeIds, initiativeId]),
      updatedAt: currentTimestamp(),
    };
    await this.syncInitiativeMembership(record.state.researchId, record.state.initiativeIds, state.initiativeIds);
    return this.persistRecord(
      state,
      record.hypothesisHistory,
      await this.loadArtifactPayloadsByResearchId(record.state.researchId),
    );
  }

  async unlinkInitiative(ref: string, initiativeId: string): Promise<ResearchRecord> {
    const record = await this.loadRecord(ref);
    const state = {
      ...record.state,
      initiativeIds: record.state.initiativeIds.filter((id) => id !== initiativeId.trim()),
      updatedAt: currentTimestamp(),
    };
    await this.syncInitiativeMembership(record.state.researchId, record.state.initiativeIds, state.initiativeIds);
    return this.persistRecord(
      state,
      record.hypothesisHistory,
      await this.loadArtifactPayloadsByResearchId(record.state.researchId),
    );
  }

  async linkSpec(ref: string, changeId: string): Promise<ResearchRecord> {
    const record = await this.loadRecord(ref);
    const state = {
      ...record.state,
      specChangeIds: normalizeStringList([...record.state.specChangeIds, changeId]),
      updatedAt: currentTimestamp(),
    };
    await this.syncSpecMembership(record.state.researchId, record.state.specChangeIds, state.specChangeIds);
    return this.persistRecord(
      state,
      record.hypothesisHistory,
      await this.loadArtifactPayloadsByResearchId(record.state.researchId),
    );
  }

  async unlinkSpec(ref: string, changeId: string): Promise<ResearchRecord> {
    const record = await this.loadRecord(ref);
    const state = {
      ...record.state,
      specChangeIds: record.state.specChangeIds.filter((id) => id !== changeId.trim()),
      updatedAt: currentTimestamp(),
    };
    await this.syncSpecMembership(record.state.researchId, record.state.specChangeIds, state.specChangeIds);
    return this.persistRecord(
      state,
      record.hypothesisHistory,
      await this.loadArtifactPayloadsByResearchId(record.state.researchId),
    );
  }

  async linkTicket(ref: string, ticketId: string): Promise<ResearchRecord> {
    const record = await this.loadRecord(ref);
    const state = {
      ...record.state,
      ticketIds: normalizeStringList([...record.state.ticketIds, ticketId]),
      updatedAt: currentTimestamp(),
    };
    await this.syncTicketMembership(record.state.researchId, record.state.ticketIds, state.ticketIds);
    return this.persistRecord(
      state,
      record.hypothesisHistory,
      await this.loadArtifactPayloadsByResearchId(record.state.researchId),
    );
  }

  async unlinkTicket(ref: string, ticketId: string): Promise<ResearchRecord> {
    const record = await this.loadRecord(ref);
    const state = {
      ...record.state,
      ticketIds: record.state.ticketIds.filter((id) => id !== ticketId.trim()),
      updatedAt: currentTimestamp(),
    };
    await this.syncTicketMembership(record.state.researchId, record.state.ticketIds, state.ticketIds);
    return this.persistRecord(
      state,
      record.hypothesisHistory,
      await this.loadArtifactPayloadsByResearchId(record.state.researchId),
    );
  }

  async archiveResearch(ref: string): Promise<ResearchRecord> {
    return this.updateResearch(ref, { status: "archived" });
  }
}

export function createResearchStore(cwd: string): ResearchStore {
  return new ResearchStore(cwd);
}
