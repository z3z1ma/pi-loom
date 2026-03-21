import { renderBulletList, renderSection, serializeMarkdownArtifact } from "./frontmatter.js";
import type {
  RalphDashboard,
  RalphIterationRecord,
  RalphIterationRuntimeRecord,
  RalphLaunchDescriptor,
  RalphReadResult,
  RalphRunState,
  RalphRunSummary,
} from "./models.js";

function joinNonEmpty(chunks: string[]): string {
  return chunks.filter(Boolean).join("\n\n");
}

function renderDecision(state: RalphRunState): string {
  if (!state.latestDecision) {
    return "(none)";
  }
  return [
    `- kind: ${state.latestDecision.kind}`,
    `- reason: ${state.latestDecision.reason}`,
    `- decided by: ${state.latestDecision.decidedBy}`,
    `- decided at: ${state.latestDecision.decidedAt}`,
    `- summary: ${state.latestDecision.summary || "(none)"}`,
    `- blocking refs: ${state.latestDecision.blockingRefs.join(", ") || "(none)"}`,
  ].join("\n");
}

function renderVerifier(state: RalphRunState): string {
  const verifier = state.verifierSummary;
  return [
    `- source: ${verifier.sourceKind}:${verifier.sourceRef}`,
    `- verdict: ${verifier.verdict}`,
    `- required: ${verifier.required ? "yes" : "no"}`,
    `- blocker: ${verifier.blocker ? "yes" : "no"}`,
    `- checked at: ${verifier.checkedAt ?? "(not checked)"}`,
    `- summary: ${verifier.summary || "(none)"}`,
    "- evidence:",
    ...renderBulletList(verifier.evidence).split("\n"),
  ].join("\n");
}

function renderCritiques(state: RalphRunState): string {
  if (state.critiqueLinks.length === 0) {
    return "(none)";
  }
  return state.critiqueLinks
    .map((link) =>
      [
        `- critique: ${link.critiqueId}`,
        `  kind: ${link.kind}`,
        `  verdict: ${link.verdict ?? "(none)"}`,
        `  required: ${link.required ? "yes" : "no"}`,
        `  blocking: ${link.blocking ? "yes" : "no"}`,
        `  reviewed at: ${link.reviewedAt ?? "(not reviewed)"}`,
        `  findings: ${link.findingIds.join(", ") || "(none)"}`,
        `  summary: ${link.summary || "(none)"}`,
      ].join("\n"),
    )
    .join("\n");
}

function renderLinkedRefs(state: RalphRunState): string {
  return [
    `- plans: ${state.linkedRefs.planIds.join(", ") || "(none)"}`,
    `- tickets: ${state.linkedRefs.ticketIds.join(", ") || "(none)"}`,
    `- critiques: ${state.linkedRefs.critiqueIds.join(", ") || "(none)"}`,
    `- specs: ${state.linkedRefs.specChangeIds.join(", ") || "(none)"}`,
    `- research: ${state.linkedRefs.researchIds.join(", ") || "(none)"}`,
    `- initiatives: ${state.linkedRefs.initiativeIds.join(", ") || "(none)"}`,
    `- roadmap items: ${state.linkedRefs.roadmapItemIds.join(", ") || "(none)"}`,
    `- docs: ${state.linkedRefs.docIds.join(", ") || "(none)"}`,
  ].join("\n");
}

function renderIterations(iterations: RalphIterationRecord[]): string {
  if (iterations.length === 0) {
    return "(none)";
  }
  return iterations
    .map((iteration) =>
      [
        `- ${iteration.id} / iteration ${iteration.iteration} [${iteration.status}]`,
        `  focus: ${iteration.focus || "(none)"}`,
        `  summary: ${iteration.summary || "(none)"}`,
        `  worker summary: ${iteration.workerSummary || "(none)"}`,
        `  verifier: ${iteration.verifier.verdict}`,
        `  critique links: ${iteration.critiqueLinks.map((link) => link.critiqueId).join(", ") || "(none)"}`,
        `  decision: ${iteration.decision?.kind ?? "(none)"}`,
      ].join("\n"),
    )
    .join("\n");
}

