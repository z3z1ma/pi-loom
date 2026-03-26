import { exportConstitutionProjections, reconcileConstitutionProjections } from "#constitution/domain/projection.js";
import { exportDocumentationProjections, reconcileDocumentationProjections } from "#docs/domain/projection.js";
import { exportInitiativeProjections, reconcileInitiativeProjections } from "#initiatives/domain/projection.js";
import { exportPlanProjections, reconcilePlanProjections } from "#plans/domain/projection.js";
import { exportResearchProjections, reconcileResearchProjections } from "#research/domain/projection.js";
import { exportSpecProjections, reconcileSpecProjections } from "#specs/domain/projection.js";
import type { LoomProjectionSelectionInput } from "#storage/projection-selection.js";
import {
  assessProjectionFileState,
  LOOM_PROJECTION_FAMILIES,
  type LoomProjectionEditability,
  type LoomProjectionFamily,
  type LoomProjectionWriteStatus,
  readProjectionManifest,
  resolveProjectionPaths,
} from "#storage/projections.js";
import { createTicketStore } from "#ticketing/domain/store.js";

export type WorkspaceSyncAction = "export" | "refresh" | "reconcile";
export type WorkspaceSyncFamilyTarget = LoomProjectionFamily | "all";
export type WorkspaceSyncStatusKind = "clean" | "modified" | "missing" | "not_exported";

export interface WorkspaceSyncOperationInput extends LoomProjectionSelectionInput {
  family?: WorkspaceSyncFamilyTarget;
}

export interface WorkspaceSyncStatusEntry {
  family: LoomProjectionFamily;
  canonicalRef: string;
  relativePath: string;
  status: WorkspaceSyncStatusKind;
  editability: LoomProjectionEditability;
}

export interface WorkspaceSyncFamilyStatus {
  family: LoomProjectionFamily;
  manifestPath: string;
  manifestPresent: boolean;
  entries: WorkspaceSyncStatusEntry[];
  counts: Record<WorkspaceSyncStatusKind, number>;
}

export interface WorkspaceSyncStatusReport {
  families: WorkspaceSyncFamilyStatus[];
  selection: WorkspaceSyncOperationInput;
}

export interface WorkspaceSyncFamilyActionResult {
  family: LoomProjectionFamily;
  fileCount: number;
  writeCounts: Record<LoomProjectionWriteStatus, number>;
  updatedRefs: string[];
  cleanPaths: string[];
}

export interface WorkspaceSyncActionReport {
  action: WorkspaceSyncAction;
  families: WorkspaceSyncFamilyActionResult[];
  selection: WorkspaceSyncOperationInput;
}

function normalizeFamilyTarget(family: WorkspaceSyncFamilyTarget | undefined): LoomProjectionFamily[] {
  if (!family || family === "all") {
    return [...LOOM_PROJECTION_FAMILIES];
  }
  return [family];
}

function matchesFamilyPathFilter(
  entry: { relativePath: string },
  relativePaths: readonly string[] | null | undefined,
): boolean {
  if (!relativePaths || relativePaths.length === 0) {
    return true;
  }
  return relativePaths.some((value) => {
    const trimmed = value.trim();
    return trimmed === entry.relativePath || trimmed.endsWith(`/${entry.relativePath}`);
  });
}

function matchesCanonicalRefFilter(
  entry: { canonicalRef: string },
  canonicalRefs: readonly string[] | null | undefined,
): boolean {
  if (!canonicalRefs || canonicalRefs.length === 0) {
    return true;
  }
  return canonicalRefs.some((value) => value.trim() === entry.canonicalRef);
}

function matchesSelection(
  entry: { relativePath: string; canonicalRef: string },
  selection: LoomProjectionSelectionInput,
): boolean {
  return (
    matchesFamilyPathFilter(entry, selection.relativePaths) && matchesCanonicalRefFilter(entry, selection.canonicalRefs)
  );
}

function createEmptyCounts(): Record<WorkspaceSyncStatusKind, number> {
  return { clean: 0, modified: 0, missing: 0, not_exported: 0 };
}

function summarizeWriteCounts(statuses: LoomProjectionWriteStatus[]): Record<LoomProjectionWriteStatus, number> {
  return {
    created: statuses.filter((status) => status === "created").length,
    updated: statuses.filter((status) => status === "updated").length,
    unchanged: statuses.filter((status) => status === "unchanged").length,
  };
}

