import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";
import { analyzeListQuery, renderAnalyzedListQuery } from "#storage/list-query.js";
import { LOOM_LIST_SORTS } from "#storage/list-search.js";
import { hasExportedProjectionFamily, runProjectionAwareOperation } from "#storage/projection-lifecycle.js";
import type { SpecPlanInput } from "../domain/models.js";
import { exportSpecProjections } from "../domain/projection.js";
import { renderCapabilityDetail, renderSpecDetail, renderSpecSummary } from "../domain/render.js";
import { createSpecStore } from "../domain/store.js";

const SpecStatusEnum = StringEnum([
  "proposed",
  "clarifying",
  "specified",
  "finalized",
  "archived",
  "superseded",
] as const);
const SpecWriteActionEnum = StringEnum([
  "init",
  "propose",
  "retitle",
  "clarify",
  "specify",
  "finalize",
  "archive",
  "delete",
] as const);
const SpecAnalyzeModeEnum = StringEnum(["analysis", "checklist", "both"] as const);
const LoomListSortEnum = StringEnum(LOOM_LIST_SORTS);

function withDescription<T extends Record<string, unknown>>(schema: T, description: string): T {
  return { ...schema, description } as T;
}

const SpecListParams = Type.Object({
  exactStatus: Type.Optional(
    withDescription(
      SpecStatusEnum,
      "Optional exact spec status filter. Leave it unset on the first pass unless you intentionally want one status slice.",
    ),
  ),
  includeArchived: Type.Optional(
    Type.Boolean({
      description:
        "Include archived specifications. Archived specifications are hidden unless this is true; capability summaries are still listed separately.",
    }),
  ),
  exactRepositoryId: Type.Optional(
    Type.String({
      description:
        "Optional exact repository id filter. Use a repository id from `scope_read` or prior machine-readable spec results when you intentionally want one repository slice.",
    }),
  ),
  text: Type.Optional(
    Type.String({
      description:
        "Broad text search across specifications. Leave `sort` unset to rank by relevance when text is present; capability summaries are returned separately.",
    }),
  ),
  sort: Type.Optional(
    withDescription(
      LoomListSortEnum,
      "Optional specification-list ordering override. Defaults to `relevance` when `text` is present, otherwise `updated_desc`. Set this only when you need recency, creation time, or id ordering instead of the default ranking. Capability summaries are still returned separately.",
    ),
  ),
});

const SpecReadParams = Type.Object({
  ref: Type.String({ description: "Specification id or canonical capability id." }),
  repositoryId: Type.Optional(
    Type.String({
      description: "Optional repository id for repository-targeted reads when the active scope is ambiguous.",
    }),
  ),
  worktreeId: Type.Optional(
    Type.String({
      description: "Optional worktree id for repository-targeted reads when a specific clone/worktree matters.",
    }),
  ),
  kind: Type.Optional(StringEnum(["change", "capability"] as const)),
});

const SpecPlanCapabilityParams = Type.Object({
  id: Type.Optional(Type.String()),
  title: Type.String(),
  summary: Type.Optional(Type.String()),
  requirements: Type.Optional(Type.Array(Type.String())),
  acceptance: Type.Optional(Type.Array(Type.String())),
  scenarios: Type.Optional(Type.Array(Type.String())),
});

const SpecWriteParams = Type.Object({
  action: SpecWriteActionEnum,
  repositoryId: Type.Optional(
    Type.String({
      description: "Optional repository id for repository-targeted writes when the active scope is ambiguous.",
    }),
  ),
  worktreeId: Type.Optional(
    Type.String({
      description: "Optional worktree id for repository-targeted writes when a specific clone/worktree matters.",
    }),
  ),
  ref: Type.Optional(Type.String()),
  title: Type.Optional(
    Type.String({
      description:
        "Specification title. Name the intended behavior or capability so the spec still makes sense in isolation, not an implementation-task verb; prefer `Dark theme support` over `Add dark mode`.",
    }),
  ),
  summary: Type.Optional(
    Type.String({
      description:
        "Behavior-first summary of the desired outcome, constraints, or scope. Keep it truthful to intended program behavior rather than a task list or migration sequence so the statement remains valid as implementation changes.",
    }),
  ),
  question: Type.Optional(Type.String()),
  answer: Type.Optional(Type.String()),
  designNotes: Type.Optional(
    Type.String({
      description:
        "Notes that clarify design intent, constraints, or tradeoffs without turning the spec itself into a rollout plan or execution log.",
    }),
  ),
  supersedes: Type.Optional(
    Type.Array(
      Type.String({
        description:
          "Earlier spec ids or refs that this mutable specification supersedes. This records lineage only; archived specs remain read-only history.",
      }),
    ),
  ),
  capabilities: Type.Optional(Type.Array(SpecPlanCapabilityParams)),
});

