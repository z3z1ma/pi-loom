import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { SpecPlanInput, SpecTasksInput } from "../domain/models.js";
import { syncSpecTickets } from "../domain/ticket-sync.js";
import { renderCapabilityDetail, renderSpecDetail, renderSpecSummary } from "../domain/render.js";
import { createSpecStore } from "../domain/store.js";

function splitArgs(args: string): string[] {
  return args.trim().split(/\s+/).filter(Boolean);
}

function parseDoubleColonArgs(args: string): string[] {
  return args
    .split("::")
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseClarifyArgs(args: string): { ref: string; question: string; answer: string } {
  const [left, answer] = parseDoubleColonArgs(args);
  if (!left || !answer) {
    throw new Error("Usage: /spec clarify <change> <question> :: <answer>");
  }
  const [ref, ...questionParts] = splitArgs(left);
  if (!ref || questionParts.length === 0) {
    throw new Error("Usage: /spec clarify <change> <question> :: <answer>");
  }
  return { ref, question: questionParts.join(" "), answer };
}

function parsePlanArgs(args: string): { ref: string; input: SpecPlanInput } {
  const [left, requirementsPart, designNotes] = parseDoubleColonArgs(args);
  if (!left || !requirementsPart) {
    throw new Error(
      "Usage: /spec plan <change> <capability title> :: <requirement 1> | <requirement 2> [:: <design notes>]",
    );
  }
  const [ref, ...capabilityTitleParts] = splitArgs(left);
  if (!ref || capabilityTitleParts.length === 0) {
    throw new Error(
      "Usage: /spec plan <change> <capability title> :: <requirement 1> | <requirement 2> [:: <design notes>]",
    );
  }
  return {
    ref,
    input: {
      designNotes,
      capabilities: [
        {
          title: capabilityTitleParts.join(" "),
          requirements: requirementsPart
            .split("|")
            .map((entry) => entry.trim())
            .filter(Boolean),
        },
      ],
    },
  };
}

function parseTasksArgs(args: string): { ref: string; input: SpecTasksInput } {
  const [left, requirementsPart, dependenciesPart, summaryPart] = parseDoubleColonArgs(args);
  if (!left || !requirementsPart) {
    throw new Error(
      "Usage: /spec tasks <change> <task title> :: <requirement ids comma-separated> [:: <dependency task ids comma-separated>] [:: <summary>]",
    );
  }
  const [ref, ...taskTitleParts] = splitArgs(left);
  if (!ref || taskTitleParts.length === 0) {
    throw new Error(
      "Usage: /spec tasks <change> <task title> :: <requirement ids comma-separated> [:: <dependency task ids comma-separated>] [:: <summary>]",
    );
  }
  return {
    ref,
    input: {
      tasks: [
        {
          title: taskTitleParts.join(" "),
          requirements: requirementsPart
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean),
          deps:
            dependenciesPart
              ?.split(",")
              .map((entry) => entry.trim())
              .filter(Boolean) ?? [],
          summary: summaryPart,
        },
      ],
    },
  };
}

export async function handleSpecCommand(args: string, ctx: ExtensionCommandContext): Promise<string> {
  const store = createSpecStore(ctx.cwd);
  const [subcommand, ...rest] = splitArgs(args);
  if (!subcommand) {
    return "Usage: /spec <init|propose|list|show|clarify|plan|tasks|analyze|checklist|finalize|tickets|archive>";
  }

  switch (subcommand) {
    case "init": {
      const result = await store.initLedger();
      return `Initialized spec memory at ${result.root}`;
    }
    case "propose": {
      const title = rest.join(" ").trim();
      if (!title) throw new Error("Usage: /spec propose <title>");
      return renderSpecDetail(await store.createChange({ title }));
    }
    case "list": {
      const changes = await store.listChanges({ includeArchived: true });
      return changes.length > 0 ? changes.map(renderSpecSummary).join("\n") : "No spec changes.";
    }
    case "show": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /spec show <change-or-capability>");
      try {
        return renderSpecDetail(await store.readChange(ref));
      } catch {
        return renderCapabilityDetail(await store.readCapability(ref));
      }
    }
    case "clarify": {
      const { ref, question, answer } = parseClarifyArgs(rest.join(" "));
      return renderSpecDetail(await store.recordClarification(ref, question, answer));
    }
    case "plan": {
      const { ref, input } = parsePlanArgs(rest.join(" "));
      return renderSpecDetail(await store.updatePlan(ref, input));
    }
    case "tasks": {
      const { ref, input } = parseTasksArgs(rest.join(" "));
      return renderSpecDetail(await store.updateTasks(ref, input));
    }
    case "analyze": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /spec analyze <change>");
      return renderSpecDetail(await store.analyzeChange(ref));
    }
    case "checklist": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /spec checklist <change>");
      return renderSpecDetail(await store.generateChecklist(ref));
    }
    case "finalize": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /spec finalize <change>");
      return renderSpecDetail(await store.finalizeChange(ref));
    }
    case "tickets": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /spec tickets <change>");
      return renderSpecDetail(await syncSpecTickets(ctx.cwd, ref));
    }
    case "archive": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /spec archive <change>");
      return renderSpecDetail(await store.archiveChange(ref));
    }
    default:
      throw new Error(`Unknown /spec subcommand: ${subcommand}`);
  }
}
