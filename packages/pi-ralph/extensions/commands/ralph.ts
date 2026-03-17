import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { renderDashboard, renderLaunchDescriptor, renderLaunchPrompt, renderRalphDetail } from "../domain/render.js";
import { createRalphStore } from "../domain/store.js";

type RalphDecisionShortcut = "worker-done" | "stop" | "timeout" | "budget" | "runtime-failure" | "runtime-unavailable";

function splitArgs(args: string): string[] {
  return args.trim().split(/\s+/).filter(Boolean);
}

function parseDoubleColonArgs(args: string): string[] {
  return args
    .split("::")
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseCreateArgs(args: string): { title: string; objective?: string } {
  const [title, objective] = parseDoubleColonArgs(args);
  if (!title) {
    throw new Error("Usage: /ralph create <title> [:: <objective>]");
  }
  return { title, objective };
}

function parseUpdateArgs(args: string): { ref: string; summary?: string; objective?: string } {
  const [left, summary, objective] = parseDoubleColonArgs(args);
  const [ref] = splitArgs(left ?? "");
  if (!ref) {
    throw new Error("Usage: /ralph update <run> [:: <summary>] [:: <objective>]");
  }
  return { ref, summary, objective };
}

function parseIterationArgs(args: string): { ref: string; status: string; focus: string; summary?: string } {
  const [left, summary] = parseDoubleColonArgs(args);
  const [ref, status, ...focusParts] = splitArgs(left ?? "");
  if (!ref || !status || focusParts.length === 0) {
    throw new Error("Usage: /ralph iteration <run> <status> <focus> [:: <summary>]");
  }
  return { ref, status, focus: focusParts.join(" "), summary };
}

function parseVerifierArgs(args: string): {
  ref: string;
  sourceKind: string;
  sourceRef: string;
  verdict: string;
  summary: string;
  evidence: string[];
} {
  const [left, summary, evidencePart] = parseDoubleColonArgs(args);
  const [ref, sourceKind, sourceRef, verdict] = splitArgs(left ?? "");
  if (!ref || !sourceKind || !sourceRef || !verdict || !summary) {
    throw new Error(
      "Usage: /ralph verifier <run> <source-kind> <source-ref> <verdict> :: <summary> [:: <evidence1> | <evidence2>]",
    );
  }
  return {
    ref,
    sourceKind,
    sourceRef,
    verdict,
    summary,
    evidence: evidencePart
      ? evidencePart
          .split("|")
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [],
  };
}

function parseCritiqueArgs(args: string): {
  ref: string;
  critiqueId: string;
  kind: string;
  verdict: string | null;
  summary: string;
  findingIds: string[];
} {
  const [left, summary, findingIdsPart] = parseDoubleColonArgs(args);
  const [ref, critiqueId, kind, verdict] = splitArgs(left ?? "");
  if (!ref || !critiqueId || !kind || !summary) {
    throw new Error(
      "Usage: /ralph critique <run> <critique-id> <kind> [verdict] :: <summary> [:: <finding1> | <finding2>]",
    );
  }
  return {
    ref,
    critiqueId,
    kind,
    verdict: verdict ?? null,
    summary,
    findingIds: findingIdsPart
      ? findingIdsPart
          .split("|")
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [],
  };
}

function parseDecisionArgs(args: string): { ref: string; shortcut: RalphDecisionShortcut; summary?: string } {
  const [left, summary] = parseDoubleColonArgs(args);
  const [ref, shortcut] = splitArgs(left ?? "");
  if (!ref || !shortcut) {
    throw new Error(
      "Usage: /ralph decide <run> <worker-done|stop|timeout|budget|runtime-failure|runtime-unavailable> [:: <summary>]",
    );
  }
  return { ref, shortcut: shortcut as RalphDecisionShortcut, summary };
}

export async function handleRalphCommand(args: string, ctx: ExtensionCommandContext): Promise<string> {
  const store = createRalphStore(ctx.cwd);
  const [subcommand, ...rest] = splitArgs(args);
  if (!subcommand) {
    return "Usage: /ralph <init|create|list|show|packet|update|iteration|verifier|critique|decide|launch|resume|dashboard|archive>";
  }

  switch (subcommand) {
    case "init": {
      const result = await store.initLedgerAsync();
      return `Initialized Ralph memory at ${result.root}`;
    }
    case "create": {
      const parsed = parseCreateArgs(rest.join(" "));
      return renderRalphDetail(await store.createRunAsync({ title: parsed.title, objective: parsed.objective }));
    }
    case "list": {
      const runs = await store.listRunsAsync();
      return runs.length > 0
        ? runs.map((run) => `${run.id} [${run.status}/${run.phase}] ${run.title}`).join("\n")
        : "No Ralph runs.";
    }
    case "show": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /ralph show <run>");
      return renderRalphDetail(await store.readRunAsync(ref));
    }
    case "packet": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /ralph packet <run>");
      return (await store.readRunAsync(ref)).packet;
    }
    case "update": {
      const parsed = parseUpdateArgs(rest.join(" "));
      return renderRalphDetail(await store.updateRunAsync(parsed.ref, { summary: parsed.summary, objective: parsed.objective }));
    }
    case "iteration": {
      const parsed = parseIterationArgs(rest.join(" "));
      return renderRalphDetail(
        await store.appendIterationAsync(parsed.ref, {
          status: parsed.status as never,
          focus: parsed.focus,
          summary: parsed.summary,
        }),
      );
    }
    case "verifier": {
      const parsed = parseVerifierArgs(rest.join(" "));
      return renderRalphDetail(
        await store.setVerifierAsync(parsed.ref, {
          sourceKind: parsed.sourceKind as never,
          sourceRef: parsed.sourceRef,
          verdict: parsed.verdict as never,
          summary: parsed.summary,
          evidence: parsed.evidence,
        }),
      );
    }
    case "critique": {
      const parsed = parseCritiqueArgs(rest.join(" "));
      return renderRalphDetail(
        await store.linkCritiqueAsync(parsed.ref, {
          critiqueId: parsed.critiqueId,
          kind: parsed.kind as never,
          verdict: parsed.verdict as never,
          summary: parsed.summary,
          findingIds: parsed.findingIds,
        }),
      );
    }
    case "decide": {
      const parsed = parseDecisionArgs(rest.join(" "));
      return renderRalphDetail(
        await store.decideRunAsync(parsed.ref, {
          workerRequestedCompletion: parsed.shortcut === "worker-done",
          operatorRequestedStop: parsed.shortcut === "stop",
          timeoutExceeded: parsed.shortcut === "timeout",
          budgetExceeded: parsed.shortcut === "budget",
          runtimeFailure: parsed.shortcut === "runtime-failure",
          runtimeUnavailable: parsed.shortcut === "runtime-unavailable",
          summary: parsed.summary,
        }),
      );
    }
    case "launch": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /ralph launch <run>");
      const previous = await store.readRunAsync(ref);
      const result = await store.prepareLaunchAsync(ref);
      const newSessionResult = await ctx.newSession({ parentSession: ctx.sessionManager.getSessionFile() });
      if (!newSessionResult.cancelled) {
        ctx.ui.setEditorText(renderLaunchPrompt(ctx.cwd, result.launch));
        ctx.ui.notify("Fresh Ralph session ready. Submit when ready.", "info");
      } else {
        await store.cancelLaunchAsync(ref, previous.state, result.launch.iterationId, "Interactive Ralph launch was cancelled.");
        return `Cancelled Ralph launch for ${ref}.`;
      }
      return renderLaunchDescriptor(ctx.cwd, result.launch);
    }
    case "resume": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /ralph resume <run>");
      const previous = await store.readRunAsync(ref);
      const result = await store.resumeRunAsync(ref);
      const newSessionResult = await ctx.newSession({ parentSession: ctx.sessionManager.getSessionFile() });
      if (!newSessionResult.cancelled) {
        ctx.ui.setEditorText(renderLaunchPrompt(ctx.cwd, result.launch));
        ctx.ui.notify("Fresh Ralph resume session ready. Submit when ready.", "info");
      } else {
        await store.cancelLaunchAsync(ref, previous.state, result.launch.iterationId, "Interactive Ralph resume was cancelled.");
        return `Cancelled Ralph resume for ${ref}.`;
      }
      return renderLaunchDescriptor(ctx.cwd, result.launch);
    }
    case "dashboard": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /ralph dashboard <run>");
      return renderDashboard((await store.readRunAsync(ref)).dashboard);
    }
    case "archive": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /ralph archive <run>");
      return renderRalphDetail(await store.archiveRunAsync(ref));
    }
    default:
      throw new Error(`Unknown /ralph subcommand: ${subcommand}`);
  }
}
