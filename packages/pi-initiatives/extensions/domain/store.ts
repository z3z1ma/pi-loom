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
  getInitiativeDashboardPath,
  getInitiativeDecisionsPath,
  getInitiativeDir,
  getInitiativesPaths,
} from "./paths.js";
import { renderInitiativeMarkdown } from "./render.js";

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
    const roadmapRefs = createConstitutionalStore(this.cwd).validateRoadmapRefs(input.roadmapRefs ?? []);
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

  private writeState(initiativeDir: string, state: InitiativeState): void {
    writeJson(join(initiativeDir, "state.json"), state);
  }

  private readState(initiativeDir: string): InitiativeState {
    const state = readJson<InitiativeState>(join(initiativeDir, "state.json"));
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
      // Persisted initiatives may outlive linked roadmap items; preserve stale refs so the dashboard can report them.
      roadmapRefs: normalizeStringList(state.roadmapRefs),
    };
  }

  private initiativeDirectories(): string[] {
    const directory = getInitiativesPaths(this.cwd).initiativesDir;
    if (!existsSync(directory)) {
      return [];
    }
    return readdirSync(directory)
      .map((entry) => join(directory, entry))
      .filter((path) => statSync(path).isDirectory())
      .sort((left, right) => basename(left).localeCompare(basename(right)));
  }

  private resolveInitiativeDirectory(ref: string): string {
    const directId = normalizeInitiativeId(ref.split(/[\\/]/).pop() ?? ref);
    const directPath = getInitiativeDir(this.cwd, directId);
    if (existsSync(join(directPath, "state.json"))) {
      return directPath;
    }
    throw new Error(`Unknown initiative: ${ref}`);
  }

  private readDecisionLog(initiativeDir: string): InitiativeDecisionRecord[] {
    const path = join(initiativeDir, "decisions.jsonl");
    if (!existsSync(path)) {
      return [];
    }
    return readFileSync(path, "utf-8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as InitiativeDecisionRecord);
  }

  private syncSpecMembership(initiativeId: string, previousIds: string[], nextIds: string[]): void {
    const store = createSpecStore(this.cwd);
    const impactedIds = normalizeStringList([...previousIds, ...nextIds]);
    for (const changeId of impactedIds) {
      const change = store.readChange(changeId);
      const shouldLink = nextIds.includes(changeId);
      const nextInitiativeIds = shouldLink
        ? normalizeStringList([...change.state.initiativeIds, initiativeId])
        : change.state.initiativeIds.filter((id) => id !== initiativeId);
      if (JSON.stringify(nextInitiativeIds) !== JSON.stringify(change.state.initiativeIds)) {
        store.setInitiativeIds(changeId, nextInitiativeIds);
      }
    }
  }

  private syncTicketMembership(initiativeId: string, previousIds: string[], nextIds: string[]): void {
    const store = createTicketStore(this.cwd);
    const impactedIds = normalizeStringList([...previousIds, ...nextIds]);
    for (const ticketId of impactedIds) {
      const ticket = store.readTicket(ticketId);
      const shouldLink = nextIds.includes(ticketId);
      const nextInitiativeIds = shouldLink
        ? normalizeStringList([...ticket.summary.initiativeIds, initiativeId])
        : ticket.summary.initiativeIds.filter((id) => id !== initiativeId);
      if (JSON.stringify(nextInitiativeIds) !== JSON.stringify(ticket.summary.initiativeIds)) {
        store.setInitiativeIds(ticketId, nextInitiativeIds);
      }
    }
  }

  private syncRoadmapMembership(initiativeId: string, previousRefs: string[], nextRefs: string[]): void {
    const store = createConstitutionalStore(this.cwd);
    const impactedRefs = normalizeStringList([...previousRefs, ...nextRefs]);
    for (const roadmapRef of impactedRefs) {
      const item = store.readRoadmapItem(roadmapRef);
      const shouldLink = nextRefs.includes(roadmapRef);
      const nextInitiativeIds = shouldLink
        ? normalizeStringList([...item.initiativeIds, initiativeId])
        : item.initiativeIds.filter((id) => id !== initiativeId);
      if (JSON.stringify(nextInitiativeIds) !== JSON.stringify(item.initiativeIds)) {
        store.upsertRoadmapItem({ id: item.id, initiativeIds: nextInitiativeIds });
      }
    }
  }

  private syncLinkedEntities(
    initiativeId: string,
    previousRoadmapRefs: string[],
    previousSpecIds: string[],
    previousTicketIds: string[],
    nextRoadmapRefs: string[],
    nextSpecIds: string[],
    nextTicketIds: string[],
  ): void {
    this.syncRoadmapMembership(initiativeId, previousRoadmapRefs, nextRoadmapRefs);
    this.syncSpecMembership(initiativeId, previousSpecIds, nextSpecIds);
    this.syncTicketMembership(initiativeId, previousTicketIds, nextTicketIds);
  }

  private syncArtifacts(initiativeDir: string, state: InitiativeState): InitiativeRecord {
    const decisions = this.readDecisionLog(initiativeDir);
    const dashboard = buildInitiativeDashboard(this.cwd, state);
    writeFileAtomic(
      getInitiativeBriefPath(this.cwd, state.initiativeId),
      renderInitiativeMarkdown(state, decisions, dashboard),
    );
    this.writeState(initiativeDir, state);
    writeJson(getInitiativeDashboardPath(this.cwd, state.initiativeId), dashboard);
    return {
      state,
      summary: summarizeInitiative(this.cwd, state, initiativeDir),
      brief: readText(getInitiativeBriefPath(this.cwd, state.initiativeId)),
      decisions,
      dashboard,
    };
  }

  listInitiatives(filter: InitiativeListFilter = {}): InitiativeSummary[] {
    this.initLedger();
    return this.initiativeDirectories()
      .map((path) => summarizeInitiative(this.cwd, this.readState(path), path))
      .filter((summary) => {
        if (!filter.includeArchived && summary.status === "archived") {
          return false;
        }
        if (filter.status && summary.status !== filter.status) {
          return false;
        }
        if (filter.tag && !summary.tags.includes(filter.tag)) {
          return false;
        }
        if (filter.text) {
          const haystack = `${summary.id} ${summary.title}`.toLowerCase();
          if (!haystack.includes(filter.text.toLowerCase())) {
            return false;
          }
        }
        return true;
      })
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  readInitiative(ref: string): InitiativeRecord {
    this.initLedger();
    const path = this.resolveInitiativeDirectory(ref);
    const state = this.readState(path);
    return this.syncArtifacts(path, state);
  }

  createInitiative(input: CreateInitiativeInput): InitiativeRecord {
    this.initLedger();
    const timestamp = currentTimestamp();
    const state = this.defaultState(input, timestamp);
    const initiativeDir = getInitiativeDir(this.cwd, state.initiativeId);
    if (existsSync(join(initiativeDir, "state.json"))) {
      throw new Error(`Initiative already exists: ${state.initiativeId}`);
    }
    ensureDir(initiativeDir);
    writeFileAtomic(getInitiativeDecisionsPath(this.cwd, state.initiativeId), "");
    this.syncLinkedEntities(state.initiativeId, [], [], [], state.roadmapRefs, state.specChangeIds, state.ticketIds);
    return this.syncArtifacts(initiativeDir, state);
  }

  updateInitiative(ref: string, updates: UpdateInitiativeInput): InitiativeRecord {
    const initiativeDir = this.resolveInitiativeDirectory(ref);
    const state = this.readState(initiativeDir);
    const previousRoadmapRefs = [...state.roadmapRefs];
    const previousSpecIds = [...state.specChangeIds];
    const previousTicketIds = [...state.ticketIds];
    if (updates.title !== undefined) state.title = updates.title.trim();
    if (updates.status !== undefined) {
      state.status = normalizeStatus(updates.status);
      if (state.status === "completed") {
        state.completedAt = currentTimestamp();
      }
      if (state.status === "archived") {
        state.archivedAt = currentTimestamp();
      }
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
    if (updates.roadmapRefs !== undefined)
      state.roadmapRefs = createConstitutionalStore(this.cwd).validateRoadmapRefs(updates.roadmapRefs);
    state.updatedAt = currentTimestamp();
    this.syncLinkedEntities(
      state.initiativeId,
      previousRoadmapRefs,
      previousSpecIds,
      previousTicketIds,
      state.roadmapRefs,
      state.specChangeIds,
      state.ticketIds,
    );
    return this.syncArtifacts(initiativeDir, state);
  }

  setResearchIds(ref: string, researchIds: string[]): InitiativeRecord {
    const initiativeDir = this.resolveInitiativeDirectory(ref);
    const state = this.readState(initiativeDir);
    state.researchIds = normalizeStringList(researchIds);
    state.updatedAt = currentTimestamp();
    return this.syncArtifacts(initiativeDir, state);
  }

  recordDecision(
    ref: string,
    question: string,
    answer: string,
    kind: InitiativeDecisionKind = "decision",
  ): InitiativeRecord {
    const initiativeDir = this.resolveInitiativeDirectory(ref);
    const state = this.readState(initiativeDir);
    const decision: InitiativeDecisionRecord = {
      id: nextSequenceId(
        this.readDecisionLog(initiativeDir).map((entry) => entry.id),
        "decision",
      ),
      initiativeId: state.initiativeId,
      createdAt: currentTimestamp(),
      kind: normalizeDecisionKind(kind),
      question: question.trim(),
      answer: answer.trim(),
    };
    appendFileSync(join(initiativeDir, "decisions.jsonl"), `${JSON.stringify(decision)}\n`, "utf-8");
    state.updatedAt = decision.createdAt;
    return this.syncArtifacts(initiativeDir, state);
  }

  linkSpec(ref: string, specChangeId: string): InitiativeRecord {
    const initiativeDir = this.resolveInitiativeDirectory(ref);
    const state = this.readState(initiativeDir);
    const previousSpecIds = [...state.specChangeIds];
    state.specChangeIds = normalizeStringList([...state.specChangeIds, specChangeId]);
    state.updatedAt = currentTimestamp();
    this.syncSpecMembership(state.initiativeId, previousSpecIds, state.specChangeIds);
    return this.syncArtifacts(initiativeDir, state);
  }

  unlinkSpec(ref: string, specChangeId: string): InitiativeRecord {
    const initiativeDir = this.resolveInitiativeDirectory(ref);
    const state = this.readState(initiativeDir);
    const previousSpecIds = [...state.specChangeIds];
    state.specChangeIds = state.specChangeIds.filter((id) => id !== specChangeId.trim());
    state.updatedAt = currentTimestamp();
    this.syncSpecMembership(state.initiativeId, previousSpecIds, state.specChangeIds);
    return this.syncArtifacts(initiativeDir, state);
  }

  linkTicket(ref: string, ticketId: string): InitiativeRecord {
    const initiativeDir = this.resolveInitiativeDirectory(ref);
    const state = this.readState(initiativeDir);
    const previousTicketIds = [...state.ticketIds];
    state.ticketIds = normalizeStringList([...state.ticketIds, ticketId]);
    state.updatedAt = currentTimestamp();
    this.syncTicketMembership(state.initiativeId, previousTicketIds, state.ticketIds);
    return this.syncArtifacts(initiativeDir, state);
  }

  unlinkTicket(ref: string, ticketId: string): InitiativeRecord {
    const initiativeDir = this.resolveInitiativeDirectory(ref);
    const state = this.readState(initiativeDir);
    const previousTicketIds = [...state.ticketIds];
    state.ticketIds = state.ticketIds.filter((id) => id !== ticketId.trim());
    state.updatedAt = currentTimestamp();
    this.syncTicketMembership(state.initiativeId, previousTicketIds, state.ticketIds);
    return this.syncArtifacts(initiativeDir, state);
  }

  upsertMilestone(ref: string, input: InitiativeMilestoneInput): InitiativeRecord {
    const initiativeDir = this.resolveInitiativeDirectory(ref);
    const state = this.readState(initiativeDir);
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
    return this.syncArtifacts(initiativeDir, state);
  }

  archiveInitiative(ref: string): InitiativeRecord {
    return this.updateInitiative(ref, { status: "archived" });
  }
}

export function createInitiativeStore(cwd: string): InitiativeStore {
  return new InitiativeStore(cwd);
}
