import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";
import { analyzeListQuery, renderAnalyzedListQuery } from "#storage/list-query.js";
import { LOOM_LIST_SORTS, type LoomListSort } from "#storage/list-search.js";
import {
  readRuntimeScopeFromEnvForCwd,
  resolveEntityRuntimeScope,
  resolveRuntimeScopeCwd,
} from "#storage/runtime-scope.js";
import { renderDocumentationDetail, renderOverview, renderUpdatePrompt } from "../domain/render.js";
import { runDocsUpdate } from "../domain/runtime.js";
import { createDocumentationStore } from "../domain/store.js";

const DocStatusEnum = StringEnum(["active", "archived"] as const);
const DocTypeEnum = StringEnum(["overview", "guide", "concept", "operations", "workflow", "faq"] as const);
const DocSectionGroupEnum = StringEnum(["overviews", "guides", "concepts", "operations"] as const);
const DocAudienceEnum = StringEnum(["ai", "human"] as const);
const DocSourceTargetKindEnum = StringEnum(["initiative", "spec", "ticket", "critique", "workspace"] as const);
const DocsWriteActionEnum = StringEnum(["init", "create", "update", "archive"] as const);
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
  exactStatus: Type.Optional(withDescription(DocStatusEnum, "Optional exact status filter: active or archived.")),
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
        "Optional exact topic filter. Use this only when you already know the durable guide topic slug you want; guessed values can hide relevant documents.",
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
  audience: Type.Optional(Type.Array(DocAudienceEnum)),
  scopePaths: Type.Optional(Type.Array(Type.String())),
  contextRefs: Type.Optional(ContextRefsSchema),
  sourceTarget: Type.Optional(SourceTargetSchema),
  updateReason: Type.Optional(Type.String()),
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
  preferExternalRefNaming: Type.Optional(
    Type.Boolean({
      description:
        "When using a worktree, prefer the external ticket ref (e.g. linear-123) for the branch name if available.",
    }),
  ),
});

const DocsOverviewParams = Type.Object({
  ref: Type.String(),
});

type DocsWriteParamsValue = Static<typeof DocsWriteParams>;

function getStore(ctx: ExtensionContext) {
  const runtimeCwd = resolveRuntimeScopeCwd(ctx.cwd);
  return createDocumentationStore(runtimeCwd, readRuntimeScopeFromEnvForCwd(runtimeCwd));
}

function machineResult(details: Record<string, unknown>, text: string) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

function requireRef(ref: string | undefined): string {
  if (!ref) {
    throw new Error("Documentation reference is required for this action");
  }
  return ref;
}

function toCreateInput(params: DocsWriteParamsValue) {
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
    audience: params.audience,
    scopePaths: params.scopePaths,
    contextRefs: params.contextRefs,
    sourceTarget: params.sourceTarget,
    updateReason: params.updateReason,
    upstreamPath: params.upstreamPath,
    guideTopics: params.guideTopics,
    linkedOutputPaths: params.linkedOutputPaths,
    document: params.document,
  };
}

