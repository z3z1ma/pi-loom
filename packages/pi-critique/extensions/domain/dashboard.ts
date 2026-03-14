import type {
  CritiqueDashboard,
  CritiqueFindingRecord,
  CritiqueLaunchDescriptor,
  CritiqueRunRecord,
  CritiqueState,
  CritiqueSummary,
} from "./models.js";
import { isActiveFindingStatus } from "./normalize.js";

const CRITIQUES_ROOT_SEGMENT = "/.loom/critiques/";

function toRepoRelativeCritiquePath(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, "/");
  const critiquesRootIndex = normalizedPath.lastIndexOf(CRITIQUES_ROOT_SEGMENT);
  if (critiquesRootIndex >= 0) {
    return normalizedPath.slice(critiquesRootIndex + 1);
  }
  return normalizedPath.replace(/^\.\//, "");
}

export function summarizeCritique(state: CritiqueState, path: string): CritiqueSummary {
  return {
    id: state.critiqueId,
    title: state.title,
    status: state.status,
    verdict: state.currentVerdict,
    targetKind: state.target.kind,
    targetRef: state.target.ref,
    focusAreas: [...state.focusAreas],
    updatedAt: state.updatedAt,
    openFindingCount: state.openFindingIds.length,
    followupTicketCount: state.followupTicketIds.length,
    path: toRepoRelativeCritiquePath(path),
  };
}

export function buildCritiqueDashboard(
  state: CritiqueState,
  runs: CritiqueRunRecord[],
  findings: CritiqueFindingRecord[],
  critiquePath: string,
  packetPath: string,
  launchPath: string,
  launch: CritiqueLaunchDescriptor | null,
): CritiqueDashboard {
  const bySeverity: CritiqueDashboard["counts"]["bySeverity"] = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };
  const byStatus: CritiqueDashboard["counts"]["byStatus"] = {
    open: 0,
    accepted: 0,
    rejected: 0,
    fixed: 0,
    superseded: 0,
  };
  const byVerdict: CritiqueDashboard["counts"]["byVerdict"] = {
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

  const summary = summarizeCritique(state, critiquePath);
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
    packetPath: toRepoRelativeCritiquePath(packetPath),
    launchPath: toRepoRelativeCritiquePath(launchPath),
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
