import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
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
import { resolveRuntimeScopeCwd } from "#storage/runtime-scope.js";
import {
  type LoomExplicitScopeInput,
  openRepositoryWorkspaceStorage,
  openScopedWorkspaceStorage,
} from "#storage/workspace.js";
import type { TicketReadResult } from "#ticketing/domain/models.js";
import { normalizeTicketRef } from "#ticketing/domain/normalize.js";
import { createTicketStore } from "#ticketing/domain/store.js";
import { parseMarkdownArtifact, renderBulletList, renderSection, serializeMarkdownArtifact } from "./frontmatter.js";
import type {
  CreateDocumentationInput,
  DocGovernanceAction,
  DocGovernanceRelationship,
  DocPublicationStatus,
  DocsContextRefs,
  DocTopicRole,
  DocumentationAuditFinding,
  DocumentationAuditFindingKind,
  DocumentationAuditFindingSeverity,
  DocumentationAuditReport,
  DocumentationAuditSubject,
  DocumentationCanonicalSnapshot,
  DocumentationEntityAttributes,
  DocumentationGovernanceSurface,
  DocumentationListFilter,
  DocumentationPersistedEventPayload,
  DocumentationReadResult,
  DocumentationRelatedDocSummary,
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
  normalizeTopicId,
  normalizeTopicRole,
  sectionGroupForDocType,
  slugifyTitle,
  summarizeDocument,
} from "./normalize.js";
import { buildDocumentationOverview, getDocumentationDocumentRef, summarizeDocumentation } from "./overview.js";
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

function defaultTopicRole(docType: DocumentationState["docType"], topicId: string | null): DocTopicRole {
  if (!topicId) {
    return "legacy";
  }
  return docType === "overview" ? "owner" : "companion";
}

function normalizeSuccessorDocId(value: string | null | undefined): string | null {
  const trimmed = normalizeOptionalString(value);
  return trimmed ? normalizeDocRef(trimmed) : null;
}

function renderVerificationSummary(state: DocumentationState): string {
  if (!state.verifiedAt) {
    return "unverified";
  }
  return `${state.verifiedAt}${state.verificationSource ? ` via ${state.verificationSource}` : ""}`;
}

function renderLifecycleSummary(state: DocumentationState): string {
  if (state.successorDocId) {
    return `successor=${state.successorDocId}`;
  }
  if (state.retirementReason) {
    return `retired: ${state.retirementReason}`;
  }
  return "none";
}

interface DocumentationCorpusEntry {
  snapshot: DocumentationCanonicalSnapshot;
  repositoryId: string | null;
}

function activeTopicOwnersForTopic(
  topicId: string | null,
  corpus: readonly DocumentationCorpusEntry[],
): DocumentationCorpusEntry[] {
  if (!topicId) {
    return [];
  }
  return corpus.filter(
    (entry) =>
      entry.snapshot.state.topicId === topicId &&
      entry.snapshot.state.status === "active" &&
      entry.snapshot.state.topicRole === "owner",
  );
}

function classifyPublicationStatus(
  state: DocumentationState,
  corpus: readonly DocumentationCorpusEntry[],
): DocPublicationStatus {
  if (!state.topicId || state.topicRole === "legacy") {
    return "legacy-migration-debt";
  }
  if (state.status === "superseded") {
    return "historical-superseded";
  }
  if (state.status === "archived") {
    return "historical-archived";
  }
  const activeOwners = activeTopicOwnersForTopic(state.topicId, corpus);
  if (state.topicRole === "owner" && activeOwners.length > 1) {
    return "overlapping-owner-debt";
  }
  if (state.topicRole === "owner") {
    return "current-owner";
  }
  if (activeOwners.length === 0) {
    return "governed-without-owner";
  }
  return "current-companion";
}

function allowsSupportingDiscovery(filter: DocumentationListFilter): boolean {
  return Boolean(
    filter.includeSupporting ||
      (filter.docType && filter.docType !== "overview") ||
      (filter.sectionGroup && filter.sectionGroup !== "overviews"),
  );
}

function allowsHistoricalDiscovery(filter: DocumentationListFilter): boolean {
  return Boolean(filter.includeHistorical || filter.status === "superseded" || filter.status === "archived");
}

function includesPublicationInDiscovery(
  publicationStatus: DocPublicationStatus,
  filter: DocumentationListFilter,
): boolean {
  switch (publicationStatus) {
    case "current-companion":
    case "governed-without-owner":
      return allowsSupportingDiscovery(filter);
    case "historical-superseded":
    case "historical-archived":
      return allowsHistoricalDiscovery(filter);
    default:
      return true;
  }
}

function publicationSummaryForState(
  state: DocumentationState,
  publicationStatus: DocPublicationStatus,
  currentOwner: DocumentationCorpusEntry | null,
): string {
  switch (publicationStatus) {
    case "current-owner":
      return state.topicId
        ? `Current canonical overview for governed topic ${state.topicId}.`
        : "Current canonical overview for this governed topic.";
    case "current-companion":
      return currentOwner
        ? `Current companion doc beneath active topic owner ${currentOwner.snapshot.state.docId}.`
        : "Current governed companion doc with no resolved owner information.";
    case "historical-superseded":
      return state.successorDocId
        ? `Historical superseded record; current truth moved to ${state.successorDocId}.`
        : `Historical superseded record retired from active publication${state.retirementReason ? `: ${state.retirementReason}` : "."}`;
    case "historical-archived":
      return "Historical archived record that should stay readable but never count as current truth.";
    case "legacy-migration-debt":
      return "Legacy readable doc with missing governed topic ownership metadata.";
    case "overlapping-owner-debt":
      return state.topicId
        ? `Active owner overlap: multiple overview docs currently claim topic ${state.topicId}.`
        : "Active owner overlap: multiple overview docs currently claim the same topic.";
    case "governed-without-owner":
      return state.topicId
        ? `Governed doc for ${state.topicId} without an active owner overview.`
        : "Governed doc without an active owner overview.";
  }
}

function recommendedActionForPublicationStatus(publicationStatus: DocPublicationStatus): DocGovernanceAction {
  switch (publicationStatus) {
    case "current-owner":
      return "update-current-owner";
    case "current-companion":
      return "update-current-companion";
    case "historical-superseded":
      return "follow-successor-or-retirement";
    case "historical-archived":
      return "keep-archived-history";
    case "legacy-migration-debt":
      return "backfill-topic-metadata";
    case "overlapping-owner-debt":
      return "resolve-owner-overlap";
    case "governed-without-owner":
      return "publish-topic-owner";
  }
}

function relationshipForRelatedDoc(
  self: DocumentationState,
  related: DocumentationState,
  currentOwnerDocId: string | null,
): DocGovernanceRelationship {
  if (related.docId === self.successorDocId) {
    return "successor";
  }
  if (related.successorDocId === self.docId) {
    return "predecessor";
  }
  if (related.docId === currentOwnerDocId) {
    return "current-owner";
  }
  return "same-topic";
}