const SpecAnalyzeParams = Type.Object({
  ref: Type.String(),
  repositoryId: Type.Optional(
    Type.String({
      description: "Optional repository id for repository-targeted analysis when the active scope is ambiguous.",
    }),
  ),
  worktreeId: Type.Optional(
    Type.String({
      description: "Optional worktree id for repository-targeted analysis when a specific clone/worktree matters.",
    }),
  ),
  mode: Type.Optional(SpecAnalyzeModeEnum),
});

type SpecWriteParamsValue = Static<typeof SpecWriteParams>;

function getStore(ctx: ExtensionContext) {
  return createSpecStore(ctx.cwd);
}

function getScopedStore(ctx: ExtensionContext, scope?: { repositoryId?: string; worktreeId?: string }) {
  return createSpecStore(ctx.cwd, {
    repositoryId: scope?.repositoryId,
    worktreeId: scope?.worktreeId,
  });
}

function machineResult(details: Record<string, unknown>, text: string) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

async function refreshSpecProjectionsIfExported(cwd: string): Promise<void> {
  if (hasExportedProjectionFamily(cwd, "specs")) {
    await exportSpecProjections(cwd);
  }
}

function requireRef(ref: string | undefined): string {
  if (!ref) {
    throw new Error("Specification reference is required for this action");
  }
  return ref;
}

function toSpecifyInput(params: SpecWriteParamsValue): SpecPlanInput {
  if (!params.capabilities || params.capabilities.length === 0) {
    throw new Error("capabilities are required for specify");
  }
  return {
    designNotes: params.designNotes,
    supersedes: params.supersedes,
    capabilities: params.capabilities,
  };
}

