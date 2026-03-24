import { basename } from "node:path";
import { normalizeArtifactId, normalizeCheckpointId, normalizeTicketId } from "./normalize.js";

export function getTicketRef(ticketId: string): string {
  return `ticket:${normalizeTicketId(ticketId)}`;
}

export function getCheckpointRef(checkpointId: string): string {
  return `checkpoint:${normalizeCheckpointId(checkpointId)}`;
}

export function getArtifactRef(artifactId: string): string {
  return `artifact:${normalizeArtifactId(artifactId)}`;
}

export function getAttachmentSourceRef(ticketId: string, attachmentId: string, sourceName?: string): string {
  const canonicalTicketId = normalizeTicketId(ticketId);
  const canonicalAttachmentId = attachmentId.trim();
  if (!canonicalAttachmentId) {
    throw new Error("Attachment id is required");
  }
  const normalizedName = sourceName ? basename(sourceName.trim()) : "inline";
  const sourceToken = normalizedName || "inline";
  return `attachment-source:${canonicalTicketId}:${canonicalAttachmentId}:${sourceToken}`;
}
