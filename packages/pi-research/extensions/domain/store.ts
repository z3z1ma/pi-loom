import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { createInitiativeStore } from "@pi-loom/pi-initiatives/extensions/domain/store.js";
import { createSpecStore } from "@pi-loom/pi-specs/extensions/domain/store.js";
import {
  appendEntityEvent,
  findEntityByDisplayId,
  upsertEntityByDisplayId,
  upsertProjectionForEntity,
} from "@pi-loom/pi-storage/storage/entities.js";
import { findOrBootstrapEntityByDisplayId, openWorkspaceStorage } from "@pi-loom/pi-storage/storage/workspace.js";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import { buildResearchDashboard, buildResearchDashboardProjection } from "./dashboard.js";
import { parseMarkdownArtifact } from "./frontmatter.js";
import { buildResearchMap, buildResearchMapProjection } from "./map.js";
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
  getResearchDir,
  getResearchHypothesesPath,
  getResearchMarkdownPath,
  getResearchPaths,
  getResearchStatePath,
} from "./paths.js";
import { renderResearchArtifactMarkdown, renderResearchMarkdown } from "./render.js";

const ENTITY_KIND = "research" as const;

interface ResearchEntityAttributes {
  state: ResearchState;
  hypotheses: ResearchHypothesisRecord[];
  artifacts: ResearchArtifactRecord[];
}

interface FilesystemImportedEntityAttributes {
  importedFrom?: string;
  filesByPath?: Record<string, string>;
}

interface ResearchSnapshot {
  state: ResearchState;
  hypothesisHistory: ResearchHypothesisRecord[];
  artifacts: ResearchArtifactRecord[];
}

interface ResearchSummaryWithSynthesis extends ResearchSummary {
  synthesis: string;
}

function hasStructuredResearchAttributes(attributes: unknown): attributes is ResearchEntityAttributes {
  return Boolean(attributes && typeof attributes === "object" && "state" in attributes);
}

