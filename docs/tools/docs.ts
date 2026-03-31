import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";
import type { CritiqueReadResult } from "#critique/domain/models.js";
import { createCritiqueStore } from "#critique/domain/store.js";
import { type AnalyzedListQuery, analyzeListQuery, renderAnalyzedListQuery } from "#storage/list-query.js";
import { LOOM_LIST_SORTS, type LoomListSort } from "#storage/list-search.js";
import { hasExportedProjectionFamily, runProjectionAwareOperation } from "#storage/projection-lifecycle.js";
import {
  readRuntimeScopeFromEnvForCwd,
  resolveEntityRuntimeScope,
  resolveRuntimeScopeCwd,
} from "#storage/runtime-scope.js";
import { isRuntimeToolDisabled } from "#storage/runtime-tools.js";
import type { CreateDocumentationInput, DocumentationSummary, UpdateDocumentationInput } from "../domain/models.js";
import {
  DOC_AUDIENCES,
  DOC_AUDIT_FINDING_SEVERITIES,
  DOC_SECTION_GROUPS,
  DOC_SOURCE_TARGET_KINDS,
  DOC_STATUSES,
  DOC_TOPIC_ROLES,
  DOC_TYPES,
} from "../domain/models.js";
import { exportDocumentationProjections } from "../domain/projection.js";
import {
  renderDocumentationAuditReport,
  renderDocumentationDetail,
  renderOverview,
  renderUpdatePrompt,
} from "../domain/render.js";
import { runDocsUpdate } from "../domain/runtime.js";
import { createDocumentationStore } from "../domain/store.js";

const DocStatusEnum = StringEnum(DOC_STATUSES);
const DocTypeEnum = StringEnum(DOC_TYPES);
const DocSectionGroupEnum = StringEnum(DOC_SECTION_GROUPS);
const DocAudienceEnum = StringEnum(DOC_AUDIENCES);
const DocSourceTargetKindEnum = StringEnum(DOC_SOURCE_TARGET_KINDS);
const DocTopicRoleEnum = StringEnum(DOC_TOPIC_ROLES);
const DocAuditFindingSeverityEnum = StringEnum(DOC_AUDIT_FINDING_SEVERITIES);
const DocsWriteActionEnum = StringEnum(["init", "create", "update", "archive", "supersede"] as const);
const DocsReadModeEnum = StringEnum(["full", "state", "packet", "document"] as const);
const LoomListSortEnum = StringEnum(LOOM_LIST_SORTS);

function withDescription<T extends Record<string, unknown>>(schema: T, description: string): T {
  return { ...schema, description } as T;
}

const ContextRefsSchema = Type.Object({
  roadmapItemIds: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "Replacement roadmap item refs. Omit `contextRefs` to keep current refs; provide an empty array to clear this bucket.",
    }),
  ),
  initiativeIds: Type.Optional(
    Type.Array(Type.String(), {
      description: "Replacement initiative refs. Provide the full desired set for this bucket.",
    }),
  ),
  researchIds: Type.Optional(
    Type.Array(Type.String(), {
      description: "Replacement research refs. Provide the full desired set for this bucket.",
    }),
  ),
  specChangeIds: Type.Optional(
    Type.Array(Type.String(), {
      description: "Replacement spec change refs. Provide the full desired set for this bucket.",
    }),
  ),
  ticketIds: Type.Optional(
    Type.Array(Type.String(), {
      description: "Replacement ticket refs. Provide the full desired set for this bucket.",
    }),
  ),
  critiqueIds: Type.Optional(
    Type.Array(Type.String(), {
      description: "Replacement critique refs. Provide the full desired set for this bucket.",
    }),
  ),
});

const SourceTargetSchema = Type.Object({
  kind: DocSourceTargetKindEnum,
  ref: Type.String(),
});

