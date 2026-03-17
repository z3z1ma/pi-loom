import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { renderWorkerDashboard, renderWorkerDetail, renderWorkerList } from "../domain/render.js";
import { buildInheritedWorkerSdkSessionConfig, runWorkerLaunch } from "../domain/runtime.js";
import { createWorkerStore } from "../domain/store.js";

const WorkerStatusEnum = StringEnum([
  "requested",
  "provisioning",
  "ready",
  "active",
  "blocked",
  "waiting_for_review",
  "completion_requested",
  "approved_for_consolidation",
  "completed",
  "retired",
  "failed",
  "archived",
] as const);
const WorkerTelemetryEnum = StringEnum([
  "unknown",
  "busy",
  "idle",
  "blocked",
  "waiting_for_review",
  "finished",
] as const);
const WorkerRuntimeKindEnum = StringEnum(["subprocess", "sdk", "rpc"] as const);
const MessageDirectionEnum = StringEnum(["manager_to_worker", "worker_to_manager", "broadcast"] as const);
const MessageKindEnum = StringEnum([
  "assignment",
  "acknowledgement",
  "clarification",
  "unblock",
  "escalation",
  "resolution",
  "checkpoint_notice",
  "completion_notice",
  "approval_decision",
  "broadcast_warning",
  "status_update",
  "note",
] as const);
const MessageStatusEnum = StringEnum(["pending", "acknowledged", "resolved"] as const);
const MessageAwaitingEnum = StringEnum(["none", "worker", "manager"] as const);
const WorkerWriteActionEnum = StringEnum([
  "init",
  "create",
  "update",
  "append_message",
  "acknowledge_message",
  "resolve_message",
  "append_checkpoint",
  "set_telemetry",
  "request_completion",
  "decide_approval",
  "record_consolidation",
  "retire",
] as const);

const LinkedRefsSchema = Type.Object({
  initiativeIds: Type.Optional(Type.Array(Type.String())),
  researchIds: Type.Optional(Type.Array(Type.String())),
  specChangeIds: Type.Optional(Type.Array(Type.String())),
  ticketIds: Type.Optional(Type.Array(Type.String())),
  critiqueIds: Type.Optional(Type.Array(Type.String())),
  docIds: Type.Optional(Type.Array(Type.String())),
  planIds: Type.Optional(Type.Array(Type.String())),
  ralphRunIds: Type.Optional(Type.Array(Type.String())),
});

const WorkspaceSchema = Type.Object({
  repositoryRoot: Type.Optional(Type.String()),
  strategy: Type.Optional(StringEnum(["git-worktree"] as const)),
  baseRef: Type.Optional(Type.String()),
  branch: Type.Optional(Type.String()),
  labels: Type.Optional(Type.Array(Type.String())),
  logicalPath: Type.Optional(Type.String()),
});

const ManagerRefSchema = Type.Object({
  kind: Type.Optional(StringEnum(["operator", "manual", "plan", "ticket", "ralph", "runtime"] as const)),
  ref: Type.Optional(Type.String()),
  label: Type.Optional(Type.String()),
});

const MessageSchema = Type.Object({
  direction: Type.Optional(MessageDirectionEnum),
  awaiting: Type.Optional(MessageAwaitingEnum),
  kind: Type.Optional(MessageKindEnum),
  status: Type.Optional(MessageStatusEnum),
  from: Type.Optional(Type.String()),
  text: Type.String(),
  relatedRefs: Type.Optional(Type.Array(Type.String())),
  replyTo: Type.Optional(Type.String()),
});

const CheckpointSchema = Type.Object({
  summary: Type.Optional(Type.String()),
  understanding: Type.Optional(Type.String()),
  recentChanges: Type.Optional(Type.Array(Type.String())),
  validation: Type.Optional(Type.Array(Type.String())),
  blockers: Type.Optional(Type.Array(Type.String())),
  nextAction: Type.Optional(Type.String()),
  acknowledgedMessageIds: Type.Optional(Type.Array(Type.String())),
  resolvedMessageIds: Type.Optional(Type.Array(Type.String())),
  remainingInboxCount: Type.Optional(Type.Number()),
  managerInputRequired: Type.Optional(Type.Boolean()),
});

const TelemetrySchema = Type.Object({
  state: Type.Optional(WorkerTelemetryEnum),
  summary: Type.Optional(Type.String()),
  heartbeatAt: Type.Optional(Type.String()),
  checkpointId: Type.Optional(Type.String()),
  pendingMessages: Type.Optional(Type.Number()),
  notes: Type.Optional(Type.Array(Type.String())),
});

