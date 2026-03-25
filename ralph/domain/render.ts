import { renderBulletList, renderSection, serializeMarkdownArtifact } from "./frontmatter.js";
import type {
  RalphIterationRecord,
  RalphIterationRuntimeRecord,
  RalphLaunchDescriptor,
  RalphOverview,
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

function renderScope(state: RalphRunState): string {
  return [
    `- mode: ${state.scope.mode}`,
    `- repository: ${state.scope.repositoryId ?? "(none)"}`,
    `- governing spec: ${state.scope.specChangeId ?? "(none)"}`,
    `- governing plan: ${state.scope.planId ?? "(none)"}`,
    `- active ticket: ${state.activeTicketId ?? state.scope.ticketId ?? "(none)"}`,
    `- roadmap items: ${state.scope.roadmapItemIds.join(", ") || "(none)"}`,
    `- initiatives: ${state.scope.initiativeIds.join(", ") || "(none)"}`,
    `- research: ${state.scope.researchIds.join(", ") || "(none)"}`,
    `- critiques: ${state.scope.critiqueIds.join(", ") || "(none)"}`,
    `- docs: ${state.scope.docIds.join(", ") || "(none)"}`,
  ].join("\n");
}

function renderPacketContext(state: RalphRunState): string {
  return [
    `- captured at: ${state.packetContext.capturedAt}`,
    `- constitution brief: ${state.packetContext.constitutionBrief || "(none)"}`,
    `- spec context: ${state.packetContext.specContext || "(none)"}`,
    `- plan context: ${state.packetContext.planContext ?? "(none)"}`,
    `- ticket context: ${state.packetContext.ticketContext ?? "(none)"}`,
    `- operator notes: ${state.packetContext.operatorNotes ?? "(none)"}`,
    "- prior iteration learnings:",
    ...renderBulletList(
      state.packetContext.priorIterationLearnings.length > 0 ? state.packetContext.priorIterationLearnings : ["(none)"],
    ).split("\n"),
    "- pending steering:",
    ...renderBulletList(
      state.steeringQueue.filter((entry) => entry.consumedAt === null).map((entry) => entry.text).length > 0
        ? state.steeringQueue.filter((entry) => entry.consumedAt === null).map((entry) => entry.text)
        : ["(none)"],
    ).split("\n"),
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
        `  ticket activity summary: ${iteration.workerSummary || "(none)"}`,
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
        `  repository: ${runtimeArtifact.runtimeScope?.repositoryId ?? "(none)"}`,
        `  worktree: ${runtimeArtifact.runtimeScope?.worktreeId ?? "(none)"}`,
        `  missing ticket activity: ${runtimeArtifact.missingTicketActivity ? "yes" : "no"}`,
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
    `- ticket activity summary: ${state.postIteration.workerSummary || "(none)"}`,
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
      renderSection("Authoritative Scope", renderScope(state)),
      renderSection("Packet Context", renderPacketContext(state)),
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
      renderSection(
        "Loop Control",
        [
          `- scheduler: ${state.scheduler.status}`,
          `- scheduler job: ${state.scheduler.jobId ?? "(none)"}`,
          `- scheduler note: ${state.scheduler.note ?? "(none)"}`,
          `- stop request: ${state.stopRequest ? `${state.stopRequest.summary} @ ${state.stopRequest.requestedAt}` : "(none)"}`,
        ].join("\n"),
      ),
      renderSection("Latest Bounded Iteration", renderPostIteration(state)),
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
    `Scope: ${result.state.scope.mode} / repo=${result.state.scope.repositoryId ?? "none"} / spec=${result.state.scope.specChangeId ?? "none"} / plan=${result.state.scope.planId ?? "none"} / ticket=${result.state.activeTicketId ?? result.state.scope.ticketId ?? "none"}`,
    `Waiting for: ${result.state.waitingFor}`,
    `Scheduler: ${result.state.scheduler.status}${result.state.scheduler.jobId ? ` (${result.state.scheduler.jobId})` : ""}`,
    `Plans: ${result.state.linkedRefs.planIds.join(", ") || "none"}`,
    `Tickets: ${result.state.linkedRefs.ticketIds.join(", ") || "none"}`,
    `Critiques: ${result.state.linkedRefs.critiqueIds.join(", ") || "none"}`,
    `Iterations: ${result.iterations.length}`,
    `Latest bounded iteration: ${result.state.postIteration ? `${result.state.postIteration.iteration} [${result.state.postIteration.status}]` : "none"}`,
    `Latest runtime: ${latestRuntime ? `${latestRuntime.iteration} [${latestRuntime.status}] / repo=${latestRuntime.runtimeScope?.repositoryId ?? "none"} / worktree=${latestRuntime.runtimeScope?.worktreeId ?? "none"}` : "none"}`,
    `Next launch prepared: ${result.state.nextLaunch.preparedAt ?? "no"}`,
    `Latest decision: ${result.state.latestDecision?.kind ?? "none"}`,
    `Stop reason: ${result.state.stopReason ?? "none"}`,
    "",
    "Objective:",
    result.state.objective || "(empty)",
  ].join("\n");
}

export function renderLaunchDescriptor(_cwd: string, launch: RalphLaunchDescriptor): string {
  const packetReadCall = `ralph_read ticketRef=${launch.ticketRef}${launch.planRef ? ` planRef=${launch.planRef}` : ""} mode=packet`;
  return [
    `Ralph single-iteration launch for ${launch.runId}`,
    `Prepared: ${launch.createdAt}`,
    `Iteration: ${launch.iteration} (${launch.iterationId})`,
    `Runtime: ${launch.runtime}`,
    `Mode: ${launch.resume ? "resume" : "fresh launch"}`,
    `Ticket ref: ${launch.ticketRef}`,
    `Plan ref: ${launch.planRef ?? "(none)"}`,
    `Packet ref: ${launch.packetRef}`,
    `Packet read call: ${packetReadCall}`,
    "",
    "Instructions:",
    ...launch.instructions.map((instruction) => `- ${instruction}`),
  ].join("\n");
}

export function renderLaunchPrompt(_cwd: string, launch: RalphLaunchDescriptor): string {
  const packetReadCall = `ralph_read ticketRef=${launch.ticketRef}${launch.planRef ? ` planRef=${launch.planRef}` : ""} mode=packet`;
  return [
    `Execute one bounded Ralph iteration for managed run ${launch.runId} using ${launch.packetRef}.`,
    "",
    "This is a fresh Ralph session-runtime worker. Do not continue the prior worker transcript.",
    `Iteration: ${launch.iteration} (${launch.iterationId})`,
    `Mode: ${launch.resume ? "resume" : "fresh launch"}`,
    `Ticket ref: ${launch.ticketRef}`,
    `Plan ref: ${launch.planRef ?? "(none)"}`,
    ...(launch.instructions.length > 0
      ? ["", "Launch-specific instructions:", ...launch.instructions.map((instruction) => `- ${instruction}`)]
      : []),
    "",
    "Before acting:",
    `- Call ${packetReadCall}.`,
    "- Use the exact ticketRef/planRef from this launch when reading Ralph packet state; do not derive alternate refs from the run id or packet ref.",
    "- Treat the governing plan, bound ticket, optional spec, steering, and constitutional context in the packet as canonical source material.",
    "- Work only one bounded iteration; do not silently self-loop.",
    "- Record durable progress through the bound ticket ledger: update ticket status, body, journal, checkpoints, or other ticket-backed evidence as needed.",
    "- Exit after the ticket reflects the truthful latest iteration state that the next caller can inspect.",
    "",
    "At minimum before finishing:",
    `- Leave durable ticket activity for iterationId=${launch.iterationId}; Ralph will reconcile the latest bounded iteration from the ticket after exit.`,
    "- If the run should continue, leave the next step explicit rather than claiming completion vaguely.",
    "- A clean session-runtime exit without durable bound-ticket activity is a failure.",
  ].join("\n");
}

export function renderOverview(overview: RalphOverview): string {
  return [
    renderRalphSummary(overview.run),
    `Waiting for: ${overview.waitingFor}`,
    `Iterations: ${overview.counts.iterations}`,
    `Latest bounded iteration: ${overview.latestBoundedIteration ? `${overview.latestBoundedIteration.iteration} [${overview.latestBoundedIteration.status}]` : "none"}`,
    `Latest runtime: ${overview.latestRuntime ? `${overview.latestRuntime.iteration} [${overview.latestRuntime.status}]` : "none"}`,
    `Latest decision: ${overview.latestDecision?.kind ?? "none"}`,
    `Verifier counts: ${Object.entries(overview.counts.verifierVerdicts)
      .map(([key, value]) => `${key}=${value}`)
      .join(", ")}`,
    `Iteration counts: ${Object.entries(overview.counts.byStatus)
      .map(([key, value]) => `${key}=${value}`)
      .join(", ")}`,
    "",
    "Critiques:",
    overview.critiqueLinks.length > 0
      ? overview.critiqueLinks
          .map((link) => `- ${link.critiqueId} [${link.verdict ?? "none"}] ${link.summary}`)
          .join("\n")
      : "(none)",
  ].join("\n");
}
