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
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  appendEntityEvent,
  findEntityByDisplayId,
  upsertEntityByDisplayId,
  upsertProjectionForEntity,
} from "@pi-loom/pi-storage/storage/entities.js";
import { findOrBootstrapEntityByDisplayId, openWorkspaceStorage } from "@pi-loom/pi-storage/storage/workspace.js";
import { analyzeSpecChange } from "./analysis.js";
import { buildSpecChecklist } from "./checklist.js";
import { parseBulletLines, parseMarkdownArtifact, parseSections } from "./frontmatter.js";
import type {
  CanonicalCapabilityRecord,
  CreateSpecChangeInput,
  SpecArtifactName,
  SpecArtifactStatus,
  SpecChangeRecord,
  SpecChangeState,
  SpecChangeSummary,
  SpecDecisionKind,
  SpecDecisionRecord,
  SpecListFilter,
  SpecPlanInput,
  SpecTasksInput,
  SpecTicketProjection,
} from "./models.js";
import {
  currentTimestamp,
  nextSequenceId,
  normalizeCapabilityId,
  normalizeChangeId,
  normalizeStatus,
  normalizeStringList,
  normalizeTaskId,
  slugifyTitle,
} from "./normalize.js";
import {
  getArchivedChangeDir,
  getCanonicalCapabilityPath,
  getChangeDir,
  getChangeSpecsDir,
  getDecisionLogPath,
  getProjectionPath,
  getSpecsPaths,
} from "./paths.js";
import {
  renderAnalysisMarkdown,
  renderCanonicalCapabilityMarkdown,
  renderCapabilityMarkdown,
  renderChecklistMarkdown,
  renderDesignMarkdown,
  renderProposalMarkdown,
  renderTasksMarkdown,
} from "./render.js";

const SPEC_CHANGE_ENTITY_KIND = "spec_change" as const;
const SPEC_CAPABILITY_ENTITY_KIND = "spec_capability" as const;

interface SpecChangeEntityAttributes {
  state: SpecChangeState;
  decisions: SpecDecisionRecord[];
  analysis: string;
  checklist: string;
  projection: SpecTicketProjection | null;
}

interface SpecCapabilityEntityAttributes {
  record: CanonicalCapabilityRecord;
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

function fileUpdatedAt(path: string): string | null {
  return existsSync(path) ? statSync(path).mtime.toISOString() : null;
}

function toRepoRelativePath(rootDir: string, path: string): string {
  const normalizedRoot = resolve(rootDir);
  const normalizedPath = isAbsolute(path) ? resolve(path) : resolve(normalizedRoot, path);
  if (normalizedPath === normalizedRoot) {
    return ".";
  }
  return relative(normalizedRoot, normalizedPath).split("\\").join("/");
}

function fromRepoRelativePath(rootDir: string, path: string): string {
  return resolve(rootDir, path);
}

function artifactVersions(): Record<SpecArtifactName, string | null> {
  return {
    proposal: null,
    design: null,
    tasks: null,
    analysis: null,
    checklist: null,
  };
}

function union(left: readonly string[], right: readonly string[]): string[] {
  return normalizeStringList([...left, ...right]);
}

function resolveRequirementCapabilities(state: SpecChangeState, requirementIds: string[]): string[] {
  const ids = new Set<string>();
  for (const requirementId of requirementIds) {
    const requirement = state.requirements.find((candidate) => candidate.id === requirementId);
    for (const capabilityId of requirement?.capabilities ?? []) {
      ids.add(capabilityId);
    }
  }
  return [...ids].sort((left, right) => left.localeCompare(right));
}

function summarizeChange(rootDir: string, state: SpecChangeState, path: string, archived: boolean): SpecChangeSummary {
  return {
    id: state.changeId,
    title: state.title,
    status: state.status,
    requirementCount: state.requirements.length,
    taskCount: state.tasks.length,
    capabilityIds: state.capabilities
      .map((capability) => capability.id)
      .sort((left, right) => left.localeCompare(right)),
    initiativeIds: normalizeStringList(state.initiativeIds),
    researchIds: normalizeStringList(state.researchIds),
    updatedAt: state.updatedAt,
    archived,
    path: toRepoRelativePath(rootDir, path),
  };
}

function capabilityFromState(
  rootDir: string,
  state: SpecChangeState,
  capabilityId: string,
  path: string,
): CanonicalCapabilityRecord {
  const capability = state.capabilities.find((candidate) => candidate.id === capabilityId);
  if (!capability) {
    throw new Error(`Unknown capability ${capabilityId} for change ${state.changeId}`);
  }
  const requirementTexts = capability.requirements
    .map(
      (requirementId) =>
        state.requirements.find((requirement) => requirement.id === requirementId)?.text ?? requirementId,
    )
    .filter(Boolean);
  return {
    id: capability.id,
    title: capability.title,
    summary: capability.summary,
    requirements: normalizeStringList(requirementTexts),
    scenarios: [...capability.scenarios],
    sourceChanges: [state.changeId],
    updatedAt: state.updatedAt,
    path: toRepoRelativePath(rootDir, path),
  };
}

function parseCanonicalCapability(rootDir: string, path: string): CanonicalCapabilityRecord {
  const artifact = parseMarkdownArtifact(readFileSync(path, "utf-8"), path);
  const sections = parseSections(artifact.body);
  return {
    id:
      typeof artifact.frontmatter.id === "string"
        ? normalizeCapabilityId(artifact.frontmatter.id)
        : slugifyTitle(basename(path, ".md")),
    title: typeof artifact.frontmatter.title === "string" ? artifact.frontmatter.title : basename(path, ".md"),
    summary: sections.Summary ?? "",
    requirements: parseBulletLines(sections.Requirements),
    scenarios: parseBulletLines(sections.Scenarios),
    sourceChanges: Array.isArray(artifact.frontmatter["source-changes"])
      ? normalizeStringList(artifact.frontmatter["source-changes"] as string[])
      : [],
    updatedAt:
      typeof artifact.frontmatter["updated-at"] === "string"
        ? artifact.frontmatter["updated-at"]
        : new Date(0).toISOString(),
    path: toRepoRelativePath(rootDir, path),
  };
}

export class SpecStore {
  readonly cwd: string;

