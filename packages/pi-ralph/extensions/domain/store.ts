import { relative, resolve } from "node:path";
import { createConstitutionalStore } from "@pi-loom/pi-constitution/extensions/domain/store.js";
import { createCritiqueStore } from "@pi-loom/pi-critique/extensions/domain/store.js";
import { createDocumentationStore } from "@pi-loom/pi-docs/extensions/domain/store.js";
import { createInitiativeStore } from "@pi-loom/pi-initiatives/extensions/domain/store.js";
import { createPlanStore } from "@pi-loom/pi-plans/extensions/domain/store.js";
import { createResearchStore } from "@pi-loom/pi-research/extensions/domain/store.js";
import { createSpecStore } from "@pi-loom/pi-specs/extensions/domain/store.js";
import type { LoomEntityRecord } from "@pi-loom/pi-storage/storage/contract.js";
import { createEntityId } from "@pi-loom/pi-storage/storage/ids.js";
import { resolveWorkspaceIdentity } from "@pi-loom/pi-storage/storage/repository.js";
import { SqliteLoomCatalog } from "@pi-loom/pi-storage/storage/sqlite.js";
import {
  findEntityByDisplayId,
  upsertEntityByDisplayId,
} from "@pi-loom/pi-storage/storage/entities.js";
import { openWorkspaceStorage } from "@pi-loom/pi-storage/storage/workspace.js";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import { buildRalphDashboard, summarizeRalphRun } from "./dashboard.js";
import { parseMarkdownArtifact, renderBulletList, renderSection } from "./frontmatter.js";
import type {
  AppendRalphIterationInput,
  CreateRalphRunInput,
  DecideRalphRunInput,
  LinkRalphCritiqueInput,
  PrepareRalphLaunchInput,
  RalphContinuationDecision,
  RalphCritiqueLink,
  RalphCritiqueLinkKind,
  RalphCritiqueVerdict,
  RalphIterationRecord,
  RalphIterationStatus,
  RalphLaunchDescriptor,
  RalphLinkedRefs,
  RalphListFilter,
  RalphPolicyMode,
  RalphPolicySnapshot,
  RalphReadResult,
  RalphRunPhase,
  RalphRunState,
  RalphRunStatus,
  RalphVerifierSourceKind,
  RalphVerifierSummary,
  RalphVerifierVerdict,
  RalphWaitingFor,
  UpdateRalphRunInput,
} from "./models.js";
import {
  RALPH_CRITIQUE_LINK_KINDS,
  RALPH_CRITIQUE_VERDICTS,
  RALPH_DECISION_KINDS,
  RALPH_DECISION_REASONS,
  RALPH_ITERATION_STATUSES,
  RALPH_POLICY_MODES,
  RALPH_RUN_PHASES,
  RALPH_RUN_STATUSES,
  RALPH_VERIFIER_SOURCE_KINDS,
  RALPH_VERIFIER_VERDICTS,
  RALPH_WAITING_FOR,
} from "./models.js";
import {
  currentTimestamp,
  latestById,
  nextSequenceId,
  normalizeOptionalString,
  normalizeStringList,
  summarizeText,
} from "./normalize.js";
import {
  getRalphArtifactPaths,
  getRalphPaths,
  getRalphRunDir,
  normalizeRalphRunId,
  normalizeRalphRunRef,
  slugifyRalphValue,
} from "./paths.js";
import { renderRalphMarkdown } from "./render.js";

const ENTITY_KIND = "ralph_run" as const;

interface RalphEntityAttributes {
  record: RalphReadResult;
}

function hasStructuredRalphAttributes(attributes: unknown): attributes is RalphEntityAttributes {
  return Boolean(attributes && typeof attributes === "object" && "record" in attributes);
}

interface StoredRalphEntityRow {
  id: string;
  display_id: string | null;
  version: number;
  created_at: string;
  attributes_json: string;
}

