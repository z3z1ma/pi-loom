import { resolve } from "node:path";
import type { ConstitutionalRecord } from "#constitution/extensions/domain/models.js";
import { createConstitutionalStore } from "#constitution/extensions/domain/store.js";
import type { InitiativeRecord } from "#initiatives/extensions/domain/models.js";
import { createInitiativeStore } from "#initiatives/extensions/domain/store.js";
import type { ResearchRecord } from "#research/extensions/domain/models.js";
import { createResearchStore } from "#research/extensions/domain/store.js";
import type { SpecChangeRecord } from "#specs/extensions/domain/models.js";
import { hasProjectedArtifactAttributes, syncProjectedArtifacts } from "#storage/artifacts.js";
import type { LoomEntityKind, LoomEntityRecord } from "#storage/contract.js";
import {
  appendEntityEvent,
  findEntityByDisplayId,
  upsertEntityByDisplayIdWithLifecycleEvents,
} from "#storage/entities.js";
import { createEntityId } from "#storage/ids.js";
import type { ProjectedEntityLinkInput } from "#storage/links.js";
import { syncProjectedEntityLinks } from "#storage/links.js";
import { filterAndSortListEntries } from "#storage/list-search.js";
import { getLoomCatalogPaths } from "#storage/locations.js";
import { requireResolvedRepositoryIdentity, resolveWorkspaceIdentity } from "#storage/repository.js";
import { openRepositoryWorkspaceStorage, openWorkspaceStorage, openWorkspaceStorageSync } from "#storage/workspace.js";
import type { CreateTicketInput, TicketReadResult } from "#ticketing/extensions/domain/models.js";
import { createTicketStore } from "#ticketing/extensions/domain/store.js";
import { buildCritiqueDashboard, summarizeCritique } from "./dashboard.js";
import { renderBulletList, renderSection, serializeMarkdownArtifact } from "./frontmatter.js";
import type {
  CreateCritiqueFindingInput,
  CreateCritiqueInput,
  CreateCritiqueRunInput,
  CritiqueCanonicalEntityRecord,
  CritiqueCanonicalState,
  CritiqueContextRefs,
  CritiqueFindingArtifactPayload,
  CritiqueFindingRecord,
  CritiqueLaunchDescriptor,
  CritiqueListFilter,
  CritiqueReadResult,
  CritiqueRunRecord,
  CritiqueState,
  CritiqueSummary,
  CritiqueTargetRef,
  TicketifyCritiqueFindingInput,
  UpdateCritiqueFindingInput,
  UpdateCritiqueInput,
} from "./models.js";
import {
  currentTimestamp,
  isActiveFindingStatus,
  nextSequenceId,
  normalizeContextRefs,
  normalizeCritiqueId,
  normalizeCritiqueRef,
  normalizeFindingConfidence,
  normalizeFindingKind,
  normalizeFindingSeverity,
  normalizeFindingStatus,
  normalizeFocusAreas,
  normalizeOptionalString,
  normalizeRunKind,
  normalizeStatus,
  normalizeStringList,
  normalizeTargetKind,
  normalizeVerdict,
  slugifyTitle,
} from "./normalize.js";
import { getCritiqueDir } from "./paths.js";
import { renderCritiqueMarkdown, renderLaunchDescriptor } from "./render.js";

const ENTITY_KIND = "critique" as const;
const CRITIQUE_LINK_PROJECTION_OWNER = "critique-store";
const CRITIQUE_FINDING_PROJECTION_OWNER = "critique-findings";
const CRITIQUE_FINDING_ARTIFACT_TYPE = "critique-finding";

interface CritiqueEntityAttributes {
  record: CritiqueCanonicalEntityRecord;
}

interface CritiqueSnapshot {
  state: CritiqueCanonicalState;
  runs: CritiqueRunRecord[];
  findings: CritiqueFindingRecord[];
  launch?: CritiqueLaunchDescriptor | null;
}

function requireStoredString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`Critique canonical state is missing ${label}`);
  }
  return value;
}

function hasStructuredCritiqueAttributes(attributes: unknown): attributes is CritiqueEntityAttributes {
  if (!attributes || typeof attributes !== "object" || !("record" in attributes)) {
    return false;
  }
  const record = (attributes as { record?: Record<string, unknown> }).record;
  const state = record?.state as Record<string, unknown> | undefined;
  return Boolean(
    record &&
      Array.isArray(record.runs) &&
      state &&
      typeof state.critiqueId === "string" &&
      typeof state.title === "string" &&
      typeof state.status === "string",
  );
}

interface StoredCritiqueEntityRow {
  id: string;
  display_id: string | null;
  version: number;
  created_at: string;
  attributes_json: string;
}

function openCritiqueCatalogSync(cwd: string) {
  const opened = openWorkspaceStorageSync(cwd);
  return {
    ...opened,
    identity: requireResolvedRepositoryIdentity(opened.identity),
  };
}

function parseStoredJson<T>(value: string, fallback: T): T {
  if (!value.trim()) {
    return fallback;
  }
  return JSON.parse(value) as T;
}

function findStoredCritiqueRow(cwd: string, critiqueId: string): StoredCritiqueEntityRow | null {
  const { storage, identity } = openCritiqueCatalogSync(cwd);
  return (storage.db
    .prepare(
      "SELECT id, display_id, version, created_at, attributes_json FROM entities WHERE space_id = ? AND kind = ? AND display_id = ? LIMIT 1",
    )
    .get(identity.space.id, ENTITY_KIND, critiqueId) ?? null) as StoredCritiqueEntityRow | null;
}

function listStoredCritiqueRows(cwd: string): StoredCritiqueEntityRow[] {
  const { storage, identity } = openCritiqueCatalogSync(cwd);
  return storage.db
    .prepare(
      "SELECT id, display_id, version, created_at, attributes_json FROM entities WHERE space_id = ? AND kind = ? ORDER BY display_id",
    )
    .all(identity.space.id, ENTITY_KIND) as StoredCritiqueEntityRow[];
}

function critiqueFindingArtifactDisplayId(critiqueId: string, findingId: string): string {
  return `critique:${critiqueId}:finding:${findingId}`;
}

function toCritiqueLaunchRef(critiqueId: string): string {
  return `critique:${critiqueId}:launch`;
}

function critiqueSearchText(record: CritiqueReadResult): string[] {
  return [
    record.summary.id,
    record.summary.title,
    record.summary.targetRef,
    record.state.target.locator ?? "",
    record.state.reviewQuestion,
    ...record.summary.focusAreas,
    ...record.state.scopeRefs,
    ...record.state.contextRefs.roadmapItemIds,
    ...record.state.contextRefs.initiativeIds,
    ...record.state.contextRefs.researchIds,
    ...record.state.contextRefs.specChangeIds,
    ...record.state.contextRefs.ticketIds,
    ...record.state.followupTicketIds,
    ...record.dashboard.followupTicketIds,
  ];
}

function filterAndSortCritiqueSummaries(
  records: CritiqueReadResult[],
  filter: CritiqueListFilter = {},
): CritiqueSummary[] {
  const filtered = records.filter((record) => {
    const summary = record.summary;
    if (filter.status && summary.status !== filter.status) {
      return false;
    }
    if (filter.verdict && summary.verdict !== filter.verdict) {
      return false;
    }
    if (filter.targetKind && summary.targetKind !== filter.targetKind) {
      return false;
    }
    if (filter.focusArea && !summary.focusAreas.includes(filter.focusArea)) {
      return false;
    }
    return true;
  });

  return filterAndSortListEntries(
    filtered.map((record) => ({
      item: record.summary,
      id: record.summary.id,
      createdAt: record.state.createdAt,
      updatedAt: record.summary.updatedAt,
      fields: [
        { value: record.summary.id, weight: 12 },
        { value: record.summary.title, weight: 10 },
        { value: record.summary.targetRef, weight: 8 },
        { value: record.state.target.locator, weight: 7 },
        { value: record.state.reviewQuestion, weight: 7 },
        { value: record.summary.focusAreas.join(" "), weight: 6 },
        { value: record.state.followupTicketIds.join(" "), weight: 5 },
        { value: critiqueSearchText(record).join(" "), weight: 3 },
      ],
    })),
    { text: filter.text, sort: filter.sort },
  );
}

function toCanonicalState(state: CritiqueState): CritiqueCanonicalState {
  return {
    critiqueId: state.critiqueId,
    title: state.title,
    status: state.status,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    target: state.target,
    focusAreas: state.focusAreas,
    reviewQuestion: state.reviewQuestion,
    scopeRefs: state.scopeRefs,
    nonGoals: state.nonGoals,
    contextRefs: state.contextRefs,
    freshContextRequired: state.freshContextRequired,
    lastLaunchAt: state.lastLaunchAt,
    launchCount: state.launchCount,
  };
}

function materializeState(state: CritiqueCanonicalState): CritiqueState {
  const normalizedState = normalizeCanonicalState(state);
  return {
    ...normalizedState,
    packetSummary: "",
    currentVerdict: "concerns",
    openFindingIds: [],
    followupTicketIds: [],
    lastRunId: null,
  };
}

