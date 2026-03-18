import type {
  ManagerOverview,
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
    `Runtime kind: ${summary.runtimeKind ?? "(none)"}`,
    `Tickets: ${state.linkedRefs.ticketIds.join(", ") || "none"}`,
    `Workspace: ${state.workspace.strategy} ${state.workspace.branch} @ ${state.workspace.baseRef}`,
    `Telemetry: ${state.latestTelemetry.state}${state.latestTelemetry.summary ? ` — ${state.latestTelemetry.summary}` : ""}`,
    `Last scheduler: ${state.lastSchedulerSummary || "(none)"}`,
    `Acknowledged inbox: ${summary.acknowledgedInboxCount}`,
    `Inbox backlog: ${summary.unresolvedInboxCount}`,
    `Manager backlog: ${summary.pendingManagerActionCount}`,
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
  return workers
    .map(
      (worker) =>
        `${worker.id} [${worker.status}/${worker.telemetryState}/${worker.runtimeKind ?? "none"}] ${worker.title} inbox=${worker.unresolvedInboxCount} manager=${worker.pendingManagerActionCount}`,
    )
    .join("\n");
}

export function renderWorkerDashboard(dashboard: WorkerDashboard): string {
  return [
    `${dashboard.worker.id} [${dashboard.worker.status}/${dashboard.worker.telemetryState}] ${dashboard.worker.title}`,
    `Worker ref: ${dashboard.workerRef}`,
    `Runtime kind: ${dashboard.worker.runtimeKind ?? "(none)"}`,
    `Latest telemetry: ${dashboard.latestTelemetry.state}${dashboard.latestTelemetry.summary ? ` — ${dashboard.latestTelemetry.summary}` : ""}`,
    `Last scheduler: ${dashboard.worker.lastSchedulerSummary || "(none)"}`,
    `Latest checkpoint: ${dashboard.latestCheckpoint?.summary ?? "(none)"}`,
    `Latest message: ${dashboard.latestMessage?.kind ?? "(none)"}`,
    `Counts: messages=${dashboard.counts.messages}, checkpoints=${dashboard.counts.checkpoints}, acknowledged=${dashboard.counts.acknowledgedInbox}, unresolved=${dashboard.counts.unresolvedMessages}, manager=${dashboard.counts.pendingManagerActions}`,
    renderList("Unresolved inbox", dashboard.unresolvedInbox.map(renderMessageSummary)),
    renderList("Pending manager actions", dashboard.pendingManagerActions.map(renderMessageSummary)),
    `Approval: ${dashboard.approval.status}`,
    `Consolidation: ${dashboard.consolidation.status}`,
    `Stale: ${dashboard.stale ? "yes" : "no"}`,
  ].join("\n");
}

export function renderWorkerPacket(result: WorkerReadResult): string {
  const { state, checkpoints, messages } = result;
  const latestCheckpoint = checkpoints.at(-1);
  const recentMessages = messages.slice(-5).map(renderMessageSummary);
  const unresolvedBacklog = messages.filter(
    (message) => message.awaiting === "worker" && message.status !== "resolved",
  );
  return [
    `Worker ${state.workerId}: ${state.title}`,
    `Status: ${state.status}`,
    `Objective: ${state.objective || "(none)"}`,
    `Runtime kind: ${state.lastRuntimeKind ?? "(none)"}`,
    `Last scheduler: ${state.lastSchedulerSummary || "(none)"}`,
    `Pending approval: ${state.approval.status}`,
    [
      "Run contract:",
      "1. Read unresolved inbox items before starting substantive work.",
      "2. Acknowledge, resolve, or escalate each actionable manager instruction durably.",
      "3. Record checkpoints that show both implementation progress and inbox-processing progress.",
      "4. Re-check inbox state before stopping.",
      "5. Stop only when the inbox is empty, you are blocked on manager input, you are requesting review/approval, or an explicit bounded policy budget has been reached.",
    ].join("\n"),
    `Manager: ${state.managerRef.kind}:${state.managerRef.ref}`,
    renderList("Tickets", state.linkedRefs.ticketIds),
    renderList("Plans", state.linkedRefs.planIds),
    renderList("Ralph runs", state.linkedRefs.ralphRunIds),
    `Workspace strategy: ${state.workspace.strategy}`,
    `Workspace branch/base: ${state.workspace.branch} / ${state.workspace.baseRef}`,
    renderList("Unresolved inbox", unresolvedBacklog.map(renderMessageSummary)),
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
    `Approval: ${state.approval.status}`,
    `Consolidation: ${state.consolidation.status}`,
  ].join("\n\n");
}

export function renderWorkerLaunchPrompt(result: WorkerReadResult): string {
  return [
    "Act as this Pi worker now. Process the worker inbox, execute the requested work, and leave durable state updates behind.",
    [
      "Before you stop:",
      "1. Read unresolved inbox items and handle the actionable manager instructions.",
      "2. Persist durable progress by acknowledging/resolving inbox items, recording a checkpoint, escalating blockers, or requesting completion/review.",
      "3. Do not treat a chat-only response as success; if you are blocked, record that durably and state what manager input is required.",
    ].join("\n"),
    "Worker state packet:",
    renderWorkerPacket(result),
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

export function renderManagerOverview(overview: ManagerOverview): string {
  return [
    `Workers: ${overview.workers.length}`,
    `Unresolved worker inbox: ${overview.unresolvedInboxWorkers.length}`,
    `Pending manager actions: ${overview.pendingManagerActionWorkers.length}`,
    `Pending approvals: ${overview.pendingApprovalWorkers.length}`,
    `Resume candidates: ${overview.resumeCandidates.length}`,
    renderList(
      "Resume candidate workers",
      overview.resumeCandidates.map(
        (worker) => `${worker.id} [${worker.status}/${worker.telemetryState}] inbox=${worker.unresolvedInboxCount}`,
      ),
    ),
  ].join("\n");
}