async function runFamilyExport(
  cwd: string,
  family: LoomProjectionFamily,
): Promise<Pick<WorkspaceSyncFamilyActionResult, "fileCount" | "writeCounts" | "updatedRefs" | "cleanPaths">> {
  switch (family) {
    case "constitution": {
      const result = await exportConstitutionProjections(cwd);
      return {
        fileCount: result.files.length,
        writeCounts: summarizeWriteCounts(result.files.map((file) => file.write.status)),
        updatedRefs: ["constitution"],
        cleanPaths: [],
      };
    }
    case "specs": {
      const result = await exportSpecProjections(cwd);
      return {
        fileCount: result.files.length,
        writeCounts: summarizeWriteCounts(result.files.map((file) => file.write.status)),
        updatedRefs: result.records.map((record) => record.state.changeId),
        cleanPaths: [],
      };
    }
    case "initiatives": {
      const result = await exportInitiativeProjections(cwd);
      return {
        fileCount: result.files.length,
        writeCounts: summarizeWriteCounts(result.files.map((file) => file.write.status)),
        updatedRefs: result.records.map((record) => record.state.initiativeId),
        cleanPaths: [],
      };
    }
    case "research": {
      const result = await exportResearchProjections(cwd);
      return {
        fileCount: result.files.length,
        writeCounts: summarizeWriteCounts(result.files.map((file) => file.write.status)),
        updatedRefs: result.records.map((record) => record.state.researchId),
        cleanPaths: [],
      };
    }
    case "plans": {
      const result = await exportPlanProjections(cwd);
      return {
        fileCount: result.files.length,
        writeCounts: summarizeWriteCounts(result.files.map((file) => file.write.status)),
        updatedRefs: result.plans.map((plan) => plan.state.planId),
        cleanPaths: [],
      };
    }
    case "docs": {
      const result = await exportDocumentationProjections(cwd);
      return {
        fileCount: result.files.length,
        writeCounts: summarizeWriteCounts(result.files.map((file) => file.write.status)),
        updatedRefs: result.documents.map((document) => document.state.docId),
        cleanPaths: [],
      };
    }
    case "tickets": {
      const store = createTicketStore(cwd);
      const result = await store.syncTicketWorkspaceProjectionAsync();
      return {
        fileCount: result.projected.length,
        writeCounts: summarizeWriteCounts(result.projected.map((entry) => entry.write.status)),
        updatedRefs: result.projected.map((entry) => entry.ticketId),
        cleanPaths: [],
      };
    }
  }
}

async function runFamilyReconcile(
  cwd: string,
  family: LoomProjectionFamily,
  selection: LoomProjectionSelectionInput,
): Promise<Pick<WorkspaceSyncFamilyActionResult, "fileCount" | "writeCounts" | "updatedRefs" | "cleanPaths">> {
  switch (family) {
    case "constitution": {
      await reconcileConstitutionProjections(cwd, selection);
      const refreshed = await exportConstitutionProjections(cwd);
      return {
        fileCount: refreshed.files.length,
        writeCounts: summarizeWriteCounts(refreshed.files.map((file) => file.write.status)),
        updatedRefs: [],
        cleanPaths: [],
      };
    }
    case "specs": {
      const updated = await reconcileSpecProjections(cwd, selection);
      const refreshed = await exportSpecProjections(cwd);
      return {
        fileCount: refreshed.files.length,
        writeCounts: summarizeWriteCounts(refreshed.files.map((file) => file.write.status)),
        updatedRefs: updated.map((record) => record.state.changeId),
        cleanPaths: [],
      };
    }
    case "initiatives": {
      const updated = await reconcileInitiativeProjections(cwd, selection);
      const refreshed = await exportInitiativeProjections(cwd);
      return {
        fileCount: refreshed.files.length,
        writeCounts: summarizeWriteCounts(refreshed.files.map((file) => file.write.status)),
        updatedRefs: updated.map((record) => record.state.initiativeId),
        cleanPaths: [],
      };
    }
    case "research": {
      const updated = await reconcileResearchProjections(cwd, selection);
      const refreshed = await exportResearchProjections(cwd);
      return {
        fileCount: refreshed.files.length,
        writeCounts: summarizeWriteCounts(refreshed.files.map((file) => file.write.status)),
        updatedRefs: updated.map((record) => record.state.researchId),
        cleanPaths: [],
      };
    }
    case "plans": {
      const updated = await reconcilePlanProjections(cwd, selection);
      const refreshed = await exportPlanProjections(cwd);
      return {
        fileCount: refreshed.files.length,
        writeCounts: summarizeWriteCounts(refreshed.files.map((file) => file.write.status)),
        updatedRefs: updated.map((plan) => plan.state.planId),
        cleanPaths: [],
      };
    }
    case "docs": {
      const updated = await reconcileDocumentationProjections(cwd, selection);
      const refreshed = await exportDocumentationProjections(cwd);
      return {
        fileCount: refreshed.files.length,
        writeCounts: summarizeWriteCounts(refreshed.files.map((file) => file.write.status)),
        updatedRefs: updated.map((document) => document.state.docId),
        cleanPaths: [],
      };
    }
    case "tickets": {
      const store = createTicketStore(cwd);
      const updated = await store.reconcileTicketWorkspaceProjectionsAsync(selection);
      const refreshed = await store.syncTicketWorkspaceProjectionAsync();
      return {
        fileCount: refreshed.projected.length,
        writeCounts: summarizeWriteCounts(refreshed.projected.map((entry) => entry.write.status)),
        updatedRefs: updated.updated.map((record) => record.summary.id),
        cleanPaths: updated.clean,
      };
    }
  }
}