  constructor(cwd: string) {
    this.cwd = resolve(cwd);
  }

  async initLedger(): Promise<{ initialized: true; root: string }> {
    const paths = getSpecsPaths(this.cwd);
    ensureDir(paths.changesDir);
    ensureDir(paths.capabilitiesDir);
    ensureDir(paths.archiveDir);
    return { initialized: true, root: paths.specsDir };
  }

  private defaultState(input: CreateSpecChangeInput, timestamp: string): SpecChangeState {
    const changeId = normalizeChangeId(input.changeId ?? slugifyTitle(input.title));
    return {
      changeId,
      title: input.title.trim(),
      status: "proposed",
      createdAt: timestamp,
      updatedAt: timestamp,
      finalizedAt: null,
      archivedAt: null,
      archivedPath: null,
      initiativeIds: normalizeStringList(input.initiativeIds),
      researchIds: normalizeStringList(input.researchIds),
      supersedes: [],
      proposalSummary: input.summary?.trim() ?? input.title.trim(),
      designNotes: "",
      requirements: [],
      capabilities: [],
      tasks: [],
      artifactVersions: artifactVersions(),
    };
  }

  private normalizeState(state: SpecChangeState): SpecChangeState {
    return {
      ...state,
      changeId: normalizeChangeId(state.changeId),
      title: state.title.trim(),
      status: normalizeStatus(state.status),
      initiativeIds: normalizeStringList(state.initiativeIds),
      researchIds: normalizeStringList(state.researchIds),
      supersedes: normalizeStringList(state.supersedes),
      archivedPath: state.archivedPath ? toRepoRelativePath(this.cwd, state.archivedPath) : null,
      requirements: state.requirements.map((requirement) => ({
        ...requirement,
        acceptance: normalizeStringList(requirement.acceptance),
        capabilities: normalizeStringList(requirement.capabilities),
      })),
      capabilities: state.capabilities.map((capability) => ({
        ...capability,
        requirements: normalizeStringList(capability.requirements),
        scenarios: normalizeStringList(capability.scenarios),
      })),
      tasks: state.tasks.map((task) => ({
        ...task,
        id: normalizeTaskId(task.id),
        deps: normalizeStringList(task.deps),
        requirements: normalizeStringList(task.requirements),
        capabilities: normalizeStringList(task.capabilities),
        acceptance: normalizeStringList(task.acceptance),
      })),
      artifactVersions: { ...artifactVersions(), ...state.artifactVersions },
    };
  }

  private writeState(changeDir: string, state: SpecChangeState): void {
    writeJson(join(changeDir, "state.json"), state);
  }

