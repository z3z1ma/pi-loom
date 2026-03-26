import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";
import { ensureWorkspaceProjectionBootstrap } from "#storage/projection-lifecycle.js";
import type { LoomProjectionFamily } from "#storage/projections.js";
import {
  readWorkspaceSyncStatus,
  renderWorkspaceSyncAction,
  renderWorkspaceSyncStatus,
  runWorkspaceSyncAction,
} from "../domain/workspace-sync.js";
import { syncLoomSyncStatus } from "../ui/status.js";

const PROJECTION_FAMILY_VALUES = [
  "constitution",
  "specs",
  "initiatives",
  "research",
  "plans",
  "docs",
  "tickets",
  "all",
] as const;
const ProjectionFamilyEnum = StringEnum(PROJECTION_FAMILY_VALUES);
const ProjectionWriteActionEnum = StringEnum(["export", "refresh", "reconcile"] as const);

const ProjectionStatusParams = Type.Object({
  family: Type.Optional(ProjectionFamilyEnum),
  relativePaths: Type.Optional(
    Type.Array(
      Type.String({
        description:
          "Optional relative projection paths to narrow status or reconcile within the chosen family, for example `workspace-projections/proposal.md` or `specs/workspace-projections/proposal.md`.",
      }),
    ),
  ),
  canonicalRefs: Type.Optional(
    Type.Array(
      Type.String({ description: "Optional canonical refs such as `spec:workspace-projections:artifact:proposal`." }),
    ),
  ),
});

const ProjectionWriteParams = Type.Object({
  action: ProjectionWriteActionEnum,
  family: Type.Optional(ProjectionFamilyEnum),
  relativePaths: Type.Optional(
    Type.Array(
      Type.String({
        description:
          "Optional relative projection paths for reconcile only. Export and refresh reject file-level targeting because they rewrite whole families.",
      }),
    ),
  ),
  canonicalRefs: Type.Optional(
    Type.Array(
      Type.String({
        description: "Optional canonical refs for reconcile only, such as `plan:workspace-projections-rollout-plan`.",
      }),
    ),
  ),
});

type ProjectionStatusParamsValue = Static<typeof ProjectionStatusParams>;
type ProjectionWriteParamsValue = Static<typeof ProjectionWriteParams>;

function machineResult(details: Record<string, unknown>, text: string) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

function normalizeFamily(value: string | undefined): LoomProjectionFamily | "all" | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if ((PROJECTION_FAMILY_VALUES as readonly string[]).includes(trimmed)) {
    return trimmed as LoomProjectionFamily | "all";
  }
  throw new Error(`Unknown projection family: ${trimmed}`);
}

function toSelectionInput(params: ProjectionStatusParamsValue | ProjectionWriteParamsValue) {
  return {
    family: normalizeFamily(params.family),
    relativePaths: params.relativePaths,
    canonicalRefs: params.canonicalRefs,
  };
}

async function readStatus(ctx: ExtensionContext, params: ProjectionStatusParamsValue) {
  ensureWorkspaceProjectionBootstrap(ctx.cwd);
  return readWorkspaceSyncStatus(ctx.cwd, toSelectionInput(params));
}

async function runAction(ctx: ExtensionContext, params: ProjectionWriteParamsValue) {
  ensureWorkspaceProjectionBootstrap(ctx.cwd);
  const report = await runWorkspaceSyncAction(ctx.cwd, params.action, toSelectionInput(params));
  await syncLoomSyncStatus(ctx);
  return report;
}

export function registerProjectionTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "projection_status",
    label: "projection_status",
    description:
      "Inspect exported workspace projection state, including clean, modified, missing, and not-yet-exported families before reconciling or refreshing.",
    promptSnippet:
      "Check projection status before reconciling so stale, missing, or untouched files are visible instead of guessed from the working tree.",
    promptGuidelines: [
      "Use this before reconcile when you need to know which exported files actually changed on disk.",
      "Prefer family-wide status first, then narrow with relativePaths or canonicalRefs when you already know the exact target file.",
      "A family reported as not exported needs export or refresh before any reconcile attempt can be truthful.",
    ],
    parameters: ProjectionStatusParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const report = await readStatus(ctx, params);
      return machineResult({ status: report }, renderWorkspaceSyncStatus(report));
    },
  });

  pi.registerTool({
    name: "projection_write",
    label: "projection_write",
    description:
      "Export, refresh, or reconcile workspace projections through the same bounded rules used by the human Loom sync command surface.",
    promptSnippet:
      "Use explicit projection export, refresh, and reconcile flows instead of assuming disk edits auto-import back into canonical state.",
    promptGuidelines: [
      "Export and refresh operate at workspace or family scope; they intentionally rewrite the selected family projections from canonical state.",
      "Reconcile is fail-closed: stale, missing, read-only, or structurally invalid projections throw instead of guessing a merge.",
      "Use relativePaths or canonicalRefs only for reconcile when you need record-level targeting inside one family.",
    ],
    parameters: ProjectionWriteParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const report = await runAction(ctx, params);
      return machineResult({ action: report }, renderWorkspaceSyncAction(report));
    },
  });
}
