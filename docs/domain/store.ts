import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type { ConstitutionalRecord } from "#constitution/domain/models.js";
import { createConstitutionalStore } from "#constitution/domain/store.js";
import type { CritiqueReadResult } from "#critique/domain/models.js";
import { createCritiqueStore } from "#critique/domain/store.js";
import type { InitiativeRecord } from "#initiatives/domain/models.js";
import { createInitiativeStore } from "#initiatives/domain/store.js";
import type { ResearchRecord } from "#research/domain/models.js";
import { createResearchStore } from "#research/domain/store.js";
import type { SpecChangeRecord } from "#specs/domain/models.js";
import { createSpecStore } from "#specs/domain/store.js";
import type { LoomEntityKind, LoomEntityRecord, LoomRepositoryRecord } from "#storage/contract.js";
import {
  appendEntityEvent,
  findEntityByDisplayId,
  upsertEntityByDisplayIdWithLifecycleEvents,
} from "#storage/entities.js";
import type { ProjectedEntityLinkInput } from "#storage/links.js";
import { syncProjectedEntityLinks } from "#storage/links.js";
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
import { buildDocumentationDashboard, getDocumentationDocumentRef, summarizeDocumentation } from "./dashboard.js";
import { parseMarkdownArtifact, renderBulletList, renderSection, serializeMarkdownArtifact } from "./frontmatter.js";
import type {
  CreateDocumentationInput,
  DocsContextRefs,
  DocumentationCanonicalSnapshot,
  DocumentationEntityAttributes,
  DocumentationListFilter,
  DocumentationPersistedEventPayload,
  DocumentationReadResult,
  DocumentationRevisionRecord,
  DocumentationRevisionRecordedEventPayload,
  DocumentationState,
  UpdateDocumentationInput,
} from "./models.js";
import {
  currentTimestamp,
  extractMarkdownSections,
  nextSequenceId,
  normalizeAudience,
  normalizeContextRefs,
  normalizeDocId,
  normalizeDocRef,
  normalizeDocStatus,
  normalizeDocType,
  normalizeOptionalString,
  normalizeSectionGroup,
  normalizeSourceTargetKind,
  normalizeStringList,
  sectionGroupForDocType,
  slugifyTitle,
  summarizeDocument,
} from "./normalize.js";
import { renderDocumentationMarkdown } from "./render.js";

const ENTITY_KIND = "documentation" as const;
const DOCUMENTATION_LINK_PROJECTION_OWNER = "documentation-store" as const;

function hasStructuredDocumentationAttributes(attributes: unknown): attributes is DocumentationEntityAttributes {
  return Boolean(attributes && typeof attributes === "object" && "snapshot" in attributes);
}

function mergeContextRefs(...refs: Array<Partial<DocsContextRefs> | undefined>): DocsContextRefs {
  return normalizeContextRefs({
    roadmapItemIds: refs.flatMap((value) => value?.roadmapItemIds ?? []),
    initiativeIds: refs.flatMap((value) => value?.initiativeIds ?? []),
    researchIds: refs.flatMap((value) => value?.researchIds ?? []),
    specChangeIds: refs.flatMap((value) => value?.specChangeIds ?? []),
    ticketIds: refs.flatMap((value) => value?.ticketIds ?? []),
    critiqueIds: refs.flatMap((value) => value?.critiqueIds ?? []),
  });
}