function renderRuntimeArtifacts(runtimeArtifacts: RalphIterationRuntimeRecord[]): string {
  if (runtimeArtifacts.length === 0) {
    return "(none)";
  }
  return runtimeArtifacts
    .map((runtimeArtifact) =>
      [
        `- ${runtimeArtifact.id} / iteration ${runtimeArtifact.iteration} [${runtimeArtifact.status}]`,
        `  job: ${runtimeArtifact.jobId ?? "(none)"}`,
        `  started: ${runtimeArtifact.startedAt}`,
        `  completed: ${runtimeArtifact.completedAt ?? "(not completed)"}`,
        `  exit code: ${runtimeArtifact.exitCode ?? "(none)"}`,
        `  missing checkpoint: ${runtimeArtifact.missingCheckpoint ? "yes" : "no"}`,
        `  command: ${runtimeArtifact.command || "(none)"}`,
        `  events: ${runtimeArtifact.events.length}`,
      ].join("\n"),
    )
    .join("\n");
}

function renderPostIteration(state: RalphRunState): string {
  if (!state.postIteration) {
    return "(none yet)";
  }
  return [
    `- iteration: ${state.postIteration.iteration} (${state.postIteration.iterationId}) [${state.postIteration.status}]`,
    `- completed at: ${state.postIteration.completedAt ?? "(not completed)"}`,
    `- focus: ${state.postIteration.focus || "(none)"}`,
    `- summary: ${state.postIteration.summary || "(none)"}`,
    `- worker summary: ${state.postIteration.workerSummary || "(none)"}`,
    `- verifier: ${state.postIteration.verifier.verdict}`,
    `- critique links: ${state.postIteration.critiqueLinks.map((link) => link.critiqueId).join(", ") || "(none)"}`,
    `- decision: ${state.postIteration.decision?.kind ?? "(none)"}`,
  ].join("\n");
}

function renderNextLaunch(state: RalphRunState): string {
  return [
    `- next iteration id: ${state.nextIterationId ?? "(none prepared)"}`,
    `- prepared at: ${state.nextLaunch.preparedAt ?? "(not prepared)"}`,
    `- mode: ${state.nextLaunch.resume ? "resume" : "fresh launch"}`,
    `- runtime: ${state.nextLaunch.runtime ?? "descriptor_only"}`,
    `- instructions: ${state.nextLaunch.instructions.join(" | ") || "(none)"}`,
  ].join("\n");
}

export function renderRalphSummary(summary: RalphRunSummary): string {
  return `${summary.id} [${summary.status}/${summary.phase}] ${summary.title}`;
}

export function renderRalphMarkdown(
  state: RalphRunState,
  iterations: RalphIterationRecord[],
  runtimeArtifacts: RalphIterationRuntimeRecord[],
): string {
  return serializeMarkdownArtifact(
    {
      id: state.runId,
      title: state.title,
      status: state.status,
      phase: state.phase,
      "updated-at": state.updatedAt,
      waiting: state.waitingFor,
      decision: state.latestDecision?.kind ?? null,
      critiques: state.linkedRefs.critiqueIds,
      plans: state.linkedRefs.planIds,
      tickets: state.linkedRefs.ticketIds,
    },
    joinNonEmpty([
      renderSection("Objective", state.objective || "(empty)"),
      renderSection("Summary", state.summary || "(empty)"),
      renderSection("Linked Refs", renderLinkedRefs(state)),
      renderSection(
        "Policy Snapshot",
        [
          `- mode: ${state.policySnapshot.mode}`,
          `- max iterations: ${state.policySnapshot.maxIterations === null ? "(none)" : state.policySnapshot.maxIterations}`,
          `- max runtime minutes: ${state.policySnapshot.maxRuntimeMinutes === null ? "(none)" : state.policySnapshot.maxRuntimeMinutes}`,
          `- token budget: ${state.policySnapshot.tokenBudget === null ? "(none)" : state.policySnapshot.tokenBudget}`,
          `- verifier required: ${state.policySnapshot.verifierRequired ? "yes" : "no"}`,
          `- critique required: ${state.policySnapshot.critiqueRequired ? "yes" : "no"}`,
          `- stop when verified: ${state.policySnapshot.stopWhenVerified ? "yes" : "no"}`,
          `- manual approval required: ${state.policySnapshot.manualApprovalRequired ? "yes" : "no"}`,
          `- allow operator pause: ${state.policySnapshot.allowOperatorPause ? "yes" : "no"}`,
          `- notes: ${state.policySnapshot.notes.join(", ") || "(none)"}`,
        ].join("\n"),
      ),
      renderSection("Verifier Summary", renderVerifier(state)),
      renderSection("Critique Links", renderCritiques(state)),
      renderSection("Latest Decision", renderDecision(state)),
      renderSection("Post-Iteration Checkpoint", renderPostIteration(state)),
      renderSection("Next Launch State", renderNextLaunch(state)),
      renderSection("Runtime Artifacts", renderRuntimeArtifacts(runtimeArtifacts)),
      renderSection("Iteration Ledger", renderIterations(iterations)),
    ]),
  );
}