function sortRelatedDocs(left: DocumentationRelatedDocSummary, right: DocumentationRelatedDocSummary): number {
  const relationshipWeight: Record<DocGovernanceRelationship, number> = {
    successor: 0,
    "current-owner": 1,
    predecessor: 2,
    "same-topic": 3,
  };
  const statusWeight = (value: DocumentationRelatedDocSummary["status"]): number => {
    switch (value) {
      case "active":
        return 0;
      case "superseded":
        return 1;
      case "archived":
        return 2;
    }
  };
  return (
    relationshipWeight[left.relationship] - relationshipWeight[right.relationship] ||
    statusWeight(left.status) - statusWeight(right.status) ||
    right.updatedAt.localeCompare(left.updatedAt) ||
    left.id.localeCompare(right.id)
  );
}

function buildGovernanceSurface(
  state: DocumentationState,
  corpus: readonly DocumentationCorpusEntry[],
): DocumentationGovernanceSurface {
  const activeOwners = activeTopicOwnersForTopic(state.topicId, corpus);
  const currentOwner = activeOwners.length === 1 ? activeOwners[0] : null;
  const publicationStatus = classifyPublicationStatus(state, corpus);
  const recommendedAction = recommendedActionForPublicationStatus(publicationStatus);
  const predecessorEntries = corpus.filter((entry) => entry.snapshot.state.successorDocId === state.docId);
  const successorEntry = state.successorDocId
    ? (corpus.find((entry) => entry.snapshot.state.docId === state.successorDocId) ?? null)
    : null;
  const sameTopicEntries = state.topicId
    ? corpus.filter(
        (entry) => entry.snapshot.state.topicId === state.topicId && entry.snapshot.state.docId !== state.docId,
      )
    : [];
  const relatedEntries = [
    ...new Map(
      [...sameTopicEntries, ...predecessorEntries, ...(successorEntry ? [successorEntry] : [])].map((entry) => [
        entry.snapshot.state.docId,
        entry,
      ]),
    ).values(),
  ];

  const relatedDocs = relatedEntries
    .map((entry) => ({
      id: entry.snapshot.state.docId,
      title: entry.snapshot.state.title,
      status: entry.snapshot.state.status,
      docType: entry.snapshot.state.docType,
      topicRole: entry.snapshot.state.topicRole,
      updatedAt: entry.snapshot.state.updatedAt,
      publicationStatus: classifyPublicationStatus(entry.snapshot.state, corpus),
      relationship: relationshipForRelatedDoc(state, entry.snapshot.state, currentOwner?.snapshot.state.docId ?? null),
      ref: `documentation:${entry.snapshot.state.docId}`,
    }))
    .sort(sortRelatedDocs);

  return {
    publicationStatus,
    publicationSummary: publicationSummaryForState(state, publicationStatus, currentOwner),
    recommendedAction,
    currentOwnerDocId: currentOwner?.snapshot.state.docId ?? null,
    currentOwnerTitle: currentOwner?.snapshot.state.title ?? null,
    activeOwnerDocIds: activeOwners
      .map((entry) => entry.snapshot.state.docId)
      .sort((left, right) => left.localeCompare(right)),
    successorDocId: state.successorDocId,
    successorTitle: successorEntry?.snapshot.state.title ?? null,
    predecessorDocIds: predecessorEntries
      .map((entry) => entry.snapshot.state.docId)
      .sort((left, right) => left.localeCompare(right)),
    relatedDocs,
  };
}

function createAuditCountMap<TKind extends string>(values: readonly TKind[]): Record<TKind, number> {
  return values.reduce(
    (accumulator, value) => {
      accumulator[value] = 0;
      return accumulator;
    },
    {} as Record<TKind, number>,
  );
}

function auditFindingId(kind: DocumentationAuditFindingKind, docIds: readonly string[]): string {
  const normalizedDocIds = [...docIds].map((value) => normalizeDocRef(value)).sort();
  return `${kind}:${normalizedDocIds.join("+")}`;
}

function isTimestampAfter(candidate: string | null | undefined, baseline: string | null | undefined): boolean {
  if (!candidate || !baseline) {
    return false;
  }
  return candidate.localeCompare(baseline) > 0;
}

function mergeAuditScopeRefs(...refSets: readonly string[][]): string[] {
  return normalizeStringList(refSets.flatMap((entries) => entries));
}

function toAuditSubject(record: DocumentationReadResult): DocumentationAuditSubject {
  return {
    id: record.state.docId,
    title: record.state.title,
    status: record.state.status,
    docType: record.state.docType,
    topicId: record.state.topicId,
    topicRole: record.state.topicRole,
    sourceTarget: record.state.sourceTarget,
    verifiedAt: record.state.verifiedAt,
    verificationSource: record.state.verificationSource,
    updatedAt: record.state.updatedAt,
  };
}

function parseVerificationSource(value: string | null): { kind: string; ref: string } | null {
  const trimmed = normalizeOptionalString(value);
  if (!trimmed) {
    return null;
  }
  const separatorIndex = trimmed.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex === trimmed.length - 1) {
    return null;
  }
  return {
    kind: trimmed.slice(0, separatorIndex),
    ref: trimmed.slice(separatorIndex + 1).trim(),
  };
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
  const overviewScopePaths = renderPortableRepositoryPathList(record.overview.scopePaths);
  const linkedOutputPaths = renderPortableRepositoryPathList(record.state.linkedOutputPaths);
  const overviewLinkedOutputPaths = renderPortableRepositoryPathList(record.overview.linkedOutputPaths);
  return [
    record.summary.id,
    record.summary.title,
    record.summary.summary,
    record.summary.topicId ?? "",
    record.summary.topicRole,
    record.summary.governance.publicationStatus,
    record.summary.governance.publicationSummary,
    record.summary.governance.recommendedAction,
    record.summary.governance.currentOwnerDocId ?? "",
    record.summary.governance.currentOwnerTitle ?? "",
    record.summary.sourceRef,
    record.summary.successorDocId ?? "",
    record.state.sourceTarget.ref,
    record.state.verificationSource ?? "",
    record.state.retirementReason ?? "",
    renderVerificationSummary(record.state),
    renderLifecycleSummary(record.state),
    ...record.state.guideTopics,
    ...record.overview.guideTopics,
    ...record.state.audience,
    ...record.overview.audience,
    ...scopePaths,
    ...overviewScopePaths,
    ...linkedOutputPaths,
    ...overviewLinkedOutputPaths,
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
    if (!includesPublicationInDiscovery(summary.governance.publicationStatus, filter)) return false;
    if (filter.status && summary.status !== filter.status) return false;
    if (filter.docType && summary.docType !== filter.docType) return false;
    if (filter.sectionGroup && summary.sectionGroup !== filter.sectionGroup) return false;
    if (filter.sourceKind && summary.sourceKind !== filter.sourceKind) return false;
    if (filter.topic && record.state.topicId !== filter.topic && !record.state.guideTopics.includes(filter.topic)) {
      return false;
    }
    return true;
  });

  const summaries = filterAndSortListEntries(
    filtered.map((record) => ({
      item: record.summary,
      id: record.summary.id,
      createdAt: record.state.createdAt,
      updatedAt: record.summary.updatedAt,
      fields: [
        { value: record.summary.id, weight: 12 },
        { value: record.summary.title, weight: 10 },
        { value: record.summary.summary, weight: 9 },
        { value: record.summary.topicId ?? "", weight: 9 },
        { value: record.summary.topicRole, weight: 6 },
        { value: record.summary.governance.publicationStatus, weight: 7 },
        { value: record.summary.governance.publicationSummary, weight: 6 },
        { value: record.summary.governance.recommendedAction, weight: 5 },
        { value: record.summary.governance.currentOwnerDocId ?? "", weight: 6 },
        { value: record.summary.sourceRef, weight: 7 },
        { value: record.summary.successorDocId ?? "", weight: 6 },
        { value: record.state.guideTopics.join(" "), weight: 6 },
        { value: renderVerificationSummary(record.state), weight: 5 },
        { value: renderLifecycleSummary(record.state), weight: 5 },
        { value: renderPortableRepositoryPathList(record.state.scopePaths).join(" "), weight: 5 },
        { value: renderPortableRepositoryPathList(record.state.linkedOutputPaths).join(" "), weight: 5 },
        { value: documentationSearchText(record).join(" "), weight: 3 },
      ],
    })),
    { text: filter.text, sort: filter.sort },
  );

  if (filter.text || filter.sort) {
    return summaries;
  }

  return groupSummariesForTopicDiscovery(summaries);
}

