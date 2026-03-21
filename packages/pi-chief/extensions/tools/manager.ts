import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { buildParentSessionRuntimeEnv } from "@pi-loom/pi-ralph/extensions/domain/runtime.js";
import { LOOM_LIST_SORTS, type LoomListSort } from "@pi-loom/pi-storage/storage/list-search.js";
import { Type } from "@sinclair/typebox";
import { createManagerStore } from "../domain/manager-store.js";
import { scheduleManagerLoop, waitForManagerUpdate } from "../domain/manager-runtime.js";
import { renderManagerDetail, renderManagerList } from "../domain/render.js";

const LoomListSortEnum = StringEnum(LOOM_LIST_SORTS);
const ManagerStatusEnum = StringEnum(["active", "waiting_for_input", "completed", "failed", "archived"] as const);
const WorkerStatusEnum = StringEnum(["queued", "running", "waiting_for_manager", "completed", "failed", "retired"] as const);
const ReviewDecisionEnum = StringEnum(["approved", "rejected_for_revision", "escalated"] as const);
const ManagerMessageKindEnum = StringEnum(["steer", "review", "escalation", "report"] as const);

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
      "List durable managers for Ralph-backed chief orchestration. Start broad with text when rediscovering a manager by title, target ref, or latest summary; use status only when you intentionally want a narrow slice.",
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
      "Read a durable manager record, including the manager’s own Ralph loop state, pending operator output, and internal worker views.",
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
      "Create a durable manager from a spec, initiative, plan, ticket set, or free-text objective, create its linked Ralph loop, schedule in-process background execution, and optionally wait for the first update.",
    promptSnippet:
      "Start managers from whatever broad context you actually have. The manager loop can create missing research/spec/plan/ticket structure before it reconciles workers on the in-process scheduler.",
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
      const runtimeEnv = await buildParentSessionRuntimeEnv({
        model: ctx.model,
      });
      scheduleManagerLoop(ctx.cwd, manager.state.managerId, runtimeEnv);
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
    promptSnippet: "Use this to wait on the in-process manager scheduler instead of polling manager_read manually.",
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
      "Provide operator steerability between manager passes: answer escalations, provide guidance, record review decisions, or change the target ref. In-process background execution is rescheduled automatically afterward, and you may optionally wait for the next update.",
    promptSnippet:
      "Use this between manager updates to answer what the manager asked, then let the in-process scheduler continue on its own.",
    parameters: Type.Object({
      ref: Type.String(),
      text: Type.Optional(Type.String()),
      workerId: Type.Optional(Type.String()),
      reviewDecision: Type.Optional(ReviewDecisionEnum),
      targetRef: Type.Optional(Type.String()),
      wait: Type.Optional(Type.Boolean()),
      timeoutMs: Type.Optional(Type.Number()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const manager = await getStore(ctx).steerManagerAsync(params.ref, {
        text: params.text,
        workerId: params.workerId,
        reviewDecision: params.reviewDecision,
        targetRef: params.targetRef,
      });
      const runtimeEnv = await buildParentSessionRuntimeEnv({
        model: ctx.model,
      });
      scheduleManagerLoop(ctx.cwd, manager.state.managerId, runtimeEnv);
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
    name: "manager_reconcile",
    label: "manager_reconcile",
    description:
      "Ensure ticket-bound workers and worktrees exist for the manager’s current ticket set, then start any queued worker Ralph loops in the background. This is for the internal manager loop, not the normal operator-facing path.",
    parameters: Type.Object({ ref: Type.String() }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const manager = await getStore(ctx).reconcileManagerWorkersAsync(params.ref);
      return machineResult({ manager }, renderManagerDetail(manager));
    },
  });

  pi.registerTool({
    name: "manager_record",
    label: "manager_record",
    description:
      "Persist one bounded manager-loop outcome: linked-ref changes, operator-facing messages, status changes, and worker outcome updates. This is for the internal manager loop.",
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
            status: WorkerStatusEnum,
            summary: Type.Optional(Type.String()),
            instructions: Type.Optional(Type.Array(Type.String())),
            validation: Type.Optional(Type.Array(Type.String())),
            conflicts: Type.Optional(Type.Array(Type.String())),
            followUps: Type.Optional(Type.Array(Type.String())),
          }),
        ),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const manager = await getStore(ctx).recordManagerStepAsync(params.ref, {
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
