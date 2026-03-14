import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";
import type { AttachmentRecord } from "./models.js";
import { getAttachmentsIndexPath } from "./paths.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function inferMediaType(filePath: string | undefined, explicit: string | undefined): string {
  if (explicit?.trim()) {
    return explicit.trim();
  }
  const extension = extname(filePath ?? "").toLowerCase();
  switch (extension) {
    case ".md":
    case ".txt":
      return "text/plain";
    case ".json":
      return "application/json";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}

export function readAttachments(cwd: string, ticketId: string): AttachmentRecord[] {
  const filePath = getAttachmentsIndexPath(cwd, ticketId);
  if (!existsSync(filePath)) {
    return [];
  }
  const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as unknown;
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed
    .filter(isRecord)
    .map((entry) => ({
      id: typeof entry.id === "string" ? entry.id : "",
      ticketId: typeof entry.ticketId === "string" ? entry.ticketId : ticketId,
      createdAt: typeof entry.createdAt === "string" ? entry.createdAt : new Date(0).toISOString(),
      label: typeof entry.label === "string" ? entry.label : "artifact",
      mediaType: typeof entry.mediaType === "string" ? entry.mediaType : "application/octet-stream",
      artifactPath: typeof entry.artifactPath === "string" ? entry.artifactPath : null,
      sourcePath: typeof entry.sourcePath === "string" ? entry.sourcePath : null,
      description: typeof entry.description === "string" ? entry.description : "",
      metadata: isRecord(entry.metadata) ? entry.metadata : {},
    }))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}