function openRalphCatalogSync(cwd: string): { storage: SqliteLoomCatalog; identity: ReturnType<typeof resolveWorkspaceIdentity> } {
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

function toRepoRelativeWorkspacePath(cwd: string, filePath: string): string {
  const relativePath = relative(cwd, filePath);
  return relativePath || ".";
}

function findStoredRalphRow(cwd: string, runId: string): StoredRalphEntityRow | null {
  const { storage, identity } = openRalphCatalogSync(cwd);
  return (storage.db
    .prepare(
      "SELECT id, display_id, version, created_at, attributes_json FROM entities WHERE space_id = ? AND kind = ? AND display_id = ? LIMIT 1",
    )
    .get(identity.space.id, ENTITY_KIND, runId) ?? null) as StoredRalphEntityRow | null;
}

function listStoredRalphRecords(cwd: string): RalphReadResult[] {
  const { storage, identity } = openRalphCatalogSync(cwd);
  const rows = storage.db
    .prepare("SELECT attributes_json FROM entities WHERE space_id = ? AND kind = ? ORDER BY display_id")
    .all(identity.space.id, ENTITY_KIND) as Array<{ attributes_json: string }>;
  return rows.map((row) => {
    const attributes = parseStoredJson<RalphEntityAttributes | Record<string, unknown>>(row.attributes_json, {});
    if (!hasStructuredRalphAttributes(attributes)) {
      throw new Error("Ralph run entity is missing structured attributes");
    }
    return attributes.record;
  });
}

function readStructuredEntityAttributesSync<T>(cwd: string, kind: string, displayId: string): T | null {
  const { storage, identity } = openRalphCatalogSync(cwd);
  const row = storage.db
    .prepare("SELECT attributes_json FROM entities WHERE space_id = ? AND kind = ? AND display_id = ? LIMIT 1")
    .get(identity.space.id, kind, displayId) as { attributes_json: string } | undefined;
  return row ? parseStoredJson<T>(row.attributes_json, {} as T) : null;
}

function parseJsonlText<T>(content: string): T[] {
  return content
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function frontmatterString(
  frontmatter: Readonly<Record<string, string | null | string[]>> | undefined,
  key: string,
): string | null {
  const value = frontmatter?.[key];
  return typeof value === "string" ? value : null;
}

function frontmatterStringList(
  frontmatter: Readonly<Record<string, string | null | string[]>> | undefined,
  key: string,
): string[] {
  const value = frontmatter?.[key];
  if (Array.isArray(value)) {
    return normalizeStringList(value);
  }
  return value ? normalizeStringList([value]) : [];
}

function expectEnum<T extends string>(
  label: string,
  value: string | null | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if ((allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  throw new Error(`Invalid ${label}: ${value}`);
}

function normalizeRunStatus(value: string | null | undefined): RalphRunStatus {
  return expectEnum("Ralph run status", value, RALPH_RUN_STATUSES, "planned");
}

function normalizeRunPhase(value: string | null | undefined): RalphRunPhase {
  return expectEnum("Ralph run phase", value, RALPH_RUN_PHASES, "preparing");
}

function normalizeWaitingFor(value: string | null | undefined): RalphWaitingFor {
  return expectEnum("Ralph waiting state", value, RALPH_WAITING_FOR, "none");
}

function normalizeVerifierSourceKind(value: string | null | undefined): RalphVerifierSourceKind {
  return expectEnum("Ralph verifier source kind", value, RALPH_VERIFIER_SOURCE_KINDS, "manual");
}

function normalizeVerifierVerdict(value: string | null | undefined): RalphVerifierVerdict {
  return expectEnum("Ralph verifier verdict", value, RALPH_VERIFIER_VERDICTS, "not_run");
}

function normalizeCritiqueVerdict(value: string | null | undefined): RalphCritiqueVerdict | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return expectEnum("Ralph critique verdict", value, RALPH_CRITIQUE_VERDICTS, "concerns");
}

function normalizePolicyMode(value: string | null | undefined): RalphPolicyMode {
  return expectEnum("Ralph policy mode", value, RALPH_POLICY_MODES, "balanced");
}

function normalizeIterationStatus(value: string | null | undefined): RalphIterationStatus {
  return expectEnum("Ralph iteration status", value, RALPH_ITERATION_STATUSES, "pending");
}

function normalizeLinkedRefs(input: Partial<RalphLinkedRefs> | undefined): RalphLinkedRefs {
  return {
    roadmapItemIds: normalizeStringList(input?.roadmapItemIds),
    initiativeIds: normalizeStringList(input?.initiativeIds),
    researchIds: normalizeStringList(input?.researchIds),
    specChangeIds: normalizeStringList(input?.specChangeIds),
    ticketIds: normalizeStringList(input?.ticketIds),
    critiqueIds: normalizeStringList(input?.critiqueIds),
    docIds: normalizeStringList(input?.docIds),
    planIds: normalizeStringList(input?.planIds),
  };
}

function mergeLinkedRefs(current: RalphLinkedRefs, next: Partial<RalphLinkedRefs> | undefined): RalphLinkedRefs {
  if (!next) {
    return current;
  }
  return normalizeLinkedRefs({
    roadmapItemIds: [...current.roadmapItemIds, ...(next.roadmapItemIds ?? [])],
    initiativeIds: [...current.initiativeIds, ...(next.initiativeIds ?? [])],
    researchIds: [...current.researchIds, ...(next.researchIds ?? [])],
    specChangeIds: [...current.specChangeIds, ...(next.specChangeIds ?? [])],
    ticketIds: [...current.ticketIds, ...(next.ticketIds ?? [])],
    critiqueIds: [...current.critiqueIds, ...(next.critiqueIds ?? [])],
    docIds: [...current.docIds, ...(next.docIds ?? [])],
    planIds: [...current.planIds, ...(next.planIds ?? [])],
  });
}

function normalizePolicySnapshot(input: Partial<RalphPolicySnapshot> | undefined): RalphPolicySnapshot {
  return {
    mode: normalizePolicyMode(input?.mode),
    maxIterations:
      typeof input?.maxIterations === "number" && Number.isFinite(input.maxIterations) && input.maxIterations > 0
        ? Math.floor(input.maxIterations)
        : null,
    maxRuntimeMinutes:
      typeof input?.maxRuntimeMinutes === "number" &&
      Number.isFinite(input.maxRuntimeMinutes) &&
      input.maxRuntimeMinutes > 0
        ? Math.floor(input.maxRuntimeMinutes)
        : null,
    tokenBudget:
      typeof input?.tokenBudget === "number" && Number.isFinite(input.tokenBudget) && input.tokenBudget > 0
        ? Math.floor(input.tokenBudget)
        : null,
    verifierRequired: input?.verifierRequired !== false,
    critiqueRequired: input?.critiqueRequired === true,
    stopWhenVerified: input?.stopWhenVerified !== false,
    manualApprovalRequired: input?.manualApprovalRequired === true,
    allowOperatorPause: input?.allowOperatorPause !== false,
    notes: normalizeStringList(input?.notes),
  };
}

function mergePolicySnapshot(
  current: RalphPolicySnapshot,
  input: Partial<RalphPolicySnapshot> | undefined,
): RalphPolicySnapshot {
  if (!input) {
    return current;
  }
  return normalizePolicySnapshot({
    ...current,
    ...input,
    notes: input.notes ? [...current.notes, ...input.notes] : current.notes,
  });
}

function normalizeVerifierSummary(input: Partial<RalphVerifierSummary> | undefined): RalphVerifierSummary {
  const verdict = normalizeVerifierVerdict(input?.verdict);
  return {
    sourceKind: normalizeVerifierSourceKind(input?.sourceKind),
    sourceRef: input?.sourceRef?.trim() || "manual",
    verdict,
    summary: input?.summary?.trim() ?? "",
    required: input?.required !== false,
    blocker: input?.blocker === true || verdict === "fail",
    checkedAt: normalizeOptionalString(input?.checkedAt),
    evidence: normalizeStringList(input?.evidence),
  };
}

function mergeVerifierSummary(
  current: RalphVerifierSummary,
  input: Partial<RalphVerifierSummary> | undefined,
): RalphVerifierSummary {
  if (!input) {
    return current;
  }
  return normalizeVerifierSummary({
    ...current,
    ...input,
    evidence: input.evidence ? [...current.evidence, ...input.evidence] : current.evidence,
  });
}

function normalizeCritiqueLink(input: RalphCritiqueLink): RalphCritiqueLink {
  const critiqueId = input.critiqueId.trim();
  if (!critiqueId) {
    throw new Error("Ralph critique link requires a critiqueId");
  }
  const kind = expectEnum(
    "Ralph critique link kind",
    input.kind,
    RALPH_CRITIQUE_LINK_KINDS,
    "context",
  ) as RalphCritiqueLinkKind;
  const verdict = normalizeCritiqueVerdict(input.verdict);
  return {
    critiqueId,
    kind,
    verdict,
    required: input.required === true,
    blocking: input.blocking === true || verdict === "blocked" || verdict === "needs_revision",
    reviewedAt: normalizeOptionalString(input.reviewedAt),
    findingIds: normalizeStringList(input.findingIds),
    summary: input.summary.trim(),
  };
}

function normalizeCritiqueLinks(links: readonly RalphCritiqueLink[] | undefined): RalphCritiqueLink[] {
  const deduped = new Map<string, RalphCritiqueLink>();
  for (const link of links ?? []) {
    const normalized = normalizeCritiqueLink(link);
    deduped.set(`${normalized.critiqueId}:${normalized.kind}`, normalized);
  }
  return [...deduped.values()].sort((left, right) =>
    `${left.critiqueId}:${left.kind}`.localeCompare(`${right.critiqueId}:${right.kind}`),
  );
}

function mergeCritiqueLinks(current: RalphCritiqueLink[], next: RalphCritiqueLink[] | undefined): RalphCritiqueLink[] {
  return normalizeCritiqueLinks([...(current ?? []), ...(next ?? [])]);
}

function normalizeDecision(input: RalphContinuationDecision | null | undefined): RalphContinuationDecision | null {
  if (!input) {
    return null;
  }
  return {
    kind: expectEnum("Ralph decision kind", input.kind, RALPH_DECISION_KINDS, "continue"),
    reason: expectEnum("Ralph decision reason", input.reason, RALPH_DECISION_REASONS, "unknown"),
    summary: input.summary.trim(),
    decidedAt: normalizeOptionalString(input.decidedAt) ?? currentTimestamp(),
    decidedBy: input.decidedBy,
    blockingRefs: normalizeStringList(input.blockingRefs),
  };
}

function normalizeIteration(record: RalphIterationRecord): RalphIterationRecord {
  return {
    id: record.id.trim(),
    runId: normalizeRalphRunId(record.runId),
    iteration: Math.max(1, Math.floor(record.iteration)),
    status: normalizeIterationStatus(record.status),
    startedAt: record.startedAt,
    completedAt: normalizeOptionalString(record.completedAt),
    focus: record.focus.trim(),
    summary: record.summary.trim(),
    workerSummary: record.workerSummary.trim(),
    verifier: normalizeVerifierSummary(record.verifier),
    critiqueLinks: normalizeCritiqueLinks(record.critiqueLinks),
    decision: normalizeDecision(record.decision),
    notes: normalizeStringList(record.notes),
  };
}

function completedAtForStatus(status: RalphIterationStatus, explicit: string | null | undefined): string | null {
  const normalized = normalizeOptionalString(explicit);
  if (normalized) {
    return normalized;
  }
  return ["accepted", "rejected", "failed", "cancelled"].includes(status) ? currentTimestamp() : null;
}

function normalizeStoredRunState(state: RalphRunState): RalphRunState {
  const normalized: RalphRunState = {
    runId: normalizeRalphRunId(state.runId),
    title: state.title.trim(),
    status: normalizeRunStatus(state.status),
    phase: normalizeRunPhase(state.phase),
    waitingFor: normalizeWaitingFor(state.waitingFor),
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    objective: state.objective?.trim() ?? "",
    summary: state.summary?.trim() ?? "",
    linkedRefs: normalizeLinkedRefs(state.linkedRefs),
    policySnapshot: normalizePolicySnapshot(state.policySnapshot),
    verifierSummary: normalizeVerifierSummary(state.verifierSummary),
    critiqueLinks: normalizeCritiqueLinks(state.critiqueLinks),
    latestDecision: normalizeDecision(state.latestDecision),
    lastIterationNumber:
      typeof state.lastIterationNumber === "number" && Number.isFinite(state.lastIterationNumber)
        ? Math.max(0, Math.floor(state.lastIterationNumber))
        : 0,
    currentIterationId: normalizeOptionalString(state.currentIterationId),
    lastLaunchAt: normalizeOptionalString(state.lastLaunchAt),
    launchCount:
      typeof state.launchCount === "number" && Number.isFinite(state.launchCount)
        ? Math.max(0, Math.floor(state.launchCount))
        : 0,
    stopReason: normalizeOptionalString(state.stopReason) as RalphContinuationDecision["reason"] | null,
    packetSummary: state.packetSummary?.trim() ?? "",
  };
  return { ...normalized, packetSummary: createPacketSummary(normalized) };
}

function waitingForFromCritiques(links: RalphCritiqueLink[]): RalphWaitingFor {
  if (links.some((link) => link.required && link.verdict === null)) {
    return "critique";
  }
  if (links.some((link) => link.blocking)) {
    return "operator";
  }
  return "none";
}

function waitingForFromReviewSignals(verifier: RalphVerifierSummary, links: RalphCritiqueLink[]): RalphWaitingFor {
  if (verifier.blocker) {
    return "operator";
  }
  return waitingForFromCritiques(links);
}

function createPacketSummary(state: RalphRunState): string {
  const refs = [
    ...state.linkedRefs.planIds,
    ...state.linkedRefs.ticketIds,
    ...state.linkedRefs.critiqueIds,
    ...state.linkedRefs.specChangeIds,
  ];
  return summarizeText(
    `${state.title}. ${state.objective} ${refs.length > 0 ? `Linked refs: ${refs.join(", ")}.` : ""}`,
    `Ralph orchestration run for ${state.title}.`,
  );
}

function renderListSection(title: string, values: string[]): string {
  return renderSection(title, renderBulletList(values));
}

interface ResolvedPacketContext {
  roadmap: string[];
  initiatives: string[];
  research: string[];
  specs: string[];
  plans: string[];
  tickets: string[];
  critiques: string[];
  docs: string[];
}

export class RalphStore {
  readonly cwd: string;

  constructor(cwd: string) {
    this.cwd = resolve(cwd);
  }

  initLedger(): { initialized: true; root: string } {
    return { initialized: true, root: getRalphPaths(this.cwd).ralphDir };
  }

  private runDirectories(): string[] {
    return listStoredRalphRecords(this.cwd).map((record) => getRalphRunDir(this.cwd, record.state.runId));
  }

  private nextRunId(seed: string): string {
    const baseId = slugifyRalphValue(seed);
    const existing = new Set(this.runDirectories().map((directory) => directory.split("/").at(-1) ?? directory));
    if (!existing.has(baseId)) {
      return baseId;
    }
    let attempt = 2;
    while (existing.has(`${baseId}-${attempt}`)) {
      attempt += 1;
    }
    return `${baseId}-${attempt}`;
  }

  private resolveRunDirectory(ref: string): string {
    const runId = normalizeRalphRunRef(ref);
    const runDir = getRalphRunDir(this.cwd, runId);
    if (!findStoredRalphRow(this.cwd, runId)) {
      throw new Error(`Unknown Ralph run: ${ref}`);
    }
    return runDir;
  }

  private summarizeRun(state: RalphRunState, runDir: string) {
    return summarizeRalphRun(state, runDir);
  }

  private buildContextSummary(refs: string[], resolver: (ref: string) => string): string[] {
    return refs.map((ref) => {
      try {
        return resolver(ref);
      } catch {
        return `${ref} (unresolved)`;
      }
    });
  }

  private async buildContextSummaryAsync(
    refs: string[],
    resolver: (ref: string) => Promise<string>,
  ): Promise<string[]> {
    return Promise.all(
      refs.map(async (ref) => {
        try {
          return await resolver(ref);
        } catch {
          return `${ref} (unresolved)`;
        }
      }),
    );
  }

  private resolvePacketContext(state: RalphRunState): ResolvedPacketContext {
    return {
      roadmap: this.buildContextSummary(state.linkedRefs.roadmapItemIds, (ref) => {
        const constitution = readStructuredEntityAttributesSync<{ state: { roadmapItems: Array<{ id: string; status: string; title: string }> } }>(
          this.cwd,
          "constitution",
          resolveWorkspaceIdentity(this.cwd).repository.slug,
        );
        const item = constitution?.state.roadmapItems.find((entry) => entry.id === ref);
        if (!item) throw new Error(`Unknown roadmap item: ${ref}`);
        return `${item.id} [${item.status}] ${item.title}`;
      }),
      initiatives: this.buildContextSummary(state.linkedRefs.initiativeIds, (ref) => {
        const initiative = readStructuredEntityAttributesSync<{ state: { initiativeId: string; status: string; title: string } }>(this.cwd, "initiative", ref);
        if (!initiative) throw new Error(`Unknown initiative: ${ref}`);
        return `${initiative.state.initiativeId} [${initiative.state.status}] ${initiative.state.title}`;
      }),
      research: this.buildContextSummary(state.linkedRefs.researchIds, (ref) => {
        const research = readStructuredEntityAttributesSync<{ state: { researchId: string; status: string; title: string } }>(this.cwd, "research", ref);
        if (!research) throw new Error(`Unknown research: ${ref}`);
        return `${research.state.researchId} [${research.state.status}] ${research.state.title}`;
      }),
      specs: this.buildContextSummary(state.linkedRefs.specChangeIds, (ref) => {
        const spec = readStructuredEntityAttributesSync<{ record: { summary: { id: string; status: string }; state: { title: string } } }>(this.cwd, "spec_change", ref);
        if (!spec) throw new Error(`Unknown spec: ${ref}`);
        return `${spec.record.summary.id} [${spec.record.summary.status}] ${spec.record.state.title}`;
      }),
      plans: this.buildContextSummary(state.linkedRefs.planIds, (ref) => {
        const plan = readStructuredEntityAttributesSync<{ state: { planId: string; status: string; title: string } }>(this.cwd, "plan", ref);
        if (!plan) throw new Error(`Unknown plan: ${ref}`);
        return `${plan.state.planId} [${plan.state.status}] ${plan.state.title}`;
      }),
      tickets: this.buildContextSummary(state.linkedRefs.ticketIds, (ref) => {
        const ticket = readStructuredEntityAttributesSync<{ record: { summary: { id: string; status: string; title: string } } }>(this.cwd, "ticket", ref);
        if (!ticket) throw new Error(`Unknown ticket: ${ref}`);
        return `${ticket.record.summary.id} [${ticket.record.summary.status}] ${ticket.record.summary.title}`;
      }),
      critiques: this.buildContextSummary(state.linkedRefs.critiqueIds, (ref) => {
        const critique = readStructuredEntityAttributesSync<{ record: { summary: { id: string; status: string; verdict: string }; state: { title: string } } }>(this.cwd, "critique", ref);
        if (!critique) throw new Error(`Unknown critique: ${ref}`);
        return `${critique.record.summary.id} [${critique.record.summary.status}/${critique.record.summary.verdict}] ${critique.record.state.title}`;
      }),
      docs: this.buildContextSummary(state.linkedRefs.docIds, (ref) => {
        const doc = readStructuredEntityAttributesSync<{ record: { summary: { id: string; status: string; docType: string }; state: { title: string } } }>(this.cwd, "documentation", ref);
        if (!doc) throw new Error(`Unknown document: ${ref}`);
        return `${doc.record.summary.id} [${doc.record.summary.status}/${doc.record.summary.docType}] ${doc.record.state.title}`;
      }),
    };
  }

  private async resolvePacketContextAsync(state: RalphRunState): Promise<ResolvedPacketContext> {
    const constitutionStore = createConstitutionalStore(this.cwd);
    const initiativeStore = createInitiativeStore(this.cwd);
    const researchStore = createResearchStore(this.cwd);
    const specStore = createSpecStore(this.cwd);
    const planStore = createPlanStore(this.cwd);
    const ticketStore = createTicketStore(this.cwd);
    const critiqueStore = createCritiqueStore(this.cwd);
    const docsStore = createDocumentationStore(this.cwd);

    const [roadmap, initiatives, research, specs, plans, tickets, critiques, docs] = await Promise.all([
      this.buildContextSummaryAsync(state.linkedRefs.roadmapItemIds, async (ref) => {
        const item = await constitutionStore.readRoadmapItem(ref);
        return `${item.id} [${item.status}] ${item.title}`;
      }),
      this.buildContextSummaryAsync(state.linkedRefs.initiativeIds, async (ref) => {
        const initiative = await initiativeStore.readInitiative(ref);
        return `${initiative.state.initiativeId} [${initiative.state.status}] ${initiative.state.title}`;
      }),
      this.buildContextSummaryAsync(state.linkedRefs.researchIds, async (ref) => {
        const entry = await researchStore.readResearch(ref);
        return `${entry.state.researchId} [${entry.state.status}] ${entry.state.title}`;
      }),
      this.buildContextSummaryAsync(state.linkedRefs.specChangeIds, async (ref) => {
        const spec = await specStore.readChange(ref);
        return `${spec.summary.id} [${spec.summary.status}] ${spec.state.title}`;
      }),
      this.buildContextSummaryAsync(state.linkedRefs.planIds, async (ref) => {
        const plan = await planStore.readPlan(ref);
        return `${plan.summary.id} [${plan.summary.status}] ${plan.state.title}`;
      }),
      this.buildContextSummaryAsync(state.linkedRefs.ticketIds, async (ref) => {
        const ticket = await ticketStore.readTicketAsync(ref);
        return `${ticket.summary.id} [${ticket.summary.status}] ${ticket.summary.title}`;
      }),
      this.buildContextSummaryAsync(state.linkedRefs.critiqueIds, async (ref) => {
        const critique = await critiqueStore.readCritiqueAsync(ref);
        return `${critique.summary.id} [${critique.summary.status}/${critique.summary.verdict}] ${critique.state.title}`;
      }),
      this.buildContextSummaryAsync(state.linkedRefs.docIds, async (ref) => {
        const doc = await docsStore.readDoc(ref);
        return `${doc.summary.id} [${doc.summary.status}/${doc.summary.docType}] ${doc.state.title}`;
      }),
    ]);

    return { roadmap, initiatives, research, specs, plans, tickets, critiques, docs };
  }

  private renderPacket(
    state: RalphRunState,
    iterations: RalphIterationRecord[],
    context: ResolvedPacketContext,
  ): string {
    const latestIteration = iterations.at(-1) ?? null;
    const latestIterationLines = latestIteration
      ? [
          `- id: ${latestIteration.id}`,
          `- iteration: ${latestIteration.iteration}`,
          `- status: ${latestIteration.status}`,
          `- focus: ${latestIteration.focus || "(none)"}`,
          `- summary: ${latestIteration.summary || "(none)"}`,
          `- worker summary: ${latestIteration.workerSummary || "(none)"}`,
          `- verifier: ${latestIteration.verifier.verdict}`,
        ].join("\n")
      : "(none)";

    return `${[
      `# Ralph Packet: ${state.title}`,
      renderSection(
        "Run State",
        [
          `- run id: ${state.runId}`,
          `- status: ${state.status}`,
          `- phase: ${state.phase}`,
          `- waiting for: ${state.waitingFor}`,
          `- current iteration id: ${state.currentIterationId ?? "(none)"}`,
          `- last iteration number: ${state.lastIterationNumber}`,
          `- launch count: ${state.launchCount}`,
          `- last launch at: ${state.lastLaunchAt ?? "(never)"}`,
          `- stop reason: ${state.stopReason ?? "(none)"}`,
        ].join("\n"),
      ),
      renderSection("Objective", state.objective || "(none)"),
      renderSection("Summary", state.summary || "(none)"),
      renderSection(
        "Policy Snapshot",
        [
          `- mode: ${state.policySnapshot.mode}`,
          `- max iterations: ${state.policySnapshot.maxIterations ?? "(none)"}`,
          `- max runtime minutes: ${state.policySnapshot.maxRuntimeMinutes ?? "(none)"}`,
          `- token budget: ${state.policySnapshot.tokenBudget ?? "(none)"}`,
          `- verifier required: ${state.policySnapshot.verifierRequired ? "yes" : "no"}`,
          `- critique required: ${state.policySnapshot.critiqueRequired ? "yes" : "no"}`,
          `- stop when verified: ${state.policySnapshot.stopWhenVerified ? "yes" : "no"}`,
          `- manual approval required: ${state.policySnapshot.manualApprovalRequired ? "yes" : "no"}`,
          `- allow operator pause: ${state.policySnapshot.allowOperatorPause ? "yes" : "no"}`,
          `- notes: ${state.policySnapshot.notes.join(", ") || "(none)"}`,
        ].join("\n"),
      ),
      renderSection(
        "Verifier Summary",
        [
          `- source: ${state.verifierSummary.sourceKind}:${state.verifierSummary.sourceRef}`,
          `- verdict: ${state.verifierSummary.verdict}`,
          `- blocker: ${state.verifierSummary.blocker ? "yes" : "no"}`,
          `- checked at: ${state.verifierSummary.checkedAt ?? "(not checked)"}`,
          `- summary: ${state.verifierSummary.summary || "(none)"}`,
          `- evidence: ${state.verifierSummary.evidence.join(", ") || "(none)"}`,
        ].join("\n"),
      ),
      renderSection(
        "Critique Links",
        state.critiqueLinks.length > 0
          ? state.critiqueLinks
              .map(
                (link) =>
                  `- ${link.critiqueId} [${link.kind}/${link.verdict ?? "none"}] blocking=${link.blocking ? "yes" : "no"} findings=${link.findingIds.join(", ") || "(none)"}`,
              )
              .join("\n")
          : "(none)",
      ),
      renderSection(
        "Latest Decision",
        state.latestDecision
          ? [
              `- kind: ${state.latestDecision.kind}`,
              `- reason: ${state.latestDecision.reason}`,
              `- decided by: ${state.latestDecision.decidedBy}`,
              `- decided at: ${state.latestDecision.decidedAt}`,
              `- summary: ${state.latestDecision.summary || "(none)"}`,
              `- blocking refs: ${state.latestDecision.blockingRefs.join(", ") || "(none)"}`,
            ].join("\n")
          : "(none)",
      ),
      renderSection("Latest Iteration", latestIterationLines),
      renderListSection("Linked Plans", context.plans),
      renderListSection("Linked Tickets", context.tickets),
      renderListSection("Linked Critiques", context.critiques),
      renderListSection("Linked Specs", context.specs),
      renderListSection("Linked Research", context.research),
      renderListSection("Linked Initiatives", context.initiatives),
      renderListSection("Linked Roadmap Items", context.roadmap),
      renderListSection("Linked Docs", context.docs),
      renderSection(
        "Execution Guidance",
        [
          "- Perform one bounded iteration only.",
          "- Read the linked durable artifacts instead of relying on prior chat state.",
          "- Persist verifier evidence, critique references, and the continuation decision back into the Ralph run.",
          "- Do not report completion unless the policy gates actually permit completion.",
        ].join("\n"),
      ),
    ].join("\n\n")}\n`;
  }

  private buildPacket(state: RalphRunState, iterations: RalphIterationRecord[]): string {
    return this.renderPacket(state, iterations, this.resolvePacketContext(state));
  }

  private async buildPacketAsync(state: RalphRunState, iterations: RalphIterationRecord[]): Promise<string> {
    return this.renderPacket(state, iterations, await this.resolvePacketContextAsync(state));
  }

  private readState(runDir: string): RalphRunState {
    const runId = normalizeRalphRunId(runDir.split("/").at(-1) ?? runDir);
    const row = findStoredRalphRow(this.cwd, runId);
    if (!row) {
      throw new Error(`Unknown Ralph run: ${runId}`);
    }
    const attributes = parseStoredJson<RalphEntityAttributes | Record<string, unknown>>(row.attributes_json, {});
    if (!hasStructuredRalphAttributes(attributes)) {
      throw new Error(`Ralph run entity ${runId} is missing structured attributes`);
    }
    return normalizeStoredRunState(attributes.record.state);
  }

  private readIterationHistory(runId: string): RalphIterationRecord[] {
    const row = findStoredRalphRow(this.cwd, runId);
    if (!row) {
      return [];
    }
    const attributes = parseStoredJson<RalphEntityAttributes | Record<string, unknown>>(row.attributes_json, {});
    if (!hasStructuredRalphAttributes(attributes)) {
      throw new Error(`Ralph run entity ${runId} is missing structured attributes`);
    }
    return attributes.record.iterations.map((entry) =>
      normalizeIteration(entry),
    );
  }

  private readIterations(runId: string): RalphIterationRecord[] {
    return latestById(this.readIterationHistory(runId)).sort((left, right) => left.iteration - right.iteration);
  }

  private readLaunch(runId: string): RalphLaunchDescriptor | null {
    const row = findStoredRalphRow(this.cwd, runId);
    if (!row) {
      return null;
    }
    const attributes = parseStoredJson<RalphEntityAttributes | Record<string, unknown>>(row.attributes_json, {});
    if (!hasStructuredRalphAttributes(attributes) || !attributes.record.launch) {
      return null;
    }
    const launch = attributes.record.launch;
    return {
      runId: normalizeRalphRunId(launch.runId),
      iterationId: launch.iterationId.trim(),
      iteration: Math.max(1, Math.floor(launch.iteration)),
      createdAt: launch.createdAt,
      runtime: launch.runtime,
      packetPath: toRepoRelativeWorkspacePath(this.cwd, resolve(this.cwd, launch.packetPath)),
      launchPath: toRepoRelativeWorkspacePath(this.cwd, resolve(this.cwd, launch.launchPath)),
      resume: launch.resume === true,
      instructions: normalizeStringList(launch.instructions),
    };
  }

  private defaultLaunchDescriptor(state: RalphRunState, iteration: RalphIterationRecord | null): RalphLaunchDescriptor {
    const artifacts = getRalphArtifactPaths(this.cwd, state.runId);
    return {
      runId: state.runId,
      iterationId: iteration?.id ?? "iter-001",
      iteration: iteration?.iteration ?? Math.max(1, state.lastIterationNumber || 1),
      createdAt: currentTimestamp(),
      runtime: "descriptor_only",
      packetPath: toRepoRelativeWorkspacePath(this.cwd, artifacts.packet),
      launchPath: toRepoRelativeWorkspacePath(this.cwd, artifacts.launch),
      resume: false,
      instructions: [
        "Runtime launch adapters are not implemented yet.",
        `Use ${toRepoRelativeWorkspacePath(this.cwd, artifacts.packet)} as the canonical packet for the next iteration.`,
        `Persist iteration updates to ${toRepoRelativeWorkspacePath(this.cwd, artifacts.iterations)} through Ralph tools.`,
      ],
    };
  }

  private writeArtifacts(
    state: RalphRunState,
    launchOverride?: RalphLaunchDescriptor | null,
    iterationsOverride?: RalphIterationRecord[],
  ): RalphReadResult {
    const artifacts = getRalphArtifactPaths(this.cwd, state.runId);
    const iterations = iterationsOverride ?? this.readIterations(state.runId);
    const normalizedState: RalphRunState = {
      ...state,
      lastIterationNumber: iterations.at(-1)?.iteration ?? state.lastIterationNumber,
      packetSummary: createPacketSummary(state),
    };
    const summary = this.summarizeRun(normalizedState, artifacts.dir);
    const packet = this.buildPacket(normalizedState, iterations);
    const run = renderRalphMarkdown(normalizedState, iterations);
    const launch =
      launchOverride ??
      this.readLaunch(state.runId) ??
      this.defaultLaunchDescriptor(normalizedState, iterations.at(-1) ?? null);
    const dashboard = buildRalphDashboard(
      normalizedState,
      summary,
      iterations,
      artifacts,
      RALPH_ITERATION_STATUSES,
      RALPH_VERIFIER_VERDICTS,
    );

    const record: RalphReadResult = {
      state: normalizedState,
      summary,
      packet,
      run,
      iterations,
      launch,
      dashboard,
      artifacts,
    };
    const { storage, identity } = openRalphCatalogSync(this.cwd);
    const existing = findStoredRalphRow(this.cwd, record.summary.id);
    void storage.upsertEntity({
      id: existing?.id ?? createEntityId(ENTITY_KIND, identity.space.id, record.summary.id, `${ENTITY_KIND}:${record.summary.id}`),
      kind: ENTITY_KIND,
      spaceId: identity.space.id,
      owningRepositoryId: identity.repository.id,
      displayId: record.summary.id,
      title: record.summary.title,
      summary: record.state.summary,
      status: record.summary.status,
      version: (existing?.version ?? 0) + 1,
      tags: [record.summary.phase, ...(record.state.linkedRefs.planIds ?? [])],
      pathScopes: [],
      attributes: { record },
      createdAt: existing?.created_at ?? record.state.createdAt,
      updatedAt: record.state.updatedAt,
    });
    return record;
  }

  private createDefaultState(input: CreateRalphRunInput, runId: string, timestamp: string): RalphRunState {
    const title = input.title.trim();
    if (!title) {
      throw new Error("Ralph run title is required");
    }
    return {
      runId,
      title,
      status: "planned",
      phase: "preparing",
      waitingFor: "none",
      createdAt: timestamp,
      updatedAt: timestamp,
      objective: input.objective?.trim() ?? "",
      summary: summarizeText(input.summary ?? input.objective, `Ralph orchestration run for ${title}.`),
      linkedRefs: normalizeLinkedRefs(input.linkedRefs),
      policySnapshot: normalizePolicySnapshot(input.policySnapshot),
      verifierSummary: normalizeVerifierSummary(input.verifierSummary),
      critiqueLinks: normalizeCritiqueLinks(input.critiqueLinks),
      latestDecision: normalizeDecision(input.latestDecision),
      lastIterationNumber: 0,
      currentIterationId: null,
      lastLaunchAt: null,
      launchCount: 0,
      stopReason: null,
      packetSummary: "",
    };
  }

  private latestIterationById(iterations: RalphIterationRecord[], id: string | null): RalphIterationRecord | null {
    if (!id) {
      return null;
    }
    return iterations.find((iteration) => iteration.id === id) ?? null;
  }

  private buildDecision(state: RalphRunState, input: DecideRalphRunInput): RalphContinuationDecision {
    const decidedBy =
      input.decidedBy ??
      (input.operatorRequestedStop
        ? "operator"
        : input.runtimeUnavailable || input.runtimeFailure
          ? "runtime"
          : "policy");
    const blockingCritiques = state.critiqueLinks.filter((link) => link.blocking).map((link) => link.critiqueId);
    const hasRequiredCritique = state.critiqueLinks.some((link) => link.required);
    const critiquePending = state.critiqueLinks.some((link) => link.required && link.verdict === null);
    const verifierSatisfied = !state.policySnapshot.verifierRequired || state.verifierSummary.verdict === "pass";
    const blockingRefs = normalizeStringList([...(input.blockingRefs ?? []), ...blockingCritiques]);

    if (input.operatorRequestedStop) {
      return {
        kind: "halt",
        reason: "operator_requested",
        summary: input.summary?.trim() || "Operator requested the Ralph run to stop.",
        decidedAt: currentTimestamp(),
        decidedBy,
        blockingRefs,
      };
    }
    if (input.runtimeUnavailable) {
      return {
        kind: "halt",
        reason: "runtime_unavailable",
        summary: input.summary?.trim() || "Runtime support was unavailable for the next Ralph iteration.",
        decidedAt: currentTimestamp(),
        decidedBy,
        blockingRefs,
      };
    }
    if (input.runtimeFailure) {
      return {
        kind: "halt",
        reason: "runtime_failure",
        summary: input.summary?.trim() || "Runtime execution failed and halted the Ralph run.",
        decidedAt: currentTimestamp(),
        decidedBy,
        blockingRefs,
      };
    }
    if (input.timeoutExceeded) {
      return {
        kind: "halt",
        reason: "timeout_exceeded",
        summary: input.summary?.trim() || "The Ralph run exceeded its configured runtime limit.",
        decidedAt: currentTimestamp(),
        decidedBy: "policy",
        blockingRefs,
      };
    }
    if (input.budgetExceeded) {
      return {
        kind: "halt",
        reason: "budget_exceeded",
        summary: input.summary?.trim() || "The Ralph run exceeded its configured token budget.",
        decidedAt: currentTimestamp(),
        decidedBy: "policy",
        blockingRefs,
      };
    }
    if (
      state.policySnapshot.maxIterations !== null &&
      state.lastIterationNumber >= state.policySnapshot.maxIterations
    ) {
      return {
        kind: "halt",
        reason: "iteration_limit_reached",
        summary: input.summary?.trim() || "The Ralph run reached its configured iteration limit.",
        decidedAt: currentTimestamp(),
        decidedBy: "policy",
        blockingRefs,
      };
    }
    if (state.policySnapshot.critiqueRequired && (!hasRequiredCritique || critiquePending)) {
      return {
        kind: "pause",
        reason: "manual_review_required",
        summary: input.summary?.trim() || "The run is waiting for required critique input before continuing.",
        decidedAt: currentTimestamp(),
        decidedBy: "policy",
        blockingRefs,
      };
    }
    if (blockingCritiques.length > 0) {
      return {
        kind: "pause",
        reason: "critique_blocked",
        summary:
          input.summary?.trim() || "Blocking critique findings require review or revision before the run can continue.",
        decidedAt: currentTimestamp(),
        decidedBy: state.policySnapshot.critiqueRequired ? "critique" : "policy",
        blockingRefs,
      };
    }
    if (state.policySnapshot.verifierRequired && (state.verifierSummary.blocker || !verifierSatisfied)) {
      return {
        kind: "pause",
        reason: "verifier_blocked",
        summary: input.summary?.trim() || "Verifier evidence is blocking further Ralph progress.",
        decidedAt: currentTimestamp(),
        decidedBy: "verifier",
        blockingRefs: normalizeStringList([
          ...blockingRefs,
          `${state.verifierSummary.sourceKind}:${state.verifierSummary.sourceRef}`,
        ]),
      };
    }
    if (state.policySnapshot.manualApprovalRequired) {
      return {
        kind: "pause",
        reason: "manual_review_required",
        summary: input.summary?.trim() || "Manual approval is required before the Ralph run may continue or complete.",
        decidedAt: currentTimestamp(),
        decidedBy: "policy",
        blockingRefs,
      };
    }
    if (input.workerRequestedCompletion) {
      if (state.policySnapshot.stopWhenVerified) {
        return {
          kind: "complete",
          reason: "goal_reached",
          summary:
            input.summary?.trim() || "The worker reported completion and the policy gates permit stopping the run.",
          decidedAt: currentTimestamp(),
          decidedBy,
          blockingRefs,
        };
      }
      return {
        kind: "continue",
        reason: "worker_requested_completion",
        summary:
          input.summary?.trim() ||
          "The worker reported completion, but the policy requires another explicit step before stopping.",
        decidedAt: currentTimestamp(),
        decidedBy: "policy",
        blockingRefs,
      };
    }
    return {
      kind: "continue",
      reason: "unknown",
      summary: input.summary?.trim() || "The run remains eligible for another bounded iteration.",
      decidedAt: currentTimestamp(),
      decidedBy: "policy",
      blockingRefs,
    };
  }

  private applyDecision(state: RalphRunState, decision: RalphContinuationDecision): RalphRunState {
    const next: RalphRunState = {
      ...state,
      latestDecision: decision,
      updatedAt: currentTimestamp(),
    };

    switch (decision.kind) {
      case "continue": {
        next.status = "active";
        next.phase = "deciding";
        next.waitingFor = "none";
        next.stopReason = null;
        return next;
      }
      case "pause": {
        const nextWaitingFor =
          decision.reason === "critique_blocked"
            ? "operator"
            : decision.reason === "verifier_blocked"
              ? "operator"
              : state.policySnapshot.manualApprovalRequired
                ? "operator"
                : "critique";
        next.status = nextWaitingFor === "operator" ? "paused" : "waiting_for_review";
        next.phase = "reviewing";
        next.waitingFor = nextWaitingFor;
        next.stopReason = decision.reason;
        return next;
      }
      case "complete": {
        next.status = "completed";
        next.phase = "completed";
        next.waitingFor = "none";
        next.stopReason = decision.reason;
        next.currentIterationId = null;
        return next;
      }
      case "halt": {
        next.status = decision.reason === "runtime_failure" ? "failed" : "halted";
        next.phase = "halted";
        next.waitingFor = "none";
        next.stopReason = decision.reason;
        next.currentIterationId = null;
        return next;
      }
      case "escalate": {
        next.status = "paused";
        next.phase = "reviewing";
        next.waitingFor = "operator";
        next.stopReason = decision.reason;
        return next;
      }
    }
  }

  private createLaunchDescriptor(
    state: RalphRunState,
    iteration: RalphIterationRecord,
    input: PrepareRalphLaunchInput,
  ): RalphLaunchDescriptor {
    const artifacts = getRalphArtifactPaths(this.cwd, state.runId);
    return {
      runId: state.runId,
      iterationId: iteration.id,
      iteration: iteration.iteration,
      createdAt: currentTimestamp(),
      runtime: "subprocess",
      packetPath: toRepoRelativeWorkspacePath(this.cwd, artifacts.packet),
      launchPath: toRepoRelativeWorkspacePath(this.cwd, artifacts.launch),
      resume: input.resume === true,
      instructions:
        normalizeStringList(input.instructions).length > 0
          ? normalizeStringList(input.instructions)
          : [
              `Read ${toRepoRelativeWorkspacePath(this.cwd, artifacts.packet)} before acting.`,
              `Persist iteration updates for ${iteration.id} through the Ralph tools.`,
              "Execute exactly one bounded iteration and record an explicit policy decision before exiting.",
            ],
    };
  }

  listRuns(filter: RalphListFilter = {}) {
    this.initLedger();
    return this.runDirectories()
      .map((directory) => this.summarizeRun(this.readState(directory), directory))
      .filter((summary) => {
        if (filter.status && summary.status !== filter.status) {
          return false;
        }
        if (filter.phase && summary.phase !== filter.phase) {
          return false;
        }
        if (filter.decision && summary.decision !== filter.decision) {
          return false;
        }
        if (filter.waitingFor && summary.waitingFor !== filter.waitingFor) {
          return false;
        }
        if (!filter.text) {
          return true;
        }
        const haystack = [summary.id, summary.title, summary.objectiveSummary, summary.policyMode]
          .join(" ")
          .toLowerCase();
        return haystack.includes(filter.text.toLowerCase());
      });
  }

  readRun(ref: string): RalphReadResult {
    this.initLedger();
    const runDir = this.resolveRunDirectory(ref);
    return this.writeArtifacts(this.readState(runDir));
  }

  createRun(input: CreateRalphRunInput): RalphReadResult {
    this.initLedger();
    const timestamp = currentTimestamp();
    const requestedRunId = normalizeOptionalString(input.runId);
    const runId = requestedRunId ? normalizeRalphRunId(requestedRunId) : this.nextRunId(input.title);
    if (requestedRunId && findStoredRalphRow(this.cwd, runId)) {
      throw new Error(`Ralph run already exists: ${runId}`);
    }
    const state = this.createDefaultState(input, runId, timestamp);
    return this.writeArtifacts(state, this.defaultLaunchDescriptor(state, null));
  }

  updateRun(ref: string, input: UpdateRalphRunInput): RalphReadResult {
    const current = this.readRun(ref);
    const waitingFor = input.waitingFor ? normalizeWaitingFor(input.waitingFor) : current.state.waitingFor;
    const nextState: RalphRunState = {
      ...current.state,
      title: input.title?.trim() || current.state.title,
      objective: input.objective?.trim() ?? current.state.objective,
      summary:
        input.summary !== undefined
          ? summarizeText(input.summary, current.state.summary || `Ralph run ${current.state.runId}`)
          : current.state.summary,
      linkedRefs: mergeLinkedRefs(current.state.linkedRefs, input.linkedRefs),
      policySnapshot: mergePolicySnapshot(current.state.policySnapshot, input.policySnapshot),
      verifierSummary: mergeVerifierSummary(current.state.verifierSummary, input.verifierSummary),
      critiqueLinks: input.critiqueLinks
        ? mergeCritiqueLinks(current.state.critiqueLinks, input.critiqueLinks)
        : current.state.critiqueLinks,
      latestDecision:
        input.latestDecision !== undefined ? normalizeDecision(input.latestDecision) : current.state.latestDecision,
      waitingFor,
      status: input.status ? normalizeRunStatus(input.status) : current.state.status,
      phase: input.phase ? normalizeRunPhase(input.phase) : current.state.phase,
      updatedAt: currentTimestamp(),
    };
    return this.writeArtifacts(nextState);
  }

  appendIteration(ref: string, input: AppendRalphIterationInput): RalphReadResult {
    const current = this.readRun(ref);
    const history = this.readIterationHistory(current.state.runId);
    const latestIterations = this.readIterations(current.state.runId);
    const existing = input.id
      ? (latestIterations.find((iteration) => iteration.id === input.id) ?? null)
      : this.latestIterationById(latestIterations, current.state.currentIterationId);
    const now = currentTimestamp();
    const id =
      input.id?.trim() ||
      existing?.id ||
      nextSequenceId(
        "iter",
        history.map((entry) => entry.id),
      );
    const iterationNumber = existing?.iteration ?? current.state.lastIterationNumber + 1;
    const status = normalizeIterationStatus(
      input.status ?? existing?.status ?? (existing ? existing.status : "pending"),
    );
    const verifier = normalizeVerifierSummary({
      ...current.state.verifierSummary,
      ...existing?.verifier,
      ...input.verifier,
    });
    const critiqueLinks = mergeCritiqueLinks(existing?.critiqueLinks ?? [], input.critiqueLinks);
    const decision = input.decision !== undefined ? normalizeDecision(input.decision) : (existing?.decision ?? null);
    const record: RalphIterationRecord = {
      id,
      runId: current.state.runId,
      iteration: iterationNumber,
      status,
      startedAt: input.startedAt ?? existing?.startedAt ?? now,
      completedAt: completedAtForStatus(status, input.completedAt ?? existing?.completedAt),
      focus: input.focus?.trim() ?? existing?.focus ?? current.state.objective,
      summary: input.summary?.trim() ?? existing?.summary ?? "",
      workerSummary: input.workerSummary?.trim() ?? existing?.workerSummary ?? "",
      verifier,
      critiqueLinks,
      decision,
      notes: normalizeStringList([...(existing?.notes ?? []), ...(input.notes ?? [])]),
    };
    const nextIterations = latestById([...history, record]).sort((left, right) => left.iteration - right.iteration);

    const reviewWaitingFor = status === "reviewing" ? waitingForFromReviewSignals(verifier, critiqueLinks) : "none";

    const nextState: RalphRunState = {
      ...current.state,
      status:
        status === "failed"
          ? "failed"
          : status === "reviewing" && reviewWaitingFor !== "none"
            ? "waiting_for_review"
            : "active",
      phase: status === "reviewing" ? "reviewing" : status === "accepted" ? "deciding" : "executing",
      waitingFor: reviewWaitingFor,
      verifierSummary: verifier,
      critiqueLinks: mergeCritiqueLinks(current.state.critiqueLinks, critiqueLinks),
      latestDecision: decision ?? current.state.latestDecision,
      lastIterationNumber: Math.max(current.state.lastIterationNumber, iterationNumber),
      currentIterationId: ["accepted", "rejected", "failed", "cancelled"].includes(status) ? null : id,
      updatedAt: now,
      stopReason: ["failed", "cancelled"].includes(status) ? "runtime_failure" : current.state.stopReason,
    };
    return this.writeArtifacts(nextState, undefined, nextIterations);
  }

  setVerifier(ref: string, input: Partial<RalphVerifierSummary>): RalphReadResult {
    const current = this.readRun(ref);
    const verifierSummary = mergeVerifierSummary(current.state.verifierSummary, {
      ...input,
      checkedAt: input.checkedAt ?? currentTimestamp(),
    });
    const waitingFor = waitingForFromReviewSignals(verifierSummary, current.state.critiqueLinks);
    const status = verifierSummary.blocker ? "waiting_for_review" : current.state.status;
    const phase = verifierSummary.blocker ? "reviewing" : current.state.phase;
    return this.writeArtifacts({
      ...current.state,
      verifierSummary,
      waitingFor,
      status,
      phase,
      updatedAt: currentTimestamp(),
    });
  }

  linkCritique(ref: string, input: LinkRalphCritiqueInput): RalphReadResult {
    const current = this.readRun(ref);
    const link = normalizeCritiqueLink({
      critiqueId: input.critiqueId,
      kind: input.kind ?? "context",
      verdict: input.verdict ?? null,
      required: input.required === true,
      blocking: input.blocking === true,
      reviewedAt: input.reviewedAt ?? currentTimestamp(),
      findingIds: input.findingIds ?? [],
      summary: input.summary?.trim() ?? "",
    });
    const critiqueLinks = mergeCritiqueLinks(current.state.critiqueLinks, [link]);
    const waitingFor = waitingForFromReviewSignals(current.state.verifierSummary, critiqueLinks);
    return this.writeArtifacts({
      ...current.state,
      linkedRefs: mergeLinkedRefs(current.state.linkedRefs, { critiqueIds: [link.critiqueId] }),
      critiqueLinks,
      waitingFor,
      status: waitingFor === "none" ? current.state.status : "waiting_for_review",
      phase: waitingFor === "none" ? current.state.phase : "reviewing",
      updatedAt: currentTimestamp(),
    });
  }

  decideRun(ref: string, input: DecideRalphRunInput): RalphReadResult {
    const current = this.readRun(ref);
    const decision = this.buildDecision(current.state, input);
    return this.writeArtifacts(this.applyDecision(current.state, decision));
  }

  prepareLaunch(ref: string, input: PrepareRalphLaunchInput = {}): RalphReadResult {
    const current = this.readRun(ref);
    if (["completed", "halted", "failed", "archived"].includes(current.state.status)) {
      throw new Error(`Ralph run ${current.state.runId} cannot launch from status ${current.state.status}.`);
    }
    if (current.state.waitingFor !== "none") {
      throw new Error(
        `Ralph run ${current.state.runId} is waiting for ${current.state.waitingFor} and cannot launch until that gate is cleared.`,
      );
    }

    let latest = this.latestIterationById(current.iterations, current.state.currentIterationId);
    if (!latest || ["accepted", "rejected", "failed", "cancelled"].includes(latest.status)) {
      const prepared = this.appendIteration(ref, {
        status: "pending",
        focus: input.focus ?? current.state.objective,
        summary: input.resume ? "Resuming a paused Ralph iteration." : "Prepared a fresh Ralph iteration.",
      });
      latest = prepared.iterations.at(-1) ?? null;
    }
    if (!latest) {
      throw new Error(`Unable to prepare a Ralph iteration for ${current.state.runId}`);
    }

    const nextState: RalphRunState = {
      ...this.readRun(ref).state,
      status: "active",
      phase: "executing",
      waitingFor: "none",
      currentIterationId: latest.id,
      lastLaunchAt: currentTimestamp(),
      launchCount: current.state.launchCount + 1,
      updatedAt: currentTimestamp(),
      stopReason: null,
    };
    const launch = this.createLaunchDescriptor(nextState, latest, input);
    return this.writeArtifacts(nextState, launch);
  }

  resumeRun(ref: string, input: Omit<PrepareRalphLaunchInput, "resume"> = {}): RalphReadResult {
    return this.prepareLaunch(ref, { ...input, resume: true });
  }

  cancelLaunch(
    ref: string,
    previousState: RalphRunState,
    preparedIterationId: string,
    summary?: string,
  ): RalphReadResult {
    const current = this.readRun(ref);
    const iteration = this.latestIterationById(current.iterations, preparedIterationId);
    const nextIterations =
      iteration && iteration.status === "pending"
        ? latestById([
            ...current.iterations,
            {
              ...iteration,
              status: "cancelled" as const,
              completedAt: currentTimestamp(),
              summary: summary?.trim() || "Interactive Ralph launch was cancelled before a worker session started.",
              workerSummary: "No worker session was created.",
              notes: normalizeStringList([...(iteration.notes ?? []), "Launch cancelled before session start."]),
            },
          ]).sort((left, right) => left.iteration - right.iteration)
        : current.iterations;

    const nextState: RalphRunState = {
      ...previousState,
      lastIterationNumber: Math.max(
        previousState.lastIterationNumber,
        iteration?.iteration ?? previousState.lastIterationNumber,
      ),
      currentIterationId: previousState.currentIterationId,
      launchCount: previousState.launchCount,
      lastLaunchAt: previousState.lastLaunchAt,
      updatedAt: currentTimestamp(),
    };
    return this.writeArtifacts(nextState, undefined, nextIterations);
  }

  archiveRun(ref: string): RalphReadResult {
    const current = this.readRun(ref);
    return this.writeArtifacts({
      ...current.state,
      status: "archived",
      phase: "halted",
      waitingFor: "none",
      currentIterationId: null,
      updatedAt: currentTimestamp(),
    });
  }

  private async materializeCanonicalRecord(record: RalphReadResult): Promise<RalphReadResult> {
    return {
      ...record,
      packet: await this.buildPacketAsync(record.state, record.iterations),
    };
  }

  private async upsertCanonicalRecord(record: RalphReadResult): Promise<RalphReadResult> {
    const materialized = await this.materializeCanonicalRecord(record);
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const existing = await findEntityByDisplayId(storage, identity.space.id, ENTITY_KIND, materialized.summary.id);
    const version = (existing?.version ?? 0) + 1;
    await upsertEntityByDisplayId(storage, {
      kind: ENTITY_KIND,
      spaceId: identity.space.id,
      owningRepositoryId: identity.repository.id,
      displayId: materialized.summary.id,
      title: materialized.summary.title,
      summary: materialized.state.summary,
      status: materialized.summary.status,
      version,
      tags: [materialized.summary.phase, ...(materialized.state.linkedRefs.planIds ?? [])],
      pathScopes: [],
      attributes: { record: materialized },
      createdAt: existing?.createdAt ?? materialized.state.createdAt,
      updatedAt: materialized.state.updatedAt,
    });
    return materialized;
  }

  private entityRecord(entity: { attributes: unknown }): RalphReadResult {
    return (entity.attributes as RalphEntityAttributes).record;
  }

  async initLedgerAsync(): Promise<{ initialized: true; root: string }> {
    return this.initLedger();
  }

  async listRunsAsync(filter: RalphListFilter = {}): Promise<ReturnType<RalphStore["listRuns"]>> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const summaries = await Promise.all(
      (await storage.listEntities(identity.space.id, ENTITY_KIND)).map(async (entity) => {
        const runId = entity.displayId ?? entity.id;
        if (!hasStructuredRalphAttributes(entity.attributes)) {
          throw new Error(`Ralph run entity ${runId} is missing structured attributes`);
        }
        return this.entityRecord(entity).summary;
      }),
    );
    return summaries.filter((summary) => {
      if (filter.status && summary.status !== filter.status) return false;
      if (filter.phase && summary.phase !== filter.phase) return false;
      if (filter.decision && summary.decision !== filter.decision) return false;
      if (filter.waitingFor && summary.waitingFor !== filter.waitingFor) return false;
      if (!filter.text) return true;
      const text = filter.text.toLowerCase();
      return [summary.id, summary.title, summary.objectiveSummary, summary.status, summary.phase]
        .join(" ")
        .toLowerCase()
        .includes(text);
    });
  }

  async readRunAsync(ref: string): Promise<RalphReadResult> {
    const { storage, identity } = await openWorkspaceStorage(this.cwd);
    const runId = normalizeRalphRunRef(ref);
    const entity = await findEntityByDisplayId(storage, identity.space.id, ENTITY_KIND, runId);
    if (!entity) {
      throw new Error(`Unknown Ralph run: ${ref}`);
    }
    if (!hasStructuredRalphAttributes(entity.attributes)) {
      throw new Error(`Ralph run entity ${runId} is missing structured attributes`);
    }
    return this.materializeCanonicalRecord(this.entityRecord(entity));
  }

  async createRunAsync(input: CreateRalphRunInput): Promise<RalphReadResult> {
    return this.upsertCanonicalRecord(this.createRun(input));
  }

  async updateRunAsync(ref: string, input: UpdateRalphRunInput): Promise<RalphReadResult> {
    return this.upsertCanonicalRecord(this.updateRun(ref, input));
  }

  async appendIterationAsync(ref: string, input: AppendRalphIterationInput): Promise<RalphReadResult> {
    return this.upsertCanonicalRecord(this.appendIteration(ref, input));
  }

  async setVerifierAsync(ref: string, input: Partial<RalphVerifierSummary>): Promise<RalphReadResult> {
    return this.upsertCanonicalRecord(this.setVerifier(ref, input));
  }

  async linkCritiqueAsync(ref: string, input: LinkRalphCritiqueInput): Promise<RalphReadResult> {
    return this.upsertCanonicalRecord(this.linkCritique(ref, input));
  }

  async decideRunAsync(ref: string, input: DecideRalphRunInput): Promise<RalphReadResult> {
    return this.upsertCanonicalRecord(this.decideRun(ref, input));
  }

  async prepareLaunchAsync(ref: string, input: PrepareRalphLaunchInput = {}): Promise<RalphReadResult> {
    return this.upsertCanonicalRecord(this.prepareLaunch(ref, input));
  }

  async resumeRunAsync(ref: string, input: Omit<PrepareRalphLaunchInput, "resume"> = {}): Promise<RalphReadResult> {
    return this.upsertCanonicalRecord(this.resumeRun(ref, input));
  }

  async cancelLaunchAsync(
    ref: string,
    previousState: RalphRunState,
    preparedIterationId: string,
    summary?: string,
  ): Promise<RalphReadResult> {
    return this.upsertCanonicalRecord(this.cancelLaunch(ref, previousState, preparedIterationId, summary));
  }

  async archiveRunAsync(ref: string): Promise<RalphReadResult> {
    return this.upsertCanonicalRecord(this.archiveRun(ref));
  }
}

export function createRalphStore(cwd: string): RalphStore {
  return new RalphStore(cwd);
}