const CompletionSchema = Type.Object({
  requestedAt: Type.Optional(Type.String()),
  scopeComplete: Type.Optional(Type.Array(Type.String())),
  validationEvidence: Type.Optional(Type.Array(Type.String())),
  remainingRisks: Type.Optional(Type.Array(Type.String())),
  branchState: Type.Optional(Type.String()),
  summary: Type.Optional(Type.String()),
  requestedBy: Type.Optional(Type.String()),
});

const ApprovalSchema = Type.Object({
  status: StringEnum(["approved", "rejected_for_revision", "escalated"] as const),
  decidedAt: Type.Optional(Type.String()),
  decidedBy: Type.Optional(Type.String()),
  summary: Type.Optional(Type.String()),
  rationale: Type.Optional(Type.Array(Type.String())),
});

const ConsolidationSchema = Type.Object({
  status: StringEnum([
    "merged",
    "cherry_picked",
    "patched",
    "conflicted",
    "validation_failed",
    "rolled_back",
    "deferred",
  ] as const),
  strategy: Type.Optional(StringEnum(["merge", "cherry-pick", "patch", "manual"] as const)),
  summary: Type.Optional(Type.String()),
  validation: Type.Optional(Type.Array(Type.String())),
  conflicts: Type.Optional(Type.Array(Type.String())),
  followUps: Type.Optional(Type.Array(Type.String())),
  decidedAt: Type.Optional(Type.String()),
});

function machineResult(details: Record<string, unknown>, text: string) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

function getStore(ctx: ExtensionContext) {
  return createWorkerStore(ctx.cwd);
}

