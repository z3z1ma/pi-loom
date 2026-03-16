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
import type { ConstitutionalRecord } from "@pi-loom/pi-constitution/extensions/domain/models.js";
import { createConstitutionalStore } from "@pi-loom/pi-constitution/extensions/domain/store.js";
import type { InitiativeRecord } from "@pi-loom/pi-initiatives/extensions/domain/models.js";
import { createInitiativeStore } from "@pi-loom/pi-initiatives/extensions/domain/store.js";
import type { ResearchRecord } from "@pi-loom/pi-research/extensions/domain/models.js";
import { createResearchStore } from "@pi-loom/pi-research/extensions/domain/store.js";
import type { SpecChangeRecord } from "@pi-loom/pi-specs/extensions/domain/models.js";
import { createSpecStore } from "@pi-loom/pi-specs/extensions/domain/store.js";
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
  getCritiqueDashboardPath,
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
    ticketIds: change.projection?.tickets.map((ticket) => ticket.ticketId) ?? [],
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
    const paths = getCritiquePaths(this.cwd);
    ensureDir(paths.critiquesDir);
    return { initialized: true, root: paths.critiquesDir };
  }

  private critiqueDirectories(): string[] {
    const directory = getCritiquePaths(this.cwd).critiquesDir;
    if (!existsSync(directory)) {
      return [];
    }
    return readdirSync(directory)
      .map((entry) => join(directory, entry))
      .filter((path) => statSync(path).isDirectory())
      .sort((left, right) => basename(left).localeCompare(basename(right)));
  }

  private nextCritiqueId(baseTitle: string): string {
    const baseId = slugifyTitle(baseTitle);
    const existing = new Set(this.critiqueDirectories().map((directory) => basename(directory)));
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
    const directPath = getCritiqueDir(this.cwd, normalizedRef);
    if (existsSync(join(directPath, "state.json"))) {
      return directPath;
    }
    throw new Error(`Unknown critique: ${ref}`);
  }

  private readState(critiqueDir: string): CritiqueState {
    const state = readJson<CritiqueState>(join(critiqueDir, "state.json"));
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
    return readJsonl<CritiqueRunRecord>(join(critiqueDir, "runs.jsonl")).map((run) => ({
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
    return readJsonl<CritiqueFindingRecord>(join(critiqueDir, "findings.jsonl")).map((finding) => ({
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
    const launchPath = join(critiqueDir, "launch.json");
    if (!existsSync(launchPath)) {
      return null;
    }
    return readJson<CritiqueLaunchDescriptor>(launchPath);
  }

  private writeState(critiqueId: string, state: CritiqueState): void {
    writeJson(getCritiqueStatePath(this.cwd, critiqueId), state);
  }

  private writeLaunch(critiqueId: string, launch: CritiqueLaunchDescriptor): void {
    writeJson(getCritiqueLaunchPath(this.cwd, critiqueId), launch);
  }

  private constitutionExists(): boolean {
    return existsSync(join(this.cwd, ".loom", "constitution", "state.json"));
  }

  private readConstitutionIfPresent(): ConstitutionalRecord | null {
    if (!this.constitutionExists()) {
      return null;
    }
    try {
      return createConstitutionalStore(this.cwd).readConstitution();
    } catch {
      return null;
    }
  }

  private safeReadInitiative(id: string): InitiativeRecord | null {
    try {
      return createInitiativeStore(this.cwd).readInitiative(id);
    } catch {
      return null;
    }
  }

  private safeReadResearch(id: string): ResearchRecord | null {
    try {
      return createResearchStore(this.cwd).readResearch(id);
    } catch {
      return null;
    }
  }

  private safeReadSpec(id: string): SpecChangeRecord | null {
    try {
      return createSpecStore(this.cwd).readChange(id);
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
            `Projection tickets: ${change.projection?.tickets.length ?? 0}`,
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

  private resolvePacketContext(state: CritiqueState): ResolvedCritiqueContext {
    const target = this.resolveTargetSummary(state.target);
    const contextRefs = mergeContextRefs(state.contextRefs, target.contextRefs);
    const constitution = this.readConstitutionIfPresent();
    const roadmapItems = constitution
      ? contextRefs.roadmapItemIds
          .map((itemId) => {
            try {
              return createConstitutionalStore(this.cwd).readRoadmapItem(itemId);
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

  private writeArtifacts(
    state: CritiqueState,
    runs: CritiqueRunRecord[],
    findings: CritiqueFindingRecord[],
  ): CritiqueReadResult {
    const critiqueId = state.critiqueId;
    const critiqueDir = getCritiqueDir(this.cwd, critiqueId);
    const launch = this.readLaunch(critiqueDir);
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

    this.writeState(critiqueId, nextState);
    writeFileAtomic(getCritiquePacketPath(this.cwd, critiqueId), packet);
    writeFileAtomic(getCritiqueMarkdownPath(this.cwd, critiqueId), critique);
    writeJson(getCritiqueDashboardPath(this.cwd, critiqueId), dashboard);

    const summary = summarizeCritique(nextState, critiqueDir);
    return {
      state: nextState,
      summary,
      packet,
      critique,
      runs,
      findings,
      dashboard,
      launch,
    };
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
    return this.critiqueDirectories()
      .map((directory) => {
        const state = this.readState(directory);
        return summarizeCritique(state, directory);
      })
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
    const critiqueDir = this.resolveCritiqueDirectory(ref);
    const state = this.readState(critiqueDir);
    const runs = this.readRuns(critiqueDir);
    const findings = latestFindings(this.readFindingsHistory(critiqueDir));
    return this.writeArtifacts(state, runs, findings);
  }

  createCritique(input: CreateCritiqueInput): CritiqueReadResult {
    this.initLedger();
    const timestamp = currentTimestamp();
    const critiqueId = this.nextCritiqueId(input.title);
    const critiqueDir = getCritiqueDir(this.cwd, critiqueId);
    ensureDir(critiqueDir);
    writeFileAtomic(getCritiqueRunsPath(this.cwd, critiqueId), "");
    writeFileAtomic(getCritiqueFindingsPath(this.cwd, critiqueId), "");
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
    this.writeLaunch(critique.state.critiqueId, launch);
    const refreshed = this.updateCritique(ref, {
      status: critique.state.status === "proposed" ? "active" : critique.state.status,
    });
    const nextState: CritiqueState = {
      ...refreshed.state,
      lastLaunchAt: timestamp,
      launchCount: refreshed.state.launchCount + 1,
      updatedAt: timestamp,
    };
    const materialized = this.writeArtifacts(nextState, refreshed.runs, refreshed.findings);
    this.writeLaunch(materialized.state.critiqueId, launch);
    return {
      critique: materialized,
      launch,
      text: renderLaunchDescriptor(this.cwd, launch),
    };
  }

  recordRun(ref: string, input: CreateCritiqueRunInput): CritiqueReadResult {
    const critiqueDir = this.resolveCritiqueDirectory(ref);
    const state = this.readState(critiqueDir);
    const runs = this.readRuns(critiqueDir);
    const findings = latestFindings(this.readFindingsHistory(critiqueDir));
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
    appendJsonl(getCritiqueRunsPath(this.cwd, state.critiqueId), run);
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
    const critiqueDir = this.resolveCritiqueDirectory(ref);
    const state = this.readState(critiqueDir);
    const runs = this.readRuns(critiqueDir);
    if (!runs.some((run) => run.id === input.runId)) {
      throw new Error(`Unknown critique run: ${input.runId}`);
    }
    const findingHistory = this.readFindingsHistory(critiqueDir);
    const findings = latestFindings(findingHistory);
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
    appendJsonl(getCritiqueFindingsPath(this.cwd, state.critiqueId), finding);
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
    const critiqueDir = this.resolveCritiqueDirectory(ref);
    const state = this.readState(critiqueDir);
    const runs = this.readRuns(critiqueDir);
    const findingHistory = this.readFindingsHistory(critiqueDir);
    const findings = latestFindings(findingHistory);
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
    appendJsonl(getCritiqueFindingsPath(this.cwd, state.critiqueId), updated);
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

    const context = this.resolvePacketContext(critique.state);
    const ticketStore = createTicketStore(this.cwd);
    const created = ticketStore.createTicket({
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

    return this.updateFinding(ref, {
      id: finding.id,
      linkedTicketId: created.summary.id,
      status: "accepted",
      resolutionNotes: `Follow-up ticket created: ${created.summary.id}`,
    });
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
}

export function createCritiqueStore(cwd: string): CritiqueStore {
  return new CritiqueStore(cwd);
}