const DocsListParams = Type.Object({
  exactStatus: Type.Optional(
    withDescription(DocStatusEnum, "Optional exact status filter: active, superseded, or archived."),
  ),
  exactDocType: Type.Optional(
    withDescription(
      DocTypeEnum,
      "Optional exact documentation type filter. Leave it unset on the first pass unless you already know the durable doc classification.",
    ),
  ),
  exactSectionGroup: Type.Optional(
    withDescription(
      DocSectionGroupEnum,
      "Optional exact section-group filter for the rendered docs area (`overviews`, `guides`, `concepts`, or `operations`).",
    ),
  ),
  exactSourceKind: Type.Optional(
    withDescription(
      DocSourceTargetKindEnum,
      "Optional exact source target kind filter (`initiative`, `spec`, `ticket`, `critique`, or `workspace`). Leave it unset when you know the topic but not the upstream anchor kind.",
    ),
  ),
  exactTopic: Type.Optional(
    Type.String({
      description:
        "Optional exact topic filter. Matches the governed stable topic id when present and falls back to legacy guide topics for older records. Use this only when you already know the stored topic identifier.",
    }),
  ),
  includeSupporting: Type.Optional(
    Type.Boolean({
      description:
        "Include supporting companion docs in discovery results. Defaults to false so ordinary discovery stays curated around canonical topic owners and governance debt that still needs cleanup.",
    }),
  ),
  includeHistorical: Type.Optional(
    Type.Boolean({
      description:
        "Include superseded and archived history in discovery results. Defaults to false so historical material does not compete with current truth unless intentionally requested.",
    }),
  ),
  text: Type.Optional(
    Type.String({
      description:
        "Free-text search over documentation id, title, summary, source ref, and other indexed content. Prefer starting with text alone, then add exact filters only after the result set is still too broad.",
    }),
  ),
  sort: Type.Optional(
    withDescription(
      LoomListSortEnum,
      "Optional result ordering. Defaults to `relevance` when `text` is present, otherwise `updated_desc`. Override this only when you intentionally need chronological or id-based ordering after filtering.",
    ),
  ),
});

const DocsReadParams = Type.Object({
  ref: Type.String({
    description: "Documentation id or a state artifact path whose parent directory is the documentation id.",
  }),
  mode: Type.Optional(DocsReadModeEnum),
});

const DocsWriteParams = Type.Object({
  action: DocsWriteActionEnum,
  ref: Type.Optional(Type.String()),
  title: Type.Optional(Type.String()),
  docType: Type.Optional(DocTypeEnum),
  summary: Type.Optional(Type.String()),
  topicId: Type.Optional(Type.String()),
  topicRole: Type.Optional(DocTopicRoleEnum),
  audience: Type.Optional(Type.Array(DocAudienceEnum)),
  scopePaths: Type.Optional(Type.Array(Type.String())),
  contextRefs: Type.Optional(ContextRefsSchema),
  sourceTarget: Type.Optional(SourceTargetSchema),
  verifiedAt: Type.Optional(Type.String()),
  verificationSource: Type.Optional(Type.String()),
  updateReason: Type.Optional(Type.String()),
  successorDocId: Type.Optional(Type.String()),
  retirementReason: Type.Optional(Type.String()),
  guideTopics: Type.Optional(Type.Array(Type.String())),
  linkedOutputPaths: Type.Optional(Type.Array(Type.String())),
  upstreamPath: Type.Optional(
    Type.String({ description: "Path to an external source file (e.g. README.md) that this doc ingests." }),
  ),
  document: Type.Optional(Type.String()),
  changedSections: Type.Optional(Type.Array(Type.String())),
});

const DocsPacketParams = Type.Object({
  ref: Type.String(),
});

const DocsUpdateParams = Type.Object({
  ref: Type.String(),
  updateReason: Type.Optional(Type.String()),
  worktreeTicketRef: Type.Optional(
    Type.String({
      description: "Optional ticket ref to execute this update in an isolated worktree bound to that ticket.",
    }),
  ),
});

const DocsAuditParams = Type.Object({
  ref: Type.Optional(
    Type.String({
      description:
        "Optional documentation ref to audit one governed doc. Omit it to audit all active documentation records in the current scope.",
    }),
  ),
  persistCritique: Type.Optional(
    Type.Boolean({
      description:
        "When true, persist the audit as a new critique record with one run and durable findings instead of leaving the result only in transient tool output.",
    }),
  ),
  critiqueTitle: Type.Optional(
    Type.String({
      description:
        "Optional critique title to use when persistCritique=true. Omit it to use a timestamped documentation-governance audit title.",
    }),
  ),
  minimumSeverity: Type.Optional(
    withDescription(
      DocAuditFindingSeverityEnum,
      "Optional severity floor for returned findings. Omit it to include every audit finding class.",
    ),
  ),
});

const DocsOverviewParams = Type.Object({
  ref: Type.String(),
});

