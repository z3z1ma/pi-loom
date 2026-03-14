export const TICKET_STATUSES = ["open", "ready", "in_progress", "blocked", "review", "closed"] as const;
export const MUTABLE_TICKET_STATUSES = ["open", "in_progress", "review", "closed"] as const;
export const TICKET_TYPES = ["task", "bug", "feature", "epic", "chore", "review", "security"] as const;
export const TICKET_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export const TICKET_RISKS = ["low", "medium", "high"] as const;
export const REVIEW_STATUSES = ["none", "requested", "changes_requested", "approved"] as const;
export const JOURNAL_KINDS = [
  "note",
  "decision",
  "progress",
  "verification",
  "checkpoint",
  "attachment",
  "state",
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type MutableTicketStatus = (typeof MUTABLE_TICKET_STATUSES)[number];
export type TicketType = (typeof TICKET_TYPES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export type TicketRisk = (typeof TICKET_RISKS)[number];
export type TicketReviewStatus = (typeof REVIEW_STATUSES)[number];
export type JournalKind = (typeof JOURNAL_KINDS)[number];

export interface TicketFrontmatter {
  id: string;
  title: string;
  status: MutableTicketStatus;
  priority: TicketPriority;
  type: TicketType;
  "created-at": string;
  "updated-at": string;
  tags: string[];
  deps: string[];
  links: string[];
  "initiative-ids": string[];
  "research-ids": string[];
  "spec-change": string | null;
  "spec-capabilities": string[];
  "spec-requirements": string[];
  parent: string | null;
  assignee: string | null;
  acceptance: string[];
  labels: string[];
  risk: TicketRisk;
  "review-status": TicketReviewStatus;
  "external-refs": string[];
}

export interface TicketBody {
  summary: string;
  context: string;
  plan: string;
  notes: string;
  verification: string;
  journalSummary: string;
}

export interface TicketRecord {
  frontmatter: TicketFrontmatter;
  body: TicketBody;
  closed: boolean;
  // Store read/list APIs expose repo-relative paths for durable portability.
  path: string;
}

export interface TicketSummary {
  id: string;
  title: string;
  status: TicketStatus;
  storedStatus: MutableTicketStatus;
  priority: TicketPriority;
  type: TicketType;
  createdAt: string;
  updatedAt: string;
  deps: string[];
  links: string[];
  initiativeIds: string[];
  researchIds: string[];
  specChange: string | null;
  specCapabilities: string[];
  specRequirements: string[];
  tags: string[];
  parent: string | null;
  closed: boolean;
  // Repo-relative from the workspace root when returned from store APIs.
  path: string;
}

export interface JournalEntry {
  id: string;
  ticketId: string;
  createdAt: string;
  kind: JournalKind;
  text: string;
  metadata: Record<string, unknown>;
}

export interface AttachmentRecord {
  id: string;
  ticketId: string;
  createdAt: string;
  label: string;
  mediaType: string;
  artifactPath: string | null;
  sourcePath: string | null;
  description: string;
  metadata: Record<string, unknown>;
}

export interface CheckpointFrontmatter {
  id: string;
  ticket: string;
  title: string;
  "created-at": string;
  supersedes: string | null;
}

export interface CheckpointRecord {
  id: string;
  ticketId: string;
  title: string;
  createdAt: string;
  body: string;
  // Repo-relative from the workspace root when returned from store APIs.
  path: string;
  supersedes: string | null;
}

export interface AuditRecord {
  id: string;
  createdAt: string;
  action: string;
  ticketId: string | null;
  payload: Record<string, unknown>;
}

export interface TicketReadResult {
  ticket: TicketRecord;
  summary: TicketSummary;
  journal: JournalEntry[];
  attachments: AttachmentRecord[];
  checkpoints: CheckpointRecord[];
  children: string[];
  blockers: string[];
}

export interface TicketGraphNode {
  id: string;
  status: TicketStatus;
  deps: string[];
  children: string[];
  links: string[];
  parent: string | null;
  blockedBy: string[];
  ready: boolean;
}

export interface TicketGraphResult {
  nodes: Record<string, TicketGraphNode>;
  ready: string[];
  blocked: string[];
  cycles: string[][];
}

export interface TicketListFilter {
  status?: TicketStatus;
  type?: TicketType;
  includeClosed?: boolean;
  tag?: string;
  text?: string;
}

export interface CreateTicketInput {
  title: string;
  summary?: string;
  context?: string;
  plan?: string;
  notes?: string;
  verification?: string;
  journalSummary?: string;
  priority?: TicketPriority;
  type?: TicketType;
  tags?: string[];
  deps?: string[];
  links?: string[];
  initiativeIds?: string[];
  researchIds?: string[];
  specChange?: string | null;
  specCapabilities?: string[];
  specRequirements?: string[];
  parent?: string | null;
  assignee?: string | null;
  acceptance?: string[];
  labels?: string[];
  risk?: TicketRisk;
  reviewStatus?: TicketReviewStatus;
  externalRefs?: string[];
}

export interface UpdateTicketInput {
  title?: string;
  priority?: TicketPriority;
  type?: TicketType;
  tags?: string[];
  deps?: string[];
  links?: string[];
  initiativeIds?: string[];
  researchIds?: string[];
  specChange?: string | null;
  specCapabilities?: string[];
  specRequirements?: string[];
  parent?: string | null;
  assignee?: string | null;
  acceptance?: string[];
  labels?: string[];
  risk?: TicketRisk;
  reviewStatus?: TicketReviewStatus;
  externalRefs?: string[];
  summary?: string;
  context?: string;
  plan?: string;
  notes?: string;
  verification?: string;
  journalSummary?: string;
  status?: Exclude<MutableTicketStatus, "closed">;
}

export interface AttachArtifactInput {
  label: string;
  description?: string;
  path?: string;
  content?: string;
  mediaType?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateCheckpointInput {
  title: string;
  body: string;
  supersedes?: string | null;
}

export interface TicketWriteResult {
  action: string;
  ticket: TicketReadResult;
}
