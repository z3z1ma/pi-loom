import type { LoomRepositoryQualifier } from "#storage/repository-qualifier.js";
import type {
  CritiqueOverview,
  CritiqueFindingRecord,
  CritiqueLaunchDescriptor,
  CritiqueRunRecord,
  CritiqueState,
  CritiqueSummary,
} from "./models.js";
import { isActiveFindingStatus } from "./normalize.js";

function toCritiqueRef(critiqueId: string): string {
  return `critique:${critiqueId}`;
}

function toCritiquePacketRef(critiqueId: string): string {
  return `critique:${critiqueId}:packet`;
}

function toCritiqueLaunchRef(critiqueId: string): string {
  return `critique:${critiqueId}:launch`;
}

export function summarizeCritique(
  state: CritiqueState,
  repository: LoomRepositoryQualifier | null = null,
): CritiqueSummary {
  return {
    id: state.critiqueId,
    title: state.title,
    status: state.status,
    verdict: state.currentVerdict,
    targetKind: state.target.kind,
    targetRef: state.target.ref,
    focusAreas: [...state.focusAreas],
    updatedAt: state.updatedAt,
    repository,
    openFindingCount: state.openFindingIds.length,
    followupTicketCount: state.followupTicketIds.length,
    critiqueRef: toCritiqueRef(state.critiqueId),
  };
}

export function buildCritiqueOverview(
  state: CritiqueState,
  runs: CritiqueRunRecord[],
  findings: CritiqueFindingRecord[],
  launch: CritiqueLaunchDescriptor | null,
  repository: LoomRepositoryQualifier | null = null,
): CritiqueOverview {
  const bySeverity: CritiqueOverview["counts"]["bySeverity"] = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };
  const byStatus: CritiqueOverview["counts"]["byStatus"] = {
    open: 0,
    accepted: 0,
    rejected: 0,
    fixed: 0,
    superseded: 0,
  };
  const byVerdict: CritiqueOverview["counts"]["byVerdict"] = {
    pass: 0,
    concerns: 0,
    blocked: 0,
    needs_revision: 0,
  };

  for (const run of runs) {
    byVerdict[run.verdict] += 1;
  }
  for (const finding of findings) {
    bySeverity[finding.severity] += 1;
    byStatus[finding.status] += 1;
  }

  const summary = summarizeCritique(state, repository);
  const openFindings = findings
    .filter((finding) => isActiveFindingStatus(finding.status))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((finding) => ({
      id: finding.id,
      kind: finding.kind,
      severity: finding.severity,
      confidence: finding.confidence,
      title: finding.title,
      status: finding.status,
      linkedTicketId: finding.linkedTicketId,
      updatedAt: finding.updatedAt,
    }));

  return {
    critique: summary,
    packetRef: toCritiquePacketRef(state.critiqueId),
    launchRef: toCritiqueLaunchRef(state.critiqueId),
    lastLaunchAt: launch?.createdAt ?? state.lastLaunchAt,
    counts: {
      runs: runs.length,
      findings: findings.length,
      openFindings: openFindings.length,
      acceptedFindings: findings.filter((finding) => finding.status === "accepted").length,
      followupTickets: state.followupTicketIds.length,
      bySeverity,
      byStatus,
      byVerdict,
    },
    latestRun: runs.at(-1) ?? null,
    openFindings,
    followupTicketIds: [...state.followupTicketIds],
  };
}
