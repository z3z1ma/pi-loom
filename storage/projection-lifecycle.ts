import {
  assessProjectionFileState,
  ensureProjectionWorkspace,
  LOOM_PROJECTION_FAMILIES,
  type LoomProjectionDirtyStateKind,
  type LoomProjectionFamily,
  readProjectionManifest,
  resolveProjectionPaths,
} from "./projections.js";

export interface WorkspaceProjectionDirtyEntry {
  family: LoomProjectionFamily;
  canonicalRef: string;
  relativePath: string;
  status: Exclude<LoomProjectionDirtyStateKind, "clean">;
}

export interface WorkspaceProjectionDirtyFamily {
  family: LoomProjectionFamily;
  entries: WorkspaceProjectionDirtyEntry[];
  counts: Record<Exclude<LoomProjectionDirtyStateKind, "clean">, number>;
}

export interface WorkspaceProjectionDirtyReport {
  families: WorkspaceProjectionDirtyFamily[];
  totals: Record<Exclude<LoomProjectionDirtyStateKind, "clean">, number>;
}

function emptyCounts(): Record<Exclude<LoomProjectionDirtyStateKind, "clean">, number> {
  return { modified: 0, missing: 0 };
}

export function ensureWorkspaceProjectionBootstrap(repositoryRoot: string) {
  return ensureProjectionWorkspace(repositoryRoot, { enabledFamilies: LOOM_PROJECTION_FAMILIES });
}

export function hasExportedProjectionFamily(repositoryRoot: string, family: LoomProjectionFamily): boolean {
  return readProjectionManifest(resolveProjectionPaths(repositoryRoot, family).manifestPath) !== null;
}

export function readWorkspaceProjectionDirtyReport(
  repositoryRoot: string,
  families: readonly LoomProjectionFamily[] = LOOM_PROJECTION_FAMILIES,
): WorkspaceProjectionDirtyReport {
  const dirtyFamilies: WorkspaceProjectionDirtyFamily[] = [];
  const totals = emptyCounts();

  for (const family of families) {
    const manifest = readProjectionManifest(resolveProjectionPaths(repositoryRoot, family).manifestPath);
    if (!manifest) {
      continue;
    }

    const counts = emptyCounts();
    const entries = manifest.entries.flatMap((entry) => {
      const state = assessProjectionFileState(repositoryRoot, family, entry);
      if (state.kind === "clean") {
        return [];
      }
      counts[state.kind] += 1;
      totals[state.kind] += 1;
      return [
        {
          family,
          canonicalRef: entry.canonicalRef,
          relativePath: entry.relativePath,
          status: state.kind,
        } satisfies WorkspaceProjectionDirtyEntry,
      ];
    });

    if (entries.length > 0) {
      dirtyFamilies.push({ family, entries, counts });
    }
  }

  return { families: dirtyFamilies, totals };
}

export function renderWorkspaceProjectionDirtySummary(report: WorkspaceProjectionDirtyReport): string | undefined {
  if (report.families.length === 0) {
    return undefined;
  }
  const familySummaries = report.families.map((family) => {
    const parts: string[] = [];
    if (family.counts.modified > 0) {
      parts.push(`${family.counts.modified} modified`);
    }
    if (family.counts.missing > 0) {
      parts.push(`${family.counts.missing} missing`);
    }
    return `${family.family} ${parts.join(", ")}`;
  });
  return `Projections dirty · ${familySummaries.join("; ")}`;
}

export function renderWorkspaceProjectionBlocker(operation: string, report: WorkspaceProjectionDirtyReport): string {
  const lines = [
    `Blocked ${operation} because exported workspace projections are dirty.`,
    ...report.families.flatMap((family) =>
      family.entries.map((entry) => `- ${entry.family}/${entry.relativePath} [${entry.status}] ${entry.canonicalRef}`),
    ),
    "",
    "Recover explicitly before retrying:",
    "- Inspect the dirty files with projection_status for the listed family or families.",
    '- Import intentional edits with projection_write(action="reconcile", family=...) so canonical state matches the repository projection.',
    '- Discard unreconciled disk edits with projection_write(action="refresh", family=...) or by reverting the files yourself.',
    "Hidden auto-import is disabled, so canonical writes and packet launches fail closed while projections are dirty.",
  ];
  return lines.join("\n");
}

export function assertWorkspaceProjectionFamiliesClean(
  repositoryRoot: string,
  operation: string,
  families: readonly LoomProjectionFamily[] = LOOM_PROJECTION_FAMILIES,
): void {
  const report = readWorkspaceProjectionDirtyReport(repositoryRoot, families);
  if (report.families.length > 0) {
    throw new Error(renderWorkspaceProjectionBlocker(operation, report));
  }
}

export async function runProjectionAwareOperation<T>(input: {
  repositoryRoot: string;
  operation: string;
  families: readonly LoomProjectionFamily[];
  action: () => Promise<T>;
  refresh?: () => Promise<void>;
}): Promise<T> {
  assertWorkspaceProjectionFamiliesClean(input.repositoryRoot, input.operation, input.families);
  const result = await input.action();
  if (input.refresh) {
    try {
      await input.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Canonical write succeeded but projection refresh failed after ${input.operation}.\n\n${message}`,
      );
    }
  }
  return result;
}