type DocsListParamsValue = Static<typeof DocsListParams>;
type DocsWriteParamsValue = Static<typeof DocsWriteParams>;

function getStore(ctx: ExtensionContext) {
  const runtimeCwd = resolveRuntimeScopeCwd(ctx.cwd);
  return createDocumentationStore(runtimeCwd, readRuntimeScopeFromEnvForCwd(runtimeCwd));
}

function getCritiqueStore(ctx: ExtensionContext) {
  const runtimeCwd = resolveRuntimeScopeCwd(ctx.cwd);
  return createCritiqueStore(runtimeCwd, readRuntimeScopeFromEnvForCwd(runtimeCwd));
}

function machineResult(details: Record<string, unknown>, text: string) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

function renderDocsListItem(doc: DocumentationSummary): string {
  return `${doc.topicId ?? "migration-debt"} :: ${doc.id} [${doc.status}/${doc.docType}/${doc.governance.publicationStatus}] ${doc.title} — owner=${doc.governance.currentOwnerDocId ?? "none"} action=${doc.governance.recommendedAction}`;
}

function topicGroupLabel(topicId: string | null): string {
  return topicId ? `Topic ${topicId}` : "Migration debt (missing topic ownership)";
}

function groupDocsByTopic(docs: DocumentationSummary[]): Array<{
  topicId: string | null;
  label: string;
  docs: DocumentationSummary[];
}> {
  const groups = new Map<string, { topicId: string | null; label: string; docs: DocumentationSummary[] }>();
  for (const doc of docs) {
    const key = doc.topicId ?? "migration-debt";
    const existing = groups.get(key);
    if (existing) {
      existing.docs.push(doc);
      continue;
    }
    groups.set(key, {
      topicId: doc.topicId,
      label: topicGroupLabel(doc.topicId),
      docs: [doc],
    });
  }
  return [...groups.values()];
}

function renderDocsTopicGroups(docs: DocumentationSummary[]): string {
  return groupDocsByTopic(docs)
    .map((group) => [`${group.label}:`, ...group.docs.map((doc) => `- ${renderDocsListItem(doc)}`)].join("\n"))
    .join("\n");
}

function renderDocsListQuery(result: AnalyzedListQuery<DocumentationSummary>): string {
  if (result.items.length > 0) {
    return renderDocsTopicGroups(result.items);
  }

  return renderAnalyzedListQuery(result, {
    emptyText: "No documentation records.",
    renderItem: renderDocsListItem,
  });
}

function renderSuppressedDocsListQuery(
  suppressedMatches: DocumentationSummary[],
  params: DocsListParamsValue,
  fallbackText: string,
): string {
  if (suppressedMatches.length === 0) {
    return fallbackText;
  }

  const needsSupporting =
    !params.includeSupporting &&
    suppressedMatches.some(
      (doc) =>
        doc.governance.publicationStatus === "current-companion" ||
        doc.governance.publicationStatus === "governed-without-owner",
    );
  const needsHistorical =
    !params.includeHistorical &&
    suppressedMatches.some(
      (doc) =>
        doc.governance.publicationStatus === "historical-superseded" ||
        doc.governance.publicationStatus === "historical-archived",
    );

  const rerunFlags = [
    needsSupporting ? "includeSupporting=true" : null,
    needsHistorical ? "includeHistorical=true" : null,
  ].filter((value): value is string => value !== null);

  return [
    fallbackText,
    "Hidden matches require intentional access:",
    renderDocsTopicGroups(suppressedMatches),
    rerunFlags.length > 0
      ? `Re-run with ${rerunFlags.join(" and ")} to include supporting and/or historical material.`
      : "Read the doc directly by ref if you intentionally need supporting or historical material.",
  ].join("\n");
}

const AUDIT_SEVERITY_RANK: Record<(typeof DOC_AUDIT_FINDING_SEVERITIES)[number], number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function filterAuditFindingsBySeverity<T extends { severity: (typeof DOC_AUDIT_FINDING_SEVERITIES)[number] }>(
  findings: T[],
  minimumSeverity: (typeof DOC_AUDIT_FINDING_SEVERITIES)[number] | undefined,
): T[] {
  if (!minimumSeverity) {
    return findings;
  }
  return findings.filter((finding) => AUDIT_SEVERITY_RANK[finding.severity] >= AUDIT_SEVERITY_RANK[minimumSeverity]);
}