export async function readWorkspaceSyncStatus(
  cwd: string,
  input: WorkspaceSyncOperationInput = {},
): Promise<WorkspaceSyncStatusReport> {
  const families = normalizeFamilyTarget(input.family);
  const reportFamilies: WorkspaceSyncFamilyStatus[] = [];

  for (const family of families) {
    const paths = resolveProjectionPaths(cwd, family);
    const manifest = readProjectionManifest(paths.manifestPath);
    const counts = createEmptyCounts();
    if (!manifest) {
      counts.not_exported = 1;
      reportFamilies.push({
        family,
        manifestPath: paths.manifestPath,
        manifestPresent: false,
        entries: [],
        counts,
      });
      continue;
    }

    const entries = manifest.entries
      .filter((entry) => matchesSelection(entry, input))
      .map((entry) => {
        const state = assessProjectionFileState(cwd, family, entry);
        const status = state.kind as Exclude<WorkspaceSyncStatusKind, "not_exported">;
        counts[status] += 1;
        return {
          family,
          canonicalRef: entry.canonicalRef,
          relativePath: entry.relativePath,
          status,
          editability: entry.editability,
        } satisfies WorkspaceSyncStatusEntry;
      });

    reportFamilies.push({
      family,
      manifestPath: paths.manifestPath,
      manifestPresent: true,
      entries,
      counts,
    });
  }

  return { families: reportFamilies, selection: input };
}

export async function runWorkspaceSyncAction(
  cwd: string,
  action: WorkspaceSyncAction,
  input: WorkspaceSyncOperationInput = {},
): Promise<WorkspaceSyncActionReport> {
  const families = normalizeFamilyTarget(input.family);
  if (action !== "reconcile" && ((input.relativePaths?.length ?? 0) > 0 || (input.canonicalRefs?.length ?? 0) > 0)) {
    throw new Error(`${action} operates at workspace or family scope only.`);
  }

  const results: WorkspaceSyncFamilyActionResult[] = [];
  for (const family of families) {
    const result = action === "reconcile" ? await runFamilyReconcile(cwd, family, input) : await runFamilyExport(cwd, family);
    results.push({ family, ...result });
  }

  return { action, families: results, selection: input };
}

export function renderWorkspaceSyncStatus(report: WorkspaceSyncStatusReport): string {
  const lines: string[] = [];
  for (const family of report.families) {
    if (!family.manifestPresent) {
      lines.push(`${family.family}: not exported`);
      continue;
    }
    lines.push(`${family.family}: clean=${family.counts.clean} modified=${family.counts.modified} missing=${family.counts.missing}`);
    for (const entry of family.entries) {
      lines.push(`- .loom/${entry.family}/${entry.relativePath} [${entry.status}/${entry.editability.mode}] ${entry.canonicalRef}`);
    }
  }
  return lines.join("\n") || "No Loom sync status available.";
}

export function renderWorkspaceSyncAction(report: WorkspaceSyncActionReport): string {
  const lines = [`Loom ${report.action}`];
  for (const family of report.families) {
    lines.push(
      `${family.family}: files=${family.fileCount} created=${family.writeCounts.created} updated=${family.writeCounts.updated} unchanged=${family.writeCounts.unchanged}`,
    );
    if (family.updatedRefs.length > 0) {
      lines.push(`  Refs: ${family.updatedRefs.join(", ")}`);
    }
    if (family.cleanPaths.length > 0) {
      lines.push(`  Clean targets: ${family.cleanPaths.join(", ")}`);
    }
  }
  return lines.join("\n");
}
