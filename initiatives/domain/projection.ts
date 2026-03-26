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
import type { InitiativeMilestoneInput, InitiativeRecord } from "./models.js";
import { createInitiativeStore } from "./store.js";

const INITIATIVE_FAMILY = "initiatives" as const;
const EMPTY_LIST_LABEL = "(none)";
const EMPTY_TEXT_LABEL = "(empty)";

interface InitiativeProjectionSource {
  record: InitiativeRecord;
  canonicalRef: string;
  relativePath: string;
  renderedContent: string;
  editableSections: string[];
}

export interface InitiativeProjectionFileResult {
  entry: LoomProjectionManifestEntry;
  path: string;
  write: LoomProjectionWriteResult;
}

export interface InitiativeProjectionExportResult {
  manifest: LoomProjectionManifest;
  files: InitiativeProjectionFileResult[];
  records: InitiativeRecord[];
}

function buildInitiativeProjectionManifest(sources: InitiativeProjectionSource[]): LoomProjectionManifest {
  return createProjectionManifest(
    INITIATIVE_FAMILY,
    sources.map((source) => toManifestEntry(source)),
  );
}

function normalizeEditableText(value: string | undefined, emptyLabel = EMPTY_TEXT_LABEL): string {
  const trimmed = value?.trim() ?? "";
  return trimmed === emptyLabel ? "" : trimmed;
}

async function loadInitiativeProjectionSources(cwd: string): Promise<InitiativeProjectionSource[]> {
  const store = createInitiativeStore(cwd);
  const summaries = await store.listInitiatives({ includeArchived: true });
  const records = await Promise.all(summaries.map((summary) => store.readInitiative(summary.id)));
  return records
    .sort((left, right) => left.state.initiativeId.localeCompare(right.state.initiativeId))
    .map((record) => ({
      record,
      canonicalRef: `initiative:${record.state.initiativeId}`,
      relativePath: `${record.state.initiativeId}.md`,
      renderedContent: record.brief,
      editableSections: [
        "Objective",
        "Outcomes",
        "Scope",
        "Non-Goals",
        "Success Metrics",
        "Status Summary",
        "Risks",
        "Milestones",
      ],
    }));
}

function toManifestEntry(source: InitiativeProjectionSource): LoomProjectionManifestEntry {
  return createProjectionManifestEntry({
    canonicalRef: source.canonicalRef,
    relativePath: source.relativePath,
    renderedContent: source.renderedContent,
    revision: {
      canonicalRef: source.canonicalRef,
      semanticInput: { contentHash: hashProjectionContent(source.renderedContent) },
      baseVersion: null,
    },
    editability: { mode: "sections", editableSections: source.editableSections },
  });
}

function parseCommaSeparatedField(value: string | undefined): string[] {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed === EMPTY_LIST_LABEL) {
    return [];
  }
  return trimmed
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

function assertMilestoneIdsUnchanged(record: InitiativeRecord, milestones: InitiativeMilestoneInput[]): void {
  const expectedIds = record.state.milestones
    .map((milestone) => milestone.id)
    .sort((left, right) => left.localeCompare(right));
  const nextIds = milestones.map((milestone) => milestone.id ?? "").sort((left, right) => left.localeCompare(right));
  if (JSON.stringify(expectedIds) !== JSON.stringify(nextIds)) {
    throw new Error(`Projection initiatives/${record.state.initiativeId}.md must preserve milestone ids.`);
  }
}

function parseMilestones(record: InitiativeRecord, section: string | undefined): InitiativeMilestoneInput[] {
  const blocks = parseProjectionBulletBlocks(section, EMPTY_LIST_LABEL);
  const canonicalById = new Map(record.state.milestones.map((milestone) => [milestone.id, milestone]));
  const milestones = blocks.map((block) => {
    const headerMatch = block.header.match(/^(milestone-\d{3}):\s+(.+)\s+\[([a-z_]+)\]$/);
    if (!headerMatch) {
      throw new Error(
        `Projection initiatives/${record.state.initiativeId}.md must preserve milestone ids and statuses.`,
      );
    }
    const id = headerMatch[1] ?? "";
    const canonical = canonicalById.get(id);
    if (!canonical) {
      throw new Error(`Projection initiatives/${record.state.initiativeId}.md references unknown milestone ${id}.`);
    }

    const specs = parseCommaSeparatedField(block.fields.Specs);
    const tickets = parseCommaSeparatedField(block.fields.Tickets);
    const expectedSpecs = [...canonical.specChangeIds].sort((left, right) => left.localeCompare(right));
    const expectedTickets = [...canonical.ticketIds].sort((left, right) => left.localeCompare(right));
    if (
      JSON.stringify(specs) !== JSON.stringify(expectedSpecs) ||
      JSON.stringify(tickets) !== JSON.stringify(expectedTickets)
    ) {
      throw new Error(
        `Projection initiatives/${record.state.initiativeId}.md does not allow editing generated milestone links for ${id}.`,
      );
    }

    return {
      id,
      title: headerMatch[2]?.trim() ?? "",
      status: headerMatch[3] as InitiativeMilestoneInput["status"],
      description: normalizeEditableText(block.fields.Description),
      specChangeIds: canonical.specChangeIds,
      ticketIds: canonical.ticketIds,
    };
  });
  assertMilestoneIdsUnchanged(record, milestones);
  return milestones;
}

