import type {
  RalphIterationRecord,
  RalphIterationRuntimeRecord,
  RalphIterationStatus,
  RalphOverview,
  RalphRunState,
  RalphRunSummary,
  RalphVerifierVerdict,
} from "./models.js";

function toRalphRunRef(runId: string): string {
  return `ralph-run:${runId}`;
}

function toRalphPacketRef(runId: string): string {
  return `ralph-run:${runId}:packet`;
}

export function toRalphDocumentRef(runId: string): string {
  return `ralph-run:${runId}:run`;
}

function toRalphLaunchRef(runId: string): string {
  return `ralph-run:${runId}:launch`;
}

function createCounts<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}

export function summarizeRalphRun(state: RalphRunState, _runDir: string): RalphRunSummary {
  return {
    id: state.runId,
    title: state.title,
    status: state.status,
    phase: state.phase,
    updatedAt: state.updatedAt,
    iterationCount: state.lastIterationNumber,
    policyMode: state.policySnapshot.mode,
    decision: state.latestDecision?.kind ?? null,
    waitingFor: state.waitingFor,
    objectiveSummary: state.summary || state.objective || `Ralph run ${state.runId}`,
    runRef: toRalphRunRef(state.runId),
  };
}

export function buildRalphOverview(
  state: RalphRunState,
  summary: RalphRunSummary,
  iterations: RalphIterationRecord[],
  _artifacts: unknown,
  iterationStatuses: readonly RalphIterationStatus[],
  verifierVerdicts: readonly RalphVerifierVerdict[],
  runtimeArtifacts: RalphIterationRuntimeRecord[] = [],
): RalphOverview {
  const byStatus = createCounts(iterationStatuses);
  const byVerifierVerdict = createCounts(verifierVerdicts);
  for (const iteration of iterations) {
    byStatus[iteration.status] += 1;
    byVerifierVerdict[iteration.verifier.verdict] += 1;
  }
  const latestIteration = iterations.at(-1) ?? null;
  const latestRuntime = runtimeArtifacts.at(-1) ?? null;

  return {
    run: summary,
    packetRef: toRalphPacketRef(state.runId),
    runRef: toRalphDocumentRef(state.runId),
    launchRef: toRalphLaunchRef(state.runId),
    latestBoundedIteration: latestIteration
      ? {
          id: latestIteration.id,
          iteration: latestIteration.iteration,
          status: latestIteration.status,
          summary: latestIteration.summary,
          completedAt: latestIteration.completedAt,
        }
      : null,
    latestRuntime: latestRuntime
      ? {
          id: latestRuntime.id,
          iterationId: latestRuntime.iterationId,
          iteration: latestRuntime.iteration,
          status: latestRuntime.status,
          repositoryId: latestRuntime.runtimeScope?.repositoryId ?? null,
          worktreeId: latestRuntime.runtimeScope?.worktreeId ?? null,
          updatedAt: latestRuntime.updatedAt,
          completedAt: latestRuntime.completedAt,
          exitCode: latestRuntime.exitCode,
          missingTicketActivity: latestRuntime.missingTicketActivity,
          jobId: latestRuntime.jobId,
        }
      : null,
    counts: {
      iterations: iterations.length,
      byStatus,
      verifierVerdicts: byVerifierVerdict,
    },
    critiqueLinks: state.critiqueLinks,
    latestDecision: state.latestDecision,
    waitingFor: state.waitingFor,
  };
}
