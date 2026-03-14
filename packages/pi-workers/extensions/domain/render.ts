import type { WorkerDashboard, WorkerReadResult, WorkerRuntimeDescriptor, WorkerSummary } from "./models.js";

function renderList(title: string, values: string[]): string {
  if (values.length === 0) {
    return `${title}: none`;
  }
  return `${title}:\n${values.map((value) => `- ${value}`).join("\n")}`;
}

export function renderWorkerDetail(result: WorkerReadResult): string {
  const { state, summary, dashboard } = result;
  return [
    `${summary.id} [${state.status}] ${state.title}`,
    `Objective: ${state.objective || "(none)"}`,
    `Manager: ${state.managerRef.kind}:${state.managerRef.ref}`,
    `Tickets: ${state.linkedRefs.ticketIds.join(", ") || "none"}`,
    `Workspace: ${state.workspace.strategy} ${state.workspace.branch} @ ${state.workspace.baseRef}`,
    `Telemetry: ${state.latestTelemetry.state}${state.latestTelemetry.summary ? ` — ${state.latestTelemetry.summary}` : ""}`,
    `Checkpoint: ${state.latestCheckpointSummary || "(none)"}`,
    `Approval: ${state.approval.status}`,
    `Consolidation: ${state.consolidation.status}`,
    `Stale: ${dashboard.stale ? "yes" : "no"}`,
  ].join("\n");
}

export function renderWorkerList(workers: WorkerSummary[]): string {
  if (workers.length === 0) {
    return "No workers.";
  }
  return workers.map((worker) => `${worker.id} [${worker.status}/${worker.telemetryState}] ${worker.title}`).join("\n");
}

export function renderWorkerDashboard(dashboard: WorkerDashboard): string {
  return [
    `${dashboard.worker.id} [${dashboard.worker.status}/${dashboard.worker.telemetryState}] ${dashboard.worker.title}`,
    `Path: ${dashboard.workerPath}`,
    `Latest telemetry: ${dashboard.latestTelemetry.state}${dashboard.latestTelemetry.summary ? ` — ${dashboard.latestTelemetry.summary}` : ""}`,
    `Latest checkpoint: ${dashboard.latestCheckpoint?.summary ?? "(none)"}`,
    `Latest message: ${dashboard.latestMessage?.kind ?? "(none)"}`,
    `Counts: messages=${dashboard.counts.messages}, checkpoints=${dashboard.counts.checkpoints}, unresolved=${dashboard.counts.unresolvedMessages}`,
    `Approval: ${dashboard.approval.status}`,
    `Consolidation: ${dashboard.consolidation.status}`,
    `Stale: ${dashboard.stale ? "yes" : "no"}`,
  ].join("\n");
}

export function renderWorkerPacket(result: WorkerReadResult): string {
  const { state, checkpoints, messages } = result;
  const latestCheckpoint = checkpoints.at(-1);
  const recentMessages = messages.slice(-5).map((message) => `${message.direction}/${message.kind}: ${message.text}`);
  return [
    `Worker ${state.workerId}: ${state.title}`,
    `Status: ${state.status}`,
    `Objective: ${state.objective || "(none)"}`,
    `Manager: ${state.managerRef.kind}:${state.managerRef.ref}`,
    renderList("Tickets", state.linkedRefs.ticketIds),
    renderList("Plans", state.linkedRefs.planIds),
    renderList("Ralph runs", state.linkedRefs.ralphRunIds),
    `Workspace strategy: ${state.workspace.strategy}`,
    `Workspace branch/base: ${state.workspace.branch} / ${state.workspace.baseRef}`,
    `Latest checkpoint: ${latestCheckpoint?.summary ?? "(none)"}`,
    latestCheckpoint
      ? [
          `Understanding: ${latestCheckpoint.understanding}`,
          renderList("Recent changes", latestCheckpoint.recentChanges),
          renderList("Validation", latestCheckpoint.validation),
          renderList("Blockers", latestCheckpoint.blockers),
          `Next action: ${latestCheckpoint.nextAction}`,
          `Manager input required: ${latestCheckpoint.managerInputRequired ? "yes" : "no"}`,
        ].join("\n")
      : "No checkpoints yet.",
    renderList("Recent messages", recentMessages),
    `Approval: ${state.approval.status}`,
    `Consolidation: ${state.consolidation.status}`,
  ].join("\n\n");
}

export function renderLaunchDescriptor(launch: WorkerRuntimeDescriptor): string {
  return [
    `Worker ${launch.workerId} launch`,
    `Runtime: ${launch.runtime}`,
    `Workspace path: ${launch.workspacePath}`,
    `Branch/base: ${launch.branch} / ${launch.baseRef}`,
    `Resume: ${launch.resume ? "yes" : "no"}`,
    `Status: ${launch.status}`,
    `Note: ${launch.note || "(none)"}`,
    `Command: ${launch.command.join(" ")}`,
  ].join("\n");
}
