import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { renderCritiqueDetail, renderDashboard, renderLaunchDescriptor, renderLaunchPrompt } from "../domain/render.js";
import { createCritiqueStore } from "../domain/store.js";

type CritiqueCommandTargetKind =
  | "ticket"
  | "spec"
  | "initiative"
  | "research"
  | "constitution"
  | "artifact"
  | "workspace";

function splitArgs(args: string): string[] {
  return args.trim().split(/\s+/).filter(Boolean);
}

function parseDoubleColonArgs(args: string): string[] {
  return args
    .split("::")
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseCreateArgs(args: string): {
  kind: CritiqueCommandTargetKind;
  ref: string;
  title: string;
  reviewQuestion?: string;
} {
  const [left, reviewQuestion] = parseDoubleColonArgs(args);
  const [kind, ref, ...titleParts] = splitArgs(left ?? "");
  if (!kind || !ref || titleParts.length === 0) {
    throw new Error("Usage: /critique create <target-kind> <target-ref> <title> [:: <review question>]");
  }
  return {
    kind: kind as CritiqueCommandTargetKind,
    ref,
    title: titleParts.join(" "),
    reviewQuestion,
  };
}

function parseRunArgs(args: string): { ref: string; kind: string; verdict: string; summary: string } {
  const [ref, kind, verdict, ...summaryParts] = splitArgs(args);
  if (!ref || !kind || !verdict || summaryParts.length === 0) {
    throw new Error("Usage: /critique run <critique> <kind> <verdict> <summary>");
  }
  return { ref, kind, verdict, summary: summaryParts.join(" ") };
}

function parseFindingCreateArgs(args: string): {
  ref: string;
  runId: string;
  kind: string;
  severity: string;
  title: string;
  summary: string;
  recommendedAction: string;
} {
  const [left, summary, recommendedAction] = parseDoubleColonArgs(args);
  const [ref, runId, kind, severity, ...titleParts] = splitArgs(left ?? "");
  if (!ref || !runId || !kind || !severity || titleParts.length === 0 || !summary || !recommendedAction) {
    throw new Error(
      "Usage: /critique finding <critique> create <run-id> <kind> <severity> <title> :: <summary> :: <recommended action>",
    );
  }
  return {
    ref,
    runId,
    kind,
    severity,
    title: titleParts.join(" "),
    summary,
    recommendedAction,
  };
}

export async function handleCritiqueCommand(args: string, ctx: ExtensionCommandContext): Promise<string> {
  const store = createCritiqueStore(ctx.cwd);
  const [subcommand, ...rest] = splitArgs(args);
  if (!subcommand) {
    return "Usage: /critique <init|create|list|show|packet|launch|run|finding|dashboard|ticketify|resolve>";
  }

  switch (subcommand) {
    case "init": {
      const result = store.initLedger();
      return `Initialized critique memory at ${result.root}`;
    }
    case "create": {
      const parsed = parseCreateArgs(rest.join(" "));
      return renderCritiqueDetail(
        store.createCritique({
          title: parsed.title,
          target: { kind: parsed.kind, ref: parsed.ref, path: null },
          reviewQuestion: parsed.reviewQuestion,
        }),
      );
    }
    case "list": {
      const critiques = store.listCritiques();
      return critiques.length > 0
        ? critiques
            .map((critique) => `${critique.id} [${critique.status}/${critique.verdict}] ${critique.title}`)
            .join("\n")
        : "No critiques.";
    }
    case "show": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /critique show <critique>");
      return renderCritiqueDetail(store.readCritique(ref));
    }
    case "packet": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /critique packet <critique>");
      return store.readCritique(ref).packet;
    }
    case "launch": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /critique launch <critique>");
      const result = store.launchCritique(ref);
      const newSessionResult = await ctx.newSession({
        parentSession: ctx.sessionManager.getSessionFile(),
      });
      if (!newSessionResult.cancelled) {
        ctx.ui.setEditorText(renderLaunchPrompt(ctx.cwd, result.launch));
        ctx.ui.notify("Fresh critique session ready. Submit when ready.", "info");
      }
      return renderLaunchDescriptor(ctx.cwd, result.launch);
    }
    case "run": {
      const parsed = parseRunArgs(rest.join(" "));
      return renderCritiqueDetail(
        store.recordRun(parsed.ref, {
          kind: parsed.kind as "adversarial",
          verdict: parsed.verdict as "concerns",
          summary: parsed.summary,
        }),
      );
    }
    case "finding": {
      const action = rest[1];
      if (!action) {
        throw new Error("Usage: /critique finding <critique> <create|update>");
      }
      if (action === "create") {
        const parsed = parseFindingCreateArgs([rest[0], ...rest.slice(2)].join(" "));
        return renderCritiqueDetail(
          store.addFinding(parsed.ref, {
            runId: parsed.runId,
            kind: parsed.kind as "bug",
            severity: parsed.severity as "medium",
            title: parsed.title,
            summary: parsed.summary,
            recommendedAction: parsed.recommendedAction,
          }),
        );
      }
      const [ref, , id, status] = rest;
      if (!ref || !id || !status) {
        throw new Error("Usage: /critique finding <critique> update <finding-id> <status>");
      }
      return renderCritiqueDetail(store.updateFinding(ref, { id, status: status as "open" }));
    }
    case "dashboard": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /critique dashboard <critique>");
      return renderDashboard(store.readCritique(ref).dashboard);
    }
    case "ticketify": {
      const [ref, findingId, ...titleParts] = rest;
      if (!ref || !findingId) {
        throw new Error("Usage: /critique ticketify <critique> <finding-id> [title]");
      }
      return renderCritiqueDetail(store.ticketifyFinding(ref, { findingId, title: titleParts.join(" ") || undefined }));
    }
    case "resolve": {
      const [ref] = rest;
      if (!ref) throw new Error("Usage: /critique resolve <critique>");
      return renderCritiqueDetail(store.resolveCritique(ref));
    }
    default:
      throw new Error(`Unknown /critique subcommand: ${subcommand}`);
  }
}