function critiqueContextRefsFromDocsAudit(contextRefs: {
  roadmapItemIds: string[];
  initiativeIds: string[];
  researchIds: string[];
  specChangeIds: string[];
  ticketIds: string[];
}) {
  return {
    roadmapItemIds: contextRefs.roadmapItemIds,
    initiativeIds: contextRefs.initiativeIds,
    researchIds: contextRefs.researchIds,
    specChangeIds: contextRefs.specChangeIds,
    ticketIds: contextRefs.ticketIds,
  };
}

function defaultAuditCritiqueTitle(ref: string | undefined, generatedAt: string): string {
  return ref
    ? `Documentation governance audit for ${ref} at ${generatedAt}`
    : `Documentation governance audit at ${generatedAt}`;
}

async function refreshDocumentationProjectionsIfExported(cwd: string): Promise<void> {
  if (hasExportedProjectionFamily(cwd, "docs")) {
    await exportDocumentationProjections(cwd);
  }
}

function requireRef(ref: string | undefined): string {
  if (!ref) {
    throw new Error("Documentation reference is required for this action");
  }
  return ref;
}

function toCreateInput(params: DocsWriteParamsValue): CreateDocumentationInput {
  if (!params.title?.trim()) {
    throw new Error("title is required for create");
  }
  if (!params.docType) {
    throw new Error("docType is required for create");
  }
  if (!params.sourceTarget) {
    throw new Error("sourceTarget is required for create");
  }
  return {
    title: params.title,
    docType: params.docType,
    summary: params.summary,
    topicId: params.topicId,
    topicRole: params.topicRole,
    audience: params.audience,
    scopePaths: params.scopePaths,
    contextRefs: params.contextRefs,
    sourceTarget: params.sourceTarget,
    verifiedAt: params.verifiedAt,
    verificationSource: params.verificationSource,
    updateReason: params.updateReason,
    successorDocId: params.successorDocId,
    retirementReason: params.retirementReason,
    upstreamPath: params.upstreamPath,
    guideTopics: params.guideTopics,
    linkedOutputPaths: params.linkedOutputPaths,
    document: params.document,
  };
}

function toUpdateInput(params: DocsWriteParamsValue): UpdateDocumentationInput {
  return {
    title: params.title,
    summary: params.summary,
    topicId: params.topicId,
    topicRole: params.topicRole,
    audience: params.audience,
    scopePaths: params.scopePaths,
    contextRefs: params.contextRefs,
    sourceTarget: params.sourceTarget,
    verifiedAt: params.verifiedAt,
    verificationSource: params.verificationSource,
    updateReason: params.updateReason,
    successorDocId: params.successorDocId,
    retirementReason: params.retirementReason,
    upstreamPath: params.upstreamPath,
    guideTopics: params.guideTopics,
    linkedOutputPaths: params.linkedOutputPaths,
    document: params.document,
    changedSections: params.changedSections,
  };
}

