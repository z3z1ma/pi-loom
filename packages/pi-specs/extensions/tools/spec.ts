import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";
import type { SpecPlanInput, SpecTasksInput } from "../domain/models.js";
import { renderCapabilityDetail, renderSpecDetail, renderSpecSummary } from "../domain/render.js";
import { createSpecStore } from "../domain/store.js";
import { ensureSpecTickets } from "../domain/ticket-sync.js";

const SpecStatusEnum = StringEnum([
  "proposed",
  "clarifying",
  "planned",
  "tasked",
  "finalized",
  "archived",
  "superseded",
] as const);
const SpecWriteActionEnum = StringEnum(["init", "propose", "clarify", "plan", "tasks", "finalize", "archive"] as const);
const SpecAnalyzeModeEnum = StringEnum(["analysis", "checklist", "both"] as const);

const SpecListParams = Type.Object({
  status: Type.Optional(SpecStatusEnum),
  includeArchived: Type.Optional(
    Type.Boolean({
      description:
        "Include archived spec changes. Archived changes are hidden unless this is true; capability summaries are still listed separately.",
    }),
  ),
  text: Type.Optional(
    Type.String({
      description:
        "Broad text search across spec changes. Start here before adding exact change filters; capability summaries are returned separately.",
    }),
  ),
});

