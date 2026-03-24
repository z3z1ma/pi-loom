import { resolve } from "node:path";
import type { ConstitutionalRecord } from "#constitution/domain/models.js";
import type { CritiqueReadResult } from "#critique/domain/models.js";
import { createCritiqueStore } from "#critique/domain/store.js";
import type { DocumentationReadResult } from "#docs/domain/models.js";
import { createDocumentationStore } from "#docs/domain/store.js";
import type { InitiativeRecord } from "#initiatives/domain/models.js";
import type { ResearchRecord } from "#research/domain/models.js";
import type { SpecChangeRecord } from "#specs/domain/models.js";
import type { LoomCanonicalStorage, LoomRepositoryRecord } from "#storage/contract.js";
import { findEntityByDisplayId, upsertEntityByDisplayIdWithLifecycleEvents } from "#storage/entities.js";
import type { ProjectedEntityLinkInput } from "#storage/links.js";
import { assertProjectedEntityLinksResolvable, syncProjectedEntityLinks } from "#storage/links.js";
import { filterAndSortListEntries } from "#storage/list-search.js";
import { getLoomCatalogPaths } from "#storage/locations.js";
import {
  type LoomPortableRepositoryPathFallback,
  normalizeStoredPortableRepositoryPathList,
  renderPortableRepositoryPathList,
  resolvePortableRepositoryPathInputs,
} from "#storage/repository-path.js";
import { resolveRepositoryQualifier } from "#storage/repository-qualifier.js";
import {
  type LoomExplicitScopeInput,
  openRepositoryWorkspaceStorage,
  openScopedWorkspaceStorage,
} from "#storage/workspace.js";
import type { TicketReadResult } from "#ticketing/domain/models.js";
import { createTicketStore } from "#ticketing/domain/store.js";
import { buildPlanDashboard, getPlanTicketRef, summarizePlan } from "./dashboard.js";
import type {
  CreatePlanInput,
  LinkPlanTicketInput,
  PlanContextRefs,
  PlanContextRefsUpdate,
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
  normalizePlanRef,
  normalizePlanSourceTargetKind,
  normalizePlanStatus,
  normalizePlanTicketLinks,
  normalizeProgress,
  normalizeRevisionNotes,
  normalizeStringList,
  slugifyTitle,
  summarizeText,
} from "./normalize.js";
import { renderPlanMarkdown } from "./render.js";

const ENTITY_KIND = "plan" as const;
const PLAN_PROJECTION_OWNER = "plan-store" as const;

interface PlanEntityAttributes {
  state: PlanState;
}

