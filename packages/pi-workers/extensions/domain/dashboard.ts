import type {
  WorkerCheckpointRecord,
  WorkerDashboard,
  WorkerMessageRecord,
  WorkerReadResult,
  WorkerSummary,
  WorkerTelemetryState,
} from "./models.js";

function summarizeLatestMessage(message: WorkerMessageRecord | null): WorkerMessageRecord | null {
  return message;
}

function summarizeLatestCheckpoint(checkpoint: WorkerCheckpointRecord | null): WorkerCheckpointRecord | null {
  return checkpoint;
}

function unresolvedInbox(messages: WorkerMessageRecord[]): WorkerMessageRecord[] {
  return messages.filter((message) => message.awaiting === "worker" && message.status !== "resolved");
}

function pendingManagerActions(messages: WorkerMessageRecord[]): WorkerMessageRecord[] {
  return messages.filter((message) => message.awaiting === "manager" && message.status !== "resolved");
}

function acknowledgedInbox(messages: WorkerMessageRecord[]): WorkerMessageRecord[] {
  return messages.filter((message) => message.awaiting === "worker" && message.status === "acknowledged");
}

export function summarizeWorker(worker: WorkerReadResult): WorkerSummary {
  return worker.summary;
}

export function buildWorkerDashboard(_cwd: string, worker: WorkerReadResult): WorkerDashboard {
  const latestMessage = summarizeLatestMessage(worker.messages.at(-1) ?? null);
  const latestCheckpoint = summarizeLatestCheckpoint(worker.checkpoints.at(-1) ?? null);
  const acknowledgedBacklog = acknowledgedInbox(worker.messages);
  const inboxBacklog = unresolvedInbox(worker.messages);
  const managerBacklog = pendingManagerActions(worker.messages);
  const latestHeartbeat = worker.state.latestTelemetry.heartbeatAt
    ? new Date(worker.state.latestTelemetry.heartbeatAt).getTime()
    : 0;
  const stale =
    latestHeartbeat > 0 ? Date.now() - latestHeartbeat > 1000 * 60 * 15 : worker.state.status !== "requested";
  return {
    worker: {
      ...worker.summary,
      acknowledgedInboxCount: acknowledgedBacklog.length,
      unresolvedInboxCount: inboxBacklog.length,
      pendingManagerActionCount: managerBacklog.length,
      workerRef: worker.artifacts.dir,
    },
    workerRef: worker.artifacts.dir,
    launchRef: worker.artifacts.launch,
    latestTelemetry: worker.state.latestTelemetry,
    latestCheckpoint,
    latestMessage,
    unresolvedInbox: inboxBacklog,
    pendingManagerActions: managerBacklog,
    counts: {
      messages: worker.messages.length,
      checkpoints: worker.checkpoints.length,
      acknowledgedInbox: acknowledgedBacklog.length,
      unresolvedMessages: inboxBacklog.length,
      pendingManagerActions: managerBacklog.length,
    },
    stale,
  };
}

export function filterWorkersByText<
  T extends { title: string; objectiveSummary?: string; latestCheckpointSummary?: string },
>(workers: T[], text: string | undefined): T[] {
  if (!text?.trim()) {
    return workers;
  }
  const lowered = text.trim().toLowerCase();
  return workers.filter((worker) =>
    [worker.title, worker.objectiveSummary ?? "", worker.latestCheckpointSummary ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(lowered),
  );
}

export function filterWorkersByTelemetry<T extends { telemetryState: WorkerTelemetryState }>(
  workers: T[],
  telemetryState: WorkerTelemetryState | undefined,
): T[] {
  if (!telemetryState) {
    return workers;
  }
  return workers.filter((worker) => worker.telemetryState === telemetryState);
}
