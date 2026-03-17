import { createHash } from "node:crypto";
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
import { basename, dirname, join, resolve } from "node:path";
import type { ConstitutionalRecord } from "@pi-loom/pi-constitution/extensions/domain/models.js";
import { createConstitutionalStore } from "@pi-loom/pi-constitution/extensions/domain/store.js";
import type { CritiqueReadResult } from "@pi-loom/pi-critique/extensions/domain/models.js";
import { createCritiqueStore } from "@pi-loom/pi-critique/extensions/domain/store.js";
import type { InitiativeRecord } from "@pi-loom/pi-initiatives/extensions/domain/models.js";
import { createInitiativeStore } from "@pi-loom/pi-initiatives/extensions/domain/store.js";
import type { ResearchRecord } from "@pi-loom/pi-research/extensions/domain/models.js";
import { createResearchStore } from "@pi-loom/pi-research/extensions/domain/store.js";
import type { SpecChangeRecord } from "@pi-loom/pi-specs/extensions/domain/models.js";
import { createSpecStore } from "@pi-loom/pi-specs/extensions/domain/store.js";
import type { LoomEntityRecord } from "@pi-loom/pi-storage/storage/contract.js";
import {
  findEntityByDisplayId,
  upsertEntityByDisplayId,
  upsertProjectionForEntity,
} from "@pi-loom/pi-storage/storage/entities.js";
import { openWorkspaceStorage } from "@pi-loom/pi-storage/storage/workspace.js";
import type { TicketReadResult } from "@pi-loom/pi-ticketing/extensions/domain/models.js";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import { buildDocumentationDashboard, summarizeDocumentation } from "./dashboard.js";
import { parseMarkdownArtifact, renderBulletList, renderSection, serializeMarkdownArtifact } from "./frontmatter.js";
import type {
  CreateDocumentationInput,
  DocSectionGroup,
  DocsContextRefs,
  DocumentationListFilter,
  DocumentationReadResult,
  DocumentationRevisionRecord,
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
  normalizeSectionGroup,
  normalizeSourceTargetKind,
  normalizeStringList,
  sectionGroupForDocType,
  slugifyTitle,
  summarizeDocument,
} from "./normalize.js";
import {
  getDocumentationDir,
  getDocumentationMarkdownPath,
  getDocumentationPacketPath,
  getDocumentationPaths,
  getDocumentationRevisionsPath,
  getDocumentationStatePath,
} from "./paths.js";
import { renderDocumentationMarkdown } from "./render.js";

const ENTITY_KIND = "documentation" as const;

interface DocumentationEntityAttributes {
  record: DocumentationReadResult;
}

interface DocumentationSnapshot {
  state: DocumentationState;
  revisions: DocumentationRevisionRecord[];
  documentBody: string;
}

function hasStructuredDocumentationAttributes(attributes: unknown): attributes is DocumentationEntityAttributes {
  return Boolean(attributes && typeof attributes === "object" && "record" in attributes);
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

function appendJsonl(path: string, value: unknown): void {
  ensureDir(dirname(path));
  appendFileSync(path, `${JSON.stringify(value)}\n`, "utf-8");
}

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) {
    return [];
  }
  return readFileSync(path, "utf-8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
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
    specChangeIds: ticket.ticket.frontmatter["spec-change"] ? [ticket.ticket.frontmatter["spec-change"]] : [],
    ticketIds: [ticket.summary.id],
  });
}

