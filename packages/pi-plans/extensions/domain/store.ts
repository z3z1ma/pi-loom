import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { ConstitutionalRecord } from "@pi-loom/pi-constitution/extensions/domain/models.js";
import { createConstitutionalStore } from "@pi-loom/pi-constitution/extensions/domain/store.js";
import type { CritiqueReadResult } from "@pi-loom/pi-critique/extensions/domain/models.js";
import { createCritiqueStore } from "@pi-loom/pi-critique/extensions/domain/store.js";
import type { DocumentationReadResult } from "@pi-loom/pi-docs/extensions/domain/models.js";
import { createDocumentationStore } from "@pi-loom/pi-docs/extensions/domain/store.js";
import type { InitiativeRecord } from "@pi-loom/pi-initiatives/extensions/domain/models.js";
import { createInitiativeStore } from "@pi-loom/pi-initiatives/extensions/domain/store.js";
import type { ResearchRecord } from "@pi-loom/pi-research/extensions/domain/models.js";
import { createResearchStore } from "@pi-loom/pi-research/extensions/domain/store.js";
import type { SpecChangeRecord } from "@pi-loom/pi-specs/extensions/domain/models.js";
import { createSpecStore } from "@pi-loom/pi-specs/extensions/domain/store.js";
import {
  findEntityByDisplayId,
  upsertEntityByDisplayId,
  upsertProjectionForEntity,
} from "@pi-loom/pi-storage/storage/entities.js";
import { openWorkspaceStorage } from "@pi-loom/pi-storage/storage/workspace.js";
import type { TicketReadResult } from "@pi-loom/pi-ticketing/extensions/domain/models.js";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import { buildPlanDashboard, summarizePlan } from "./dashboard.js";
import type {
  CreatePlanInput,
  LinkPlanTicketInput,
  PlanContextRefs,
  PlanDashboardTicket,
  PlanListFilter,
  PlanReadResult,
  PlanRevisionRecord,
  PlanState,
  UpdatePlanInput,
} from "./models.js";
import {
  currentTimestamp,
  normalizeContextRefs,
  normalizeDecisions,
  normalizeDiscoveries,
  normalizePlanId,
  normalizePlanRef,
  normalizePlanSourceTargetKind,
  normalizePlanStatus,
  normalizePlanTicketLinks,
  normalizeProgress,
  normalizeRevisionNotes,
  normalizeStringList,
  normalizeTicketId,
  slugifyTitle,
  summarizeText,
} from "./normalize.js";
import { getPlanDir, getPlanMarkdownPath, getPlanPacketPath, getPlanStatePath, getPlansPaths } from "./paths.js";
import { renderPlanMarkdown } from "./render.js";

const ENTITY_KIND = "plan" as const;

interface PlanEntityAttributes {
  state: PlanState;
}

