import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { LoomRuntimeAttachment, LoomRuntimeStateStore } from "./contract.js";
import { getLoomCatalogPaths } from "./locations.js";

interface RuntimeAttachmentFile {
  attachments: LoomRuntimeAttachment[];
}

function defaultState(): RuntimeAttachmentFile {
  return { attachments: [] };
}

function writeFileAtomic(filePath: string, content: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tempPath, content, "utf-8");
  renameSync(tempPath, filePath);
}

export function getLocalRuntimeStorePath(): string {
  return path.join(getLoomCatalogPaths().rootDir, "runtime", "attachments.json");
}

export function isRuntimeLeaseActive(attachment: LoomRuntimeAttachment, now = new Date()): boolean {
  if (!attachment.leaseExpiresAt) {
    return false;
  }
  return new Date(attachment.leaseExpiresAt).getTime() > now.getTime();
}

export function renewRuntimeLease(
  attachment: LoomRuntimeAttachment,
  leaseDurationMs: number,
  now = new Date(),
): LoomRuntimeAttachment {
  const expiresAt = new Date(now.getTime() + leaseDurationMs).toISOString();
  return {
    ...attachment,
    leaseExpiresAt: expiresAt,
    metadata: {
      ...attachment.metadata,
      lastHeartbeatAt: now.toISOString(),
      leaseDurationMs,
    },
  };
}

export class LocalRuntimeAttachmentStore implements LoomRuntimeStateStore {
  readonly filePath: string;

  constructor(filePath = getLocalRuntimeStorePath()) {
    this.filePath = filePath;
  }

  private readState(): RuntimeAttachmentFile {
    if (!existsSync(this.filePath)) {
      return defaultState();
    }
    try {
      return JSON.parse(readFileSync(this.filePath, "utf-8")) as RuntimeAttachmentFile;
    } catch {
      return defaultState();
    }
  }

  private writeState(state: RuntimeAttachmentFile): void {
    writeFileAtomic(this.filePath, `${JSON.stringify(state, null, 2)}\n`);
  }

  async getRuntimeAttachments(worktreeId: string): Promise<LoomRuntimeAttachment[]> {
    return this.readState().attachments.filter((attachment) => attachment.worktreeId === worktreeId);
  }

  async putRuntimeAttachment(record: LoomRuntimeAttachment): Promise<void> {
    const state = this.readState();
    const next = state.attachments.filter((attachment) => attachment.id !== record.id);
    next.push(record);
    next.sort((left, right) => left.id.localeCompare(right.id));
    this.writeState({ attachments: next });
  }

  async removeRuntimeAttachment(id: string): Promise<void> {
    const state = this.readState();
    this.writeState({ attachments: state.attachments.filter((attachment) => attachment.id !== id) });
  }
}
