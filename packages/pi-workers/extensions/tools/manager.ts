import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { LOOM_LIST_SORTS, type LoomListSort } from "@pi-loom/pi-storage/storage/list-search.js";
import { Type } from "@sinclair/typebox";
import { createManagerStore } from "../domain/manager-store.js";
import { startManagerDaemon, waitForManagerUpdate } from "../domain/manager-runtime.js";
import { renderManagerDetail, renderManagerList } from "../domain/render.js";

const LoomListSortEnum = StringEnum(LOOM_LIST_SORTS);
const ManagerStatusEnum = StringEnum(["active", "waiting_for_input", "completed", "failed", "archived"] as const);
const WorkerOutcomeStatusEnum = StringEnum(["ready", "blocked", "waiting_for_review", "completed", "failed"] as const);
const ApprovalStatusEnum = StringEnum(["approved", "rejected_for_revision", "escalated"] as const);
const ManagerMessageKindEnum = StringEnum(["steer", "approval", "escalation", "report"] as const);

const LinkedRefsSchema = Type.Object({
  initiativeIds: Type.Optional(Type.Array(Type.String())),
  researchIds: Type.Optional(Type.Array(Type.String())),
  specChangeIds: Type.Optional(Type.Array(Type.String())),
  ticketIds: Type.Optional(Type.Array(Type.String())),
  critiqueIds: Type.Optional(Type.Array(Type.String())),
  docIds: Type.Optional(Type.Array(Type.String())),
  planIds: Type.Optional(Type.Array(Type.String())),
});

function machineResult(details: Record<string, unknown>, text: string) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

function getStore(ctx: ExtensionContext) {
  return createManagerStore(ctx.cwd);
}

