import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { AttachArtifactInput, CreateCheckpointInput, UpdateTicketInput } from "../domain/models.js";
import { renderGraph, renderJournal, renderTicketDetail, renderTicketSummary } from "../domain/render.js";
import { createTicketStore } from "../domain/store.js";

function splitArgs(args: string): string[] {
  return args.trim().split(/\s+/).filter(Boolean);
}

function parseRefAndText(args: string): { ref: string; text: string } {
  const [ref, ...rest] = splitArgs(args);
  if (!ref || rest.length === 0) {
    throw new Error("Expected a ticket reference followed by text");
  }
  return { ref, text: rest.join(" ").trim() };
}

function parseUpdateArgs(parts: string[]): { ref: string; updates: UpdateTicketInput } {
  const [ref, ...pairs] = parts;
  if (!ref || pairs.length === 0) {
    throw new Error("Usage: /ticket update <ref> key=value ...");
  }
  const updates: UpdateTicketInput = {};
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
      case "summary":
        updates.summary = value;
        break;
      case "context":
        updates.context = value;
        break;
      case "plan":
        updates.plan = value;
        break;
      case "notes":
        updates.notes = value;
        break;
      case "verification":
        updates.verification = value;
        break;
      case "journalSummary":
        updates.journalSummary = value;
        break;
      case "status":
        updates.status = value as UpdateTicketInput["status"];
        break;
      case "priority":
        updates.priority = value as UpdateTicketInput["priority"];
        break;
      case "type":
        updates.type = value as UpdateTicketInput["type"];
        break;
      case "risk":
        updates.risk = value as UpdateTicketInput["risk"];
        break;
      case "reviewStatus":
        updates.reviewStatus = value as UpdateTicketInput["reviewStatus"];
        break;
      case "parent":
        updates.parent = value;
        break;
      case "assignee":
        updates.assignee = value;
        break;
      default:
        throw new Error(`Unsupported update field: ${key}`);
    }
  }
  return { ref, updates };
}

function parseAttachArgs(parts: string[]): { ref: string; input: AttachArtifactInput } {
  const [ref, label, ...rest] = parts;
  if (!ref || !label || rest.length === 0) {
    throw new Error("Usage: /ticket attach <ref> <label> path:<path>|text:<content>");
  }
  const payload = rest.join(" ");
  if (payload.startsWith("path:")) {
    return { ref, input: { label, path: payload.slice(5) } };
  }
  if (payload.startsWith("text:")) {
    return { ref, input: { label, content: payload.slice(5), mediaType: "text/plain" } };
  }
  throw new Error("Attachment payload must start with path: or text:");
}

function parseCheckpointArgs(args: string): { ref: string; input: CreateCheckpointInput } {
  const separatorIndex = args.indexOf("::");
  if (separatorIndex === -1) {
    throw new Error("Usage: /ticket checkpoint <ref> <title> :: <body>");
  }
  const left = args.slice(0, separatorIndex).trim();
  const body = args.slice(separatorIndex + 2).trim();
  const [ref, ...titleParts] = splitArgs(left);
  if (!ref || titleParts.length === 0 || !body) {
    throw new Error("Usage: /ticket checkpoint <ref> <title> :: <body>");
  }
  return { ref, input: { title: titleParts.join(" "), body } };
}

export async function handleTicketCommand(args: string, ctx: ExtensionCommandContext): Promise<string> {
  const store = createTicketStore(ctx.cwd);
  const [subcommand, ...rest] = splitArgs(args);
  if (!subcommand) {
    return "Usage: /ticket <init|create|list|show|update|start|close|ready|blocked|note|dep|journal|attach|checkpoint>";
  }

  switch (subcommand) {
    case "init": {
      const result = store.initLedger();
      return `Initialized ticket ledger at ${result.root}`;
    }
    case "create": {
      const title = rest.join(" ").trim();
      const result = store.createTicket({ title });
      return renderTicketDetail(result);
    }
    case "list": {
      const status = rest[0] as "open" | "ready" | "in_progress" | "blocked" | "review" | "closed" | undefined;
      const tickets = store.listTickets({ includeClosed: status === "closed", status });
      return tickets.length > 0 ? tickets.map(renderTicketSummary).join("\n") : "No tickets.";
    }
    case "show": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /ticket show <ref>");
      return renderTicketDetail(store.readTicket(ref));
    }
    case "update": {
      const { ref, updates } = parseUpdateArgs(rest);
      return renderTicketDetail(store.updateTicket(ref, updates));
    }
    case "start": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /ticket start <ref>");
      return renderTicketDetail(store.startTicket(ref));
    }
    case "close": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /ticket close <ref> [verification note]");
      return renderTicketDetail(store.closeTicket(ref, rest.slice(1).join(" ")));
    }
    case "ready":
      return renderGraph(store.graph());
    case "blocked":
      return renderGraph(store.graph());
    case "note": {
      const { ref, text } = parseRefAndText(rest.join(" "));
      return renderTicketDetail(store.addNote(ref, text));
    }
    case "dep": {
      const [action, ref, depRef] = rest;
      if (!action || !ref || !depRef) {
        throw new Error("Usage: /ticket dep <add|remove> <ref> <depRef>");
      }
      return renderTicketDetail(
        action === "add" ? store.addDependency(ref, depRef) : store.removeDependency(ref, depRef),
      );
    }
    case "journal": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /ticket journal <ref>");
      return renderJournal(store.readTicket(ref).journal);
    }
    case "attach": {
      const { ref, input } = parseAttachArgs(rest);
      return renderTicketDetail(store.attachArtifact(ref, input));
    }
    case "checkpoint": {
      const { ref, input } = parseCheckpointArgs(rest.join(" "));
      return renderTicketDetail(store.recordCheckpoint(ref, input));
    }
    default:
      throw new Error(`Unknown /ticket subcommand: ${subcommand}`);
  }
}