  private readState(changeDir: string): SpecChangeState {
    return this.normalizeState(readJson<SpecChangeState>(join(changeDir, "state.json")));
  }

  private changeDirectories(): string[] {
    const directory = getSpecsPaths(this.cwd).changesDir;
    if (!existsSync(directory)) {
      return [];
    }
    return readdirSync(directory)
      .map((entry) => join(directory, entry))
      .filter((path) => statSync(path).isDirectory())
      .sort((left, right) => basename(left).localeCompare(basename(right)));
  }

  private archivedChangeDirectories(): string[] {
    const directory = getSpecsPaths(this.cwd).archiveDir;
    if (!existsSync(directory)) {
      return [];
    }
    return readdirSync(directory)
      .map((entry) => join(directory, entry))
      .filter((path) => statSync(path).isDirectory())
      .sort((left, right) => basename(left).localeCompare(basename(right)));
  }

  private resolveChangeDirectory(ref: string): { path: string; archived: boolean } {
    const directId = normalizeChangeId(ref.split(/[\\/]/).pop() ?? ref);
    const directPath = getChangeDir(this.cwd, directId);
    if (existsSync(join(directPath, "state.json"))) {
      return { path: directPath, archived: false };
    }
    for (const archiveDir of this.archivedChangeDirectories()) {
      const name = basename(archiveDir);
      if (name === directId || name.endsWith(`-${directId}`)) {
        return { path: archiveDir, archived: true };
      }
    }
    throw new Error(`Unknown spec change: ${ref}`);
  }

