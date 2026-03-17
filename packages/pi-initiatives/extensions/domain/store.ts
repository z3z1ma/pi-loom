import { appendEntityEvent, findEntityByDisplayId, upsertEntityByDisplayId } from "@pi-loom/pi-storage/storage/entities.js";
import { findOrBootstrapEntityByDisplayId, openWorkspaceStorage } from "@pi-loom/pi-storage/storage/workspace.js";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { createConstitutionalStore } from "@pi-loom/pi-constitution/extensions/domain/store.js";
import { createSpecStore } from "@pi-loom/pi-specs/extensions/domain/store.js";
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
import {
  getInitiativeBriefPath,
  getInitiativeDecisionsPath,
  getInitiativeDir,
  getInitiativesPaths,
} from "./paths.js";
import { renderInitiativeMarkdown } from "./render.js";

const ENTITY_KIND = "initiative" as const;

interface InitiativeEntityAttributes {
  state: InitiativeState;
  decisions: InitiativeDecisionRecord[];
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

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function readText(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

function relativeOrAbsolute(cwd: string, filePath: string): string {
  const relativePath = relative(cwd, filePath);
  return relativePath || filePath;
}

function summarizeInitiative(cwd: string, state: InitiativeState, path: string): InitiativeSummary {
  return {
    id: state.initiativeId,
    title: state.title,
    status: state.status,
    milestoneCount: state.milestones.length,
    specChangeCount: state.specChangeIds.length,
    ticketCount: state.ticketIds.length,
    updatedAt: state.updatedAt,
    tags: [...state.tags],
    path: relativeOrAbsolute(cwd, path),
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

export class InitiativeStore {
  readonly cwd: string;

  constructor(cwd: string) {
    this.cwd = resolve(cwd);
  }

  initLedger(): { initialized: true; root: string } {
    const paths = getInitiativesPaths(this.cwd);
    ensureDir(paths.initiativesDir);
    return { initialized: true, root: paths.initiativesDir };
  }

  private defaultState(input: CreateInitiativeInput, timestamp: string): InitiativeState {
    const initiativeId = normalizeInitiativeId(input.initiativeId ?? slugifyTitle(input.title));
    const roadmapRefs = createConstitutionalStore(this.cwd).validateRoadmapRefsProjection(input.roadmapRefs ?? []);
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
      researchIds: [],
      specChangeIds: normalizeStringList(input.specChangeIds),
      ticketIds: normalizeStringList(input.ticketIds),
      capabilityIds: normalizeStringList(input.capabilityIds),
      supersedes: normalizeStringList(input.supersedes),
      roadmapRefs,
    };
  }

  private initiativeDirectories(): string[] {
    const directory = getInitiativesPaths(this.cwd).initiativesDir;
    if (!existsSync(directory)) {
      return [];
    }
    return readdirSync(directory)
      .map((entry) => join(directory, entry))
      .filter((pathValue) => statSync(pathValue).isDirectory())
      .sort((left, right) => basename(left).localeCompare(basename(right)));
  }

  private resolveInitiativeDirectory(ref: string): string {
    const directId = normalizeInitiativeId(ref.split(/[\\/]/).pop() ?? ref);
    return getInitiativeDir(this.cwd, directId);
  }

  private readStateFromFiles(initiativeId: string): InitiativeState {
    const state = readJson<InitiativeState>(join(getInitiativeDir(this.cwd, initiativeId), "state.json"));
    return {
      ...state,
      status: normalizeStatus(state.status),
      objective: state.objective ?? "",
      outcomes: normalizeStringList(state.outcomes),
      scope: normalizeStringList(state.scope),
      nonGoals: normalizeStringList(state.nonGoals),
      successMetrics: normalizeStringList(state.successMetrics),
      milestones: state.milestones.map((milestone) => ({
        id: normalizeMilestoneId(milestone.id),
        title: milestone.title.trim(),
        status: normalizeMilestoneStatus(milestone.status),
        description: milestone.description ?? "",
        specChangeIds: normalizeStringList(milestone.specChangeIds),
        ticketIds: normalizeStringList(milestone.ticketIds),
      })),
      risks: normalizeStringList(state.risks),
      statusSummary: state.statusSummary ?? "",
      targetWindow: normalizeOptionalString(state.targetWindow),
      owners: normalizeStringList(state.owners),
      tags: normalizeStringList(state.tags),
      researchIds: normalizeStringList(state.researchIds),
      specChangeIds: normalizeStringList(state.specChangeIds),
      ticketIds: normalizeStringList(state.ticketIds),
      capabilityIds: normalizeStringList(state.capabilityIds),
      supersedes: normalizeStringList(state.supersedes),
      roadmapRefs: normalizeStringList(state.roadmapRefs),
    };
  }

  private readDecisionLogFromFiles(initiativeId: string): InitiativeDecisionRecord[] {
    const decisionPath = getInitiativeDecisionsPath(this.cwd, initiativeId);
    if (!existsSync(decisionPath)) {
      return [];
    }
    return readFileSync(decisionPath, "utf-8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as InitiativeDecisionRecord);
  }

  private materializeArtifacts(state: InitiativeState, decisions: InitiativeDecisionRecord[]): InitiativeRecord {
    const initiativeDir = getInitiativeDir(this.cwd, state.initiativeId);
    const dashboard = buildInitiativeDashboard(this.cwd, state);
    writeFileAtomic(getInitiativeBriefPath(this.cwd, state.initiativeId), renderInitiativeMarkdown(state, decisions, dashboard));
    writeJson(join(initiativeDir, "state.json"), state);
    writeFileAtomic(
      getInitiativeDecisionsPath(this.cwd, state.initiativeId),
      `${decisions.map((decision) => JSON.stringify(decision)).join("\n")}${decisions.length > 0 ? "\n" : ""}`,
    );
    return {
      state,
      summary: summarizeInitiative(this.cwd, state, initiativeDir),
      brief: readText(getInitiativeBriefPath(this.cwd, state.initiativeId)),
      decisions,
      dashboard,
    };
  }

  private async loadRecord(ref: string): Promise<InitiativeRecord> {
    this.initLedger();
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const initiativeId = normalizeInitiativeId(ref.split(/[\\/]/).pop() ?? ref);
    let entity = await findOrBootstrapEntityByDisplayId(this.cwd, storage, identity.space.id, ENTITY_KIND, initiativeId);
    if (!entity) {
      const timestamp = currentTimestamp();
      const state = this.defaultState({ title: initiativeId, initiativeId }, timestamp);
      entity = await upsertEntityByDisplayId(storage, {
        kind: ENTITY_KIND,
        spaceId: identity.space.id,
        owningRepositoryId: identity.repository.id,
        displayId: state.initiativeId,
        title: state.title,
        summary: state.statusSummary || state.objective,
        status: state.status,
        version: 1,
        tags: state.tags,
        pathScopes: [
          { repositoryId: identity.repository.id, relativePath: `.loom/initiatives/${state.initiativeId}/initiative.md`, role: "projection" },
        ],
        attributes: { state, decisions: [] },
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
      });
    }
    const attributes = entity.attributes as unknown as InitiativeEntityAttributes;
    const state = attributes?.state ?? this.defaultState({ title: initiativeId, initiativeId }, currentTimestamp());
    return this.materializeArtifacts(state, attributes?.decisions ?? []);
  }

  private async persistRecord(state: InitiativeState, decisions: InitiativeDecisionRecord[]): Promise<InitiativeRecord> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const existing = await findEntityByDisplayId(storage, identity.space.id, ENTITY_KIND, state.initiativeId);
    const version = (existing?.version ?? 0) + 1;
    const record = this.materializeArtifacts(state, decisions);
    await upsertEntityByDisplayId(storage, {
      kind: ENTITY_KIND,
      spaceId: identity.space.id,
      owningRepositoryId: identity.repository.id,
      displayId: record.state.initiativeId,
      title: record.state.title,
      summary: record.state.statusSummary || record.state.objective,
      status: record.state.status,
      version,
      tags: record.state.tags,
      pathScopes: [
        { repositoryId: identity.repository.id, relativePath: `.loom/initiatives/${record.state.initiativeId}/initiative.md`, role: "projection" },
      ],
      attributes: { state: record.state, decisions: record.decisions },
      createdAt: existing?.createdAt ?? record.state.createdAt,
      updatedAt: record.state.updatedAt,
    });
    return record;
  }

  private async syncSpecMembership(initiativeId: string, previousIds: string[], nextIds: string[]): Promise<void> {
    const store = createSpecStore(this.cwd);
    const impactedIds = normalizeStringList([...previousIds, ...nextIds]);
    for (const changeId of impactedIds) {
      const change = await store.readChange(changeId);
      const shouldLink = nextIds.includes(changeId);
      const nextInitiativeIds = shouldLink
        ? normalizeStringList([...change.state.initiativeIds, initiativeId])
        : change.state.initiativeIds.filter((id) => id !== initiativeId);
      if (JSON.stringify(nextInitiativeIds) !== JSON.stringify(change.state.initiativeIds)) {
        await store.setInitiativeIds(changeId, nextInitiativeIds);
      }
    }
  }

  private syncTicketMembership(initiativeId: string, previousIds: string[], nextIds: string[]): void {
    const store = createTicketStore(this.cwd);
    const impactedIds = normalizeStringList([...previousIds, ...nextIds]);
    for (const ticketId of impactedIds) {
      const ticket = store.readTicketProjection(ticketId);
      const shouldLink = nextIds.includes(ticketId);
      const nextInitiativeIds = shouldLink
        ? normalizeStringList([...ticket.summary.initiativeIds, initiativeId])
        : ticket.summary.initiativeIds.filter((id) => id !== initiativeId);
      if (JSON.stringify(nextInitiativeIds) !== JSON.stringify(ticket.summary.initiativeIds)) {
        store.setInitiativeIdsProjection(ticketId, nextInitiativeIds);
      }
    }
  }

  private syncRoadmapMembership(initiativeId: string, previousRefs: string[], nextRefs: string[]): void {
    const store = createConstitutionalStore(this.cwd);
    const impactedRefs = normalizeStringList([...previousRefs, ...nextRefs]);
    for (const roadmapRef of impactedRefs) {
      const item = store.readRoadmapItemProjection(roadmapRef);
      const shouldLink = nextRefs.includes(roadmapRef);
      const nextInitiativeIds = shouldLink
        ? normalizeStringList([...item.initiativeIds, initiativeId])
        : item.initiativeIds.filter((id) => id !== initiativeId);
      if (JSON.stringify(nextInitiativeIds) !== JSON.stringify(item.initiativeIds)) {
        store.upsertRoadmapItemProjection({ id: item.id, initiativeIds: nextInitiativeIds });
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
    this.syncRoadmapMembership(initiativeId, previousRoadmapRefs, nextRoadmapRefs);
    await this.syncSpecMembership(initiativeId, previousSpecIds, nextSpecIds);
    this.syncTicketMembership(initiativeId, previousTicketIds, nextTicketIds);
  }

  listInitiatives(filter: InitiativeListFilter = {}): InitiativeSummary[] {
    this.initLedger();
    return this.initiativeDirectories()
      .map((pathValue) => summarizeInitiative(this.cwd, this.readStateFromFiles(basename(pathValue)), pathValue))
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

  readInitiativeProjection(ref: string): InitiativeRecord {
    this.initLedger();
    const initiativeId = normalizeInitiativeId(ref.split(/[\\/]/).pop() ?? ref);
    return this.materializeArtifacts(this.readStateFromFiles(initiativeId), this.readDecisionLogFromFiles(initiativeId));
  }

  async createInitiative(input: CreateInitiativeInput): Promise<InitiativeRecord> {
    this.initLedger();
    const timestamp = currentTimestamp();
    const state = this.defaultState(input, timestamp);
    const initiativeDir = getInitiativeDir(this.cwd, state.initiativeId);
    ensureDir(initiativeDir);
    await this.syncLinkedEntities(state.initiativeId, [], [], [], state.roadmapRefs, state.specChangeIds, state.ticketIds);
    return this.persistRecord(state, []);
  }

  async updateInitiative(ref: string, updates: UpdateInitiativeInput): Promise<InitiativeRecord> {
    const record = await this.loadRecord(ref);
    const state = { ...record.state };
    const previousRoadmapRefs = [...state.roadmapRefs];
    const previousSpecIds = [...state.specChangeIds];
    const previousTicketIds = [...state.ticketIds];
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
    if (updates.specChangeIds !== undefined) state.specChangeIds = normalizeStringList(updates.specChangeIds);
    if (updates.ticketIds !== undefined) state.ticketIds = normalizeStringList(updates.ticketIds);
    if (updates.capabilityIds !== undefined) state.capabilityIds = normalizeStringList(updates.capabilityIds);
    if (updates.supersedes !== undefined) state.supersedes = normalizeStringList(updates.supersedes);
    if (updates.roadmapRefs !== undefined) {
      state.roadmapRefs = createConstitutionalStore(this.cwd).validateRoadmapRefsProjection(updates.roadmapRefs);
    }
    state.updatedAt = currentTimestamp();
    await this.syncLinkedEntities(
      state.initiativeId,
      previousRoadmapRefs,
      previousSpecIds,
      previousTicketIds,
      state.roadmapRefs,
      state.specChangeIds,
      state.ticketIds,
    );
    return this.persistRecord(state, record.decisions);
  }

  async setResearchIds(ref: string, researchIds: string[]): Promise<InitiativeRecord> {
    const record = await this.loadRecord(ref);
    const state = { ...record.state, researchIds: normalizeStringList(researchIds), updatedAt: currentTimestamp() };
    return this.persistRecord(state, record.decisions);
  }

  setResearchIdsProjection(ref: string, researchIds: string[]): InitiativeRecord {
    const record = this.readInitiativeProjection(ref);
    const state = { ...record.state, researchIds: normalizeStringList(researchIds), updatedAt: currentTimestamp() };
    return this.materializeArtifacts(state, record.decisions);
  }

  async recordDecision(
    ref: string,
    question: string,
    answer: string,
    kind: InitiativeDecisionKind = "decision",
  ): Promise<InitiativeRecord> {
    const record = await this.loadRecord(ref);
    const decision: InitiativeDecisionRecord = {
      id: nextSequenceId(record.decisions.map((entry) => entry.id), "decision"),
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
      await appendEntityEvent(storage, entity.id, "decision_recorded", "initiative-store", { decision }, decision.createdAt);
    }
    return persisted;
  }

  async linkSpec(ref: string, specChangeId: string): Promise<InitiativeRecord> {
    const record = await this.loadRecord(ref);
    const previousSpecIds = [...record.state.specChangeIds];
    const state = {
      ...record.state,
      specChangeIds: normalizeStringList([...record.state.specChangeIds, specChangeId]),
      updatedAt: currentTimestamp(),
    };
    await this.syncSpecMembership(record.state.initiativeId, previousSpecIds, state.specChangeIds);
    return this.persistRecord(state, record.decisions);
  }

  async unlinkSpec(ref: string, specChangeId: string): Promise<InitiativeRecord> {
    const record = await this.loadRecord(ref);
    const previousSpecIds = [...record.state.specChangeIds];
    const state = {
      ...record.state,
      specChangeIds: record.state.specChangeIds.filter((id) => id !== specChangeId.trim()),
      updatedAt: currentTimestamp(),
    };
    await this.syncSpecMembership(record.state.initiativeId, previousSpecIds, state.specChangeIds);
    return this.persistRecord(state, record.decisions);
  }

  async linkTicket(ref: string, ticketId: string): Promise<InitiativeRecord> {
    const record = await this.loadRecord(ref);
    const previousTicketIds = [...record.state.ticketIds];
    const state = {
      ...record.state,
      ticketIds: normalizeStringList([...record.state.ticketIds, ticketId]),
      updatedAt: currentTimestamp(),
    };
    this.syncTicketMembership(record.state.initiativeId, previousTicketIds, state.ticketIds);
    return this.persistRecord(state, record.decisions);
  }

  async unlinkTicket(ref: string, ticketId: string): Promise<InitiativeRecord> {
    const record = await this.loadRecord(ref);
    const previousTicketIds = [...record.state.ticketIds];
    const state = {
      ...record.state,
      ticketIds: record.state.ticketIds.filter((id) => id !== ticketId.trim()),
      updatedAt: currentTimestamp(),
    };
    this.syncTicketMembership(record.state.initiativeId, previousTicketIds, state.ticketIds);
    return this.persistRecord(state, record.decisions);
  }

  async upsertMilestone(ref: string, input: InitiativeMilestoneInput): Promise<InitiativeRecord> {
    const record = await this.loadRecord(ref);
    const state = { ...record.state };
    const milestone = normalizeMilestone(input, state.milestones.map((existing) => existing.id));
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
