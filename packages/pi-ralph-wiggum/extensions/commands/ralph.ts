import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { createPlanStore } from "@pi-loom/pi-plans/extensions/domain/store.js";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import { type ExecuteRalphLoopResult, executeRalphLoop } from "../domain/loop.js";
import { renderRalphDetail } from "../domain/render.js";
import { createRalphStore } from "../domain/store.js";
import { resolveTargetRalphRun, stopRalphLoop } from "../tools/ralph.js";

const RALPH_COMMAND_USAGE = [
  "Usage: /ralph start <ticket-ref> [steering prompt]",
  "   or: /ralph start <plan-ref> [steering prompt]",
  "   or: /ralph start <plan-ref> <ticket-ref> [steering prompt]",
  "   or: /ralph stop <ticket-ref>",
  "   or: /ralph stop <plan-ref> <ticket-ref>",
  "   or: /ralph steer <ticket-ref> <text>",
  "   or: /ralph steer <plan-ref> <ticket-ref> <text>",
  "   or: /ralph status <ticket-ref>",
  "   or: /ralph status <plan-ref> <ticket-ref>",
].join("\n");
const RALPH_STATUS_KEY = "ralph-live-run";

interface RalphStartArgs {
  kind: "start";
  mode: "ticket" | "plan";
  planRef?: string;
  ticketRef?: string;
  prompt?: string;
}

interface RalphStopArgs {
  kind: "stop";
  planRef?: string;
  ticketRef: string;
}

interface RalphSteerArgs {
  kind: "steer";
  planRef?: string;
  ticketRef: string;
  text: string;
}

interface RalphStatusArgs {
  kind: "status";
  planRef?: string;
  ticketRef: string;
}

type RalphCommandArgs = RalphStartArgs | RalphStopArgs | RalphSteerArgs | RalphStatusArgs;

async function tokenKinds(cwd: string, token: string): Promise<{ ticket: boolean; plan: boolean }> {
  const [ticket, plan] = await Promise.all([
    createTicketStore(cwd)
      .readTicketAsync(token)
      .then(() => true)
      .catch(() => false),
    createPlanStore(cwd)
      .readPlan(token)
      .then(() => true)
      .catch(() => false),
  ]);
  return { ticket, plan };
}

async function parseLoopArgs(args: string, ctx: ExtensionCommandContext): Promise<RalphCommandArgs> {
  const trimmed = args.trim();
  if (!trimmed) {
    throw new Error(RALPH_COMMAND_USAGE);
  }
  const match = trimmed.match(/^(start|stop|steer|status)\s+([\s\S]+)$/i);
  if (!match) {
    throw new Error(RALPH_COMMAND_USAGE);
  }
  const kind = (match[1] ?? "").toLowerCase();
  const rest = (match[2] ?? "").trim();
  const tokenMatch = rest.match(/^(\S+)(?:\s+(\S+))?(?:\s+([\s\S]+))?$/);
  if (!tokenMatch) {
    throw new Error(RALPH_COMMAND_USAGE);
  }
  const first = (tokenMatch[1] ?? "").trim();
  const second = (tokenMatch[2] ?? "").trim() || undefined;
  const tail = (tokenMatch[3] ?? "").trim() || undefined;
  const firstKinds = await tokenKinds(ctx.cwd, first);
  const secondKinds = second ? await tokenKinds(ctx.cwd, second) : { ticket: false, plan: false };

  if (kind === "start") {
    if (firstKinds.ticket) {
      return {
        kind: "start",
        mode: "ticket",
        ticketRef: first,
        prompt: [second, tail].filter(Boolean).join(" ") || undefined,
      };
    }
    if (firstKinds.plan && secondKinds.ticket) {
      return { kind: "start", mode: "ticket", planRef: first, ticketRef: second, prompt: tail };
    }
    if (firstKinds.plan) {
      return {
        kind: "start",
        mode: "plan",
        planRef: first,
        prompt: [second, tail].filter(Boolean).join(" ") || undefined,
      };
    }
  }

  if (kind === "stop" || kind === "status") {
    if (firstKinds.ticket) {
      return { kind: kind as "stop" | "status", ticketRef: first };
    }
    if (firstKinds.plan && secondKinds.ticket && second) {
      return { kind: kind as "stop" | "status", planRef: first, ticketRef: second };
    }
  }

  if (kind === "steer") {
    if (firstKinds.ticket) {
      const text = [second, tail].filter(Boolean).join(" ").trim();
      if (!text) throw new Error(RALPH_COMMAND_USAGE);
      return { kind: "steer", ticketRef: first, text };
    }
    if (firstKinds.plan && secondKinds.ticket && second && tail) {
      return { kind: "steer", planRef: first, ticketRef: second, text: tail };
    }
  }

  throw new Error(RALPH_COMMAND_USAGE);
}