function hasStructuredPlanAttributes(attributes: unknown): attributes is PlanEntityAttributes {
  return Boolean(attributes && typeof attributes === "object" && "state" in attributes);
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

function relativePathFromRoot(cwd: string, filePath: string): string {
  if (!isAbsolute(filePath)) {
    return filePath;
  }
  return relative(cwd, filePath) || ".";
}

function mergeContextRefs(...refs: Array<Partial<PlanContextRefs> | undefined>): PlanContextRefs {
  return normalizeContextRefs({
    roadmapItemIds: refs.flatMap((value) => value?.roadmapItemIds ?? []),
    initiativeIds: refs.flatMap((value) => value?.initiativeIds ?? []),
    researchIds: refs.flatMap((value) => value?.researchIds ?? []),
    specChangeIds: refs.flatMap((value) => value?.specChangeIds ?? []),
    ticketIds: refs.flatMap((value) => value?.ticketIds ?? []),
    critiqueIds: refs.flatMap((value) => value?.critiqueIds ?? []),
    docIds: refs.flatMap((value) => value?.docIds ?? []),
  });
}

function excerpt(value: string, fallback = "(empty)", limit = 280): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return fallback;
  }
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit - 1)}…`;
}

function createRevisionNote(change: string, reason: string, timestamp = currentTimestamp()): PlanRevisionRecord {
  return {
    timestamp,
    change: change.trim(),
    reason: reason.trim(),
  };
}

function appendRevisionNote(
  existing: readonly PlanRevisionRecord[],
  note: PlanRevisionRecord,
  additions: readonly PlanRevisionRecord[] = [],
): PlanRevisionRecord[] {
  return normalizeRevisionNotes([...existing, ...additions, note]);
}

function deriveContextRefsFromTicket(ticket: TicketReadResult): PlanContextRefs {
  return mergeContextRefs({
    initiativeIds: ticket.ticket.frontmatter["initiative-ids"],
    researchIds: ticket.ticket.frontmatter["research-ids"],
    specChangeIds: ticket.ticket.frontmatter["spec-change"] ? [ticket.ticket.frontmatter["spec-change"]] : [],
    ticketIds: [ticket.summary.id],
  });
}

function deriveContextRefsFromSpec(change: SpecChangeRecord): PlanContextRefs {
  return mergeContextRefs({
    initiativeIds: change.state.initiativeIds,
    researchIds: change.state.researchIds,
    specChangeIds: [change.state.changeId],
    ticketIds: change.projection?.tickets.map((ticket) => ticket.ticketId) ?? [],
  });
}

function deriveContextRefsFromInitiative(initiative: InitiativeRecord): PlanContextRefs {
  return mergeContextRefs({
    roadmapItemIds: initiative.state.roadmapRefs,
    initiativeIds: [initiative.state.initiativeId],
    researchIds: initiative.state.researchIds,
    specChangeIds: initiative.state.specChangeIds,
    ticketIds: initiative.state.ticketIds,
  });
}

function deriveContextRefsFromResearch(research: ResearchRecord): PlanContextRefs {
  return mergeContextRefs({
    initiativeIds: research.state.initiativeIds,
    researchIds: [research.state.researchId],
    specChangeIds: research.state.specChangeIds,
    ticketIds: research.state.ticketIds,
  });
}

function deriveContextRefsFromCritique(critique: CritiqueReadResult): PlanContextRefs {
  return mergeContextRefs(critique.state.contextRefs, {
    critiqueIds: [critique.state.critiqueId],
    ticketIds: critique.state.followupTicketIds,
  });
}

function deriveContextRefsFromDoc(documentation: DocumentationReadResult): PlanContextRefs {
  return mergeContextRefs(documentation.state.contextRefs, {
    docIds: [documentation.state.docId],
  });
}

interface ResolvedPlanContext {
  sourceSummary: string;
  contextRefs: PlanContextRefs;
  constitution: ConstitutionalRecord | null;
  roadmapItems: string[];
  initiatives: string[];
  research: string[];
  specs: string[];
  tickets: string[];
  critiques: string[];
  docs: string[];
  linkedTickets: PlanDashboardTicket[];
  packetSummary: string;
}

export class PlanStore {
  readonly cwd: string;

  constructor(cwd: string) {
    this.cwd = resolve(cwd);
  }

  async initLedger(): Promise<{ initialized: true; root: string }> {
    const paths = getPlansPaths(this.cwd);
    ensureDir(paths.plansDir);
    return { initialized: true, root: paths.plansDir };
  }

  private planDirectories(): string[] {
    const directory = getPlansPaths(this.cwd).plansDir;
    if (!existsSync(directory)) {
      return [];
    }
    return readdirSync(directory)
      .map((entry) => join(directory, entry))
      .filter((path) => statSync(path).isDirectory())
      .sort((left, right) => basename(left).localeCompare(basename(right)));
  }

  private nextPlanId(baseTitle: string): string {
    const baseId = slugifyTitle(baseTitle);
    const existing = new Set(this.planDirectories().map((directory) => basename(directory)));
    if (!existing.has(baseId)) {
      return baseId;
    }
    let attempt = 2;
    while (existing.has(`${baseId}-${attempt}`)) {
      attempt += 1;
    }
    return `${baseId}-${attempt}`;
  }

  private resolvePlanDirectory(ref: string): string {
    const normalizedRef = normalizePlanRef(ref);
    const directPath = getPlanDir(this.cwd, normalizedRef);
    if (existsSync(join(directPath, "state.json"))) {
      return directPath;
    }
    throw new Error(`Unknown plan: ${ref}`);
  }

  private readStateFromFiles(planDir: string): PlanState {
    const state = readJson<PlanState>(join(planDir, "state.json"));
    return {
      ...state,
      planId: normalizePlanId(state.planId),
      title: state.title.trim(),
      status: normalizePlanStatus(state.status),
      summary: state.summary?.trim() ?? "",
      purpose: state.purpose?.trim() ?? "",
      contextAndOrientation: state.contextAndOrientation?.trim() ?? "",
      milestones: state.milestones?.trim() ?? "",
      planOfWork: state.planOfWork?.trim() ?? "",
      concreteSteps: state.concreteSteps?.trim() ?? "",
      validation: state.validation?.trim() ?? "",
      idempotenceAndRecovery: state.idempotenceAndRecovery?.trim() ?? "",
      artifactsAndNotes: state.artifactsAndNotes?.trim() ?? "",
      interfacesAndDependencies: state.interfacesAndDependencies?.trim() ?? "",
      risksAndQuestions: state.risksAndQuestions?.trim() ?? "",
      outcomesAndRetrospective: state.outcomesAndRetrospective?.trim() ?? "",
      scopePaths: normalizeStringList(state.scopePaths),
      sourceTarget: {
        kind: normalizePlanSourceTargetKind(state.sourceTarget.kind),
        ref: state.sourceTarget.ref.trim(),
      },
      contextRefs: normalizeContextRefs(state.contextRefs),
      linkedTickets: normalizePlanTicketLinks(state.linkedTickets),
      progress: normalizeProgress(state.progress),
      discoveries: normalizeDiscoveries(state.discoveries),
      decisions: normalizeDecisions(state.decisions),
      revisionNotes: normalizeRevisionNotes(state.revisionNotes),
      packetSummary: state.packetSummary?.trim() ?? "",
    };
  }

  private writeState(state: PlanState): void {
    writeJson(getPlanStatePath(this.cwd, state.planId), state);
  }

  private constitutionExists(): boolean {
    return existsSync(join(this.cwd, ".loom", "constitution", "state.json"));
  }

  private async readConstitutionIfPresentAsync(): Promise<ConstitutionalRecord | null> {
    try {
      const { storage, identity } = await openWorkspaceStorage(this.cwd);
      const entity = await findEntityByDisplayId(storage, identity.space.id, "constitution", "constitution");
      if (!entity) {
        return null;
      }
      return { state: (entity.attributes as { state: ConstitutionalRecord["state"] }).state } as ConstitutionalRecord;
    } catch {
      return null;
    }
  }

  private readConstitutionIfPresent(): ConstitutionalRecord | null {
    if (!this.constitutionExists()) {
      return null;
    }
    try {
      return createConstitutionalStore(this.cwd).readConstitutionProjection();
    } catch {
      return null;
    }
  }

  private safeReadInitiative(id: string): InitiativeRecord | null {
    try {
      return createInitiativeStore(this.cwd).readInitiativeProjection(id);
    } catch {
      return null;
    }
  }

  private async safeReadInitiativeAsync(id: string): Promise<InitiativeRecord | null> {
    try {
      const { storage, identity } = await openWorkspaceStorage(this.cwd);
      const entity = await findEntityByDisplayId(storage, identity.space.id, "initiative", id);
      if (!entity) {
        return null;
      }
      const attributes = entity.attributes as {
        state: InitiativeRecord["state"];
        decisions: InitiativeRecord["decisions"];
      };
      return {
        state: attributes.state,
        decisions: attributes.decisions,
        summary: {
          id: entity.displayId,
          title: entity.title,
          status: entity.status as InitiativeRecord["summary"]["status"],
          objective: attributes.state.objective,
          updatedAt: entity.updatedAt,
          path: `.loom/initiatives/${entity.displayId}`,
          roadmapRefs: attributes.state.roadmapRefs,
          specChangeIds: attributes.state.specChangeIds,
          ticketIds: attributes.state.ticketIds,
          researchIds: attributes.state.researchIds,
        },
      } as unknown as InitiativeRecord;
    } catch {
      return null;
    }
  }

  private safeReadResearch(id: string): ResearchRecord | null {
    try {
      return createResearchStore(this.cwd).readResearchProjection(id);
    } catch {
      return null;
    }
  }

  private async safeReadResearchAsync(id: string): Promise<ResearchRecord | null> {
    try {
      const { storage, identity } = await openWorkspaceStorage(this.cwd);
      const entity = await findEntityByDisplayId(storage, identity.space.id, "research", id);
      if (!entity) {
        return null;
      }
      const attributes = entity.attributes as {
        state: ResearchRecord["state"];
        hypotheses: ResearchRecord["hypothesisHistory"];
        artifacts: ResearchRecord["artifacts"];
      };
      return {
        state: attributes.state,
        hypothesisHistory: attributes.hypotheses,
        artifacts: attributes.artifacts,
        summary: {
          id: entity.displayId,
          title: entity.title,
          status: entity.status as ResearchRecord["summary"]["status"],
          question: attributes.state.question,
          updatedAt: entity.updatedAt,
          path: `.loom/research/${entity.displayId}`,
          initiativeIds: attributes.state.initiativeIds,
          specChangeIds: attributes.state.specChangeIds,
          ticketIds: attributes.state.ticketIds,
        },
        dashboard: {} as ResearchRecord["dashboard"],
        map: {} as ResearchRecord["map"],
      } as unknown as ResearchRecord;
    } catch {
      return null;
    }
  }

  private safeReadSpec(id: string): SpecChangeRecord | null {
    try {
      return createSpecStore(this.cwd).readChangeProjection(id);
    } catch {
      return null;
    }
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
        projection: SpecChangeRecord["projection"];
      };
      return {
        state: attributes.state,
        decisions: attributes.decisions,
        analysis: attributes.analysis,
        checklist: attributes.checklist,
        projection: attributes.projection,
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
    try {
      return createTicketStore(this.cwd).readTicketProjection(id);
    } catch {
      return null;
    }
  }

  private async safeReadTicketAsync(id: string): Promise<TicketReadResult | null> {
    try {
      const { storage, identity } = await openWorkspaceStorage(this.cwd);
      const entity = await findEntityByDisplayId(storage, identity.space.id, "ticket", id);
      if (!entity) {
        return null;
      }
      return (entity.attributes as { record: TicketReadResult }).record;
    } catch {
      return null;
    }
  }

  private safeReadCritique(id: string): CritiqueReadResult | null {
    try {
      return createCritiqueStore(this.cwd).readCritique(id);
    } catch {
      return null;
    }
  }

  private async safeReadCritiqueAsync(id: string): Promise<CritiqueReadResult | null> {
    try {
      const { storage, identity } = await openWorkspaceStorage(this.cwd);
      const entity = await findEntityByDisplayId(storage, identity.space.id, "critique", id);
      if (!entity) {
        return createCritiqueStore(this.cwd).readCritique(id);
      }
      return (entity.attributes as { record: CritiqueReadResult }).record;
    } catch {
      return null;
    }
  }

  private safeReadDoc(id: string): DocumentationReadResult | null {
    try {
      return createDocumentationStore(this.cwd).readDocProjection(id);
    } catch {
      return null;
    }
  }

  private async safeReadDocAsync(id: string): Promise<DocumentationReadResult | null> {
    try {
      const { storage, identity } = await openWorkspaceStorage(this.cwd);
      const entity = await findEntityByDisplayId(storage, identity.space.id, "documentation", id);
      if (!entity) {
        return null;
      }
      return (entity.attributes as { record: DocumentationReadResult }).record;
    } catch {
      return null;
    }
  }

  private async safeReadRoadmapItemAsync(itemId: string) {
    try {
      const constitution = await this.readConstitutionIfPresentAsync();
      return constitution?.state.roadmapItems.find((item) => item.id === itemId) ?? null;
    } catch {
      return null;
    }
  }

  private resolveSourceSummary(state: PlanState): { summary: string; contextRefs: PlanContextRefs } {
    switch (state.sourceTarget.kind) {
      case "initiative": {
        const initiative = this.safeReadInitiative(state.sourceTarget.ref);
        if (!initiative) {
          return {
            summary: `Initiative ${state.sourceTarget.ref} could not be loaded. Use the packet context directly and repair the link if needed.`,
            contextRefs: mergeContextRefs({ initiativeIds: [state.sourceTarget.ref] }),
          };
        }
        return {
          summary: [
            `${initiative.summary.id} [${initiative.summary.status}] ${initiative.summary.title}`,
            `Objective: ${excerpt(initiative.state.objective)}`,
            `Status summary: ${excerpt(initiative.state.statusSummary, "(empty)")}`,
            `Milestones: ${initiative.state.milestones.length}`,
          ].join("\n"),
          contextRefs: deriveContextRefsFromInitiative(initiative),
        };
      }
      case "spec": {
        const change = this.safeReadSpec(state.sourceTarget.ref);
        if (!change) {
          return {
            summary: `Spec ${state.sourceTarget.ref} could not be loaded. Use the packet context directly and repair the link if needed.`,
            contextRefs: mergeContextRefs({ specChangeIds: [state.sourceTarget.ref] }),
          };
        }
        return {
          summary: [
            `${change.summary.id} [${change.summary.status}] ${change.summary.title}`,
            `Proposal: ${excerpt(change.state.proposalSummary)}`,
            `Requirements: ${change.state.requirements.length}`,
            `Tasks: ${change.state.tasks.length}`,
          ].join("\n"),
          contextRefs: deriveContextRefsFromSpec(change),
        };
      }
      case "research": {
        const research = this.safeReadResearch(state.sourceTarget.ref);
        if (!research) {
          return {
            summary: `Research ${state.sourceTarget.ref} could not be loaded. Use the packet context directly and repair the link if needed.`,
            contextRefs: mergeContextRefs({ researchIds: [state.sourceTarget.ref] }),
          };
        }
        return {
          summary: [
            `${research.summary.id} [${research.summary.status}] ${research.summary.title}`,
            `Question: ${excerpt(research.state.question)}`,
            `Objective: ${excerpt(research.state.objective)}`,
            `Conclusions: ${research.state.conclusions.join("; ") || "none"}`,
          ].join("\n"),
          contextRefs: deriveContextRefsFromResearch(research),
        };
      }
      case "workspace":
        return {
          summary: `Workspace planning target: ${state.sourceTarget.ref}`,
          contextRefs: normalizeContextRefs(state.contextRefs),
        };
    }
  }

  private async resolveSourceSummaryAsync(
    state: PlanState,
  ): Promise<{ summary: string; contextRefs: PlanContextRefs }> {
    switch (state.sourceTarget.kind) {
      case "initiative": {
        const initiative = await this.safeReadInitiativeAsync(state.sourceTarget.ref);
        if (!initiative) {
          return {
            summary: `Initiative ${state.sourceTarget.ref} could not be loaded. Use the packet context directly and repair the link if needed.`,
            contextRefs: mergeContextRefs({ initiativeIds: [state.sourceTarget.ref] }),
          };
        }
        return {
          summary: [
            `${initiative.summary.id} [${initiative.summary.status}] ${initiative.summary.title}`,
            `Objective: ${excerpt(initiative.state.objective)}`,
            `Status summary: ${excerpt(initiative.state.statusSummary, "(empty)")}`,
            `Milestones: ${initiative.state.milestones.length}`,
          ].join("\n"),
          contextRefs: deriveContextRefsFromInitiative(initiative),
        };
      }
      case "spec": {
        const change = await this.safeReadSpecAsync(state.sourceTarget.ref);
        if (!change) {
          return {
            summary: `Spec ${state.sourceTarget.ref} could not be loaded. Use the packet context directly and repair the link if needed.`,
            contextRefs: mergeContextRefs({ specChangeIds: [state.sourceTarget.ref] }),
          };
        }
        return {
          summary: [
            `${change.summary.id} [${change.summary.status}] ${change.summary.title}`,
            `Proposal: ${excerpt(change.state.proposalSummary)}`,
            `Requirements: ${change.state.requirements.length}`,
            `Tasks: ${change.state.tasks.length}`,
          ].join("\n"),
          contextRefs: deriveContextRefsFromSpec(change),
        };
      }
      case "research": {
        const research = await this.safeReadResearchAsync(state.sourceTarget.ref);
        if (!research) {
          return {
            summary: `Research ${state.sourceTarget.ref} could not be loaded. Use the packet context directly and repair the link if needed.`,
            contextRefs: mergeContextRefs({ researchIds: [state.sourceTarget.ref] }),
          };
        }
        return {
          summary: [
            `${research.summary.id} [${research.summary.status}] ${research.summary.title}`,
            `Question: ${excerpt(research.state.question)}`,
            `Objective: ${excerpt(research.state.objective)}`,
            `Conclusions: ${research.state.conclusions.join("; ") || "none"}`,
          ].join("\n"),
          contextRefs: deriveContextRefsFromResearch(research),
        };
      }
      case "workspace":
        return {
          summary: `Workspace planning target: ${state.sourceTarget.ref}`,
          contextRefs: normalizeContextRefs(state.contextRefs),
        };
    }
  }

  private resolveLinkedTickets(state: PlanState): PlanDashboardTicket[] {
    return state.linkedTickets.map((link) => {
      const ticket = this.safeReadTicket(link.ticketId);
      if (!ticket) {
        return {
          ticketId: link.ticketId,
          role: link.role,
          order: link.order,
          status: "missing",
          title: "Missing ticket",
          path: null,
        };
      }
      return {
        ticketId: link.ticketId,
        role: link.role,
        order: link.order,
        status: ticket.summary.status,
        title: ticket.summary.title,
        path: relativePathFromRoot(this.cwd, ticket.summary.path),
      };
    });
  }

  private async resolveLinkedTicketsAsync(state: PlanState): Promise<PlanDashboardTicket[]> {
    const tickets = await Promise.all(
      state.linkedTickets.map(async (link) => {
        const ticket = await this.safeReadTicketAsync(link.ticketId);
        if (!ticket) {
          return {
            ticketId: link.ticketId,
            role: link.role,
            order: link.order,
            status: "missing",
            title: "Missing ticket",
            path: null,
          };
        }
        return {
          ticketId: link.ticketId,
          role: link.role,
          order: link.order,
          status: ticket.summary.status,
          title: ticket.summary.title,
          path: relativePathFromRoot(this.cwd, ticket.summary.path),
        };
      }),
    );
    return tickets;
  }

  private resolvePacketContext(state: PlanState): ResolvedPlanContext {
    const source = this.resolveSourceSummary(state);
    const linkedTicketResults = state.linkedTickets
      .map((link) => this.safeReadTicket(link.ticketId))
      .filter((ticket): ticket is TicketReadResult => ticket !== null);
    const linkedTickets = this.resolveLinkedTickets(state);
    const baseContextRefs = mergeContextRefs(
      state.contextRefs,
      source.contextRefs,
      ...linkedTicketResults.map((ticket) => deriveContextRefsFromTicket(ticket)),
    );
    const critiqueResults = baseContextRefs.critiqueIds
      .map((critiqueId) => this.safeReadCritique(critiqueId))
      .filter((record): record is CritiqueReadResult => record !== null);
    const docResults = baseContextRefs.docIds
      .map((docId) => this.safeReadDoc(docId))
      .filter((record): record is DocumentationReadResult => record !== null);
    const contextRefs = mergeContextRefs(
      baseContextRefs,
      ...critiqueResults.map((record) => deriveContextRefsFromCritique(record)),
      ...docResults.map((record) => deriveContextRefsFromDoc(record)),
    );
    const constitution = this.readConstitutionIfPresent();
    const roadmapItems = constitution
      ? contextRefs.roadmapItemIds
          .map((itemId) => {
            try {
              return createConstitutionalStore(this.cwd).readRoadmapItemProjection(itemId);
            } catch {
              return null;
            }
          })
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
    const critiques = critiqueResults.map(
      (record) =>
        `${record.summary.id} [${record.summary.status}/${record.summary.verdict}] ${record.summary.title} — open findings: ${record.state.openFindingIds.length}`,
    );
    const docs = docResults.map(
      (record) =>
        `${record.summary.id} [${record.summary.status}/${record.summary.docType}] ${record.summary.title} — ${excerpt(record.state.summary, "Documentation record")}`,
    );
    const packetSummary = [
      `${state.sourceTarget.kind}:${state.sourceTarget.ref}`,
      `${linkedTickets.length} linked ticket(s)`,
      `${roadmapItems.length} roadmap`,
      `${initiatives.length} initiative`,
      `${research.length} research`,
      `${specs.length} spec`,
      `${tickets.length} ticket`,
      `${critiques.length} critique`,
      `${docs.length} doc`,
    ].join("; ");

    return {
      sourceSummary: source.summary,
      contextRefs,
      constitution,
      roadmapItems,
      initiatives,
      research,
      specs,
      tickets,
      critiques,
      docs,
      linkedTickets,
      packetSummary,
    };
  }

  private async resolvePacketContextAsync(state: PlanState): Promise<ResolvedPlanContext> {
    const source = await this.resolveSourceSummaryAsync(state);
    const linkedTicketResults = (
      await Promise.all(state.linkedTickets.map((link) => this.safeReadTicketAsync(link.ticketId)))
    ).filter((ticket): ticket is TicketReadResult => ticket !== null);
    const linkedTickets = await this.resolveLinkedTicketsAsync(state);
    const baseContextRefs = mergeContextRefs(
      state.contextRefs,
      source.contextRefs,
      ...linkedTicketResults.map((ticket) => deriveContextRefsFromTicket(ticket)),
    );
    const critiqueResults = (
      await Promise.all(baseContextRefs.critiqueIds.map((critiqueId) => this.safeReadCritiqueAsync(critiqueId)))
    ).filter((record): record is CritiqueReadResult => record !== null);
    const docResults = (await Promise.all(baseContextRefs.docIds.map((docId) => this.safeReadDocAsync(docId)))).filter(
      (record): record is DocumentationReadResult => record !== null,
    );
    const contextRefs = mergeContextRefs(
      baseContextRefs,
      ...critiqueResults.map((record) => deriveContextRefsFromCritique(record)),
      ...docResults.map((record) => deriveContextRefsFromDoc(record)),
    );
    const constitution = await this.readConstitutionIfPresentAsync();
    const roadmapItems = constitution
      ? (await Promise.all(contextRefs.roadmapItemIds.map((itemId) => this.safeReadRoadmapItemAsync(itemId))))
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
    const critiques = critiqueResults.map(
      (record) =>
        `${record.summary.id} [${record.summary.status}/${record.summary.verdict}] ${record.summary.title} — open findings: ${record.state.openFindingIds.length}`,
    );
    const docs = docResults.map(
      (record) =>
        `${record.summary.id} [${record.summary.status}/${record.summary.docType}] ${record.state.title} — ${excerpt(record.state.summary, "Documentation record")}`,
    );
    const packetSummary = [
      `${state.sourceTarget.kind}:${state.sourceTarget.ref}`,
      `${linkedTickets.length} linked ticket(s)`,
      `${roadmapItems.length} roadmap`,
      `${initiatives.length} initiative`,
      `${research.length} research`,
      `${specs.length} spec`,
      `${tickets.length} ticket`,
      `${critiques.length} critique`,
      `${docs.length} doc`,
    ].join("; ");

    return {
      sourceSummary: source.summary,
      contextRefs,
      constitution,
      roadmapItems,
      initiatives,
      research,
      specs,
      tickets,
      critiques,
      docs,
      linkedTickets,
      packetSummary,
    };
  }

  private buildPacket(state: PlanState): string {
    const context = this.resolvePacketContext(state);
    const constitutionSummary = context.constitution
      ? [
          `Project: ${context.constitution.state.title}`,
          `Strategic direction: ${excerpt(context.constitution.state.strategicDirectionSummary)}`,
          `Current focus: ${context.constitution.state.currentFocus.join("; ") || "none"}`,
          `Open constitutional questions: ${context.constitution.state.openConstitutionQuestions.join("; ") || "none"}`,
        ].join("\n")
      : "(none)";
    const linkedTickets =
      context.linkedTickets.length > 0
        ? context.linkedTickets
            .map(
              (ticket) =>
                `- ${ticket.ticketId} [${ticket.status}] ${ticket.title}${ticket.role ? ` — ${ticket.role}` : ""}`,
            )
            .join("\n")
        : "- (none linked yet)";
    const section = (title: string, body: string) => `## ${title}\n\n${body.trim() || "(none)"}`;
    const list = (values: string[], empty = "(none)") =>
      values.length > 0 ? values.map((value) => `- ${value}`).join("\n") : empty;

    return `${[
      `# ${state.title} Planning Packet`,
      "",
      section("Planning Target", context.sourceSummary),
      section("Current Plan Summary", state.summary || state.purpose || "(empty)"),
      section(
        "Workplan Authoring Requirements",
        list([
          "Write `plan.md` as a fully self-contained novice-facing guide. Assume the reader only has the current working tree plus this packet and the rendered workplan.",
          "Keep the sections `Progress`, `Surprises & Discoveries`, `Decision Log`, `Outcomes & Retrospective`, and `Revision Notes` truthful and current as the work evolves.",
          "Use plain language, define repository-specific terms when they first appear, and describe observable validation instead of merely naming code changes.",
          "Keep Loom integration explicit through source refs, scope paths, linked tickets, and neighboring context, while leaving live ticket status and acceptance detail in the linked tickets themselves.",
        ]),
      ),
      section(
        "Planning Boundaries",
        list([
          "Keep `plan.md` deeply detailed at the execution-strategy layer; it should explain sequencing, rationale, risks, and validation without duplicating ticket-by-ticket live state.",
          "Use `pi-ticketing` to create, refine, or link tickets explicitly. Plans provide coordination context around those tickets, and linked tickets stay fully detailed and executable in their own right.",
          "Treat linked tickets as the live execution system of record for status, dependencies, verification, and checkpoints, and as self-contained units of work with their own acceptance criteria and execution context.",
          "Preserve truthful source refs, ticket roles, assumptions, risks, and validation intent so a fresh planner can resume from durable context.",
        ]),
      ),
      section("Linked Tickets", linkedTickets),
      section("Scope Paths", list(state.scopePaths)),
      section("Constitutional Context", constitutionSummary),
      section("Roadmap Items", list(context.roadmapItems)),
      section("Initiatives", list(context.initiatives)),
      section("Research", list(context.research)),
      section("Specs", list(context.specs)),
      section("Tickets", list(context.tickets)),
      section("Critiques", list(context.critiques)),
      section("Documentation", list(context.docs)),
    ]
      .join("\n\n")
      .trimEnd()}\n`;
  }

  private deriveState(state: PlanState): PlanState {
    const context = this.resolvePacketContext(state);
    return {
      ...state,
      packetSummary: context.packetSummary,
    };
  }

  private async deriveStateAsync(state: PlanState): Promise<PlanState> {
    const context = await this.resolvePacketContextAsync(state);
    return {
      ...state,
      packetSummary: context.packetSummary,
    };
  }

  private materialize(state: PlanState): PlanReadResult {
    const planDir = getPlanDir(this.cwd, state.planId);
    const relativePlanDir = relativePathFromRoot(this.cwd, planDir);
    const nextState = this.deriveState(state);
    const linkedTickets = this.resolveLinkedTickets(nextState);
    const packet = this.buildPacket(nextState);
    const plan = renderPlanMarkdown(nextState, linkedTickets);
    const dashboard = buildPlanDashboard(
      nextState,
      relativePlanDir,
      relativePathFromRoot(this.cwd, getPlanPacketPath(this.cwd, nextState.planId)),
      relativePathFromRoot(this.cwd, getPlanMarkdownPath(this.cwd, nextState.planId)),
      linkedTickets,
    );

    this.writeState(nextState);
    writeFileAtomic(getPlanPacketPath(this.cwd, nextState.planId), packet);
    writeFileAtomic(getPlanMarkdownPath(this.cwd, nextState.planId), plan);

    return {
      state: nextState,
      summary: summarizePlan(nextState, relativePlanDir),
      packet,
      plan,
      dashboard,
    };
  }

  private async materializeCanonical(state: PlanState): Promise<PlanReadResult> {
    const planDir = getPlanDir(this.cwd, state.planId);
    const relativePlanDir = relativePathFromRoot(this.cwd, planDir);
    const nextState = await this.deriveStateAsync(state);
    const linkedTickets = await this.resolveLinkedTicketsAsync(nextState);
    const context = await this.resolvePacketContextAsync(nextState);
    const constitutionSummary = context.constitution
      ? [
          `Project: ${context.constitution.state.title}`,
          `Strategic direction: ${excerpt(context.constitution.state.strategicDirectionSummary)}`,
          `Current focus: ${context.constitution.state.currentFocus.join("; ") || "none"}`,
          `Open constitutional questions: ${context.constitution.state.openConstitutionQuestions.join("; ") || "none"}`,
        ].join("\n")
      : "(none)";
    const linkedTicketSection =
      context.linkedTickets.length > 0
        ? context.linkedTickets
            .map(
              (ticket) =>
                `- ${ticket.ticketId} [${ticket.status}] ${ticket.title}${ticket.role ? ` — ${ticket.role}` : ""}`,
            )
            .join("\n")
        : "- (none linked yet)";
    const section = (title: string, body: string) => `## ${title}\n\n${body.trim() || "(none)"}`;
    const list = (values: string[], empty = "(none)") =>
      values.length > 0 ? values.map((value) => `- ${value}`).join("\n") : empty;
    const packet = `${[
      `# ${nextState.title} Planning Packet`,
      "",
      section("Planning Target", context.sourceSummary),
      section("Current Plan Summary", nextState.summary || nextState.purpose || "(empty)"),
      section(
        "Workplan Authoring Requirements",
        list([
          "Write `plan.md` as a fully self-contained novice-facing guide. Assume the reader only has the current working tree plus this packet and the rendered workplan.",
          "Keep the sections `Progress`, `Surprises & Discoveries`, `Decision Log`, `Outcomes & Retrospective`, and `Revision Notes` truthful and current as the work evolves.",
          "Use plain language, define repository-specific terms when they first appear, and describe observable validation instead of merely naming code changes.",
          "Keep Loom integration explicit through source refs, scope paths, linked tickets, and neighboring context, while leaving live ticket status and acceptance detail in the linked tickets themselves.",
        ]),
      ),
      section(
        "Planning Boundaries",
        list([
          "Keep `plan.md` deeply detailed at the execution-strategy layer; it should explain sequencing, rationale, risks, and validation without duplicating ticket-by-ticket live state.",
          "Use `pi-ticketing` to create, refine, or link tickets explicitly. Plans provide coordination context around those tickets, and linked tickets stay fully detailed and executable in their own right.",
          "Treat linked tickets as the live execution system of record for status, dependencies, verification, and checkpoints, and as self-contained units of work with their own acceptance criteria and execution context.",
          "Preserve truthful source refs, ticket roles, assumptions, risks, and validation intent so a fresh planner can resume from durable context.",
        ]),
      ),
      section("Linked Tickets", linkedTicketSection),
      section("Scope Paths", list(nextState.scopePaths)),
      section("Constitutional Context", constitutionSummary),
      section("Roadmap Items", list(context.roadmapItems)),
      section("Initiatives", list(context.initiatives)),
      section("Research", list(context.research)),
      section("Specs", list(context.specs)),
      section("Tickets", list(context.tickets)),
      section("Critiques", list(context.critiques)),
      section("Documentation", list(context.docs)),
    ]
      .join("\n\n")
      .trimEnd()}\n`;
    const plan = renderPlanMarkdown(nextState, linkedTickets);
    const dashboard = buildPlanDashboard(
      nextState,
      relativePlanDir,
      relativePathFromRoot(this.cwd, getPlanPacketPath(this.cwd, nextState.planId)),
      relativePathFromRoot(this.cwd, getPlanMarkdownPath(this.cwd, nextState.planId)),
      linkedTickets,
    );

    this.writeState(nextState);
    writeFileAtomic(getPlanPacketPath(this.cwd, nextState.planId), packet);
    writeFileAtomic(getPlanMarkdownPath(this.cwd, nextState.planId), plan);

    return {
      state: nextState,
      summary: summarizePlan(nextState, relativePlanDir),
      packet,
      plan,
      dashboard,
    };
  }

  private createDefaultState(input: CreatePlanInput, planId: string, timestamp: string): PlanState {
    const summary = summarizeText(
      input.summary || input.purpose || input.planOfWork || "",
      `Execution strategy for ${input.title.trim()}.`,
    );
    const sourceTarget = {
      kind: normalizePlanSourceTargetKind(input.sourceTarget.kind),
      ref: input.sourceTarget.ref.trim(),
    };
    return {
      planId,
      title: input.title.trim(),
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
      summary,
      purpose: input.purpose?.trim() ?? summary,
      contextAndOrientation: input.contextAndOrientation?.trim() ?? "",
      milestones: input.milestones?.trim() ?? "",
      planOfWork: input.planOfWork?.trim() ?? "",
      concreteSteps: input.concreteSteps?.trim() ?? "",
      validation: input.validation?.trim() ?? "",
      idempotenceAndRecovery: input.idempotenceAndRecovery?.trim() ?? "",
      artifactsAndNotes: input.artifactsAndNotes?.trim() ?? "",
      interfacesAndDependencies: input.interfacesAndDependencies?.trim() ?? "",
      risksAndQuestions: input.risksAndQuestions?.trim() ?? "",
      outcomesAndRetrospective: input.outcomesAndRetrospective?.trim() ?? "",
      scopePaths: normalizeStringList(input.scopePaths),
      sourceTarget,
      contextRefs: normalizeContextRefs(input.contextRefs),
      linkedTickets: [],
      progress:
        normalizeProgress(input.progress).length > 0
          ? normalizeProgress(input.progress)
          : [
              {
                timestamp,
                status: "pending",
                text: "Expand this durable workplan into a fully self-contained novice-facing guide before execution continues.",
              },
            ],
      discoveries: normalizeDiscoveries(input.discoveries),
      decisions: normalizeDecisions(input.decisions),
      revisionNotes: appendRevisionNote(
        [],
        createRevisionNote(
          `Created durable workplan scaffold from ${sourceTarget.kind}:${sourceTarget.ref}.`,
          "Establish a self-contained execution-strategy artifact that can be resumed without prior chat context.",
          timestamp,
        ),
        normalizeRevisionNotes(input.revisionNotes),
      ),
      packetSummary: "",
    };
  }

  private async persistCanonical(state: PlanState): Promise<PlanReadResult> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const existing = await findEntityByDisplayId(storage, identity.space.id, ENTITY_KIND, state.planId);
    const version = (existing?.version ?? 0) + 1;
    const record = await this.materializeCanonical(state);
    const entity = await upsertEntityByDisplayId(storage, {
      kind: ENTITY_KIND,
      spaceId: identity.space.id,
      owningRepositoryId: identity.repository.id,
      displayId: record.state.planId,
      title: record.state.title,
      summary: record.state.summary,
      status: record.state.status,
      version,
      tags: ["plan"],
      pathScopes: [
        { repositoryId: identity.repository.id, relativePath: record.summary.path, role: "canonical" },
        { repositoryId: identity.repository.id, relativePath: record.dashboard.packetPath, role: "projection" },
        { repositoryId: identity.repository.id, relativePath: record.dashboard.planPath, role: "projection" },
      ],
      attributes: { state: record.state },
      createdAt: existing?.createdAt ?? record.state.createdAt,
      updatedAt: record.state.updatedAt,
    });
    await upsertProjectionForEntity(
      storage,
      entity.id,
      "packet_markdown_projection",
      "repo_materialized",
      identity.repository.id,
      record.dashboard.packetPath,
      record.packet,
      version,
      record.state.createdAt,
      record.state.updatedAt,
    );
    await upsertProjectionForEntity(
      storage,
      entity.id,
      "plan_markdown_projection",
      "repo_materialized",
      identity.repository.id,
      record.dashboard.planPath,
      record.plan,
      version,
      record.state.createdAt,
      record.state.updatedAt,
    );
    return record;
  }

  private async loadCanonical(ref: string): Promise<PlanReadResult> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const planId = normalizePlanRef(ref);
    const entity = await findEntityByDisplayId(storage, identity.space.id, ENTITY_KIND, planId);
    if (!entity) {
      throw new Error(`Unknown plan: ${ref}`);
    }
    if (!hasStructuredPlanAttributes(entity.attributes)) {
      throw new Error(`Plan entity ${planId} is missing structured attributes`);
    }
    return this.materializeCanonical(entity.attributes.state);
  }

  listPlansProjection(filter: PlanListFilter = {}): ReturnType<PlanStore["listPlansProjectionRaw"]> {
    return this.listPlansProjectionRaw(filter);
  }

  private listPlansProjectionRaw(filter: PlanListFilter = {}) {
    return this.planDirectories()
      .map((directory) => {
        const state = this.readStateFromFiles(directory);
        return {
          state,
          summary: summarizePlan(state, relativePathFromRoot(this.cwd, directory)),
        };
      })
      .filter(({ state, summary }) => {
        if (filter.status && summary.status !== filter.status) {
          return false;
        }
        if (filter.sourceKind && summary.sourceKind !== filter.sourceKind) {
          return false;
        }
        if (filter.linkedTicketId) {
          const linkedTicketId = normalizeTicketId(filter.linkedTicketId);
          if (!state.linkedTickets.some((link) => link.ticketId === linkedTicketId)) {
            return false;
          }
        }
        if (!filter.text) {
          return true;
        }
        const text = filter.text.toLowerCase();
        return [summary.id, summary.title, summary.summary, summary.sourceRef, summary.sourceKind]
          .join(" ")
          .toLowerCase()
          .includes(text);
      })
      .map(({ summary }) => summary);
  }

  async listPlans(filter: PlanListFilter = {}) {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const summaries: PlanReadResult["summary"][] = [];
    for (const entity of await storage.listEntities(identity.space.id, ENTITY_KIND)) {
      if (hasStructuredPlanAttributes(entity.attributes)) {
        summaries.push(summarizePlan(entity.attributes.state, `.loom/plans/${entity.attributes.state.planId}`));
        continue;
      }
      throw new Error(`Plan entity ${entity.displayId} is missing structured attributes`);
    }
    return summaries.filter((summary) => {
      if (filter.status && summary.status !== filter.status) {
        return false;
      }
      if (filter.sourceKind && summary.sourceKind !== filter.sourceKind) {
        return false;
      }
      if (!filter.text) {
        return true;
      }
      const text = filter.text.toLowerCase();
      return [summary.id, summary.title, summary.summary, summary.sourceRef, summary.sourceKind]
        .join(" ")
        .toLowerCase()
        .includes(text);
    });
  }

  readPlanProjection(ref: string): PlanReadResult {
    const planDir = this.resolvePlanDirectory(ref);
    const state = this.readStateFromFiles(planDir);
    return this.materialize(state);
  }

  async readPlan(ref: string): Promise<PlanReadResult> {
    await this.initLedger();
    return this.loadCanonical(ref);
  }

  async createPlan(input: CreatePlanInput): Promise<PlanReadResult> {
    await this.initLedger();
    const timestamp = currentTimestamp();
    const planId = this.nextPlanId(input.title);
    ensureDir(getPlanDir(this.cwd, planId));
    return this.persistCanonical(this.createDefaultState(input, planId, timestamp));
  }

  async updatePlan(ref: string, input: UpdatePlanInput): Promise<PlanReadResult> {
    const current = await this.readPlan(ref);
    const changedFields = [
      input.title !== undefined ? "title" : null,
      input.status !== undefined ? "status" : null,
      input.summary !== undefined ? "summary" : null,
      input.purpose !== undefined ? "purpose" : null,
      input.contextAndOrientation !== undefined ? "context and orientation" : null,
      input.milestones !== undefined ? "milestones" : null,
      input.planOfWork !== undefined ? "plan of work" : null,
      input.concreteSteps !== undefined ? "concrete steps" : null,
      input.validation !== undefined ? "validation" : null,
      input.idempotenceAndRecovery !== undefined ? "idempotence and recovery" : null,
      input.artifactsAndNotes !== undefined ? "artifacts and notes" : null,
      input.interfacesAndDependencies !== undefined ? "interfaces and dependencies" : null,
      input.risksAndQuestions !== undefined ? "risks and open questions" : null,
      input.outcomesAndRetrospective !== undefined ? "outcomes and retrospective" : null,
      input.scopePaths !== undefined ? "scope paths" : null,
      input.sourceTarget !== undefined ? "source target" : null,
      input.contextRefs !== undefined ? "context refs" : null,
      input.progress !== undefined ? "progress" : null,
      input.discoveries !== undefined ? "surprises and discoveries" : null,
      input.decisions !== undefined ? "decision log" : null,
      input.revisionNotes !== undefined ? "revision notes" : null,
    ].filter((value): value is string => value !== null);
    const revisionAdditions = normalizeRevisionNotes(input.revisionNotes);
    const revisionNote = createRevisionNote(
      changedFields.length > 0
        ? `Updated ${changedFields.join(", ")}.`
        : "Regenerated the durable workplan without field-level changes.",
      "Keep the workplan synchronized with the current execution strategy and observable validation story.",
    );
    const nextState: PlanState = {
      ...current.state,
      title: input.title?.trim() ?? current.state.title,
      status: input.status ? normalizePlanStatus(input.status) : current.state.status,
      summary:
        input.summary !== undefined
          ? summarizeText(input.summary, current.state.summary || `Execution strategy for ${current.state.title}.`)
          : current.state.summary,
      purpose: input.purpose?.trim() ?? current.state.purpose,
      contextAndOrientation: input.contextAndOrientation?.trim() ?? current.state.contextAndOrientation,
      milestones: input.milestones?.trim() ?? current.state.milestones,
      planOfWork: input.planOfWork?.trim() ?? current.state.planOfWork,
      concreteSteps: input.concreteSteps?.trim() ?? current.state.concreteSteps,
      validation: input.validation?.trim() ?? current.state.validation,
      idempotenceAndRecovery: input.idempotenceAndRecovery?.trim() ?? current.state.idempotenceAndRecovery,
      artifactsAndNotes: input.artifactsAndNotes?.trim() ?? current.state.artifactsAndNotes,
      interfacesAndDependencies: input.interfacesAndDependencies?.trim() ?? current.state.interfacesAndDependencies,
      risksAndQuestions: input.risksAndQuestions?.trim() ?? current.state.risksAndQuestions,
      outcomesAndRetrospective: input.outcomesAndRetrospective?.trim() ?? current.state.outcomesAndRetrospective,
      scopePaths: input.scopePaths ? normalizeStringList(input.scopePaths) : current.state.scopePaths,
      sourceTarget: input.sourceTarget
        ? {
            kind: normalizePlanSourceTargetKind(input.sourceTarget.kind),
            ref: input.sourceTarget.ref.trim(),
          }
        : current.state.sourceTarget,
      contextRefs: input.contextRefs
        ? mergeContextRefs(current.state.contextRefs, input.contextRefs)
        : current.state.contextRefs,
      progress: input.progress ? normalizeProgress(input.progress) : current.state.progress,
      discoveries: input.discoveries ? normalizeDiscoveries(input.discoveries) : current.state.discoveries,
      decisions: input.decisions ? normalizeDecisions(input.decisions) : current.state.decisions,
      revisionNotes: appendRevisionNote(current.state.revisionNotes, revisionNote, revisionAdditions),
      updatedAt: currentTimestamp(),
    };
    return this.persistCanonical(nextState);
  }

  async linkPlanTicket(ref: string, input: LinkPlanTicketInput): Promise<PlanReadResult> {
    const current = await this.readPlan(ref);
    const ticketStore = createTicketStore(this.cwd);
    const ticket = await ticketStore.readTicketAsync(input.ticketId);
    const ticketId = ticket.summary.id;
    const existing = current.state.linkedTickets.find((link) => link.ticketId === ticketId);
    const otherLinks = current.state.linkedTickets.filter((link) => link.ticketId !== ticketId);
    const maxOrder = otherLinks.reduce((max, link) => Math.max(max, link.order), 0);
    const nextLinks = normalizePlanTicketLinks([
      ...otherLinks,
      {
        ticketId,
        role: input.role ?? existing?.role ?? null,
        order: input.order ?? existing?.order ?? maxOrder + 1,
      },
    ]);

    const externalRef = `plan:${current.state.planId}`;
    if (!ticket.ticket.frontmatter["external-refs"].includes(externalRef)) {
      await ticketStore.addExternalRefAsync(ticketId, externalRef);
    }

    return this.persistCanonical({
      ...current.state,
      linkedTickets: nextLinks,
      revisionNotes: appendRevisionNote(
        current.state.revisionNotes,
        createRevisionNote(
          `Linked ticket ${ticketId}${input.role ? ` as ${input.role}` : ""}.`,
          "Keep the Loom workplan coordinated with the ticket ledger without copying live execution state into plan.md.",
        ),
      ),
      updatedAt: currentTimestamp(),
    });
  }

  async unlinkPlanTicket(ref: string, ticketRef: string): Promise<PlanReadResult> {
    const current = await this.readPlan(ref);
    const ticketId = (await createTicketStore(this.cwd).readTicketAsync(ticketRef)).summary.id;
    return this.persistCanonical({
      ...current.state,
      linkedTickets: current.state.linkedTickets.filter((link) => link.ticketId !== ticketId),
      revisionNotes: appendRevisionNote(
        current.state.revisionNotes,
        createRevisionNote(
          `Removed ticket ${ticketId} from active plan membership.`,
          "Reflect the current execution slice while preserving historical provenance on the ticket itself.",
        ),
      ),
      updatedAt: currentTimestamp(),
    });
  }

  async archivePlan(ref: string): Promise<PlanReadResult> {
    const current = await this.readPlan(ref);
    return this.persistCanonical({
      ...current.state,
      status: "archived",
      revisionNotes: appendRevisionNote(
        current.state.revisionNotes,
        createRevisionNote(
          "Archived the workplan.",
          "The execution strategy reached a resting point and should remain queryable without appearing active.",
        ),
      ),
      updatedAt: currentTimestamp(),
    });
  }
}

export function createPlanStore(cwd: string): PlanStore {
  return new PlanStore(cwd);
}