export function renderRalphDetail(result: RalphReadResult): string {
  const latestRuntime = result.runtimeArtifacts.at(-1) ?? null;
  return [
    renderRalphSummary(result.summary),
    `Waiting for: ${result.state.waitingFor}`,
    `Plans: ${result.state.linkedRefs.planIds.join(", ") || "none"}`,
    `Tickets: ${result.state.linkedRefs.ticketIds.join(", ") || "none"}`,
    `Critiques: ${result.state.linkedRefs.critiqueIds.join(", ") || "none"}`,
    `Iterations: ${result.iterations.length}`,
    `Post-iteration checkpoint: ${result.state.postIteration ? `${result.state.postIteration.iteration} [${result.state.postIteration.status}]` : "none"}`,
    `Latest runtime: ${latestRuntime ? `${latestRuntime.iteration} [${latestRuntime.status}]` : "none"}`,
    `Next launch prepared: ${result.state.nextLaunch.preparedAt ?? "no"}`,
    `Latest decision: ${result.state.latestDecision?.kind ?? "none"}`,
    `Stop reason: ${result.state.stopReason ?? "none"}`,
    "",
    "Objective:",
    result.state.objective || "(empty)",
  ].join("\n");
}

export function renderLaunchDescriptor(_cwd: string, launch: RalphLaunchDescriptor): string {
  return [
    `Ralph single-iteration launch for ${launch.runId}`,
    `Prepared: ${launch.createdAt}`,
    `Iteration: ${launch.iteration} (${launch.iterationId})`,
    `Runtime: ${launch.runtime}`,
    `Mode: ${launch.resume ? "resume" : "fresh launch"}`,
    `Packet ref: ${launch.packetRef}`,
    "",
    "Instructions:",
    ...launch.instructions.map((instruction) => `- ${instruction}`),
  ].join("\n");
}

export function renderLaunchPrompt(_cwd: string, launch: RalphLaunchDescriptor): string {
  return [
    `Execute one bounded Ralph iteration for run ${launch.runId} using ${launch.packetRef}.`,
    "",
    "This is a fresh Ralph session-runtime worker. Do not continue the prior worker transcript.",
    `Iteration: ${launch.iteration} (${launch.iterationId})`,
    `Mode: ${launch.resume ? "resume" : "fresh launch"}`,
    "",
    "Before acting:",
    `- Read ${launch.packetRef}.`,
    "- Treat plans, tickets, critique, and other Loom records as canonical source material.",
    "- Work only one bounded iteration; do not silently self-loop.",
    `- Persist status, verifier evidence, critique references, and the continuation decision through \`ralph_checkpoint\` using iterationId=${launch.iterationId}.`,
    "- Exit after writing the durable post-iteration state that the next caller will inspect.",
    "",
    "At minimum before finishing:",
    `- Call ralph_checkpoint ref=${launch.runId} iterationId=${launch.iterationId} once with the complete bounded-iteration outcome.`,
    "- If the run should continue, leave the next step explicit rather than claiming completion vaguely.",
    "- A clean session-runtime exit without durable post-iteration state is a failure.",
  ].join("\n");
}

export function renderDashboard(dashboard: RalphDashboard): string {
  return [
    renderRalphSummary(dashboard.run),
    `Waiting for: ${dashboard.waitingFor}`,
    `Iterations: ${dashboard.counts.iterations}`,
    `Post-iteration checkpoint: ${dashboard.latestIteration ? `${dashboard.latestIteration.iteration} [${dashboard.latestIteration.status}]` : "none"}`,
    `Latest runtime: ${dashboard.latestRuntime ? `${dashboard.latestRuntime.iteration} [${dashboard.latestRuntime.status}]` : "none"}`,
    `Latest decision: ${dashboard.latestDecision?.kind ?? "none"}`,
    `Verifier counts: ${Object.entries(dashboard.counts.verifierVerdicts)
      .map(([key, value]) => `${key}=${value}`)
      .join(", ")}`,
    `Iteration counts: ${Object.entries(dashboard.counts.byStatus)
      .map(([key, value]) => `${key}=${value}`)
      .join(", ")}`,
    "",
    "Critiques:",
    dashboard.critiqueLinks.length > 0
      ? dashboard.critiqueLinks
          .map((link) => `- ${link.critiqueId} [${link.verdict ?? "none"}] ${link.summary}`)
          .join("\n")
      : "(none)",
  ].join("\n");
}