function archiveReason(title: string): string {
  return `Archive ${title} after it stops describing the active system state.`;
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

function packetHash(packet: string): string {
  return createHash("sha256").update(packet).digest("hex");
}

function deriveContextRefsFromTicket(ticket: TicketReadResult): DocsContextRefs {
  return mergeContextRefs({
    initiativeIds: ticket.ticket.frontmatter["initiative-ids"],
    researchIds: ticket.ticket.frontmatter["research-ids"],
    ticketIds: [ticket.summary.id],
  });
}

function deriveContextRefsFromSpec(change: SpecChangeRecord): DocsContextRefs {
  return mergeContextRefs({
    initiativeIds: change.state.initiativeIds,
    researchIds: change.state.researchIds,
    specChangeIds: [change.state.changeId],
  });
}

function deriveContextRefsFromInitiative(initiative: InitiativeRecord): DocsContextRefs {
  return mergeContextRefs({
    roadmapItemIds: initiative.state.roadmapRefs,
    initiativeIds: [initiative.state.initiativeId],
    researchIds: initiative.state.researchIds,
    specChangeIds: initiative.state.specChangeIds,
    ticketIds: initiative.state.ticketIds,
  });
}

function deriveContextRefsFromCritique(critique: CritiqueReadResult): DocsContextRefs {
  return mergeContextRefs(critique.state.contextRefs, {
    critiqueIds: [critique.state.critiqueId],
    ticketIds: critique.state.followupTicketIds,
  });
}

function canonicalEntityKindForDocSourceTarget(
  kind: DocumentationState["sourceTarget"]["kind"],
): LoomEntityKind | null {
  switch (kind) {
    case "initiative":
      return "initiative";
    case "spec":
      return "spec_change";
    case "ticket":
      return "ticket";
    case "critique":
      return "critique";
    case "workspace":
      return null;
  }
}

function documentationSearchText(record: DocumentationReadResult): string[] {
  const scopePaths = renderPortableRepositoryPathList(record.state.scopePaths);
  const dashboardScopePaths = renderPortableRepositoryPathList(record.dashboard.scopePaths);
  const linkedOutputPaths = renderPortableRepositoryPathList(record.state.linkedOutputPaths);
  const dashboardLinkedOutputPaths = renderPortableRepositoryPathList(record.dashboard.linkedOutputPaths);
  return [
    record.summary.id,
    record.summary.title,
    record.summary.summary,
    record.summary.sourceRef,
    record.state.sourceTarget.ref,
    ...record.state.guideTopics,
    ...record.dashboard.guideTopics,
    ...record.state.audience,
    ...record.dashboard.audience,
    ...scopePaths,
    ...dashboardScopePaths,
    ...linkedOutputPaths,
    ...dashboardLinkedOutputPaths,
    ...record.state.contextRefs.roadmapItemIds,
    ...record.state.contextRefs.initiativeIds,
    ...record.state.contextRefs.researchIds,
    ...record.state.contextRefs.specChangeIds,
    ...record.state.contextRefs.ticketIds,
    ...record.state.contextRefs.critiqueIds,
  ];
}

function filterAndSortDocumentationSummaries(
  records: DocumentationReadResult[],
  filter: DocumentationListFilter = {},
): DocumentationReadResult["summary"][] {
  const filtered = records.filter((record) => {
    const summary = record.summary;
    if (filter.status && summary.status !== filter.status) return false;
    if (filter.docType && summary.docType !== filter.docType) return false;
    if (filter.sectionGroup && summary.sectionGroup !== filter.sectionGroup) return false;
    if (filter.sourceKind && summary.sourceKind !== filter.sourceKind) return false;
    if (filter.topic && !record.state.guideTopics.includes(filter.topic)) return false;
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
        { value: record.summary.summary, weight: 9 },
        { value: record.summary.sourceRef, weight: 7 },
        { value: record.state.guideTopics.join(" "), weight: 6 },
        { value: renderPortableRepositoryPathList(record.state.scopePaths).join(" "), weight: 5 },
        { value: renderPortableRepositoryPathList(record.state.linkedOutputPaths).join(" "), weight: 5 },
        { value: documentationSearchText(record).join(" "), weight: 3 },
      ],
    })),
    { text: filter.text, sort: filter.sort },
  );
}

function projectedDocumentationLinks(state: DocumentationState): ProjectedEntityLinkInput[] {
  const links: ProjectedEntityLinkInput[] = [];
  const sourceTargetKind = canonicalEntityKindForDocSourceTarget(state.sourceTarget.kind);

  if (sourceTargetKind) {
    links.push({
      kind: "documents",
      targetKind: sourceTargetKind,
      targetDisplayId: state.sourceTarget.ref,
    });
  }

  // Workspace docs and roadmap refs do not map to canonical entity kinds yet, so only project resolvable entity refs.
  links.push(
    ...normalizeStringList(state.contextRefs.initiativeIds).map((initiativeId) => ({
      kind: "references" as const,
      targetKind: "initiative" as const,
      targetDisplayId: initiativeId,
    })),
    ...normalizeStringList(state.contextRefs.researchIds).map((researchId) => ({
      kind: "references" as const,
      targetKind: "research" as const,
      targetDisplayId: researchId,
    })),
    ...normalizeStringList(state.contextRefs.specChangeIds).map((changeId) => ({
      kind: "references" as const,
      targetKind: "spec_change" as const,
      targetDisplayId: changeId,
    })),
    ...normalizeStringList(state.contextRefs.ticketIds).map((ticketId) => ({
      kind: "references" as const,
      targetKind: "ticket" as const,
      targetDisplayId: ticketId,
    })),
    ...normalizeStringList(state.contextRefs.critiqueIds).map((critiqueId) => ({
      kind: "references" as const,
      targetKind: "critique" as const,
      targetDisplayId: critiqueId,
    })),
  );

  return links;
}

interface ResolvedDocumentationContext {
  sourceSummary: string;
  contextRefs: DocsContextRefs;
  constitution: ConstitutionalRecord | null;
  roadmapItems: string[];
  initiatives: string[];
  research: string[];
  specs: string[];
  tickets: string[];
  critiques: string[];
  currentDocumentSummary: string;
  likelySections: string[];
}

export class DocumentationStore {
  readonly cwd: string;
  readonly scope: LoomExplicitScopeInput;

  constructor(cwd: string, scope: LoomExplicitScopeInput = {}) {
    this.cwd = resolve(cwd);
    this.scope = scope;
  }

  initLedger(): { initialized: true; root: string } {
    return { initialized: true, root: getLoomCatalogPaths().catalogPath };
  }

  private async openWorkspaceStorage() {
    return openScopedWorkspaceStorage(this.cwd, this.scope);
  }

