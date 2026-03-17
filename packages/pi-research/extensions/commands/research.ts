import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { ResearchArtifactInput, ResearchHypothesisInput, UpdateResearchInput } from "../domain/models.js";
import {
  renderResearchDashboard,
  renderResearchDetail,
  renderResearchMap,
  renderResearchSummary,
} from "../domain/render.js";
import { createResearchStore } from "../domain/store.js";

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

function parseUpdateArgs(parts: string[]): { ref: string; updates: UpdateResearchInput } {
  const [ref, ...pairs] = parts;
  if (!ref || pairs.length === 0) {
    throw new Error("Usage: /research update <ref> key=value ...");
  }
  const updates: UpdateResearchInput = {};
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
        updates.status = value as UpdateResearchInput["status"];
        break;
      case "question":
        updates.question = value;
        break;
      case "objective":
        updates.objective = value;
        break;
      case "statusSummary":
        updates.statusSummary = value;
        break;
      case "scope":
        updates.scope = parseList(value);
        break;
      case "nonGoals":
        updates.nonGoals = parseList(value);
        break;
      case "methodology":
        updates.methodology = parseList(value);
        break;
      case "keywords":
        updates.keywords = parseList(value);
        break;
      case "conclusions":
        updates.conclusions = parseList(value);
        break;
      case "recommendations":
        updates.recommendations = parseList(value);
        break;
      case "openQuestions":
        updates.openQuestions = parseList(value);
        break;
      case "initiativeIds":
        updates.initiativeIds = parseList(value);
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
      case "sourceRefs":
        updates.sourceRefs = parseList(value);
        break;
      case "supersedes":
        updates.supersedes = parseList(value);
        break;
      case "tags":
        updates.tags = parseList(value);
        break;
      default:
        throw new Error(`Unsupported update field: ${key}`);
    }
  }
  return { ref, updates };
}

function parseHypothesisArgs(args: string): { ref: string; input: ResearchHypothesisInput } {
  const [left, evidence, results, status, confidence] = parseDoubleColonArgs(args);
  if (!left) {
    throw new Error(
      "Usage: /research hypothesis <research> <statement> [:: <evidence comma-separated>] [:: <results comma-separated>] [:: <status>] [:: <confidence>]",
    );
  }
  const [ref, ...statementParts] = splitArgs(left);
  if (!ref || statementParts.length === 0) {
    throw new Error(
      "Usage: /research hypothesis <research> <statement> [:: <evidence comma-separated>] [:: <results comma-separated>] [:: <status>] [:: <confidence>]",
    );
  }
  return {
    ref,
    input: {
      statement: statementParts.join(" "),
      evidence: evidence ? parseList(evidence) : [],
      results: results ? parseList(results) : [],
      status: status as ResearchHypothesisInput["status"],
      confidence: confidence as ResearchHypothesisInput["confidence"],
    },
  };
}

function parseArtifactArgs(args: string): { ref: string; input: ResearchArtifactInput } {
  const [left, summary, body, sourceUri, linkedHypothesisIds] = parseDoubleColonArgs(args);
  if (!left) {
    throw new Error(
      "Usage: /research artifact <research> <kind> <title> [:: <summary>] [:: <body>] [:: <source uri>] [:: <linked hypothesis ids comma-separated>]",
    );
  }
  const [ref, kind, ...titleParts] = splitArgs(left);
  if (!ref || !kind || titleParts.length === 0) {
    throw new Error(
      "Usage: /research artifact <research> <kind> <title> [:: <summary>] [:: <body>] [:: <source uri>] [:: <linked hypothesis ids comma-separated>]",
    );
  }
  return {
    ref,
    input: {
      kind: kind as ResearchArtifactInput["kind"],
      title: titleParts.join(" "),
      summary,
      body,
      sourceUri,
      linkedHypothesisIds: linkedHypothesisIds ? parseList(linkedHypothesisIds) : [],
    },
  };
}

export async function handleResearchCommand(args: string, ctx: ExtensionCommandContext): Promise<string> {
  const store = createResearchStore(ctx.cwd);
  const [subcommand, ...rest] = splitArgs(args);
  if (!subcommand) {
    return "Usage: /research <init|create|list|show|update|hypothesis|artifact|dashboard|map|link-initiative|unlink-initiative|link-spec|unlink-spec|link-ticket|unlink-ticket|archive>";
  }

  switch (subcommand) {
    case "init": {
      const result = await store.initLedger();
      return `Initialized research memory at ${result.root}`;
    }
    case "create": {
      const title = rest.join(" ").trim();
      if (!title) throw new Error("Usage: /research create <title>");
      return renderResearchDetail(await store.createResearch({ title }));
    }
    case "list": {
      const status = rest[0] as UpdateResearchInput["status"] | undefined;
      const research = store.listResearch({ includeArchived: true, status });
      return research.length > 0 ? research.map(renderResearchSummary).join("\n") : "No research records.";
    }
    case "show": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /research show <research>");
      return renderResearchDetail(await store.readResearch(ref));
    }
    case "update": {
      const { ref, updates } = parseUpdateArgs(rest);
      return renderResearchDetail(await store.updateResearch(ref, updates));
    }
    case "hypothesis": {
      const { ref, input } = parseHypothesisArgs(rest.join(" "));
      return renderResearchDetail(await store.recordHypothesis(ref, input));
    }
    case "artifact": {
      const { ref, input } = parseArtifactArgs(rest.join(" "));
      return renderResearchDetail(await store.recordArtifact(ref, input));
    }
    case "dashboard": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /research dashboard <research>");
      return renderResearchDashboard((await store.readResearch(ref)).dashboard);
    }
    case "map": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /research map <research>");
      return renderResearchMap((await store.readResearch(ref)).map);
    }
    case "link-initiative": {
      const [ref, initiativeId] = rest;
      if (!ref || !initiativeId) throw new Error("Usage: /research link-initiative <research> <initiative>");
      return renderResearchDetail(await store.linkInitiative(ref, initiativeId));
    }
    case "unlink-initiative": {
      const [ref, initiativeId] = rest;
      if (!ref || !initiativeId) throw new Error("Usage: /research unlink-initiative <research> <initiative>");
      return renderResearchDetail(await store.unlinkInitiative(ref, initiativeId));
    }
    case "link-spec": {
      const [ref, changeId] = rest;
      if (!ref || !changeId) throw new Error("Usage: /research link-spec <research> <change>");
      return renderResearchDetail(await store.linkSpec(ref, changeId));
    }
    case "unlink-spec": {
      const [ref, changeId] = rest;
      if (!ref || !changeId) throw new Error("Usage: /research unlink-spec <research> <change>");
      return renderResearchDetail(await store.unlinkSpec(ref, changeId));
    }
    case "link-ticket": {
      const [ref, ticketId] = rest;
      if (!ref || !ticketId) throw new Error("Usage: /research link-ticket <research> <ticket>");
      return renderResearchDetail(await store.linkTicket(ref, ticketId));
    }
    case "unlink-ticket": {
      const [ref, ticketId] = rest;
      if (!ref || !ticketId) throw new Error("Usage: /research unlink-ticket <research> <ticket>");
      return renderResearchDetail(await store.unlinkTicket(ref, ticketId));
    }
    case "archive": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /research archive <research>");
      return renderResearchDetail(await store.archiveResearch(ref));
    }
    default:
      throw new Error(`Unknown /research subcommand: ${subcommand}`);
  }
}
