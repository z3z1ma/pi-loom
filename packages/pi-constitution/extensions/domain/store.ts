import * as fs from "node:fs";
import * as path from "node:path";
import { buildConstitutionalDashboard } from "./dashboard.js";
import type {
  ConstitutionalEntry,
  ConstitutionalEntryInput,
  ConstitutionalRecord,
  ConstitutionalState,
  ConstitutionDecisionKind,
  ConstitutionDecisionRecord,
  InitConstitutionInput,
  RoadmapItem,
  RoadmapItemInput,
  RoadmapListFilter,
  UpdateRoadmapInput,
  UpdateRoadmapItemInput,
  UpdateVisionInput,
} from "./models.js";
import {
  currentTimestamp,
  nextSequenceId,
  normalizeDecisionKind,
  normalizeEntry,
  normalizeProjectId,
  normalizeRoadmapItem,
  normalizeRoadmapItemHorizon,
  normalizeRoadmapItemId,
  normalizeRoadmapItemState,
  normalizeRoadmapItemStatus,
  normalizeStringList,
  slugifyTitle,
} from "./normalize.js";
import {
  getConstitutionalBriefPath,
  getConstitutionalConstraintsPath,
  getConstitutionalDecisionsPath,
  getConstitutionalPaths,
  getConstitutionalPrinciplesPath,
  getConstitutionalRoadmapItemPath,
  getConstitutionalRoadmapPath,
  getConstitutionalStatePath,
  getConstitutionalVisionPath,
} from "./paths.js";
import {
  renderConstitutionalBrief,
  renderConstraintsMarkdown,
  renderPrinciplesMarkdown,
  renderRoadmapItemMarkdown,
  renderRoadmapMarkdown,
  renderVisionMarkdown,
} from "./render.js";

const MISSING_QUESTIONS = {
  vision: "Define the durable project vision.",
  principles: "Capture the guiding decision principles.",
  constraints: "Capture the architectural and business constraints.",
  roadmap: "Capture the strategic direction and roadmap.",
} as const;

function ensureDir(filePath: string): void {
  fs.mkdirSync(filePath, { recursive: true });
}

function writeFileAtomic(filePath: string, content: string): void {
  ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, content, "utf-8");
  fs.renameSync(tempPath, filePath);
}

