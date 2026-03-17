import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type {
  ConstitutionalEntryInput,
  RoadmapItemInput,
  UpdateRoadmapInput,
  UpdateRoadmapItemInput,
} from "../domain/models.js";
import { CONSTITUTION_DECISION_KINDS } from "../domain/models.js";
import { renderConstitutionDashboard, renderConstitutionDetail, renderRoadmapItemDetail } from "../domain/render.js";
import { createConstitutionalStore } from "../domain/store.js";

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

function parseEntries(raw: string, kind: "principles" | "constraints"): ConstitutionalEntryInput[] {
  const chunks = raw
    .split(";;")
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  if (chunks.length === 0) {
    throw new Error(`Usage: /constitution update ${kind} <title> | <summary> [| <rationale>] [| <id>] [;; ...]`);
  }
  return chunks.map((chunk) => {
    const [title, summary, rationale, id] = chunk.split("|").map((part) => part.trim());
    if (!title || !summary) {
      throw new Error(`Usage: /constitution update ${kind} <title> | <summary> [| <rationale>] [| <id>] [;; ...]`);
    }
    return { title, summary, rationale, id };
  });
}

function parseRoadmapUpdate(parts: string[]): { itemId: string; updates: UpdateRoadmapItemInput } {
  const [itemId, ...pairs] = parts;
  if (!itemId || pairs.length === 0) {
    throw new Error("Usage: /constitution roadmap update <item-id> key=value ...");
  }
  const updates: UpdateRoadmapItemInput = { id: itemId };
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
        updates.status = value as UpdateRoadmapItemInput["status"];
        break;
      case "horizon":
        updates.horizon = value as UpdateRoadmapItemInput["horizon"];
        break;
      case "summary":
        updates.summary = value;
        break;
      case "rationale":
        updates.rationale = value;
        break;
      case "initiativeIds":
        updates.initiativeIds = parseList(value);
        break;
      case "researchIds":
        updates.researchIds = parseList(value);
        break;
      case "specChangeIds":
        updates.specChangeIds = parseList(value);
        break;
      default:
        throw new Error(`Unsupported roadmap update field: ${key}`);
    }
  }
  return { itemId, updates };
}

function parseRoadmapCreate(raw: string): RoadmapItemInput {
  const [title, summary, rationale, horizon, status] = parseDoubleColonArgs(raw);
  if (!title) {
    throw new Error(
      "Usage: /constitution roadmap add <title> [:: <summary>] [:: <rationale>] [:: <horizon>] [:: <status>]",
    );
  }
  return {
    title,
    summary,
    rationale,
    horizon: horizon as RoadmapItemInput["horizon"],
    status: status as RoadmapItemInput["status"],
  };
}

function parseDecision(raw: string): {
  kind: (typeof CONSTITUTION_DECISION_KINDS)[number];
  question: string;
  answer: string;
  affectedArtifacts: string[];
} {
  const [left, answer, affectedArtifacts] = parseDoubleColonArgs(raw);
  if (!left || !answer) {
    throw new Error(
      "Usage: /constitution decision [clarification|revision|roadmap_update|principle_update|constraint_update] <question> :: <answer> [:: <affected artifacts comma-separated>]",
    );
  }
  const [first, ...rest] = splitArgs(left);
  const maybeKind = CONSTITUTION_DECISION_KINDS.find((candidate) => candidate === first);
  const question = maybeKind ? rest.join(" ") : [first, ...rest].join(" ");
  if (!question.trim()) {
    throw new Error(
      "Usage: /constitution decision [clarification|revision|roadmap_update|principle_update|constraint_update] <question> :: <answer> [:: <affected artifacts comma-separated>]",
    );
  }
  return {
    kind: maybeKind ?? "clarification",
    question,
    answer,
    affectedArtifacts: affectedArtifacts ? parseList(affectedArtifacts) : [],
  };
}