export function registerWorkerTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "worker_list",
    label: "List Workers",
    description: "List workspace-backed workers from local Loom memory.",
    parameters: Type.Object({
      status: Type.Optional(WorkerStatusEnum),
      telemetryState: Type.Optional(WorkerTelemetryEnum),
      pendingApproval: Type.Optional(Type.Boolean()),
      text: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const workers = await getStore(ctx).listWorkersAsync(params);
      return machineResult({ workers }, renderWorkerList(workers));
    },
  });

  pi.registerTool({
    name: "worker_read",
    label: "Read Worker",
    description: "Read a worker record, packet, or dashboard from local Loom memory.",
    parameters: Type.Object({
      ref: Type.String(),
      mode: Type.Optional(StringEnum(["full", "state", "packet", "worker", "dashboard", "inbox"] as const)),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const worker = await getStore(ctx).readWorkerAsync(params.ref);
      const mode = params.mode ?? "full";
      if (mode === "state") return machineResult({ state: worker.state }, JSON.stringify(worker.state, null, 2));
      if (mode === "packet") return machineResult({ packet: worker.packet }, worker.packet);
      if (mode === "worker") return machineResult({ worker: worker.worker }, worker.worker);
      if (mode === "inbox") {
        const inbox = getStore(ctx).readInbox(params.ref);
        return machineResult({ inbox }, JSON.stringify(inbox, null, 2));
      }
      if (mode === "dashboard")
        return machineResult({ dashboard: worker.dashboard }, renderWorkerDashboard(worker.dashboard));
      return machineResult({ worker }, renderWorkerDetail(worker));
    },
  });

  pi.registerTool({
    name: "worker_write",
    label: "Write Worker",
    description:
      "Create or update workers, messages, checkpoints, telemetry, approvals, consolidation, and retirement state.",
    promptSnippet:
      "Workers execute ticket-linked work. For the common case, create or read the ticket first, then create the worker with linkedRefs.ticketIds before launching it.",
    promptGuidelines: [
      "Workers require at least one linked ticket id; do not create free-floating workers.",
      "When the task is straightforward execution, prefer the simple flow: ticket_read/ticket_write -> worker_write action=create with linkedRefs.ticketIds -> worker_launch. Keep the ticket as the live execution ledger while the worker carries workspace-backed execution state.",
      "Use append_message, checkpoints, telemetry, completion, and approval updates to keep the worker record truthful after launch instead of narrating worker progress only in chat.",
    ],
    parameters: Type.Object({
      action: WorkerWriteActionEnum,
      ref: Type.Optional(Type.String()),
      title: Type.Optional(Type.String()),
      objective: Type.Optional(Type.String()),
      summary: Type.Optional(Type.String()),
      status: Type.Optional(WorkerStatusEnum),
      linkedRefs: Type.Optional(LinkedRefsSchema),
      workspace: Type.Optional(WorkspaceSchema),
      managerRef: Type.Optional(ManagerRefSchema),
      message: Type.Optional(MessageSchema),
      checkpoint: Type.Optional(CheckpointSchema),
      telemetry: Type.Optional(TelemetrySchema),
      completion: Type.Optional(CompletionSchema),
      approval: Type.Optional(ApprovalSchema),
      consolidation: Type.Optional(ConsolidationSchema),
      note: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const store = getStore(ctx);
      switch (params.action) {
        case "init": {
          const result = await store.initLedgerAsync();
          return machineResult(result, `Initialized worker memory at ${result.root}`);
        }
        case "create": {
          if (!params.title?.trim()) throw new Error("title is required for create");
          const worker = await store.createWorkerAsync({
            title: params.title,
            objective: params.objective,
            summary: params.summary,
            linkedRefs: params.linkedRefs,
            workspace: params.workspace,
            managerRef: params.managerRef,
          });
          return machineResult({ worker }, renderWorkerDetail(worker));
        }
        case "update": {
          if (!params.ref) throw new Error("ref is required for update");
          const worker = await store.updateWorkerAsync(params.ref, {
            title: params.title,
            objective: params.objective,
            summary: params.summary,
            status: params.status,
            linkedRefs: params.linkedRefs,
            workspace: params.workspace,
            managerRef: params.managerRef,
          });
          return machineResult({ worker }, renderWorkerDetail(worker));
        }
        case "append_message": {
          if (!params.ref || !params.message) throw new Error("ref and message are required for append_message");
          const worker = await store.appendMessageAsync(params.ref, params.message);
          return machineResult({ worker }, renderWorkerDetail(worker));
        }
        case "acknowledge_message": {
          if (!params.ref || !params.message?.replyTo)
            throw new Error("ref and message.replyTo are required for acknowledge_message");
          const worker = await store.acknowledgeMessageAsync(
            params.ref,
            params.message.replyTo,
            params.message.from ?? "worker",
            params.message.text,
          );
          return machineResult({ worker }, renderWorkerDetail(worker));
        }
        case "resolve_message": {
          if (!params.ref || !params.message?.replyTo)
            throw new Error("ref and message.replyTo are required for resolve_message");
          const worker = await store.resolveMessageAsync(
            params.ref,
            params.message.replyTo,
            params.message.from ?? "worker",
            params.message.text,
          );
          return machineResult({ worker }, renderWorkerDetail(worker));
        }
        case "append_checkpoint": {
          if (!params.ref || !params.checkpoint)
            throw new Error("ref and checkpoint are required for append_checkpoint");
          const worker = await store.appendCheckpointAsync(params.ref, params.checkpoint);
          return machineResult({ worker }, renderWorkerDetail(worker));
        }
        case "set_telemetry": {
          if (!params.ref || !params.telemetry) throw new Error("ref and telemetry are required for set_telemetry");
          const worker = await store.setTelemetryAsync(params.ref, params.telemetry);
          return machineResult({ worker }, renderWorkerDetail(worker));
        }
        case "request_completion": {
          if (!params.ref) throw new Error("ref is required for request_completion");
          const worker = await store.requestCompletionAsync(params.ref, params.completion ?? {});
          return machineResult({ worker }, renderWorkerDetail(worker));
        }
        case "decide_approval": {
          if (!params.ref || !params.approval) throw new Error("ref and approval are required for decide_approval");
          const worker = await store.decideApprovalAsync(params.ref, params.approval);
          return machineResult({ worker }, renderWorkerDetail(worker));
        }
        case "record_consolidation": {
          if (!params.ref || !params.consolidation)
            throw new Error("ref and consolidation are required for record_consolidation");
          const worker = await store.recordConsolidationAsync(params.ref, params.consolidation);
          return machineResult({ worker }, renderWorkerDetail(worker));
        }
        case "retire": {
          if (!params.ref) throw new Error("ref is required for retire");
          const worker = await store.retireWorkerAsync(params.ref, params.note);
          return machineResult({ worker }, renderWorkerDetail(worker));
        }
        default:
          throw new Error(`Unsupported worker action: ${params.action satisfies never}`);
      }
    },
  });

  pi.registerTool({
    name: "worker_launch",
    label: "Launch Worker",
    description:
      "Provision a worker workspace if needed, prepare launch state, and optionally run an SDK-backed Pi worker by default.",
    promptSnippet:
      "Launch the existing ticket-linked worker through the default SDK-backed runtime unless you intentionally need subprocess or RPC.",
    promptGuidelines: [
      "Use this after the worker already exists and is linked to at least one ticket; worker creation and worker launch are separate steps.",
      "Omit the runtime override for the common path so launch defaults to the SDK-backed runtime. Override only when you deliberately need subprocess or RPC behavior.",
      "Use prepareOnly when a manager or later step needs the prepared workspace and launch descriptor without immediately starting execution.",
    ],
    parameters: Type.Object({
      ref: Type.String(),
      prepareOnly: Type.Optional(Type.Boolean()),
      note: Type.Optional(Type.String()),
      runtime: Type.Optional(WorkerRuntimeKindEnum),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const store = getStore(ctx);
      const sdkSessionConfig = buildInheritedWorkerSdkSessionConfig(ctx);
      const prepared = await store.prepareLaunchAsync(params.ref, false, params.note, params.runtime);
      if (params.prepareOnly === true) {
        return machineResult({ launch: prepared.launch }, await store.renderLaunchAsync(params.ref));
      }
      const running = await store.startLaunchExecutionAsync(params.ref);
      if (!running.launch) {
        throw new Error("Worker launch descriptor was not created");
      }
      const execution = await runWorkerLaunch(running.launch, signal, undefined, sdkSessionConfig);
      const finalized = await store.finishLaunchExecutionAsync(params.ref, execution);
      return machineResult(
        { launch: finalized.launch, execution },
        `${await store.renderLaunchAsync(params.ref)}\n\nExecution: ${execution.status}\n${execution.output || execution.error || ""}`.trim(),
      );
    },
  });

  pi.registerTool({
    name: "worker_resume",
    label: "Resume Worker",
    description:
      "Prepare and optionally run a resumed worker from durable state, defaulting to the SDK-backed runtime.",
    promptSnippet:
      "Resume the worker from durable state with the default SDK-backed runtime unless an explicit runtime override is truly needed.",
    promptGuidelines: [
      "Use resume for a worker that already exists and has durable state worth continuing; use worker_launch for the initial execution when no prior run exists.",
      "Keep the runtime override optional. If omitted, resume should preserve the last intentional runtime choice or fall back to the default SDK-backed runtime.",
    ],
    parameters: Type.Object({
      ref: Type.String(),
      prepareOnly: Type.Optional(Type.Boolean()),
      note: Type.Optional(Type.String()),
      runtime: Type.Optional(WorkerRuntimeKindEnum),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const store = getStore(ctx);
      const sdkSessionConfig = buildInheritedWorkerSdkSessionConfig(ctx);
      const prepared = await store.prepareLaunchAsync(params.ref, true, params.note ?? "Resume requested", params.runtime);
      if (params.prepareOnly === true) {
        return machineResult({ launch: prepared.launch }, await store.renderLaunchAsync(params.ref));
      }
      const running = await store.startLaunchExecutionAsync(params.ref);
      if (!running.launch) {
        throw new Error("Worker launch descriptor was not created");
      }
      const execution = await runWorkerLaunch(running.launch, signal, undefined, sdkSessionConfig);
      const finalized = await store.finishLaunchExecutionAsync(params.ref, execution);
      return machineResult(
        { launch: finalized.launch, execution },
        `${await store.renderLaunchAsync(params.ref)}\n\nExecution: ${execution.status}\n${execution.output || execution.error || ""}`.trim(),
      );
    },
  });

  pi.registerTool({
    name: "worker_dashboard",
    label: "Worker Dashboard",
    description: "Render a concise worker dashboard view.",
    parameters: Type.Object({ ref: Type.String() }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const worker = await getStore(ctx).readWorkerAsync(params.ref);
      return machineResult({ dashboard: worker.dashboard }, renderWorkerDashboard(worker.dashboard));
    },
  });

  pi.registerTool({
    name: "worker_supervise",
    label: "Supervise Worker",
    description:
      "Evaluate compact worker state, return a supervision decision, and optionally persist a manager intervention.",
    parameters: Type.Object({
      ref: Type.String(),
      apply: Type.Optional(Type.Boolean()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = getStore(ctx).superviseWorker(params.ref, params.apply === true);
      return machineResult(
        { decision: result.decision, worker: result.worker.summary },
        [
          `Action: ${result.decision.action}`,
          `Confidence: ${result.decision.confidence}`,
          `Reasoning: ${result.decision.reasoning}`,
          result.decision.message ? `Message: ${result.decision.message}` : "Message: (none)",
          result.decision.evidence.length > 0
            ? `Evidence: ${result.decision.evidence.join(" | ")}`
            : "Evidence: (none)",
        ].join("\n"),
      );
    },
  });
}