async function runTicketLoop(
  ctx: ExtensionCommandContext,
  input: { ticketRef: string; planRef?: string; prompt?: string },
): Promise<ExecuteRalphLoopResult | null> {
  const ticketStore = createTicketStore(ctx.cwd);
  let prompt = input.prompt;
  let lastResult: ExecuteRalphLoopResult | null = null;
  while (true) {
    const ticket = await ticketStore.readTicketAsync(input.ticketRef);
    if (ticket.summary.closed) {
      return lastResult;
    }
    const result = await executeRalphLoop(
      ctx,
      { ticketRef: input.ticketRef, planRef: input.planRef, prompt, iterations: 1 },
      undefined,
      {
        onUpdate: (update) => {
          const text = typeof update === "string" ? update : update.text;
          if (typeof ctx.ui?.setStatus === "function") {
            ctx.ui.setStatus(
              RALPH_STATUS_KEY,
              text.trim() ? `⏳ Ralph · ${text.trim()}` : `⏳ Ralph · ${input.ticketRef}`,
            );
          }
        },
      },
    );
    lastResult = result;
    prompt = undefined;
    const refreshed = await ticketStore.readTicketAsync(input.ticketRef);
    if (refreshed.summary.closed || result.run.state.status === "completed") {
      return result;
    }
    if (
      ["paused", "waiting_for_review", "halted", "failed"].includes(result.run.state.status) ||
      result.steps.length === 0
    ) {
      return result;
    }
  }
}

async function runPlanLoop(
  ctx: ExtensionCommandContext,
  input: { planRef: string; prompt?: string },
): Promise<ExecuteRalphLoopResult | null> {
  const planStore = createPlanStore(ctx.cwd);
  const ticketStore = createTicketStore(ctx.cwd);
  let promptByTicket = new Map<string, string>();
  if (input.prompt?.trim()) {
    const plan = await planStore.readPlan(input.planRef);
    promptByTicket = new Map(plan.state.linkedTickets.map((link) => [link.ticketId, input.prompt as string]));
  }
  let lastResult: ExecuteRalphLoopResult | null = null;

  while (true) {
    const plan = await planStore.readPlan(input.planRef);
    const openTickets: string[] = [];
    for (const link of plan.state.linkedTickets) {
      const ticket = await ticketStore.readTicketAsync(link.ticketId);
      if (!ticket.summary.closed) {
        openTickets.push(link.ticketId);
      }
    }
    if (openTickets.length === 0) {
      return lastResult;
    }

    let progressed = false;
    for (const ticketId of openTickets) {
      const result = await runTicketLoop(ctx, {
        planRef: input.planRef,
        ticketRef: ticketId,
        prompt: promptByTicket.get(ticketId),
      });
      promptByTicket.delete(ticketId);
      if (result) {
        lastResult = result;
        progressed = progressed || result.steps.length > 0;
      }
    }
    if (!progressed) {
      return lastResult;
    }
  }
}

export interface RalphCommandExecution {
  text: string;
  result: ExecuteRalphLoopResult | null;
  prompt: string | null;
}

export async function handleRalphCommand(args: string, ctx: ExtensionCommandContext): Promise<RalphCommandExecution> {
  await createRalphStore(ctx.cwd).initLedgerAsync();
  const parsed = await parseLoopArgs(args, ctx);

  switch (parsed.kind) {
    case "start": {
      const result =
        parsed.mode === "plan"
          ? await runPlanLoop(ctx, { planRef: parsed.planRef as string, prompt: parsed.prompt })
          : await runTicketLoop(ctx, {
              planRef: parsed.planRef,
              ticketRef: parsed.ticketRef as string,
              prompt: parsed.prompt,
            });
      if (typeof ctx.ui?.setStatus === "function") {
        ctx.ui.setStatus(RALPH_STATUS_KEY, undefined);
      }
      return {
        text: result?.run
          ? renderRalphDetail(result.run)
          : parsed.mode === "plan"
            ? `All tickets linked to plan ${parsed.planRef} are already complete.`
            : `Ticket ${parsed.ticketRef} is already complete.`,
        result,
        prompt: parsed.prompt ?? null,
      };
    }
    case "stop": {
      const stopped = await stopRalphLoop(ctx, parsed.ticketRef, parsed.planRef);
      if (typeof ctx.ui?.setStatus === "function") {
        ctx.ui.setStatus(RALPH_STATUS_KEY, undefined);
      }
      return {
        text:
          stopped.cancelledJobIds.length > 0
            ? `Requested stop for Ralph loop ${stopped.run.summary.id} and cancelled jobs ${stopped.cancelledJobIds.join(", ")}.`
            : `Requested stop for Ralph loop ${stopped.run.summary.id}.`,
        result: null,
        prompt: null,
      };
    }
    case "steer": {
      const target = await resolveTargetRalphRun(ctx, parsed.ticketRef, parsed.planRef);
      await createRalphStore(ctx.cwd).queueSteeringAsync(target.state.runId, parsed.text);
      return {
        text: `Queued steering for Ralph loop ${target.summary.id}.`,
        result: null,
        prompt: parsed.text,
      };
    }
    case "status": {
      const run = await resolveTargetRalphRun(ctx, parsed.ticketRef, parsed.planRef);
      return {
        text: renderRalphDetail(run),
        result: null,
        prompt: null,
      };
    }
  }
}