export function registerDocsTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "docs_list",
    label: "docs_list",
    description:
      "List durable documentation records. Ordinary discovery defaults to active canonical published docs and governance debt that still needs cleanup; supporting and historical material require explicit access through filters. Start broad with `text`, then add exact filters only when you intentionally want a narrower slice. Results default to `relevance` with `text`, otherwise `updated_desc`.",
    promptSnippet:
      "You **MUST** inspect existing documentation before creating new docs so durable explanations stay consolidated and non-duplicative.",
    promptGuidelines: [
      "Use this tool before creating a new documentation record so high-level topics stay consolidated in one durable, high-context document instead of fragmenting into shallow duplicates.",
      "Ordinary discovery is curated toward current topic owners and active governance debt; use `includeSupporting` and `includeHistorical` only when you intentionally want companion docs or historical records to appear.",
      "Read the returned governance fields to see whether a doc is the current topic owner, a current companion, historical material, or legacy migration debt before deciding to create, update, supersede, or archive.",
      "When rediscovering a durable document, start with `text` and no exact filters; `exactStatus`, `exactDocType`, `exactSectionGroup`, `exactSourceKind`, and `exactTopic` narrow by exact stored values and can hide valid matches if guessed wrong.",
      "The default ordering is `relevance` when `text` is present and `updated_desc` otherwise; set `sort` only when you intentionally need chronology or id order after filtering.",
      "Add exact filters only after the broad search is still too wide or when you intentionally need one specific documentation slice.",
      "If a curated query returns nothing, inspect any hidden-match guidance before assuming the docs do not exist; the right answer may simply require opting into supporting or historical material.",
      "If a zero-result query used exact filters, inspect the returned query diagnostics and broader suggestions before assuming no documentation record exists.",
    ],
    parameters: DocsListParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const store = getStore(ctx);
      const result = await analyzeListQuery(
        params,
        (next) =>
          store.listDocs({
            status: next.exactStatus,
            docType: next.exactDocType,
            sectionGroup: next.exactSectionGroup,
            sourceKind: next.exactSourceKind,
            topic: next.exactTopic,
            includeSupporting: next.includeSupporting,
            includeHistorical: next.includeHistorical,
            text: next.text,
            sort: next.sort as LoomListSort | undefined,
          }),
        {
          text: params.text,
          exactFilters: [
            {
              key: "exactStatus",
              value: params.exactStatus,
              clear: (current) => ({ ...current, exactStatus: undefined }),
            },
            {
              key: "exactDocType",
              value: params.exactDocType,
              clear: (current) => ({ ...current, exactDocType: undefined }),
            },
            {
              key: "exactSectionGroup",
              value: params.exactSectionGroup,
              clear: (current) => ({ ...current, exactSectionGroup: undefined }),
            },
            {
              key: "exactSourceKind",
              value: params.exactSourceKind,
              clear: (current) => ({ ...current, exactSourceKind: undefined }),
            },
            {
              key: "exactTopic",
              value: params.exactTopic,
              clear: (current) => ({ ...current, exactTopic: undefined }),
            },
          ],
        },
      );

      const allMatches =
        !params.includeSupporting || !params.includeHistorical
          ? await store.listDocs({
              status: params.exactStatus,
              docType: params.exactDocType,
              sectionGroup: params.exactSectionGroup,
              sourceKind: params.exactSourceKind,
              topic: params.exactTopic,
              includeSupporting: true,
              includeHistorical: true,
              text: params.text,
              sort: params.sort as LoomListSort | undefined,
            })
          : [];
      const visibleDocIds = new Set(result.items.map((doc) => doc.id));
      const suppressedMatches = allMatches.filter((doc) => !visibleDocIds.has(doc.id));

      const text = renderSuppressedDocsListQuery(suppressedMatches, params, renderDocsListQuery(result));

      return machineResult(
        {
          docs: result.items,
          topicGroups: groupDocsByTopic(result.items),
          queryDiagnostics: result.diagnostics,
          broaderMatches: result.broaderMatches,
          suppressedMatches,
          suppressedTopicGroups: groupDocsByTopic(suppressedMatches),
        },
        text,
      );
    },
  });

  pi.registerTool({
    name: "docs_read",
    label: "docs_read",
    description: "Read documentation state, packet, or rendered high-level document from durable Loom docs memory.",
    promptSnippet:
      "Read the durable docs packet or document before rewriting system explanations from scratch so revisions inherit the existing context, rationale, and boundaries.",
    promptGuidelines: [
      "Read packet mode when you need the bounded maintenance handoff for a doc update, including topic-owner, lifecycle, successor, and recommended-action context that should survive into the next revision.",
      "Read document mode when you need the current high-level narrative, rationale, and examples, not just metadata.",
    ],
    parameters: DocsReadParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await getStore(ctx).readDoc(params.ref);
      if (params.mode === "packet") {
        return machineResult({ documentation: result.summary, packet: result.packet }, result.packet);
      }
      if (params.mode === "document") {
        return machineResult({ documentation: result.summary, document: result.document }, result.document);
      }
      if (params.mode === "state") {
        return machineResult(
          { state: result.state, summary: result.summary, governance: result.governance },
          JSON.stringify({ state: result.state, summary: result.summary, governance: result.governance }, null, 2),
        );
      }
      return machineResult({ documentation: result }, renderDocumentationDetail(result));
    },
  });

  pi.registerTool({
    name: "docs_write",
    label: "docs_write",
    description: "Directly create, update, supersede, or archive durable documentation records in local Loom memory.",
    promptSnippet:
      "Use this as the canonical documentation-mutation primitive when you already know what durable document state should be written. Do not leave architecture or workflow explanations in chat. Ingest existing repository docs (READMEs, etc.) using `upstreamPath` to build a reasoned knowledge base.",
    promptGuidelines: [
      "Use docs_write for direct, known, deterministic mutations: creating a doc, applying a specific content update, repairing metadata, refreshing verification fields, superseding an owner, or archiving a doc.",
      'If the job is instead "perform a bounded documentation-maintainer pass from compiled context", prefer docs_update; docs_update is orchestration built on top of this primitive.',
      "Create the documentation record before repeated updates so revisions accumulate on a stable durable id instead of scattering explanation across ad hoc notes.",
      "Use update with document content after completed work changes system understanding; write self-contained, high-context explanation rather than API reference snippets or shallow summaries.",
      "Use topicId plus topicRole to record governed ownership explicitly; missing topic ownership is legacy migration debt, not truth the caller should infer from titles or file paths.",
      "Before creating a new overview, inspect existing docs for the topic and prefer updating or superseding the current owner rather than publishing a parallel active owner surface.",
      "Updating `contextRefs` replaces the stored ref buckets you send; pass the full desired bucket contents, and use empty arrays to clear incorrect refs.",
      "Archive records when they stop describing active system reality; archiving records a final lifecycle revision and archived docs should no longer be updated.",
      "Use supersede when a historical doc now points at a successor or an explicit retirement rationale; superseded docs must record successorDocId or retirementReason truthfully.",
      "When ingesting an existing file (like a README), set `upstreamPath` to the relative repo path; the internal doc becomes the metadata/reasoning layer over that source.",
    ],
    parameters: DocsWriteParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const store = getStore(ctx);
      switch (params.action) {
        case "init": {
          const result = await store.initLedgerAsync();
          return machineResult(
            { action: params.action, initialized: result },
            `Initialized docs memory at ${result.root}`,
          );
        }
        case "create": {
          const documentation = await runProjectionAwareOperation({
            repositoryRoot: ctx.cwd,
            operation: "docs_write create",
            families: ["docs"],
            action: () => store.createDoc(toCreateInput(params)),
            refresh: () => refreshDocumentationProjectionsIfExported(ctx.cwd),
          });
          return machineResult({ action: params.action, documentation }, renderDocumentationDetail(documentation));
        }
        case "update": {
          const documentation = await runProjectionAwareOperation({
            repositoryRoot: ctx.cwd,
            operation: "docs_write update",
            families: ["docs"],
            action: () => store.updateDoc(requireRef(params.ref), toUpdateInput(params)),
            refresh: () => refreshDocumentationProjectionsIfExported(ctx.cwd),
          });
          return machineResult({ action: params.action, documentation }, renderDocumentationDetail(documentation));
        }
        case "archive": {
          const documentation = await runProjectionAwareOperation({
            repositoryRoot: ctx.cwd,
            operation: "docs_write archive",
            families: ["docs"],
            action: () => store.archiveDoc(requireRef(params.ref)),
            refresh: () => refreshDocumentationProjectionsIfExported(ctx.cwd),
          });
          return machineResult({ action: params.action, documentation }, renderDocumentationDetail(documentation));
        }
        case "supersede": {
          const documentation = await runProjectionAwareOperation({
            repositoryRoot: ctx.cwd,
            operation: "docs_write supersede",
            families: ["docs"],
            action: () => store.supersedeDoc(requireRef(params.ref), toUpdateInput(params)),
            refresh: () => refreshDocumentationProjectionsIfExported(ctx.cwd),
          });
          return machineResult({ action: params.action, documentation }, renderDocumentationDetail(documentation));
        }
      }
    },
  });

  pi.registerTool({
    name: "docs_packet",
    label: "docs_packet",
    description: "Read the bounded documentation-maintenance packet for a durable docs record.",
    promptSnippet:
      "Use the packet when a fresh documentation maintainer needs bounded context rather than raw chat history.",
    promptGuidelines: [
      "Prefer the packet when preparing a fresh session or subprocess to update documentation so the resulting revision stays grounded in accepted reality instead of inventing a thin rewrite.",
      "Use the packet's governance metadata, related docs, and recommended action to decide whether the truthful move is update, supersede, archive, or backfill metadata rather than creating a parallel surface.",
    ],
    parameters: DocsPacketParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const documentation = await getStore(ctx).readDoc(params.ref);
      return machineResult(
        { documentation: documentation.summary, packet: documentation.packet },
        documentation.packet,
      );
    },
  });

  if (!isRuntimeToolDisabled("docs_update")) {
    pi.registerTool({
      name: "docs_update",
      label: "docs_update",
      description:
        "Execute the managed fresh-context documentation-maintainer workflow and verify that it lands a durable docs_write revision.",
      promptSnippet:
        'Use this when the job is "run a bounded documentation-maintainer pass from compiled context", not when you already know the exact mutation to apply. It runs documentation maintenance in a separate fresh process so the maintainer can write a high-context bounded revision instead of a saturated-session blurb.',
      promptGuidelines: [
        "Prefer docs_update when you want Loom's managed path: compile the packet, launch a fresh maintainer, and require that the resulting pass persists through docs_write.",
        "Prefer docs_write instead for deterministic content edits, metadata repair, verification-only refreshes, or any direct mutation where the desired document state is already known.",
        "Use this tool only after implementation reality is known and the surrounding understanding actually changed.",
        "The updater should enrich durable documentation with rationale, assumptions, scope boundaries, dependencies, risks, examples, and verification context where relevant instead of producing a thin recap.",
        "The fresh updater must persist its revision through docs_write; this tool should fail if no durable revision lands.",
      ],
      parameters: DocsUpdateParams,
      async execute(_toolCallId, params, signal, onUpdate, ctx) {
        if (isRuntimeToolDisabled("docs_update")) {
          throw new Error(
            "docs_update is unavailable inside a docs_update-launched headless session; persist the revision through docs_write instead.",
          );
        }
        return runProjectionAwareOperation({
          repositoryRoot: ctx.cwd,
          operation: "docs_update",
          families: ["docs"],
          action: async () => {
            const ambientStore = getStore(ctx);
            const existing = await ambientStore.readDoc(params.ref);
            const runtimeScope = await resolveEntityRuntimeScope(ctx.cwd, "documentation", existing.state.docId);
            const store = createDocumentationStore(ctx.cwd, {
              repositoryId: runtimeScope.repositoryId,
              worktreeId: runtimeScope.worktreeId,
            });
            const prepared = params.updateReason
              ? await store.updateDoc(existing.state.docId, { updateReason: params.updateReason })
              : existing;
            if (params.updateReason) {
              await refreshDocumentationProjectionsIfExported(ctx.cwd);
            }
            const previousRevisionId = prepared.state.lastRevisionId;
            const execution = await runDocsUpdate(
              ctx.cwd,
              renderUpdatePrompt(ctx.cwd, prepared),
              signal,
              (text) => {
                onUpdate?.({
                  content: [{ type: "text", text }],
                  details: {
                    documentation: prepared.summary,
                    execution: { status: "running" },
                  },
                });
              },
              runtimeScope,
              params.worktreeTicketRef,
            );
            const refreshed = await store.readDoc(existing.state.docId);
            if (execution.exitCode !== 0) {
              throw new Error(
                [
                  `Documentation update process failed with exit code ${execution.exitCode}.`,
                  execution.stderr.trim() || execution.output.trim() || prepared.packet,
                ]
                  .filter(Boolean)
                  .join("\n\n"),
              );
            }
            if (refreshed.state.lastRevisionId === previousRevisionId) {
              throw new Error(
                execution.output.trim() ||
                  "Fresh documentation updater completed without persisting a revision through docs_write.",
              );
            }
            return machineResult(
              {
                documentation: refreshed,
                execution,
                previousRevisionId,
              },
              execution.output || renderDocumentationDetail(refreshed),
            );
          },
        });
      },
    });
  }

  pi.registerTool({
    name: "docs_audit",
    label: "docs_audit",
    description:
      "Run the governed documentation audit and optionally persist the result as a critique-backed review handoff with durable stale, overlapping, orphaned, and unverified findings.",
    promptSnippet:
      "Use the docs audit before declaring the documentation surface trustworthy; it should classify concrete stale, overlapping, orphaned, and unverified problems and can persist them into critique instead of leaving review debt in chat.",
    promptGuidelines: [
      "Audit the current docs surface after related tickets, specs, critiques, or upstream files change so stale explanatory truth becomes explicit review work instead of hidden drift.",
      "Persist the audit into critique when the findings should survive beyond this turn or when follow-up tickets may be needed; critique findings can later be ticketified without retyping the evidence.",
      "Treat missing topic ownership, broken source/context links, duplicate active topic docs, and missing verification evidence as governance debt, not as details to infer away heuristically.",
    ],
    parameters: DocsAuditParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const store = getStore(ctx);
      const report = await store.auditGovernance(params.ref);
      const findings = filterAuditFindingsBySeverity(report.findings, params.minimumSeverity);
      const byKind = {
        stale: 0,
        overlapping: 0,
        orphaned: 0,
        unverified: 0,
      };
      const bySeverity = {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
      };
      for (const finding of findings) {
        byKind[finding.kind] += 1;
        bySeverity[finding.severity] += 1;
      }
      const filteredReport = {
        ...report,
        findings,
        counts: {
          ...report.counts,
          findings: findings.length,
          byKind,
          bySeverity,
        },
      };

      let critique: CritiqueReadResult | undefined;
      if (params.persistCritique) {
        const critiqueStore = getCritiqueStore(ctx);
        critique = await critiqueStore.createCritiqueAsync({
          title: params.critiqueTitle?.trim() || defaultAuditCritiqueTitle(params.ref, filteredReport.generatedAt),
          target: {
            kind: "workspace",
            ref: "repo",
            locator: filteredReport.subjects.length === 1 ? `documentation:${filteredReport.subjects[0]?.id}` : "docs",
          },
          focusAreas: ["docs", "maintainability"],
          reviewQuestion:
            "Does the current governed documentation surface remain current, uniquely owned, and durably verified after recent changes?",
          scopeRefs: [
            "docs",
            ...filteredReport.scopePaths.map((entry) => entry.displayPath),
            ...filteredReport.subjects.map((subject) => `documentation:${subject.id}`),
          ],
          nonGoals: [
            "Do not rewrite documentation content directly from the audit handoff.",
            "Do not infer ownership from filenames or titles when governance metadata is missing.",
          ],
          contextRefs: critiqueContextRefsFromDocsAudit(filteredReport.contextRefs),
          freshContextRequired: true,
        });

        const verdict =
          filteredReport.findings.length === 0
            ? "pass"
            : filteredReport.findings.some(
                  (finding) => AUDIT_SEVERITY_RANK[finding.severity] >= AUDIT_SEVERITY_RANK.high,
                )
              ? "needs_revision"
              : "concerns";
        critique = await critiqueStore.recordRunAsync(critique.state.critiqueId, {
          kind: "docs",
          summary:
            filteredReport.findings.length === 0
              ? "The governed documentation audit found no stale, overlapping, orphaned, or unverified findings in scope."
              : `The governed documentation audit found ${filteredReport.findings.length} actionable documentation governance finding(s).`,
          verdict,
          freshContext: true,
          focusAreas: ["docs", "maintainability"],
          findingIds: [],
          followupTicketIds: [],
        });
        const runId = critique.runs.at(-1)?.id;
        if (!runId) {
          throw new Error("Documentation audit critique did not persist a run.");
        }
        for (const finding of filteredReport.findings) {
          critique = await critiqueStore.addFindingAsync(critique.state.critiqueId, {
            runId,
            kind: "docs_gap",
            severity: finding.severity,
            confidence: "high",
            title: finding.title,
            summary: finding.summary,
            evidence: finding.evidence,
            scopeRefs: finding.scopeRefs,
            recommendedAction: finding.recommendedAction,
          });
        }
      }

      const rendered = renderDocumentationAuditReport(filteredReport);
      return machineResult(
        { audit: filteredReport, critique },
        critique ? `${rendered}\n\nCritique handoff: ${critique.summary.id}` : rendered,
      );
    },
  });

  pi.registerTool({
    name: "docs_overview",
    label: "docs_overview",
    description: "Read the machine-usable documentation overview rollup for observability and automation.",
    promptSnippet: "Use the overview when you need doc revision counts, topics, and linked outputs at a glance.",
    promptGuidelines: [
      "Prefer the overview for automation and triage; prefer docs_read when you need the full document or packet.",
      "Use the overview governance block to tell whether the doc is current truth, historical material, legacy migration debt, or part of an owner overlap.",
    ],
    parameters: DocsOverviewParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const documentation = await getStore(ctx).readDoc(params.ref);
      return machineResult({ overview: documentation.overview }, renderOverview(documentation.overview));
    },
  });
}
