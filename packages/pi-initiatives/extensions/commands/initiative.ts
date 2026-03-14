import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { InitiativeMilestoneInput, UpdateInitiativeInput } from "../domain/models.js";
import { renderInitiativeDashboard, renderInitiativeDetail, renderInitiativeSummary } from "../domain/render.js";
import { createInitiativeStore } from "../domain/store.js";

function splitArgs(args: string): string[] {
  return args.trim().split(/\s+/).filter(Boolean);
}

function parseDoubleColonArgs(args: string): string[] {
  return args
    .split("::")
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseUpdateArgs(parts: string[]): { ref: string; updates: UpdateInitiativeInput } {
  const [ref, ...pairs] = parts;
  if (!ref || pairs.length === 0) {
    throw new Error("Usage: /initiative update <ref> key=value ...");
  }
  const updates: UpdateInitiativeInput = {};
  for (const pair of pairs) {
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex === -1) {
      throw new Error(`Invalid update pair: ${pair}`);
    }
    const key = pair.slice(0, separatorIndex);
    const value = pair.slice(separatorIndex + 1);
    switch (key) {
      case "title":
        updates.title = value;
        break;
      case "status":
        updates.status = value as UpdateInitiativeInput["status"];
        break;
      case "objective":
        updates.objective = value;
        break;
      case "statusSummary":
        updates.statusSummary = value;
        break;
      case "targetWindow":
        updates.targetWindow = value;
        break;
      case "outcomes":
        updates.outcomes = parseList(value);
        break;
      case "scope":
        updates.scope = parseList(value);
        break;
      case "nonGoals":
        updates.nonGoals = parseList(value);
        break;
      case "successMetrics":
        updates.successMetrics = parseList(value);
        break;
      case "risks":
        updates.risks = parseList(value);
        break;
      case "owners":
        updates.owners = parseList(value);
        break;
      case "tags":
        updates.tags = parseList(value);
        break;
      case "specChangeIds":
        updates.specChangeIds = parseList(value);
        break;
      case "ticketIds":
        updates.ticketIds = parseList(value);
        break;
      case "capabilityIds":
        updates.capabilityIds = parseList(value);
        break;
      case "supersedes":
        updates.supersedes = parseList(value);
        break;
      case "roadmapRefs":
        updates.roadmapRefs = parseList(value);
        break;
      default:
        throw new Error(`Unsupported update field: ${key}`);
    }
  }
  return { ref, updates };
}

function parseDecisionArgs(args: string): { ref: string; question: string; answer: string } {
  const [left, answer] = parseDoubleColonArgs(args);
  if (!left || !answer) {
    throw new Error("Usage: /initiative update <ref> or /initiative decision <ref> <question> :: <answer>");
  }
  const [ref, ...questionParts] = splitArgs(left);
  if (!ref || questionParts.length === 0) {
    throw new Error("Usage: /initiative decision <ref> <question> :: <answer>");
  }
  return { ref, question: questionParts.join(" "), answer };
}

function parseMilestoneArgs(args: string): { ref: string; input: InitiativeMilestoneInput } {
  const [left, description, specIdsRaw, ticketIdsRaw] = parseDoubleColonArgs(args);
  if (!left) {
    throw new Error(
      "Usage: /initiative milestone <initiative> <title> [:: <description>] [:: <spec ids comma-separated>] [:: <ticket ids comma-separated>]",
    );
  }
  const [ref, ...titleParts] = splitArgs(left);
  if (!ref || titleParts.length === 0) {
    throw new Error(
      "Usage: /initiative milestone <initiative> <title> [:: <description>] [:: <spec ids comma-separated>] [:: <ticket ids comma-separated>]",
    );
  }
  return {
    ref,
    input: {
      title: titleParts.join(" "),
      description,
      specChangeIds: specIdsRaw ? parseList(specIdsRaw) : [],
      ticketIds: ticketIdsRaw ? parseList(ticketIdsRaw) : [],
    },
  };
}

export async function handleInitiativeCommand(args: string, ctx: ExtensionCommandContext): Promise<string> {
  const store = createInitiativeStore(ctx.cwd);
  const [subcommand, ...rest] = splitArgs(args);
  if (!subcommand) {
    return "Usage: /initiative <init|create|list|show|update|decision|link-spec|unlink-spec|link-ticket|unlink-ticket|milestone|dashboard|archive>";
  }

  switch (subcommand) {
    case "init": {
      const result = store.initLedger();
      return `Initialized initiative memory at ${result.root}`;
    }
    case "create": {
      const title = rest.join(" ").trim();
      if (!title) throw new Error("Usage: /initiative create <title>");
      return renderInitiativeDetail(store.createInitiative({ title }));
    }
    case "list": {
      const status = rest[0] as UpdateInitiativeInput["status"] | undefined;
      const initiatives = store.listInitiatives({ includeArchived: true, status });
      return initiatives.length > 0 ? initiatives.map(renderInitiativeSummary).join("\n") : "No initiatives.";
    }
    case "show": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /initiative show <initiative>");
      return renderInitiativeDetail(store.readInitiative(ref));
    }
    case "update": {
      const { ref, updates } = parseUpdateArgs(rest);
      return renderInitiativeDetail(store.updateInitiative(ref, updates));
    }
    case "decision": {
      const { ref, question, answer } = parseDecisionArgs(rest.join(" "));
      return renderInitiativeDetail(store.recordDecision(ref, question, answer));
    }
    case "link-spec": {
      const [ref, specChangeId] = rest;
      if (!ref || !specChangeId) throw new Error("Usage: /initiative link-spec <initiative> <change>");
      return renderInitiativeDetail(store.linkSpec(ref, specChangeId));
    }
    case "unlink-spec": {
      const [ref, specChangeId] = rest;
      if (!ref || !specChangeId) throw new Error("Usage: /initiative unlink-spec <initiative> <change>");
      return renderInitiativeDetail(store.unlinkSpec(ref, specChangeId));
    }
    case "link-ticket": {
      const [ref, ticketId] = rest;
      if (!ref || !ticketId) throw new Error("Usage: /initiative link-ticket <initiative> <ticket>");
      return renderInitiativeDetail(store.linkTicket(ref, ticketId));
    }
    case "unlink-ticket": {
      const [ref, ticketId] = rest;
      if (!ref || !ticketId) throw new Error("Usage: /initiative unlink-ticket <initiative> <ticket>");
      return renderInitiativeDetail(store.unlinkTicket(ref, ticketId));
    }
    case "milestone": {
      const { ref, input } = parseMilestoneArgs(rest.join(" "));
      return renderInitiativeDetail(store.upsertMilestone(ref, input));
    }
    case "dashboard": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /initiative dashboard <initiative>");
      return renderInitiativeDashboard(store.readInitiative(ref).dashboard);
    }
    case "archive": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /initiative archive <initiative>");
      return renderInitiativeDetail(store.archiveInitiative(ref));
    }
    default:
      throw new Error(`Unknown /initiative subcommand: ${subcommand}`);
  }
}