  private readDecisionLog(changeDir: string): SpecDecisionRecord[] {
    const path = join(changeDir, "decisions.jsonl");
    if (!existsSync(path)) {
      return [];
    }
    return readFileSync(path, "utf-8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as SpecDecisionRecord);
  }

  private readProjection(changeDir: string): SpecTicketProjection | null {
    const path = join(changeDir, "ticket-projection.json");
    return existsSync(path) ? readJson<SpecTicketProjection>(path) : null;
  }

  private artifactStatuses(changeDir: string, state: SpecChangeState): SpecArtifactStatus[] {
    const statuses: SpecArtifactStatus[] = [];
    for (const artifact of ["proposal", "design", "tasks", "analysis", "checklist"] as const) {
      const path = join(changeDir, `${artifact}.md`);
      statuses.push({
        name: artifact,
        exists: existsSync(path),
        path: toRepoRelativePath(this.cwd, path),
        updatedAt: state.artifactVersions[artifact] ?? fileUpdatedAt(path),
      });
    }
    return statuses;
  }

  private changeDirForState(state: SpecChangeState): string {
    const activeDir = getChangeDir(this.cwd, state.changeId);
    if (!state.archivedPath) {
      return activeDir;
    }
    const archivedDir = fromRepoRelativePath(this.cwd, state.archivedPath);
    if (existsSync(activeDir) && activeDir !== archivedDir && !existsSync(archivedDir)) {
      ensureDir(dirname(archivedDir));
      renameSync(activeDir, archivedDir);
    }
    return archivedDir;
  }

  private syncArtifacts(
    changeDir: string,
    state: SpecChangeState,
    decisions: SpecDecisionRecord[],
    projection: SpecTicketProjection | null,
    analysis: string,
    checklist: string,
  ): void {
    ensureDir(changeDir);
    ensureDir(join(changeDir, "specs"));

    writeFileAtomic(
      join(changeDir, "decisions.jsonl"),
      `${decisions.map((decision) => JSON.stringify(decision)).join("\n")}${decisions.length > 0 ? "\n" : ""}`,
    );

    const proposalPath = join(changeDir, "proposal.md");
    writeFileAtomic(proposalPath, renderProposalMarkdown(state, decisions));
    state.artifactVersions.proposal = fileUpdatedAt(proposalPath);

    const designPath = join(changeDir, "design.md");
    if (state.designNotes.trim() || state.capabilities.length > 0 || state.requirements.length > 0) {
      writeFileAtomic(designPath, renderDesignMarkdown(state));
      state.artifactVersions.design = fileUpdatedAt(designPath);
    }

    const tasksPath = join(changeDir, "tasks.md");
    if (state.tasks.length > 0) {
      writeFileAtomic(tasksPath, renderTasksMarkdown(state));
      state.artifactVersions.tasks = fileUpdatedAt(tasksPath);
    }

    for (const capability of state.capabilities) {
      const path = join(changeDir, "specs", `${capability.id}.md`);
      writeFileAtomic(
        path,
        renderCapabilityMarkdown(state.changeId, capabilityFromState(this.cwd, state, capability.id, path)),
      );
    }

    if (analysis) {
      const analysisPath = join(changeDir, "analysis.md");
      writeFileAtomic(analysisPath, analysis);
      state.artifactVersions.analysis = fileUpdatedAt(analysisPath);
    }

    if (checklist) {
      const checklistPath = join(changeDir, "checklist.md");
      writeFileAtomic(checklistPath, checklist);
      state.artifactVersions.checklist = fileUpdatedAt(checklistPath);
    }

    if (projection) {
      writeJson(getProjectionPath(this.cwd, state.changeId), projection);
    }

    this.writeState(changeDir, state);
  }

  private materializeChangeRecord(
    state: SpecChangeState,
    decisions: SpecDecisionRecord[],
    projection: SpecTicketProjection | null,
    analysis: string,
    checklist: string,
  ): SpecChangeRecord {
    const normalized = this.normalizeState(state);
    const changeDir = this.changeDirForState(normalized);
    this.syncArtifacts(changeDir, normalized, decisions, projection, analysis, checklist);
    const archived = Boolean(normalized.archivedPath);
    return {
      state: normalized,
      summary: summarizeChange(this.cwd, normalized, changeDir, archived),
      artifacts: this.artifactStatuses(changeDir, normalized),
      proposal: readText(join(changeDir, "proposal.md")),
      design: readText(join(changeDir, "design.md")),
      tasksMarkdown: readText(join(changeDir, "tasks.md")),
      analysis: analysis || readText(join(changeDir, "analysis.md")),
      checklist: checklist || readText(join(changeDir, "checklist.md")),
      decisions,
      capabilitySpecs: normalized.capabilities.map((capability) =>
        capabilityFromState(this.cwd, normalized, capability.id, join(changeDir, "specs", `${capability.id}.md`)),
      ),
      projection,
    };
  }

  private async loadCanonicalChange(ref: string): Promise<SpecChangeRecord> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const changeId = normalizeChangeId(ref.split(/[\\/]/).pop() ?? ref);
    const entity = await findOrBootstrapEntityByDisplayId(
      this.cwd,
      storage,
      identity.space.id,
      SPEC_CHANGE_ENTITY_KIND,
      changeId,
    );
    if (!entity) {
      throw new Error(`Unknown spec change: ${ref}`);
    }
    const attributes = entity.attributes as unknown as SpecChangeEntityAttributes;
    return this.materializeChangeRecord(
      this.normalizeState(attributes.state),
      attributes.decisions ?? [],
      attributes.projection ?? null,
      attributes.analysis ?? "",
      attributes.checklist ?? "",
    );
  }

  private async persistCanonicalChange(
    state: SpecChangeState,
    decisions: SpecDecisionRecord[],
    projection: SpecTicketProjection | null,
    analysis: string,
    checklist: string,
  ): Promise<SpecChangeRecord> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const existing = await findEntityByDisplayId(storage, identity.space.id, SPEC_CHANGE_ENTITY_KIND, state.changeId);
    const version = (existing?.version ?? 0) + 1;
    const record = this.materializeChangeRecord(state, decisions, projection, analysis, checklist);
    const changePath = record.summary.path;
    const entity = await upsertEntityByDisplayId(storage, {
      kind: SPEC_CHANGE_ENTITY_KIND,
      spaceId: identity.space.id,
      owningRepositoryId: identity.repository.id,
      displayId: record.state.changeId,
      title: record.state.title,
      summary: record.state.proposalSummary || record.state.title,
      status: record.state.status,
      version,
      tags: ["spec-change"],
      pathScopes: [
        { repositoryId: identity.repository.id, relativePath: changePath, role: "canonical" },
        {
          repositoryId: identity.repository.id,
          relativePath: `${changePath}/proposal.md`,
          role: "projection",
        },
        {
          repositoryId: identity.repository.id,
          relativePath: `${changePath}/design.md`,
          role: "projection",
        },
        {
          repositoryId: identity.repository.id,
          relativePath: `${changePath}/tasks.md`,
          role: "projection",
        },
      ],
      attributes: {
        state: record.state,
        decisions: record.decisions,
        analysis: record.analysis,
        checklist: record.checklist,
        projection: record.projection,
      },
      createdAt: existing?.createdAt ?? record.state.createdAt,
      updatedAt: record.state.updatedAt,
    });

