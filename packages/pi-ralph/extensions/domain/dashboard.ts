import { dirname, isAbsolute, relative } from "node:path";
import type {
  RalphDashboard,
  RalphIterationRecord,
  RalphIterationStatus,
  RalphRunState,
  RalphRunSummary,
  RalphVerifierVerdict,
} from "./models.js";
import type { RalphArtifactPaths } from "./paths.js";

function toRepoRelativeArtifactPath(artifactsDir: string, filePath: string): string {
  if (!isAbsolute(filePath)) {
    return filePath;
  }
  const repoRoot = dirname(dirname(dirname(artifactsDir)));
  const relativePath = relative(repoRoot, filePath);
  return relativePath || filePath;
}

function createCounts<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}

export function summarizeRalphRun(state: RalphRunState, runDir: string): RalphRunSummary {
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
    path: toRepoRelativeArtifactPath(runDir, runDir),
  };
}

export function buildRalphDashboard(
  state: RalphRunState,
  summary: RalphRunSummary,
  iterations: RalphIterationRecord[],
  artifacts: RalphArtifactPaths,
  iterationStatuses: readonly RalphIterationStatus[],
  verifierVerdicts: readonly RalphVerifierVerdict[],
): RalphDashboard {
  const byStatus = createCounts(iterationStatuses);
  const byVerifierVerdict = createCounts(verifierVerdicts);
  for (const iteration of iterations) {
    byStatus[iteration.status] += 1;
    byVerifierVerdict[iteration.verifier.verdict] += 1;
  }
  const latestIteration = iterations.at(-1) ?? null;

  return {
    run: summary,
    packetPath: toRepoRelativeArtifactPath(artifacts.dir, artifacts.packet),
    runPath: toRepoRelativeArtifactPath(artifacts.dir, artifacts.run),
    launchPath: toRepoRelativeArtifactPath(artifacts.dir, artifacts.launch),
    latestIteration: latestIteration
      ? {
          id: latestIteration.id,
          iteration: latestIteration.iteration,
          status: latestIteration.status,
          summary: latestIteration.summary,
          completedAt: latestIteration.completedAt,
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
