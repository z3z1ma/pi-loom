import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import {
  renderDashboard,
  renderDocumentationDetail,
  renderUpdateDescriptor,
  renderUpdatePrompt,
} from "../domain/render.js";
import { createDocumentationStore } from "../domain/store.js";

type DocsCommandType = "overview" | "guide" | "concept" | "operations" | "workflow" | "faq";

function splitArgs(args: string): string[] {
  return args.trim().split(/\s+/).filter(Boolean);
}

function parseDoubleColonArgs(args: string): string[] {
  return args
    .split("::")
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseCreateArgs(args: string): { docType: DocsCommandType; title: string; updateReason?: string } {
  const [left, updateReason] = parseDoubleColonArgs(args);
  const [docType, ...titleParts] = splitArgs(left ?? "");
  if (!docType || titleParts.length === 0) {
    throw new Error("Usage: /docs create <type> <title> [:: <update reason>]");
  }
  return {
    docType: docType as DocsCommandType,
    title: titleParts.join(" "),
    updateReason,
  };
}

function parseUpdateArgs(args: string): { ref: string; updateReason?: string } {
  const [left, updateReason] = parseDoubleColonArgs(args);
  const [ref] = splitArgs(left ?? "");
  if (!ref) {
    throw new Error("Usage: /docs update <doc> [:: <update reason>]");
  }
  return { ref, updateReason };
}

export async function handleDocsCommand(args: string, ctx: ExtensionCommandContext): Promise<string> {
  const store = createDocumentationStore(ctx.cwd);
  const [subcommand, ...rest] = splitArgs(args);
  if (!subcommand) {
    return "Usage: /docs <init|create|list|show|packet|update|dashboard|archive>";
  }

  switch (subcommand) {
    case "init": {
      const result = store.initLedger();
      return `Initialized docs memory at ${result.root}`;
    }
    case "create": {
      const parsed = parseCreateArgs(rest.join(" "));
      return renderDocumentationDetail(
        store.createDoc({
          title: parsed.title,
          docType: parsed.docType,
          sourceTarget: { kind: "workspace", ref: "repo" },
          updateReason: parsed.updateReason,
        }),
      );
    }
    case "list": {
      const docs = store.listDocs();
      return docs.length > 0
        ? docs.map((doc) => `${doc.id} [${doc.status}/${doc.docType}] ${doc.title}`).join("\n")
        : "No documentation records.";
    }
    case "show": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /docs show <doc>");
      return renderDocumentationDetail(store.readDoc(ref));
    }
    case "packet": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /docs packet <doc>");
      return store.readDoc(ref).packet;
    }
    case "update": {
      const parsed = parseUpdateArgs(rest.join(" "));
      const prepared = parsed.updateReason
        ? store.updateDoc(parsed.ref, { updateReason: parsed.updateReason })
        : store.readDoc(parsed.ref);
      const newSessionResult = await ctx.newSession({
        parentSession: ctx.sessionManager.getSessionFile(),
      });
      if (!newSessionResult.cancelled) {
        ctx.ui.setEditorText(renderUpdatePrompt(ctx.cwd, prepared.state));
        ctx.ui.notify("Fresh documentation session ready. Submit when ready.", "info");
      }
      return renderUpdateDescriptor(ctx.cwd, prepared.state);
    }
    case "dashboard": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /docs dashboard <doc>");
      return renderDashboard(store.readDoc(ref).dashboard);
    }
    case "archive": {
      const ref = rest[0];
      if (!ref) throw new Error("Usage: /docs archive <doc>");
      return renderDocumentationDetail(store.archiveDoc(ref));
    }
    default:
      throw new Error(`Unknown /docs subcommand: ${subcommand}`);
  }
}