    await upsertProjectionForEntity(
      storage,
      entity.id,
      "spec_markdown_body",
      "repo_materialized",
      identity.repository.id,
      `${changePath}/proposal.md`,
      record.proposal,
      version,
      record.state.createdAt,
      record.state.updatedAt,
    );
    if (record.design) {
      await upsertProjectionForEntity(
        storage,
        entity.id,
        "spec_markdown_body",
        "repo_materialized",
        identity.repository.id,
        `${changePath}/design.md`,
        record.design,
        version,
        record.state.createdAt,
        record.state.updatedAt,
      );
    }
    if (record.tasksMarkdown) {
      await upsertProjectionForEntity(
        storage,
        entity.id,
        "spec_markdown_body",
        "repo_materialized",
        identity.repository.id,
        `${changePath}/tasks.md`,
        record.tasksMarkdown,
        version,
        record.state.createdAt,
        record.state.updatedAt,
      );
    }
    return record;
  }

  private async mergeCanonicalCapability(state: SpecChangeState, capabilityId: string): Promise<void> {
    const path = getCanonicalCapabilityPath(this.cwd, capabilityId);
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const existing = await findEntityByDisplayId(storage, identity.space.id, SPEC_CAPABILITY_ENTITY_KIND, capabilityId);
    const current = existing
      ? ((existing.attributes as unknown as SpecCapabilityEntityAttributes | undefined)?.record ?? null)
      : existsSync(path)
        ? parseCanonicalCapability(this.cwd, path)
        : null;
    const next = capabilityFromState(this.cwd, state, capabilityId, path);
    const merged: CanonicalCapabilityRecord = {
      id: next.id,
      title: next.title,
      summary: next.summary || current?.summary || "",
      requirements: union(current?.requirements ?? [], next.requirements),
      scenarios: union(current?.scenarios ?? [], next.scenarios),
      sourceChanges: union(current?.sourceChanges ?? [], [state.changeId]),
      updatedAt: currentTimestamp(),
      path: toRepoRelativePath(this.cwd, path),
    };
    writeFileAtomic(path, renderCanonicalCapabilityMarkdown(merged));
    const version = (existing?.version ?? 0) + 1;
    const entity = await upsertEntityByDisplayId(storage, {
      kind: SPEC_CAPABILITY_ENTITY_KIND,
      spaceId: identity.space.id,
      owningRepositoryId: identity.repository.id,
      displayId: merged.id,
      title: merged.title,
      summary: merged.summary || merged.title,
      status: "active",
      version,
      tags: ["spec-capability"],
      pathScopes: [{ repositoryId: identity.repository.id, relativePath: merged.path, role: "canonical" }],
      attributes: { record: merged },
      createdAt: existing?.createdAt ?? merged.updatedAt,
      updatedAt: merged.updatedAt,
    });
    await upsertProjectionForEntity(
      storage,
      entity.id,
      "spec_markdown_body",
      "repo_materialized",
      identity.repository.id,
      merged.path,
      readText(path),
      version,
      existing?.createdAt ?? merged.updatedAt,
      merged.updatedAt,
    );
  }