function toUpdateInput(params: DocsWriteParamsValue) {
  return {
    title: params.title,
    summary: params.summary,
    audience: params.audience,
    scopePaths: params.scopePaths,
    contextRefs: params.contextRefs,
    sourceTarget: params.sourceTarget,
    updateReason: params.updateReason,
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
      "List durable documentation records. Start broad with `text` when rediscovering a doc by title, topic, or source context; add exact filters such as `exactDocType`, `exactSectionGroup`, `exactSourceKind`, or `exactTopic` only when you intentionally want a narrower slice. Results default to `relevance` with `text`, otherwise `updated_desc`.",
    promptSnippet:
      "You **MUST** inspect existing documentation before creating new docs so durable explanations stay consolidated and non-duplicative.",
    promptGuidelines: [
      "Use this tool before creating a new documentation record so high-level topics stay consolidated in one durable, high-context document instead of fragmenting into shallow duplicates.",
      "When rediscovering a durable document, start with `text` and no exact filters; `exactStatus`, `exactDocType`, `exactSectionGroup`, `exactSourceKind`, and `exactTopic` narrow by exact stored values and can hide valid matches if guessed wrong.",
      "The default ordering is `relevance` when `text` is present and `updated_desc` otherwise; set `sort` only when you intentionally need chronology or id order after filtering.",
      "Add exact filters only after the broad search is still too wide or when you intentionally need one specific documentation slice.",
      "If a zero-result query used exact filters, inspect the returned query diagnostics and broader suggestions before assuming no documentation record exists.",
    ],
    parameters: DocsListParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await analyzeListQuery(
        params,
        (next) =>
          getStore(ctx).listDocs({
            status: next.exactStatus,
            docType: next.exactDocType,
            sectionGroup: next.exactSectionGroup,
            sourceKind: next.exactSourceKind,
            topic: next.exactTopic,
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

      return machineResult(
        { docs: result.items, queryDiagnostics: result.diagnostics, broaderMatches: result.broaderMatches },
        renderAnalyzedListQuery(result, {
          emptyText: "No documentation records.",
          renderItem: (doc) => `${doc.id} [${doc.status}/${doc.docType}] ${doc.title}`,
        }),
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
      "Read packet mode when you need the bounded maintenance handoff for a doc update, including the context that should survive into the next revision.",
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
        return machineResult({ state: result.state, summary: result.summary }, JSON.stringify(result.state, null, 2));
      }
      return machineResult({ documentation: result }, renderDocumentationDetail(result));
    },
  });

  pi.registerTool({
    name: "docs_write",
    label: "docs_write",
    description: "Create, update, or archive durable documentation records in local Loom memory.",
    promptSnippet:
      "You **MUST** persist high-level documentation state durably. Do not leave architecture or workflow explanations in chat. Ingest existing repository docs (READMEs, etc.) using `upstreamPath` to build a reasoned knowledge base.",
    promptGuidelines: [
      "Create the documentation record before repeated updates so revisions accumulate on a stable durable id instead of scattering explanation across ad hoc notes.",
      "Use update with document content after completed work changes system understanding; write self-contained, high-context explanation rather than API reference snippets or shallow summaries.",
      "Updating `contextRefs` replaces the stored ref buckets you send; pass the full desired bucket contents, and use empty arrays to clear incorrect refs.",
      "Archive records when they stop describing active system reality; archiving records a final lifecycle revision and archived docs should no longer be updated.",
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
          const documentation = await store.createDoc(toCreateInput(params));
          return machineResult({ action: params.action, documentation }, renderDocumentationDetail(documentation));
        }
        case "update": {
          const documentation = await store.updateDoc(requireRef(params.ref), toUpdateInput(params));
          return machineResult({ action: params.action, documentation }, renderDocumentationDetail(documentation));
        }
        case "archive": {
          const documentation = await store.archiveDoc(requireRef(params.ref));
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

  pi.registerTool({
    name: "docs_update",
    label: "docs_update",
    description:
      "Execute a fresh-process documentation maintenance pass and verify that a durable revision was persisted.",
    promptSnippet:
      "Run documentation maintenance in a separate fresh process after implementation is complete so the updater can write a high-context, bounded explanation instead of a saturated-session blurb.",
    promptGuidelines: [
      "Use this tool only after implementation reality is known and the surrounding understanding actually changed.",
      "The updater should enrich durable documentation with rationale, assumptions, scope boundaries, dependencies, risks, examples, and verification context where relevant instead of producing a thin recap.",
      "The fresh updater must persist its revision through docs_write; this tool should fail if no durable revision lands.",
    ],
    parameters: DocsUpdateParams,
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
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
      const previousRevisionId = prepared.state.lastRevisionId;
      const execution = await runDocsUpdate(
        ctx.cwd,
        renderUpdatePrompt(ctx.cwd, prepared.state),
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
        params.preferExternalRefNaming,
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

  pi.registerTool({
    name: "docs_overview",
    label: "docs_overview",
    description: "Read the machine-usable documentation overview rollup for observability and automation.",
    promptSnippet: "Use the overview when you need doc revision counts, topics, and linked outputs at a glance.",
    promptGuidelines: [
      "Prefer the overview for automation and triage; prefer docs_read when you need the full document or packet.",
    ],
    parameters: DocsOverviewParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const documentation = await getStore(ctx).readDoc(params.ref);
      return machineResult({ overview: documentation.overview }, renderOverview(documentation.overview));
    },
  });
}