function normalizeCanonicalState(state: CritiqueCanonicalState): CritiqueCanonicalState {
  const target = state.target;
  if (!target || typeof target !== "object") {
    throw new Error("Critique canonical state is missing target");
  }
  if (!("locator" in target)) {
    throw new Error("Critique canonical state is missing target.locator");
  }
  if (!("scopeRefs" in state)) {
    throw new Error("Critique canonical state is missing scopeRefs");
  }
  return {
    critiqueId: normalizeCritiqueId(requireStoredString(state.critiqueId, "critiqueId")),
    title: requireStoredString(state.title, "title").trim(),
    status: normalizeStatus(requireStoredString(state.status, "status")),
    createdAt: requireStoredString(state.createdAt, "createdAt"),
    updatedAt: requireStoredString(state.updatedAt, "updatedAt"),
    target: {
      kind: normalizeTargetKind(requireStoredString(target.kind, "target.kind")),
      ref: requireStoredString(target.ref, "target.ref").trim(),
      locator: normalizeOptionalString(target.locator),
    },
    focusAreas: normalizeFocusAreas(state.focusAreas),
    reviewQuestion: state.reviewQuestion ?? "",
    scopeRefs: normalizeStringList(state.scopeRefs),
    nonGoals: normalizeStringList(state.nonGoals),
    contextRefs: normalizeContextRefs(state.contextRefs),
    freshContextRequired: state.freshContextRequired !== false,
    lastLaunchAt: normalizeOptionalString(state.lastLaunchAt),
    launchCount: typeof state.launchCount === "number" && Number.isFinite(state.launchCount) ? state.launchCount : 0,
  };
}

function normalizeFindingRecord(finding: CritiqueFindingArtifactPayload): CritiqueFindingRecord {
  return {
    ...finding,
    id: finding.id.trim(),
    critiqueId: normalizeCritiqueId(finding.critiqueId),
    runId: finding.runId.trim(),
    kind: normalizeFindingKind(finding.kind),
    severity: normalizeFindingSeverity(finding.severity),
    confidence: normalizeFindingConfidence(finding.confidence),
    title: finding.title.trim(),
    summary: finding.summary.trim(),
    evidence: normalizeStringList(finding.evidence),
    scopeRefs: normalizeStringList(finding.scopeRefs),
    recommendedAction: finding.recommendedAction.trim(),
    status: normalizeFindingStatus(finding.status),
    linkedTicketId: normalizeOptionalString(finding.linkedTicketId),
    resolutionNotes: normalizeOptionalString(finding.resolutionNotes),
  };
}

function normalizeRunRecord(run: CritiqueRunRecord): CritiqueRunRecord {
  return {
    ...run,
    id: run.id.trim(),
    critiqueId: normalizeCritiqueId(run.critiqueId),
    kind: normalizeRunKind(run.kind),
    summary: run.summary.trim(),
    verdict: normalizeVerdict(run.verdict),
    freshContext: run.freshContext !== false,
    focusAreas: normalizeFocusAreas(run.focusAreas),
    findingIds: normalizeStringList(run.findingIds),
    followupTicketIds: normalizeStringList(run.followupTicketIds),
  };
}

function buildLaunchDescriptor(state: CritiqueState): CritiqueLaunchDescriptor | null {
  if (!state.lastLaunchAt) {
    return null;
  }
  return {
    critiqueId: state.critiqueId,
    createdAt: state.lastLaunchAt,
    packetRef: toCritiquePacketRef(state.critiqueId),
    target: state.target,
    focusAreas: state.focusAreas,
    reviewQuestion: state.reviewQuestion,
    freshContextRequired: state.freshContextRequired,
    runtime: "descriptor_only",
    instructions: [
      "Open a fresh reviewer session; do not continue in the saturated executor context.",
      `Read ${toCritiquePacketRef(state.critiqueId)} before analyzing the target.`,
      "Record the run verdict with critique_run once review is complete.",
      "Record each concrete issue with critique_finding and create follow-up tickets only for accepted findings.",
    ],
  };
}

function readStructuredEntityAttributesSync<T>(cwd: string, kind: string, displayId: string): T | null {
  const { storage, identity } = openCritiqueCatalogSync(cwd);
  const row = storage.db
    .prepare("SELECT attributes_json FROM entities WHERE space_id = ? AND kind = ? AND display_id = ? LIMIT 1")
    .get(identity.space.id, kind, displayId) as { attributes_json: string } | undefined;
  return row ? parseStoredJson<T>(row.attributes_json, {} as T) : null;
}

function mergeContextRefs(...refs: Array<Partial<CritiqueContextRefs> | undefined>): CritiqueContextRefs {
  return normalizeContextRefs({
    roadmapItemIds: refs.flatMap((value) => value?.roadmapItemIds ?? []),
    initiativeIds: refs.flatMap((value) => value?.initiativeIds ?? []),
    researchIds: refs.flatMap((value) => value?.researchIds ?? []),
    specChangeIds: refs.flatMap((value) => value?.specChangeIds ?? []),
    ticketIds: refs.flatMap((value) => value?.ticketIds ?? []),
  });
}

