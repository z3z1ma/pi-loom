import { relative } from "node:path";
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

export function summarizeWorker(worker: WorkerReadResult): WorkerSummary {
  return worker.summary;
}

export function buildWorkerDashboard(cwd: string, worker: WorkerReadResult): WorkerDashboard {
  const latestMessage = summarizeLatestMessage(worker.messages.at(-1) ?? null);
  const latestCheckpoint = summarizeLatestCheckpoint(worker.checkpoints.at(-1) ?? null);
  const latestHeartbeat = worker.state.latestTelemetry.heartbeatAt
    ? new Date(worker.state.latestTelemetry.heartbeatAt).getTime()
    : 0;
  const stale =
    latestHeartbeat > 0 ? Date.now() - latestHeartbeat > 1000 * 60 * 15 : worker.state.status !== "requested";
  return {
    worker: {
      ...worker.summary,
      path: relative(cwd, worker.artifacts.worker) || worker.artifacts.worker,
    },
    workerPath: relative(cwd, worker.artifacts.worker) || worker.artifacts.worker,
    launchPath: relative(cwd, worker.artifacts.launch) || worker.artifacts.launch,
    latestTelemetry: worker.state.latestTelemetry,
    latestCheckpoint,
    latestMessage,
    counts: {
      messages: worker.messages.length,
      checkpoints: worker.checkpoints.length,
      unresolvedMessages: worker.messages.filter((message) => message.status !== "resolved").length,
    },
    approval: worker.state.approval,
    consolidation: worker.state.consolidation,
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
