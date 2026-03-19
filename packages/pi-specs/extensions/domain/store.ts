import {
  appendEntityEvent,
  findEntityByDisplayId,
  upsertEntityByDisplayId,
} from "@pi-loom/pi-storage/storage/entities.js";
import type { ProjectedEntityLinkInput } from "@pi-loom/pi-storage/storage/links.js";
import { syncProjectedEntityLinks } from "@pi-loom/pi-storage/storage/links.js";
import { getLoomCatalogPaths } from "@pi-loom/pi-storage/storage/locations.js";
import { openWorkspaceStorage } from "@pi-loom/pi-storage/storage/workspace.js";
import { analyzeSpecChange } from "./analysis.js";
import { buildSpecChecklist } from "./checklist.js";
import { parseMarkdownArtifact } from "./frontmatter.js";
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
  renderAnalysisMarkdown,
  renderChecklistMarkdown,
  renderDesignMarkdown,
  renderProposalMarkdown,
  renderTasksMarkdown,
} from "./render.js";

const SPEC_CHANGE_ENTITY_KIND = "spec_change" as const;
const SPEC_CAPABILITY_ENTITY_KIND = "spec_capability" as const;
const SPEC_LINK_PROJECTION_OWNER = "spec-store" as const;

interface SpecChangeEntityAttributes {
  state: SpecChangeState;
  decisions: SpecDecisionRecord[];
  analysis: string;
  checklist: string;
  linkedTickets?: SpecChangeRecord["linkedTickets"];
}

interface SpecCapabilityEntityAttributes {
  record: CanonicalCapabilityRecord;
}

function hasStructuredSpecChangeAttributes(attributes: unknown): attributes is SpecChangeEntityAttributes {
  return Boolean(attributes && typeof attributes === "object" && "state" in attributes);
}

function specRef(changeId: string): string {
  return `spec:${changeId}`;
}

function archivedSpecRef(changeId: string, archivedAt: string): string {
  return `archive:spec:${archivedAt}:${changeId}`;
}

function capabilityRef(capabilityId: string): string {
  return `capability:${capabilityId}`;
}

function canonicalChangeRef(state: SpecChangeState): string {
  return state.archivedRef ?? specRef(state.changeId);
}

function canonicalWorkspaceRoot(cwd: string): string {
  const base = new URL(process.cwd().endsWith("/") ? process.cwd() : `${process.cwd()}/`, "file:");
  const href = new URL(cwd, base).href.replace(/\/$/, "");
  return decodeURIComponent(href.replace("file://", ""));
}

function parseSpecChangeId(ref: string): string {
  if (ref.startsWith("archive:spec:")) {
    return normalizeChangeId(ref.split(":").at(-1) ?? ref);
  }
  return normalizeChangeId(ref.startsWith("spec:") ? ref.slice("spec:".length) : ref);
}

function parseCapabilityId(ref: string): string {
  return normalizeCapabilityId(ref.startsWith("capability:") ? ref.slice("capability:".length) : ref);
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

function summarizeChange(state: SpecChangeState, archived: boolean): SpecChangeSummary {
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
    ref: canonicalChangeRef(state),
  };
}

function capabilityFromState(state: SpecChangeState, capabilityId: string): CanonicalCapabilityRecord {
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
    ref: capabilityRef(capability.id),
  };
}

function projectedSpecChangeLinks(record: SpecChangeRecord): ProjectedEntityLinkInput[] {
  return [
    ...normalizeStringList(record.state.initiativeIds).map((initiativeId) => ({
      kind: "belongs_to" as const,
      targetKind: "initiative" as const,
      targetDisplayId: initiativeId,
    })),
    ...normalizeStringList(record.state.researchIds).map((researchId) => ({
      kind: "references" as const,
      targetKind: "research" as const,
      targetDisplayId: researchId,
    })),
    // Linked tickets stay embedded on the aggregate record and also project canonical references.
    ...normalizeStringList(record.linkedTickets?.links.map((link) => link.ticketId) ?? []).map((ticketId) => ({
      kind: "references" as const,
      targetKind: "ticket" as const,
      targetDisplayId: ticketId,
    })),
  ];
}

function projectedSpecCapabilityLinks(record: CanonicalCapabilityRecord): ProjectedEntityLinkInput[] {
  return normalizeStringList(record.sourceChanges).map((changeId) => ({
    kind: "references" as const,
    targetKind: "spec_change" as const,
    targetDisplayId: changeId,
  }));
}

export class SpecStore {
  readonly cwd: string;

  constructor(cwd: string) {
    this.cwd = canonicalWorkspaceRoot(cwd);
  }

