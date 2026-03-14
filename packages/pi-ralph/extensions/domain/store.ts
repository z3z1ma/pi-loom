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
import { basename, dirname, join, relative, resolve } from "node:path";
import { createConstitutionalStore } from "@pi-loom/pi-constitution/extensions/domain/store.js";
import { createCritiqueStore } from "@pi-loom/pi-critique/extensions/domain/store.js";
import { createDocumentationStore } from "@pi-loom/pi-docs/extensions/domain/store.js";
import { createInitiativeStore } from "@pi-loom/pi-initiatives/extensions/domain/store.js";
import { createPlanStore } from "@pi-loom/pi-plans/extensions/domain/store.js";
import { createResearchStore } from "@pi-loom/pi-research/extensions/domain/store.js";
import { createSpecStore } from "@pi-loom/pi-specs/extensions/domain/store.js";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import { buildRalphDashboard, summarizeRalphRun } from "./dashboard.js";
import { renderBulletList, renderSection } from "./frontmatter.js";
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

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function writeFileAtomic(path: string, content: string): void {
  ensureDir(dirname(path));
  const tempPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tempPath, content, "utf-8");
  renameSync(tempPath, path);
}

function ensureFile(path: string, content: string): void {
  if (!existsSync(path)) {
    writeFileAtomic(path, content);
  }
}

