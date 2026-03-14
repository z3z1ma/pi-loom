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

  initLedger(): { initialized: true; root: string } {
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

  private writeState(changeDir: string, state: SpecChangeState): void {
    writeJson(join(changeDir, "state.json"), state);
  }

  private readState(changeDir: string): SpecChangeState {
    const state = readJson<SpecChangeState>(join(changeDir, "state.json"));
    return {
      ...state,
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

  private syncArtifacts(changeDir: string, state: SpecChangeState): void {
    const decisions = this.readDecisionLog(changeDir);

    const proposalPath = join(changeDir, "proposal.md");
    writeFileAtomic(proposalPath, renderProposalMarkdown(state, decisions));
    state.artifactVersions.proposal = fileUpdatedAt(proposalPath);

    if (state.designNotes.trim() || state.capabilities.length > 0 || state.requirements.length > 0) {
      const designPath = join(changeDir, "design.md");
      writeFileAtomic(designPath, renderDesignMarkdown(state));
      state.artifactVersions.design = fileUpdatedAt(designPath);
    }

    if (state.tasks.length > 0) {
      const tasksPath = join(changeDir, "tasks.md");
      writeFileAtomic(tasksPath, renderTasksMarkdown(state));
      state.artifactVersions.tasks = fileUpdatedAt(tasksPath);
    }

    ensureDir(join(changeDir, "specs"));
    for (const capability of state.capabilities) {
      const path = join(changeDir, "specs", `${capability.id}.md`);
      writeFileAtomic(
        path,
        renderCapabilityMarkdown(state.changeId, capabilityFromState(this.cwd, state, capability.id, path)),
      );
    }

    this.writeState(changeDir, state);
  }

  listChanges(filter: SpecListFilter = {}): SpecChangeSummary[] {
    this.initLedger();
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

  listCapabilities(): CanonicalCapabilityRecord[] {
    this.initLedger();
    const directory = getSpecsPaths(this.cwd).capabilitiesDir;
    if (!existsSync(directory)) {
      return [];
    }
    return readdirSync(directory)
      .filter((entry) => entry.endsWith(".md"))
      .map((entry) => parseCanonicalCapability(this.cwd, join(directory, entry)))
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  readCapability(ref: string): CanonicalCapabilityRecord {
    const capabilityId = normalizeCapabilityId(ref.split(/[\\/]/).pop()?.replace(/\.md$/, "") ?? ref);
    const path = getCanonicalCapabilityPath(this.cwd, capabilityId);
    if (!existsSync(path)) {
      throw new Error(`Unknown capability: ${ref}`);
    }
    return parseCanonicalCapability(this.cwd, path);
  }

  readChange(ref: string): SpecChangeRecord {
    this.initLedger();
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

  createChange(input: CreateSpecChangeInput): SpecChangeRecord {
    this.initLedger();
    const timestamp = currentTimestamp();
    const state = this.defaultState(input, timestamp);
    const changeDir = getChangeDir(this.cwd, state.changeId);
    if (existsSync(join(changeDir, "state.json"))) {
      throw new Error(`Spec change already exists: ${state.changeId}`);
    }
    ensureDir(changeDir);
    ensureDir(getChangeSpecsDir(this.cwd, state.changeId));
    writeFileAtomic(getDecisionLogPath(this.cwd, state.changeId), "");
    this.syncArtifacts(changeDir, state);
    return this.readChange(state.changeId);
  }

  recordClarification(
    ref: string,
    question: string,
    answer: string,
    kind: SpecDecisionKind = "clarification",
  ): SpecChangeRecord {
    const { path } = this.resolveChangeDirectory(ref);
    const state = this.readState(path);
    const decision: SpecDecisionRecord = {
      id: nextSequenceId(
        this.readDecisionLog(path).map((entry) => entry.id),
        "decision",
      ),
      changeId: state.changeId,
      createdAt: currentTimestamp(),
      kind,
      question: question.trim(),
      answer: answer.trim(),
    };
    appendFileSync(join(path, "decisions.jsonl"), `${JSON.stringify(decision)}\n`, "utf-8");
    state.status = state.status === "proposed" ? "clarifying" : state.status;
    state.updatedAt = decision.createdAt;
    this.syncArtifacts(path, state);
    return this.readChange(state.changeId);
  }

  updatePlan(ref: string, input: SpecPlanInput): SpecChangeRecord {
    const { path } = this.resolveChangeDirectory(ref);
    const state = this.readState(path);
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
    this.syncArtifacts(path, state);
    return this.readChange(state.changeId);
  }

  updateTasks(ref: string, input: SpecTasksInput): SpecChangeRecord {
    const { path } = this.resolveChangeDirectory(ref);
    const state = this.readState(path);
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
    this.syncArtifacts(path, state);
    return this.readChange(state.changeId);
  }

  setInitiativeIds(ref: string, initiativeIds: string[]): SpecChangeRecord {
    const { path } = this.resolveChangeDirectory(ref);
    const state = this.readState(path);
    state.initiativeIds = normalizeStringList(initiativeIds);
    state.updatedAt = currentTimestamp();
    this.syncArtifacts(path, state);
    return this.readChange(state.changeId);
  }

  setResearchIds(ref: string, researchIds: string[]): SpecChangeRecord {
    const { path } = this.resolveChangeDirectory(ref);
    const state = this.readState(path);
    state.researchIds = normalizeStringList(researchIds);
    state.updatedAt = currentTimestamp();
    this.syncArtifacts(path, state);
    return this.readChange(state.changeId);
  }

  analyzeChange(ref: string): SpecChangeRecord {
    const { path } = this.resolveChangeDirectory(ref);
    const state = this.readState(path);
    const result = analyzeSpecChange(state);
    const analysisPath = join(path, "analysis.md");
    writeFileAtomic(analysisPath, renderAnalysisMarkdown(result));
    state.artifactVersions.analysis = fileUpdatedAt(analysisPath);
    state.updatedAt = currentTimestamp();
    this.writeState(path, state);
    return this.readChange(state.changeId);
  }

  generateChecklist(ref: string): SpecChangeRecord {
    const { path } = this.resolveChangeDirectory(ref);
    const state = this.readState(path);
    const result = buildSpecChecklist(state);
    const checklistPath = join(path, "checklist.md");
    writeFileAtomic(checklistPath, renderChecklistMarkdown(result));
    state.artifactVersions.checklist = fileUpdatedAt(checklistPath);
    state.updatedAt = currentTimestamp();
    this.writeState(path, state);
    return this.readChange(state.changeId);
  }

  finalizeChange(ref: string): SpecChangeRecord {
    const { path } = this.resolveChangeDirectory(ref);
    let state = this.readState(path);
    this.analyzeChange(state.changeId);
    this.generateChecklist(state.changeId);
    state = this.readState(path);
    const analysisArtifact = parseMarkdownArtifact(
      readFileSync(join(path, "analysis.md"), "utf-8"),
      join(path, "analysis.md"),
    );
    const ready = analysisArtifact.frontmatter.ready === "true";
    if (!ready) {
      throw new Error(`Spec change ${state.changeId} failed analysis and cannot be finalized.`);
    }
    state.status = "finalized";
    state.finalizedAt = currentTimestamp();
    state.updatedAt = state.finalizedAt;
    this.syncArtifacts(path, state);
    return this.readChange(state.changeId);
  }

  private mergeCanonicalCapability(state: SpecChangeState, capabilityId: string): void {
    const path = getCanonicalCapabilityPath(this.cwd, capabilityId);
    const current = existsSync(path) ? parseCanonicalCapability(this.cwd, path) : null;
    const next = capabilityFromState(this.cwd, state, capabilityId, path);
    const merged: CanonicalCapabilityRecord = {
      id: next.id,
      title: next.title,
      summary: next.summary || current?.summary || "",
      requirements: union(current?.requirements ?? [], next.requirements),
      scenarios: union(current?.scenarios ?? [], next.scenarios),
      sourceChanges: union(current?.sourceChanges ?? [], [state.changeId]),
      updatedAt: currentTimestamp(),
      path,
    };
    writeFileAtomic(path, renderCanonicalCapabilityMarkdown(merged));
  }

  archiveChange(ref: string): SpecChangeRecord {
    const { path, archived } = this.resolveChangeDirectory(ref);
    if (archived) {
      throw new Error(`Spec change ${ref} is already archived.`);
    }
    const state = this.readState(path);
    if (state.status !== "finalized") {
      throw new Error(`Spec change ${state.changeId} must be finalized before archive.`);
    }
    for (const capability of state.capabilities) {
      this.mergeCanonicalCapability(state, capability.id);
    }
    const archivedAt = currentTimestamp();
    state.status = "archived";
    state.archivedAt = archivedAt;
    state.archivedPath = toRepoRelativePath(
      this.cwd,
      getArchivedChangeDir(this.cwd, archivedAt.slice(0, 10), state.changeId),
    );
    state.updatedAt = archivedAt;
    this.syncArtifacts(path, state);
    const archivedPath = state.archivedPath;
    if (!archivedPath) {
      throw new Error(`Missing archive path for ${state.changeId}`);
    }
    renameSync(path, fromRepoRelativePath(this.cwd, archivedPath));
    return this.readChange(state.changeId);
  }
}

export function createSpecStore(cwd: string): SpecStore {
  return new SpecStore(cwd);
}