function deriveContextRefsFromSpec(change: SpecChangeRecord): DocsContextRefs {
  return mergeContextRefs({
    initiativeIds: change.state.initiativeIds,
    researchIds: change.state.researchIds,
    specChangeIds: [change.state.changeId],
    ticketIds: change.projection?.tickets.map((ticket) => ticket.ticketId) ?? [],
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

  constructor(cwd: string) {
    this.cwd = resolve(cwd);
  }

  initLedger(): { initialized: true; root: string } {
    const paths = getDocumentationPaths(this.cwd);
    ensureDir(paths.overviewsDir);
    ensureDir(paths.guidesDir);
    ensureDir(paths.conceptsDir);
    ensureDir(paths.operationsDir);
    return { initialized: true, root: paths.docsDir };
  }

  private async upsertCanonicalRecord(record: DocumentationReadResult): Promise<DocumentationReadResult> {
    const canonicalRecord = await this.buildCanonicalRecord({
      state: record.state,
      revisions: record.revisions,
      documentBody: this.extractDocumentBody(record.document, record.dashboard.documentPath),
    });
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const existing = await findEntityByDisplayId(storage, identity.space.id, ENTITY_KIND, canonicalRecord.summary.id);
    const version = (existing?.version ?? 0) + 1;
    const entity = await upsertEntityByDisplayId(storage, {
      kind: ENTITY_KIND,
      spaceId: identity.space.id,
      owningRepositoryId: identity.repository.id,
      displayId: canonicalRecord.summary.id,
      title: canonicalRecord.summary.title,
      summary: canonicalRecord.state.summary,
      status: canonicalRecord.summary.status,
      version,
      tags: [canonicalRecord.summary.docType, ...canonicalRecord.state.guideTopics],
      pathScopes: [
        { repositoryId: identity.repository.id, relativePath: canonicalRecord.summary.path, role: "canonical" },
        {
          repositoryId: identity.repository.id,
          relativePath: canonicalRecord.dashboard.packetPath,
          role: "projection",
        },
        {
          repositoryId: identity.repository.id,
          relativePath: canonicalRecord.dashboard.documentPath,
          role: "projection",
        },
      ],
      attributes: { record: canonicalRecord },
      createdAt: existing?.createdAt ?? canonicalRecord.state.createdAt,
      updatedAt: canonicalRecord.state.updatedAt,
    });
    await upsertProjectionForEntity(
      storage,
      entity.id,
      "packet_markdown_projection",
      "repo_materialized",
      identity.repository.id,
      canonicalRecord.dashboard.packetPath,
      canonicalRecord.packet,
      version,
      canonicalRecord.state.createdAt,
      canonicalRecord.state.updatedAt,
    );
    await upsertProjectionForEntity(
      storage,
      entity.id,
      "documentation_markdown_body",
      "repo_materialized",
      identity.repository.id,
      canonicalRecord.dashboard.documentPath,
      canonicalRecord.document,
      version,
      canonicalRecord.state.createdAt,
      canonicalRecord.state.updatedAt,
    );
    return canonicalRecord;
  }

  private async entityRecord(entity: LoomEntityRecord): Promise<DocumentationReadResult> {
    if (!hasStructuredDocumentationAttributes(entity.attributes)) {
      const docId = entity.displayId ?? entity.id;
      throw new Error(`Documentation entity ${docId} is missing structured attributes`);
    }
    return this.buildCanonicalRecord({
      state: entity.attributes.record.state,
      revisions: entity.attributes.record.revisions,
      documentBody: this.extractDocumentBody(
        entity.attributes.record.document,
        entity.attributes.record.dashboard.documentPath,
      ),
    });
  }

  private sectionGroups(): DocSectionGroup[] {
    return ["overviews", "guides", "concepts", "operations"];
  }

  private documentationDirectories(): string[] {
    const paths = getDocumentationPaths(this.cwd);
    const sections = [paths.overviewsDir, paths.guidesDir, paths.conceptsDir, paths.operationsDir];
    return sections
      .flatMap((sectionDir) => {
        if (!existsSync(sectionDir)) {
          return [];
        }
        return readdirSync(sectionDir)
          .map((entry) => join(sectionDir, entry))
          .filter((path) => statSync(path).isDirectory() && existsSync(join(path, "state.json")));
      })
      .sort((left, right) => basename(left).localeCompare(basename(right)));
  }

  private nextDocId(baseTitle: string): string {
    const baseId = slugifyTitle(baseTitle);
    const existing = new Set(this.documentationDirectories().map((directory) => basename(directory)));
    if (!existing.has(baseId)) {
      return baseId;
    }
    let attempt = 2;
    while (existing.has(`${baseId}-${attempt}`)) {
      attempt += 1;
    }
    return `${baseId}-${attempt}`;
  }

  private resolveDocDirectory(ref: string): string {
    const normalizedRef = normalizeDocRef(ref);
    for (const sectionGroup of this.sectionGroups()) {
      const directPath = getDocumentationDir(this.cwd, sectionGroup, normalizedRef);
      if (existsSync(join(directPath, "state.json"))) {
        return directPath;
      }
    }
    throw new Error(`Unknown documentation record: ${ref}`);
  }

  private readState(docDir: string): DocumentationState {
    const state = readJson<DocumentationState>(join(docDir, "state.json"));
    return {
      ...state,
      docId: normalizeDocId(state.docId),
      title: state.title.trim(),
      status: normalizeDocStatus(state.status),
      docType: normalizeDocType(state.docType),
      sectionGroup: normalizeSectionGroup(state.sectionGroup),
      summary: state.summary?.trim() ?? "",
      audience: normalizeAudience(state.audience),
      scopePaths: normalizeStringList(state.scopePaths),
      contextRefs: normalizeContextRefs(state.contextRefs),
      sourceTarget: {
        kind: normalizeSourceTargetKind(state.sourceTarget.kind),
        ref: state.sourceTarget.ref.trim(),
      },
      updateReason: state.updateReason?.trim() ?? "",
      guideTopics: normalizeStringList(state.guideTopics),
      linkedOutputPaths: normalizeStringList(state.linkedOutputPaths),
      lastRevisionId: state.lastRevisionId ? state.lastRevisionId.trim() : null,
    };
  }

  private readRevisions(docDir: string): DocumentationRevisionRecord[] {
    return readJsonl<DocumentationRevisionRecord>(join(docDir, "revisions.jsonl")).map((revision) => ({
      ...revision,
      id: revision.id.trim(),
      docId: normalizeDocId(revision.docId),
      reason: revision.reason.trim(),
      summary: revision.summary.trim(),
      sourceTarget: {
        kind: normalizeSourceTargetKind(revision.sourceTarget.kind),
        ref: revision.sourceTarget.ref.trim(),
      },
      packetHash: revision.packetHash.trim(),
      changedSections: normalizeStringList(revision.changedSections),
      linkedContextRefs: normalizeContextRefs(revision.linkedContextRefs),
    }));
  }

  private readDocumentBody(docDir: string): string {
    const documentPath = join(docDir, "doc.md");
    if (!existsSync(documentPath)) {
      return "";
    }
    try {
      return parseMarkdownArtifact(readFileSync(documentPath, "utf-8"), documentPath).body;
    } catch {
      return readFileSync(documentPath, "utf-8").trim();
    }
  }

  private extractDocumentBody(document: string, docPath: string): string {
    try {
      return parseMarkdownArtifact(document, docPath).body;
    } catch {
      return document.trim();
    }
  }

  private writeState(state: DocumentationState): void {
    writeJson(getDocumentationStatePath(this.cwd, state.sectionGroup, state.docId), state);
  }

  private constitutionExists(): boolean {
    return existsSync(join(this.cwd, ".loom", "constitution", "state.json"));
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

  private async readConstitutionIfPresentAsync(): Promise<ConstitutionalRecord | null> {
    if (!this.constitutionExists()) {
      return null;
    }
    try {
      return await createConstitutionalStore(this.cwd).readConstitution();
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
      return await createInitiativeStore(this.cwd).readInitiative(id);
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
      return await createResearchStore(this.cwd).readResearch(id);
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
      return await createSpecStore(this.cwd).readChange(id);
    } catch {
      return null;
    }
  }

  private safeReadTicket(id: string): TicketReadResult | null {
    try {
      return createTicketStore(this.cwd).readTicket(id);
    } catch {
      return null;
    }
  }

  private async safeReadTicketAsync(id: string): Promise<TicketReadResult | null> {
    try {
      return await createTicketStore(this.cwd).readTicketAsync(id);
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
      return await createCritiqueStore(this.cwd).readCritiqueAsync(id);
    } catch {
      return null;
    }
  }

  private resolveSourceSummary(state: DocumentationState): { summary: string; contextRefs: DocsContextRefs } {
    switch (state.sourceTarget.kind) {
      case "ticket": {
        const ticket = this.safeReadTicket(state.sourceTarget.ref);
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
        const change = this.safeReadSpec(state.sourceTarget.ref);
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
            `Tasks: ${change.state.tasks.length}`,
          ].join("\n"),
          contextRefs: deriveContextRefsFromSpec(change),
        };
      }
      case "initiative": {
        const initiative = this.safeReadInitiative(state.sourceTarget.ref);
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
        const critique = this.safeReadCritique(state.sourceTarget.ref);
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
      case "workspace":
        return {
          summary: `Workspace documentation target: ${state.sourceTarget.ref}`,
          contextRefs: normalizeContextRefs(state.contextRefs),
        };
    }
  }

  private async resolveSourceSummaryCanonical(
    state: DocumentationState,
  ): Promise<{ summary: string; contextRefs: DocsContextRefs }> {
    switch (state.sourceTarget.kind) {
      case "workspace":
        return this.resolveSourceSummary(state);
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
            `Tasks: ${change.state.tasks.length}`,
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

  private resolvePacketContext(
    state: DocumentationState,
    revisions: DocumentationRevisionRecord[],
    documentBody: string,
  ): ResolvedDocumentationContext {
    const source = this.resolveSourceSummary(state);
    const contextRefs = mergeContextRefs(state.contextRefs, source.contextRefs);
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
    const critiques = contextRefs.critiqueIds
      .map((critiqueId) => this.safeReadCritique(critiqueId))
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
          `${record.state.changeId} [${record.state.status}] ${record.state.title} — reqs=${record.state.requirements.length} tasks=${record.state.tasks.length}`,
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

  private buildPacket(
    state: DocumentationState,
    revisions: DocumentationRevisionRecord[],
    documentBody: string,
  ): string {
    const context = this.resolvePacketContext(state, revisions, documentBody);
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
        renderSection("Scope Paths", renderBulletList(state.scopePaths)),
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
        renderSection("Scope Paths", renderBulletList(state.scopePaths)),
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

  private async buildCanonicalRecord(snapshot: DocumentationSnapshot): Promise<DocumentationReadResult> {
    const packet = await this.buildPacketCanonical(snapshot.state, snapshot.revisions, snapshot.documentBody);
    const document = renderDocumentationMarkdown(snapshot.state, snapshot.documentBody);
    const docDir = getDocumentationDir(this.cwd, snapshot.state.sectionGroup, snapshot.state.docId);
    return {
      state: snapshot.state,
      summary: summarizeDocumentation(snapshot.state, docDir, snapshot.revisions.length),
      packet,
      document,
      revisions: snapshot.revisions,
      dashboard: buildDocumentationDashboard(
        snapshot.state,
        snapshot.revisions,
        getDocumentationPacketPath(this.cwd, snapshot.state.sectionGroup, snapshot.state.docId),
        getDocumentationMarkdownPath(this.cwd, snapshot.state.sectionGroup, snapshot.state.docId),
        docDir,
      ),
    };
  }

  private defaultDocumentBody(state: DocumentationState): string {
    const scope = state.scopePaths.length > 0 ? state.scopePaths.join(", ") : "the workspace";
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

  private writeArtifacts(
    state: DocumentationState,
    revisions: DocumentationRevisionRecord[],
    documentBody: string,
  ): DocumentationReadResult {
    const docDir = getDocumentationDir(this.cwd, state.sectionGroup, state.docId);
    const packet = this.buildPacket(state, revisions, documentBody);
    const document = renderDocumentationMarkdown(state, documentBody);
    const dashboard = buildDocumentationDashboard(
      state,
      revisions,
      getDocumentationPacketPath(this.cwd, state.sectionGroup, state.docId),
      getDocumentationMarkdownPath(this.cwd, state.sectionGroup, state.docId),
      docDir,
    );

    this.writeState(state);
    writeFileAtomic(getDocumentationPacketPath(this.cwd, state.sectionGroup, state.docId), packet);
    writeFileAtomic(getDocumentationMarkdownPath(this.cwd, state.sectionGroup, state.docId), document);

    const summary = summarizeDocumentation(state, docDir, revisions.length);
    return {
      state,
      summary,
      packet,
      document,
      revisions,
      dashboard,
    };
  }

  private createDefaultState(input: CreateDocumentationInput, docId: string, timestamp: string): DocumentationState {
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
      scopePaths: normalizeStringList(input.scopePaths),
      contextRefs: normalizeContextRefs(input.contextRefs),
      sourceTarget: {
        kind: normalizeSourceTargetKind(input.sourceTarget.kind),
        ref: input.sourceTarget.ref.trim(),
      },
      updateReason:
        input.updateReason?.trim() ||
        `Keep ${input.title.trim()} truthful after completed work changes system understanding.`,
      guideTopics: normalizeStringList(input.guideTopics),
      linkedOutputPaths: normalizeStringList(input.linkedOutputPaths),
      lastRevisionId: null,
    };
  }

  listDocsProjection(filter: DocumentationListFilter = {}) {
    this.initLedger();
    return this.documentationDirectories()
      .map((directory) => {
        const state = this.readState(directory);
        return summarizeDocumentation(state, directory, this.readRevisions(directory).length);
      })
      .filter((summary) => {
        if (filter.status && summary.status !== filter.status) {
          return false;
        }
        if (filter.docType && summary.docType !== filter.docType) {
          return false;
        }
        if (filter.sectionGroup && summary.sectionGroup !== filter.sectionGroup) {
          return false;
        }
        if (filter.sourceKind && summary.sourceKind !== filter.sourceKind) {
          return false;
        }
        if (filter.topic) {
          const directory = this.resolveDocDirectory(summary.id);
          const state = this.readState(directory);
          if (!state.guideTopics.includes(filter.topic)) {
            return false;
          }
        }
        if (!filter.text) {
          return true;
        }
        const text = filter.text.toLowerCase();
        return [summary.id, summary.title, summary.summary, summary.docType, summary.sourceKind, summary.sourceRef]
          .join(" ")
          .toLowerCase()
          .includes(text);
      });
  }

  readDocProjection(ref: string): DocumentationReadResult {
    this.initLedger();
    const docDir = this.resolveDocDirectory(ref);
    const state = this.readState(docDir);
    const revisions = this.readRevisions(docDir);
    const documentBody = this.readDocumentBody(docDir) || this.defaultDocumentBody(state);
    return this.writeArtifacts(state, revisions, documentBody);
  }

  createDocProjection(input: CreateDocumentationInput): DocumentationReadResult {
    this.initLedger();
    const timestamp = currentTimestamp();
    const docId = this.nextDocId(input.title);
    const state = this.createDefaultState(input, docId, timestamp);
    const docDir = getDocumentationDir(this.cwd, state.sectionGroup, state.docId);
    ensureDir(docDir);
    writeFileAtomic(getDocumentationRevisionsPath(this.cwd, state.sectionGroup, state.docId), "");
    const documentBody = input.document?.trim() || this.defaultDocumentBody(state);
    const nextState = {
      ...state,
      summary: state.summary || summarizeDocument(documentBody),
    };
    return this.writeArtifacts(nextState, [], documentBody);
  }

  updateDocProjection(ref: string, input: UpdateDocumentationInput): DocumentationReadResult {
    const current = this.readDocProjection(ref);
    const documentBody =
      input.document?.trim() ||
      this.readDocumentBody(this.resolveDocDirectory(ref)) ||
      this.defaultDocumentBody(current.state);
    const nextState: DocumentationState = {
      ...current.state,
      title: input.title?.trim() ?? current.state.title,
      updatedAt: currentTimestamp(),
      summary: input.summary?.trim() ?? (input.document ? summarizeDocument(documentBody) : current.state.summary),
      audience: input.audience ? normalizeAudience(input.audience) : current.state.audience,
      scopePaths: input.scopePaths ? normalizeStringList(input.scopePaths) : current.state.scopePaths,
      contextRefs: input.contextRefs
        ? mergeContextRefs(current.state.contextRefs, input.contextRefs)
        : current.state.contextRefs,
      sourceTarget: input.sourceTarget
        ? {
            kind: normalizeSourceTargetKind(input.sourceTarget.kind),
            ref: input.sourceTarget.ref.trim(),
          }
        : current.state.sourceTarget,
      updateReason: input.updateReason?.trim() ?? current.state.updateReason,
      guideTopics: input.guideTopics ? normalizeStringList(input.guideTopics) : current.state.guideTopics,
      linkedOutputPaths: input.linkedOutputPaths
        ? normalizeStringList(input.linkedOutputPaths)
        : current.state.linkedOutputPaths,
    };

    if (!input.document) {
      return this.writeArtifacts(nextState, current.revisions, documentBody);
    }

    const revision: DocumentationRevisionRecord = {
      id: nextSequenceId(
        current.revisions.map((entry) => entry.id),
        "rev",
      ),
      docId: current.state.docId,
      createdAt: nextState.updatedAt,
      reason: nextState.updateReason,
      summary: nextState.summary || summarizeDocument(documentBody),
      sourceTarget: nextState.sourceTarget,
      packetHash: packetHash(current.packet),
      changedSections: input.changedSections
        ? normalizeStringList(input.changedSections)
        : extractMarkdownSections(documentBody),
      linkedContextRefs: nextState.contextRefs,
    };
    appendJsonl(getDocumentationRevisionsPath(this.cwd, current.state.sectionGroup, current.state.docId), revision);
    return this.writeArtifacts(
      {
        ...nextState,
        lastRevisionId: revision.id,
      },
      [...current.revisions, revision],
      documentBody,
    );
  }

  archiveDocProjection(ref: string): DocumentationReadResult {
    const current = this.readDocProjection(ref);
    return this.writeArtifacts(
      {
        ...current.state,
        status: "archived",
        updatedAt: currentTimestamp(),
      },
      current.revisions,
      this.readDocumentBody(this.resolveDocDirectory(ref)) || this.defaultDocumentBody(current.state),
    );
  }

  async initLedgerAsync(): Promise<{ initialized: true; root: string }> {
    return this.initLedger();
  }

  async listDocs(filter: DocumentationListFilter = {}): Promise<ReturnType<DocumentationStore["listDocsProjection"]>> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const records = await Promise.all(
      (await storage.listEntities(identity.space.id, ENTITY_KIND)).map((entity) => this.entityRecord(entity)),
    );
    return records
      .filter((record) => {
        const summary = record.summary;
        if (filter.status && summary.status !== filter.status) return false;
        if (filter.docType && summary.docType !== filter.docType) return false;
        if (filter.sectionGroup && summary.sectionGroup !== filter.sectionGroup) return false;
        if (filter.sourceKind && summary.sourceKind !== filter.sourceKind) return false;
        if (filter.topic) {
          if (!record.state.guideTopics.includes(filter.topic)) return false;
        }
        if (!filter.text) return true;
        const text = filter.text.toLowerCase();
        return [summary.id, summary.title, summary.summary, summary.docType, summary.sourceKind, summary.sourceRef]
          .join(" ")
          .toLowerCase()
          .includes(text);
      })
      .map((record) => record.summary);
  }

  async readDoc(ref: string): Promise<DocumentationReadResult> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const docId = normalizeDocRef(ref);
    const entity = await findEntityByDisplayId(storage, identity.space.id, ENTITY_KIND, docId);
    if (!entity) {
      throw new Error(`Unknown documentation: ${docId}`);
    }
    return this.entityRecord(entity);
  }

  async createDoc(input: CreateDocumentationInput): Promise<DocumentationReadResult> {
    const record = this.createDocProjection(input);
    return this.upsertCanonicalRecord(record);
  }

  async updateDoc(ref: string, input: UpdateDocumentationInput): Promise<DocumentationReadResult> {
    const record = this.updateDocProjection(ref, input);
    return this.upsertCanonicalRecord(record);
  }

  async archiveDoc(ref: string): Promise<DocumentationReadResult> {
    const record = this.archiveDocProjection(ref);
    return this.upsertCanonicalRecord(record);
  }
}

export function createDocumentationStore(cwd: string): DocumentationStore {
  return new DocumentationStore(cwd);
}