function toRepoRelativeWorkspacePath(cwd: string, filePath: string): string {
  const relativePath = relative(cwd, filePath);
  return relativePath || ".";
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

function waitingForFromCritiques(links: RalphCritiqueLink[]): RalphWaitingFor {
  if (links.some((link) => link.required && link.verdict === null)) {
    return "critique";
  }
  if (links.some((link) => link.blocking)) {
    return "operator";
  }
  return "none";
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
    const paths = getRalphPaths(this.cwd);
    ensureDir(paths.ralphDir);
    return { initialized: true, root: paths.ralphDir };
  }

  private runDirectories(): string[] {
    const directory = getRalphPaths(this.cwd).ralphDir;
    if (!existsSync(directory)) {
      return [];
    }
    return readdirSync(directory)
      .map((entry) => join(directory, entry))
      .filter((path) => statSync(path).isDirectory())
      .sort((left, right) => basename(left).localeCompare(basename(right)));
  }

  private nextRunId(seed: string): string {
    const baseId = slugifyRalphValue(seed);
    const existing = new Set(this.runDirectories().map((directory) => basename(directory)));
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
    if (!existsSync(join(runDir, "state.json"))) {
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

  private resolvePacketContext(state: RalphRunState): ResolvedPacketContext {
    const constitutionStore = createConstitutionalStore(this.cwd);
    const initiativeStore = createInitiativeStore(this.cwd);
    const researchStore = createResearchStore(this.cwd);
    const specStore = createSpecStore(this.cwd);
    const planStore = createPlanStore(this.cwd);
    const ticketStore = createTicketStore(this.cwd);
    const critiqueStore = createCritiqueStore(this.cwd);
    const docsStore = createDocumentationStore(this.cwd);

    return {
      roadmap: this.buildContextSummary(state.linkedRefs.roadmapItemIds, (ref) => {
        const item = constitutionStore.readRoadmapItem(ref);
        return `${item.id} [${item.status}] ${item.title}`;
      }),
      initiatives: this.buildContextSummary(state.linkedRefs.initiativeIds, (ref) => {
        const initiative = initiativeStore.readInitiative(ref);
        return `${initiative.summary.id} [${initiative.summary.status}] ${initiative.state.title}`;
      }),
      research: this.buildContextSummary(state.linkedRefs.researchIds, (ref) => {
        const research = researchStore.readResearch(ref);
        return `${research.summary.id} [${research.summary.status}] ${research.state.title}`;
      }),
      specs: this.buildContextSummary(state.linkedRefs.specChangeIds, (ref) => {
        const spec = specStore.readChange(ref);
        return `${spec.summary.id} [${spec.summary.status}] ${spec.state.title}`;
      }),
      plans: this.buildContextSummary(state.linkedRefs.planIds, (ref) => {
        const plan = planStore.readPlan(ref);
        return `${plan.summary.id} [${plan.summary.status}] ${plan.state.title}`;
      }),
      tickets: this.buildContextSummary(state.linkedRefs.ticketIds, (ref) => {
        const ticket = ticketStore.readTicket(ref);
        return `${ticket.summary.id} [${ticket.summary.status}] ${ticket.summary.title}`;
      }),
      critiques: this.buildContextSummary(state.linkedRefs.critiqueIds, (ref) => {
        const critique = critiqueStore.readCritique(ref);
        return `${critique.summary.id} [${critique.summary.status}/${critique.summary.verdict}] ${critique.state.title}`;
      }),
      docs: this.buildContextSummary(state.linkedRefs.docIds, (ref) => {
        const doc = docsStore.readDoc(ref);
        return `${doc.summary.id} [${doc.summary.status}/${doc.summary.docType}] ${doc.state.title}`;
      }),
    };
  }

  private buildPacket(state: RalphRunState, iterations: RalphIterationRecord[]): string {
    const context = this.resolvePacketContext(state);
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

  private readState(runDir: string): RalphRunState {
    const state = readJson<RalphRunState>(join(runDir, "state.json"));
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

  private readIterationHistory(runId: string): RalphIterationRecord[] {
    return readJsonl<RalphIterationRecord>(getRalphArtifactPaths(this.cwd, runId).iterations).map((entry) =>
      normalizeIteration(entry),
    );
  }

  private readIterations(runId: string): RalphIterationRecord[] {
    return latestById(this.readIterationHistory(runId)).sort((left, right) => left.iteration - right.iteration);
  }

  private readLaunch(runId: string): RalphLaunchDescriptor | null {
    const launchPath = getRalphArtifactPaths(this.cwd, runId).launch;
    if (!existsSync(launchPath)) {
      return null;
    }
    const launch = readJson<RalphLaunchDescriptor>(launchPath);
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

  private writeArtifacts(state: RalphRunState, launchOverride?: RalphLaunchDescriptor | null): RalphReadResult {
    const artifacts = getRalphArtifactPaths(this.cwd, state.runId);
    ensureDir(artifacts.dir);
    ensureFile(artifacts.iterations, "");

    const iterations = this.readIterations(state.runId);
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

    writeJson(artifacts.state, normalizedState);
    writeFileAtomic(artifacts.packet, packet);
    writeFileAtomic(artifacts.run, run);
    writeJson(artifacts.dashboard, dashboard);
    writeJson(artifacts.launch, launch);

    return {
      state: normalizedState,
      summary,
      packet,
      run,
      iterations,
      launch,
      dashboard,
      artifacts,
    };
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
    const runDir = getRalphRunDir(this.cwd, runId);

    if (requestedRunId && existsSync(join(runDir, "state.json"))) {
      throw new Error(`Ralph run already exists: ${runId}`);
    }

    ensureDir(runDir);
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
    appendJsonl(current.artifacts.iterations, record);

    const nextState: RalphRunState = {
      ...current.state,
      status: status === "failed" ? "failed" : "active",
      phase: status === "reviewing" ? "reviewing" : status === "accepted" ? "deciding" : "executing",
      waitingFor: status === "reviewing" ? waitingForFromCritiques(critiqueLinks) : "none",
      verifierSummary: verifier,
      critiqueLinks: mergeCritiqueLinks(current.state.critiqueLinks, critiqueLinks),
      latestDecision: decision ?? current.state.latestDecision,
      lastIterationNumber: Math.max(current.state.lastIterationNumber, iterationNumber),
      currentIterationId: ["accepted", "rejected", "failed", "cancelled"].includes(status) ? null : id,
      updatedAt: now,
      stopReason: ["failed", "cancelled"].includes(status) ? "runtime_failure" : current.state.stopReason,
    };
    return this.writeArtifacts(nextState);
  }

  setVerifier(ref: string, input: Partial<RalphVerifierSummary>): RalphReadResult {
    const current = this.readRun(ref);
    const verifierSummary = mergeVerifierSummary(current.state.verifierSummary, {
      ...input,
      checkedAt: input.checkedAt ?? currentTimestamp(),
    });
    const waitingFor = verifierSummary.blocker ? "operator" : waitingForFromCritiques(current.state.critiqueLinks);
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
    const waitingFor = waitingForFromCritiques(critiqueLinks);
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
    if (iteration && iteration.status === "pending") {
      appendJsonl(current.artifacts.iterations, {
        ...iteration,
        status: "cancelled",
        completedAt: currentTimestamp(),
        summary: summary?.trim() || "Interactive Ralph launch was cancelled before a worker session started.",
        workerSummary: "No worker session was created.",
        notes: normalizeStringList([...(iteration.notes ?? []), "Launch cancelled before session start."]),
      });
    }

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
    return this.writeArtifacts(nextState);
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
}

export function createRalphStore(cwd: string): RalphStore {
  return new RalphStore(cwd);
}