  listChangesProjection(filter: SpecListFilter = {}): SpecChangeSummary[] {
    const active = this.changeDirectories().map((path) => ({ path, archived: false }));
    const archived = filter.includeArchived
      ? this.archivedChangeDirectories().map((path) => ({ path, archived: true }))
      : [];
    return [...active, ...archived]
      .map(({ path, archived }) => summarizeChange(this.cwd, this.readState(path), path, archived))
      .filter((summary) => {
        if (filter.status && summary.status !== filter.status) {
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

  async listChanges(filter: SpecListFilter = {}): Promise<SpecChangeSummary[]> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    return (await storage.listEntities(identity.space.id, SPEC_CHANGE_ENTITY_KIND))
      .map((entity) => {
        const attributes = entity.attributes as unknown as SpecChangeEntityAttributes;
        const state = this.normalizeState(attributes.state);
        const path = state.archivedPath ? fromRepoRelativePath(this.cwd, state.archivedPath) : getChangeDir(this.cwd, state.changeId);
        return summarizeChange(this.cwd, state, path, Boolean(state.archivedPath));
      })
      .filter((summary) => {
        if (!filter.includeArchived && summary.archived) {
          return false;
        }
        if (filter.status && summary.status !== filter.status) {
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

  listCapabilitiesProjection(): CanonicalCapabilityRecord[] {
    const directory = getSpecsPaths(this.cwd).capabilitiesDir;
    if (!existsSync(directory)) {
      return [];
    }
    return readdirSync(directory)
      .filter((entry) => entry.endsWith(".md"))
      .map((entry) => parseCanonicalCapability(this.cwd, join(directory, entry)))
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  async listCapabilities(): Promise<CanonicalCapabilityRecord[]> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    return (await storage.listEntities(identity.space.id, SPEC_CAPABILITY_ENTITY_KIND))
      .map((entity) => (entity.attributes as unknown as SpecCapabilityEntityAttributes).record)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  readCapabilityProjection(ref: string): CanonicalCapabilityRecord {
    const capabilityId = normalizeCapabilityId(ref.split(/[\\/]/).pop()?.replace(/\.md$/, "") ?? ref);
    const path = getCanonicalCapabilityPath(this.cwd, capabilityId);
    if (!existsSync(path)) {
      throw new Error(`Unknown capability: ${ref}`);
    }
    return parseCanonicalCapability(this.cwd, path);
  }

  async readCapability(ref: string): Promise<CanonicalCapabilityRecord> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const capabilityId = normalizeCapabilityId(ref.split(/[\\/]/).pop()?.replace(/\.md$/, "") ?? ref);
    const entity = await findOrBootstrapEntityByDisplayId(
      this.cwd,
      storage,
      identity.space.id,
      SPEC_CAPABILITY_ENTITY_KIND,
      capabilityId,
    );
    if (!entity) {
      throw new Error(`Unknown capability: ${ref}`);
    }
    return (entity.attributes as unknown as SpecCapabilityEntityAttributes).record;
  }

  readChangeProjection(ref: string): SpecChangeRecord {
    const { path, archived } = this.resolveChangeDirectory(ref);
    const state = this.readState(path);
    return {
      state,
      summary: summarizeChange(this.cwd, state, path, archived),
      artifacts: this.artifactStatuses(path, state),
      proposal: readText(join(path, "proposal.md")),
      design: readText(join(path, "design.md")),
      tasksMarkdown: readText(join(path, "tasks.md")),
      analysis: readText(join(path, "analysis.md")),
      checklist: readText(join(path, "checklist.md")),
      decisions: this.readDecisionLog(path),
      capabilitySpecs: state.capabilities.map((capability) =>
        capabilityFromState(this.cwd, state, capability.id, join(path, "specs", `${capability.id}.md`)),
      ),
      projection: this.readProjection(path),
    };
  }

  async readChange(ref: string): Promise<SpecChangeRecord> {
    return this.loadCanonicalChange(ref);
  }

  async createChange(input: CreateSpecChangeInput): Promise<SpecChangeRecord> {
    await this.initLedger();
    const timestamp = currentTimestamp();
    const state = this.defaultState(input, timestamp);
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    if (await findEntityByDisplayId(storage, identity.space.id, SPEC_CHANGE_ENTITY_KIND, state.changeId)) {
      throw new Error(`Spec change already exists: ${state.changeId}`);
    }
    return this.persistCanonicalChange(state, [], null, "", "");
  }

  async recordClarification(
    ref: string,
    question: string,
    answer: string,
    kind: SpecDecisionKind = "clarification",
  ): Promise<SpecChangeRecord> {
    const record = await this.loadCanonicalChange(ref);
    const decision: SpecDecisionRecord = {
      id: nextSequenceId(
        record.decisions.map((entry) => entry.id),
        "decision",
      ),
      changeId: record.state.changeId,
      createdAt: currentTimestamp(),
      kind,
      question: question.trim(),
      answer: answer.trim(),
    };
    const nextState = this.normalizeState({
      ...record.state,
      status: record.state.status === "proposed" ? "clarifying" : record.state.status,
      updatedAt: decision.createdAt,
    });
    const nextDecisions = [...record.decisions, decision];
    const persisted = await this.persistCanonicalChange(
      nextState,
      nextDecisions,
      record.projection,
      record.analysis,
      record.checklist,
    );
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const entity = await findEntityByDisplayId(storage, identity.space.id, SPEC_CHANGE_ENTITY_KIND, record.state.changeId);
    if (entity) {
      await appendEntityEvent(storage, entity.id, "decision_recorded", "spec-store", { decision }, decision.createdAt);
    }
    return persisted;
  }

  async updatePlan(ref: string, input: SpecPlanInput): Promise<SpecChangeRecord> {
    const record = await this.loadCanonicalChange(ref);
    const state = this.normalizeState({ ...record.state });
    if (input.designNotes !== undefined) {
      state.designNotes = input.designNotes.trim();
    }
    if (input.supersedes !== undefined) {
      state.supersedes = normalizeStringList(input.supersedes);
    }

    for (const capabilityInput of input.capabilities) {
      const capabilityId = normalizeCapabilityId(capabilityInput.id ?? slugifyTitle(capabilityInput.title));
      let capability = state.capabilities.find((candidate) => candidate.id === capabilityId);
      if (!capability) {
        capability = {
          id: capabilityId,
          title: capabilityInput.title.trim(),
          summary: capabilityInput.summary?.trim() ?? "",
          requirements: [],
          scenarios: normalizeStringList(capabilityInput.scenarios),
        };
        state.capabilities.push(capability);
      } else {
        capability.title = capabilityInput.title.trim();
        if (capabilityInput.summary !== undefined) {
          capability.summary = capabilityInput.summary.trim();
        }
        capability.scenarios = union(capability.scenarios, normalizeStringList(capabilityInput.scenarios));
      }

      for (const requirementText of normalizeStringList(capabilityInput.requirements)) {
        let requirement = state.requirements.find(
          (candidate) => candidate.text === requirementText && candidate.capabilities.includes(capabilityId),
        );
        if (!requirement) {
          requirement = {
            id: nextSequenceId(
              state.requirements.map((candidate) => candidate.id),
              "req",
            ),
            text: requirementText,
            acceptance: normalizeStringList(capabilityInput.acceptance),
            capabilities: [capabilityId],
          };
          state.requirements.push(requirement);
        } else {
          requirement.acceptance = union(requirement.acceptance, normalizeStringList(capabilityInput.acceptance));
          requirement.capabilities = union(requirement.capabilities, [capabilityId]);
        }
        capability.requirements = union(capability.requirements, [requirement.id]);
      }
    }

    state.updatedAt = currentTimestamp();
    state.status = state.tasks.length > 0 ? "tasked" : "planned";
    return this.persistCanonicalChange(state, record.decisions, record.projection, record.analysis, record.checklist);
  }

  async updateTasks(ref: string, input: SpecTasksInput): Promise<SpecChangeRecord> {
    const record = await this.loadCanonicalChange(ref);
    const state = this.normalizeState({ ...record.state });
    const nextTasks = input.replace ? [] : [...state.tasks];

    for (const taskInput of input.tasks) {
      const requirementIds = normalizeStringList(taskInput.requirements);
      for (const requirementId of requirementIds) {
        if (!state.requirements.some((requirement) => requirement.id === requirementId)) {
          throw new Error(`Unknown requirement for task ${taskInput.title}: ${requirementId}`);
        }
      }
      const taskId = taskInput.id
        ? normalizeTaskId(taskInput.id)
        : nextSequenceId(
            nextTasks.map((task) => task.id),
            "task",
          );
      const capabilities = normalizeStringList(taskInput.capabilities);
      const resolvedCapabilities =
        capabilities.length > 0 ? capabilities : resolveRequirementCapabilities(state, requirementIds);
      const taskRecord = {
        id: taskId,
        title: taskInput.title.trim(),
        summary: taskInput.summary?.trim() ?? "",
        deps: normalizeStringList(taskInput.deps),
        requirements: requirementIds,
        capabilities: resolvedCapabilities,
        acceptance: normalizeStringList(taskInput.acceptance),
      };
      const existingIndex = nextTasks.findIndex((task) => task.id === taskId);
      if (existingIndex === -1) {
        nextTasks.push(taskRecord);
      } else {
        nextTasks[existingIndex] = taskRecord;
      }
    }

    state.tasks = nextTasks.sort((left, right) => left.id.localeCompare(right.id));
    state.updatedAt = currentTimestamp();
    state.status = "tasked";
    return this.persistCanonicalChange(state, record.decisions, record.projection, record.analysis, record.checklist);
  }

  async setInitiativeIds(ref: string, initiativeIds: string[]): Promise<SpecChangeRecord> {
    const record = await this.loadCanonicalChange(ref);
    const state = this.normalizeState({ ...record.state, initiativeIds: normalizeStringList(initiativeIds), updatedAt: currentTimestamp() });
    return this.persistCanonicalChange(state, record.decisions, record.projection, record.analysis, record.checklist);
  }

  setInitiativeIdsProjection(ref: string, initiativeIds: string[]): SpecChangeRecord {
    const record = this.readChangeProjection(ref);
    const state = this.normalizeState({ ...record.state, initiativeIds: normalizeStringList(initiativeIds), updatedAt: currentTimestamp() });
    return this.materializeChangeRecord(state, record.decisions, record.projection, record.analysis, record.checklist);
  }

  async setResearchIds(ref: string, researchIds: string[]): Promise<SpecChangeRecord> {
    const record = await this.loadCanonicalChange(ref);
    const state = this.normalizeState({ ...record.state, researchIds: normalizeStringList(researchIds), updatedAt: currentTimestamp() });
    return this.persistCanonicalChange(state, record.decisions, record.projection, record.analysis, record.checklist);
  }

  async setProjection(ref: string, projection: SpecTicketProjection | null): Promise<SpecChangeRecord> {
    const record = await this.loadCanonicalChange(ref);
    const state = this.normalizeState({ ...record.state, updatedAt: currentTimestamp() });
    return this.persistCanonicalChange(state, record.decisions, projection, record.analysis, record.checklist);
  }

  setResearchIdsProjection(ref: string, researchIds: string[]): SpecChangeRecord {
    const record = this.readChangeProjection(ref);
    const state = this.normalizeState({ ...record.state, researchIds: normalizeStringList(researchIds), updatedAt: currentTimestamp() });
    return this.materializeChangeRecord(state, record.decisions, record.projection, record.analysis, record.checklist);
  }

  async analyzeChange(ref: string): Promise<SpecChangeRecord> {
    const record = await this.loadCanonicalChange(ref);
    const state = this.normalizeState({ ...record.state, updatedAt: currentTimestamp() });
    const analysis = renderAnalysisMarkdown(analyzeSpecChange(state));
    return this.persistCanonicalChange(state, record.decisions, record.projection, analysis, record.checklist);
  }

  async generateChecklist(ref: string): Promise<SpecChangeRecord> {
    const record = await this.loadCanonicalChange(ref);
    const state = this.normalizeState({ ...record.state, updatedAt: currentTimestamp() });
    const checklist = renderChecklistMarkdown(buildSpecChecklist(state));
    return this.persistCanonicalChange(state, record.decisions, record.projection, record.analysis, checklist);
  }

  async finalizeChange(ref: string): Promise<SpecChangeRecord> {
    const record = await this.loadCanonicalChange(ref);
    let state = this.normalizeState({ ...record.state });
    const analysis = renderAnalysisMarkdown(analyzeSpecChange(state));
    const checklist = renderChecklistMarkdown(buildSpecChecklist(state));
    const analysisArtifact = parseMarkdownArtifact(analysis, `${state.changeId}/analysis.md`);
    const ready = analysisArtifact.frontmatter.ready === "true";
    if (!ready) {
      throw new Error(`Spec change ${state.changeId} failed analysis and cannot be finalized.`);
    }
    state.status = "finalized";
    state.finalizedAt = currentTimestamp();
    state.updatedAt = state.finalizedAt;
    return this.persistCanonicalChange(state, record.decisions, record.projection, analysis, checklist);
  }

  async archiveChange(ref: string): Promise<SpecChangeRecord> {
    const record = await this.loadCanonicalChange(ref);
    if (record.state.status !== "finalized") {
      throw new Error(`Spec change ${record.state.changeId} must be finalized before archive.`);
    }
    for (const capability of record.state.capabilities) {
      await this.mergeCanonicalCapability(record.state, capability.id);
    }
    const archivedAt = currentTimestamp();
    const state = this.normalizeState({
      ...record.state,
      status: "archived",
      archivedAt,
      archivedPath: toRepoRelativePath(
        this.cwd,
        getArchivedChangeDir(this.cwd, archivedAt.slice(0, 10), record.state.changeId),
      ),
      updatedAt: archivedAt,
    });
    return this.persistCanonicalChange(state, record.decisions, record.projection, record.analysis, record.checklist);
  }
}

export function createSpecStore(cwd: string): SpecStore {
  return new SpecStore(cwd);
}