export function registerManagerTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "manager_list",
    label: "manager_list",
    description:
      "List durable managers for Ralph-backed worktree orchestration. Start broad with text when rediscovering a manager by title, target ref, or latest summary; use status only when you intentionally want a narrow slice.",
    promptSnippet:
      "Use this before starting a new manager so you reuse an existing durable orchestration record instead of fragmenting manager state.",
    parameters: Type.Object({
      status: Type.Optional(ManagerStatusEnum),
      text: Type.Optional(Type.String()),
      sort: Type.Optional(LoomListSortEnum),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const managers = await getStore(ctx).listManagersAsync({
        status: params.status,
        text: params.text,
        sort: params.sort as LoomListSort | undefined,
      });
      return machineResult({ managers }, renderManagerList(managers));
    },
  });

  pi.registerTool({
    name: "manager_read",
    label: "manager_read",
    description:
      "Read a durable manager record, including pending output, target ref, and internal worker views. Use this to inspect what the manager is doing or waiting on.",
    promptSnippet: "Read the manager before deciding whether to wait, steer, or inspect other Loom state.",
    parameters: Type.Object({ ref: Type.String() }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const manager = await getStore(ctx).readManagerAsync(params.ref);
      return machineResult({ manager }, renderManagerDetail(manager));
    },
  });

  pi.registerTool({
    name: "manager_start",
    label: "manager_start",
    description:
      "Create a durable manager for a broad objective, linked refs, or ticket set, start its background orchestration loop, and optionally wait until it has something to say or finishes.",
    promptSnippet:
      "Start managers from a spec, initiative, plan, ticket set, or free-text objective. The background manager loop decides what research, planning, ticketing, worker spawning, and review work must happen next.",
    promptGuidelines: [
      "A manager may start from linked refs, a ticket set, or just a broad objective. If no tickets exist yet, the manager can create the needed research/spec/plan/ticket artifacts in later AI steps.",
      "Use wait when you want this call to block until the manager emits an update, asks for operator input, or finishes. Otherwise start it asynchronously and inspect later with manager_read or manager_wait.",
    ],
    parameters: Type.Object({
      title: Type.String(),
      objective: Type.Optional(Type.String()),
      summary: Type.Optional(Type.String()),
      targetRef: Type.Optional(Type.String()),
      linkedRefs: Type.Optional(LinkedRefsSchema),
      wait: Type.Optional(Type.Boolean()),
      timeoutMs: Type.Optional(Type.Number()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const store = getStore(ctx);
      const manager = await store.createManagerAsync({
        title: params.title,
        objective: params.objective,
        summary: params.summary,
        targetRef: params.targetRef,
        linkedRefs: params.linkedRefs,
      });
      startManagerDaemon(ctx.cwd, manager.state.managerId);
      if (params.wait === true) {
        const updated = await waitForManagerUpdate(ctx.cwd, manager.state.managerId, { timeoutMs: params.timeoutMs });
        return machineResult({ manager: updated }, renderManagerDetail(updated));
      }
      return machineResult({ manager }, renderManagerDetail(manager));
    },
  });

  pi.registerTool({
    name: "manager_wait",
    label: "manager_wait",
    description:
      "Block until a manager has something to say, reaches a terminal state, or the wait timeout expires. Use this after starting or steering a manager.",
    promptSnippet: "Use this to wait on the background manager loop instead of polling manager_read manually.",
    parameters: Type.Object({
      ref: Type.String(),
      timeoutMs: Type.Optional(Type.Number()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const manager = await waitForManagerUpdate(ctx.cwd, params.ref, { timeoutMs: params.timeoutMs });
      return machineResult({ manager }, renderManagerDetail(manager));
    },
  });

  pi.registerTool({
    name: "manager_steer",
    label: "manager_steer",
    description:
      "Provide operator steerability between manager passes: answer escalations, approve or reject a worker, or change the target ref. The background manager loop is restarted automatically afterward, and you may optionally wait for the next update.",
    promptSnippet:
      "Use steerability between manager updates to answer what the manager asked, then let the background loop continue on its own.",
    parameters: Type.Object({
      ref: Type.String(),
      text: Type.Optional(Type.String()),
      workerId: Type.Optional(Type.String()),
      approvalStatus: Type.Optional(ApprovalStatusEnum),
      targetRef: Type.Optional(Type.String()),
      wait: Type.Optional(Type.Boolean()),
      timeoutMs: Type.Optional(Type.Number()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const manager = await getStore(ctx).steerManagerAsync(params.ref, {
        text: params.text,
        workerId: params.workerId,
        approvalStatus: params.approvalStatus,
        targetRef: params.targetRef,
      });
      startManagerDaemon(ctx.cwd, manager.state.managerId);
      if (params.wait === true) {
        const updated = await waitForManagerUpdate(ctx.cwd, manager.state.managerId, { timeoutMs: params.timeoutMs });
        return machineResult({ manager: updated }, renderManagerDetail(updated));
      }
      return machineResult({ manager }, renderManagerDetail(manager));
    },
  });
}

export function registerInternalManagerTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "manager_dispatch",
    label: "manager_dispatch",
    description:
      "Ensure ticket workers exist and start any straightforward background Ralph iterations that are ready to run. This is primarily for the background manager loop, not the usual operator-facing path.",
    parameters: Type.Object({ ref: Type.String() }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const manager = await getStore(ctx).dispatchManagerWorkAsync(params.ref);
      return machineResult({ manager }, renderManagerDetail(manager));
    },
  });

  pi.registerTool({
    name: "manager_checkpoint",
    label: "manager_checkpoint",
    description:
      "Persist one bounded manager-loop outcome, including operator-facing messages, linked-ref updates, status changes, and worker outcome updates. This is primarily for the background manager loop.",
    parameters: Type.Object({
      ref: Type.String(),
      status: Type.Optional(ManagerStatusEnum),
      summary: Type.Optional(Type.String()),
      linkedRefs: Type.Optional(LinkedRefsSchema),
      resolveOperatorInput: Type.Optional(Type.Boolean()),
      operatorMessages: Type.Optional(
        Type.Array(
          Type.Object({
            kind: ManagerMessageKindEnum,
            text: Type.String(),
            workerId: Type.Optional(Type.String()),
          }),
        ),
      ),
      workerUpdates: Type.Optional(
        Type.Array(
          Type.Object({
            workerId: Type.String(),
            status: WorkerOutcomeStatusEnum,
            summary: Type.Optional(Type.String()),
            validation: Type.Optional(Type.Array(Type.String())),
            conflicts: Type.Optional(Type.Array(Type.String())),
            followUps: Type.Optional(Type.Array(Type.String())),
          }),
        ),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const manager = await getStore(ctx).checkpointManagerAsync(params.ref, {
        status: params.status,
        summary: params.summary,
        linkedRefs: params.linkedRefs,
        resolveOperatorInput: params.resolveOperatorInput,
        operatorMessages: params.operatorMessages,
        workerUpdates: params.workerUpdates,
      });
      return machineResult({ manager }, renderManagerDetail(manager));
    },
  });
}
