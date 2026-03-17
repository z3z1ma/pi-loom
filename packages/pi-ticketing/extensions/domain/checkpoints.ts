import type { CheckpointRecord } from "./models.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function withCheckpointPath(record: CheckpointRecord, path: string): CheckpointRecord {
  return {
    ...record,
    path,
  };
}

export function readCheckpointIdsFromRecord(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

export function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}
