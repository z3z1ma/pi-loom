import { readFileSync } from "node:fs";
import { assertProtectedProjectionContentUnchanged } from "#storage/projection-markdown.js";
import {
  type LoomProjectionSelectionInput,
  normalizeProjectionSelection,
  projectionEntryMatchesSelection,
} from "#storage/projection-selection.js";
import {
  assessProjectionFileState,
  createProjectionManifest,
  createProjectionManifestEntry,
  ensureProjectionWorkspace,
  hashProjectionContent,
  type LoomProjectionManifest,
  type LoomProjectionManifestEntry,
  type LoomProjectionWriteResult,
  readProjectionManifest,
  resolveProjectionFilePath,
  writeProjectionFile,
  writeProjectionManifest,
} from "#storage/projections.js";
import type { SpecChangeRecord } from "./models.js";
import { renderDesignMarkdown } from "./render.js";
import { createSpecStore } from "./store.js";

const SPEC_FAMILY = "specs" as const;
const EMPTY_TEXT_LABEL = "(empty)";

type SpecProjectionKind = "proposal" | "design";

interface SpecProjectionSource {
  record: SpecChangeRecord;
  canonicalRef: string;
  relativePath: string;
  renderedContent: string;
  editableSections: string[];
  readOnly: boolean;
  kind: SpecProjectionKind;
}

export interface SpecProjectionFileResult {
  entry: LoomProjectionManifestEntry;
  path: string;
  write: LoomProjectionWriteResult;
}

export interface SpecProjectionExportResult {
  manifest: LoomProjectionManifest;
  files: SpecProjectionFileResult[];
  records: SpecChangeRecord[];
}

function buildSpecProjectionManifest(sources: SpecProjectionSource[]): LoomProjectionManifest {
  return createProjectionManifest(
    SPEC_FAMILY,
    sources.map((source) => toManifestEntry(source)),
  );
}

function normalizeEditableText(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  return trimmed === EMPTY_TEXT_LABEL ? "" : trimmed;
}

async function loadSpecProjectionSources(cwd: string): Promise<SpecProjectionSource[]> {
  const store = createSpecStore(cwd);
  const summaries = await store.listChanges({ includeArchived: true });
  const records = await Promise.all(summaries.map((summary) => store.readChange(summary.id)));
  return records
    .sort((left, right) => left.state.changeId.localeCompare(right.state.changeId))
    .flatMap((record) => {
      const readOnly = record.state.status === "finalized" || record.state.status === "archived";
      return [
        {
          record,
          canonicalRef: `${record.summary.ref}:artifact:proposal`,
          relativePath: `${record.state.changeId}/proposal.md`,
          renderedContent: record.proposal,
          editableSections: ["Overview"],
          readOnly,
          kind: "proposal" as const,
        },
        {
          record,
          canonicalRef: `${record.summary.ref}:artifact:design`,
          relativePath: `${record.state.changeId}/design.md`,
          renderedContent: renderDesignMarkdown(record.state),
          editableSections: ["Design Notes"],
          readOnly,
          kind: "design" as const,
        },
      ];
    });
}

function toManifestEntry(source: SpecProjectionSource): LoomProjectionManifestEntry {
  return createProjectionManifestEntry({
    canonicalRef: source.canonicalRef,
    relativePath: source.relativePath,
    renderedContent: source.renderedContent,
    revision: {
      canonicalRef: source.canonicalRef,
      semanticInput: { contentHash: hashProjectionContent(source.renderedContent) },
      baseVersion: null,
    },
    editability: source.readOnly
      ? { mode: "read_only" }
      : { mode: "sections", editableSections: source.editableSections },
  });
}

export async function exportSpecProjections(cwd: string): Promise<SpecProjectionExportResult> {
  ensureProjectionWorkspace(cwd, { enabledFamilies: [SPEC_FAMILY] });
  const sources = await loadSpecProjectionSources(cwd);
  const files = sources.map((source) => {
    const entry = toManifestEntry(source);
    const absolutePath = resolveProjectionFilePath(cwd, SPEC_FAMILY, entry.relativePath);
    return {
      entry,
      path: absolutePath,
      write: writeProjectionFile(absolutePath, source.renderedContent),
    };
  });
  const manifest = buildSpecProjectionManifest(sources);
  writeProjectionManifest(resolveProjectionFilePath(cwd, SPEC_FAMILY, "manifest.json"), manifest);
  return {
    manifest,
    files,
    records: [...new Map(sources.map((source) => [source.record.state.changeId, source.record])).values()],
  };
}

export async function reconcileSpecProjections(
  cwd: string,
  selectionInput: LoomProjectionSelectionInput = {},
): Promise<SpecChangeRecord[]> {
  const store = createSpecStore(cwd);
  const sources = await loadSpecProjectionSources(cwd);
  const selection = normalizeProjectionSelection(selectionInput);
  const manifest = readProjectionManifest(resolveProjectionFilePath(cwd, SPEC_FAMILY, "manifest.json"));
  if (!manifest) {
    throw new Error("Projection family specs has no manifest. Export it before reconciling.");
  }
  const manifestEntriesByPath = new Map(manifest.entries.map((entry) => [entry.relativePath, entry]));
  let matchedSelection = false;
  const patches = new Map<string, { proposalSummary?: string; designNotes?: string }>();

  for (const source of sources) {
    const entry = toManifestEntry(source);
    if (!projectionEntryMatchesSelection(SPEC_FAMILY, entry, selection)) {
      continue;
    }
    matchedSelection = true;
    const manifestEntry = manifestEntriesByPath.get(entry.relativePath);
    if (!manifestEntry) {
      throw new Error(`Projection specs/${source.relativePath} is not exported. Refresh it before reconciling.`);
    }
    const state = assessProjectionFileState(cwd, SPEC_FAMILY, manifestEntry);
    if (state.kind === "missing") {
      throw new Error(`Projection specs/${source.relativePath} is missing. Refresh it before reconciling.`);
    }
    if (state.kind !== "modified") {
      continue;
    }
    if (manifestEntry.revisionToken !== entry.revisionToken || manifestEntry.baseVersion !== entry.baseVersion) {
      throw new Error(`Projection specs/${source.relativePath} is stale. Refresh it before reconciling.`);
    }
    if (source.readOnly) {
      throw new Error(
        `Projection specs/${source.relativePath} is read-only because spec ${source.record.state.changeId} is ${source.record.state.status}.`,
      );
    }

    const currentContent = readFileSync(state.absolutePath, "utf-8");
    const parsed = assertProtectedProjectionContentUnchanged({
      canonicalContent: source.renderedContent,
      currentContent,
      editableSections: source.editableSections,
      filePath: `specs/${source.relativePath}`,
    });

    const patch = patches.get(source.record.state.changeId) ?? {};
    if (source.kind === "proposal") {
      patch.proposalSummary = normalizeEditableText(parsed.sections.Overview);
    } else {
      patch.designNotes = normalizeEditableText(parsed.sections["Design Notes"]);
    }
    patches.set(source.record.state.changeId, patch);
  }

  if (selection.hasSelection && !matchedSelection) {
    throw new Error("No spec projections matched the requested selection.");
  }

  const updated: SpecChangeRecord[] = [];
  for (const [changeId, patch] of [...patches.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    updated.push(await store.updateProjectionNarrative(changeId, patch));
  }
  return updated;
}
