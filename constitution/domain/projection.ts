import { readFileSync } from "node:fs";
import {
  assertProtectedProjectionContentUnchanged,
  parseProjectionBulletBlocks,
  parseProjectionBulletList,
} from "#storage/projection-markdown.js";
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
import type { ConstitutionalEntryInput, ConstitutionalRecord } from "./models.js";
import { createConstitutionalStore } from "./store.js";

const CONSTITUTION_FAMILY = "constitution" as const;
const VISION_PATH = "vision.md";
const PRINCIPLES_PATH = "principles.md";
const CONSTRAINTS_PATH = "constraints.md";
const ROADMAP_PATH = "roadmap.md";
const EMPTY_VISION_LABEL = "(not yet defined)";
const EMPTY_FOCUS_LABEL = "(no current focus recorded)";

interface ConstitutionProjectionSource {
  canonicalRef: string;
  relativePath: string;
  renderedContent: string;
  editableSections: string[];
}

export interface ConstitutionProjectionFileResult {
  entry: LoomProjectionManifestEntry;
  path: string;
  write: LoomProjectionWriteResult;
}

export interface ConstitutionProjectionExportResult {
  record: ConstitutionalRecord;
  manifest: LoomProjectionManifest;
  files: ConstitutionProjectionFileResult[];
}

function buildConstitutionProjectionManifest(record: ConstitutionalRecord): LoomProjectionManifest {
  return createProjectionManifest(
    CONSTITUTION_FAMILY,
    buildConstitutionProjectionSources(record).map((source) => toManifestEntry(source)),
  );
}

function normalizeEditableText(value: string | undefined, emptyLabel: string): string {
  const trimmed = value?.trim() ?? "";
  return trimmed === emptyLabel ? "" : trimmed;
}

function buildConstitutionProjectionSources(record: ConstitutionalRecord): ConstitutionProjectionSource[] {
  return [
    {
      canonicalRef: "constitution:vision",
      relativePath: VISION_PATH,
      renderedContent: record.vision,
      editableSections: ["Vision Summary", "Vision Narrative"],
    },
    {
      canonicalRef: "constitution:principles",
      relativePath: PRINCIPLES_PATH,
      renderedContent: record.principles,
      editableSections: ["Guiding Principles"],
    },
    {
      canonicalRef: "constitution:constraints",
      relativePath: CONSTRAINTS_PATH,
      renderedContent: record.constraints,
      editableSections: ["Architectural and Business Constraints"],
    },
    {
      canonicalRef: "constitution:roadmap",
      relativePath: ROADMAP_PATH,
      renderedContent: record.roadmap,
      editableSections: ["Strategic Direction", "Current Focus"],
    },
  ];
}

function toManifestEntry(source: ConstitutionProjectionSource): LoomProjectionManifestEntry {
  return createProjectionManifestEntry({
    canonicalRef: source.canonicalRef,
    relativePath: source.relativePath,
    renderedContent: source.renderedContent,
    revision: {
      canonicalRef: source.canonicalRef,
      semanticInput: { contentHash: hashProjectionContent(source.renderedContent) },
      baseVersion: null,
    },
    editability:
      source.editableSections.length > 0
        ? { mode: "sections", editableSections: source.editableSections }
        : { mode: "read_only" },
  });
}

function parseConstitutionEntries(
  section: string | undefined,
  kind: "principle" | "constraint",
): ConstitutionalEntryInput[] {
  const blocks = parseProjectionBulletBlocks(
    section,
    kind === "principle" ? "(no guiding principles recorded yet)" : "(no constraints recorded yet)",
  );
  return blocks.map((block) => {
    const headerMatch = block.header.match(/^((?:principle|constraint)-\d{3}):\s+(.+)$/);
    if (!headerMatch) {
      throw new Error(`Projection ${kind} entries must preserve stable ids.`);
    }
    const summary = block.fields.Summary?.trim() ?? "";
    if (!summary) {
      throw new Error(`Projection ${headerMatch[1]} requires a Summary line.`);
    }
    return {
      id: headerMatch[1],
      title: headerMatch[2]?.trim() ?? "",
      summary,
      rationale: block.fields.Rationale?.trim() ?? "",
    };
  });
}

function assertEntryIdsUnchanged(
  currentIds: string[],
  nextEntries: ConstitutionalEntryInput[],
  label: "principles" | "constraints",
): void {
  const nextIds = nextEntries.map((entry) => entry.id ?? "").sort((left, right) => left.localeCompare(right));
  const expectedIds = [...currentIds].sort((left, right) => left.localeCompare(right));
  if (JSON.stringify(expectedIds) !== JSON.stringify(nextIds)) {
    throw new Error(`Projection constitution/${label}.md must preserve existing ${label} ids.`);
  }
}