function excerpt(value: string, limit = 280): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "(empty)";
  }
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit - 1)}…`;
}

function toCritiquePacketRef(critiqueId: string): string {
  return `critique:${critiqueId}:packet`;
}

function summarizeRuns(runs: CritiqueRunRecord[]): string[] {
  return runs.map((run) => `${run.id} [${run.kind}/${run.verdict}] ${run.summary}`);
}

function summarizeFindingEvidence(finding: CritiqueFindingRecord): string {
  return finding.evidence.length > 0 ? finding.evidence.join("; ") : "(none)";
}

function deriveContextRefsFromTicket(ticket: TicketReadResult): CritiqueContextRefs {
  return mergeContextRefs({
    initiativeIds: ticket.ticket.frontmatter["initiative-ids"],
    researchIds: ticket.ticket.frontmatter["research-ids"],
    ticketIds: [ticket.summary.id],
  });
}

function deriveContextRefsFromSpec(change: SpecChangeRecord): CritiqueContextRefs {
  return mergeContextRefs({
    initiativeIds: change.state.initiativeIds,
    researchIds: change.state.researchIds,
    specChangeIds: [change.state.changeId],
  });
}

function deriveContextRefsFromInitiative(initiative: InitiativeRecord): CritiqueContextRefs {
  return mergeContextRefs({
    roadmapItemIds: initiative.state.roadmapRefs,
    initiativeIds: [initiative.state.initiativeId],
    researchIds: initiative.state.researchIds,
    specChangeIds: initiative.state.specChangeIds,
    ticketIds: initiative.state.ticketIds,
  });
}

function deriveContextRefsFromResearch(research: ResearchRecord): CritiqueContextRefs {
  return mergeContextRefs({
    initiativeIds: research.state.initiativeIds,
    researchIds: [research.state.researchId],
    specChangeIds: research.state.specChangeIds,
    ticketIds: research.state.ticketIds,
  });
}

function deriveContextRefsFromConstitution(constitution: ConstitutionalRecord): CritiqueContextRefs {
  return mergeContextRefs({
    roadmapItemIds: constitution.state.roadmapItemIds,
    initiativeIds: constitution.state.initiativeIds,
    researchIds: constitution.state.researchIds,
    specChangeIds: constitution.state.specChangeIds,
  });
}

function critiqueTargetEntityKind(targetKind: CritiqueTargetRef["kind"]): LoomEntityKind | null {
  switch (targetKind) {
    case "ticket":
      return "ticket";
    case "spec":
      return "spec_change";
    case "initiative":
      return "initiative";
    case "research":
      return "research";
    case "constitution":
      return "constitution";
    case "artifact":
      return "artifact";
    case "workspace":
      return null;
  }
}

function buildProjectedCritiqueLinks(state: CritiqueState): ProjectedEntityLinkInput[] {
  const desired: ProjectedEntityLinkInput[] = [
    ...state.contextRefs.initiativeIds.map(
      (targetDisplayId): ProjectedEntityLinkInput => ({
        kind: "references",
        targetKind: "initiative",
        targetDisplayId,
      }),
    ),
    ...state.contextRefs.researchIds.map(
      (targetDisplayId): ProjectedEntityLinkInput => ({
        kind: "references",
        targetKind: "research",
        targetDisplayId,
      }),
    ),
    ...state.contextRefs.specChangeIds.map(
      (targetDisplayId): ProjectedEntityLinkInput => ({
        kind: "references",
        targetKind: "spec_change",
        targetDisplayId,
      }),
    ),
    ...state.contextRefs.ticketIds.map(
      (targetDisplayId): ProjectedEntityLinkInput => ({
        kind: "references",
        targetKind: "ticket",
        targetDisplayId,
        required: false,
      }),
    ),
    ...state.followupTicketIds.map(
      (targetDisplayId): ProjectedEntityLinkInput => ({
        kind: "references",
        targetKind: "ticket",
        targetDisplayId,
        required: false,
      }),
    ),
  ];

  const targetKind = critiqueTargetEntityKind(state.target.kind);
  if (targetKind) {
    desired.unshift({
      kind: "critiques",
      targetKind,
      targetDisplayId: state.target.ref,
      required: false,
    });
  }

  return desired;
}

function ticketTypeForFinding(kind: CritiqueFindingRecord["kind"]): CreateTicketInput["type"] {
  switch (kind) {
    case "bug":
    case "edge_case":
    case "missing_test":
      return "bug";
    case "security":
    case "constitutional_violation":
      return "security";
    case "docs_gap":
      return "chore";
    default:
      return "review";
  }
}

function ticketPriorityForSeverity(severity: CritiqueFindingRecord["severity"]): CreateTicketInput["priority"] {
  switch (severity) {
    case "critical":
      return "critical";
    case "high":
      return "high";
    case "medium":
      return "medium";
    case "low":
      return "low";
  }
}

interface ResolvedCritiqueContext {
  targetSummary: string;
  contextRefs: CritiqueContextRefs;
  constitution: ConstitutionalRecord | null;
  roadmapItems: string[];
  initiatives: string[];
  research: string[];
  specs: string[];
  tickets: string[];
  packetSummary: string;
}

export class CritiqueStore {
  readonly cwd: string;

  constructor(cwd: string) {
    this.cwd = resolve(cwd);
  }

  initLedger(): { initialized: true; root: string } {
    return { initialized: true, root: getLoomCatalogPaths().catalogPath };
  }

  private critiqueDirectories(): string[] {
    return listStoredCritiqueRows(this.cwd)
      .map((row) => row.display_id)
      .filter((displayId): displayId is string => Boolean(displayId))
      .map((displayId) => getCritiqueDir(this.cwd, displayId));
  }

  private nextCritiqueId(baseTitle: string): string {
    const baseId = slugifyTitle(baseTitle);
    const existing = new Set(this.critiqueDirectories().map((directory) => directory.split("/").at(-1) ?? directory));
    if (!existing.has(baseId)) {
      return baseId;
    }
    let attempt = 2;
    while (existing.has(`${baseId}-${attempt}`)) {
      attempt += 1;
    }
    return `${baseId}-${attempt}`;
  }

  private resolveCritiqueDirectory(ref: string): string {
    const normalizedRef = normalizeCritiqueRef(ref);
    if (findStoredCritiqueRow(this.cwd, normalizedRef)) {
      return getCritiqueDir(this.cwd, normalizedRef);
    }
    throw new Error(`Unknown critique: ${ref}`);
  }

  private readStoredSnapshot(critiqueDir: string): CritiqueSnapshot {
    const critiqueId = normalizeCritiqueRef(critiqueDir);
    const row = findStoredCritiqueRow(this.cwd, critiqueId);
    if (!row) {
      throw new Error(`Unknown critique: ${critiqueId}`);
    }
    const attributes = parseStoredJson<CritiqueEntityAttributes | Record<string, unknown>>(row.attributes_json, {});
    if (!hasStructuredCritiqueAttributes(attributes)) {
      throw new Error(`Critique ${critiqueId} is missing structured attributes`);
    }
    return {
      state: normalizeCanonicalState(attributes.record.state),
      runs: attributes.record.runs.map((run) => normalizeRunRecord(run)),
      findings: this.readStoredFindings(row),
    };
  }

  private readStoredFindings(row: StoredCritiqueEntityRow): CritiqueFindingRecord[] {
    const { storage, identity } = openCritiqueCatalogSync(this.cwd);
    const artifacts = storage.db
      .prepare("SELECT attributes_json FROM entities WHERE space_id = ? AND kind = ? ORDER BY display_id")
      .all(identity.space.id, "artifact") as Array<{ attributes_json: string }>;
    return artifacts
      .map((artifact) => parseStoredJson<Record<string, unknown>>(artifact.attributes_json, {}))
      .filter(hasProjectedArtifactAttributes)
      .filter(
        (attributes) =>
          attributes.projectionOwner === CRITIQUE_FINDING_PROJECTION_OWNER &&
          attributes.artifactType === CRITIQUE_FINDING_ARTIFACT_TYPE &&
          attributes.owner.entityId === row.id,
      )
      .map((attributes) => normalizeFindingRecord(attributes.payload as unknown as CritiqueFindingArtifactPayload))
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  private readConstitutionIfPresent(): ConstitutionalRecord | null {
    const attributes = readStructuredEntityAttributesSync<{ state: ConstitutionalRecord["state"] }>(
      this.cwd,
      "constitution",
      requireResolvedRepositoryIdentity(resolveWorkspaceIdentity(this.cwd)).repository.slug,
    );
    return attributes ? ({ state: attributes.state, decisions: [] } as unknown as ConstitutionalRecord) : null;
  }

  private async readConstitutionIfPresentAsync(): Promise<ConstitutionalRecord | null> {
    try {
      return await createConstitutionalStore(this.cwd).readConstitution();
    } catch {
      return null;
    }
  }

  private safeReadInitiative(id: string): InitiativeRecord | null {
    const attributes = readStructuredEntityAttributesSync<{ state: InitiativeRecord["state"] }>(
      this.cwd,
      "initiative",
      id,
    );
    return attributes
      ? ({
          state: attributes.state,
          summary: {
            id: attributes.state.initiativeId,
            title: attributes.state.title,
            status: attributes.state.status,
            milestoneCount: attributes.state.milestones.length,
            specChangeCount: attributes.state.specChangeIds.length,
            ticketCount: attributes.state.ticketIds.length,
            updatedAt: attributes.state.updatedAt,
            tags: attributes.state.tags,
            path: `initiative:${attributes.state.initiativeId}`,
          },
          brief: "",
          decisions: [],
          dashboard: {} as InitiativeRecord["dashboard"],
        } as unknown as InitiativeRecord)
      : null;
  }

  private async safeReadInitiativeAsync(id: string): Promise<InitiativeRecord | null> {
    try {
      return await createInitiativeStore(this.cwd).readInitiative(id);
    } catch {
      return null;
    }
  }

  private safeReadResearch(id: string): ResearchRecord | null {
    const attributes = readStructuredEntityAttributesSync<{
      state: ResearchRecord["state"];
      hypotheses?: ResearchRecord["hypothesisHistory"];
      artifacts?: ResearchRecord["artifacts"];
    }>(this.cwd, "research", id);
    return attributes
      ? ({
          state: attributes.state,
          summary: {
            id: attributes.state.researchId,
            title: attributes.state.title,
            status: attributes.state.status,
            hypothesisCount: attributes.hypotheses?.length ?? 0,
            artifactCount: attributes.artifacts?.length ?? 0,
            linkedInitiativeCount: attributes.state.initiativeIds.length,
            linkedSpecChangeCount: attributes.state.specChangeIds.length,
            linkedTicketCount: attributes.state.ticketIds.length,
            updatedAt: attributes.state.updatedAt,
            tags: attributes.state.tags,
            path: `research:${attributes.state.researchId}`,
          },
          synthesis: "",
          hypotheses: attributes.hypotheses ?? [],
          hypothesisHistory: attributes.hypotheses ?? [],
          artifacts: attributes.artifacts ?? [],
          dashboard: {} as ResearchRecord["dashboard"],
          map: {} as ResearchRecord["map"],
        } as unknown as ResearchRecord)
      : null;
  }

  private async safeReadResearchAsync(id: string): Promise<ResearchRecord | null> {
    try {
      return await createResearchStore(this.cwd).readResearch(id);
    } catch {
      return null;
    }
  }

  private safeReadSpec(id: string): SpecChangeRecord | null {
    const attributes = readStructuredEntityAttributesSync<{ record: SpecChangeRecord }>(this.cwd, "spec_change", id);
    return attributes?.record ?? null;
  }

  private async safeReadSpecAsync(id: string): Promise<SpecChangeRecord | null> {
    try {
      const { storage, identity } = await openWorkspaceStorage(this.cwd);
      const entity = await findEntityByDisplayId(storage, identity.space.id, "spec_change", id);
      if (!entity) {
        return null;
      }
      const attributes = entity.attributes as {
        state: SpecChangeRecord["state"];
        decisions: SpecChangeRecord["decisions"];
        analysis: SpecChangeRecord["analysis"];
        checklist: SpecChangeRecord["checklist"];
      };
      return {
        state: attributes.state,
        decisions: attributes.decisions,
        analysis: attributes.analysis,
        checklist: attributes.checklist,
        summary: {
          id: entity.displayId,
          title: entity.title,
          status: entity.status as SpecChangeRecord["summary"]["status"],
          proposal: attributes.state.proposalSummary,
          updatedAt: entity.updatedAt,
          path: `spec-change:${entity.displayId}`,
          initiativeIds: attributes.state.initiativeIds,
          researchIds: attributes.state.researchIds,
        },
      } as unknown as SpecChangeRecord;
    } catch {
      return null;
    }
  }

  private safeReadTicket(id: string): TicketReadResult | null {
    const attributes = readStructuredEntityAttributesSync<{ record: TicketReadResult }>(this.cwd, "ticket", id);
    return attributes?.record ?? null;
  }

  private async safeReadTicketAsync(id: string): Promise<TicketReadResult | null> {
    try {
      return await createTicketStore(this.cwd).readTicketAsync(id);
    } catch {
      return null;
    }
  }

  private resolveTargetSummary(target: CritiqueTargetRef): { summary: string; contextRefs: CritiqueContextRefs } {
    switch (target.kind) {
      case "ticket": {
        const ticket = this.safeReadTicket(target.ref);
        if (!ticket) {
          return {
            summary: `Ticket ${target.ref} could not be loaded. Review the referenced execution artifact directly.`,
            contextRefs: mergeContextRefs({ ticketIds: [target.ref] }),
          };
        }
        return {
          summary: [
            `${ticket.summary.id} [${ticket.summary.status}] ${ticket.summary.title}`,
            `Summary: ${excerpt(ticket.ticket.body.summary)}`,
            `Plan: ${excerpt(ticket.ticket.body.plan)}`,
            `Verification: ${excerpt(ticket.ticket.body.verification)}`,
            `Blockers: ${ticket.blockers.join(", ") || "none"}`,
          ].join("\n"),
          contextRefs: deriveContextRefsFromTicket(ticket),
        };
      }
      case "spec": {
        const change = this.safeReadSpec(target.ref);
        if (!change) {
          return {
            summary: `Spec ${target.ref} could not be loaded. Review the referenced contract artifact directly.`,
            contextRefs: mergeContextRefs({ specChangeIds: [target.ref] }),
          };
        }
        return {
          summary: [
            `${change.summary.id} [${change.summary.status}] ${change.summary.title}`,
            `Proposal: ${excerpt(change.state.proposalSummary)}`,
            `Requirements: ${change.state.requirements.length}`,
            `Capabilities: ${change.state.capabilities.length}`,
          ].join("\n"),
          contextRefs: deriveContextRefsFromSpec(change),
        };
      }
      case "initiative": {
        const initiative = this.safeReadInitiative(target.ref);
        if (!initiative) {
          return {
            summary: `Initiative ${target.ref} could not be loaded. Review the referenced strategic artifact directly.`,
            contextRefs: mergeContextRefs({ initiativeIds: [target.ref] }),
          };
        }
        return {
          summary: [
            `${initiative.summary.id} [${initiative.summary.status}] ${initiative.summary.title}`,
            `Objective: ${excerpt(initiative.state.objective)}`,
            `Status summary: ${excerpt(initiative.state.statusSummary)}`,
            `Milestones: ${initiative.state.milestones.length}`,
            `Risks: ${initiative.state.risks.join("; ") || "none"}`,
          ].join("\n"),
          contextRefs: deriveContextRefsFromInitiative(initiative),
        };
      }
      case "research": {
        const research = this.safeReadResearch(target.ref);
        if (!research) {
          return {
            summary: `Research ${target.ref} could not be loaded. Review the referenced evidence artifact directly.`,
            contextRefs: mergeContextRefs({ researchIds: [target.ref] }),
          };
        }
        return {
          summary: [
            `${research.summary.id} [${research.summary.status}] ${research.summary.title}`,
            `Question: ${excerpt(research.state.question)}`,
            `Objective: ${excerpt(research.state.objective)}`,
            `Conclusions: ${research.state.conclusions.join("; ") || "none"}`,
            `Open questions: ${research.state.openQuestions.join("; ") || "none"}`,
          ].join("\n"),
          contextRefs: deriveContextRefsFromResearch(research),
        };
      }
      case "constitution": {
        const constitution = this.readConstitutionIfPresent();
        if (!constitution) {
          return {
            summary: "Constitutional memory is not initialized. Review must rely on direct artifact references.",
            contextRefs: normalizeContextRefs({}),
          };
        }
        return {
          summary: [
            `${constitution.state.projectId} ${constitution.state.title}`,
            `Strategic direction: ${excerpt(constitution.state.strategicDirectionSummary)}`,
            `Current focus: ${constitution.state.currentFocus.join("; ") || "none"}`,
            `Open questions: ${constitution.state.openConstitutionQuestions.join("; ") || "none"}`,
          ].join("\n"),
          contextRefs: deriveContextRefsFromConstitution(constitution),
        };
      }
      case "artifact":
        return {
          summary: `Artifact review target: ${target.ref}${target.locator ? ` at ${target.locator}` : ""}`,
          contextRefs: normalizeContextRefs({}),
        };
      case "workspace":
        return {
          summary: `Workspace review target: ${target.ref}${target.locator ? ` at ${target.locator}` : ""}`,
          contextRefs: normalizeContextRefs({}),
        };
    }
  }

  private async resolveTargetSummaryCanonical(
    target: CritiqueTargetRef,
  ): Promise<{ summary: string; contextRefs: CritiqueContextRefs }> {
    switch (target.kind) {
      case "artifact":
      case "workspace":
        return this.resolveTargetSummary(target);
      case "ticket": {
        const ticket = await this.safeReadTicketAsync(target.ref);
        if (!ticket) {
          return {
            summary: `Ticket ${target.ref} could not be loaded. Review the referenced execution artifact directly.`,
            contextRefs: mergeContextRefs({ ticketIds: [target.ref] }),
          };
        }
        return {
          summary: [
            `${ticket.summary.id} [${ticket.summary.status}] ${ticket.summary.title}`,
            `Summary: ${excerpt(ticket.ticket.body.summary)}`,
            `Plan: ${excerpt(ticket.ticket.body.plan)}`,
            `Verification: ${excerpt(ticket.ticket.body.verification)}`,
            `Blockers: ${ticket.blockers.join(", ") || "none"}`,
          ].join("\n"),
          contextRefs: deriveContextRefsFromTicket(ticket),
        };
      }
      case "spec": {
        const change = await this.safeReadSpecAsync(target.ref);
        if (!change) {
          return {
            summary: `Spec ${target.ref} could not be loaded. Review the referenced contract artifact directly.`,
            contextRefs: mergeContextRefs({ specChangeIds: [target.ref] }),
          };
        }
        return {
          summary: [
            `${change.summary.id} [${change.summary.status}] ${change.summary.title}`,
            `Proposal: ${excerpt(change.state.proposalSummary)}`,
            `Requirements: ${change.state.requirements.length}`,
            `Capabilities: ${change.state.capabilities.length}`,
          ].join("\n"),
          contextRefs: deriveContextRefsFromSpec(change),
        };
      }
      case "initiative": {
        const initiative = await this.safeReadInitiativeAsync(target.ref);
        if (!initiative) {
          return {
            summary: `Initiative ${target.ref} could not be loaded. Review the referenced strategic artifact directly.`,
            contextRefs: mergeContextRefs({ initiativeIds: [target.ref] }),
          };
        }
        return {
          summary: [
            `${initiative.summary.id} [${initiative.summary.status}] ${initiative.summary.title}`,
            `Objective: ${excerpt(initiative.state.objective)}`,
            `Status summary: ${excerpt(initiative.state.statusSummary)}`,
            `Milestones: ${initiative.state.milestones.length}`,
            `Risks: ${initiative.state.risks.join("; ") || "none"}`,
          ].join("\n"),
          contextRefs: deriveContextRefsFromInitiative(initiative),
        };
      }
      case "research": {
        const research = await this.safeReadResearchAsync(target.ref);
        if (!research) {
          return {
            summary: `Research ${target.ref} could not be loaded. Review the referenced evidence artifact directly.`,
            contextRefs: mergeContextRefs({ researchIds: [target.ref] }),
          };
        }
        return {
          summary: [
            `${research.summary.id} [${research.summary.status}] ${research.summary.title}`,
            `Question: ${excerpt(research.state.question)}`,
            `Objective: ${excerpt(research.state.objective)}`,
            `Conclusions: ${research.state.conclusions.join("; ") || "none"}`,
            `Open questions: ${research.state.openQuestions.join("; ") || "none"}`,
          ].join("\n"),
          contextRefs: deriveContextRefsFromResearch(research),
        };
      }
      case "constitution": {
        const constitution = await this.readConstitutionIfPresentAsync();
        if (!constitution) {
          return {
            summary: "Constitutional memory is not initialized. Review must rely on direct artifact references.",
            contextRefs: normalizeContextRefs({}),
          };
        }
        return {
          summary: [
            `${constitution.state.projectId} ${constitution.state.title}`,
            `Strategic direction: ${excerpt(constitution.state.strategicDirectionSummary)}`,
            `Current focus: ${constitution.state.currentFocus.join("; ") || "none"}`,
            `Open questions: ${constitution.state.openConstitutionQuestions.join("; ") || "none"}`,
          ].join("\n"),
          contextRefs: deriveContextRefsFromConstitution(constitution),
        };
      }
    }
  }

  private resolvePacketContext(state: CritiqueState): ResolvedCritiqueContext {
    const target = this.resolveTargetSummary(state.target);
    const contextRefs = mergeContextRefs(state.contextRefs, target.contextRefs);
    const constitution = this.readConstitutionIfPresent();
    const roadmapItems = constitution
      ? contextRefs.roadmapItemIds
          .map((itemId) => constitution.state.roadmapItems.find((item) => item.id === itemId) ?? null)
          .filter((item): item is NonNullable<typeof item> => item !== null)
          .map((item) => `${item.id} [${item.status}/${item.horizon}] ${item.title} — ${excerpt(item.summary)}`)
      : [];
    const initiatives = contextRefs.initiativeIds
      .map((initiativeId) => this.safeReadInitiative(initiativeId))
      .filter((initiative): initiative is InitiativeRecord => initiative !== null)
      .map(
        (initiative) =>
          `${initiative.state.initiativeId} [${initiative.state.status}] ${initiative.state.title} — ${excerpt(initiative.state.objective)}`,
      );
    const research = contextRefs.researchIds
      .map((researchId) => this.safeReadResearch(researchId))
      .filter((record): record is ResearchRecord => record !== null)
      .map(
        (record) =>
          `${record.state.researchId} [${record.state.status}] ${record.state.title} — conclusions: ${record.state.conclusions.join("; ") || "none"}`,
      );
    const specs = contextRefs.specChangeIds
      .map((changeId) => this.safeReadSpec(changeId))
      .filter((record): record is SpecChangeRecord => record !== null)
      .map(
        (record) =>
          `${record.state.changeId} [${record.state.status}] ${record.state.title} — reqs=${record.state.requirements.length} caps=${record.state.capabilities.length}`,
      );
    const tickets = contextRefs.ticketIds
      .map((ticketId) => this.safeReadTicket(ticketId))
      .filter((record): record is TicketReadResult => record !== null)
      .map(
        (record) =>
          `${record.summary.id} [${record.summary.status}] ${record.summary.title} — ${excerpt(record.ticket.body.summary)}`,
      );

    const packetSummary = [
      `${state.target.kind}:${state.target.ref}`,
      `${state.focusAreas.length} focus area(s)`,
      `${roadmapItems.length} roadmap`,
      `${initiatives.length} initiative`,
      `${research.length} research`,
      `${specs.length} spec`,
      `${tickets.length} ticket`,
    ].join("; ");

    return {
      targetSummary: target.summary,
      contextRefs,
      constitution,
      roadmapItems,
      initiatives,
      research,
      specs,
      tickets,
      packetSummary,
    };
  }

  private async resolvePacketContextCanonical(state: CritiqueState): Promise<ResolvedCritiqueContext> {
    const target = await this.resolveTargetSummaryCanonical(state.target);
    const contextRefs = mergeContextRefs(state.contextRefs, target.contextRefs);
    const constitution = await this.readConstitutionIfPresentAsync();
    const roadmapItems = constitution
      ? (
          await Promise.all(
            contextRefs.roadmapItemIds.map(async (itemId) => {
              try {
                return await createConstitutionalStore(this.cwd).readRoadmapItem(itemId);
              } catch {
                return null;
              }
            }),
          )
        )
          .filter((item): item is NonNullable<typeof item> => item !== null)
          .map((item) => `${item.id} [${item.status}/${item.horizon}] ${item.title} — ${excerpt(item.summary)}`)
      : [];
    const initiatives = (
      await Promise.all(contextRefs.initiativeIds.map((initiativeId) => this.safeReadInitiativeAsync(initiativeId)))
    )
      .filter((initiative): initiative is InitiativeRecord => initiative !== null)
      .map(
        (initiative) =>
          `${initiative.state.initiativeId} [${initiative.state.status}] ${initiative.state.title} — ${excerpt(initiative.state.objective)}`,
      );
    const research = (
      await Promise.all(contextRefs.researchIds.map((researchId) => this.safeReadResearchAsync(researchId)))
    )
      .filter((record): record is ResearchRecord => record !== null)
      .map(
        (record) =>
          `${record.state.researchId} [${record.state.status}] ${record.state.title} — conclusions: ${record.state.conclusions.join("; ") || "none"}`,
      );
    const specs = (await Promise.all(contextRefs.specChangeIds.map((changeId) => this.safeReadSpecAsync(changeId))))
      .filter((record): record is SpecChangeRecord => record !== null)
      .map(
        (record) =>
          `${record.state.changeId} [${record.state.status}] ${record.state.title} — reqs=${record.state.requirements.length} caps=${record.state.capabilities.length}`,
      );
    const tickets = (await Promise.all(contextRefs.ticketIds.map((ticketId) => this.safeReadTicketAsync(ticketId))))
      .filter((record): record is TicketReadResult => record !== null)
      .map(
        (record) =>
          `${record.summary.id} [${record.summary.status}] ${record.summary.title} — ${excerpt(record.ticket.body.summary)}`,
      );

    const packetSummary = [
      `${state.target.kind}:${state.target.ref}`,
      `${state.focusAreas.length} focus area(s)`,
      `${roadmapItems.length} roadmap`,
      `${initiatives.length} initiative`,
      `${research.length} research`,
      `${specs.length} spec`,
      `${tickets.length} ticket`,
    ].join("; ");

    return {
      targetSummary: target.summary,
      contextRefs,
      constitution,
      roadmapItems,
      initiatives,
      research,
      specs,
      tickets,
      packetSummary,
    };
  }

  private buildPacket(state: CritiqueState, runs: CritiqueRunRecord[], findings: CritiqueFindingRecord[]): string {
    const context = this.resolvePacketContext(state);
    const constitutionSummary = context.constitution
      ? [
          `Project: ${context.constitution.state.title}`,
          `Strategic direction: ${excerpt(context.constitution.state.strategicDirectionSummary)}`,
          `Current focus: ${context.constitution.state.currentFocus.join("; ") || "none"}`,
          `Open constitutional questions: ${context.constitution.state.openConstitutionQuestions.join("; ") || "none"}`,
        ].join("\n")
      : "(none)";
    const openFindings = findings.filter((finding) => isActiveFindingStatus(finding.status));

    return serializeMarkdownArtifact(
      {
        id: state.critiqueId,
        title: state.title,
        status: state.status,
        verdict: state.currentVerdict,
        target: `${state.target.kind}:${state.target.ref}`,
        focus: state.focusAreas,
        "created-at": state.createdAt,
        "updated-at": state.updatedAt,
        "fresh-context-required": state.freshContextRequired ? "true" : "false",
        scope: state.scopeRefs,
      },
      [
        renderSection("Review Target", context.targetSummary),
        renderSection("Review Question", state.reviewQuestion || "(empty)"),
        renderSection("Focus Areas", state.focusAreas.join(", ") || "none"),
        renderSection("Scope Refs", renderBulletList(state.scopeRefs)),
        renderSection("Non-Goals", renderBulletList(state.nonGoals)),
        renderSection(
          "Fresh Context Protocol",
          renderBulletList([
            "Start from a fresh reviewer context instead of inheriting the executor session.",
            `Load ${toCritiquePacketRef(state.critiqueId)} before reasoning about the target.`,
            "Judge the work against its contract, linked context, and likely failure modes; do not trust plausible output.",
            "Persist the result with critique_run and critique_finding so findings survive the session.",
          ]),
        ),
        renderSection("Constitutional Context", constitutionSummary),
        renderSection("Roadmap Items", renderBulletList(context.roadmapItems)),
        renderSection("Initiatives", renderBulletList(context.initiatives)),
        renderSection("Research", renderBulletList(context.research)),
        renderSection("Specs", renderBulletList(context.specs)),
        renderSection("Tickets", renderBulletList(context.tickets)),
        renderSection("Existing Runs", renderBulletList(summarizeRuns(runs))),
        renderSection(
          "Existing Open Findings",
          renderBulletList(
            openFindings.map(
              (finding) =>
                `${finding.id} [${finding.kind}/${finding.severity}] ${finding.title} — ${excerpt(finding.summary)}`,
            ),
          ),
        ),
      ].join("\n\n"),
    );
  }

  private async buildPacketCanonical(
    state: CritiqueState,
    runs: CritiqueRunRecord[],
    findings: CritiqueFindingRecord[],
  ): Promise<string> {
    const context = await this.resolvePacketContextCanonical(state);
    const constitutionSummary = context.constitution
      ? [
          `Project: ${context.constitution.state.title}`,
          `Strategic direction: ${excerpt(context.constitution.state.strategicDirectionSummary)}`,
          `Current focus: ${context.constitution.state.currentFocus.join("; ") || "none"}`,
          `Open constitutional questions: ${context.constitution.state.openConstitutionQuestions.join("; ") || "none"}`,
        ].join("\n")
      : "(none)";
    const openFindings = findings.filter((finding) => isActiveFindingStatus(finding.status));

    return serializeMarkdownArtifact(
      {
        id: state.critiqueId,
        title: state.title,
        status: state.status,
        verdict: state.currentVerdict,
        target: `${state.target.kind}:${state.target.ref}`,
        focus: state.focusAreas,
        "created-at": state.createdAt,
        "updated-at": state.updatedAt,
        "fresh-context-required": state.freshContextRequired ? "true" : "false",
        scope: state.scopeRefs,
      },
      [
        renderSection("Review Target", context.targetSummary),
        renderSection("Review Question", state.reviewQuestion || "(empty)"),
        renderSection("Focus Areas", state.focusAreas.join(", ") || "none"),
        renderSection("Scope Refs", renderBulletList(state.scopeRefs)),
        renderSection("Non-Goals", renderBulletList(state.nonGoals)),
        renderSection(
          "Fresh Context Protocol",
          renderBulletList([
            "Start from a fresh reviewer context instead of inheriting the executor session.",
            `Load ${toCritiquePacketRef(state.critiqueId)} before reasoning about the target.`,
            "Judge the work against its contract, linked context, and likely failure modes; do not trust plausible output.",
            "Persist the result with critique_run and critique_finding so findings survive the session.",
          ]),
        ),
        renderSection("Constitutional Context", constitutionSummary),
        renderSection("Roadmap Items", renderBulletList(context.roadmapItems)),
        renderSection("Initiatives", renderBulletList(context.initiatives)),
        renderSection("Research", renderBulletList(context.research)),
        renderSection("Specs", renderBulletList(context.specs)),
        renderSection("Tickets", renderBulletList(context.tickets)),
        renderSection("Existing Runs", renderBulletList(summarizeRuns(runs))),
        renderSection(
          "Existing Open Findings",
          renderBulletList(
            openFindings.map(
              (finding) =>
                `${finding.id} [${finding.kind}/${finding.severity}] ${finding.title} — ${excerpt(finding.summary)}`,
            ),
          ),
        ),
      ].join("\n\n"),
    );
  }

  private deriveState(
    state: CritiqueState,
    runs: CritiqueRunRecord[],
    findings: CritiqueFindingRecord[],
  ): CritiqueState {
    const context = this.resolvePacketContext(state);
    const activeFindingIds = findings
      .filter((finding) => isActiveFindingStatus(finding.status))
      .map((finding) => finding.id);
    const followupTicketIds = normalizeStringList([
      ...state.followupTicketIds,
      ...findings.map((finding) => finding.linkedTicketId ?? "").filter(Boolean),
    ]);
    const latestRunVerdict = runs.at(-1)?.verdict ?? state.currentVerdict;
    const currentVerdict =
      activeFindingIds.length === 0
        ? state.status === "resolved" || state.currentVerdict === "pass"
          ? "pass"
          : latestRunVerdict
        : latestRunVerdict === "pass"
          ? "concerns"
          : latestRunVerdict;
    return {
      ...state,
      packetSummary: context.packetSummary,
      currentVerdict,
      openFindingIds: activeFindingIds,
      followupTicketIds,
      lastRunId: runs.at(-1)?.id ?? state.lastRunId,
    };
  }

  private async deriveStateCanonical(
    state: CritiqueState,
    runs: CritiqueRunRecord[],
    findings: CritiqueFindingRecord[],
  ): Promise<CritiqueState> {
    const context = await this.resolvePacketContextCanonical(state);
    const activeFindingIds = findings
      .filter((finding) => isActiveFindingStatus(finding.status))
      .map((finding) => finding.id);
    const followupTicketIds = normalizeStringList([
      ...state.followupTicketIds,
      ...findings.map((finding) => finding.linkedTicketId ?? "").filter(Boolean),
    ]);
    const latestRunVerdict = runs.at(-1)?.verdict ?? state.currentVerdict;
    const currentVerdict =
      activeFindingIds.length === 0
        ? state.status === "resolved" || state.currentVerdict === "pass"
          ? "pass"
          : latestRunVerdict
        : latestRunVerdict === "pass"
          ? "concerns"
          : latestRunVerdict;
    return {
      ...state,
      packetSummary: context.packetSummary,
      currentVerdict,
      openFindingIds: activeFindingIds,
      followupTicketIds,
      lastRunId: runs.at(-1)?.id ?? state.lastRunId,
    };
  }

  private async buildCanonicalRecord(snapshot: CritiqueSnapshot): Promise<CritiqueReadResult> {
    const nextState = await this.deriveStateCanonical(
      materializeState(snapshot.state),
      snapshot.runs,
      snapshot.findings,
    );
    const packet = await this.buildPacketCanonical(nextState, snapshot.runs, snapshot.findings);
    const critique = renderCritiqueMarkdown(nextState, snapshot.runs, snapshot.findings);
    const launch = snapshot.launch ?? buildLaunchDescriptor(nextState);
    const dashboard = buildCritiqueDashboard(nextState, snapshot.runs, snapshot.findings, launch);

    return {
      state: nextState,
      summary: summarizeCritique(nextState),
      packet,
      critique,
      runs: snapshot.runs,
      findings: snapshot.findings,
      dashboard,
      launch,
    };
  }

  private writeArtifacts(
    state: CritiqueState,
    runs: CritiqueRunRecord[],
    findings: CritiqueFindingRecord[],
    launchOverride?: CritiqueLaunchDescriptor | null,
    persist = true,
  ): CritiqueReadResult {
    const critiqueId = state.critiqueId;
    const nextState = this.deriveState(state, runs, findings);
    const launch = launchOverride ?? buildLaunchDescriptor(nextState);
    const packet = this.buildPacket(nextState, runs, findings);
    const critique = renderCritiqueMarkdown(nextState, runs, findings);
    const dashboard = buildCritiqueDashboard(nextState, runs, findings, launch);

    const record: CritiqueReadResult = {
      state: nextState,
      summary: summarizeCritique(nextState),
      packet,
      critique,
      runs,
      findings,
      dashboard,
      launch,
    };
    if (persist) {
      const { storage, identity } = openCritiqueCatalogSync(this.cwd);
      const existing = findStoredCritiqueRow(this.cwd, critiqueId);
      void storage.upsertEntity({
        id:
          existing?.id ??
          createEntityId(ENTITY_KIND, identity.space.id, record.summary.id, `${ENTITY_KIND}:${record.summary.id}`),
        kind: ENTITY_KIND,
        spaceId: identity.space.id,
        owningRepositoryId: identity.repository.id,
        displayId: record.summary.id,
        title: record.summary.title,
        summary: record.state.reviewQuestion,
        status: record.summary.status,
        version: (existing?.version ?? 0) + 1,
        tags: record.summary.focusAreas,
        attributes: { record: { state: toCanonicalState(record.state), runs: record.runs } },
        createdAt: existing?.created_at ?? record.state.createdAt,
        updatedAt: record.state.updatedAt,
      });
      void this.syncFindingArtifactsAsync(
        storage,
        identity.space.id,
        identity.repository.id,
        existing?.id ??
          createEntityId(ENTITY_KIND, identity.space.id, record.summary.id, `${ENTITY_KIND}:${record.summary.id}`),
        record,
      ).catch(() => undefined);
      void syncProjectedEntityLinks({
        storage,
        spaceId: identity.space.id,
        fromEntityId:
          existing?.id ??
          createEntityId(ENTITY_KIND, identity.space.id, record.summary.id, `${ENTITY_KIND}:${record.summary.id}`),
        projectionOwner: CRITIQUE_LINK_PROJECTION_OWNER,
        // Context roadmap refs resolve to embedded constitution items, so phase 1 projects only canonical entity relationships.
        desired: buildProjectedCritiqueLinks(record.state),
        timestamp: record.state.updatedAt,
      }).catch(() => undefined);
    }
    return record;
  }
  private createDefaultState(input: CreateCritiqueInput, critiqueId: string, timestamp: string): CritiqueState {
    return {
      critiqueId,
      title: input.title.trim(),
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
      target: {
        kind: normalizeTargetKind(input.target.kind),
        ref: input.target.ref.trim(),
        locator: normalizeOptionalString(input.target.locator),
      },
      focusAreas: normalizeFocusAreas(input.focusAreas ?? ["correctness", "edge_cases"]),
      reviewQuestion:
        input.reviewQuestion?.trim() ||
        `What is wrong, incomplete, unsafe, or misaligned about ${input.target.kind}:${input.target.ref}?`,
      scopeRefs: normalizeStringList(input.scopeRefs),
      nonGoals: normalizeStringList(input.nonGoals),
      contextRefs: normalizeContextRefs(input.contextRefs),
      packetSummary: "",
      currentVerdict: "concerns",
      openFindingIds: [],
      followupTicketIds: [],
      freshContextRequired: input.freshContextRequired !== false,
      lastRunId: null,
      lastLaunchAt: null,
      launchCount: 0,
    };
  }

  listCritiques(filter: CritiqueListFilter = {}): CritiqueSummary[] {
    this.initLedger();
    return filterAndSortCritiqueSummaries(
      listStoredCritiqueRows(this.cwd).map((row) => this.readCritique(row.display_id ?? row.id)),
      filter,
    );
  }

  readCritique(ref: string): CritiqueReadResult {
    this.initLedger();
    const critiqueDir = this.resolveCritiqueDirectory(ref);
    const snapshot = this.readStoredSnapshot(critiqueDir);
    const nextState = this.deriveState(materializeState(snapshot.state), snapshot.runs, snapshot.findings);
    const launch = buildLaunchDescriptor(nextState);
    return {
      state: nextState,
      summary: summarizeCritique(nextState),
      packet: this.buildPacket(nextState, snapshot.runs, snapshot.findings),
      critique: renderCritiqueMarkdown(nextState, snapshot.runs, snapshot.findings),
      runs: snapshot.runs,
      findings: snapshot.findings,
      dashboard: buildCritiqueDashboard(nextState, snapshot.runs, snapshot.findings, launch),
      launch,
    };
  }

  private createCritique(input: CreateCritiqueInput, persist = true): CritiqueReadResult {
    this.initLedger();
    const timestamp = currentTimestamp();
    const critiqueId = this.nextCritiqueId(input.title);
    const state = this.createDefaultState(input, critiqueId, timestamp);
    return this.writeArtifacts(state, [], [], undefined, persist);
  }

  private updateCritique(ref: string, input: UpdateCritiqueInput, persist = true): CritiqueReadResult {
    const critique = this.readCritique(ref);
    const state = critique.state;
    const nextState: CritiqueState = {
      ...state,
      title: input.title?.trim() ?? state.title,
      status: input.status ? normalizeStatus(input.status) : state.status,
      target: input.target
        ? {
            kind: normalizeTargetKind(input.target.kind),
            ref: input.target.ref.trim(),
            locator: normalizeOptionalString(input.target.locator),
          }
        : state.target,
      focusAreas: input.focusAreas ? normalizeFocusAreas(input.focusAreas) : state.focusAreas,
      reviewQuestion: input.reviewQuestion?.trim() ?? state.reviewQuestion,
      scopeRefs: input.scopeRefs ? normalizeStringList(input.scopeRefs) : state.scopeRefs,
      nonGoals: input.nonGoals ? normalizeStringList(input.nonGoals) : state.nonGoals,
      contextRefs: input.contextRefs ? mergeContextRefs(state.contextRefs, input.contextRefs) : state.contextRefs,
      freshContextRequired:
        input.freshContextRequired !== undefined ? input.freshContextRequired : state.freshContextRequired,
      currentVerdict: input.verdict ? normalizeVerdict(input.verdict) : state.currentVerdict,
      updatedAt: currentTimestamp(),
    };
    return this.writeArtifacts(nextState, critique.runs, critique.findings, undefined, persist);
  }

  private launchCritique(
    ref: string,
    persist = true,
  ): { critique: CritiqueReadResult; launch: CritiqueLaunchDescriptor; text: string } {
    const critique = this.readCritique(ref);
    const timestamp = currentTimestamp();
    // The package owns durable launch metadata; the actual fresh-session runtime adapter
    // lives above this layer. Interactive adapters can use ctx.newSession()/switchSession(),
    // while external adapters can spawn `pi --mode json -p --no-session` consistently.
    const launch: CritiqueLaunchDescriptor = {
      ...(buildLaunchDescriptor({
        ...critique.state,
        lastLaunchAt: timestamp,
      }) as CritiqueLaunchDescriptor),
      createdAt: timestamp,
    };
    const refreshed = this.updateCritique(
      ref,
      {
        status: critique.state.status === "proposed" ? "active" : critique.state.status,
      },
      persist,
    );
    const nextState: CritiqueState = {
      ...refreshed.state,
      lastLaunchAt: timestamp,
      launchCount: refreshed.state.launchCount + 1,
      updatedAt: timestamp,
    };
    const materialized = this.writeArtifacts(nextState, refreshed.runs, refreshed.findings, launch, persist);
    return {
      critique: materialized,
      launch,
      text: renderLaunchDescriptor(this.cwd, launch),
    };
  }

  private recordRun(ref: string, input: CreateCritiqueRunInput, persist = true): CritiqueReadResult {
    const critique = this.readCritique(ref);
    const state = critique.state;
    const runs = critique.runs;
    const findings = critique.findings;
    const run: CritiqueRunRecord = {
      id: nextSequenceId(
        runs.map((entry) => entry.id),
        "run",
      ),
      critiqueId: state.critiqueId,
      createdAt: currentTimestamp(),
      kind: normalizeRunKind(input.kind),
      summary: input.summary.trim(),
      verdict: normalizeVerdict(input.verdict),
      freshContext: input.freshContext ?? state.freshContextRequired,
      focusAreas: normalizeFocusAreas(input.focusAreas ?? state.focusAreas),
      findingIds: normalizeStringList(input.findingIds),
      followupTicketIds: normalizeStringList(input.followupTicketIds),
    };
    return this.writeArtifacts(
      {
        ...state,
        status: "active",
        currentVerdict: run.verdict,
        updatedAt: run.createdAt,
        lastRunId: run.id,
      },
      [...runs, run],
      findings,
      undefined,
      persist,
    );
  }

  private addFinding(ref: string, input: CreateCritiqueFindingInput, persist = true): CritiqueReadResult {
    const critique = this.readCritique(ref);
    const state = critique.state;
    const runs = critique.runs;
    if (!runs.some((run) => run.id === input.runId)) {
      throw new Error(`Unknown critique run: ${input.runId}`);
    }
    const findings = critique.findings;
    const timestamp = currentTimestamp();
    const finding: CritiqueFindingRecord = {
      id: nextSequenceId(
        findings.map((entry) => entry.id),
        "finding",
      ),
      critiqueId: state.critiqueId,
      runId: input.runId.trim(),
      createdAt: timestamp,
      updatedAt: timestamp,
      kind: normalizeFindingKind(input.kind),
      severity: normalizeFindingSeverity(input.severity),
      confidence: normalizeFindingConfidence(input.confidence),
      title: input.title.trim(),
      summary: input.summary.trim(),
      evidence: normalizeStringList(input.evidence),
      scopeRefs: normalizeStringList(input.scopeRefs ?? state.scopeRefs),
      recommendedAction: input.recommendedAction.trim(),
      status: normalizeFindingStatus(input.status),
      linkedTicketId: null,
      resolutionNotes: null,
    };
    return this.writeArtifacts(
      {
        ...state,
        updatedAt: timestamp,
      },
      runs,
      [...findings, finding],
      undefined,
      persist,
    );
  }

  private updateFinding(ref: string, input: UpdateCritiqueFindingInput, persist = true): CritiqueReadResult {
    const critique = this.readCritique(ref);
    const state = critique.state;
    const runs = critique.runs;
    const findings = critique.findings;
    const current = findings.find((finding) => finding.id === input.id);
    if (!current) {
      throw new Error(`Unknown critique finding: ${input.id}`);
    }
    const updated: CritiqueFindingRecord = {
      ...current,
      updatedAt: currentTimestamp(),
      status: input.status ? normalizeFindingStatus(input.status) : current.status,
      linkedTicketId:
        input.linkedTicketId !== undefined ? normalizeOptionalString(input.linkedTicketId) : current.linkedTicketId,
      resolutionNotes:
        input.resolutionNotes !== undefined ? normalizeOptionalString(input.resolutionNotes) : current.resolutionNotes,
    };
    return this.writeArtifacts(
      {
        ...state,
        updatedAt: updated.updatedAt,
      },
      runs,
      findings.map((finding) => (finding.id === updated.id ? updated : finding)),
      undefined,
      persist,
    );
  }

  private resolveCritique(ref: string, verdict?: CritiqueState["currentVerdict"], persist = true): CritiqueReadResult {
    const critique = this.readCritique(ref);
    if (critique.state.openFindingIds.length > 0) {
      throw new Error(
        `Cannot resolve critique with active findings: ${critique.state.openFindingIds.join(", ")}. Accepted findings remain active until they are fixed, rejected, or superseded.`,
      );
    }
    const nextVerdict = verdict ? normalizeVerdict(verdict) : "pass";
    return this.writeArtifacts(
      {
        ...critique.state,
        status: "resolved",
        currentVerdict: nextVerdict,
        updatedAt: currentTimestamp(),
      },
      critique.runs,
      critique.findings,
      undefined,
      persist,
    );
  }

  private async syncFindingArtifactsAsync(
    storage: Awaited<ReturnType<typeof openWorkspaceStorage>>["storage"],
    spaceId: string,
    owningRepositoryId: string,
    critiqueEntityId: string,
    record: CritiqueReadResult,
  ): Promise<void> {
    await syncProjectedArtifacts({
      storage,
      spaceId,
      owningRepositoryId,
      owner: {
        entityId: critiqueEntityId,
        kind: ENTITY_KIND,
        displayId: record.summary.id,
      },
      projectionOwner: CRITIQUE_FINDING_PROJECTION_OWNER,
      timestamp: record.state.updatedAt,
      desired: record.findings.map((finding) => ({
        artifactType: CRITIQUE_FINDING_ARTIFACT_TYPE,
        displayId: critiqueFindingArtifactDisplayId(record.summary.id, finding.id),
        title: finding.title,
        summary: finding.summary,
        status: finding.status,
        tags: [finding.kind, finding.severity, finding.status],
        payload: { ...finding },
        links: finding.linkedTicketId
          ? [
              {
                kind: "references",
                targetKind: "ticket",
                targetDisplayId: finding.linkedTicketId,
              },
            ]
          : [],
      })),
    });
  }

  private async readProjectedFindingsAsync(
    storage: Awaited<ReturnType<typeof openWorkspaceStorage>>["storage"],
    spaceId: string,
    critiqueEntityId: string,
  ): Promise<CritiqueFindingRecord[]> {
    return (await storage.listEntities(spaceId, "artifact"))
      .filter((entity) => hasProjectedArtifactAttributes(entity.attributes))
      .filter(
        (entity) =>
          entity.attributes.projectionOwner === CRITIQUE_FINDING_PROJECTION_OWNER &&
          entity.attributes.artifactType === CRITIQUE_FINDING_ARTIFACT_TYPE &&
          (entity.attributes.owner as { entityId: string }).entityId === critiqueEntityId,
      )
      .map((entity) => normalizeFindingRecord(entity.attributes.payload as unknown as CritiqueFindingArtifactPayload))
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  private async upsertCanonicalRecord(
    record: CritiqueReadResult,
    mutationEvents: Array<Record<string, unknown>> = [],
  ): Promise<CritiqueReadResult> {
    const canonicalRecord = await this.buildCanonicalRecord({
      state: toCanonicalState(record.state),
      runs: record.runs,
      findings: record.findings,
      launch: record.launch,
    });
    const { storage, identity } = await openRepositoryWorkspaceStorage(this.cwd);
    const { entity } = await upsertEntityByDisplayIdWithLifecycleEvents(
      storage,
      {
        kind: ENTITY_KIND,
        spaceId: identity.space.id,
        owningRepositoryId: identity.repository.id,
        displayId: canonicalRecord.summary.id,
        title: canonicalRecord.summary.title,
        summary:
          canonicalRecord.state.reviewQuestion || canonicalRecord.state.packetSummary || canonicalRecord.summary.title,
        status: canonicalRecord.summary.status,
        version:
          ((await findEntityByDisplayId(storage, identity.space.id, ENTITY_KIND, canonicalRecord.summary.id))
            ?.version ?? 0) + 1,
        tags: canonicalRecord.summary.focusAreas,
        attributes: { record: { state: toCanonicalState(canonicalRecord.state), runs: canonicalRecord.runs } },
        createdAt: canonicalRecord.state.createdAt,
        updatedAt: canonicalRecord.state.updatedAt,
      },
      {
        actor: CRITIQUE_LINK_PROJECTION_OWNER,
        createdPayload: { change: "critique_entity_created", critiqueId: canonicalRecord.summary.id },
        updatedPayload: { change: "critique_entity_updated", critiqueId: canonicalRecord.summary.id },
      },
    );
    await this.syncFindingArtifactsAsync(
      storage,
      identity.space.id,
      identity.repository.id,
      entity.id,
      canonicalRecord,
    );
    await syncProjectedEntityLinks({
      storage,
      spaceId: identity.space.id,
      fromEntityId: entity.id,
      projectionOwner: CRITIQUE_LINK_PROJECTION_OWNER,
      // Context roadmap refs resolve to embedded constitution items, so phase 1 projects only canonical entity relationships.
      desired: buildProjectedCritiqueLinks(canonicalRecord.state),
      timestamp: canonicalRecord.state.updatedAt,
    });
    for (const payload of mutationEvents) {
      await appendEntityEvent(
        storage,
        entity.id,
        "updated",
        CRITIQUE_LINK_PROJECTION_OWNER,
        payload,
        canonicalRecord.state.updatedAt,
      );
    }
    return canonicalRecord;
  }

  private async entityRecord(
    entity: LoomEntityRecord,
    storage?: Awaited<ReturnType<typeof openWorkspaceStorage>>["storage"],
  ): Promise<CritiqueReadResult> {
    if (!hasStructuredCritiqueAttributes(entity.attributes)) {
      const critiqueId = entity.displayId ?? entity.id;
      throw new Error(`Critique ${critiqueId} is missing structured attributes`);
    }
    const canonicalStorage = storage ?? (await openWorkspaceStorage(this.cwd)).storage;
    return this.buildCanonicalRecord({
      state: entity.attributes.record.state,
      runs: entity.attributes.record.runs,
      findings: await this.readProjectedFindingsAsync(canonicalStorage, entity.spaceId, entity.id),
    });
  }

  async initLedgerAsync(): Promise<{ initialized: true; root: string }> {
    return this.initLedger();
  }

  async listCritiquesAsync(filter: CritiqueListFilter = {}): Promise<CritiqueSummary[]> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const records = await Promise.all(
      (await storage.listEntities(identity.space.id, ENTITY_KIND)).map((entity) => this.entityRecord(entity, storage)),
    );
    return filterAndSortCritiqueSummaries(records, filter);
  }

  async readCritiqueAsync(ref: string): Promise<CritiqueReadResult> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const critiqueId = normalizeCritiqueRef(ref);
    const entity = await findEntityByDisplayId(storage, identity.space.id, ENTITY_KIND, critiqueId);
    if (!entity) {
      throw new Error(`Unknown critique: ${critiqueId}`);
    }
    return this.entityRecord(entity, storage);
  }

  async createCritiqueAsync(input: CreateCritiqueInput): Promise<CritiqueReadResult> {
    return this.upsertCanonicalRecord(this.createCritique(input, false));
  }

  async updateCritiqueAsync(ref: string, input: UpdateCritiqueInput): Promise<CritiqueReadResult> {
    return this.upsertCanonicalRecord(this.updateCritique(ref, input, false));
  }

  async launchCritiqueAsync(
    ref: string,
  ): Promise<{ critique: CritiqueReadResult; launch: CritiqueLaunchDescriptor; text: string }> {
    const launched = this.launchCritique(ref, false);
    return {
      ...launched,
      critique: await this.upsertCanonicalRecord(launched.critique, [
        {
          change: "critique_launch_prepared",
          critiqueId: launched.critique.state.critiqueId,
          launchRef: toCritiqueLaunchRef(launched.critique.state.critiqueId),
          packetRef: launched.launch.packetRef,
          freshContextRequired: launched.launch.freshContextRequired,
        },
      ]),
    };
  }

  async recordRunAsync(ref: string, input: CreateCritiqueRunInput): Promise<CritiqueReadResult> {
    const record = this.recordRun(ref, input, false);
    const run = record.runs.at(-1);
    return this.upsertCanonicalRecord(
      record,
      run
        ? [
            {
              change: "critique_run_recorded",
              critiqueId: record.state.critiqueId,
              runId: run.id,
              runKind: run.kind,
              verdict: run.verdict,
              findingIds: run.findingIds,
              followupTicketIds: run.followupTicketIds,
            },
          ]
        : [],
    );
  }

  async addFindingAsync(ref: string, input: CreateCritiqueFindingInput): Promise<CritiqueReadResult> {
    const record = this.addFinding(ref, input, false);
    const finding = record.findings.at(-1);
    return this.upsertCanonicalRecord(
      record,
      finding
        ? [
            {
              change: "critique_finding_created",
              critiqueId: record.state.critiqueId,
              findingId: finding.id,
              findingRef: critiqueFindingArtifactDisplayId(record.state.critiqueId, finding.id),
              runId: finding.runId,
              status: finding.status,
              severity: finding.severity,
              linkedTicketId: finding.linkedTicketId,
            },
          ]
        : [],
    );
  }

  async updateFindingAsync(ref: string, input: UpdateCritiqueFindingInput): Promise<CritiqueReadResult> {
    const previous = await this.readCritiqueAsync(ref);
    const record = this.updateFinding(ref, input, false);
    const finding = record.findings.find((entry) => entry.id === input.id);
    const before = previous.findings.find((entry) => entry.id === input.id);
    const events = finding
      ? [
          {
            change: "critique_finding_updated",
            critiqueId: record.state.critiqueId,
            findingId: finding.id,
            findingRef: critiqueFindingArtifactDisplayId(record.state.critiqueId, finding.id),
            previousStatus: before?.status ?? null,
            status: finding.status,
            linkedTicketId: finding.linkedTicketId,
          },
          ...(before && isActiveFindingStatus(before.status) && !isActiveFindingStatus(finding.status)
            ? [
                {
                  change: "critique_finding_resolved",
                  critiqueId: record.state.critiqueId,
                  findingId: finding.id,
                  findingRef: critiqueFindingArtifactDisplayId(record.state.critiqueId, finding.id),
                  previousStatus: before.status,
                  status: finding.status,
                  linkedTicketId: finding.linkedTicketId,
                },
              ]
            : []),
        ]
      : [];
    return this.upsertCanonicalRecord(record, events);
  }

  async ticketifyFindingAsync(ref: string, input: TicketifyCritiqueFindingInput): Promise<CritiqueReadResult> {
    const critique = await this.readCritiqueAsync(ref);
    const finding = critique.findings.find((entry) => entry.id === input.findingId);
    if (!finding) {
      throw new Error(`Unknown critique finding: ${input.findingId}`);
    }
    if (finding.linkedTicketId) {
      return this.upsertCanonicalRecord(critique);
    }

    const context = await this.resolvePacketContextCanonical(critique.state);
    const created = await createTicketStore(this.cwd).createTicketAsync({
      title: input.title?.trim() || finding.title,
      summary: finding.summary,
      context: [
        `Critique: ${critique.state.critiqueId}`,
        `Finding: ${finding.id}`,
        `Target: ${critique.state.target.kind}:${critique.state.target.ref}`,
        `Evidence: ${summarizeFindingEvidence(finding)}`,
      ].join("\n"),
      plan: finding.recommendedAction,
      priority: ticketPriorityForSeverity(finding.severity),
      type: ticketTypeForFinding(finding.kind),
      initiativeIds: context.contextRefs.initiativeIds,
      researchIds: context.contextRefs.researchIds,
      reviewStatus: "requested",
      externalRefs: [`critique:${critique.state.critiqueId}`, `finding:${finding.id}`],
      labels: ["critique", finding.kind],
    });

    const record = this.updateFinding(
      ref,
      {
        id: finding.id,
        linkedTicketId: created.summary.id,
        status: "accepted",
        resolutionNotes: `Follow-up ticket created: ${created.summary.id}`,
      },
      false,
    );

    return this.upsertCanonicalRecord(record, [
      {
        change: "critique_finding_updated",
        critiqueId: critique.state.critiqueId,
        findingId: finding.id,
        findingRef: critiqueFindingArtifactDisplayId(critique.state.critiqueId, finding.id),
        previousStatus: finding.status,
        status: "accepted",
        linkedTicketId: created.summary.id,
      },
    ]);
  }

  async resolveCritiqueAsync(ref: string, verdict?: CritiqueState["currentVerdict"]): Promise<CritiqueReadResult> {
    return this.upsertCanonicalRecord(this.resolveCritique(ref, verdict, false));
  }
}

export function createCritiqueStore(cwd: string): CritiqueStore {
  return new CritiqueStore(cwd);
}
