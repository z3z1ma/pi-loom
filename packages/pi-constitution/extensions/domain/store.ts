import * as path from "node:path";
import {
  appendEntityEvent,
  findEntityByDisplayId,
  upsertEntityByDisplayId,
} from "@pi-loom/pi-storage/storage/entities.js";
import { getLoomCatalogPaths } from "@pi-loom/pi-storage/storage/locations.js";
import { openWorkspaceStorage } from "@pi-loom/pi-storage/storage/workspace.js";
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
  renderConstitutionalBrief,
  renderConstraintsMarkdown,
  renderPrinciplesMarkdown,
  renderRoadmapMarkdown,
  renderVisionMarkdown,
} from "./render.js";

const CONSTITUTION_ENTITY_DISPLAY_ID = "constitution";

const MISSING_QUESTIONS = {
  vision: "Define the durable project vision.",
  principles: "Capture the guiding decision principles.",
  constraints: "Capture the architectural and business constraints.",
  roadmap: "Capture the strategic direction and roadmap.",
} as const;

interface ConstitutionalEntityAttributes {
  state: ConstitutionalState;
}

function hasStructuredConstitutionAttributes(attributes: unknown): attributes is ConstitutionalEntityAttributes {
  return Boolean(attributes && typeof attributes === "object" && "state" in attributes);
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

  private normalizeState(state: ConstitutionalState): ConstitutionalState {
    const normalized: ConstitutionalState = {
      ...state,
      roadmapItems: state.roadmapItems
        .map(normalizeRoadmapItemState)
        .sort((left, right) => left.id.localeCompare(right.id)),
      roadmapItemIds: state.roadmapItems.map((item) => item.id),
      initiativeIds: aggregateRoadmapIds(state.roadmapItems, "initiativeIds"),
      researchIds: aggregateRoadmapIds(state.roadmapItems, "researchIds"),
      specChangeIds: aggregateRoadmapIds(state.roadmapItems, "specChangeIds"),
      completeness: { ...state.completeness },
      currentFocus: normalizeStringList(state.currentFocus),
      openConstitutionQuestions: normalizeStringList(state.openConstitutionQuestions),
    };
    normalized.completeness = computeCompleteness(normalized);
    normalized.openConstitutionQuestions = computeQuestions(normalized);
    return normalized;
  }

  private materializeArtifacts(
    state: ConstitutionalState,
    decisions: ConstitutionDecisionRecord[],
  ): ConstitutionalRecord {
    const normalized = this.normalizeState(state);
    const brief = renderConstitutionalBrief(normalized);
    const vision = renderVisionMarkdown(normalized);
    const principles = renderPrinciplesMarkdown(normalized);
    const constraints = renderConstraintsMarkdown(normalized);
    const roadmap = renderRoadmapMarkdown(normalized, decisions);

    return {
      state: normalized,
      brief,
      vision,
      principles,
      constraints,
      roadmap,
      decisions,
      dashboard: buildConstitutionalDashboard(normalized),
    };
  }

  private async loadCanonicalRecord(): Promise<{
    record: ConstitutionalRecord;
    storage: Awaited<ReturnType<typeof openWorkspaceStorage>>["storage"];
  }> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    let entity = await findEntityByDisplayId(
      storage,
      identity.space.id,
      "constitution",
      CONSTITUTION_ENTITY_DISPLAY_ID,
    );

    if (!entity) {
      const timestamp = currentTimestamp();
      const bootstrapState = this.defaultState({}, timestamp);
      entity = await upsertEntityByDisplayId(storage, {
        kind: "constitution",
        spaceId: identity.space.id,
        owningRepositoryId: identity.repository.id,
        displayId: CONSTITUTION_ENTITY_DISPLAY_ID,
        title: bootstrapState.title,
        summary: bootstrapState.visionSummary || bootstrapState.strategicDirectionSummary || bootstrapState.title,
        status: "active",
        version: 1,
        tags: ["constitution"],
        attributes: { state: bootstrapState },
        createdAt: bootstrapState.createdAt,
        updatedAt: bootstrapState.updatedAt,
      });
      const record = this.materializeArtifacts(bootstrapState, []);
      return { record, storage };
    }

    if (!hasStructuredConstitutionAttributes(entity.attributes)) {
      throw new Error("Constitution entity is missing structured attributes");
    }

    const attributes = entity.attributes;
    const state = this.normalizeState(attributes.state ?? this.defaultState({}, currentTimestamp()));
    const decisions = (await storage.listEvents(entity.id))
      .filter((event) => event.kind === "decision_recorded")
      .map((event) => event.payload.decision as ConstitutionDecisionRecord)
      .map((decision) => ({
        ...decision,
        kind: normalizeDecisionKind(decision.kind),
        affectedArtifacts: normalizeStringList(decision.affectedArtifacts),
      }))
      .sort((left, right) => left.id.localeCompare(right.id));

    return { record: this.materializeArtifacts(state, decisions), storage };
  }

  private async persistCanonical(
    state: ConstitutionalState,
    decisions: ConstitutionDecisionRecord[],
  ): Promise<ConstitutionalRecord> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const normalized = this.normalizeState(state);
    const existing = await findEntityByDisplayId(
      storage,
      identity.space.id,
      "constitution",
      CONSTITUTION_ENTITY_DISPLAY_ID,
    );
    const version = (existing?.version ?? 0) + 1;
    await upsertEntityByDisplayId(storage, {
      kind: "constitution",
      spaceId: identity.space.id,
      owningRepositoryId: identity.repository.id,
      displayId: CONSTITUTION_ENTITY_DISPLAY_ID,
      title: normalized.title,
      summary: normalized.visionSummary || normalized.strategicDirectionSummary || normalized.title,
      status: "active",
      version,
      tags: ["constitution"],
      attributes: { state: normalized },
      createdAt: existing?.createdAt ?? normalized.createdAt,
      updatedAt: normalized.updatedAt,
    });
    return this.materializeArtifacts(normalized, decisions);
  }

  async initLedger(input: InitConstitutionInput = {}): Promise<{ initialized: true; root: string }> {
    const { record } = await this.loadCanonicalRecord();
    if (input.title || input.projectId) {
      const nextState = { ...record.state };
      if (input.title?.trim()) {
        nextState.title = input.title.trim();
      }
      if (input.projectId?.trim()) {
        nextState.projectId = normalizeProjectId(input.projectId.trim());
      }
      nextState.updatedAt = currentTimestamp();
      await this.persistCanonical(nextState, record.decisions);
    }
    return { initialized: true, root: getLoomCatalogPaths().catalogPath };
  }

  async readConstitution(): Promise<ConstitutionalRecord> {
    return (await this.loadCanonicalRecord()).record;
  }

  async updateVision(input: UpdateVisionInput): Promise<ConstitutionalRecord> {
    const { record } = await this.loadCanonicalRecord();
    const state = { ...record.state };
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
    return this.persistCanonical(state, record.decisions);
  }

  async setPrinciples(entries: ConstitutionalEntryInput[]): Promise<ConstitutionalRecord> {
    const { record } = await this.loadCanonicalRecord();
    const state = {
      ...record.state,
      principles: normalizeEntries(entries, "principle"),
      updatedAt: currentTimestamp(),
    };
    return this.persistCanonical(state, record.decisions);
  }

  async setConstraints(entries: ConstitutionalEntryInput[]): Promise<ConstitutionalRecord> {
    const { record } = await this.loadCanonicalRecord();
    const state = {
      ...record.state,
      constraints: normalizeEntries(entries, "constraint"),
      updatedAt: currentTimestamp(),
    };
    return this.persistCanonical(state, record.decisions);
  }

  async updateRoadmap(input: UpdateRoadmapInput): Promise<ConstitutionalRecord> {
    const { record } = await this.loadCanonicalRecord();
    const state = { ...record.state };
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
    return this.persistCanonical(state, record.decisions);
  }

  async listRoadmapItems(filter: RoadmapListFilter = {}): Promise<RoadmapItem[]> {
    const { record } = await this.loadCanonicalRecord();
    return record.state.roadmapItems.filter((item) => {
      if (filter.status && item.status !== normalizeRoadmapItemStatus(filter.status)) return false;
      if (filter.horizon && item.horizon !== normalizeRoadmapItemHorizon(filter.horizon)) return false;
      return true;
    });
  }

  async readRoadmapItem(ref: string): Promise<RoadmapItem> {
    const itemId = normalizeRoadmapRef(ref);
    const item = (await this.loadCanonicalRecord()).record.state.roadmapItems.find(
      (candidate) => candidate.id === itemId,
    );
    if (!item) {
      throw new Error(`Unknown roadmap item: ${ref}`);
    }
    return item;
  }

  async hasRoadmapItem(ref: string): Promise<boolean> {
    try {
      return Boolean(await this.readRoadmapItem(ref));
    } catch {
      return false;
    }
  }

  async validateRoadmapRefs(refs: string[]): Promise<string[]> {
    const normalized = normalizeStringList(refs.map((ref) => normalizeRoadmapRef(ref)));
    for (const ref of normalized) {
      if (!(await this.hasRoadmapItem(ref))) {
        throw new Error(`Unknown roadmap item: ${ref}`);
      }
    }
    return normalized;
  }

  async upsertRoadmapItem(input: RoadmapItemInput | UpdateRoadmapItemInput): Promise<ConstitutionalRecord> {
    const { record } = await this.loadCanonicalRecord();
    const state = { ...record.state };
    const timestamp = currentTimestamp();
    const existingItem = "id" in input && input.id ? await this.readRoadmapItem(input.id) : null;
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
    state.roadmapItems = [...state.roadmapItems.filter((item) => item.id !== normalized.id), normalized].sort(
      (left, right) => left.id.localeCompare(right.id),
    );
    state.updatedAt = timestamp;
    return this.persistCanonical(state, record.decisions);
  }

  async linkInitiative(itemRef: string, initiativeId: string): Promise<ConstitutionalRecord> {
    const item = await this.readRoadmapItem(itemRef);
    return this.upsertRoadmapItem({
      id: item.id,
      initiativeIds: normalizeStringList([...item.initiativeIds, initiativeId]),
    });
  }

  async unlinkInitiative(itemRef: string, initiativeId: string): Promise<ConstitutionalRecord> {
    const item = await this.readRoadmapItem(itemRef);
    return this.upsertRoadmapItem({
      id: item.id,
      initiativeIds: item.initiativeIds.filter((candidate) => candidate !== initiativeId.trim()),
    });
  }

  async recordDecision(
    question: string,
    answer: string,
    kind: ConstitutionDecisionKind = "clarification",
    affectedArtifacts: string[] = [],
  ): Promise<ConstitutionalRecord> {
    const { record, storage } = await this.loadCanonicalRecord();
    const { identity } = await openWorkspaceStorage(this.cwd);
    const timestamp = currentTimestamp();
    const decisions = [...record.decisions];
    const decision: ConstitutionDecisionRecord = {
      id: nextSequenceId(
        decisions.map((entry) => entry.id),
        "decision",
      ),
      createdAt: timestamp,
      kind: normalizeDecisionKind(kind),
      question: question.trim(),
      answer: answer.trim(),
      affectedArtifacts: normalizeStringList(affectedArtifacts),
    };
    const entity = await findEntityByDisplayId(
      storage,
      identity.space.id,
      "constitution",
      CONSTITUTION_ENTITY_DISPLAY_ID,
    );
    if (entity) {
      await appendEntityEvent(storage, entity.id, "decision_recorded", "constitution-store", { decision }, timestamp);
    }
    decisions.push(decision);
    const state = { ...record.state, updatedAt: timestamp };
    return this.persistCanonical(state, decisions);
  }
}

export function createConstitutionalStore(cwd: string): ConstitutionalStore {
  return new ConstitutionalStore(cwd);
}
