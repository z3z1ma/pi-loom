import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { ConsolidationStrategy } from "../domain/models.js";
import { createWorkerStore } from "../domain/store.js";

type ApprovalShortcut = "approve" | "reject" | "escalate";

type ConsolidationShortcut = "merge" | "cherry-pick" | "patch" | "conflicted" | "validation-failed" | "deferred";

function splitArgs(args: string): string[] {
  return args.trim().split(/\s+/).filter(Boolean);
}

function parseDoubleColonArgs(args: string): string[] {
  return args
    .split("::")
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseCreateArgs(args: string): { title: string; objective?: string; ticketIds: string[] } {
  const [left, objective, ticketsPart] = parseDoubleColonArgs(args);
  const title = left?.trim();
  if (!title) {
    throw new Error(
      "Usage: /worker create <title> [:: <objective>] [:: <ticket1> | <ticket2>] (workers require linked tickets)",
    );
  }
  const ticketIds = ticketsPart
    ? ticketsPart
        .split("|")
        .map((ticket) => ticket.trim())
        .filter(Boolean)
    : [];
  return { title, objective, ticketIds };
}

function parseMessageArgs(args: string): { ref: string; direction: string; kind: string; text: string } {
  const [left, text] = parseDoubleColonArgs(args);
  const [ref, direction, kind] = splitArgs(left ?? "");
  if (!ref || !direction || !kind || !text) {
    throw new Error("Usage: /worker message <worker> <direction> <kind> :: <text>");
  }
  return { ref, direction, kind, text };
}

function parseMessageStateArgs(args: string): { ref: string; messageId: string; note?: string } {
  const [left, note] = parseDoubleColonArgs(args);
  const [ref, messageId] = splitArgs(left ?? "");
  if (!ref || !messageId) {
    throw new Error("Usage: /worker <ack|resolve> <worker> <message-id> [:: <note>]");
  }
  return { ref, messageId, note };
}

function parseCheckpointArgs(args: string): {
  ref: string;
  summary?: string;
  understanding?: string;
  blockers: string[];
  nextAction?: string;
} {
  const [left, understanding, blockersPart, nextAction] = parseDoubleColonArgs(args);
  const [ref, ...summaryParts] = splitArgs(left ?? "");
  if (!ref) {
    throw new Error(
      "Usage: /worker checkpoint <worker> [summary] [:: <understanding>] [:: <blocker1> | <blocker2>] [:: <next-action>]",
    );
  }
  return {
    ref,
    summary: summaryParts.join(" ").trim() || undefined,
    understanding,
    blockers: blockersPart
      ? blockersPart
          .split("|")
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [],
    nextAction,
  };
}

function parseCompletionArgs(args: string): { ref: string; summary?: string; validation: string[]; risks: string[] } {
  const [left, summary, validationPart, riskPart] = parseDoubleColonArgs(args);
  const [ref] = splitArgs(left ?? "");
  if (!ref) {
    throw new Error(
      "Usage: /worker complete <worker> [:: <summary>] [:: <validation1> | <validation2>] [:: <risk1> | <risk2>]",
    );
  }
  return {
    ref,
    summary,
    validation: validationPart
      ? validationPart
          .split("|")
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [],
    risks: riskPart
      ? riskPart
          .split("|")
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [],
  };
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
      "Usage: /worker approve <worker> <approve|reject|escalate> [:: <summary>] [:: <rationale1> | <rationale2>]",
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

function parseConsolidationArgs(args: string): {
  ref: string;
  status: ConsolidationShortcut;
  summary?: string;
  validation: string[];
  conflicts: string[];
} {
  const [left, summary, validationPart, conflictPart] = parseDoubleColonArgs(args);
  const [ref, status] = splitArgs(left ?? "");
  if (!ref || !status) {
    throw new Error(
      "Usage: /worker consolidate <worker> <merge|cherry-pick|patch|conflicted|validation-failed|deferred> [:: <summary>] [:: <validation1> | <validation2>] [:: <conflict1> | <conflict2>]",
    );
  }
  return {
    ref,
    status: status as ConsolidationShortcut,
    summary,
    validation: validationPart
      ? validationPart
          .split("|")
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [],
    conflicts: conflictPart
      ? conflictPart
          .split("|")
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [],
  };
}

export async function handleWorkerCommand(args: string, _ctx: ExtensionCommandContext): Promise<string> {
  const store = createWorkerStore(_ctx.cwd);
  const [subcommand, ...rest] = splitArgs(args);
  if (!subcommand) {
    return "Usage: /worker <init|create|list|show|dashboard|inbox|message|ack|resolve|checkpoint|complete|approve|supervise|launch|resume|consolidate|retire>";
  }

  switch (subcommand) {
    case "init": {
      const result = await store.initLedgerAsync();
      return `Initialized worker memory at ${result.root}`;
    }
    case "create": {
      const parsed = parseCreateArgs(rest.join(" "));
      const created = await store.createWorkerAsync({
        title: parsed.title,
        objective: parsed.objective,
        linkedRefs: { ticketIds: parsed.ticketIds },
      });
      return store.renderDetailAsync(created.state.workerId);
    }
    case "list":
      return store.renderListAsync();
    case "show": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /worker show <worker>");
      return store.renderDetailAsync(ref);
    }
    case "dashboard": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /worker dashboard <worker>");
      return store.renderDashboardAsync(ref);
    }
    case "inbox": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /worker inbox <worker>");
      return JSON.stringify(await store.readInboxAsync(ref), null, 2);
    }
    case "message": {
      const parsed = parseMessageArgs(rest.join(" "));
      await store.appendMessageAsync(parsed.ref, {
        direction: parsed.direction as never,
        kind: parsed.kind as never,
        text: parsed.text,
      });
      return store.renderDetailAsync(parsed.ref);
    }
    case "ack": {
      const parsed = parseMessageStateArgs(rest.join(" "));
      await store.acknowledgeMessageAsync(parsed.ref, parsed.messageId, "worker", parsed.note);
      return store.renderDetailAsync(parsed.ref);
    }
    case "resolve": {
      const parsed = parseMessageStateArgs(rest.join(" "));
      await store.resolveMessageAsync(parsed.ref, parsed.messageId, "worker", parsed.note);
      return store.renderDetailAsync(parsed.ref);
    }
    case "checkpoint": {
      const parsed = parseCheckpointArgs(rest.join(" "));
      await store.appendCheckpointAsync(parsed.ref, {
        summary: parsed.summary,
        understanding: parsed.understanding,
        blockers: parsed.blockers,
        nextAction: parsed.nextAction,
        managerInputRequired: parsed.blockers.length > 0,
      });
      return store.renderDetailAsync(parsed.ref);
    }
    case "complete": {
      const parsed = parseCompletionArgs(rest.join(" "));
      await store.requestCompletionAsync(parsed.ref, {
        summary: parsed.summary,
        validationEvidence: parsed.validation,
        remainingRisks: parsed.risks,
      });
      return store.renderDetailAsync(parsed.ref);
    }
    case "approve": {
      const parsed = parseApprovalArgs(rest.join(" "));
      const mapped =
        parsed.status === "approve" ? "approved" : parsed.status === "reject" ? "rejected_for_revision" : "escalated";
      await store.decideApprovalAsync(parsed.ref, {
        status: mapped,
        summary: parsed.summary,
        rationale: parsed.rationale,
      });
      return store.renderDetailAsync(parsed.ref);
    }
    case "supervise": {
      const ref = rest[0];
      const apply = rest.includes("apply");
      if (!ref) throw new Error("Usage: /worker supervise <worker> [apply]");
      const result = store.superviseWorker(ref, apply);
      return [
        `Action: ${result.decision.action}`,
        `Confidence: ${result.decision.confidence}`,
        `Reasoning: ${result.decision.reasoning}`,
        result.decision.message ? `Message: ${result.decision.message}` : "Message: (none)",
        result.decision.evidence.length > 0 ? `Evidence: ${result.decision.evidence.join(" | ")}` : "Evidence: (none)",
      ].join("\n");
    }
    case "launch": {
      const ref = rest[0];
      const runtime = rest[1] as "subprocess" | "sdk" | "rpc" | undefined;
      if (!ref) throw new Error("Usage: /worker launch <worker> [subprocess|sdk|rpc] (default: sdk)");
      await store.prepareLaunchAsync(ref, false, "Interactive launch prepared via command surface.", runtime);
      return store.renderLaunchAsync(ref);
    }
    case "resume": {
      const ref = rest[0];
      const runtime = rest[1] as "subprocess" | "sdk" | "rpc" | undefined;
      if (!ref) throw new Error("Usage: /worker resume <worker> [subprocess|sdk|rpc] (default: sdk)");
      await store.prepareLaunchAsync(ref, true, "Interactive resume prepared via command surface.", runtime);
      return store.renderLaunchAsync(ref);
    }
    case "consolidate": {
      const parsed = parseConsolidationArgs(rest.join(" "));
      const statusMap: Record<
        ConsolidationShortcut,
        {
          status: "merged" | "cherry_picked" | "patched" | "conflicted" | "validation_failed" | "deferred";
          strategy: ConsolidationStrategy;
        }
      > = {
        merge: { status: "merged", strategy: "merge" },
        "cherry-pick": { status: "cherry_picked", strategy: "cherry-pick" },
        patch: { status: "patched", strategy: "patch" },
        conflicted: { status: "conflicted", strategy: "merge" },
        "validation-failed": { status: "validation_failed", strategy: "merge" },
        deferred: { status: "deferred", strategy: "manual" },
      };
      await store.recordConsolidationAsync(parsed.ref, {
        ...statusMap[parsed.status],
        summary: parsed.summary,
        validation: parsed.validation,
        conflicts: parsed.conflicts,
      });
      return store.renderDetailAsync(parsed.ref);
    }
    case "retire": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /worker retire <worker>");
      await store.retireWorkerAsync(ref, "Retired via command surface.");
      return store.renderDetailAsync(ref);
    }
    default:
      throw new Error(`Unknown /worker subcommand: ${subcommand}`);
  }
}
