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
import { createInitiativeStore } from "@pi-loom/pi-initiatives/extensions/domain/store.js";
import { createSpecStore } from "@pi-loom/pi-specs/extensions/domain/store.js";
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
import {
  getResearchArtifactPath,
  getResearchArtifactsPath,
  getResearchDashboardPath,
  getResearchDir,
  getResearchHypothesesPath,
  getResearchMarkdownPath,
  getResearchPaths,
} from "./paths.js";
import { renderResearchArtifactMarkdown, renderResearchMarkdown } from "./render.js";

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

function relativeOrAbsolute(cwd: string, path: string): string {
  const relativePath = relative(cwd, path);
  return relativePath || path;
}

function latestHypotheses(history: ResearchHypothesisRecord[]): ResearchHypothesisRecord[] {
  const latest = new Map<string, ResearchHypothesisRecord>();
  for (const entry of history) {
    latest.set(entry.id, entry);
  }
  return [...latest.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function summarizeResearch(
  state: ResearchState,
  path: string,
  hypotheses: ResearchHypothesisRecord[],
  artifacts: ResearchArtifactRecord[],
  cwd: string,
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
    path: relativeOrAbsolute(cwd, path),
  };
}

export class ResearchStore {
  readonly cwd: string;

  constructor(cwd: string) {
    this.cwd = resolve(cwd);
  }

  initLedger(): { initialized: true; root: string } {
    const paths = getResearchPaths(this.cwd);
    ensureDir(paths.researchDir);
    return { initialized: true, root: paths.researchDir };
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

  private writeState(researchDir: string, state: ResearchState): void {
    writeJson(join(researchDir, "state.json"), state);
  }

  private readState(researchDir: string): ResearchState {
    const state = readJson<ResearchState>(join(researchDir, "state.json"));
    return {
      ...state,
      status: normalizeResearchStatus(state.status),
      question: state.question ?? "",
      objective: state.objective ?? "",
      scope: normalizeStringList(state.scope),
      nonGoals: normalizeStringList(state.nonGoals),
      methodology: normalizeStringList(state.methodology),
      keywords: normalizeStringList(state.keywords),
      statusSummary: state.statusSummary ?? "",
      conclusions: normalizeStringList(state.conclusions),
      recommendations: normalizeStringList(state.recommendations),
      openQuestions: normalizeStringList(state.openQuestions),
      initiativeIds: normalizeStringList(state.initiativeIds),
      specChangeIds: normalizeStringList(state.specChangeIds),
      ticketIds: normalizeStringList(state.ticketIds),
      capabilityIds: normalizeStringList(state.capabilityIds),
      artifactIds: normalizeStringList(state.artifactIds),
      sourceRefs: normalizeStringList(state.sourceRefs),
      supersedes: normalizeStringList(state.supersedes),
      tags: normalizeStringList(state.tags),
      archivedAt: normalizeOptionalString(state.archivedAt),
      synthesizedAt: normalizeOptionalString(state.synthesizedAt),
    };
  }

  private researchDirectories(): string[] {
    const directory = getResearchPaths(this.cwd).researchDir;
    if (!existsSync(directory)) {
      return [];
    }
    return readdirSync(directory)
      .map((entry) => join(directory, entry))
      .filter((path) => statSync(path).isDirectory())
      .sort((left, right) => basename(left).localeCompare(basename(right)));
  }

  private resolveResearchDirectory(ref: string): string {
    const directId = normalizeResearchId(ref.split(/[\\/]/).pop() ?? ref);
    const directPath = getResearchDir(this.cwd, directId);
    if (existsSync(join(directPath, "state.json"))) {
      return directPath;
    }
    throw new Error(`Unknown research record: ${ref}`);
  }

  private readHypothesisLog(researchDir: string): ResearchHypothesisRecord[] {
    const path = join(researchDir, "hypotheses.jsonl");
    if (!existsSync(path)) {
      return [];
    }
    return readFileSync(path, "utf-8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ResearchHypothesisRecord)
      .map((entry) => ({
        ...entry,
        id: normalizeHypothesisId(entry.id),
        researchId: normalizeResearchId(entry.researchId),
        statement: entry.statement.trim(),
        status: normalizeHypothesisStatus(entry.status),
        confidence: normalizeHypothesisConfidence(entry.confidence),
        evidence: normalizeStringList(entry.evidence),
        results: normalizeStringList(entry.results),
      }));
  }

  private readArtifacts(researchDir: string): ResearchArtifactRecord[] {
    const path = join(researchDir, "artifacts.json");
    if (!existsSync(path)) {
      return [];
    }
    return readJson<ResearchArtifactRecord[]>(path)
      .map((artifact) => ({
        ...artifact,
        id: normalizeArtifactId(artifact.id),
        researchId: normalizeResearchId(artifact.researchId),
        kind: normalizeArtifactKind(artifact.kind),
        title: artifact.title.trim(),
        summary: artifact.summary ?? "",
        sourceUri: normalizeOptionalString(artifact.sourceUri),
        tags: normalizeStringList(artifact.tags),
        linkedHypothesisIds: normalizeStringList(artifact.linkedHypothesisIds),
      }))
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  private writeArtifacts(researchDir: string, artifacts: ResearchArtifactRecord[]): void {
    writeJson(join(researchDir, "artifacts.json"), artifacts);
  }

  private syncInitiativeMembership(researchId: string, previousIds: string[], nextIds: string[]): void {
    const store = createInitiativeStore(this.cwd);
    const impactedIds = normalizeStringList([...previousIds, ...nextIds]);
    for (const initiativeId of impactedIds) {
      const initiative = store.readInitiative(initiativeId);
      const shouldLink = nextIds.includes(initiativeId);
      const nextResearchIds = shouldLink
        ? normalizeStringList([...(initiative.state.researchIds ?? []), researchId])
        : (initiative.state.researchIds ?? []).filter((id) => id !== researchId);
      if (JSON.stringify(nextResearchIds) !== JSON.stringify(initiative.state.researchIds ?? [])) {
        store.setResearchIds(initiativeId, nextResearchIds);
      }
    }
  }

  private syncSpecMembership(researchId: string, previousIds: string[], nextIds: string[]): void {
    const store = createSpecStore(this.cwd);
    const impactedIds = normalizeStringList([...previousIds, ...nextIds]);
    for (const changeId of impactedIds) {
      const change = store.readChange(changeId);
      const shouldLink = nextIds.includes(changeId);
      const nextResearchIds = shouldLink
        ? normalizeStringList([...(change.state.researchIds ?? []), researchId])
        : (change.state.researchIds ?? []).filter((id) => id !== researchId);
      if (JSON.stringify(nextResearchIds) !== JSON.stringify(change.state.researchIds ?? [])) {
        store.setResearchIds(changeId, nextResearchIds);
      }
    }
  }

  private syncTicketMembership(researchId: string, previousIds: string[], nextIds: string[]): void {
    const store = createTicketStore(this.cwd);
    const impactedIds = normalizeStringList([...previousIds, ...nextIds]);
    for (const ticketId of impactedIds) {
      const ticket = store.readTicket(ticketId);
      const shouldLink = nextIds.includes(ticketId);
      const nextResearchIds = shouldLink
        ? normalizeStringList([...(ticket.summary.researchIds ?? []), researchId])
        : (ticket.summary.researchIds ?? []).filter((id) => id !== researchId);
      if (JSON.stringify(nextResearchIds) !== JSON.stringify(ticket.summary.researchIds ?? [])) {
        store.setResearchIds(ticketId, nextResearchIds);
      }
    }
  }

  private syncLinkedEntities(
    researchId: string,
    previousInitiativeIds: string[],
    previousSpecIds: string[],
    previousTicketIds: string[],
    nextInitiativeIds: string[],
    nextSpecIds: string[],
    nextTicketIds: string[],
  ): void {
    this.syncInitiativeMembership(researchId, previousInitiativeIds, nextInitiativeIds);
    this.syncSpecMembership(researchId, previousSpecIds, nextSpecIds);
    this.syncTicketMembership(researchId, previousTicketIds, nextTicketIds);
  }

  private syncArtifacts(researchDir: string, state: ResearchState): ResearchRecord {
    const hypothesisHistory = this.readHypothesisLog(researchDir);
    const hypotheses = latestHypotheses(hypothesisHistory);
    const artifacts = this.readArtifacts(researchDir);
    state.artifactIds = normalizeStringList(artifacts.map((artifact) => artifact.id));
    writeFileAtomic(
      getResearchMarkdownPath(this.cwd, state.researchId),
      renderResearchMarkdown(state, hypotheses, artifacts),
    );
    this.writeArtifacts(researchDir, artifacts);
    this.writeState(researchDir, state);
    const dashboard = buildResearchDashboard(this.cwd, state, hypotheses, artifacts);
    writeJson(getResearchDashboardPath(this.cwd, state.researchId), dashboard);
    return {
      state,
      summary: summarizeResearch(state, researchDir, hypotheses, artifacts, this.cwd),
      synthesis: readText(getResearchMarkdownPath(this.cwd, state.researchId)),
      hypotheses,
      hypothesisHistory,
      artifacts,
      dashboard,
      map: buildResearchMap(this.cwd, state, hypotheses, artifacts),
    };
  }

  listResearch(filter: ResearchListFilter = {}): ResearchSummary[] {
    this.initLedger();
    return this.researchDirectories()
      .map((researchDir) => {
        const state = this.readState(researchDir);
        return {
          state,
          summary: summarizeResearch(
            state,
            researchDir,
            latestHypotheses(this.readHypothesisLog(researchDir)),
            this.readArtifacts(researchDir),
            this.cwd,
          ),
        };
      })
      .filter(({ state, summary }) => {
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
        if (filter.keyword && !state.keywords.includes(filter.keyword)) {
          return false;
        }
        return true;
      })
      .map(({ summary }) => summary)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  readResearch(ref: string): ResearchRecord {
    this.initLedger();
    const path = this.resolveResearchDirectory(ref);
    const state = this.readState(path);
    return this.syncArtifacts(path, state);
  }

  createResearch(input: CreateResearchInput): ResearchRecord {
    this.initLedger();
    const timestamp = currentTimestamp();
    const state = this.defaultState(input, timestamp);
    const researchDir = getResearchDir(this.cwd, state.researchId);
    if (existsSync(join(researchDir, "state.json"))) {
      throw new Error(`Research already exists: ${state.researchId}`);
    }
    ensureDir(researchDir);
    writeFileAtomic(getResearchHypothesesPath(this.cwd, state.researchId), "");
    writeJson(getResearchArtifactsPath(this.cwd, state.researchId), []);
    this.syncLinkedEntities(state.researchId, [], [], [], state.initiativeIds, state.specChangeIds, state.ticketIds);
    return this.syncArtifacts(researchDir, state);
  }

  updateResearch(ref: string, updates: UpdateResearchInput): ResearchRecord {
    const researchDir = this.resolveResearchDirectory(ref);
    const state = this.readState(researchDir);
    const previousInitiativeIds = [...state.initiativeIds];
    const previousSpecIds = [...state.specChangeIds];
    const previousTicketIds = [...state.ticketIds];
    if (updates.title !== undefined) state.title = updates.title.trim();
    if (updates.status !== undefined) {
      state.status = normalizeResearchStatus(updates.status);
      if (state.status === "archived") {
        state.archivedAt = currentTimestamp();
      }
      if (state.status === "synthesized") {
        state.synthesizedAt = currentTimestamp();
      }
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
    this.syncLinkedEntities(
      state.researchId,
      previousInitiativeIds,
      previousSpecIds,
      previousTicketIds,
      state.initiativeIds,
      state.specChangeIds,
      state.ticketIds,
    );
    return this.syncArtifacts(researchDir, state);
  }

  recordHypothesis(ref: string, input: ResearchHypothesisInput): ResearchRecord {
    const researchDir = this.resolveResearchDirectory(ref);
    const state = this.readState(researchDir);
    const history = this.readHypothesisLog(researchDir);
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
      researchId: state.researchId,
      statement: input.statement.trim(),
      status: normalizeHypothesisStatus(input.status),
      confidence: normalizeHypothesisConfidence(input.confidence),
      evidence: normalizeStringList(input.evidence),
      results: normalizeStringList(input.results),
      createdAt: current?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    appendFileSync(getResearchHypothesesPath(this.cwd, state.researchId), `${JSON.stringify(entry)}\n`, "utf-8");
    state.updatedAt = timestamp;
    return this.syncArtifacts(researchDir, state);
  }

  recordArtifact(ref: string, input: ResearchArtifactInput): ResearchRecord {
    const researchDir = this.resolveResearchDirectory(ref);
    const state = this.readState(researchDir);
    const artifacts = this.readArtifacts(researchDir);
    const timestamp = currentTimestamp();
    const normalizedId = input.id
      ? normalizeArtifactId(input.id)
      : nextSequenceId(
          artifacts.map((artifact) => artifact.id),
          "artifact",
        );
    const kind = normalizeArtifactKind(input.kind);
    const recordPath = relative(this.cwd, getResearchArtifactPath(this.cwd, state.researchId, kind, normalizedId));
    const existing = artifacts.find((artifact) => artifact.id === normalizedId) ?? null;
    const artifact: ResearchArtifactRecord = {
      id: normalizedId,
      researchId: state.researchId,
      kind,
      title: input.title.trim(),
      path: recordPath,
      createdAt: existing?.createdAt ?? timestamp,
      summary: input.summary?.trim() ?? existing?.summary ?? "",
      sourceUri: normalizeOptionalString(input.sourceUri ?? existing?.sourceUri ?? null),
      tags: normalizeStringList(input.tags ?? existing?.tags),
      linkedHypothesisIds: normalizeStringList(input.linkedHypothesisIds ?? existing?.linkedHypothesisIds),
    };
    writeFileAtomic(
      resolve(this.cwd, recordPath),
      renderResearchArtifactMarkdown(state.researchId, artifact, input.body?.trim() ?? artifact.summary),
    );
    const nextArtifacts = [...artifacts.filter((entry) => entry.id !== artifact.id), artifact].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    this.writeArtifacts(researchDir, nextArtifacts);
    state.updatedAt = timestamp;
    return this.syncArtifacts(researchDir, state);
  }

  linkInitiative(ref: string, initiativeId: string): ResearchRecord {
    const researchDir = this.resolveResearchDirectory(ref);
    const state = this.readState(researchDir);
    const previousIds = [...state.initiativeIds];
    state.initiativeIds = normalizeStringList([...state.initiativeIds, initiativeId]);
    state.updatedAt = currentTimestamp();
    this.syncInitiativeMembership(state.researchId, previousIds, state.initiativeIds);
    return this.syncArtifacts(researchDir, state);
  }

  unlinkInitiative(ref: string, initiativeId: string): ResearchRecord {
    const researchDir = this.resolveResearchDirectory(ref);
    const state = this.readState(researchDir);
    const previousIds = [...state.initiativeIds];
    state.initiativeIds = state.initiativeIds.filter((id) => id !== initiativeId.trim());
    state.updatedAt = currentTimestamp();
    this.syncInitiativeMembership(state.researchId, previousIds, state.initiativeIds);
    return this.syncArtifacts(researchDir, state);
  }

  linkSpec(ref: string, changeId: string): ResearchRecord {
    const researchDir = this.resolveResearchDirectory(ref);
    const state = this.readState(researchDir);
    const previousIds = [...state.specChangeIds];
    state.specChangeIds = normalizeStringList([...state.specChangeIds, changeId]);
    state.updatedAt = currentTimestamp();
    this.syncSpecMembership(state.researchId, previousIds, state.specChangeIds);
    return this.syncArtifacts(researchDir, state);
  }

  unlinkSpec(ref: string, changeId: string): ResearchRecord {
    const researchDir = this.resolveResearchDirectory(ref);
    const state = this.readState(researchDir);
    const previousIds = [...state.specChangeIds];
    state.specChangeIds = state.specChangeIds.filter((id) => id !== changeId.trim());
    state.updatedAt = currentTimestamp();
    this.syncSpecMembership(state.researchId, previousIds, state.specChangeIds);
    return this.syncArtifacts(researchDir, state);
  }

  linkTicket(ref: string, ticketId: string): ResearchRecord {
    const researchDir = this.resolveResearchDirectory(ref);
    const state = this.readState(researchDir);
    const previousIds = [...state.ticketIds];
    state.ticketIds = normalizeStringList([...state.ticketIds, ticketId]);
    state.updatedAt = currentTimestamp();
    this.syncTicketMembership(state.researchId, previousIds, state.ticketIds);
    return this.syncArtifacts(researchDir, state);
  }

  unlinkTicket(ref: string, ticketId: string): ResearchRecord {
    const researchDir = this.resolveResearchDirectory(ref);
    const state = this.readState(researchDir);
    const previousIds = [...state.ticketIds];
    state.ticketIds = state.ticketIds.filter((id) => id !== ticketId.trim());
    state.updatedAt = currentTimestamp();
    this.syncTicketMembership(state.researchId, previousIds, state.ticketIds);
    return this.syncArtifacts(researchDir, state);
  }

  archiveResearch(ref: string): ResearchRecord {
    return this.updateResearch(ref, { status: "archived" });
  }
}

export function createResearchStore(cwd: string): ResearchStore {
  return new ResearchStore(cwd);
}