  async initLedger(): Promise<{ initialized: true; root: string }> {
    return { initialized: true, root: getLoomCatalogPaths().catalogPath };
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
      archivedRef: null,
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
      archivedRef: state.archivedRef?.trim() || null,
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

  private artifactStatuses(state: SpecChangeState, analysis: string, checklist: string): SpecArtifactStatus[] {
    const statuses: SpecArtifactStatus[] = [];
    const changeRef = canonicalChangeRef(state);
    const renderedArtifacts: Record<SpecArtifactName, string> = {
      proposal: renderProposalMarkdown(state, []),
      design:
        state.designNotes.trim() || state.capabilities.length > 0 || state.requirements.length > 0
          ? renderDesignMarkdown(state)
          : "",
      tasks: state.tasks.length > 0 ? renderTasksMarkdown(state) : "",
      analysis,
      checklist,
    };
    for (const artifact of ["proposal", "design", "tasks", "analysis", "checklist"] as const) {
      statuses.push({
        name: artifact,
        exists: renderedArtifacts[artifact].length > 0,
        ref: `${changeRef}:artifact:${artifact}`,
        updatedAt:
          renderedArtifacts[artifact].length > 0 ? (state.artifactVersions[artifact] ?? state.updatedAt) : null,
      });
    }
    return statuses;
  }

  private materializeChangeRecord(
    state: SpecChangeState,
    decisions: SpecDecisionRecord[],
    analysis: string,
    checklist: string,
    linkedTickets: SpecChangeRecord["linkedTickets"] = null,
  ): SpecChangeRecord {
    const normalized = this.normalizeState(state);
    const archived = Boolean(normalized.archivedRef);
    const proposal = renderProposalMarkdown(normalized, decisions);
    const design =
      normalized.designNotes.trim() || normalized.capabilities.length > 0 || normalized.requirements.length > 0
        ? renderDesignMarkdown(normalized)
        : "";
    const tasksMarkdown = normalized.tasks.length > 0 ? renderTasksMarkdown(normalized) : "";
    return {
      state: normalized,
      summary: summarizeChange(normalized, archived),
      artifacts: this.artifactStatuses(normalized, analysis, checklist),
      proposal,
      design,
      tasksMarkdown,
      analysis,
      checklist,
      decisions,
      capabilitySpecs: normalized.capabilities.map((capability) => capabilityFromState(normalized, capability.id)),
      linkedTickets,
    };
  }

  private async loadCanonicalChange(ref: string): Promise<SpecChangeRecord> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const changeId = parseSpecChangeId(ref);
    const entity = await findEntityByDisplayId(storage, identity.space.id, SPEC_CHANGE_ENTITY_KIND, changeId);
    if (!entity) {
      throw new Error(`Unknown spec change: ${ref}`);
    }
    if (!hasStructuredSpecChangeAttributes(entity.attributes)) {
      throw new Error(`Spec change entity ${changeId} is missing structured attributes`);
    }
    const attributes = entity.attributes;
    return this.materializeChangeRecord(
      this.normalizeState(attributes.state),
      attributes.decisions ?? [],
      attributes.analysis ?? "",
      attributes.checklist ?? "",
      attributes.linkedTickets ?? null,
    );
  }