export async function handleConstitutionCommand(args: string, ctx: ExtensionCommandContext): Promise<string> {
  const store = createConstitutionalStore(ctx.cwd);
  const [subcommand, ...rest] = splitArgs(args);
  if (!subcommand) {
    return "Usage: /constitution <init|show|update|roadmap|link-initiative|decision|brief|dashboard>";
  }

  switch (subcommand) {
    case "init": {
      const result = await store.initLedger();
      return `Initialized constitutional memory at ${result.root}`;
    }
    case "show": {
      const section = rest[0];
      const record = await store.readConstitution();
      switch (section) {
        case undefined:
        case "all":
          return renderConstitutionDetail(record);
        case "brief":
          return record.brief;
        case "vision":
          return record.vision;
        case "principles":
          return record.principles;
        case "constraints":
          return record.constraints;
        case "roadmap":
          return record.roadmap;
        case "dashboard":
          return renderConstitutionDashboard(record.dashboard);
        default:
          throw new Error("Usage: /constitution show [all|brief|vision|principles|constraints|roadmap|dashboard]");
      }
    }
    case "update": {
      const [section, ...payloadParts] = rest;
      const payload = payloadParts.join(" ").trim();
      if (!section || !payload) {
        throw new Error("Usage: /constitution update <vision|principles|constraints|roadmap> ...");
      }
      switch (section) {
        case "vision": {
          const [visionSummary, visionNarrative] = parseDoubleColonArgs(payload);
          return renderConstitutionDetail(await store.updateVision({ visionSummary, visionNarrative }));
        }
        case "principles": {
          return renderConstitutionDetail(await store.setPrinciples(parseEntries(payload, "principles")));
        }
        case "constraints": {
          return renderConstitutionDetail(await store.setConstraints(parseEntries(payload, "constraints")));
        }
        case "roadmap": {
          const [strategicDirectionSummary, currentFocusRaw, openQuestionsRaw] = parseDoubleColonArgs(payload);
          const updates: UpdateRoadmapInput = {
            strategicDirectionSummary,
            currentFocus: currentFocusRaw ? parseList(currentFocusRaw) : undefined,
            openConstitutionQuestions: openQuestionsRaw ? parseList(openQuestionsRaw) : undefined,
          };
          return renderConstitutionDetail(await store.updateRoadmap(updates));
        }
        default:
          throw new Error("Usage: /constitution update <vision|principles|constraints|roadmap> ...");
      }
    }
    case "roadmap": {
      const [roadmapCommand, ...roadmapArgs] = rest;
      if (!roadmapCommand) {
        throw new Error("Usage: /constitution roadmap <list|show|add|update>");
      }
      switch (roadmapCommand) {
        case "list": {
          const items = await store.listRoadmapItems();
          return items.length > 0 ? items.map(renderRoadmapItemDetail).join("\n\n") : "No roadmap items.";
        }
        case "show": {
          const itemId = roadmapArgs[0];
          if (!itemId) {
            throw new Error("Usage: /constitution roadmap show <item-id>");
          }
          return renderRoadmapItemDetail(await store.readRoadmapItem(itemId));
        }
        case "add": {
          return renderConstitutionDetail(await store.upsertRoadmapItem(parseRoadmapCreate(roadmapArgs.join(" "))));
        }
        case "update": {
          const { updates } = parseRoadmapUpdate(roadmapArgs);
          return renderConstitutionDetail(await store.upsertRoadmapItem(updates));
        }
        default:
          throw new Error("Usage: /constitution roadmap <list|show|add|update>");
      }
    }
    case "link-initiative": {
      const [itemId, initiativeId] = rest;
      if (!itemId || !initiativeId) {
        throw new Error("Usage: /constitution link-initiative <item-id> <initiative-id>");
      }
      return renderConstitutionDetail(await store.linkInitiative(itemId, initiativeId));
    }
    case "decision": {
      const { kind, question, answer, affectedArtifacts } = parseDecision(rest.join(" "));
      return renderConstitutionDetail(await store.recordDecision(question, answer, kind, affectedArtifacts));
    }
    case "brief": {
      return (await store.readConstitution()).brief;
    }
    case "dashboard": {
      return renderConstitutionDashboard((await store.readConstitution()).dashboard);
    }
    default:
      throw new Error(`Unknown /constitution subcommand: ${subcommand}`);
  }
}