const SpecReadParams = Type.Object({
  ref: Type.String({ description: "Spec change id or canonical capability id." }),
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

const SpecTaskParams = Type.Object({
  id: Type.Optional(Type.String()),
  title: Type.String(),
  summary: Type.Optional(Type.String()),
  deps: Type.Optional(Type.Array(Type.String())),
  requirements: Type.Optional(Type.Array(Type.String())),
  capabilities: Type.Optional(Type.Array(Type.String())),
  acceptance: Type.Optional(Type.Array(Type.String())),
});

const SpecWriteParams = Type.Object({
  action: SpecWriteActionEnum,
  ref: Type.Optional(Type.String()),
  title: Type.Optional(Type.String()),
  summary: Type.Optional(Type.String()),
  question: Type.Optional(Type.String()),
  answer: Type.Optional(Type.String()),
  designNotes: Type.Optional(Type.String()),
  supersedes: Type.Optional(Type.Array(Type.String())),
  capabilities: Type.Optional(Type.Array(SpecPlanCapabilityParams)),
  tasks: Type.Optional(Type.Array(SpecTaskParams)),
  replace: Type.Optional(Type.Boolean()),
});

const SpecAnalyzeParams = Type.Object({
  ref: Type.String(),
  mode: Type.Optional(SpecAnalyzeModeEnum),
});

const SpecSyncParams = Type.Object({
  ref: Type.String(),
});

type SpecWriteParamsValue = Static<typeof SpecWriteParams>;

function getStore(ctx: ExtensionContext) {
  return createSpecStore(ctx.cwd);
}

function machineResult(details: Record<string, unknown>, text: string) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

function requireRef(ref: string | undefined): string {
  if (!ref) {
    throw new Error("Spec change reference is required for this action");
  }
  return ref;
}

function toPlanInput(params: SpecWriteParamsValue): SpecPlanInput {
  if (!params.capabilities || params.capabilities.length === 0) {
    throw new Error("capabilities are required for plan");
  }
  return {
    designNotes: params.designNotes,
    supersedes: params.supersedes,
    capabilities: params.capabilities,
  };
}

function toTasksInput(params: SpecWriteParamsValue): SpecTasksInput {
  if (!params.tasks || params.tasks.length === 0) {
    throw new Error("tasks are required for tasks action");
  }
  return {
    replace: params.replace,
    tasks: params.tasks,
  };
}

export function registerSpecTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "spec_list",
    label: "spec_list",
    description:
      "List spec changes plus the separate capability summary set from durable local spec memory. Start broad with `text`; `status` and `includeArchived` narrow only the change list.",
    promptSnippet:
      "Inspect relevant existing specs before opening a new change or ensuring linked tickets so the new spec can inherit bounded detail instead of re-inventing it; broad text search is the safest first pass when you are rediscovering prior spec work.",
    promptGuidelines: [
      "Use this tool before creating a new spec so you do not duplicate existing capability work.",
      "Start with `text` when rediscovering prior spec work by capability, title, or phrase; add `status` only after the broad search is still too wide or when you intentionally want one change-state slice.",
      "`status` and `includeArchived` apply only to spec changes. Capability summaries are still returned separately and are not filtered by those change filters.",
      "Archived spec changes are hidden by default; set `includeArchived` when checking whether older finalized or superseded changes already cover the capability.",
    ],
    parameters: SpecListParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const changes = await getStore(ctx).listChanges({
        status: params.status,
        includeArchived: params.includeArchived,
        text: params.text,
      });
      const capabilities = await getStore(ctx).listCapabilities();
      return machineResult(
        { changes, capabilities },
        [
          changes.length > 0 ? changes.map(renderSpecSummary).join("\n") : "No spec changes.",
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
    description: "Read a spec change or canonical capability spec from durable local spec memory.",
    promptSnippet:
      "Load the current spec truth before planning work, ensuring linked tickets, or implementing derived tickets so bounded requirements, rationale, and edge cases stay explicit.",
    promptGuidelines: [
      "Read the active or finalized spec before implementation when it is the durable source of product intent.",
      "Use the loaded spec to recover detailed requirements, rationale, dependencies, risks, edge cases, and acceptance instead of reconstructing them from memory.",
    ],
    parameters: SpecReadParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (params.kind === "capability") {
        const capability = await getStore(ctx).readCapability(params.ref);
        return machineResult({ capability }, renderCapabilityDetail(capability));
      }
      try {
        const change = await getStore(ctx).readChange(params.ref);
        return machineResult({ change }, renderSpecDetail(change));
      } catch {
        const capability = await getStore(ctx).readCapability(params.ref);
        return machineResult({ capability }, renderCapabilityDetail(capability));
      }
    },
  });

  pi.registerTool({
    name: "spec_write",
    label: "spec_write",
    description: "Create or update durable spec state in the local spec memory layer.",
    promptSnippet:
      "Persist proposal, clarification, design, and task structure durably as a substantial specification contract instead of leaving product intent skeletal or trapped in chat.",
    promptGuidelines: [
      "Use this tool to formalize product intent before implementation when the work exceeds a narrow localized fix.",
      "Write clarifications back into the spec so future turns and agents can rely on them.",
      "Capture enough bounded detail for the spec layer: problem framing, rationale, assumptions, constraints, dependencies, tradeoffs, scenarios, edge cases, acceptance, verification, provenance, and open questions where they still exist.",
      "Do not derive linked tickets from a spec that is still missing substantive requirements or testable acceptance criteria.",
    ],
    parameters: SpecWriteParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const store = getStore(ctx);
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
          const change = await store.createChange({ title: params.title, summary: params.summary });
          return machineResult({ action: params.action, change }, renderSpecDetail(change));
        }
        case "clarify": {
          if (!params.question?.trim() || !params.answer?.trim()) {
            throw new Error("question and answer are required for clarify");
          }
          const change = await store.recordClarification(requireRef(params.ref), params.question, params.answer);
          return machineResult({ action: params.action, change }, renderSpecDetail(change));
        }
        case "plan": {
          const change = await store.updatePlan(requireRef(params.ref), toPlanInput(params));
          return machineResult({ action: params.action, change }, renderSpecDetail(change));
        }
        case "tasks": {
          const change = await store.updateTasks(requireRef(params.ref), toTasksInput(params));
          return machineResult({ action: params.action, change }, renderSpecDetail(change));
        }
        case "finalize": {
          const change = await store.finalizeChange(requireRef(params.ref));
          return machineResult({ action: params.action, change }, renderSpecDetail(change));
        }
        case "archive": {
          const change = await store.archiveChange(requireRef(params.ref));
          return machineResult({ action: params.action, change }, renderSpecDetail(change));
        }
      }
    },
  });

  pi.registerTool({
    name: "spec_analyze",
    label: "spec_analyze",
    description: "Run spec-quality analysis or checklist generation over a spec change.",
    promptSnippet:
      "Validate that the spec is clear, complete, traceable, and detailed enough to stand as the contract before turning it into tickets.",
    promptGuidelines: [
      "Use this tool to validate the specification itself, not to claim the code is correct.",
      "Run analysis before finalizing and ensuring linked tickets from a non-trivial spec change.",
      "Treat missing rationale, edge cases, dependencies, or verification detail as a spec-quality failure to fix before ensuring tickets.",
    ],
    parameters: SpecAnalyzeParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const store = getStore(ctx);
      if (params.mode === "checklist") {
        const change = await store.generateChecklist(params.ref);
        return machineResult({ mode: params.mode, change }, renderSpecDetail(change));
      }
      if (params.mode === "both") {
        await store.analyzeChange(params.ref);
        const change = await store.generateChecklist(params.ref);
        return machineResult({ mode: params.mode, change }, renderSpecDetail(change));
      }
      const change = await store.analyzeChange(params.ref);
      return machineResult({ mode: params.mode ?? "analysis", change }, renderSpecDetail(change));
    },
  });

  pi.registerTool({
    name: "spec_ensure_tickets",
    label: "spec_ensure_tickets",
    description: "Ensure a finalized spec change has deterministic linked tickets with explicit provenance.",
    promptSnippet:
      "Generate execution tickets only after the spec is finalized, validated, and detailed enough to serve as the durable contract for execution.",
    promptGuidelines: [
      "Ensure linked tickets only from finalized specs so execution state does not outrun product intent.",
      "Require substantial specification detail before ensuring tickets so they inherit complete requirements, rationale, dependencies, edge cases, and verification expectations.",
      "Re-run ticket generation when the finalized spec changes and you need the linked ticket graph refreshed deterministically.",
    ],
    parameters: SpecSyncParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const change = await ensureSpecTickets(ctx.cwd, params.ref);
      return machineResult({ change }, renderSpecDetail(change));
    },
  });
}
