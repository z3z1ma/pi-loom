import type {
  ManagerReadResult,
  ManagerSummary,
  WorkerDashboard,
  WorkerReadResult,
  WorkerRuntimeDescriptor,
  WorkerSummary,
} from "./models.js";

function renderList(title: string, values: string[]): string {
  if (values.length === 0) {
    return `${title}: none`;
  }
  return `${title}:\n${values.map((value) => `- ${value}`).join("\n")}`;
}

function renderMessageSummary(message: WorkerReadResult["messages"][number]): string {
  return `${message.id} ${message.direction}/${message.kind} [${message.status} -> ${message.awaiting}] ${message.text}`;
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
    `Acknowledged inbox: ${summary.acknowledgedInboxCount}`,
    `Inbox backlog: ${summary.unresolvedInboxCount}`,
    `Manager backlog: ${summary.pendingManagerActionCount}`,
    `Checkpoint: ${state.latestCheckpointSummary || "(none)"}`,
    `Stale: ${dashboard.stale ? "yes" : "no"}`,
  ].join("\n");
}

export function renderWorkerList(workers: WorkerSummary[]): string {
  if (workers.length === 0) {
    return "No workers.";
  }
  return workers
    .map(
      (worker) =>
        `${worker.id} [${worker.status}/${worker.telemetryState}] ${worker.title} inbox=${worker.unresolvedInboxCount} manager=${worker.pendingManagerActionCount}`,
    )
    .join("\n");
}

export function renderWorkerDashboard(dashboard: WorkerDashboard): string {
  return [
    `${dashboard.worker.id} [${dashboard.worker.status}/${dashboard.worker.telemetryState}] ${dashboard.worker.title}`,
    `Worker ref: ${dashboard.workerRef}`,
    `Latest telemetry: ${dashboard.latestTelemetry.state}${dashboard.latestTelemetry.summary ? ` — ${dashboard.latestTelemetry.summary}` : ""}`,
    `Latest checkpoint: ${dashboard.latestCheckpoint?.summary ?? "(none)"}`,
    `Latest message: ${dashboard.latestMessage?.kind ?? "(none)"}`,
    `Counts: messages=${dashboard.counts.messages}, checkpoints=${dashboard.counts.checkpoints}, acknowledged=${dashboard.counts.acknowledgedInbox}, unresolved=${dashboard.counts.unresolvedMessages}, manager=${dashboard.counts.pendingManagerActions}`,
    renderList("Unresolved inbox", dashboard.unresolvedInbox.map(renderMessageSummary)),
    renderList("Pending manager actions", dashboard.pendingManagerActions.map(renderMessageSummary)),
    `Stale: ${dashboard.stale ? "yes" : "no"}`,
  ].join("\n");
}

export function renderWorkerPacket(result: WorkerReadResult): string {
  const { state, checkpoints, messages } = result;
  const latestCheckpoint = checkpoints.at(-1);
  const recentMessages = messages.slice(-5).map(renderMessageSummary);
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
          renderList("Acknowledged messages", latestCheckpoint.acknowledgedMessageIds),
          renderList("Resolved messages", latestCheckpoint.resolvedMessageIds),
          `Remaining inbox count: ${latestCheckpoint.remainingInboxCount}`,
          `Manager input required: ${latestCheckpoint.managerInputRequired ? "yes" : "no"}`,
        ].join("\n")
      : "No checkpoints yet.",
    renderList("Recent messages", recentMessages),
  ].join("\n\n");
}

export function renderLaunchDescriptor(launch: WorkerRuntimeDescriptor): string {
  return [
    `Worker ${launch.workerId} launch`,
    `Runtime: ${launch.runtime}`,
    `Workspace path: ${launch.workspaceDir}`,
    `Branch/base: ${launch.branch} / ${launch.baseRef}`,
    `Resume: ${launch.resume ? "yes" : "no"}`,
    `Status: ${launch.status}`,
    `Note: ${launch.note || "(none)"}`,
    `Command: ${launch.command.join(" ")}`,
  ].join("\n");
}

export function renderManagerList(managers: ManagerSummary[]): string {
  if (managers.length === 0) {
    return "No managers.";
  }
  return managers
    .map(
      (manager) =>
        `${manager.id} [${manager.status}] ${manager.title} target=${manager.targetRef} workers=${manager.workerCount} pending=${manager.pendingMessages}`,
    )
    .join("\n");
}

export function renderManagerDetail(result: ManagerReadResult): string {
  const pending = result.messages.filter(
    (message) => message.direction === "manager_to_operator" && message.status !== "resolved",
  );
  const recent = result.messages
    .slice(-5)
    .map((message) => `${message.id} ${message.direction}/${message.kind} [${message.status}] ${message.text}`);
  return [
    `${result.summary.id} [${result.state.status}] ${result.state.title}`,
    `Objective: ${result.state.objective || "(none)"}`,
    `Target ref: ${result.state.targetRef}`,
    `Tickets: ${result.state.linkedRefs.ticketIds.join(", ") || "none"}`,
    renderList(
      "Workers",
      result.workers.map(
        (worker) => `${worker.id} [${worker.status}] branch=${worker.branch} ralph=${worker.ralphRunId ?? "none"}`,
      ),
    ),
    `Last run: ${result.state.lastRunAt ?? "(never)"}`,
    `Run count: ${result.state.runCount}`,
    `Latest summary: ${result.state.latestSummary || "(none)"}`,
    renderList(
      "Pending manager output",
      pending.map((message) => `${message.kind}${message.workerId ? ` ${message.workerId}` : ""}: ${message.text}`),
    ),
    renderList("Recent manager messages", recent),
  ].join("\n");
}