export async function exportConstitutionProjections(cwd: string): Promise<ConstitutionProjectionExportResult> {
  const store = createConstitutionalStore(cwd);
  const record = await store.readConstitution();
  ensureProjectionWorkspace(cwd, { enabledFamilies: [CONSTITUTION_FAMILY] });

  const sources = buildConstitutionProjectionSources(record);
  const files = sources.map((source) => {
    const entry = toManifestEntry(source);
    const absolutePath = resolveProjectionFilePath(cwd, CONSTITUTION_FAMILY, entry.relativePath);
    return {
      entry,
      path: absolutePath,
      write: writeProjectionFile(absolutePath, source.renderedContent),
    };
  });
  const manifest = buildConstitutionProjectionManifest(record);
  writeProjectionManifest(resolveProjectionFilePath(cwd, CONSTITUTION_FAMILY, "manifest.json"), manifest);
  return { record, manifest, files };
}

export async function reconcileConstitutionProjections(
  cwd: string,
  selectionInput: LoomProjectionSelectionInput = {},
): Promise<ConstitutionalRecord> {
  const store = createConstitutionalStore(cwd);
  const snapshot = await store.readConstitution();
  const sources = buildConstitutionProjectionSources(snapshot);
  const selection = normalizeProjectionSelection(selectionInput);
  const manifest = readProjectionManifest(resolveProjectionFilePath(cwd, CONSTITUTION_FAMILY, "manifest.json"));
  if (!manifest) {
    throw new Error("Projection family constitution has no manifest. Export it before reconciling.");
  }
  const manifestEntriesByPath = new Map(manifest.entries.map((entry) => [entry.relativePath, entry]));
  let matchedSelection = false;

  let visionPatch: { visionSummary?: string; visionNarrative?: string } | null = null;
  let principlesPatch: ConstitutionalEntryInput[] | null = null;
  let constraintsPatch: ConstitutionalEntryInput[] | null = null;
  let roadmapPatch: { strategicDirectionSummary?: string; currentFocus?: string[] } | null = null;

  for (const source of sources) {
    const entry = toManifestEntry(source);
    if (!projectionEntryMatchesSelection(CONSTITUTION_FAMILY, entry, selection)) {
      continue;
    }
    matchedSelection = true;
    const manifestEntry = manifestEntriesByPath.get(entry.relativePath);
    if (!manifestEntry) {
      throw new Error(`Projection constitution/${source.relativePath} is not exported. Refresh it before reconciling.`);
    }
    const state = assessProjectionFileState(cwd, CONSTITUTION_FAMILY, manifestEntry);
    if (state.kind === "missing") {
      throw new Error(`Projection constitution/${source.relativePath} is missing. Refresh it before reconciling.`);
    }
    if (state.kind !== "modified") {
      continue;
    }
    if (manifestEntry.revisionToken !== entry.revisionToken || manifestEntry.baseVersion !== entry.baseVersion) {
      throw new Error(`Projection constitution/${source.relativePath} is stale. Refresh it before reconciling.`);
    }

    const currentContent = readFileSync(state.absolutePath, "utf-8");
    const parsed = assertProtectedProjectionContentUnchanged({
      canonicalContent: source.renderedContent,
      currentContent,
      editableSections: source.editableSections,
      filePath: `constitution/${source.relativePath}`,
    });

    if (source.relativePath === VISION_PATH) {
      visionPatch = {
        visionSummary: normalizeEditableText(parsed.sections["Vision Summary"], EMPTY_VISION_LABEL),
        visionNarrative: normalizeEditableText(parsed.sections["Vision Narrative"], EMPTY_VISION_LABEL),
      };
      continue;
    }

    if (source.relativePath === PRINCIPLES_PATH) {
      const entries = parseConstitutionEntries(parsed.sections["Guiding Principles"], "principle");
      assertEntryIdsUnchanged(
        snapshot.state.principles.map((entryItem) => entryItem.id),
        entries,
        "principles",
      );
      principlesPatch = entries;
      continue;
    }

    if (source.relativePath === CONSTRAINTS_PATH) {
      const entries = parseConstitutionEntries(parsed.sections["Architectural and Business Constraints"], "constraint");
      assertEntryIdsUnchanged(
        snapshot.state.constraints.map((entryItem) => entryItem.id),
        entries,
        "constraints",
      );
      constraintsPatch = entries;
      continue;
    }

    if (source.relativePath === ROADMAP_PATH) {
      roadmapPatch = {
        strategicDirectionSummary: normalizeEditableText(parsed.sections["Strategic Direction"], EMPTY_VISION_LABEL),
        currentFocus: parseProjectionBulletList(parsed.sections["Current Focus"], EMPTY_FOCUS_LABEL),
      };
    }
  }

  if (selection.hasSelection && !matchedSelection) {
    throw new Error("No constitution projections matched the requested selection.");
  }

  let nextRecord = snapshot;
  if (visionPatch) {
    nextRecord = await store.updateVision(visionPatch);
  }
  if (principlesPatch) {
    nextRecord = await store.setPrinciples(principlesPatch);
  }
  if (constraintsPatch) {
    nextRecord = await store.setConstraints(constraintsPatch);
  }
  if (roadmapPatch) {
    nextRecord = await store.updateRoadmap(roadmapPatch);
  }
  return nextRecord;
}
