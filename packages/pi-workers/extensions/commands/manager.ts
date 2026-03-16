import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { renderManagerOverview } from "../domain/render.js";
import { runWorkerLaunch } from "../domain/runtime.js";
import { createWorkerStore } from "../domain/store.js";

type ApprovalShortcut = "approve" | "reject" | "escalate";

type ResumeShortcut = "prepare" | "run";
type RuntimeShortcut = "subprocess" | "sdk" | "rpc";

function splitArgs(args: string): string[] {
  return args.trim().split(/\s+/).filter(Boolean);
}

function parseDoubleColonArgs(args: string): string[] {
  return args
    .split("::")
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseMessageArgs(args: string): { ref: string; kind: string; text: string } {
  const [left, text] = parseDoubleColonArgs(args);
  const [ref, kind] = splitArgs(left ?? "");
  if (!ref || !kind || !text) {
    throw new Error("Usage: /manager message <worker> <kind> :: <text>");
  }
  return { ref, kind, text };
}

function parseMessageStateArgs(args: string): { ref: string; messageId: string; note?: string } {
  const [left, note] = parseDoubleColonArgs(args);
  const [ref, messageId] = splitArgs(left ?? "");
  if (!ref || !messageId) {
    throw new Error("Usage: /manager <ack|resolve> <worker> <message-id> [:: <note>]");
  }
  return { ref, messageId, note };
}

function parseApprovalArgs(args: string): {
  ref: string;
  status: ApprovalShortcut;
  summary?: string;
  rationale: string[];
} {
  const [left, summary, rationalePart] = parseDoubleColonArgs(args);
  const [ref, status] = splitArgs(left ?? "");
  if (!ref || !status) {
    throw new Error(
      "Usage: /manager approve <worker> <approve|reject|escalate> [:: <summary>] [:: <rationale1> | <rationale2>]",
    );
  }
  return {
    ref,
    status: status as ApprovalShortcut,
    summary,
    rationale: rationalePart
      ? rationalePart
          .split("|")
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [],
  };
}

function parseResumeArgs(args: string): { ref: string; mode: ResumeShortcut; runtime?: RuntimeShortcut } {
  const [ref, mode, runtime] = splitArgs(args);
  if (!ref) {
    throw new Error("Usage: /manager resume <worker> [prepare|run] [subprocess|sdk|rpc]");
  }
  return {
    ref,
    mode: (mode as ResumeShortcut | undefined) ?? "prepare",
    runtime: runtime as RuntimeShortcut | undefined,
  };
}

export async function handleManagerCommand(args: string, _ctx: ExtensionCommandContext): Promise<string> {
  const store = createWorkerStore(_ctx.cwd);
  const [subcommand, ...rest] = splitArgs(args);
  if (!subcommand) {
    return "Usage: /manager <overview|supervise|message|ack|resolve|approve|resume|schedule>";
  }

  switch (subcommand) {
    case "overview":
      return renderManagerOverview(store.managerOverview());
    case "supervise": {
      const apply = rest.includes("apply");
      const refs = rest.filter((part) => part !== "apply");
      const results = store.superviseWorkers(refs, apply);
      return results
        .map(
          (result) =>
            `${result.ref}: ${result.decision.action} (${result.decision.confidence})${result.decision.message ? ` — ${result.decision.message}` : ""}`,
        )
        .join("\n");
    }
    case "message": {
      const parsed = parseMessageArgs(rest.join(" "));
      store.appendMessage(parsed.ref, {
        direction: "manager_to_worker",
        kind: parsed.kind as never,
        text: parsed.text,
      });
      return store.renderDetail(parsed.ref);
    }
    case "ack": {
      const parsed = parseMessageStateArgs(rest.join(" "));
      store.acknowledgeMessage(parsed.ref, parsed.messageId, "manager", parsed.note);
      return store.renderDetail(parsed.ref);
    }
    case "resolve": {
      const parsed = parseMessageStateArgs(rest.join(" "));
      store.resolveMessage(parsed.ref, parsed.messageId, "manager", parsed.note);
      return store.renderDetail(parsed.ref);
    }
    case "approve": {
      const parsed = parseApprovalArgs(rest.join(" "));
      const mapped =
        parsed.status === "approve" ? "approved" : parsed.status === "reject" ? "rejected_for_revision" : "escalated";
      store.decideApproval(parsed.ref, {
        status: mapped,
        summary: parsed.summary,
        rationale: parsed.rationale,
        decidedBy: "manager",
      });
      return store.renderDetail(parsed.ref);
    }
    case "resume": {
      const parsed = parseResumeArgs(rest.join(" "));
      store.prepareLaunch(parsed.ref, true, "Prepared by manager surface.", parsed.runtime);
      if (parsed.mode === "run") {
        const running = store.startLaunchExecution(parsed.ref);
        if (!running.launch) {
          throw new Error("Worker launch descriptor was not created");
        }
        const execution = await runWorkerLaunch(running.launch);
        store.finishLaunchExecution(parsed.ref, execution);
        return `${store.renderLaunch(parsed.ref)}\n\nExecution: ${execution.status}\n${execution.output || execution.error || ""}`.trim();
      }
      return store.renderLaunch(parsed.ref);
    }
    case "schedule": {
      const apply = rest.includes("apply");
      const executeResumes = rest.includes("run");
      const refs = rest.filter((part) => part !== "apply" && part !== "run");
      const results = await store.runManagerSchedulerPass({ refs, apply, executeResumes });
      return results
        .map(
          (result) => `${result.workerId}: ${result.action}${result.applied ? " [applied]" : ""} — ${result.summary}`,
        )
        .join("\n");
    }
    default:
      throw new Error(`Unknown /manager subcommand: ${subcommand}`);
  }
}