function hasStructuredPlanAttributes(attributes: unknown): attributes is PlanEntityAttributes {
  return Boolean(attributes && typeof attributes === "object" && "state" in attributes);
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

function applyContextRefsUpdate(current: PlanContextRefs, update: PlanContextRefsUpdate | undefined): PlanContextRefs {
  if (!update) {
    return normalizeContextRefs(current);
  }

  const replaced = normalizeContextRefs({
    roadmapItemIds: update.replace?.roadmapItemIds ?? current.roadmapItemIds,
    initiativeIds: update.replace?.initiativeIds ?? current.initiativeIds,
    researchIds: update.replace?.researchIds ?? current.researchIds,
    specChangeIds: update.replace?.specChangeIds ?? current.specChangeIds,
    ticketIds: update.replace?.ticketIds ?? current.ticketIds,
    critiqueIds: update.replace?.critiqueIds ?? current.critiqueIds,
    docIds: update.replace?.docIds ?? current.docIds,
  });

  const roadmapRemovals = new Set(normalizeStringList(update.remove?.roadmapItemIds));
  const initiativeRemovals = new Set(normalizeStringList(update.remove?.initiativeIds));
  const researchRemovals = new Set(normalizeStringList(update.remove?.researchIds));
  const specRemovals = new Set(normalizeStringList(update.remove?.specChangeIds));
  const ticketRemovals = new Set(normalizeStringList(update.remove?.ticketIds));
  const critiqueRemovals = new Set(normalizeStringList(update.remove?.critiqueIds));
  const docRemovals = new Set(normalizeStringList(update.remove?.docIds));

  return normalizeContextRefs({
    roadmapItemIds: replaced.roadmapItemIds.filter((value) => !roadmapRemovals.has(value)),
    initiativeIds: replaced.initiativeIds.filter((value) => !initiativeRemovals.has(value)),
    researchIds: replaced.researchIds.filter((value) => !researchRemovals.has(value)),
    specChangeIds: replaced.specChangeIds.filter((value) => !specRemovals.has(value)),
    ticketIds: replaced.ticketIds.filter((value) => !ticketRemovals.has(value)),
    critiqueIds: replaced.critiqueIds.filter((value) => !critiqueRemovals.has(value)),
    docIds: replaced.docIds.filter((value) => !docRemovals.has(value)),
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
    ticketIds: [ticket.summary.id],
  });
}

function deriveContextRefsFromSpec(change: SpecChangeRecord): PlanContextRefs {
  return mergeContextRefs({
    initiativeIds: change.state.initiativeIds,
    researchIds: change.state.researchIds,
    specChangeIds: [change.state.changeId],
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

function sourceTargetEntityKind(
  sourceTarget: PlanState["sourceTarget"],
): ProjectedEntityLinkInput["targetKind"] | null {
  switch (sourceTarget.kind) {
    case "initiative":
      return "initiative";
    case "spec":
      return "spec_change";
    case "research":
      return "research";
    case "workspace":
      return null;
  }
}

function projectedLinksForPlan(state: PlanState): ProjectedEntityLinkInput[] {
  const desired: ProjectedEntityLinkInput[] = [];
  const sourceTargetKind = sourceTargetEntityKind(state.sourceTarget);

  if (sourceTargetKind) {
    desired.push({ kind: "belongs_to", targetKind: sourceTargetKind, targetDisplayId: state.sourceTarget.ref });
  }

  // Linked tickets are active plan membership; context tickets remain loose references.
  for (const ticketId of normalizeStringList(state.linkedTickets.map((link) => link.ticketId))) {
    desired.push({ kind: "belongs_to", targetKind: "ticket", targetDisplayId: ticketId });
  }

  for (const ticketId of normalizeStringList(state.contextRefs.ticketIds)) {
    if (state.linkedTickets.some((link) => link.ticketId === ticketId)) {
      continue;
    }
    desired.push({ kind: "references", targetKind: "ticket", targetDisplayId: ticketId });
  }

  for (const initiativeId of state.contextRefs.initiativeIds) {
    if (sourceTargetKind === "initiative" && initiativeId === state.sourceTarget.ref) {
      continue;
    }
    desired.push({ kind: "references", targetKind: "initiative", targetDisplayId: initiativeId });
  }

  for (const researchId of state.contextRefs.researchIds) {
    if (sourceTargetKind === "research" && researchId === state.sourceTarget.ref) {
      continue;
    }
    desired.push({ kind: "references", targetKind: "research", targetDisplayId: researchId });
  }

  for (const specChangeId of state.contextRefs.specChangeIds) {
    if (sourceTargetKind === "spec_change" && specChangeId === state.sourceTarget.ref) {
      continue;
    }
    desired.push({ kind: "references", targetKind: "spec_change", targetDisplayId: specChangeId });
  }

  for (const critiqueId of state.contextRefs.critiqueIds) {
    desired.push({ kind: "references", targetKind: "critique", targetDisplayId: critiqueId });
  }

  for (const docId of state.contextRefs.docIds) {
    desired.push({ kind: "references", targetKind: "documentation", targetDisplayId: docId });
  }

  return desired;
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
  readonly scope: Required<LoomExplicitScopeInput>;

  constructor(cwd: string, scope: LoomExplicitScopeInput = {}) {
    this.cwd = resolve(cwd);
    this.scope = {
      spaceId: scope.spaceId ?? null,
      repositoryId: scope.repositoryId ?? null,
      worktreeId: scope.worktreeId ?? null,
    };
  }

  async initLedger(): Promise<{ initialized: true; root: string }> {
    return { initialized: true, root: getLoomCatalogPaths().catalogPath };
  }

  private async openWorkspaceStorage() {
    return openScopedWorkspaceStorage(this.cwd, this.scope);
  }

  private async openRepositoryWorkspaceStorage() {
    return openRepositoryWorkspaceStorage(this.cwd, this.scope);
  }

  private persistenceScopeForState(state: PlanState): Required<LoomExplicitScopeInput> {
    if (this.scope.repositoryId || this.scope.worktreeId) {
      return {
        spaceId: this.scope.spaceId ?? null,
        repositoryId: this.scope.repositoryId ?? null,
        worktreeId: this.scope.worktreeId ?? null,
      };
    }

    const uniqueScopes = new Map<string, { repositoryId: string; worktreeId: string | null }>();
    for (const entry of state.scopePaths) {
      uniqueScopes.set(`${entry.repositoryId}:${entry.worktreeId ?? "(none)"}`, {
        repositoryId: entry.repositoryId,
        worktreeId: entry.worktreeId,
      });
    }
    if (uniqueScopes.size === 1) {
      const inferredScope = [...uniqueScopes.values()][0];
      return {
        spaceId: this.scope.spaceId ?? null,
        repositoryId: inferredScope?.repositoryId ?? null,
        worktreeId: inferredScope?.worktreeId ?? null,
      };
    }
    if (uniqueScopes.size > 1) {
      throw new Error(
        "Plan scope paths span multiple repository/worktree scopes; persist the plan from one explicit repository scope.",
      );
    }

    return {
      spaceId: this.scope.spaceId ?? null,
      repositoryId: this.scope.repositoryId ?? null,
      worktreeId: this.scope.worktreeId ?? null,
    };
  }

  private async nextPlanId(baseTitle: string): Promise<string> {
    const { storage, identity } = await this.openWorkspaceStorage();
    const baseId = slugifyTitle(baseTitle);
    const existing = new Set(
      (await storage.listEntities(identity.space.id, ENTITY_KIND)).map((entity) => entity.displayId),
    );
    if (!existing.has(baseId)) {
      return baseId;
    }
    let attempt = 2;
    while (existing.has(`${baseId}-${attempt}`)) {
      attempt += 1;
    }
    return `${baseId}-${attempt}`;
  }

  private async readConstitutionIfPresentAsync(): Promise<ConstitutionalRecord | null> {
    try {
      const { storage, identity } = await this.openWorkspaceStorage();
      const entity = await findEntityByDisplayId(storage, identity.space.id, "constitution", "constitution");
      if (!entity) {
        return null;
      }
      return { state: (entity.attributes as { state: ConstitutionalRecord["state"] }).state } as ConstitutionalRecord;
    } catch {
      return null;
    }
  }

  private async safeReadInitiativeAsync(id: string): Promise<InitiativeRecord | null> {
    try {
      const { storage, identity } = await this.openWorkspaceStorage();
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
          path: `initiative:${entity.displayId}`,
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

  private async safeReadResearchAsync(id: string): Promise<ResearchRecord | null> {
    try {
      const { storage, identity } = await this.openWorkspaceStorage();
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
          path: `research:${entity.displayId}`,
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

  private async safeReadSpecAsync(id: string): Promise<SpecChangeRecord | null> {
    try {
      const { storage, identity } = await this.openWorkspaceStorage();
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
          path: `spec:${entity.displayId}`,
          initiativeIds: attributes.state.initiativeIds,
          researchIds: attributes.state.researchIds,
        },
      } as unknown as SpecChangeRecord;
    } catch {
      return null;
    }
  }

  private async safeReadTicketAsync(id: string): Promise<TicketReadResult | null> {
    try {
      const { storage, identity } = await this.openWorkspaceStorage();
      const entity = await findEntityByDisplayId(storage, identity.space.id, "ticket", id);
      if (!entity) {
        return null;
      }
      return (entity.attributes as { record: TicketReadResult }).record;
    } catch {
      return null;
    }
  }

  private async safeReadCritiqueAsync(id: string): Promise<CritiqueReadResult | null> {
    try {
      return await createCritiqueStore(this.cwd).readCritiqueAsync(id);
    } catch {
      return null;
    }
  }

  private async safeReadDocAsync(id: string): Promise<DocumentationReadResult | null> {
    try {
      return await createDocumentationStore(this.cwd).readDoc(id);
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
            `Capabilities: ${change.state.capabilities.length}`,
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
            ref: getPlanTicketRef(link.ticketId),
          };
        }
        return {
          ticketId: link.ticketId,
          role: link.role,
          order: link.order,
          status: ticket.summary.status,
          title: ticket.summary.title,
          ref: getPlanTicketRef(ticket.summary.id),
        };
      }),
    );
    return tickets;
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
          `${record.state.changeId} [${record.state.status}] ${record.state.title} — reqs=${record.state.requirements.length} caps=${record.state.capabilities.length}`,
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

  private async deriveStateAsync(state: PlanState): Promise<PlanState> {
    const context = await this.resolvePacketContextAsync(state);
    return {
      ...state,
      packetSummary: context.packetSummary,
    };
  }

  private portablePathFallback(
    repositories: readonly LoomRepositoryRecord[],
    repositoryId: string | null,
    worktreeId: string | null,
  ): LoomPortableRepositoryPathFallback | null {
    if (!repositoryId) {
      return null;
    }
    const repository = repositories.find((entry) => entry.id === repositoryId);
    if (!repository) {
      return null;
    }
    return {
      repositoryId: repository.id,
      repositorySlug: repository.slug,
      worktreeId,
    };
  }

  private normalizeStoredState(state: PlanState, fallback?: LoomPortableRepositoryPathFallback | null): PlanState {
    return {
      ...state,
      scopePaths: normalizeStoredPortableRepositoryPathList(state.scopePaths, fallback),
    };
  }

  private async materializeCanonical(
    state: PlanState,
    repositoryId: string | null = null,
    repositories?: Awaited<ReturnType<typeof openScopedWorkspaceStorage>>["identity"]["repositories"],
  ): Promise<PlanReadResult> {
    const availableRepositories = repositories ?? (await this.openWorkspaceStorage()).identity.repositories;
    const normalizedState = this.normalizeStoredState(
      state,
      this.portablePathFallback(availableRepositories, repositoryId, null),
    );
    const nextState = await this.deriveStateAsync(normalizedState);
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
    const list = (values: readonly string[], empty = "(none)") =>
      values.length > 0 ? values.map((value) => `- ${value}`).join("\n") : empty;
    const scopePaths = renderPortableRepositoryPathList(nextState.scopePaths);
    const packet = `${[
      `# ${nextState.title} Planning Packet`,
      "",
      section("Planning Target", context.sourceSummary),
      section("Current Plan Summary", nextState.summary || nextState.purpose || "(empty)"),
      section(
        "Workplan Authoring Requirements",
        list([
          "Write the plan markdown as a fully self-contained novice-facing guide. Assume the reader only has the current working tree plus this packet and the rendered workplan.",
          "Keep the sections `Progress`, `Surprises & Discoveries`, `Decision Log`, `Outcomes & Retrospective`, and `Revision Notes` truthful and current as the work evolves.",
          "Use plain language, define repository-specific terms when they first appear, and describe observable validation instead of merely naming code changes.",
          "Keep Loom integration explicit through source refs, scope paths, linked tickets, and neighboring context, while leaving live ticket status and acceptance detail in the linked tickets themselves.",
        ]),
      ),
      section(
        "Planning Boundaries",
        list([
          "Keep the plan markdown deeply detailed at the execution-strategy layer; it should explain sequencing, rationale, risks, and validation without duplicating ticket-by-ticket live state.",
          "Use `pi-ticketing` to create, refine, or link tickets explicitly. Plans provide coordination context around those tickets, and linked tickets stay fully detailed and executable in their own right.",
          "Treat linked tickets as the live execution system of record for status, dependencies, verification, and checkpoints, and as self-contained units of work with their own acceptance criteria and execution context.",
          "Preserve truthful source refs, ticket roles, assumptions, risks, and validation intent so a fresh planner can resume from durable context.",
        ]),
      ),
      section("Linked Tickets", linkedTicketSection),
      section("Scope Paths", list(scopePaths)),
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
    const repository = resolveRepositoryQualifier(availableRepositories, repositoryId);
    const dashboard = buildPlanDashboard(nextState, linkedTickets, repository);

    return {
      state: nextState,
      summary: summarizePlan(nextState, repository),
      packet,
      plan,
      dashboard,
    };
  }

  private async createDefaultState(input: CreatePlanInput, planId: string, timestamp: string): Promise<PlanState> {
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
      scopePaths: await resolvePortableRepositoryPathInputs(this.cwd, input.scopePaths, this.scope),
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
    const { storage, identity } = await openRepositoryWorkspaceStorage(this.cwd, this.persistenceScopeForState(state));
    return storage.transact((tx) => this.persistCanonicalWithStorage(tx, identity, state));
  }

  private async persistCanonicalWithStorage(
    storage: LoomCanonicalStorage,
    identity: Awaited<ReturnType<typeof openRepositoryWorkspaceStorage>>["identity"],
    state: PlanState,
  ): Promise<PlanReadResult> {
    const existing = await findEntityByDisplayId(storage, identity.space.id, ENTITY_KIND, state.planId);
    const version = (existing?.version ?? 0) + 1;
    const record = await this.materializeCanonical(state, identity.repository.id, [identity.repository]);
    await assertProjectedEntityLinksResolvable({
      storage,
      spaceId: identity.space.id,
      projectionOwner: PLAN_PROJECTION_OWNER,
      desired: projectedLinksForPlan(record.state),
    });
    const { entity } = await upsertEntityByDisplayIdWithLifecycleEvents(
      storage,
      {
        kind: ENTITY_KIND,
        spaceId: identity.space.id,
        owningRepositoryId: identity.repository.id,
        displayId: record.state.planId,
        title: record.state.title,
        summary: record.state.summary,
        status: record.state.status,
        version,
        tags: ["plan"],
        attributes: { state: record.state },
        createdAt: existing?.createdAt ?? record.state.createdAt,
        updatedAt: record.state.updatedAt,
      },
      {
        actor: "plan-store",
        createdPayload: { change: "plan_persisted" },
        updatedPayload: { change: "plan_persisted" },
      },
    );
    await syncProjectedEntityLinks({
      storage,
      spaceId: identity.space.id,
      fromEntityId: entity.id,
      projectionOwner: PLAN_PROJECTION_OWNER,
      desired: projectedLinksForPlan(record.state),
      timestamp: record.state.updatedAt,
    });
    return record;
  }

  private async loadCanonical(ref: string): Promise<PlanReadResult> {
    const { storage, identity } = await this.openWorkspaceStorage();
    const planId = normalizePlanRef(ref);
    const entity = await findEntityByDisplayId(storage, identity.space.id, ENTITY_KIND, planId);
    if (!entity) {
      throw new Error(`Unknown plan: ${ref}`);
    }
    if (!hasStructuredPlanAttributes(entity.attributes)) {
      throw new Error(`Plan entity ${planId} is missing structured attributes`);
    }
    return this.materializeCanonical(entity.attributes.state, entity.owningRepositoryId, identity.repositories);
  }

  async listPlans(filter: PlanListFilter = {}) {
    const { storage, identity } = await this.openWorkspaceStorage();
    const summaries: Array<{ summary: PlanReadResult["summary"]; state: PlanState }> = [];
    for (const entity of await storage.listEntities(identity.space.id, ENTITY_KIND)) {
      if (hasStructuredPlanAttributes(entity.attributes)) {
        const state = this.normalizeStoredState(
          entity.attributes.state,
          this.portablePathFallback(identity.repositories, entity.owningRepositoryId, null),
        );
        summaries.push({
          summary: summarizePlan(state, resolveRepositoryQualifier(identity.repositories, entity.owningRepositoryId)),
          state,
        });
        continue;
      }
      throw new Error(`Plan entity ${entity.displayId} is missing structured attributes`);
    }
    return filterAndSortListEntries(
      summaries
        .filter(({ summary, state }) => {
          if (filter.status && summary.status !== filter.status) {
            return false;
          }
          if (filter.repositoryId && summary.repository?.id !== filter.repositoryId) {
            return false;
          }
          if (filter.sourceKind && summary.sourceKind !== filter.sourceKind) {
            return false;
          }
          if (filter.linkedTicketId) {
            const linkedTicketId = filter.linkedTicketId.trim();
            if (!state.linkedTickets.some((link) => link.ticketId === linkedTicketId)) {
              return false;
            }
          }
          return true;
        })
        .map(({ summary, state }) => ({
          item: summary,
          id: summary.id,
          createdAt: state.createdAt,
          updatedAt: summary.updatedAt,
          fields: [
            { value: summary.id, weight: 10 },
            { value: summary.repository?.id ?? "", weight: 7 },
            { value: summary.repository?.slug ?? "", weight: 7 },
            { value: summary.repository?.displayName ?? "", weight: 7 },
            { value: summary.title, weight: 10 },
            { value: summary.summary, weight: 8 },
            { value: summary.sourceRef, weight: 7 },
            { value: summary.sourceKind, weight: 6 },
            { value: renderPortableRepositoryPathList(state.scopePaths).join(" "), weight: 6 },
            { value: state.linkedTickets.map((link) => `${link.ticketId} ${link.role ?? ""}`).join(" "), weight: 6 },
            { value: state.sourceTarget.ref, weight: 7 },
            { value: state.sourceTarget.kind, weight: 5 },
            { value: state.contextRefs.roadmapItemIds.join(" "), weight: 4 },
            { value: state.contextRefs.initiativeIds.join(" "), weight: 5 },
            { value: state.contextRefs.researchIds.join(" "), weight: 5 },
            { value: state.contextRefs.specChangeIds.join(" "), weight: 5 },
            { value: state.contextRefs.ticketIds.join(" "), weight: 4 },
            { value: state.contextRefs.critiqueIds.join(" "), weight: 3 },
            { value: state.contextRefs.docIds.join(" "), weight: 3 },
            { value: state.purpose, weight: 6 },
            { value: state.contextAndOrientation, weight: 5 },
            { value: state.milestones, weight: 5 },
            { value: state.planOfWork, weight: 6 },
            { value: state.concreteSteps, weight: 5 },
            { value: state.validation, weight: 4 },
            { value: state.idempotenceAndRecovery, weight: 4 },
            { value: state.artifactsAndNotes, weight: 4 },
            { value: state.interfacesAndDependencies, weight: 4 },
            { value: state.risksAndQuestions, weight: 4 },
            { value: state.outcomesAndRetrospective, weight: 4 },
            { value: state.packetSummary, weight: 5 },
            { value: state.progress.map((entry) => `${entry.status} ${entry.text}`).join(" "), weight: 3 },
            { value: state.discoveries.map((entry) => `${entry.note} ${entry.evidence}`).join(" "), weight: 3 },
            {
              value: state.decisions.map((entry) => `${entry.decision} ${entry.rationale} ${entry.author}`).join(" "),
              weight: 3,
            },
            { value: state.revisionNotes.map((entry) => `${entry.change} ${entry.reason}`).join(" "), weight: 2 },
          ],
        })),
      { text: filter.text, sort: filter.sort },
    );
  }

  async readPlan(ref: string): Promise<PlanReadResult> {
    await this.initLedger();
    return this.loadCanonical(ref);
  }

  async createPlan(input: CreatePlanInput): Promise<PlanReadResult> {
    await this.initLedger();
    const timestamp = currentTimestamp();
    const planId = await this.nextPlanId(input.title);
    return this.persistCanonical(await this.createDefaultState(input, planId, timestamp));
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
      "Keep the workplan aligned with the current execution strategy and observable validation story.",
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
      scopePaths: input.scopePaths
        ? await resolvePortableRepositoryPathInputs(this.cwd, input.scopePaths, this.scope)
        : current.state.scopePaths,
      sourceTarget: input.sourceTarget
        ? {
            kind: normalizePlanSourceTargetKind(input.sourceTarget.kind),
            ref: input.sourceTarget.ref.trim(),
          }
        : current.state.sourceTarget,
      contextRefs: applyContextRefsUpdate(current.state.contextRefs, input.contextRefs),
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
    const ticketId = ticketStore.resolveTicketRef(input.ticketId);
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

    const nextState: PlanState = {
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
    };
    const { storage, identity } = await this.openRepositoryWorkspaceStorage();
    await assertProjectedEntityLinksResolvable({
      storage,
      spaceId: identity.space.id,
      projectionOwner: PLAN_PROJECTION_OWNER,
      desired: projectedLinksForPlan(nextState),
    });
    const externalRef = `plan:${current.state.planId}`;
    return storage.transact(async (tx) => {
      const persisted = await this.persistCanonicalWithStorage(tx, identity, nextState);
      await ticketStore.syncExternalRefWithStorage(tx, identity, ticketId, externalRef, true);
      return persisted;
    });
  }

  async unlinkPlanTicket(ref: string, ticketRef: string): Promise<PlanReadResult> {
    const current = await this.readPlan(ref);
    const ticketStore = createTicketStore(this.cwd);
    let ticketId: string;
    let ticketClosed = false;
    try {
      const ticket = await ticketStore.readTicketAsync(ticketRef);
      ticketId = ticket.summary.id;
      ticketClosed = ticket.ticket.closed;
    } catch {
      ticketId = ticketStore.resolveTicketRef(ticketRef);
    }
    const nextState: PlanState = {
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
    };
    const { storage, identity } = await this.openRepositoryWorkspaceStorage();
    await assertProjectedEntityLinksResolvable({
      storage,
      spaceId: identity.space.id,
      projectionOwner: PLAN_PROJECTION_OWNER,
      desired: projectedLinksForPlan(nextState),
    });
    const externalRef = `plan:${current.state.planId}`;
    return storage.transact(async (tx) => {
      const persisted = await this.persistCanonicalWithStorage(tx, identity, nextState);
      if (!ticketClosed) {
        await ticketStore.syncExternalRefWithStorage(tx, identity, ticketId, externalRef, false, {
          allowClosed: true,
        });
      }
      return persisted;
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

export function createPlanStore(cwd: string, scope: LoomExplicitScopeInput = {}): PlanStore {
  return new PlanStore(cwd, scope);
}