  private async persistCanonicalChange(
    state: SpecChangeState,
    decisions: SpecDecisionRecord[],
    analysis: string,
    checklist: string,
    linkedTickets: SpecChangeRecord["linkedTickets"] = null,
  ): Promise<SpecChangeRecord> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const existing = await findEntityByDisplayId(storage, identity.space.id, SPEC_CHANGE_ENTITY_KIND, state.changeId);
    const version = (existing?.version ?? 0) + 1;
    const record = this.materializeChangeRecord(state, decisions, analysis, checklist, linkedTickets);
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
      attributes: {
        state: record.state,
        decisions: record.decisions,
        analysis: record.analysis,
        checklist: record.checklist,
        linkedTickets: record.linkedTickets,
      },
      createdAt: existing?.createdAt ?? record.state.createdAt,
      updatedAt: record.state.updatedAt,
    });
    await syncProjectedEntityLinks({
      storage,
      spaceId: identity.space.id,
      fromEntityId: entity.id,
      projectionOwner: SPEC_LINK_PROJECTION_OWNER,
      desired: projectedSpecChangeLinks(record),
      timestamp: record.state.updatedAt,
    });
    return record;
  }

  private async mergeCanonicalCapability(state: SpecChangeState, capabilityId: string): Promise<void> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const existing = await findEntityByDisplayId(storage, identity.space.id, SPEC_CAPABILITY_ENTITY_KIND, capabilityId);
    const version = (existing?.version ?? 0) + 1;
    const current = (existing?.attributes as unknown as SpecCapabilityEntityAttributes | undefined)?.record ?? null;
    const next = capabilityFromState(state, capabilityId);
    const merged: CanonicalCapabilityRecord = {
      id: next.id,
      title: next.title,
      summary: next.summary || current?.summary || "",
      requirements: union(current?.requirements ?? [], next.requirements),
      scenarios: union(current?.scenarios ?? [], next.scenarios),
      sourceChanges: union(current?.sourceChanges ?? [], [state.changeId]),
      updatedAt: currentTimestamp(),
      ref: capabilityRef(capabilityId),
    };
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
      attributes: { record: merged },
      createdAt: existing?.createdAt ?? merged.updatedAt,
      updatedAt: merged.updatedAt,
    });
    // Archived capabilities preserve provenance via canonical links back to source spec changes.
    await syncProjectedEntityLinks({
      storage,
      spaceId: identity.space.id,
      fromEntityId: entity.id,
      projectionOwner: SPEC_LINK_PROJECTION_OWNER,
      desired: projectedSpecCapabilityLinks(merged),
      timestamp: merged.updatedAt,
    });
  }

  async listChanges(filter: SpecListFilter = {}): Promise<SpecChangeSummary[]> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const summaries: SpecChangeSummary[] = [];
    for (const entity of await storage.listEntities(identity.space.id, SPEC_CHANGE_ENTITY_KIND)) {
      if (hasStructuredSpecChangeAttributes(entity.attributes)) {
        const state = this.normalizeState(entity.attributes.state);
        summaries.push(summarizeChange(state, Boolean(state.archivedRef)));
        continue;
      }
      throw new Error(`Spec change entity ${entity.displayId} is missing structured attributes`);
    }
    return summaries
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

  async listCapabilities(): Promise<CanonicalCapabilityRecord[]> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    return (await storage.listEntities(identity.space.id, SPEC_CAPABILITY_ENTITY_KIND))
      .map((entity) => (entity.attributes as unknown as SpecCapabilityEntityAttributes).record)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  async readCapability(ref: string): Promise<CanonicalCapabilityRecord> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const capabilityId = parseCapabilityId(ref);
    const entity = await findEntityByDisplayId(storage, identity.space.id, SPEC_CAPABILITY_ENTITY_KIND, capabilityId);
    if (!entity) {
      throw new Error(`Unknown capability: ${ref}`);
    }
    const record = (entity.attributes as unknown as SpecCapabilityEntityAttributes | undefined)?.record;
    if (!record) {
      throw new Error(`Capability entity ${capabilityId} is missing structured attributes`);
    }
    return record;
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
    return this.persistCanonicalChange(state, [], "", "", null);
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
      record.analysis,
      record.checklist,
      record.linkedTickets,
    );
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const entity = await findEntityByDisplayId(
      storage,
      identity.space.id,
      SPEC_CHANGE_ENTITY_KIND,
      record.state.changeId,
    );
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
    return this.persistCanonicalChange(
      state,
      record.decisions,
      record.analysis,
      record.checklist,
      record.linkedTickets,
    );
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
    return this.persistCanonicalChange(
      state,
      record.decisions,
      record.analysis,
      record.checklist,
      record.linkedTickets,
    );
  }

  async setInitiativeIds(ref: string, initiativeIds: string[]): Promise<SpecChangeRecord> {
    const record = await this.loadCanonicalChange(ref);
    const state = this.normalizeState({
      ...record.state,
      initiativeIds: normalizeStringList(initiativeIds),
      updatedAt: currentTimestamp(),
    });
    return this.persistCanonicalChange(
      state,
      record.decisions,
      record.analysis,
      record.checklist,
      record.linkedTickets,
    );
  }

  async setResearchIds(ref: string, researchIds: string[]): Promise<SpecChangeRecord> {
    const record = await this.loadCanonicalChange(ref);
    const state = this.normalizeState({
      ...record.state,
      researchIds: normalizeStringList(researchIds),
      updatedAt: currentTimestamp(),
    });
    return this.persistCanonicalChange(
      state,
      record.decisions,
      record.analysis,
      record.checklist,
      record.linkedTickets,
    );
  }

  async analyzeChange(ref: string): Promise<SpecChangeRecord> {
    const record = await this.loadCanonicalChange(ref);
    const state = this.normalizeState({ ...record.state, updatedAt: currentTimestamp() });
    const analysis = renderAnalysisMarkdown(analyzeSpecChange(state));
    return this.persistCanonicalChange(state, record.decisions, analysis, record.checklist, record.linkedTickets);
  }

  async generateChecklist(ref: string): Promise<SpecChangeRecord> {
    const record = await this.loadCanonicalChange(ref);
    const state = this.normalizeState({ ...record.state, updatedAt: currentTimestamp() });
    const checklist = renderChecklistMarkdown(buildSpecChecklist(state));
    return this.persistCanonicalChange(state, record.decisions, record.analysis, checklist, record.linkedTickets);
  }

  async finalizeChange(ref: string): Promise<SpecChangeRecord> {
    const record = await this.loadCanonicalChange(ref);
    const state = this.normalizeState({ ...record.state });
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
    return this.persistCanonicalChange(state, record.decisions, analysis, checklist, record.linkedTickets);
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
      archivedRef: archivedSpecRef(record.state.changeId, archivedAt.slice(0, 10)),
      updatedAt: archivedAt,
    });
    return this.persistCanonicalChange(
      state,
      record.decisions,
      record.analysis,
      record.checklist,
      record.linkedTickets,
    );
  }
}

export function createSpecStore(cwd: string): SpecStore {
  return new SpecStore(cwd);
}