export async function exportInitiativeProjections(cwd: string): Promise<InitiativeProjectionExportResult> {
  ensureProjectionWorkspace(cwd, { enabledFamilies: [INITIATIVE_FAMILY] });
  const sources = await loadInitiativeProjectionSources(cwd);
  const files = sources.map((source) => {
    const entry = toManifestEntry(source);
    const absolutePath = resolveProjectionFilePath(cwd, INITIATIVE_FAMILY, entry.relativePath);
    return {
      entry,
      path: absolutePath,
      write: writeProjectionFile(absolutePath, source.renderedContent),
    };
  });
  const manifest = buildInitiativeProjectionManifest(sources);
  writeProjectionManifest(resolveProjectionFilePath(cwd, INITIATIVE_FAMILY, "manifest.json"), manifest);
  return { manifest, files, records: sources.map((source) => source.record) };
}

export async function reconcileInitiativeProjections(
  cwd: string,
  selectionInput: LoomProjectionSelectionInput = {},
): Promise<InitiativeRecord[]> {
  const store = createInitiativeStore(cwd);
  const sources = await loadInitiativeProjectionSources(cwd);
  const selection = normalizeProjectionSelection(selectionInput);
  const manifest = readProjectionManifest(resolveProjectionFilePath(cwd, INITIATIVE_FAMILY, "manifest.json"));
  if (!manifest) {
    throw new Error("Projection family initiatives has no manifest. Export it before reconciling.");
  }
  const manifestEntriesByPath = new Map(manifest.entries.map((entry) => [entry.relativePath, entry]));
  let matchedSelection = false;
  const updated = new Map<string, InitiativeRecord>();

  for (const source of sources) {
    const entry = toManifestEntry(source);
    if (!projectionEntryMatchesSelection(INITIATIVE_FAMILY, entry, selection)) {
      continue;
    }
    matchedSelection = true;
    const manifestEntry = manifestEntriesByPath.get(entry.relativePath);
    if (!manifestEntry) {
      throw new Error(`Projection initiatives/${source.relativePath} is not exported. Refresh it before reconciling.`);
    }
    const state = assessProjectionFileState(cwd, INITIATIVE_FAMILY, manifestEntry);
    if (state.kind === "missing") {
      throw new Error(`Projection initiatives/${source.relativePath} is missing. Refresh it before reconciling.`);
    }
    if (state.kind !== "modified") {
      continue;
    }
    if (manifestEntry.revisionToken !== entry.revisionToken || manifestEntry.baseVersion !== entry.baseVersion) {
      throw new Error(`Projection initiatives/${source.relativePath} is stale. Refresh it before reconciling.`);
    }

    const currentContent = readFileSync(state.absolutePath, "utf-8");
    const parsed = assertProtectedProjectionContentUnchanged({
      canonicalContent: source.renderedContent,
      currentContent,
      editableSections: source.editableSections,
      filePath: `initiatives/${source.relativePath}`,
    });

    let record = await store.updateInitiative(source.record.state.initiativeId, {
      objective: normalizeEditableText(parsed.sections.Objective),
      outcomes: parseProjectionBulletList(parsed.sections.Outcomes, EMPTY_LIST_LABEL),
      scope: parseProjectionBulletList(parsed.sections.Scope, EMPTY_LIST_LABEL),
      nonGoals: parseProjectionBulletList(parsed.sections["Non-Goals"], EMPTY_LIST_LABEL),
      successMetrics: parseProjectionBulletList(parsed.sections["Success Metrics"], EMPTY_LIST_LABEL),
      statusSummary: normalizeEditableText(parsed.sections["Status Summary"]),
      risks: parseProjectionBulletList(parsed.sections.Risks, EMPTY_LIST_LABEL),
    });

    for (const milestone of parseMilestones(source.record, parsed.sections.Milestones)) {
      record = await store.upsertMilestone(source.record.state.initiativeId, milestone);
    }
    updated.set(record.state.initiativeId, record);
  }

  if (selection.hasSelection && !matchedSelection) {
    throw new Error("No initiative projections matched the requested selection.");
  }

  return [...updated.values()].sort((left, right) => left.state.initiativeId.localeCompare(right.state.initiativeId));
}
