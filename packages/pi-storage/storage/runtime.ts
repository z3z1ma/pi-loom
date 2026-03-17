import type { LoomRuntimeAttachment, LoomRuntimeStateStore } from "./contract.js";
import { SqliteLoomCatalog } from "./sqlite.js";

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
    updatedAt: now.toISOString(),
  };
}

export class SqliteRuntimeAttachmentStore implements LoomRuntimeStateStore {
  constructor(private readonly catalog = new SqliteLoomCatalog()) {}

  async listRuntimeAttachments(worktreeId?: string): Promise<LoomRuntimeAttachment[]> {
    return this.catalog.listRuntimeAttachments(worktreeId);
  }

  async upsertRuntimeAttachment(record: LoomRuntimeAttachment): Promise<void> {
    await this.catalog.upsertRuntimeAttachment(record);
  }

  async removeRuntimeAttachment(id: string): Promise<void> {
    await this.catalog.removeRuntimeAttachment(id);
  }

  close(): void {
    this.catalog.close();
  }
}
