import { join, resolve } from "node:path";
import { normalizeTicketId } from "./normalize.js";

export interface LedgerPaths {
  rootDir: string;
  loomDir: string;
  ticketsDir: string;
  closedTicketsDir: string;
  auditDir: string;
  checkpointsDir: string;
  artifactsDir: string;
}

export function getLedgerPaths(cwd: string): LedgerPaths {
  const rootDir = resolve(cwd);
  const loomDir = join(rootDir, ".loom");
  const ticketsDir = join(loomDir, "tickets");
  return {
    rootDir,
    loomDir,
    ticketsDir,
    closedTicketsDir: join(ticketsDir, "closed"),
    auditDir: join(ticketsDir, ".audit"),
    checkpointsDir: join(loomDir, "checkpoints"),
    artifactsDir: join(loomDir, "artifacts"),
  };
}

export function getTicketPath(cwd: string, ticketId: string, closed: boolean): string {
  const id = normalizeTicketId(ticketId);
  const paths = getLedgerPaths(cwd);
  return join(closed ? paths.closedTicketsDir : paths.ticketsDir, `${id}.md`);
}

export function getJournalPath(cwd: string, ticketId: string): string {
  return join(getLedgerPaths(cwd).ticketsDir, `${normalizeTicketId(ticketId)}.journal.jsonl`);
}

export function getAttachmentsIndexPath(cwd: string, ticketId: string): string {
  return join(getLedgerPaths(cwd).ticketsDir, `${normalizeTicketId(ticketId)}.attachments.json`);
}

export function getCheckpointIndexPath(cwd: string, ticketId: string): string {
  return join(getLedgerPaths(cwd).ticketsDir, `${normalizeTicketId(ticketId)}.checkpoints.json`);
}

export function getAuditPath(cwd: string, date: string): string {
  return join(getLedgerPaths(cwd).auditDir, `audit-${date}.jsonl`);
}

export function getSnapshotPath(cwd: string, ticketId: string): string {
  return join(getLedgerPaths(cwd).ticketsDir, `${normalizeTicketId(ticketId)}.snapshot.md`);
}

export function getCheckpointPath(cwd: string, checkpointId: string): string {
  return join(getLedgerPaths(cwd).checkpointsDir, `${checkpointId}.md`);
}

export function getArtifactPath(cwd: string, artifactId: string, extension: string): string {
  return join(getLedgerPaths(cwd).artifactsDir, `${artifactId}${extension}`);
}