  private persistenceScopeForState(state: DocumentationState): Required<LoomExplicitScopeInput> {
    if (this.scope.repositoryId || this.scope.worktreeId) {
      return {
        spaceId: this.scope.spaceId ?? null,
        repositoryId: this.scope.repositoryId ?? null,
        worktreeId: this.scope.worktreeId ?? null,
      };
    }

    const scopedPaths = [...state.scopePaths, ...state.linkedOutputPaths];
    const uniqueScopes = new Map<string, { repositoryId: string; worktreeId: string | null }>();
    for (const entry of scopedPaths) {
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
        "Documentation scope paths span multiple repository/worktree scopes; persist the document from one explicit repository scope.",
      );
    }

    return {
      spaceId: this.scope.spaceId ?? null,
      repositoryId: this.scope.repositoryId ?? null,
      worktreeId: this.scope.worktreeId ?? null,
    };
  }

  private async upsertCanonicalRecord(record: DocumentationReadResult): Promise<DocumentationReadResult> {
    const canonicalSnapshot: DocumentationCanonicalSnapshot = {
      state: record.state,
      revisions: record.revisions,
      documentBody: this.extractDocumentBody(record.document, record.dashboard.documentRef),
    };
    const { storage, identity } = await openRepositoryWorkspaceStorage(
      this.cwd,
      this.persistenceScopeForState(record.state),
    );
    const canonicalRecord = await this.buildCanonicalRecord(
      canonicalSnapshot,
      identity.repositories,
      identity.repository.id,
    );
    const existing = await findEntityByDisplayId(storage, identity.space.id, ENTITY_KIND, canonicalRecord.summary.id);
    const previousSnapshot = this.readSnapshot(
      existing?.attributes ?? null,
      this.portablePathFallback(
        identity.repositories,
        existing?.owningRepositoryId ?? identity.repository.id,
        identity.worktree.id,
      ),
    );
    const version = (existing?.version ?? 0) + 1;
    await storage.transact(async (tx) => {
      const persistedPayload: DocumentationPersistedEventPayload = {
        change: "documentation_persisted",
        entityKind: ENTITY_KIND,
        displayId: canonicalRecord.summary.id,
        version,
        status: canonicalRecord.summary.status,
        docType: canonicalRecord.summary.docType,
        sourceTarget: canonicalRecord.state.sourceTarget,
        revisionCount: canonicalRecord.revisions.length,
        lastRevisionId: canonicalRecord.state.lastRevisionId,
      };
      const { entity } = await upsertEntityByDisplayIdWithLifecycleEvents(
        tx,
        {
          kind: ENTITY_KIND,
          spaceId: identity.space.id,
          owningRepositoryId: identity.repository.id,
          displayId: canonicalRecord.summary.id,
          title: canonicalRecord.summary.title,
          summary: canonicalRecord.state.summary,
          status: canonicalRecord.summary.status,
          version,
          tags: [canonicalRecord.summary.docType, ...canonicalRecord.state.guideTopics],
          attributes: { snapshot: canonicalSnapshot },
          createdAt: existing?.createdAt ?? canonicalRecord.state.createdAt,
          updatedAt: canonicalRecord.state.updatedAt,
        },
        {
          actor: "documentation-store",
          createdPayload: persistedPayload,
          updatedPayload: persistedPayload,
        },
      );
      await syncProjectedEntityLinks({
        storage: tx,
        spaceId: identity.space.id,
        fromEntityId: entity.id,
        projectionOwner: DOCUMENTATION_LINK_PROJECTION_OWNER,
        desired: projectedDocumentationLinks(canonicalRecord.state),
        timestamp: canonicalRecord.state.updatedAt,
      });
      const previousLastRevisionId = previousSnapshot?.state.lastRevisionId ?? null;
      const latestRevision = canonicalRecord.revisions.at(-1) ?? null;
      if (latestRevision && latestRevision.id !== previousLastRevisionId) {
        const revisionPayload: DocumentationRevisionRecordedEventPayload = {
          change: "documentation_revision_recorded",
          docId: canonicalRecord.state.docId,
          revisionId: latestRevision.id,
          revisionCount: canonicalRecord.revisions.length,
          documentUpdated: previousSnapshot?.documentBody !== canonicalSnapshot.documentBody,
          changedSections: latestRevision.changedSections,
          sourceTarget: latestRevision.sourceTarget,
          linkedContextRefs: latestRevision.linkedContextRefs,
        };
        await appendEntityEvent(
          tx,
          entity.id,
          "updated",
          "documentation-store",
          revisionPayload,
          latestRevision.createdAt,
        );
      }
    });
    return canonicalRecord;
  }

  private async entityRecord(
    entity: LoomEntityRecord,
    repositories: readonly LoomRepositoryRecord[],
  ): Promise<DocumentationReadResult> {
    const fallback = this.portablePathFallback(repositories, entity.owningRepositoryId, null);
    const snapshot = this.readSnapshot(entity.attributes, fallback);
    if (!snapshot) {
      const docId = entity.displayId ?? entity.id;
      throw new Error(`Documentation entity ${docId} is missing structured attributes`);
    }
    return this.buildCanonicalRecord(snapshot, repositories, entity.owningRepositoryId);
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

  private normalizeStoredState(
    state: DocumentationState,
    fallback?: LoomPortableRepositoryPathFallback | null,
  ): DocumentationState {
    if (!state || typeof state !== "object") {
      throw new Error("Documentation state is missing");
    }
    const status = typeof state.status === "string" ? state.status.trim() : "";
    if (!status) {
      throw new Error("Documentation state is missing status");
    }
    const docTypeValue = typeof state.docType === "string" ? state.docType.trim() : "";
    if (!docTypeValue) {
      throw new Error("Documentation state is missing docType");
    }
    const title = typeof state?.title === "string" ? state.title.trim() : "";
    if (!title) {
      throw new Error("Documentation state is missing title");
    }
    const docId = typeof state.docId === "string" ? state.docId.trim() : "";
    if (!docId) {
      throw new Error("Documentation state is missing docId");
    }
    const createdAt = typeof state.createdAt === "string" ? state.createdAt.trim() : "";
    if (!createdAt) {
      throw new Error("Documentation state is missing createdAt");
    }
    const updatedAt = typeof state.updatedAt === "string" ? state.updatedAt.trim() : "";
    if (!updatedAt) {
      throw new Error("Documentation state is missing updatedAt");
    }
    const sourceRef = typeof state.sourceTarget?.ref === "string" ? state.sourceTarget.ref.trim() : "";
    if (!sourceRef) {
      throw new Error("Documentation state is missing sourceTarget.ref");
    }
    const sourceKind = typeof state.sourceTarget?.kind === "string" ? state.sourceTarget.kind.trim() : "";
    if (!sourceKind) {
      throw new Error("Documentation state is missing sourceTarget.kind");
    }
    if (!Array.isArray(state.audience)) {
      throw new Error("Documentation state is missing audience");
    }
    if (
      !(typeof state.lastRevisionId === "string" || state.lastRevisionId === null || state.lastRevisionId === undefined)
    ) {
      throw new Error("Documentation state has invalid lastRevisionId");
    }

    const docType = normalizeDocType(docTypeValue);
    return {
      docId: normalizeDocId(docId),
      title,
      status: normalizeDocStatus(status),
      docType,
      sectionGroup: state.sectionGroup ? normalizeSectionGroup(state.sectionGroup) : sectionGroupForDocType(docType),
      createdAt,
      updatedAt,
      summary: typeof state.summary === "string" ? state.summary.trim() : "",
      audience: normalizeAudience(state.audience),
      scopePaths: normalizeStoredPortableRepositoryPathList(state.scopePaths, fallback),
      contextRefs: normalizeContextRefs(state.contextRefs),
      sourceTarget: {
        kind: normalizeSourceTargetKind(sourceKind),
        ref: sourceRef,
      },
      updateReason: typeof state.updateReason === "string" ? state.updateReason.trim() : "",
      guideTopics: normalizeStringList(state.guideTopics),
      linkedOutputPaths: normalizeStoredPortableRepositoryPathList(state.linkedOutputPaths, fallback),
      lastRevisionId: normalizeOptionalString(state.lastRevisionId),
    };
  }

  private normalizeStoredRevision(revision: DocumentationRevisionRecord, docId: string): DocumentationRevisionRecord {
    if (!revision || typeof revision !== "object") {
      throw new Error(`Documentation ${docId} has invalid revision entry`);
    }
    const id = typeof revision?.id === "string" ? revision.id.trim() : "";
    if (!id) {
      throw new Error("Documentation revision is missing id");
    }
    const createdAt = typeof revision.createdAt === "string" ? revision.createdAt.trim() : "";
    if (!createdAt) {
      throw new Error(`Documentation revision ${id} is missing createdAt`);
    }
    const packetHash = typeof revision.packetHash === "string" ? revision.packetHash.trim() : "";
    if (!packetHash) {
      throw new Error(`Documentation revision ${id} is missing packetHash`);
    }
    const revisionDocIdValue = typeof revision.docId === "string" ? revision.docId.trim() : "";
    if (!revisionDocIdValue) {
      throw new Error(`Documentation revision ${id} is missing docId`);
    }
    const revisionDocId = normalizeDocId(revisionDocIdValue);
    if (revisionDocId !== docId) {
      throw new Error(`Documentation revision ${id} belongs to ${revisionDocId}, expected ${docId}`);
    }
    const sourceRef = typeof revision.sourceTarget?.ref === "string" ? revision.sourceTarget.ref.trim() : "";
    if (!sourceRef) {
      throw new Error(`Documentation revision ${id} is missing sourceTarget.ref`);
    }
    const sourceKind = typeof revision.sourceTarget?.kind === "string" ? revision.sourceTarget.kind.trim() : "";
    if (!sourceKind) {
      throw new Error(`Documentation revision ${id} is missing sourceTarget.kind`);
    }

    return {
      id,
      docId: revisionDocId,
      createdAt,
      reason: typeof revision.reason === "string" ? revision.reason.trim() : "",
      summary: typeof revision.summary === "string" ? revision.summary.trim() : "",
      sourceTarget: {
        kind: normalizeSourceTargetKind(sourceKind),
        ref: sourceRef,
      },
      packetHash,
      changedSections: normalizeStringList(revision.changedSections),
      linkedContextRefs: normalizeContextRefs(revision.linkedContextRefs),
    };
  }

  private materializeSnapshot(
    snapshot: DocumentationCanonicalSnapshot,
    fallback?: LoomPortableRepositoryPathFallback | null,
  ): DocumentationCanonicalSnapshot {
    if (typeof snapshot?.documentBody !== "string") {
      throw new Error("Documentation snapshot is missing documentBody");
    }
    if (!Array.isArray(snapshot.revisions)) {
      throw new Error("Documentation snapshot has invalid revisions");
    }

    const state = this.normalizeStoredState(snapshot.state, fallback);
    const revisions = snapshot.revisions.map((revision) => this.normalizeStoredRevision(revision, state.docId));
    const lastRevisionId = revisions.at(-1)?.id ?? null;
    if (state.lastRevisionId !== lastRevisionId) {
      throw new Error(`Documentation ${state.docId} has inconsistent lastRevisionId`);
    }

    return {
      state,
      revisions,
      documentBody: this.extractDocumentBody(snapshot.documentBody, getDocumentationDocumentRef(state)),
    };
  }

  private readSnapshot(
    attributes: unknown,
    fallback?: LoomPortableRepositoryPathFallback | null,
  ): DocumentationCanonicalSnapshot | null {
    if (hasStructuredDocumentationAttributes(attributes)) {
      return this.materializeSnapshot(attributes.snapshot, fallback);
    }
    return null;
  }

  private async nextDocId(baseTitle: string): Promise<string> {
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

  private extractDocumentBody(document: string, docPath: string): string {
    try {
      return parseMarkdownArtifact(document, docPath).body;
    } catch {
      return document.trim();
    }
  }

  private async readConstitutionIfPresentAsync(): Promise<ConstitutionalRecord | null> {
    try {
      return await createConstitutionalStore(this.cwd).readConstitution();
    } catch {
      return null;
    }
  }

  private async safeReadInitiativeAsync(id: string): Promise<InitiativeRecord | null> {
    try {
      return await createInitiativeStore(this.cwd).readInitiative(id);
    } catch {
      return null;
    }
  }

  private async safeReadResearchAsync(id: string): Promise<ResearchRecord | null> {
    try {
      return await createResearchStore(this.cwd, this.scope).readResearch(id);
    } catch {
      return null;
    }
  }

  private async safeReadSpecAsync(id: string): Promise<SpecChangeRecord | null> {
    try {
      return await createSpecStore(this.cwd, this.scope).readChange(id);
    } catch {
      return null;
    }
  }

  private async safeReadTicketAsync(id: string): Promise<TicketReadResult | null> {
    try {
      return await createTicketStore(this.cwd, this.scope).readTicketAsync(id);
    } catch {
      return null;
    }
  }

  private async safeReadCritiqueAsync(id: string): Promise<CritiqueReadResult | null> {
    try {
      return await createCritiqueStore(this.cwd, this.scope).readCritiqueAsync(id);
    } catch {
      return null;
    }
  }

  private async resolveSourceSummaryCanonical(
    state: DocumentationState,
  ): Promise<{ summary: string; contextRefs: DocsContextRefs }> {
    switch (state.sourceTarget.kind) {
      case "workspace":
        return {
          summary: `Workspace documentation target: ${state.sourceTarget.ref}`,
          contextRefs: normalizeContextRefs(state.contextRefs),
        };
      case "ticket": {
        const ticket = await this.safeReadTicketAsync(state.sourceTarget.ref);
        if (!ticket) {
          return {
            summary: `Ticket ${state.sourceTarget.ref} could not be loaded. Update the document from the referenced code and packet context directly.`,
            contextRefs: mergeContextRefs({ ticketIds: [state.sourceTarget.ref] }),
          };
        }
        return {
          summary: [
            `${ticket.summary.id} [${ticket.summary.status}] ${ticket.summary.title}`,
            `Summary: ${excerpt(ticket.ticket.body.summary)}`,
            `Verification: ${excerpt(ticket.ticket.body.verification)}`,
            `Review status: ${ticket.ticket.frontmatter["review-status"] ?? "none"}`,
          ].join("\n"),
          contextRefs: deriveContextRefsFromTicket(ticket),
        };
      }
      case "spec": {
        const change = await this.safeReadSpecAsync(state.sourceTarget.ref);
        if (!change) {
          return {
            summary: `Spec ${state.sourceTarget.ref} could not be loaded. Update the document from the packet context directly.`,
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
      case "initiative": {
        const initiative = await this.safeReadInitiativeAsync(state.sourceTarget.ref);
        if (!initiative) {
          return {
            summary: `Initiative ${state.sourceTarget.ref} could not be loaded. Update the document from the packet context directly.`,
            contextRefs: mergeContextRefs({ initiativeIds: [state.sourceTarget.ref] }),
          };
        }
        return {
          summary: [
            `${initiative.summary.id} [${initiative.summary.status}] ${initiative.summary.title}`,
            `Objective: ${excerpt(initiative.state.objective)}`,
            `Status summary: ${excerpt(initiative.state.statusSummary)}`,
            `Milestones: ${initiative.state.milestones.length}`,
          ].join("\n"),
          contextRefs: deriveContextRefsFromInitiative(initiative),
        };
      }
      case "critique": {
        const critique = await this.safeReadCritiqueAsync(state.sourceTarget.ref);
        if (!critique) {
          return {
            summary: `Critique ${state.sourceTarget.ref} could not be loaded. Update the document from the packet context directly.`,
            contextRefs: mergeContextRefs({ critiqueIds: [state.sourceTarget.ref] }),
          };
        }
        return {
          summary: [
            `${critique.summary.id} [${critique.summary.status}/${critique.summary.verdict}] ${critique.summary.title}`,
            `Target: ${critique.state.target.kind}:${critique.state.target.ref}`,
            `Review question: ${excerpt(critique.state.reviewQuestion)}`,
            `Open findings: ${critique.state.openFindingIds.join(", ") || "none"}`,
          ].join("\n"),
          contextRefs: deriveContextRefsFromCritique(critique),
        };
      }
    }
  }

  private likelySectionsForType(state: DocumentationState, documentBody: string): string[] {
    const currentSections = extractMarkdownSections(documentBody);
    if (currentSections.length > 0) {
      return currentSections;
    }
    switch (state.docType) {
      case "overview":
        return ["Summary", "Architecture", "Key Workflows", "Current Boundaries"];
      case "guide":
      case "workflow":
        return ["When To Use", "Steps", "Verification", "Failure Modes"];
      case "concept":
        return ["Concept", "Why It Exists", "Relationships", "Edge Cases"];
      case "operations":
        return ["Purpose", "Prerequisites", "Procedure", "Troubleshooting"];
      case "faq":
        return ["Common Questions", "Answers", "Escalation"];
    }
  }

  private async resolvePacketContextCanonical(
    state: DocumentationState,
    revisions: DocumentationRevisionRecord[],
    documentBody: string,
  ): Promise<ResolvedDocumentationContext> {
    const source = await this.resolveSourceSummaryCanonical(state);
    const contextRefs = mergeContextRefs(state.contextRefs, source.contextRefs);
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
    const critiques = (
      await Promise.all(contextRefs.critiqueIds.map((critiqueId) => this.safeReadCritiqueAsync(critiqueId)))
    )
      .filter((record): record is CritiqueReadResult => record !== null)
      .map(
        (record) =>
          `${record.summary.id} [${record.summary.status}/${record.summary.verdict}] ${record.summary.title} — open findings: ${record.state.openFindingIds.length}`,
      );
    const currentDocumentSummary = documentBody
      ? `${excerpt(summarizeDocument(documentBody))}${extractMarkdownSections(documentBody).length > 0 ? ` | sections: ${extractMarkdownSections(documentBody).join(", ")}` : ""}`
      : "(none yet)";
    const likelySections = normalizeStringList([
      ...this.likelySectionsForType(state, documentBody),
      ...revisions.flatMap((revision) => revision.changedSections),
    ]);

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
      currentDocumentSummary,
      likelySections,
    };
  }

  private async buildPacketCanonical(
    state: DocumentationState,
    revisions: DocumentationRevisionRecord[],
    documentBody: string,
  ): Promise<string> {
    const context = await this.resolvePacketContextCanonical(state, revisions, documentBody);
    const constitutionSummary = context.constitution
      ? [
          `Project: ${context.constitution.state.title}`,
          `Strategic direction: ${excerpt(context.constitution.state.strategicDirectionSummary)}`,
          `Current focus: ${context.constitution.state.currentFocus.join("; ") || "none"}`,
          `Open constitutional questions: ${context.constitution.state.openConstitutionQuestions.join("; ") || "none"}`,
        ].join("\n")
      : "(none)";

    return serializeMarkdownArtifact(
      {
        id: state.docId,
        title: state.title,
        status: state.status,
        type: state.docType,
        section: state.sectionGroup,
        source: `${state.sourceTarget.kind}:${state.sourceTarget.ref}`,
        audience: state.audience,
        "created-at": state.createdAt,
        "updated-at": state.updatedAt,
      },
      [
        renderSection("Documentation Target", context.sourceSummary),
        renderSection("Update Reason", state.updateReason || "(empty)"),
        renderSection("Current Document Summary", context.currentDocumentSummary),
        renderSection("Audience", state.audience.join(", ") || "none"),
        renderSection("Scope Paths", renderBulletList(renderPortableRepositoryPathList(state.scopePaths))),
        renderSection("Guide Topics", renderBulletList(state.guideTopics)),
        renderSection(
          "Documentation Boundaries",
          renderBulletList([
            "Keep the document high-level and explanatory for both humans and AI memory.",
            "Do not generate API reference docs or exhaustive symbol listings.",
            "Describe completed reality, not plans that have not landed.",
            "Keep linkedOutputPaths truthful for future sync workflows, but do not mutate external docs trees automatically in v1.",
          ]),
        ),
        renderSection("Likely Sections To Update", renderBulletList(context.likelySections)),
        renderSection(
          "Existing Revisions",
          renderBulletList(
            revisions.map(
              (revision) =>
                `${revision.id} ${revision.reason} — ${excerpt(revision.summary)} (${revision.changedSections.join(", ") || "no sections"})`,
            ),
          ),
        ),
        renderSection("Constitutional Context", constitutionSummary),
        renderSection("Roadmap Items", renderBulletList(context.roadmapItems)),
        renderSection("Initiatives", renderBulletList(context.initiatives)),
        renderSection("Research", renderBulletList(context.research)),
        renderSection("Specs", renderBulletList(context.specs)),
        renderSection("Tickets", renderBulletList(context.tickets)),
        renderSection("Critiques", renderBulletList(context.critiques)),
      ].join("\n\n"),
    );
  }

  private async buildCanonicalRecord(
    snapshot: DocumentationCanonicalSnapshot,
    repositories?: readonly LoomRepositoryRecord[],
    repositoryId?: string | null,
  ): Promise<DocumentationReadResult> {
    const packet = await this.buildPacketCanonical(snapshot.state, snapshot.revisions, snapshot.documentBody);
    const document = renderDocumentationMarkdown(snapshot.state, snapshot.documentBody);
    const repository = resolveRepositoryQualifier(
      repositories ?? (await this.openWorkspaceStorage()).identity.repositories,
      repositoryId,
    );
    return {
      state: snapshot.state,
      summary: summarizeDocumentation(snapshot.state, snapshot.revisions.length, repository),
      packet,
      document,
      revisions: snapshot.revisions,
      dashboard: buildDocumentationDashboard(snapshot.state, snapshot.revisions, repository),
    };
  }

  private defaultDocumentBody(state: DocumentationState): string {
    const scope =
      state.scopePaths.length > 0 ? renderPortableRepositoryPathList(state.scopePaths).join(", ") : "the workspace";
    switch (state.docType) {
      case "overview":
        return [
          "## Summary",
          state.summary || `This overview describes ${state.title}.`,
          "",
          "## Architecture",
          `Document the high-level structure and responsibilities that currently shape ${scope}.`,
          "",
          "## Key Workflows",
          "Document the workflows that readers should understand first.",
        ].join("\n");
      case "guide":
      case "workflow":
        return [
          "## When To Use",
          state.summary || `Use this guide when working with ${state.title}.`,
          "",
          "## Steps",
          "Replace this placeholder with the current high-level workflow.",
          "",
          "## Verification",
          "Describe how a maintainer knows the workflow is complete or healthy.",
        ].join("\n");
      case "concept":
        return [
          "## Concept",
          state.summary || `This concept explains ${state.title}.`,
          "",
          "## Why It Exists",
          "Document the problem this abstraction or boundary solves.",
          "",
          "## Relationships",
          "Describe which other layers or workflows depend on this concept.",
        ].join("\n");
      case "operations":
        return [
          "## Purpose",
          state.summary || `This operational document covers ${state.title}.`,
          "",
          "## Procedure",
          "Replace this placeholder with the real operational steps.",
          "",
          "## Troubleshooting",
          "Document common failure modes once the operational knowledge exists.",
        ].join("\n");
      case "faq":
        return [
          "## Common Questions",
          state.summary || `This FAQ answers recurring questions about ${state.title}.`,
          "",
          "## Answers",
          "Replace this placeholder with durable answers grounded in current system reality.",
        ].join("\n");
    }
  }

  private async createDefaultState(
    input: CreateDocumentationInput,
    docId: string,
    timestamp: string,
  ): Promise<DocumentationState> {
    const docType = normalizeDocType(input.docType);
    return {
      docId,
      title: input.title.trim(),
      status: "active",
      docType,
      sectionGroup: sectionGroupForDocType(docType),
      createdAt: timestamp,
      updatedAt: timestamp,
      summary: input.summary?.trim() ?? "",
      audience: normalizeAudience(input.audience),
      scopePaths: await resolvePortableRepositoryPathInputs(this.cwd, input.scopePaths, this.scope),
      contextRefs: normalizeContextRefs(input.contextRefs),
      sourceTarget: {
        kind: normalizeSourceTargetKind(input.sourceTarget.kind),
        ref: input.sourceTarget.ref.trim(),
      },
      updateReason:
        input.updateReason?.trim() ||
        `Keep ${input.title.trim()} truthful after completed work changes system understanding.`,
      guideTopics: normalizeStringList(input.guideTopics),
      linkedOutputPaths: await resolvePortableRepositoryPathInputs(this.cwd, input.linkedOutputPaths, this.scope),
      lastRevisionId: null,
    };
  }

  async initLedgerAsync(): Promise<{ initialized: true; root: string }> {
    return this.initLedger();
  }

  async listDocs(filter: DocumentationListFilter = {}): Promise<DocumentationReadResult["summary"][]> {
    const { storage, identity } = await this.openWorkspaceStorage();
    const records = await Promise.all(
      (await storage.listEntities(identity.space.id, ENTITY_KIND)).map((entity) =>
        this.entityRecord(entity, identity.repositories),
      ),
    );
    return filterAndSortDocumentationSummaries(records, filter);
  }

  async readDoc(ref: string): Promise<DocumentationReadResult> {
    const { storage, identity } = await this.openWorkspaceStorage();
    const docId = normalizeDocRef(ref);
    const entity = await findEntityByDisplayId(storage, identity.space.id, ENTITY_KIND, docId);
    if (!entity) {
      throw new Error(`Unknown documentation: ${docId}`);
    }
    return this.entityRecord(entity, identity.repositories);
  }

  async createDoc(input: CreateDocumentationInput): Promise<DocumentationReadResult> {
    const timestamp = currentTimestamp();
    const docId = await this.nextDocId(input.title);
    const state = await this.createDefaultState(input, docId, timestamp);
    return this.upsertCanonicalRecord(
      await this.buildCanonicalRecord({
        state: {
          ...state,
          summary: state.summary || summarizeDocument(input.document?.trim() || this.defaultDocumentBody(state)),
        },
        revisions: [],
        documentBody: input.document?.trim() || this.defaultDocumentBody(state),
      }),
    );
  }

  private async buildAppendedRevision(
    current: DocumentationReadResult,
    nextState: DocumentationState,
    documentBody: string,
    options?: { changedSections?: readonly string[]; documentUpdated?: boolean },
  ): Promise<DocumentationRevisionRecord> {
    const revisionId = nextSequenceId(
      current.revisions.map((entry) => entry.id),
      "rev",
    );
    const packetForRevision = await this.buildPacketCanonical(nextState, current.revisions, documentBody);
    return {
      id: revisionId,
      docId: current.state.docId,
      createdAt: nextState.updatedAt,
      reason: nextState.updateReason,
      summary: nextState.summary || summarizeDocument(documentBody),
      sourceTarget: nextState.sourceTarget,
      packetHash: packetHash(packetForRevision),
      changedSections: options?.changedSections
        ? normalizeStringList(options.changedSections)
        : options?.documentUpdated
          ? extractMarkdownSections(documentBody)
          : [],
      linkedContextRefs: nextState.contextRefs,
    };
  }

  async updateDoc(ref: string, input: UpdateDocumentationInput): Promise<DocumentationReadResult> {
    const current = await this.readDoc(ref);
    if (current.state.status !== "active") {
      throw new Error(`Cannot update ${current.state.status} documentation: ${current.state.docId}`);
    }
    const documentBody =
      input.document?.trim() ||
      this.extractDocumentBody(current.document, current.dashboard.documentRef) ||
      this.defaultDocumentBody(current.state);
    const documentUpdated = input.document !== undefined;
    const nextState: DocumentationState = {
      ...current.state,
      title: input.title?.trim() ?? current.state.title,
      updatedAt: currentTimestamp(),
      summary: input.summary?.trim() ?? (documentUpdated ? summarizeDocument(documentBody) : current.state.summary),
      audience: input.audience ? normalizeAudience(input.audience) : current.state.audience,
      scopePaths: input.scopePaths
        ? await resolvePortableRepositoryPathInputs(this.cwd, input.scopePaths, this.scope)
        : current.state.scopePaths,
      contextRefs: input.contextRefs ? normalizeContextRefs(input.contextRefs) : current.state.contextRefs,
      sourceTarget: input.sourceTarget
        ? { kind: normalizeSourceTargetKind(input.sourceTarget.kind), ref: input.sourceTarget.ref.trim() }
        : current.state.sourceTarget,
      updateReason: input.updateReason?.trim() ?? current.state.updateReason,
      guideTopics: input.guideTopics ? normalizeStringList(input.guideTopics) : current.state.guideTopics,
      linkedOutputPaths: input.linkedOutputPaths
        ? await resolvePortableRepositoryPathInputs(this.cwd, input.linkedOutputPaths, this.scope)
        : current.state.linkedOutputPaths,
    };
    const revision = await this.buildAppendedRevision(current, nextState, documentBody, {
      changedSections: input.changedSections,
      documentUpdated,
    });
    const nextRecord = await this.buildCanonicalRecord({
      state: { ...nextState, lastRevisionId: revision.id },
      revisions: [...current.revisions, revision],
      documentBody,
    });
    return this.upsertCanonicalRecord(nextRecord);
  }

  async archiveDoc(ref: string): Promise<DocumentationReadResult> {
    const current = await this.readDoc(ref);
    if (current.state.status === "archived") {
      return current;
    }
    const documentBody =
      this.extractDocumentBody(current.document, current.dashboard.documentRef) ||
      this.defaultDocumentBody(current.state);
    const nextState: DocumentationState = {
      ...current.state,
      status: "archived",
      updatedAt: currentTimestamp(),
      updateReason: archiveReason(current.state.title),
    };
    const revision = await this.buildAppendedRevision(current, nextState, documentBody);
    return this.upsertCanonicalRecord(
      await this.buildCanonicalRecord({
        state: { ...nextState, lastRevisionId: revision.id },
        revisions: [...current.revisions, revision],
        documentBody,
      }),
    );
  }
}

export function createDocumentationStore(cwd: string, scope: LoomExplicitScopeInput = {}): DocumentationStore {
  return new DocumentationStore(cwd, scope);
}