function writeJson(filePath: string, value: unknown): void {
  writeFileAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

function defaultTitleFromWorkspace(cwd: string): string {
  const base = path.basename(path.resolve(cwd));
  return base.replace(/[-_]+/g, " ").replace(/\b\w/g, (value) => value.toUpperCase());
}

function normalizeEntries(
  entries: ConstitutionalEntryInput[],
  kind: "principle" | "constraint",
): ConstitutionalEntry[] {
  const normalized: ConstitutionalEntry[] = [];
  for (const entry of entries) {
    normalized.push(
      normalizeEntry(
        entry,
        kind,
        normalized.map((existing) => existing.id),
      ),
    );
  }
  return normalized.sort((left, right) => left.id.localeCompare(right.id));
}

function aggregateRoadmapIds(items: RoadmapItem[], key: "initiativeIds" | "researchIds" | "specChangeIds"): string[] {
  return normalizeStringList(items.flatMap((item) => item[key]));
}

function hasVisionContent(state: Pick<ConstitutionalState, "visionSummary" | "visionNarrative">): boolean {
  return Boolean(state.visionSummary.trim() || state.visionNarrative.trim());
}

function hasRoadmapContent(
  state: Pick<ConstitutionalState, "strategicDirectionSummary" | "currentFocus" | "roadmapItems">,
): boolean {
  return Boolean(
    state.strategicDirectionSummary.trim() || state.currentFocus.length > 0 || state.roadmapItems.length > 0,
  );
}

function computeCompleteness(state: ConstitutionalState): ConstitutionalState["completeness"] {
  return {
    vision: hasVisionContent(state),
    principles: state.principles.length > 0,
    constraints: state.constraints.length > 0,
    roadmap: hasRoadmapContent(state),
    brief: true,
  };
}

function computeQuestions(state: ConstitutionalState): string[] {
  const carried = normalizeStringList(state.openConstitutionQuestions);
  const missing = [
    !state.completeness.vision ? MISSING_QUESTIONS.vision : null,
    !state.completeness.principles ? MISSING_QUESTIONS.principles : null,
    !state.completeness.constraints ? MISSING_QUESTIONS.constraints : null,
    !state.completeness.roadmap ? MISSING_QUESTIONS.roadmap : null,
  ].reduce<string[]>((questions, value) => {
    if (value !== null) {
      questions.push(value);
    }
    return questions;
  }, []);
  return normalizeStringList([...carried, ...missing]);
}

function normalizeRoadmapRef(ref: string): string {
  const basename = path.basename(ref.trim());
  const itemId = basename.toLowerCase().endsWith(".md") ? basename.slice(0, -3) : basename;
  return normalizeRoadmapItemId(itemId);
}

export class ConstitutionalStore {
  readonly cwd: string;

  constructor(cwd: string) {
    this.cwd = path.resolve(cwd);
  }

  private artifactPaths(): ConstitutionalState["artifactPaths"] {
    const paths = getConstitutionalPaths(this.cwd);
    return {
      root: paths.constitutionDir,
      state: getConstitutionalStatePath(this.cwd),
      brief: getConstitutionalBriefPath(this.cwd),
      vision: getConstitutionalVisionPath(this.cwd),
      principles: getConstitutionalPrinciplesPath(this.cwd),
      constraints: getConstitutionalConstraintsPath(this.cwd),
      roadmap: getConstitutionalRoadmapPath(this.cwd),
      decisions: getConstitutionalDecisionsPath(this.cwd),
      roadmapDir: paths.roadmapDir,
    };
  }

  private defaultState(input: InitConstitutionInput, timestamp: string): ConstitutionalState {
    const title = input.title?.trim() || defaultTitleFromWorkspace(this.cwd);
    const projectId = normalizeProjectId(input.projectId?.trim() || slugifyTitle(title));
    const baseState: ConstitutionalState = {
      projectId,
      title,
      createdAt: timestamp,
      updatedAt: timestamp,
      visionSummary: "",
      visionNarrative: "",
      principles: [],
      constraints: [],
      roadmapItems: [],
      roadmapItemIds: [],
      strategicDirectionSummary: "",
      currentFocus: [],
      openConstitutionQuestions: [],
      initiativeIds: [],
      researchIds: [],
      specChangeIds: [],
      artifactPaths: this.artifactPaths(),
      completeness: {
        vision: false,
        principles: false,
        constraints: false,
        roadmap: false,
        brief: true,
      },
    };
    baseState.openConstitutionQuestions = computeQuestions(baseState);
    return baseState;
  }

  private ensureInitialized(): void {
    const paths = getConstitutionalPaths(this.cwd);
    ensureDir(paths.constitutionDir);
    ensureDir(paths.roadmapDir);
    if (!fs.existsSync(getConstitutionalStatePath(this.cwd))) {
      const state = this.defaultState({}, currentTimestamp());
      writeFileAtomic(getConstitutionalDecisionsPath(this.cwd), "");
      this.syncArtifacts(state);
      return;
    }
    if (!fs.existsSync(getConstitutionalDecisionsPath(this.cwd))) {
      writeFileAtomic(getConstitutionalDecisionsPath(this.cwd), "");
    }
  }

  initLedger(input: InitConstitutionInput = {}): { initialized: true; root: string } {
    this.ensureInitialized();
    if (input.title || input.projectId) {
      const state = this.readState();
      if (input.title?.trim()) {
        state.title = input.title.trim();
      }
      if (input.projectId?.trim()) {
        state.projectId = normalizeProjectId(input.projectId.trim());
      }
      state.updatedAt = currentTimestamp();
      this.syncArtifacts(state);
    }
    return { initialized: true, root: getConstitutionalPaths(this.cwd).constitutionDir };
  }

  private readState(): ConstitutionalState {
    this.ensureInitialized();
    const state = readJson<ConstitutionalState>(getConstitutionalStatePath(this.cwd));
    const normalized: ConstitutionalState = {
      projectId: normalizeProjectId(state.projectId),
      title: state.title.trim(),
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      visionSummary: state.visionSummary ?? "",
      visionNarrative: state.visionNarrative ?? "",
      principles: normalizeEntries(state.principles ?? [], "principle"),
      constraints: normalizeEntries(state.constraints ?? [], "constraint"),
      roadmapItems: (state.roadmapItems ?? [])
        .map(normalizeRoadmapItemState)
        .sort((left, right) => left.id.localeCompare(right.id)),
      roadmapItemIds: [],
      strategicDirectionSummary: state.strategicDirectionSummary ?? "",
      currentFocus: normalizeStringList(state.currentFocus),
      openConstitutionQuestions: normalizeStringList(state.openConstitutionQuestions),
      initiativeIds: normalizeStringList(state.initiativeIds),
      researchIds: normalizeStringList(state.researchIds),
      specChangeIds: normalizeStringList(state.specChangeIds),
      artifactPaths: this.artifactPaths(),
      completeness: {
        vision: false,
        principles: false,
        constraints: false,
        roadmap: false,
        brief: true,
      },
    };
    normalized.roadmapItemIds = normalized.roadmapItems.map((item) => item.id);
    normalized.initiativeIds = aggregateRoadmapIds(normalized.roadmapItems, "initiativeIds");
    normalized.researchIds = aggregateRoadmapIds(normalized.roadmapItems, "researchIds");
    normalized.specChangeIds = aggregateRoadmapIds(normalized.roadmapItems, "specChangeIds");
    normalized.completeness = computeCompleteness(normalized);
    normalized.openConstitutionQuestions = computeQuestions(normalized);
    return normalized;
  }

  private readDecisions(): ConstitutionDecisionRecord[] {
    const decisionsPath = getConstitutionalDecisionsPath(this.cwd);
    if (!fs.existsSync(decisionsPath)) {
      return [];
    }
    return fs
      .readFileSync(decisionsPath, "utf-8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ConstitutionDecisionRecord)
      .map((decision) => ({
        ...decision,
        kind: normalizeDecisionKind(decision.kind),
        question: decision.question.trim(),
        answer: decision.answer.trim(),
        affectedArtifacts: normalizeStringList(decision.affectedArtifacts),
      }))
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  private syncArtifacts(state: ConstitutionalState): ConstitutionalRecord {
    state.roadmapItems = state.roadmapItems
      .map(normalizeRoadmapItemState)
      .sort((left, right) => left.id.localeCompare(right.id));
    state.roadmapItemIds = state.roadmapItems.map((item) => item.id);
    state.initiativeIds = aggregateRoadmapIds(state.roadmapItems, "initiativeIds");
    state.researchIds = aggregateRoadmapIds(state.roadmapItems, "researchIds");
    state.specChangeIds = aggregateRoadmapIds(state.roadmapItems, "specChangeIds");
    state.artifactPaths = this.artifactPaths();
    state.completeness = computeCompleteness(state);
    state.openConstitutionQuestions = computeQuestions(state);
    const decisions = this.readDecisions();
    writeJson(getConstitutionalStatePath(this.cwd), state);
    const brief = renderConstitutionalBrief(state);
    const vision = renderVisionMarkdown(state);
    const principles = renderPrinciplesMarkdown(state);
    const constraints = renderConstraintsMarkdown(state);
    const roadmap = renderRoadmapMarkdown(state, decisions);
    writeFileAtomic(getConstitutionalBriefPath(this.cwd), brief);
    writeFileAtomic(getConstitutionalVisionPath(this.cwd), vision);
    writeFileAtomic(getConstitutionalPrinciplesPath(this.cwd), principles);
    writeFileAtomic(getConstitutionalConstraintsPath(this.cwd), constraints);
    writeFileAtomic(getConstitutionalRoadmapPath(this.cwd), roadmap);
    ensureDir(getConstitutionalPaths(this.cwd).roadmapDir);
    const expectedPaths = new Set<string>();
    for (const item of state.roadmapItems) {
      const itemPath = getConstitutionalRoadmapItemPath(this.cwd, item.id);
      expectedPaths.add(itemPath);
      writeFileAtomic(itemPath, renderRoadmapItemMarkdown(state.title, item));
    }
    for (const entry of fs.readdirSync(getConstitutionalPaths(this.cwd).roadmapDir)) {
      const entryPath = path.join(getConstitutionalPaths(this.cwd).roadmapDir, entry);
      if (fs.statSync(entryPath).isFile() && !expectedPaths.has(entryPath)) {
        fs.rmSync(entryPath);
      }
    }
    return {
      state,
      brief,
      vision,
      principles,
      constraints,
      roadmap,
      decisions,
      dashboard: buildConstitutionalDashboard(state),
    };
  }

  readConstitution(): ConstitutionalRecord {
    return this.syncArtifacts(this.readState());
  }

  updateVision(input: UpdateVisionInput): ConstitutionalRecord {
    const state = this.readState();
    if (input.projectId?.trim()) {
      state.projectId = normalizeProjectId(input.projectId.trim());
    }
    if (input.title?.trim()) {
      state.title = input.title.trim();
    }
    if (input.visionSummary !== undefined) {
      state.visionSummary = input.visionSummary.trim();
    }
    if (input.visionNarrative !== undefined) {
      state.visionNarrative = input.visionNarrative.trim();
    }
    state.updatedAt = currentTimestamp();
    return this.syncArtifacts(state);
  }

  setPrinciples(entries: ConstitutionalEntryInput[]): ConstitutionalRecord {
    const state = this.readState();
    state.principles = normalizeEntries(entries, "principle");
    state.updatedAt = currentTimestamp();
    return this.syncArtifacts(state);
  }

  setConstraints(entries: ConstitutionalEntryInput[]): ConstitutionalRecord {
    const state = this.readState();
    state.constraints = normalizeEntries(entries, "constraint");
    state.updatedAt = currentTimestamp();
    return this.syncArtifacts(state);
  }

  updateRoadmap(input: UpdateRoadmapInput): ConstitutionalRecord {
    const state = this.readState();
    if (input.strategicDirectionSummary !== undefined) {
      state.strategicDirectionSummary = input.strategicDirectionSummary.trim();
    }
    if (input.currentFocus !== undefined) {
      state.currentFocus = normalizeStringList(input.currentFocus);
    }
    if (input.openConstitutionQuestions !== undefined) {
      state.openConstitutionQuestions = normalizeStringList(input.openConstitutionQuestions);
    }
    state.updatedAt = currentTimestamp();
    return this.syncArtifacts(state);
  }

  listRoadmapItems(filter: RoadmapListFilter = {}): RoadmapItem[] {
    return this.readState().roadmapItems.filter((item) => {
      if (filter.status && item.status !== normalizeRoadmapItemStatus(filter.status)) {
        return false;
      }
      if (filter.horizon && item.horizon !== normalizeRoadmapItemHorizon(filter.horizon)) {
        return false;
      }
      return true;
    });
  }

  readRoadmapItem(ref: string): RoadmapItem {
    const itemId = normalizeRoadmapRef(ref);
    const item = this.readState().roadmapItems.find((candidate) => candidate.id === itemId);
    if (!item) {
      throw new Error(`Unknown roadmap item: ${ref}`);
    }
    return item;
  }

  hasRoadmapItem(ref: string): boolean {
    try {
      return Boolean(this.readRoadmapItem(ref));
    } catch {
      return false;
    }
  }

  validateRoadmapRefs(refs: string[]): string[] {
    const normalized = normalizeStringList(refs.map((ref) => normalizeRoadmapRef(ref)));
    for (const ref of normalized) {
      if (!this.hasRoadmapItem(ref)) {
        throw new Error(`Unknown roadmap item: ${ref}`);
      }
    }
    return normalized;
  }

  upsertRoadmapItem(input: RoadmapItemInput | UpdateRoadmapItemInput): ConstitutionalRecord {
    const state = this.readState();
    const timestamp = currentTimestamp();
    const existingItem = "id" in input && input.id ? this.readRoadmapItem(input.id) : null;
    const normalized = normalizeRoadmapItem(
      existingItem
        ? {
            id: existingItem.id,
            title: input.title ?? existingItem.title,
            status: input.status ?? existingItem.status,
            horizon: input.horizon ?? existingItem.horizon,
            summary: input.summary ?? existingItem.summary,
            rationale: input.rationale ?? existingItem.rationale,
            initiativeIds: input.initiativeIds ?? existingItem.initiativeIds,
            researchIds: input.researchIds ?? existingItem.researchIds,
            specChangeIds: input.specChangeIds ?? existingItem.specChangeIds,
          }
        : input,
      state.roadmapItems.map((item) => item.id),
      timestamp,
    );
    const nextItems = [...state.roadmapItems.filter((item) => item.id !== normalized.id), normalized].sort(
      (left, right) => left.id.localeCompare(right.id),
    );
    state.roadmapItems = nextItems;
    state.updatedAt = timestamp;
    return this.syncArtifacts(state);
  }

  linkInitiative(itemRef: string, initiativeId: string): ConstitutionalRecord {
    const item = this.readRoadmapItem(itemRef);
    return this.upsertRoadmapItem({
      id: item.id,
      initiativeIds: normalizeStringList([...item.initiativeIds, initiativeId]),
    });
  }

  unlinkInitiative(itemRef: string, initiativeId: string): ConstitutionalRecord {
    const item = this.readRoadmapItem(itemRef);
    return this.upsertRoadmapItem({
      id: item.id,
      initiativeIds: item.initiativeIds.filter((candidate) => candidate !== initiativeId.trim()),
    });
  }

  recordDecision(
    question: string,
    answer: string,
    kind: ConstitutionDecisionKind = "clarification",
    affectedArtifacts: string[] = [],
  ): ConstitutionalRecord {
    const state = this.readState();
    const timestamp = currentTimestamp();
    const decision: ConstitutionDecisionRecord = {
      id: nextSequenceId(
        this.readDecisions().map((entry) => entry.id),
        "decision",
      ),
      createdAt: timestamp,
      kind: normalizeDecisionKind(kind),
      question: question.trim(),
      answer: answer.trim(),
      affectedArtifacts: normalizeStringList(affectedArtifacts),
    };
    fs.appendFileSync(getConstitutionalDecisionsPath(this.cwd), `${JSON.stringify(decision)}\n`, "utf-8");
    state.updatedAt = timestamp;
    return this.syncArtifacts(state);
  }
}

export function createConstitutionalStore(cwd: string): ConstitutionalStore {
  return new ConstitutionalStore(cwd);
}
