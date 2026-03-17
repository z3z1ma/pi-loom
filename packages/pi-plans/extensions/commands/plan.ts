import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { renderDashboard, renderPlanDetail, renderPlanSummary } from "../domain/render.js";
import { createPlanStore } from "../domain/store.js";

type PlanSourceKind = "workspace" | "initiative" | "spec" | "research";

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
  sourceKind: PlanSourceKind;
  sourceRef: string;
  title: string;
  summary?: string;
  planOfWork?: string;
} {
  const [left, summary, planOfWork] = parseDoubleColonArgs(args);
  const [sourceKind, sourceRef, ...titleParts] = splitArgs(left ?? "");
  if (!sourceKind || !sourceRef || titleParts.length === 0) {
    throw new Error(
      "Usage: /workplan create <workspace|initiative|spec|research> <ref> <title> [:: <summary>] [:: <plan of work>]",
    );
  }
  return {
    sourceKind: sourceKind as PlanSourceKind,
    sourceRef,
    title: titleParts.join(" "),
    summary,
    planOfWork,
  };
}

function parseUpdateArgs(args: string): {
  ref: string;
  purpose?: string;
  planOfWork?: string;
  validation?: string;
} {
  const [left, purpose, planOfWork, validation] = parseDoubleColonArgs(args);
  const [ref] = splitArgs(left ?? "");
  if (!ref) {
    throw new Error("Usage: /workplan update <plan> [:: <purpose>] [:: <plan of work>] [:: <validation>]");
  }
  return { ref, purpose, planOfWork, validation };
}

export async function handleWorkplanCommand(args: string, ctx: ExtensionCommandContext): Promise<string> {
  const store = createPlanStore(ctx.cwd);
  const [subcommand, ...rest] = splitArgs(args);
  if (!subcommand) {
    return "Usage: /workplan <init|create|list|show|packet|update|link-ticket|unlink-ticket|dashboard|archive>";
  }

  switch (subcommand) {
    case "init": {
      const result = await store.initLedger();
      return `Initialized plan memory at ${result.root}`;
    }
    case "create": {
      const parsed = parseCreateArgs(rest.join(" "));
      return renderPlanDetail(
        await store.createPlan({
          title: parsed.title,
          summary: parsed.summary,
          purpose: parsed.summary,
          planOfWork: parsed.planOfWork,
          sourceTarget: { kind: parsed.sourceKind, ref: parsed.sourceRef },
        }),
      );
    }
    case "list": {
      const plans = await store.listPlans();
      return plans.length > 0 ? plans.map(renderPlanSummary).join("\n") : "No plans.";
    }
    case "show": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /workplan show <plan>");
      return renderPlanDetail(await store.readPlan(ref));
    }
    case "packet": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /workplan packet <plan>");
      return (await store.readPlan(ref)).packet;
    }
    case "update": {
      const parsed = parseUpdateArgs(rest.join(" "));
      return renderPlanDetail(
        await store.updatePlan(parsed.ref, {
          summary: parsed.purpose,
          purpose: parsed.purpose,
          planOfWork: parsed.planOfWork,
          validation: parsed.validation,
        }),
      );
    }
    case "link-ticket": {
      const [ref, ticketRef, ...roleParts] = rest;
      if (!ref || !ticketRef) {
        throw new Error("Usage: /workplan link-ticket <plan> <ticket> [role]");
      }
      return renderPlanDetail(
        await store.linkPlanTicket(ref, { ticketId: ticketRef, role: roleParts.join(" ") || undefined }),
      );
    }
    case "unlink-ticket": {
      const [ref, ticketRef] = rest;
      if (!ref || !ticketRef) {
        throw new Error("Usage: /workplan unlink-ticket <plan> <ticket>");
      }
      return renderPlanDetail(await store.unlinkPlanTicket(ref, ticketRef));
    }
    case "dashboard": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /workplan dashboard <plan>");
      return renderDashboard((await store.readPlan(ref)).dashboard);
    }
    case "archive": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /workplan archive <plan>");
      return renderPlanDetail(await store.archivePlan(ref));
    }
    default:
      throw new Error(`Unknown /workplan subcommand: ${subcommand}`);
  }
}