function hasFilesystemImportedResearchAttributes(attributes: unknown): attributes is FilesystemImportedEntityAttributes {
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

function readText(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

function readArtifactBody(path: string): string | null {
  if (!existsSync(path)) {
    return null;
  }
  return parseMarkdownArtifact(readFileSync(path, "utf-8"), path).body;
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

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf-8")) as T;
}

function parseJsonText<T>(content: string): T {
  return JSON.parse(content) as T;
}

function parseHypothesisLog(content: string): ResearchHypothesisRecord[] {
  return content
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ResearchHypothesisRecord);
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

function summarizeImportedResearchEntity(entity: {
  displayId: string;
  title: string;
  status: string;
  updatedAt: string;
  tags: string[];
  attributes: unknown;
}): ResearchSummaryWithSynthesis {
  const filesByPath =
    entity.attributes && typeof entity.attributes === "object" && "filesByPath" in entity.attributes
      ? ((entity.attributes as { filesByPath?: Record<string, string> }).filesByPath ?? {})
      : {};
  const status = (() => {
    try {
      return normalizeResearchStatus(entity.status);
    } catch {
      return "active" as const;
    }
  })();
  return {
    id: normalizeResearchId(entity.displayId),
    title: entity.title,
    status,
    hypothesisCount: 0,
    artifactCount: 0,
    linkedInitiativeCount: 0,
    linkedSpecCount: 0,
    linkedTicketCount: 0,
    updatedAt: entity.updatedAt,
    tags: entity.tags,
    path: `.loom/research/${normalizeResearchId(entity.displayId)}`,
    synthesis: filesByPath[`.loom/research/${normalizeResearchId(entity.displayId)}/research.md`] ?? "",
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

  private readStateFromFiles(researchId: string): ResearchState {
    return stripDynamicState(readJson<ResearchState>(join(getResearchDir(this.cwd, researchId), "state.json")));
  }

  private readHypothesisLogFromFiles(researchId: string): ResearchHypothesisRecord[] {
    const filePath = getResearchHypothesesPath(this.cwd, researchId);
    if (!existsSync(filePath)) {
      return [];
    }
    return parseHypothesisLog(readFileSync(filePath, "utf-8"));
  }

  private readArtifactsFromFiles(researchId: string): ResearchArtifactRecord[] {
    const filePath = getResearchArtifactsPath(this.cwd, researchId);
    if (!existsSync(filePath)) {
      return [];
    }
    return readJson<ResearchArtifactRecord[]>(filePath);
  }

  private readSnapshotFromFiles(researchId: string): ResearchSnapshot {
    return {
      state: this.readStateFromFiles(researchId),
      hypothesisHistory: this.readHypothesisLogFromFiles(researchId),
      artifacts: this.readArtifactsFromFiles(researchId),
    };
  }

  private readSnapshotFromImportedEntity(
    researchId: string,
    attributes: unknown,
  ): ResearchSnapshot | null {
    if (!hasFilesystemImportedResearchAttributes(attributes) || !attributes.filesByPath) {
      return null;
    }
    const basePath = `.loom/research/${researchId}`;
    const stateText = attributes.filesByPath[`${basePath}/state.json`];
    if (!stateText) {
      return null;
    }
    return {
      state: stripDynamicState(parseJsonText<ResearchState>(stateText)),
      hypothesisHistory: parseHypothesisLog(attributes.filesByPath[`${basePath}/hypotheses.jsonl`] ?? ""),
      artifacts: parseJsonText<ResearchArtifactRecord[]>(attributes.filesByPath[`${basePath}/artifacts.json`] ?? "[]"),
    };
  }

  private readSummaryFromDirectory(researchDir: string): ResearchSummaryWithSynthesis {
    const researchId = basename(researchDir);
    const state = this.readStateFromFiles(researchId);
    const hypotheses = latestHypotheses(this.readHypothesisLogFromFiles(researchId));
    const artifacts = this.readArtifactsFromFiles(researchId);
    const synthesis = readText(getResearchMarkdownPath(this.cwd, researchId));
    return {
      ...summarizeResearch(state, researchDir, hypotheses, artifacts, this.cwd),
      synthesis,
    };
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

  private researchDirectories(): string[] {
    const directory = getResearchPaths(this.cwd).researchDir;
    if (!existsSync(directory)) {
      return [];
    }
    return readdirSync(directory)
      .map((entry) => join(directory, entry))
      .filter((pathValue) => statSync(pathValue).isDirectory() && existsSync(join(pathValue, "state.json")))
      .sort((left, right) => basename(left).localeCompare(basename(right)));
  }

  private resolveResearchDirectory(ref: string): string {
    const directId = normalizeResearchId(ref.split(/[\\/]/).pop() ?? ref);
    return getResearchDir(this.cwd, directId);
  }

  private materializeProjectionArtifacts(
    state: ResearchState,
    hypothesisHistory: ResearchHypothesisRecord[],
    artifacts: ResearchArtifactRecord[],
  ): ResearchRecord {
    const hypotheses = latestHypotheses(hypothesisHistory);
    state.artifactIds = normalizeStringList(artifacts.map((artifact) => artifact.id));
    writeFileAtomic(
      getResearchHypothesesPath(this.cwd, state.researchId),
      `${hypothesisHistory.map((entry) => JSON.stringify(entry)).join("\n")}${hypothesisHistory.length > 0 ? "\n" : ""}`,
    );
    writeFileAtomic(getResearchArtifactsPath(this.cwd, state.researchId), `${JSON.stringify(artifacts, null, 2)}\n`);
    writeFileAtomic(
      join(getResearchDir(this.cwd, state.researchId), "state.json"),
      `${JSON.stringify(state, null, 2)}\n`,
    );
    writeFileAtomic(
      getResearchMarkdownPath(this.cwd, state.researchId),
      renderResearchMarkdown(state, hypotheses, artifacts),
    );
    for (const artifact of artifacts) {
      const bodyPath = resolve(this.cwd, artifact.path);
      if (!existsSync(bodyPath)) {
        writeFileAtomic(bodyPath, renderResearchArtifactMarkdown(state.researchId, artifact, artifact.summary));
      }
    }
    return {
      state,
      summary: summarizeResearch(
        state,
        this.resolveResearchDirectory(state.researchId),
        hypotheses,
        artifacts,
        this.cwd,
      ),
      synthesis: readText(getResearchMarkdownPath(this.cwd, state.researchId)),
      hypotheses,
      hypothesisHistory,
      artifacts,
      dashboard: buildResearchDashboardProjection(this.cwd, state, hypotheses, artifacts),
      map: buildResearchMapProjection(this.cwd, state, hypotheses, artifacts),
    };
  }

  private async materializeCanonicalArtifacts(
    state: ResearchState,
    hypothesisHistory: ResearchHypothesisRecord[],
    artifacts: ResearchArtifactRecord[],
  ): Promise<ResearchRecord> {
    const hypotheses = latestHypotheses(hypothesisHistory);
    state.artifactIds = normalizeStringList(artifacts.map((artifact) => artifact.id));
    writeFileAtomic(
      getResearchHypothesesPath(this.cwd, state.researchId),
      `${hypothesisHistory.map((entry) => JSON.stringify(entry)).join("\n")}${hypothesisHistory.length > 0 ? "\n" : ""}`,
    );
    writeFileAtomic(getResearchArtifactsPath(this.cwd, state.researchId), `${JSON.stringify(artifacts, null, 2)}\n`);
    writeFileAtomic(
      join(getResearchDir(this.cwd, state.researchId), "state.json"),
      `${JSON.stringify(state, null, 2)}\n`,
    );
    writeFileAtomic(
      getResearchMarkdownPath(this.cwd, state.researchId),
      renderResearchMarkdown(state, hypotheses, artifacts),
    );
    for (const artifact of artifacts) {
      const bodyPath = resolve(this.cwd, artifact.path);
      if (!existsSync(bodyPath)) {
        writeFileAtomic(bodyPath, renderResearchArtifactMarkdown(state.researchId, artifact, artifact.summary));
      }
    }
    const summary = summarizeResearch(
      state,
      this.resolveResearchDirectory(state.researchId),
      hypotheses,
      artifacts,
      this.cwd,
    );
    const synthesis = readText(getResearchMarkdownPath(this.cwd, state.researchId));
    return {
      state,
      summary,
      synthesis,
      hypotheses,
      hypothesisHistory,
      artifacts,
      dashboard: await buildResearchDashboard(this.cwd, state, hypotheses, artifacts),
      map: await buildResearchMap(this.cwd, state, hypotheses, artifacts),
    };
  }

  private async repairSnapshotToCanonical(researchId: string, attributes?: unknown): Promise<ResearchRecord> {
    const snapshot = this.readSnapshotFromImportedEntity(researchId, attributes) ??
      (existsSync(getResearchStatePath(this.cwd, researchId)) ? this.readSnapshotFromFiles(researchId) : null);
    if (!snapshot) {
      throw new Error(`Research entity ${researchId} is missing structured attributes`);
    }
    return this.persistRecord(snapshot.state, snapshot.hypothesisHistory, snapshot.artifacts);
  }

  private async loadRecord(ref: string): Promise<ResearchRecord> {
    this.initLedger();
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const researchId = normalizeResearchId(ref.split(/[\\/]/).pop() ?? ref);
    let entity = await findOrBootstrapEntityByDisplayId(this.cwd, storage, identity.space.id, ENTITY_KIND, researchId);
    const statePath = getResearchStatePath(this.cwd, researchId);
    if (!entity && existsSync(statePath)) {
      return this.repairSnapshotToCanonical(researchId);
    }
    if (!entity) {
      const timestamp = currentTimestamp();
      const state = this.defaultState({ title: researchId, researchId }, timestamp);
      entity = await upsertEntityByDisplayId(storage, {
        kind: ENTITY_KIND,
        spaceId: identity.space.id,
        owningRepositoryId: identity.repository.id,
        displayId: state.researchId,
        title: state.title,
        summary: state.statusSummary || state.question,
        status: state.status,
        version: 1,
        tags: state.tags,
        pathScopes: [
          {
            repositoryId: identity.repository.id,
            relativePath: `.loom/research/${state.researchId}/research.md`,
            role: "projection",
          },
        ],
        attributes: { state, hypotheses: [], artifacts: [] },
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
      });
    }
    if (!hasStructuredResearchAttributes(entity.attributes)) {
      return this.repairSnapshotToCanonical(researchId, entity.attributes);
    }
    const attributes = entity.attributes;
    return this.materializeCanonicalArtifacts(
      stripDynamicState(attributes.state),
      attributes.hypotheses ?? [],
      attributes.artifacts ?? [],
    );
  }

  private async persistRecord(
    state: ResearchState,
    hypothesisHistory: ResearchHypothesisRecord[],
    artifacts: ResearchArtifactRecord[],
  ): Promise<ResearchRecord> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const existing = await findEntityByDisplayId(storage, identity.space.id, ENTITY_KIND, state.researchId);
    const version = (existing?.version ?? 0) + 1;
    const record = await this.materializeCanonicalArtifacts(stripDynamicState(state), hypothesisHistory, artifacts);
    const entity = await upsertEntityByDisplayId(storage, {
      kind: ENTITY_KIND,
      spaceId: identity.space.id,
      owningRepositoryId: identity.repository.id,
      displayId: record.state.researchId,
      title: record.state.title,
      summary: record.state.statusSummary || record.state.question,
      status: record.state.status,
      version,
      tags: record.state.tags,
      pathScopes: [
        {
          repositoryId: identity.repository.id,
          relativePath: `.loom/research/${record.state.researchId}/research.md`,
          role: "projection",
        },
      ],
      attributes: {
        state: record.state,
        hypotheses: record.hypothesisHistory,
        artifacts: record.artifacts,
      },
      createdAt: existing?.createdAt ?? record.state.createdAt,
      updatedAt: record.state.updatedAt,
    });
    await upsertProjectionForEntity(
      storage,
      entity.id,
      "documentation_markdown_body",
      "repo_materialized",
      identity.repository.id,
      `.loom/research/${record.state.researchId}/research.md`,
      record.synthesis,
      version,
      record.state.createdAt,
      record.state.updatedAt,
    );
    return record;
  }

  private applyListFilter(summary: ResearchSummaryWithSynthesis, filter: ResearchListFilter): boolean {
    if (!filter.includeArchived && summary.status === "archived") return false;
    if (filter.status && summary.status !== filter.status) return false;
    if (filter.tag && !summary.tags.includes(filter.tag)) return false;
    if (filter.text) {
      const haystack = `${summary.id} ${summary.title}`.toLowerCase();
      if (!haystack.includes(filter.text.toLowerCase())) return false;
    }
    if (filter.keyword) {
      const lowered = filter.keyword.toLowerCase();
      if (!summary.synthesis.toLowerCase().includes(lowered)) return false;
    }
    return true;
  }

  async listResearch(filter: ResearchListFilter = {}): Promise<ResearchSummary[]> {
    this.initLedger();
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const summaries = new Map<string, ResearchSummaryWithSynthesis>();
    for (const entity of await storage.listEntities(identity.space.id, ENTITY_KIND)) {
      const researchId = normalizeResearchId(entity.displayId);
      if (hasStructuredResearchAttributes(entity.attributes)) {
        const state = stripDynamicState(entity.attributes.state);
        const hypotheses = latestHypotheses(entity.attributes.hypotheses ?? []);
        const artifacts = entity.attributes.artifacts ?? [];
        summaries.set(researchId, {
          ...summarizeResearch(state, this.resolveResearchDirectory(researchId), hypotheses, artifacts, this.cwd),
          synthesis: readText(getResearchMarkdownPath(this.cwd, researchId)),
        });
        continue;
      }
      try {
        const repaired = await this.repairSnapshotToCanonical(researchId, entity.attributes);
        summaries.set(researchId, { ...repaired.summary, synthesis: repaired.synthesis });
      } catch {
        summaries.set(researchId, summarizeImportedResearchEntity(entity));
      }
    }

    for (const researchDir of this.researchDirectories()) {
      const researchId = basename(researchDir);
      if (summaries.has(researchId)) {
        continue;
      }
      const repaired = await this.persistRecord(
        this.readStateFromFiles(researchId),
        this.readHypothesisLogFromFiles(researchId),
        this.readArtifactsFromFiles(researchId),
      );
      summaries.set(researchId, { ...repaired.summary, synthesis: repaired.synthesis });
    }

    return [...summaries.values()]
      .filter((summary) => this.applyListFilter(summary, filter))
      .map(({ synthesis: _synthesis, ...summary }) => summary)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  listResearchProjection(filter: ResearchListFilter = {}): ResearchSummary[] {
    this.initLedger();
    return this.researchDirectories()
      .map((researchDir) => this.readSummaryFromDirectory(researchDir))
      .filter((summary) => this.applyListFilter(summary, filter))
      .map(({ synthesis: _synthesis, ...summary }) => summary)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  async readResearch(ref: string): Promise<ResearchRecord> {
    return this.loadRecord(ref);
  }

  readResearchProjection(ref: string): ResearchRecord {
    const researchId = normalizeResearchId(ref.split(/[\\/]/).pop() ?? ref);
    const snapshot = this.readSnapshotFromFiles(researchId);
    return this.materializeProjectionArtifacts(snapshot.state, snapshot.hypothesisHistory, snapshot.artifacts);
  }

  private async syncInitiativeMembership(
    researchId: string,
    previousIds: string[],
    nextIds: string[],
  ): Promise<void> {
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
        await store.setResearchIdsAsync(ticketId, nextResearchIds);
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
    await this.syncLinkedEntities(state.researchId, [], [], [], state.initiativeIds, state.specChangeIds, state.ticketIds);
    return this.persistRecord(state, [], []);
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
    return this.persistRecord(state, record.hypothesisHistory, record.artifacts);
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
    const persisted = await this.persistRecord(state, history, record.artifacts);
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const entity = await findEntityByDisplayId(storage, identity.space.id, ENTITY_KIND, persisted.state.researchId);
    if (entity) {
      await appendEntityEvent(storage, entity.id, "updated", "research-store", { hypothesis: entry }, timestamp);
    }
    return persisted;
  }

  async recordArtifact(ref: string, input: ResearchArtifactInput): Promise<ResearchRecord> {
    const record = await this.loadRecord(ref);
    const artifacts = [...record.artifacts];
    const timestamp = currentTimestamp();
    const normalizedId = input.id
      ? normalizeArtifactId(input.id)
      : nextSequenceId(
          artifacts.map((artifact) => artifact.id),
          "artifact",
        );
    const kind = normalizeArtifactKind(input.kind);
    const recordPath = relative(
      this.cwd,
      getResearchArtifactPath(this.cwd, record.state.researchId, kind, normalizedId),
    );
    const existing = artifacts.find((artifact) => artifact.id === normalizedId) ?? null;
    const preservedBody = existing ? readArtifactBody(resolve(this.cwd, existing.path)) : null;
    const artifact: ResearchArtifactRecord = {
      id: normalizedId,
      researchId: record.state.researchId,
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
      renderResearchArtifactMarkdown(
        record.state.researchId,
        artifact,
        input.body?.trim() ?? preservedBody ?? artifact.summary,
      ),
    );
    const nextArtifacts = [...artifacts.filter((entry) => entry.id !== artifact.id), artifact].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    const state = { ...record.state, updatedAt: timestamp };
    return this.persistRecord(state, record.hypothesisHistory, nextArtifacts);
  }

  async linkInitiative(ref: string, initiativeId: string): Promise<ResearchRecord> {
    const record = await this.loadRecord(ref);
    const state = {
      ...record.state,
      initiativeIds: normalizeStringList([...record.state.initiativeIds, initiativeId]),
      updatedAt: currentTimestamp(),
    };
    await this.syncInitiativeMembership(record.state.researchId, record.state.initiativeIds, state.initiativeIds);
    return this.persistRecord(state, record.hypothesisHistory, record.artifacts);
  }

  async unlinkInitiative(ref: string, initiativeId: string): Promise<ResearchRecord> {
    const record = await this.loadRecord(ref);
    const state = {
      ...record.state,
      initiativeIds: record.state.initiativeIds.filter((id) => id !== initiativeId.trim()),
      updatedAt: currentTimestamp(),
    };
    await this.syncInitiativeMembership(record.state.researchId, record.state.initiativeIds, state.initiativeIds);
    return this.persistRecord(state, record.hypothesisHistory, record.artifacts);
  }

  async linkSpec(ref: string, changeId: string): Promise<ResearchRecord> {
    const record = await this.loadRecord(ref);
    const state = {
      ...record.state,
      specChangeIds: normalizeStringList([...record.state.specChangeIds, changeId]),
      updatedAt: currentTimestamp(),
    };
    await this.syncSpecMembership(record.state.researchId, record.state.specChangeIds, state.specChangeIds);
    return this.persistRecord(state, record.hypothesisHistory, record.artifacts);
  }

  async unlinkSpec(ref: string, changeId: string): Promise<ResearchRecord> {
    const record = await this.loadRecord(ref);
    const state = {
      ...record.state,
      specChangeIds: record.state.specChangeIds.filter((id) => id !== changeId.trim()),
      updatedAt: currentTimestamp(),
    };
    await this.syncSpecMembership(record.state.researchId, record.state.specChangeIds, state.specChangeIds);
    return this.persistRecord(state, record.hypothesisHistory, record.artifacts);
  }

  async linkTicket(ref: string, ticketId: string): Promise<ResearchRecord> {
    const record = await this.loadRecord(ref);
    const state = {
      ...record.state,
      ticketIds: normalizeStringList([...record.state.ticketIds, ticketId]),
      updatedAt: currentTimestamp(),
    };
    await this.syncTicketMembership(record.state.researchId, record.state.ticketIds, state.ticketIds);
    return this.persistRecord(state, record.hypothesisHistory, record.artifacts);
  }

  async unlinkTicket(ref: string, ticketId: string): Promise<ResearchRecord> {
    const record = await this.loadRecord(ref);
    const state = {
      ...record.state,
      ticketIds: record.state.ticketIds.filter((id) => id !== ticketId.trim()),
      updatedAt: currentTimestamp(),
    };
    await this.syncTicketMembership(record.state.researchId, record.state.ticketIds, state.ticketIds);
    return this.persistRecord(state, record.hypothesisHistory, record.artifacts);
  }

  async archiveResearch(ref: string): Promise<ResearchRecord> {
    return this.updateResearch(ref, { status: "archived" });
  }
}

export function createResearchStore(cwd: string): ResearchStore {
  return new ResearchStore(cwd);
}