function publicationDiscoveryWeight(summary: DocumentationReadResult["summary"]): number {
  switch (summary.governance.publicationStatus) {
    case "current-owner":
      return 0;
    case "overlapping-owner-debt":
      return 1;
    case "legacy-migration-debt":
      return 2;
    case "governed-without-owner":
      return 3;
    case "current-companion":
      return 4;
    case "historical-superseded":
      return 5;
    case "historical-archived":
      return 6;
  }
}

function docTypeDiscoveryWeight(summary: DocumentationReadResult["summary"]): number {
  switch (summary.docType) {
    case "overview":
      return 0;
    case "guide":
      return 1;
    case "workflow":
      return 2;
    case "concept":
      return 3;
    case "operations":
      return 4;
    case "faq":
      return 5;
  }
}

function compareTopicDiscoverySummary(
  left: DocumentationReadResult["summary"],
  right: DocumentationReadResult["summary"],
): number {
  return (
    publicationDiscoveryWeight(left) - publicationDiscoveryWeight(right) ||
    docTypeDiscoveryWeight(left) - docTypeDiscoveryWeight(right) ||
    right.updatedAt.localeCompare(left.updatedAt) ||
    left.id.localeCompare(right.id)
  );
}

function groupSummariesForTopicDiscovery(
  summaries: DocumentationReadResult["summary"][],
): DocumentationReadResult["summary"][] {
  const groups = new Map<string, DocumentationReadResult["summary"][]>();
  for (const summary of summaries) {
    const key = summary.topicId ?? "migration-debt";
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(summary);
      continue;
    }
    groups.set(key, [summary]);
  }

  return [...groups.entries()]
    .map(([topicKey, docs]) => ({
      topicKey,
      docs: [...docs].sort(compareTopicDiscoverySummary),
    }))
    .sort((left, right) => {
      const leftRepresentative = left.docs[0];
      const rightRepresentative = right.docs[0];
      const leftMigrationDebt = leftRepresentative.topicId ? 0 : 1;
      const rightMigrationDebt = rightRepresentative.topicId ? 0 : 1;
      return (
        leftMigrationDebt - rightMigrationDebt ||
        publicationDiscoveryWeight(leftRepresentative) - publicationDiscoveryWeight(rightRepresentative) ||
        rightRepresentative.updatedAt.localeCompare(leftRepresentative.updatedAt) ||
        left.topicKey.localeCompare(right.topicKey)
      );
    })
    .flatMap((group) => group.docs);
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

  if (state.successorDocId) {
    links.push({
      kind: "references",
      targetKind: "documentation",
      targetDisplayId: state.successorDocId,
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
  governance: DocumentationGovernanceSurface;
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
    this.cwd = resolveRuntimeScopeCwd(resolve(cwd));
    this.scope = scope;
  }

  initLedger(): { initialized: true; root: string } {
    return { initialized: true, root: getLoomCatalogPaths().catalogPath };
  }

  private async openWorkspaceStorage() {
    return openScopedWorkspaceStorage(this.cwd, this.scope);
  }

  private async readDocumentationCorpus(): Promise<{
    repositories: readonly LoomRepositoryRecord[];
    corpus: DocumentationCorpusEntry[];
  }> {
    const { storage, identity } = await this.openWorkspaceStorage();
    const entities = await storage.listEntities(identity.space.id, ENTITY_KIND);
    return {
      repositories: identity.repositories,
      corpus: entities.map((entity) => this.corpusEntryFromEntity(entity, identity.repositories)),
    };
  }

  private persistenceScopeForState(state: DocumentationState): LoomExplicitScopeInput {
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
      documentBody: this.extractDocumentBody(record.document, record.overview.documentRef),
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
        topicId: canonicalRecord.summary.topicId,
        topicRole: canonicalRecord.summary.topicRole,
        sourceTarget: canonicalRecord.state.sourceTarget,
        verifiedAt: canonicalRecord.summary.verifiedAt,
        successorDocId: canonicalRecord.summary.successorDocId,
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
          tags: [
            canonicalRecord.summary.docType,
            canonicalRecord.state.topicRole,
            ...(canonicalRecord.state.topicId ? [canonicalRecord.state.topicId] : []),
            ...canonicalRecord.state.guideTopics,
          ],
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
    return this.readDoc(canonicalRecord.state.docId);
  }

  private corpusEntryFromEntity(
    entity: LoomEntityRecord,
    repositories: readonly LoomRepositoryRecord[],
  ): DocumentationCorpusEntry {
    const fallback = this.portablePathFallback(repositories, entity.owningRepositoryId, null);
    const snapshot = this.readSnapshot(entity.attributes, fallback);
    if (!snapshot) {
      const docId = entity.displayId ?? entity.id;
      throw new Error(`Documentation entity ${docId} is missing structured attributes`);
    }
    return {
      snapshot,
      repositoryId: entity.owningRepositoryId,
    };
  }

  private async entityRecord(
    entity: LoomEntityRecord,
    repositories: readonly LoomRepositoryRecord[],
    corpus: readonly DocumentationCorpusEntry[],
  ): Promise<DocumentationReadResult> {
    const entry = this.corpusEntryFromEntity(entity, repositories);
    return this.buildCanonicalRecord(entry.snapshot, repositories, entry.repositoryId, corpus);
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
    const topicId = "topicId" in state ? normalizeTopicId((state as { topicId?: string | null }).topicId) : null;
    return {
      docId: normalizeDocId(docId),
      title,
      status: normalizeDocStatus(status),
      docType,
      sectionGroup: state.sectionGroup ? normalizeSectionGroup(state.sectionGroup) : sectionGroupForDocType(docType),
      topicId,
      topicRole:
        "topicRole" in state
          ? normalizeTopicRole((state as { topicRole?: string }).topicRole, defaultTopicRole(docType, topicId))
          : defaultTopicRole(docType, topicId),
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
      verifiedAt:
        "verifiedAt" in state ? normalizeOptionalString((state as { verifiedAt?: string | null }).verifiedAt) : null,
      verificationSource:
        "verificationSource" in state
          ? normalizeOptionalString((state as { verificationSource?: string | null }).verificationSource)
          : null,
      successorDocId:
        "successorDocId" in state
          ? normalizeSuccessorDocId((state as { successorDocId?: string | null }).successorDocId)
          : null,
      retirementReason:
        "retirementReason" in state
          ? normalizeOptionalString((state as { retirementReason?: string | null }).retirementReason)
          : null,
      updateReason: typeof state.updateReason === "string" ? state.updateReason.trim() : "",
      upstreamPath:
        "upstreamPath" in state
          ? normalizeOptionalString((state as { upstreamPath?: string | null }).upstreamPath)
          : null,
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

  private async validateLifecycleMetadata(state: DocumentationState): Promise<void> {
    if (state.topicRole !== "legacy" && !state.topicId) {
      throw new Error(`Documentation ${state.docId} must set topicId when topicRole is ${state.topicRole}.`);
    }
    if (state.topicRole === "legacy" && state.topicId) {
      throw new Error(`Documentation ${state.docId} cannot keep topicRole=legacy once topicId is set.`);
    }
    if (state.topicRole === "owner" && state.docType !== "overview") {
      throw new Error(`Documentation ${state.docId} can only use topicRole=owner when docType is overview.`);
    }
    if (state.topicRole === "companion" && state.docType === "overview") {
      throw new Error(`Documentation ${state.docId} cannot use docType=overview with topicRole=companion.`);
    }
    if (state.status !== "superseded" && (state.successorDocId || state.retirementReason)) {
      throw new Error(`Only superseded documentation may record successor or retirement metadata for ${state.docId}.`);
    }
    if (state.status === "superseded" && !state.successorDocId && !state.retirementReason) {
      throw new Error(`Superseded documentation ${state.docId} must record successorDocId or retirementReason.`);
    }
    if (!state.verifiedAt && state.verificationSource) {
      throw new Error(`Documentation ${state.docId} cannot record verificationSource without verifiedAt.`);
    }
    if (state.successorDocId) {
      if (state.successorDocId === state.docId) {
        throw new Error(`Documentation ${state.docId} cannot list itself as its successor.`);
      }
      const successor = await this.readDoc(state.successorDocId);
      if (successor.state.status !== "active") {
        throw new Error(
          `Documentation ${state.docId} can only supersede to active successor ${state.successorDocId}; got ${successor.state.status}.`,
        );
      }
      if (state.topicId && successor.state.topicId && successor.state.topicId !== state.topicId) {
        throw new Error(
          `Documentation ${state.docId} topic ${state.topicId} does not match successor ${successor.state.docId} topic ${successor.state.topicId}.`,
        );
      }
    }
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
    governance: DocumentationGovernanceSurface,
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
      governance,
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
    governance: DocumentationGovernanceSurface,
  ): Promise<string> {
    const context = await this.resolvePacketContextCanonical(state, revisions, documentBody, governance);
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
        "topic-id": state.topicId,
        "topic-role": state.topicRole,
        "publication-status": context.governance.publicationStatus,
        "publication-summary": context.governance.publicationSummary,
        "recommended-action": context.governance.recommendedAction,
        "current-owner": context.governance.currentOwnerDocId,
        "active-owners": context.governance.activeOwnerDocIds,
        source: `${state.sourceTarget.kind}:${state.sourceTarget.ref}`,
        audience: state.audience,
        "verified-at": state.verifiedAt,
        "verification-source": state.verificationSource,
        successor: state.successorDocId,
        predecessors: context.governance.predecessorDocIds,
        "retirement-reason": state.retirementReason,
        "created-at": state.createdAt,
        "updated-at": state.updatedAt,
      },
      [
        renderSection("Documentation Target", context.sourceSummary),
        renderSection("Update Reason", state.updateReason || "(empty)"),
        renderSection(
          "Governance Metadata",
          renderBulletList([
            `topic: ${state.topicId ?? "migration-debt"}`,
            `role: ${state.topicRole}`,
            `publication: ${context.governance.publicationStatus}`,
            `publication-summary: ${context.governance.publicationSummary}`,
            `current-owner: ${context.governance.currentOwnerDocId ?? "none"}`,
            `active-owners: ${context.governance.activeOwnerDocIds.join(", ") || "none"}`,
            `recommended-action: ${context.governance.recommendedAction}`,
            `verification: ${renderVerificationSummary(state)}`,
            `lifecycle: ${renderLifecycleSummary(state)}`,
          ]),
        ),
        renderSection(
          "Related Governed Docs",
          renderBulletList(
            context.governance.relatedDocs.map(
              (doc) => `${doc.id} [${doc.relationship}/${doc.status}/${doc.publicationStatus}] ${doc.title}`,
            ),
          ),
        ),
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
    corpus: readonly DocumentationCorpusEntry[] = [{ snapshot, repositoryId: repositoryId ?? null }],
  ): Promise<DocumentationReadResult> {
    const governance = buildGovernanceSurface(snapshot.state, corpus);
    const packet = await this.buildPacketCanonical(
      snapshot.state,
      snapshot.revisions,
      snapshot.documentBody,
      governance,
    );
    const document = renderDocumentationMarkdown(snapshot.state, governance, snapshot.documentBody);
    const repository = resolveRepositoryQualifier(
      repositories ?? (await this.openWorkspaceStorage()).identity.repositories,
      repositoryId,
    );
    return {
      state: snapshot.state,
      summary: summarizeDocumentation(snapshot.state, snapshot.revisions.length, governance, repository),
      packet,
      document,
      revisions: snapshot.revisions,
      overview: buildDocumentationOverview(snapshot.state, snapshot.revisions, governance, repository),
      governance,
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
    const topicId = normalizeTopicId(input.topicId);
    return {
      docId,
      title: input.title.trim(),
      status: "active",
      docType,
      sectionGroup: sectionGroupForDocType(docType),
      topicId,
      topicRole: normalizeTopicRole(input.topicRole, defaultTopicRole(docType, topicId)),
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
      verifiedAt: normalizeOptionalString(input.verifiedAt),
      verificationSource: normalizeOptionalString(input.verificationSource),
      successorDocId: normalizeSuccessorDocId(input.successorDocId),
      retirementReason: normalizeOptionalString(input.retirementReason),
      updateReason:
        input.updateReason?.trim() ||
        `Keep ${input.title.trim()} truthful after completed work changes system understanding.`,
      guideTopics: normalizeStringList(input.guideTopics),
      linkedOutputPaths: await resolvePortableRepositoryPathInputs(this.cwd, input.linkedOutputPaths, this.scope),
      upstreamPath: normalizeOptionalString(input.upstreamPath),
      lastRevisionId: null,
    };
  }

  async initLedgerAsync(): Promise<{ initialized: true; root: string }> {
    return this.initLedger();
  }

  async listDocs(filter: DocumentationListFilter = {}): Promise<DocumentationReadResult["summary"][]> {
    const { storage, identity } = await this.openWorkspaceStorage();
    const { corpus } = await this.readDocumentationCorpus();
    const entities = await storage.listEntities(identity.space.id, ENTITY_KIND);
    const records = await Promise.all(
      entities.map((entity) => this.entityRecord(entity, identity.repositories, corpus)),
    );
    return filterAndSortDocumentationSummaries(records, filter);
  }

  async listDocsLinkedToTicket(ticketRef: string): Promise<DocumentationReadResult["summary"][]> {
    const ticketId = normalizeOptionalString(ticketRef);
    if (!ticketId) {
      return [];
    }

    const summaries = await this.listDocs({ includeSupporting: true, includeHistorical: true });
    const records = await Promise.all(summaries.map((summary) => this.readDoc(summary.id)));
    return records
      .filter(
        (record) =>
          (record.state.sourceTarget.kind === "ticket" &&
            normalizeTicketRef(record.state.sourceTarget.ref) === ticketId) ||
          record.state.contextRefs.ticketIds.includes(ticketId),
      )
      .map((record) => record.summary)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id));
  }

  async readDoc(ref: string): Promise<DocumentationReadResult> {
    const { storage, identity } = await this.openWorkspaceStorage();
    const { corpus } = await this.readDocumentationCorpus();
    const docId = normalizeDocRef(ref);
    const entity = await findEntityByDisplayId(storage, identity.space.id, ENTITY_KIND, docId);
    if (!entity) {
      throw new Error(`Unknown documentation: ${docId}`);
    }
    return this.entityRecord(entity, identity.repositories, corpus);
  }

  async auditGovernance(ref?: string): Promise<DocumentationAuditReport> {
    const targetRef = ref ? normalizeDocRef(ref) : null;
    const summaries = await this.listDocs({ includeSupporting: true, includeHistorical: true });
    const records = await Promise.all(summaries.map((summary) => this.readDoc(summary.id)));
    const targetRecords = targetRef ? records.filter((record) => record.state.docId === targetRef) : records;
    if (targetRef && targetRecords.length === 0) {
      throw new Error(`Unknown documentation: ${targetRef}`);
    }

    const activeRecords = records.filter((record) => record.state.status === "active");
    const subjects = (targetRef ? targetRecords : activeRecords).map(toAuditSubject);
    const constitution = await this.readConstitutionIfPresentAsync();
    const roadmapUpdatedAt = new Map(
      (constitution?.state.roadmapItems ?? []).map((item) => [item.id, item.updatedAt] as const),
    );
    const findings: DocumentationAuditFinding[] = [];
    const relevantScopePaths = (targetRef ? targetRecords : activeRecords).flatMap((record) => record.state.scopePaths);
    const scopePaths = relevantScopePaths.filter(
      (entry, index, all) => all.findIndex((candidate) => candidate.displayPath === entry.displayPath) === index,
    );
    const contextRefs = mergeContextRefs(
      ...(targetRef ? targetRecords : activeRecords).map((record) => record.state.contextRefs),
    );

    const pushFinding = (finding: DocumentationAuditFinding) => {
      if (targetRef && !finding.docIds.includes(targetRef)) {
        return;
      }
      findings.push(finding);
    };

    const buildFinding = (
      kind: DocumentationAuditFindingKind,
      severity: DocumentationAuditFindingSeverity,
      docIds: readonly string[],
      title: string,
      summary: string,
      evidence: readonly string[],
      recommendedAction: string,
      scopeRefs: readonly string[],
    ): DocumentationAuditFinding => ({
      id: auditFindingId(kind, docIds),
      kind,
      severity,
      title,
      summary,
      docIds: [...docIds].map((value) => normalizeDocRef(value)).sort(),
      scopeRefs: mergeAuditScopeRefs(...scopeRefs.map((value) => [value])),
      evidence: normalizeStringList(evidence),
      recommendedAction,
    });

    const resolveLinkedRecordUpdatedAt = async (
      kind: DocumentationState["sourceTarget"]["kind"],
      linkedRef: string,
    ): Promise<{ updatedAt: string | null; missing: boolean; label: string }> => {
      switch (kind) {
        case "workspace":
          return { updatedAt: null, missing: false, label: `workspace:${linkedRef}` };
        case "initiative": {
          const initiative = await this.safeReadInitiativeAsync(linkedRef);
          return {
            updatedAt: initiative?.state.updatedAt ?? null,
            missing: !initiative,
            label: `initiative:${linkedRef}`,
          };
        }
        case "spec": {
          const spec = await this.safeReadSpecAsync(linkedRef);
          return { updatedAt: spec?.state.updatedAt ?? null, missing: !spec, label: `spec:${linkedRef}` };
        }
        case "ticket": {
          const ticket = await this.safeReadTicketAsync(linkedRef);
          return { updatedAt: ticket?.summary.updatedAt ?? null, missing: !ticket, label: `ticket:${linkedRef}` };
        }
        case "critique": {
          const critique = await this.safeReadCritiqueAsync(linkedRef);
          return { updatedAt: critique?.state.updatedAt ?? null, missing: !critique, label: `critique:${linkedRef}` };
        }
      }
    };

    const resolveVerificationUpdatedAt = async (
      verificationSource: string | null,
    ): Promise<{ updatedAt: string | null; missing: boolean; label: string } | null> => {
      const parsed = parseVerificationSource(verificationSource);
      if (!parsed) {
        return null;
      }
      switch (parsed.kind) {
        case "ticket": {
          const ticket = await this.safeReadTicketAsync(parsed.ref);
          return { updatedAt: ticket?.summary.updatedAt ?? null, missing: !ticket, label: `ticket:${parsed.ref}` };
        }
        case "critique": {
          const critique = await this.safeReadCritiqueAsync(parsed.ref);
          return { updatedAt: critique?.state.updatedAt ?? null, missing: !critique, label: `critique:${parsed.ref}` };
        }
        case "spec": {
          const spec = await this.safeReadSpecAsync(parsed.ref);
          return { updatedAt: spec?.state.updatedAt ?? null, missing: !spec, label: `spec:${parsed.ref}` };
        }
        case "initiative": {
          const initiative = await this.safeReadInitiativeAsync(parsed.ref);
          return {
            updatedAt: initiative?.state.updatedAt ?? null,
            missing: !initiative,
            label: `initiative:${parsed.ref}`,
          };
        }
        case "research": {
          const research = await this.safeReadResearchAsync(parsed.ref);
          return { updatedAt: research?.state.updatedAt ?? null, missing: !research, label: `research:${parsed.ref}` };
        }
        case "roadmap":
          return {
            updatedAt: roadmapUpdatedAt.get(parsed.ref) ?? null,
            missing: !roadmapUpdatedAt.has(parsed.ref),
            label: `roadmap:${parsed.ref}`,
          };
        default:
          return null;
      }
    };

    for (const record of activeRecords) {
      const scopeRefs = [
        `documentation:${record.state.docId}`,
        ...record.state.scopePaths.map((entry) => entry.displayPath),
      ];
      const orphanEvidence: string[] = [];

      if (!record.state.topicId || record.state.topicRole === "legacy") {
        orphanEvidence.push(
          `Documentation ${record.state.docId} still uses topic=${record.state.topicId ?? "migration-debt"} role=${record.state.topicRole}.`,
        );
      }

      const sourceTargetStatus = await resolveLinkedRecordUpdatedAt(
        record.state.sourceTarget.kind,
        record.state.sourceTarget.ref,
      );
      if (record.state.sourceTarget.kind !== "workspace" && sourceTargetStatus.missing) {
        orphanEvidence.push(`Source target ${sourceTargetStatus.label} no longer resolves from canonical storage.`);
      }

      if (record.state.upstreamPath) {
        try {
          await stat(resolve(this.cwd, record.state.upstreamPath));
        } catch {
          orphanEvidence.push(`Upstream path ${record.state.upstreamPath} no longer exists in the repository.`);
        }
      }

      const missingContextRefs: string[] = [];
      for (const roadmapItemId of record.state.contextRefs.roadmapItemIds) {
        if (!roadmapUpdatedAt.has(roadmapItemId)) {
          missingContextRefs.push(`roadmap:${roadmapItemId}`);
        }
      }
      for (const initiativeId of record.state.contextRefs.initiativeIds) {
        if (!(await this.safeReadInitiativeAsync(initiativeId))) {
          missingContextRefs.push(`initiative:${initiativeId}`);
        }
      }
      for (const researchId of record.state.contextRefs.researchIds) {
        if (!(await this.safeReadResearchAsync(researchId))) {
          missingContextRefs.push(`research:${researchId}`);
        }
      }
      for (const specChangeId of record.state.contextRefs.specChangeIds) {
        if (!(await this.safeReadSpecAsync(specChangeId))) {
          missingContextRefs.push(`spec:${specChangeId}`);
        }
      }
      for (const ticketId of record.state.contextRefs.ticketIds) {
        if (!(await this.safeReadTicketAsync(ticketId))) {
          missingContextRefs.push(`ticket:${ticketId}`);
        }
      }
      for (const critiqueId of record.state.contextRefs.critiqueIds) {
        if (!(await this.safeReadCritiqueAsync(critiqueId))) {
          missingContextRefs.push(`critique:${critiqueId}`);
        }
      }
      if (missingContextRefs.length > 0) {
        orphanEvidence.push(`Context refs no longer resolve: ${missingContextRefs.join(", ")}.`);
      }

      const verificationStatus = await resolveVerificationUpdatedAt(record.state.verificationSource);
      if (verificationStatus?.missing) {
        orphanEvidence.push(
          `Verification source ${verificationStatus.label} no longer resolves from canonical storage.`,
        );
      }

      if (orphanEvidence.length > 0) {
        pushFinding(
          buildFinding(
            "orphaned",
            "high",
            [record.state.docId],
            `Documentation ${record.state.docId} lacks maintainable governance provenance`,
            "The document cannot currently be traced back to durable ownership or supporting provenance strongly enough to treat it as trustworthy current explanation.",
            orphanEvidence,
            "Update the document to record governed topic ownership, repair broken source/context links, or archive/supersede it if the owning context no longer exists.",
            scopeRefs,
          ),
        );
      }

      const unverifiedEvidence: string[] = [];
      if (!record.state.verifiedAt) {
        unverifiedEvidence.push(`Documentation ${record.state.docId} has no verifiedAt timestamp.`);
      }
      if (!record.state.verificationSource) {
        unverifiedEvidence.push(`Documentation ${record.state.docId} has no verificationSource.`);
      }
      if (unverifiedEvidence.length > 0) {
        pushFinding(
          buildFinding(
            "unverified",
            "medium",
            [record.state.docId],
            `Documentation ${record.state.docId} is missing verification evidence`,
            "The document lacks the review timestamp or durable verification source needed to treat its current claims as audited explanatory truth.",
            unverifiedEvidence,
            "Record a fresh docs review with verifiedAt and verificationSource after checking the document against the current owning work.",
            scopeRefs,
          ),
        );
      }

      const staleEvidence: string[] = [];
      if (record.state.verifiedAt) {
        if (isTimestampAfter(record.state.updatedAt, record.state.verifiedAt)) {
          staleEvidence.push(
            `Documentation ${record.state.docId} was updated at ${record.state.updatedAt} after its last verification at ${record.state.verifiedAt}.`,
          );
        }
        if (sourceTargetStatus.updatedAt && isTimestampAfter(sourceTargetStatus.updatedAt, record.state.verifiedAt)) {
          staleEvidence.push(
            `Source target ${sourceTargetStatus.label} changed at ${sourceTargetStatus.updatedAt} after the doc was verified at ${record.state.verifiedAt}.`,
          );
        }
        for (const roadmapItemId of record.state.contextRefs.roadmapItemIds) {
          const updatedAt = roadmapUpdatedAt.get(roadmapItemId) ?? null;
          if (isTimestampAfter(updatedAt, record.state.verifiedAt)) {
            staleEvidence.push(
              `Roadmap item ${roadmapItemId} changed at ${updatedAt} after the doc was verified at ${record.state.verifiedAt}.`,
            );
          }
        }
        for (const initiativeId of record.state.contextRefs.initiativeIds) {
          const initiative = await this.safeReadInitiativeAsync(initiativeId);
          if (isTimestampAfter(initiative?.state.updatedAt, record.state.verifiedAt)) {
            staleEvidence.push(
              `Initiative ${initiativeId} changed at ${initiative?.state.updatedAt} after the doc was verified at ${record.state.verifiedAt}.`,
            );
          }
        }
        for (const researchId of record.state.contextRefs.researchIds) {
          const research = await this.safeReadResearchAsync(researchId);
          if (isTimestampAfter(research?.state.updatedAt, record.state.verifiedAt)) {
            staleEvidence.push(
              `Research ${researchId} changed at ${research?.state.updatedAt} after the doc was verified at ${record.state.verifiedAt}.`,
            );
          }
        }
        for (const specChangeId of record.state.contextRefs.specChangeIds) {
          const spec = await this.safeReadSpecAsync(specChangeId);
          if (isTimestampAfter(spec?.state.updatedAt, record.state.verifiedAt)) {
            staleEvidence.push(
              `Spec ${specChangeId} changed at ${spec?.state.updatedAt} after the doc was verified at ${record.state.verifiedAt}.`,
            );
          }
        }
        for (const ticketId of record.state.contextRefs.ticketIds) {
          const ticket = await this.safeReadTicketAsync(ticketId);
          if (isTimestampAfter(ticket?.summary.updatedAt, record.state.verifiedAt)) {
            staleEvidence.push(
              `Ticket ${ticketId} changed at ${ticket?.summary.updatedAt} after the doc was verified at ${record.state.verifiedAt}.`,
            );
          }
        }
        for (const critiqueId of record.state.contextRefs.critiqueIds) {
          const critique = await this.safeReadCritiqueAsync(critiqueId);
          if (isTimestampAfter(critique?.state.updatedAt, record.state.verifiedAt)) {
            staleEvidence.push(
              `Critique ${critiqueId} changed at ${critique?.state.updatedAt} after the doc was verified at ${record.state.verifiedAt}.`,
            );
          }
        }
        if (verificationStatus?.updatedAt && isTimestampAfter(verificationStatus.updatedAt, record.state.verifiedAt)) {
          staleEvidence.push(
            `Verification source ${verificationStatus.label} changed at ${verificationStatus.updatedAt} after the doc was verified at ${record.state.verifiedAt}.`,
          );
        }
        if (record.state.upstreamPath) {
          try {
            const upstreamStats = await stat(resolve(this.cwd, record.state.upstreamPath));
            const upstreamUpdatedAt = upstreamStats.mtime.toISOString();
            if (isTimestampAfter(upstreamUpdatedAt, record.state.verifiedAt)) {
              staleEvidence.push(
                `Upstream path ${record.state.upstreamPath} changed at ${upstreamUpdatedAt} after the doc was verified at ${record.state.verifiedAt}.`,
              );
            }
          } catch {
            // Missing paths are handled as orphaned provenance above.
          }
        }
      }
      if (staleEvidence.length > 0) {
        pushFinding(
          buildFinding(
            "stale",
            "medium",
            [record.state.docId],
            `Documentation ${record.state.docId} is stale relative to its governing context`,
            "The linked work or the documentation body changed after the last recorded review, so the current explanation may no longer match accepted reality.",
            staleEvidence,
            "Review the document against the changed sources, update or supersede it as needed, then refresh verifiedAt and verificationSource.",
            scopeRefs,
          ),
        );
      }
    }

    const overlapGroups = new Map<string, DocumentationReadResult[]>();
    for (const record of activeRecords) {
      if (!record.state.topicId) {
        continue;
      }
      const groupKey = `${record.state.topicId}:${record.state.docType}`;
      const group = overlapGroups.get(groupKey) ?? [];
      group.push(record);
      overlapGroups.set(groupKey, group);
    }
    for (const [groupKey, group] of overlapGroups.entries()) {
      if (group.length < 2) {
        continue;
      }
      const [topicId, docType] = groupKey.split(":");
      const docIds = group.map((record) => record.state.docId);
      pushFinding(
        buildFinding(
          "overlapping",
          docType === "overview" ? "high" : "medium",
          docIds,
          `Active ${docType} docs overlap on topic ${topicId}`,
          "Multiple active documents currently claim the same governed topic and document type, so the curated surface no longer has one explainable owner for that slice of truth.",
          group.map(
            (record) =>
              `${record.state.docId} is active as ${record.state.docType}/${record.state.topicRole} for topic ${record.state.topicId}.`,
          ),
          docType === "overview"
            ? "Keep exactly one active overview for the topic. Update the canonical owner or supersede/archive the extra overview documents."
            : "Narrow or consolidate the companion docs so only one active document of this type remains for the topic, or move the extra material under a different doc type.",
          group.flatMap((record) => [
            `documentation:${record.state.docId}`,
            ...record.state.scopePaths.map((entry) => entry.displayPath),
          ]),
        ),
      );
    }

    const byKind = createAuditCountMap(["stale", "overlapping", "orphaned", "unverified"] as const);
    const bySeverity = createAuditCountMap(["low", "medium", "high", "critical"] as const);
    for (const finding of findings) {
      byKind[finding.kind] += 1;
      bySeverity[finding.severity] += 1;
    }

    return {
      generatedAt: currentTimestamp(),
      ref: targetRef,
      subjects,
      findings,
      scopePaths,
      contextRefs,
      counts: {
        docsAudited: subjects.length,
        findings: findings.length,
        byKind,
        bySeverity,
      },
    };
  }

  async createDoc(input: CreateDocumentationInput): Promise<DocumentationReadResult> {
    const timestamp = currentTimestamp();
    const docId = await this.nextDocId(input.title);
    const state = await this.createDefaultState(input, docId, timestamp);
    await this.validateLifecycleMetadata(state);
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
    options?: { changedSections?: readonly string[]; documentUpdated?: boolean; revisionCreatedAt?: string },
  ): Promise<DocumentationRevisionRecord> {
    const revisionId = nextSequenceId(
      current.revisions.map((entry) => entry.id),
      "rev",
    );
    const { corpus } = await this.readDocumentationCorpus();
    const revisionCorpus = [
      ...corpus.filter((entry) => entry.snapshot.state.docId !== current.state.docId),
      {
        snapshot: {
          state: nextState,
          revisions: current.revisions,
          documentBody,
        },
        repositoryId: current.summary.repository?.id ?? this.scope.repositoryId ?? null,
      },
    ];
    const packetForRevision = await this.buildPacketCanonical(
      nextState,
      current.revisions,
      documentBody,
      buildGovernanceSurface(nextState, revisionCorpus),
    );
    return {
      id: revisionId,
      docId: current.state.docId,
      createdAt: options?.revisionCreatedAt ?? nextState.updatedAt,
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
    const revisionCreatedAt = currentTimestamp();
    const documentBody =
      input.document?.trim() ||
      this.extractDocumentBody(current.document, current.overview.documentRef) ||
      this.defaultDocumentBody(current.state);
    const documentUpdated = input.document !== undefined;
    // Verification-only refreshes record a new revision event but must not make the document
    // appear freshly edited; otherwise docs_audit immediately flags the review as stale again.
    const verificationOnlyRefresh =
      !documentUpdated &&
      input.title === undefined &&
      input.summary === undefined &&
      input.topicId === undefined &&
      input.topicRole === undefined &&
      input.audience === undefined &&
      input.scopePaths === undefined &&
      input.contextRefs === undefined &&
      input.sourceTarget === undefined &&
      input.successorDocId === undefined &&
      input.retirementReason === undefined &&
      input.guideTopics === undefined &&
      input.linkedOutputPaths === undefined &&
      input.upstreamPath === undefined;
    const nextState: DocumentationState = {
      ...current.state,
      title: input.title?.trim() ?? current.state.title,
      updatedAt: verificationOnlyRefresh ? current.state.updatedAt : revisionCreatedAt,
      summary: input.summary?.trim() ?? (documentUpdated ? summarizeDocument(documentBody) : current.state.summary),
      topicId: input.topicId !== undefined ? normalizeTopicId(input.topicId) : current.state.topicId,
      topicRole:
        input.topicRole !== undefined || input.topicId !== undefined
          ? normalizeTopicRole(
              input.topicRole,
              defaultTopicRole(
                current.state.docType,
                input.topicId !== undefined ? normalizeTopicId(input.topicId) : current.state.topicId,
              ),
            )
          : current.state.topicRole,
      audience: input.audience ? normalizeAudience(input.audience) : current.state.audience,
      scopePaths: input.scopePaths
        ? await resolvePortableRepositoryPathInputs(this.cwd, input.scopePaths, this.scope)
        : current.state.scopePaths,
      contextRefs: input.contextRefs ? normalizeContextRefs(input.contextRefs) : current.state.contextRefs,
      sourceTarget: input.sourceTarget
        ? { kind: normalizeSourceTargetKind(input.sourceTarget.kind), ref: input.sourceTarget.ref.trim() }
        : current.state.sourceTarget,
      verifiedAt: input.verifiedAt !== undefined ? normalizeOptionalString(input.verifiedAt) : current.state.verifiedAt,
      verificationSource:
        input.verificationSource !== undefined
          ? normalizeOptionalString(input.verificationSource)
          : current.state.verificationSource,
      successorDocId:
        input.successorDocId !== undefined
          ? normalizeSuccessorDocId(input.successorDocId)
          : current.state.successorDocId,
      retirementReason:
        input.retirementReason !== undefined
          ? normalizeOptionalString(input.retirementReason)
          : current.state.retirementReason,
      updateReason: input.updateReason?.trim() ?? current.state.updateReason,
      guideTopics: input.guideTopics ? normalizeStringList(input.guideTopics) : current.state.guideTopics,
      linkedOutputPaths: input.linkedOutputPaths
        ? await resolvePortableRepositoryPathInputs(this.cwd, input.linkedOutputPaths, this.scope)
        : current.state.linkedOutputPaths,
      upstreamPath:
        input.upstreamPath !== undefined ? normalizeOptionalString(input.upstreamPath) : current.state.upstreamPath,
    };
    await this.validateLifecycleMetadata(nextState);
    const revision = await this.buildAppendedRevision(current, nextState, documentBody, {
      changedSections: input.changedSections,
      documentUpdated,
      revisionCreatedAt,
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
      this.extractDocumentBody(current.document, current.overview.documentRef) ||
      this.defaultDocumentBody(current.state);
    const nextState: DocumentationState = {
      ...current.state,
      status: "archived",
      updatedAt: currentTimestamp(),
      updateReason: archiveReason(current.state.title),
      successorDocId: null,
      retirementReason: null,
    };
    await this.validateLifecycleMetadata(nextState);
    const revision = await this.buildAppendedRevision(current, nextState, documentBody);
    return this.upsertCanonicalRecord(
      await this.buildCanonicalRecord({
        state: { ...nextState, lastRevisionId: revision.id },
        revisions: [...current.revisions, revision],
        documentBody,
      }),
    );
  }

  async supersedeDoc(ref: string, input: UpdateDocumentationInput = {}): Promise<DocumentationReadResult> {
    const current = await this.readDoc(ref);
    if (current.state.status === "archived") {
      throw new Error(`Cannot supersede archived documentation: ${current.state.docId}`);
    }
    const documentBody =
      this.extractDocumentBody(current.document, current.overview.documentRef) ||
      this.defaultDocumentBody(current.state);
    const nextTopicId = input.topicId !== undefined ? normalizeTopicId(input.topicId) : current.state.topicId;
    const nextState: DocumentationState = {
      ...current.state,
      title: input.title?.trim() ?? current.state.title,
      status: "superseded",
      updatedAt: currentTimestamp(),
      summary: input.summary?.trim() ?? current.state.summary,
      topicId: nextTopicId,
      topicRole:
        input.topicRole !== undefined || input.topicId !== undefined
          ? normalizeTopicRole(input.topicRole, defaultTopicRole(current.state.docType, nextTopicId))
          : current.state.topicRole,
      audience: input.audience ? normalizeAudience(input.audience) : current.state.audience,
      scopePaths: input.scopePaths
        ? await resolvePortableRepositoryPathInputs(this.cwd, input.scopePaths, this.scope)
        : current.state.scopePaths,
      contextRefs: input.contextRefs ? normalizeContextRefs(input.contextRefs) : current.state.contextRefs,
      sourceTarget: input.sourceTarget
        ? { kind: normalizeSourceTargetKind(input.sourceTarget.kind), ref: input.sourceTarget.ref.trim() }
        : current.state.sourceTarget,
      verifiedAt: input.verifiedAt !== undefined ? normalizeOptionalString(input.verifiedAt) : current.state.verifiedAt,
      verificationSource:
        input.verificationSource !== undefined
          ? normalizeOptionalString(input.verificationSource)
          : current.state.verificationSource,
      successorDocId:
        input.successorDocId !== undefined
          ? normalizeSuccessorDocId(input.successorDocId)
          : current.state.successorDocId,
      retirementReason:
        input.retirementReason !== undefined
          ? normalizeOptionalString(input.retirementReason)
          : current.state.retirementReason,
      updateReason:
        input.updateReason?.trim() ??
        `Supersede ${current.state.title} after explanatory truth moves to ${
          input.successorDocId?.trim() || current.state.successorDocId || "a retired topic state"
        }.`,
      guideTopics: input.guideTopics ? normalizeStringList(input.guideTopics) : current.state.guideTopics,
      linkedOutputPaths: input.linkedOutputPaths
        ? await resolvePortableRepositoryPathInputs(this.cwd, input.linkedOutputPaths, this.scope)
        : current.state.linkedOutputPaths,
      upstreamPath:
        input.upstreamPath !== undefined ? normalizeOptionalString(input.upstreamPath) : current.state.upstreamPath,
    };
    await this.validateLifecycleMetadata(nextState);
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
