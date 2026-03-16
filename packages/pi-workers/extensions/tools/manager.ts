import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { renderManagerOverview, renderWorkerDetail } from "../domain/render.js";
import { runWorkerLaunch } from "../domain/runtime.js";
import { createWorkerStore } from "../domain/store.js";

const ManagerMessageKindEnum = StringEnum([
  "assignment",
  "clarification",
  "unblock",
  "approval_decision",
  "broadcast_warning",
  "note",
] as const);
const WorkerRuntimeKindEnum = StringEnum(["subprocess", "sdk", "rpc"] as const);
const ManagerWriteActionEnum = StringEnum([
  "message",
  "acknowledge_message",
  "resolve_message",
  "approve",
  "resume",
] as const);

function getStore(ctx: ExtensionContext) {
  return createWorkerStore(ctx.cwd);
}

function machineResult(details: Record<string, unknown>, text: string) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

export function registerManagerTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "manager_overview",
    label: "Manager Overview",
    description: "Summarize worker fleet state, unresolved inbox backlog, pending approvals, and resume candidates.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const overview = getStore(ctx).managerOverview();
      return machineResult({ overview }, renderManagerOverview(overview));
    },
  });

  pi.registerTool({
    name: "manager_supervise",
    label: "Manager Supervise",
    description: "Run compact-state supervision over one or many workers and optionally persist manager interventions.",
    parameters: Type.Object({
      refs: Type.Optional(Type.Array(Type.String())),
      apply: Type.Optional(Type.Boolean()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const results = getStore(ctx).superviseWorkers(params.refs, params.apply === true);
      return machineResult(
        { results },
        results
          .map(
            (result) =>
              `${result.ref}: ${result.decision.action} (${result.decision.confidence})${result.decision.message ? ` — ${result.decision.message}` : ""}`,
          )
          .join("\n"),
      );
    },
  });

  pi.registerTool({
    name: "manager_schedule",
    label: "Manager Schedule",
    description:
      "Run a bounded manager scheduling pass over worker fleet state and optionally apply resume/message actions.",
    parameters: Type.Object({
      refs: Type.Optional(Type.Array(Type.String())),
      apply: Type.Optional(Type.Boolean()),
      executeResumes: Type.Optional(Type.Boolean()),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const results = await getStore(ctx).runManagerSchedulerPass({
        refs: params.refs,
        apply: params.apply === true,
        executeResumes: params.executeResumes === true,
        signal,
      });
      return machineResult(
        { results },
        results
          .map(
            (result) => `${result.workerId}: ${result.action}${result.applied ? " [applied]" : ""} — ${result.summary}`,
          )
          .join("\n"),
      );
    },
  });

  pi.registerTool({
    name: "manager_write",
    label: "Manager Write",
    description: "Send manager messages, make approval decisions, or resume workers through the manager control plane.",
    parameters: Type.Object({
      action: ManagerWriteActionEnum,
      ref: Type.String(),
      kind: Type.Optional(ManagerMessageKindEnum),
      text: Type.Optional(Type.String()),
      messageId: Type.Optional(Type.String()),
      approvalStatus: Type.Optional(StringEnum(["approved", "rejected_for_revision", "escalated"] as const)),
      rationale: Type.Optional(Type.Array(Type.String())),
      prepareOnly: Type.Optional(Type.Boolean()),
      note: Type.Optional(Type.String()),
      runtime: Type.Optional(WorkerRuntimeKindEnum),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const store = getStore(ctx);
      switch (params.action) {
        case "message": {
          if (!params.kind || !params.text?.trim()) {
            throw new Error("kind and text are required for manager message action");
          }
          const worker = store.appendMessage(params.ref, {
            direction: "manager_to_worker",
            kind: params.kind,
            text: params.text,
          });
          return machineResult({ worker }, renderWorkerDetail(worker));
        }
        case "approve": {
          if (!params.approvalStatus) {
            throw new Error("approvalStatus is required for manager approve action");
          }
          const worker = store.decideApproval(params.ref, {
            status: params.approvalStatus,
            summary: params.text,
            rationale: params.rationale,
            decidedBy: "manager",
          });
          return machineResult({ worker }, renderWorkerDetail(worker));
        }
        case "acknowledge_message": {
          if (!params.messageId) {
            throw new Error("messageId is required for manager acknowledge_message action");
          }
          const worker = store.acknowledgeMessage(params.ref, params.messageId, "manager", params.text);
          return machineResult({ worker }, renderWorkerDetail(worker));
        }
        case "resolve_message": {
          if (!params.messageId) {
            throw new Error("messageId is required for manager resolve_message action");
          }
          const worker = store.resolveMessage(params.ref, params.messageId, "manager", params.text);
          return machineResult({ worker }, renderWorkerDetail(worker));
        }
        case "resume": {
          const prepared = store.prepareLaunch(
            params.ref,
            true,
            params.note ?? "Prepared by manager tool.",
            params.runtime,
          );
          if (params.prepareOnly === true) {
            return machineResult({ launch: prepared.launch }, store.renderLaunch(params.ref));
          }
          const running = store.startLaunchExecution(params.ref);
          if (!running.launch) {
            throw new Error("Worker launch descriptor was not created");
          }
          const execution = await runWorkerLaunch(running.launch, signal);
          const finalized = store.finishLaunchExecution(params.ref, execution);
          return machineResult(
            { launch: finalized.launch, execution },
            `${store.renderLaunch(params.ref)}\n\nExecution: ${execution.status}\n${execution.output || execution.error || ""}`.trim(),
          );
        }
        default:
          throw new Error(`Unsupported manager action: ${params.action satisfies never}`);
      }
    },
  });
}
