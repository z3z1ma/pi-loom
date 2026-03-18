import { relative, resolve } from "node:path";
import type { ConstitutionalRecord } from "@pi-loom/pi-constitution/extensions/domain/models.js";
import { createConstitutionalStore } from "@pi-loom/pi-constitution/extensions/domain/store.js";
import type { InitiativeRecord } from "@pi-loom/pi-initiatives/extensions/domain/models.js";
import { createInitiativeStore } from "@pi-loom/pi-initiatives/extensions/domain/store.js";
import type { ResearchRecord } from "@pi-loom/pi-research/extensions/domain/models.js";
import { createResearchStore } from "@pi-loom/pi-research/extensions/domain/store.js";
import type { SpecChangeRecord } from "@pi-loom/pi-specs/extensions/domain/models.js";
import type { LoomEntityRecord } from "@pi-loom/pi-storage/storage/contract.js";
import { createEntityId } from "@pi-loom/pi-storage/storage/ids.js";
import { resolveWorkspaceIdentity } from "@pi-loom/pi-storage/storage/repository.js";
import { SqliteLoomCatalog } from "@pi-loom/pi-storage/storage/sqlite.js";
import {
  findEntityByDisplayId,
  upsertEntityByDisplayId,
} from "@pi-loom/pi-storage/storage/entities.js";
import { openWorkspaceStorage } from "@pi-loom/pi-storage/storage/workspace.js";
import type { CreateTicketInput, TicketReadResult } from "@pi-loom/pi-ticketing/extensions/domain/models.js";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import { buildCritiqueDashboard, summarizeCritique } from "./dashboard.js";
import { renderBulletList, renderSection, serializeMarkdownArtifact } from "./frontmatter.js";
import type {
  CreateCritiqueFindingInput,
  CreateCritiqueInput,
  CreateCritiqueRunInput,
  CritiqueContextRefs,
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
import {
  getCritiqueDir,
  getCritiqueFindingsPath,
  getCritiqueLaunchPath,
  getCritiqueMarkdownPath,
  getCritiquePacketPath,
  getCritiquePaths,
  getCritiqueRunsPath,
  getCritiqueStatePath,
} from "./paths.js";
import { renderCritiqueMarkdown, renderLaunchDescriptor } from "./render.js";

const ENTITY_KIND = "critique" as const;

interface CritiqueEntityAttributes {
  record: CritiqueReadResult;
}

interface CritiqueSnapshot {
  state: CritiqueState;
  runs: CritiqueRunRecord[];
  findings: CritiqueFindingRecord[];
  launch: CritiqueLaunchDescriptor | null;
}

function hasStructuredCritiqueAttributes(attributes: unknown): attributes is CritiqueEntityAttributes {
  return Boolean(attributes && typeof attributes === "object" && "record" in attributes);
}

interface StoredCritiqueEntityRow {
  id: string;
  display_id: string | null;
  version: number;
  created_at: string;
  attributes_json: string;
}

function openCritiqueCatalogSync(cwd: string): { storage: SqliteLoomCatalog; identity: ReturnType<typeof resolveWorkspaceIdentity> } {
  const storage = new SqliteLoomCatalog();
  const identity = resolveWorkspaceIdentity(cwd);
  void storage.upsertSpace(identity.space);
  void storage.upsertRepository(identity.repository);
  void storage.upsertWorktree(identity.worktree);
  return { storage, identity };
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

function listStoredCritiqueRecords(cwd: string): CritiqueReadResult[] {
  const { storage, identity } = openCritiqueCatalogSync(cwd);
  const rows = storage.db
    .prepare("SELECT attributes_json FROM entities WHERE space_id = ? AND kind = ? ORDER BY display_id")
    .all(identity.space.id, ENTITY_KIND) as Array<{ attributes_json: string }>;
  return rows.map((row) => {
    const attributes = parseStoredJson<CritiqueEntityAttributes | Record<string, unknown>>(row.attributes_json, {});
    if (!hasStructuredCritiqueAttributes(attributes)) {
      throw new Error("Critique entity is missing structured attributes");
    }
    return attributes.record;
  });
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

function relativeToWorkspace(cwd: string, filePath: string): string {
  const relativePath = relative(cwd, filePath);
  return relativePath || ".";
}

function latestFindings(history: CritiqueFindingRecord[]): CritiqueFindingRecord[] {
  const latest = new Map<string, CritiqueFindingRecord>();
  for (const entry of history) {
    latest.set(entry.id, entry);
  }
  return [...latest.values()].sort((left, right) => left.id.localeCompare(right.id));
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
    specChangeIds: ticket.ticket.frontmatter["spec-change"] ? [ticket.ticket.frontmatter["spec-change"]] : [],
    ticketIds: [ticket.summary.id],
  });
}

function deriveContextRefsFromSpec(change: SpecChangeRecord): CritiqueContextRefs {
  return mergeContextRefs({
    initiativeIds: change.state.initiativeIds,
    researchIds: change.state.researchIds,
    specChangeIds: [change.state.changeId],
    ticketIds: change.linkedTickets?.links.map((ticket) => ticket.ticketId) ?? [],
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
    return { initialized: true, root: getCritiquePaths(this.cwd).critiquesDir };
  }

  private critiqueDirectories(): string[] {
    return listStoredCritiqueRecords(this.cwd).map((record) => getCritiqueDir(this.cwd, record.state.critiqueId));
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

  private readState(critiqueDir: string): CritiqueState {
    const critiqueId = normalizeCritiqueId(critiqueDir.split("/").at(-1) ?? critiqueDir);
    const row = findStoredCritiqueRow(this.cwd, critiqueId);
    if (!row) {
      throw new Error(`Unknown critique: ${critiqueId}`);
    }
    const attributes = parseStoredJson<CritiqueEntityAttributes | Record<string, unknown>>(row.attributes_json, {});
    if (!hasStructuredCritiqueAttributes(attributes)) {
      throw new Error(`Critique ${critiqueId} is missing structured attributes`);
    }
    const state = attributes.record.state;
    return {
      ...state,
      critiqueId: normalizeCritiqueId(state.critiqueId),
      title: state.title.trim(),
      status: normalizeStatus(state.status),
      target: {
        kind: normalizeTargetKind(state.target.kind),
        ref: state.target.ref.trim(),
        path: normalizeOptionalString(state.target.path),
      },
      focusAreas: normalizeFocusAreas(state.focusAreas),
      reviewQuestion: state.reviewQuestion ?? "",
      scopePaths: normalizeStringList(state.scopePaths),
      nonGoals: normalizeStringList(state.nonGoals),
      contextRefs: normalizeContextRefs(state.contextRefs),
      packetSummary: state.packetSummary ?? "",
      currentVerdict: normalizeVerdict(state.currentVerdict),
      openFindingIds: normalizeStringList(state.openFindingIds),
      followupTicketIds: normalizeStringList(state.followupTicketIds),
      freshContextRequired: state.freshContextRequired !== false,
      lastRunId: normalizeOptionalString(state.lastRunId),
      lastLaunchAt: normalizeOptionalString(state.lastLaunchAt),
      launchCount: Number.isFinite(state.launchCount) ? state.launchCount : 0,
    };
  }

  private readRuns(critiqueDir: string): CritiqueRunRecord[] {
    const critiqueId = normalizeCritiqueId(critiqueDir.split("/").at(-1) ?? critiqueDir);
    const row = findStoredCritiqueRow(this.cwd, critiqueId);
    if (!row) {
      throw new Error(`Unknown critique: ${critiqueId}`);
    }
    const attributes = parseStoredJson<CritiqueEntityAttributes | Record<string, unknown>>(row.attributes_json, {});
    if (!hasStructuredCritiqueAttributes(attributes)) {
      throw new Error(`Critique ${critiqueId} is missing structured attributes`);
    }
    return attributes.record.runs.map((run) => ({
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
    }));
  }

  private readFindingsHistory(critiqueDir: string): CritiqueFindingRecord[] {
    const critiqueId = normalizeCritiqueId(critiqueDir.split("/").at(-1) ?? critiqueDir);
    const row = findStoredCritiqueRow(this.cwd, critiqueId);
    if (!row) {
      throw new Error(`Unknown critique: ${critiqueId}`);
    }
    const attributes = parseStoredJson<CritiqueEntityAttributes | Record<string, unknown>>(row.attributes_json, {});
    if (!hasStructuredCritiqueAttributes(attributes)) {
      throw new Error(`Critique ${critiqueId} is missing structured attributes`);
    }
    return attributes.record.findings.map((finding) => ({
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
      scopePaths: normalizeStringList(finding.scopePaths),
      recommendedAction: finding.recommendedAction.trim(),
      status: normalizeFindingStatus(finding.status),
      linkedTicketId: normalizeOptionalString(finding.linkedTicketId),
      resolutionNotes: normalizeOptionalString(finding.resolutionNotes),
    }));
  }

  private readLaunch(critiqueDir: string): CritiqueLaunchDescriptor | null {
    const critiqueId = normalizeCritiqueId(critiqueDir.split("/").at(-1) ?? critiqueDir);
    const row = findStoredCritiqueRow(this.cwd, critiqueId);
    if (!row) {
      return null;
    }
    const attributes = parseStoredJson<CritiqueEntityAttributes | Record<string, unknown>>(row.attributes_json, {});
    return hasStructuredCritiqueAttributes(attributes) ? attributes.record.launch : null;
  }

  private writeState(critiqueId: string, state: CritiqueState): void {
    void critiqueId;
    void state;
  }

  private writeLaunch(critiqueId: string, launch: CritiqueLaunchDescriptor): void {
    void critiqueId;
    void launch;
  }

  private constitutionExists(): boolean {
    return this.readConstitutionIfPresent() !== null;
  }

  private readConstitutionIfPresent(): ConstitutionalRecord | null {
    const attributes = readStructuredEntityAttributesSync<{ state: ConstitutionalRecord["state"] }>(
      this.cwd,
      "constitution",
      resolveWorkspaceIdentity(this.cwd).repository.slug,
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
    const attributes = readStructuredEntityAttributesSync<{ state: InitiativeRecord["state"] }>(this.cwd, "initiative", id);
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
            path: `.loom/initiatives/${attributes.state.initiativeId}`,
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
            path: `.loom/research/${attributes.state.researchId}`,
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
        linkedTickets?: SpecChangeRecord["linkedTickets"];
      };
      return {
        state: attributes.state,
        decisions: attributes.decisions,
        analysis: attributes.analysis,
        checklist: attributes.checklist,
        linkedTickets: attributes.linkedTickets ?? null,
        summary: {
          id: entity.displayId,
          title: entity.title,
          status: entity.status as SpecChangeRecord["summary"]["status"],
          proposal: attributes.state.proposalSummary,
          updatedAt: entity.updatedAt,
          path: `.loom/specs/changes/${entity.displayId}`,
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
            `Tasks: ${change.state.tasks.length}`,
            `Linked tickets: ${change.linkedTickets?.links.length ?? 0}`,
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
          summary: `Artifact review target: ${target.ref}${target.path ? ` at ${target.path}` : ""}`,
          contextRefs: normalizeContextRefs({}),
        };
      case "workspace":
        return {
          summary: `Workspace review target: ${target.ref}${target.path ? ` at ${target.path}` : ""}`,
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
            `Tasks: ${change.state.tasks.length}`,
            `Linked tickets: ${change.linkedTickets?.links.length ?? 0}`,
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
          `${record.state.changeId} [${record.state.status}] ${record.state.title} — reqs=${record.state.requirements.length} tasks=${record.state.tasks.length}`,
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
          `${record.state.changeId} [${record.state.status}] ${record.state.title} — reqs=${record.state.requirements.length} tasks=${record.state.tasks.length}`,
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
        scope: state.scopePaths,
      },
      [
        renderSection("Review Target", context.targetSummary),
        renderSection("Review Question", state.reviewQuestion || "(empty)"),
        renderSection("Focus Areas", state.focusAreas.join(", ") || "none"),
        renderSection("Scope Paths", renderBulletList(state.scopePaths)),
        renderSection("Non-Goals", renderBulletList(state.nonGoals)),
        renderSection(
          "Fresh Context Protocol",
          renderBulletList([
            "Start from a fresh reviewer context instead of inheriting the executor session.",
            `Load ${relativeToWorkspace(this.cwd, getCritiquePacketPath(this.cwd, state.critiqueId))} before reasoning about the target.`,
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
        scope: state.scopePaths,
      },
      [
        renderSection("Review Target", context.targetSummary),
        renderSection("Review Question", state.reviewQuestion || "(empty)"),
        renderSection("Focus Areas", state.focusAreas.join(", ") || "none"),
        renderSection("Scope Paths", renderBulletList(state.scopePaths)),
        renderSection("Non-Goals", renderBulletList(state.nonGoals)),
        renderSection(
          "Fresh Context Protocol",
          renderBulletList([
            "Start from a fresh reviewer context instead of inheriting the executor session.",
            `Load ${relativeToWorkspace(this.cwd, getCritiquePacketPath(this.cwd, state.critiqueId))} before reasoning about the target.`,
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
    const nextState = await this.deriveStateCanonical(snapshot.state, snapshot.runs, snapshot.findings);
    const critiqueId = nextState.critiqueId;
    const critiqueDir = getCritiqueDir(this.cwd, critiqueId);
    const packet = await this.buildPacketCanonical(nextState, snapshot.runs, snapshot.findings);
    const critique = renderCritiqueMarkdown(nextState, snapshot.runs, snapshot.findings);
    const dashboard = buildCritiqueDashboard(
      nextState,
      snapshot.runs,
      snapshot.findings,
      critiqueDir,
      getCritiquePacketPath(this.cwd, critiqueId),
      getCritiqueLaunchPath(this.cwd, critiqueId),
      snapshot.launch,
    );

    return {
      state: nextState,
      summary: summarizeCritique(nextState, critiqueDir),
      packet,
      critique,
      runs: snapshot.runs,
      findings: snapshot.findings,
      dashboard,
      launch: snapshot.launch,
    };
  }

  private writeArtifacts(
    state: CritiqueState,
    runs: CritiqueRunRecord[],
    findings: CritiqueFindingRecord[],
    launchOverride?: CritiqueLaunchDescriptor | null,
  ): CritiqueReadResult {
    const critiqueId = state.critiqueId;
    const critiqueDir = getCritiqueDir(this.cwd, critiqueId);
    const launch = launchOverride ?? this.readLaunch(critiqueDir);
    const nextState = this.deriveState(state, runs, findings);
    const packet = this.buildPacket(nextState, runs, findings);
    const critique = renderCritiqueMarkdown(nextState, runs, findings);
    const dashboard = buildCritiqueDashboard(
      nextState,
      runs,
      findings,
      critiqueDir,
      getCritiquePacketPath(this.cwd, critiqueId),
      getCritiqueLaunchPath(this.cwd, critiqueId),
      launch,
    );

    const record: CritiqueReadResult = {
      state: nextState,
      summary: summarizeCritique(nextState, critiqueDir),
      packet,
      critique,
      runs,
      findings,
      dashboard,
      launch,
    };
    const { storage, identity } = openCritiqueCatalogSync(this.cwd);
    const existing = findStoredCritiqueRow(this.cwd, critiqueId);
    void storage.upsertEntity({
      id: existing?.id ?? createEntityId(ENTITY_KIND, identity.space.id, record.summary.id, `${ENTITY_KIND}:${record.summary.id}`),
      kind: ENTITY_KIND,
      spaceId: identity.space.id,
      owningRepositoryId: identity.repository.id,
      displayId: record.summary.id,
      title: record.summary.title,
      summary: record.state.reviewQuestion,
      status: record.summary.status,
      version: (existing?.version ?? 0) + 1,
      tags: record.summary.focusAreas,
      pathScopes: [],
      attributes: { record },
      createdAt: existing?.created_at ?? record.state.createdAt,
      updatedAt: record.state.updatedAt,
    });
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
        path: normalizeOptionalString(input.target.path),
      },
      focusAreas: normalizeFocusAreas(input.focusAreas ?? ["correctness", "edge_cases"]),
      reviewQuestion:
        input.reviewQuestion?.trim() ||
        `What is wrong, incomplete, unsafe, or misaligned about ${input.target.kind}:${input.target.ref}?`,
      scopePaths: normalizeStringList(input.scopePaths),
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
    return listStoredCritiqueRecords(this.cwd)
      .map((record) => summarizeCritique(record.state, getCritiqueDir(this.cwd, record.state.critiqueId)))
      .filter((summary) => {
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
        if (!filter.text) {
          return true;
        }
        const text = filter.text.toLowerCase();
        return [summary.id, summary.title, summary.targetRef, summary.targetKind, ...summary.focusAreas]
          .join(" ")
          .toLowerCase()
          .includes(text);
      });
  }

  readCritique(ref: string): CritiqueReadResult {
    this.initLedger();
    const critiqueId = normalizeCritiqueRef(ref);
    const row = findStoredCritiqueRow(this.cwd, critiqueId);
    if (!row) {
      throw new Error(`Unknown critique: ${critiqueId}`);
    }
    const attributes = parseStoredJson<CritiqueEntityAttributes | Record<string, unknown>>(row.attributes_json, {});
    if (!hasStructuredCritiqueAttributes(attributes)) {
      throw new Error(`Critique ${critiqueId} is missing structured attributes`);
    }
    return this.writeArtifacts(attributes.record.state, attributes.record.runs, latestFindings(attributes.record.findings));
  }

  createCritique(input: CreateCritiqueInput): CritiqueReadResult {
    this.initLedger();
    const timestamp = currentTimestamp();
    const critiqueId = this.nextCritiqueId(input.title);
    const state = this.createDefaultState(input, critiqueId, timestamp);
    return this.writeArtifacts(state, [], []);
  }

  updateCritique(ref: string, input: UpdateCritiqueInput): CritiqueReadResult {
    const critiqueDir = this.resolveCritiqueDirectory(ref);
    const state = this.readState(critiqueDir);
    const nextState: CritiqueState = {
      ...state,
      title: input.title?.trim() ?? state.title,
      status: input.status ? normalizeStatus(input.status) : state.status,
      target: input.target
        ? {
            kind: normalizeTargetKind(input.target.kind),
            ref: input.target.ref.trim(),
            path: normalizeOptionalString(input.target.path),
          }
        : state.target,
      focusAreas: input.focusAreas ? normalizeFocusAreas(input.focusAreas) : state.focusAreas,
      reviewQuestion: input.reviewQuestion?.trim() ?? state.reviewQuestion,
      scopePaths: input.scopePaths ? normalizeStringList(input.scopePaths) : state.scopePaths,
      nonGoals: input.nonGoals ? normalizeStringList(input.nonGoals) : state.nonGoals,
      contextRefs: input.contextRefs ? mergeContextRefs(state.contextRefs, input.contextRefs) : state.contextRefs,
      freshContextRequired:
        input.freshContextRequired !== undefined ? input.freshContextRequired : state.freshContextRequired,
      currentVerdict: input.verdict ? normalizeVerdict(input.verdict) : state.currentVerdict,
      updatedAt: currentTimestamp(),
    };
    return this.writeArtifacts(
      nextState,
      this.readRuns(critiqueDir),
      latestFindings(this.readFindingsHistory(critiqueDir)),
    );
  }

  launchCritique(ref: string): { critique: CritiqueReadResult; launch: CritiqueLaunchDescriptor; text: string } {
    const critique = this.readCritique(ref);
    const timestamp = currentTimestamp();
    // The package owns durable launch metadata; the actual fresh-session runtime adapter
    // lives above this layer. Interactive adapters can use ctx.newSession()/switchSession(),
    // while external adapters can spawn `pi --mode json -p --no-session` consistently.
    const launch: CritiqueLaunchDescriptor = {
      critiqueId: critique.state.critiqueId,
      createdAt: timestamp,
      packetPath: relativeToWorkspace(this.cwd, getCritiquePacketPath(this.cwd, critique.state.critiqueId)),
      target: critique.state.target,
      focusAreas: critique.state.focusAreas,
      reviewQuestion: critique.state.reviewQuestion,
      freshContextRequired: critique.state.freshContextRequired,
      runtime: "descriptor_only",
      instructions: [
        "Open a fresh reviewer session; do not continue in the saturated executor context.",
        `Read ${relativeToWorkspace(this.cwd, getCritiquePacketPath(this.cwd, critique.state.critiqueId))} before analyzing the target.`,
        "Record the run verdict with critique_run once review is complete.",
        "Record each concrete issue with critique_finding and create follow-up tickets only for accepted findings.",
      ],
    };
    const refreshed = this.updateCritique(ref, {
      status: critique.state.status === "proposed" ? "active" : critique.state.status,
    });
    const nextState: CritiqueState = {
      ...refreshed.state,
      lastLaunchAt: timestamp,
      launchCount: refreshed.state.launchCount + 1,
      updatedAt: timestamp,
    };
    const materialized = this.writeArtifacts(nextState, refreshed.runs, refreshed.findings, launch);
    return {
      critique: materialized,
      launch,
      text: renderLaunchDescriptor(this.cwd, launch),
    };
  }

  recordRun(ref: string, input: CreateCritiqueRunInput): CritiqueReadResult {
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
    );
  }

  addFinding(ref: string, input: CreateCritiqueFindingInput): CritiqueReadResult {
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
      scopePaths: normalizeStringList(input.scopePaths ?? state.scopePaths),
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
    );
  }

  updateFinding(ref: string, input: UpdateCritiqueFindingInput): CritiqueReadResult {
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
      recommendedAction: input.recommendedAction?.trim() ?? current.recommendedAction,
    };
    return this.writeArtifacts(
      {
        ...state,
        updatedAt: updated.updatedAt,
      },
      runs,
      findings.map((finding) => (finding.id === updated.id ? updated : finding)),
    );
  }

  ticketifyFinding(ref: string, input: TicketifyCritiqueFindingInput): CritiqueReadResult {
    const critique = this.readCritique(ref);
    const finding = critique.findings.find((entry) => entry.id === input.findingId);
    if (!finding) {
      throw new Error(`Unknown critique finding: ${input.findingId}`);
    }
    if (finding.linkedTicketId) {
      return critique;
    }

    throw new Error("Use ticketifyFindingAsync for canonical ticket creation");
  }

  resolveCritique(ref: string, verdict?: CritiqueState["currentVerdict"]): CritiqueReadResult {
    const critique = this.readCritique(ref);
    const nextVerdict = verdict
      ? normalizeVerdict(verdict)
      : critique.state.openFindingIds.length === 0
        ? "pass"
        : critique.state.currentVerdict;
    return this.writeArtifacts(
      {
        ...critique.state,
        status: "resolved",
        currentVerdict: nextVerdict,
        updatedAt: currentTimestamp(),
      },
      critique.runs,
      critique.findings,
    );
  }

  private async upsertCanonicalRecord(record: CritiqueReadResult): Promise<CritiqueReadResult> {
    const canonicalRecord = await this.buildCanonicalRecord({
      state: record.state,
      runs: record.runs,
      findings: record.findings,
      launch: record.launch,
    });
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const existing = await findEntityByDisplayId(storage, identity.space.id, ENTITY_KIND, canonicalRecord.summary.id);
    const version = (existing?.version ?? 0) + 1;
    await upsertEntityByDisplayId(storage, {
      kind: ENTITY_KIND,
      spaceId: identity.space.id,
      owningRepositoryId: identity.repository.id,
      displayId: canonicalRecord.summary.id,
      title: canonicalRecord.summary.title,
      summary: canonicalRecord.state.reviewQuestion,
      status: canonicalRecord.summary.status,
      version,
      tags: canonicalRecord.summary.focusAreas,
      pathScopes: [],
      attributes: { record: canonicalRecord },
      createdAt: existing?.createdAt ?? canonicalRecord.state.createdAt,
      updatedAt: canonicalRecord.state.updatedAt,
    });
    return canonicalRecord;
  }

  private async entityRecord(entity: LoomEntityRecord): Promise<CritiqueReadResult> {
    if (!hasStructuredCritiqueAttributes(entity.attributes)) {
      const critiqueId = entity.displayId ?? entity.id;
      throw new Error(`Critique ${critiqueId} is missing structured attributes`);
    }
    return this.buildCanonicalRecord({
      state: entity.attributes.record.state,
      runs: entity.attributes.record.runs,
      findings: entity.attributes.record.findings,
      launch: entity.attributes.record.launch,
    });
  }

  async initLedgerAsync(): Promise<{ initialized: true; root: string }> {
    return this.initLedger();
  }

  async listCritiquesAsync(filter: CritiqueListFilter = {}): Promise<CritiqueSummary[]> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const records = await Promise.all(
      (await storage.listEntities(identity.space.id, ENTITY_KIND)).map((entity) => this.entityRecord(entity)),
    );
    return records
      .map((record) => record.summary)
      .filter((summary) => {
        if (filter.status && summary.status !== filter.status) return false;
        if (filter.verdict && summary.verdict !== filter.verdict) return false;
        if (filter.targetKind && summary.targetKind !== filter.targetKind) return false;
        if (filter.focusArea && !summary.focusAreas.includes(filter.focusArea)) return false;
        if (!filter.text) return true;
        const text = filter.text.toLowerCase();
        return [summary.id, summary.title, summary.targetRef, summary.targetKind, ...summary.focusAreas]
          .join(" ")
          .toLowerCase()
          .includes(text);
      });
  }

  async readCritiqueAsync(ref: string): Promise<CritiqueReadResult> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const critiqueId = normalizeCritiqueRef(ref);
    const entity = await findEntityByDisplayId(storage, identity.space.id, ENTITY_KIND, critiqueId);
    if (!entity) {
      throw new Error(`Unknown critique: ${critiqueId}`);
    }
    return this.entityRecord(entity);
  }

  async createCritiqueAsync(input: CreateCritiqueInput): Promise<CritiqueReadResult> {
    return this.upsertCanonicalRecord(this.createCritique(input));
  }

  async updateCritiqueAsync(ref: string, input: UpdateCritiqueInput): Promise<CritiqueReadResult> {
    return this.upsertCanonicalRecord(this.updateCritique(ref, input));
  }

  async launchCritiqueAsync(
    ref: string,
  ): Promise<{ critique: CritiqueReadResult; launch: CritiqueLaunchDescriptor; text: string }> {
    const launched = this.launchCritique(ref);
    return { ...launched, critique: await this.upsertCanonicalRecord(launched.critique) };
  }

  async recordRunAsync(ref: string, input: CreateCritiqueRunInput): Promise<CritiqueReadResult> {
    return this.upsertCanonicalRecord(this.recordRun(ref, input));
  }

  async addFindingAsync(ref: string, input: CreateCritiqueFindingInput): Promise<CritiqueReadResult> {
    return this.upsertCanonicalRecord(this.addFinding(ref, input));
  }

  async updateFindingAsync(ref: string, input: UpdateCritiqueFindingInput): Promise<CritiqueReadResult> {
    return this.upsertCanonicalRecord(this.updateFinding(ref, input));
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
      specChange: context.contextRefs.specChangeIds[0] ?? null,
      reviewStatus: "requested",
      externalRefs: [`critique:${critique.state.critiqueId}`, `finding:${finding.id}`],
      labels: ["critique", finding.kind],
    });

    return this.upsertCanonicalRecord(
      this.updateFinding(ref, {
        id: finding.id,
        linkedTicketId: created.summary.id,
        status: "accepted",
        resolutionNotes: `Follow-up ticket created: ${created.summary.id}`,
      }),
    );
  }

  async resolveCritiqueAsync(ref: string, verdict?: CritiqueState["currentVerdict"]): Promise<CritiqueReadResult> {
    return this.upsertCanonicalRecord(this.resolveCritique(ref, verdict));
  }
}

export function createCritiqueStore(cwd: string): CritiqueStore {
  return new CritiqueStore(cwd);
}