export function registerSpecTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "spec_list",
    label: "spec_list",
    description:
      "List specifications plus the separate capability summary set from durable local spec memory. Leave `sort` unset for the default specification ordering: `updated_desc` without `text`, `relevance` with `text`. `exactStatus` and `includeArchived` narrow only the specification list.",
    promptSnippet:
      "Inspect relevant existing specifications before opening a new specification or downstream plan so the work can inherit existing behavioral intent instead of re-inventing it; broad text search with the default relevance ranking is the safest first pass when you are rediscovering prior spec work.",
    promptGuidelines: [
      "Use this tool before creating a new specification so you do not duplicate existing capability work or re-state behavior that is already specified.",
      "Start with `text` when rediscovering prior spec work by capability, title, or phrase; the default sort becomes `relevance` for text search, so leave `sort` unset unless you intentionally want a different ordering.",
      "Without `text`, the default sort is `updated_desc`; set `sort` only when you explicitly want created-time or id ordering instead of the normal recency view.",
      "`exactStatus` and `includeArchived` apply only to specifications. Capability summaries are still returned separately and are not filtered by those specification filters.",
      "`sort` applies only to the specification list. Capability summaries are still returned separately as an unranked companion set.",
      "Archived specifications are hidden by default; set `includeArchived` when checking whether older finalized or superseded specifications already cover the capability.",
      "If a zero-result query used exact filters, inspect the returned query diagnostics and broader suggestions before assuming no specification exists.",
    ],
    parameters: SpecListParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await analyzeListQuery(
        params,
        (next) =>
          getStore(ctx).listChanges({
            status: next.exactStatus,
            repositoryId: next.exactRepositoryId,
            includeArchived: next.includeArchived,
            text: next.text,
            sort: next.sort,
          }),
        {
          text: params.text,
          exactFilters: [
            {
              key: "exactRepositoryId",
              value: params.exactRepositoryId,
              clear: (current) => ({ ...current, exactRepositoryId: undefined }),
            },
            {
              key: "exactStatus",
              value: params.exactStatus,
              clear: (current) => ({ ...current, exactStatus: undefined }),
            },
          ],
        },
      );
      const capabilities = await getStore(ctx).listCapabilities();
      return machineResult(
        {
          changes: result.items,
          capabilities,
          queryDiagnostics: result.diagnostics,
          broaderMatches: result.broaderMatches,
        },
        [
          renderAnalyzedListQuery(result, {
            emptyText: "No specifications.",
            renderItem: renderSpecSummary,
          }),
          capabilities.length > 0
            ? `Capabilities: ${capabilities.map((capability) => capability.id).join(", ")}`
            : "Capabilities: none",
        ].join("\n"),
      );
    },
  });

  pi.registerTool({
    name: "spec_read",
    label: "spec_read",
    description: "Read a specification or canonical capability spec from durable local spec memory.",
    promptSnippet:
      "Load the current specification before planning work or implementation so intended behavior, rationale, and edge cases stay explicit.",
    promptGuidelines: [
      "Read the active or finalized specification before implementation when it is the durable source of intended behavior.",
      "Use the loaded specification to recover detailed requirements, rationale, dependencies, risks, edge cases, and acceptance instead of reconstructing them from memory or inferring them from current code.",
      "Read the spec as a standalone contract for what must be true, not as a patch note for how the current codebase should be edited.",
      "Treat plans as the implementation bridge and tickets as the execution ledger; the specification defines the behavior they must honor.",
    ],
    parameters: SpecReadParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (params.kind === "capability") {
        const capability = await getScopedStore(ctx, params).readCapability(params.ref);
        return machineResult({ capability }, renderCapabilityDetail(capability));
      }
      try {
        const change = await getScopedStore(ctx, params).readChange(params.ref);
        return machineResult({ change }, renderSpecDetail(change));
      } catch {
        const capability = await getScopedStore(ctx, params).readCapability(params.ref);
        return machineResult({ capability }, renderCapabilityDetail(capability));
      }
    },
  });

  pi.registerTool({
    name: "spec_write",
    label: "spec_write",
    description:
      "Create or update durable specification state in the local spec memory layer, keeping specifications declarative and implementation-decoupled while plans and tickets stay execution-aware.",
    promptSnippet:
      "Persist proposal, clarification, and specification detail durably so product intent remains explicit, behavior-first, reusable, and legible in isolation.",
    promptGuidelines: [
      "Use this tool to formalize product intent before implementation when the work exceeds a narrow localized fix.",
      "Write clarifications back into the specification so future turns and agents can rely on them.",
      "Capture enough bounded detail for the specification layer: problem framing, desired behavior, rationale, assumptions, constraints, dependencies, tradeoffs, scenarios, edge cases, acceptance, verification, provenance, and open questions where they still exist.",
      "A good specification stands on its own: someone reading only the spec should understand the capability, the conditions that must hold, and why the behavior matters.",
      "When proposing a specification, title it around the behavior or capability being specified rather than an implementation-task verb or migration delta.",
      "Reject titles or summaries that read like migration steps, code churn, or work-order commands instead of stable capability names and behavior contracts.",
      "Use `retitle` to fix mutable specs whose titles still read like implementation tasks before you finalize or archive them.",
      "Keep specifications declarative and implementation-decoupled; use `specify` to record capabilities and design notes, then create or update a plan when the specification is ready to drive implementation.",
      "`clarify`, `specify`, and other spec mutations are for mutable specs only. After `finalize`, the spec becomes read-only; after `archive`, it is terminal and remains available only for reading, lineage, and capability provenance.",
      "Use `delete` only to remove mutable specs that should not survive as durable history. Delete is blocked once a spec is finalized, archived, or still referenced by other durable records.",
      "Use `supersedes` to record lineage to earlier specs during specification. Do not treat archived specs as mutable successors or editable placeholders.",
    ],
    parameters: SpecWriteParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const store = getScopedStore(ctx, params);
      switch (params.action) {
        case "init": {
          const result = await store.initLedger();
          return machineResult(
            { action: params.action, initialized: result },
            `Initialized spec memory at ${result.root}`,
          );
        }
        case "propose": {
          if (!params.title?.trim()) throw new Error("title is required for propose");
          const title = params.title;
          const change = await runProjectionAwareOperation({
            repositoryRoot: ctx.cwd,
            operation: "spec_write propose",
            families: ["specs"],
            action: () => store.createChange({ title, summary: params.summary }),
            refresh: () => refreshSpecProjectionsIfExported(ctx.cwd),
          });
          return machineResult({ action: params.action, change }, renderSpecDetail(change));
        }
        case "retitle": {
          if (!params.title?.trim()) throw new Error("title is required for retitle");
          const title = params.title;
          const change = await runProjectionAwareOperation({
            repositoryRoot: ctx.cwd,
            operation: "spec_write retitle",
            families: ["specs"],
            action: () =>
              store.retitleChange(requireRef(params.ref), {
                title,
                proposalSummary: params.summary,
              }),
            refresh: () => refreshSpecProjectionsIfExported(ctx.cwd),
          });
          return machineResult({ action: params.action, change }, renderSpecDetail(change));
        }
        case "clarify": {
          if (!params.question?.trim() || !params.answer?.trim()) {
            throw new Error("question and answer are required for clarify");
          }
          const question = params.question;
          const answer = params.answer;
          const change = await runProjectionAwareOperation({
            repositoryRoot: ctx.cwd,
            operation: "spec_write clarify",
            families: ["specs"],
            action: () => store.recordClarification(requireRef(params.ref), question, answer),
            refresh: () => refreshSpecProjectionsIfExported(ctx.cwd),
          });
          return machineResult({ action: params.action, change }, renderSpecDetail(change));
        }
        case "specify": {
          const change = await runProjectionAwareOperation({
            repositoryRoot: ctx.cwd,
            operation: "spec_write specify",
            families: ["specs"],
            action: () => store.updatePlan(requireRef(params.ref), toSpecifyInput(params)),
            refresh: () => refreshSpecProjectionsIfExported(ctx.cwd),
          });
          return machineResult({ action: params.action, change }, renderSpecDetail(change));
        }
        case "finalize": {
          const change = await runProjectionAwareOperation({
            repositoryRoot: ctx.cwd,
            operation: "spec_write finalize",
            families: ["specs"],
            action: () => store.finalizeChange(requireRef(params.ref)),
            refresh: () => refreshSpecProjectionsIfExported(ctx.cwd),
          });
          return machineResult({ action: params.action, change }, renderSpecDetail(change));
        }
        case "archive": {
          const change = await runProjectionAwareOperation({
            repositoryRoot: ctx.cwd,
            operation: "spec_write archive",
            families: ["specs"],
            action: () => store.archiveChange(requireRef(params.ref)),
            refresh: () => refreshSpecProjectionsIfExported(ctx.cwd),
          });
          return machineResult({ action: params.action, change }, renderSpecDetail(change));
        }
        case "delete": {
          const result = await runProjectionAwareOperation({
            repositoryRoot: ctx.cwd,
            operation: "spec_write delete",
            families: ["specs"],
            action: () => store.deleteChange(requireRef(params.ref)),
            refresh: () => refreshSpecProjectionsIfExported(ctx.cwd),
          });
          return machineResult({ action: params.action, result }, `Deleted specification ${result.deletedChangeId}.`);
        }
      }
    },
  });

  pi.registerTool({
    name: "spec_analyze",
    label: "spec_analyze",
    description: "Run specification-quality analysis or checklist generation over a specification.",
    promptSnippet:
      "Validate that the specification is clear, complete, behavior-first, and detailed enough to stand as the contract before turning it into plans and execution work.",
    promptGuidelines: [
      "Use this tool to validate the specification itself.",
      "Run analysis before finalizing and before handing the spec off to plans or other execution artifacts.",
      "Treat delta-style titles, task-list wording, or rollout-step framing as specification defects to fix before the spec becomes the contract for downstream work.",
      "Treat implementation-coupled wording, missing rationale, edge cases, dependencies, or verification detail as a spec-quality failure to fix before planning execution.",
      "Analysis and checklist generation mutate stored artifacts, so they are only valid while the spec is still mutable; rerun them before finalize, not after finalize or archive.",
    ],
    parameters: SpecAnalyzeParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const store = getScopedStore(ctx, params);
      if (params.mode === "checklist") {
        const change = await runProjectionAwareOperation({
          repositoryRoot: ctx.cwd,
          operation: "spec_analyze checklist",
          families: ["specs"],
          action: () => store.generateChecklist(params.ref),
          refresh: () => refreshSpecProjectionsIfExported(ctx.cwd),
        });
        return machineResult({ mode: params.mode, change }, renderSpecDetail(change));
      }
      if (params.mode === "both") {
        const change = await runProjectionAwareOperation({
          repositoryRoot: ctx.cwd,
          operation: "spec_analyze both",
          families: ["specs"],
          action: async () => {
            await store.analyzeChange(params.ref);
            return store.generateChecklist(params.ref);
          },
          refresh: () => refreshSpecProjectionsIfExported(ctx.cwd),
        });
        return machineResult({ mode: params.mode, change }, renderSpecDetail(change));
      }
      const change = await runProjectionAwareOperation({
        repositoryRoot: ctx.cwd,
        operation: "spec_analyze analysis",
        families: ["specs"],
        action: () => store.analyzeChange(params.ref),
        refresh: () => refreshSpecProjectionsIfExported(ctx.cwd),
      });
      return machineResult({ mode: params.mode ?? "analysis", change }, renderSpecDetail(change));
    },
  });
}
