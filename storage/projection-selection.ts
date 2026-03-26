import type { LoomProjectionFamily, LoomProjectionManifestEntry } from "./projections.js";

export interface LoomProjectionSelectionInput {
  relativePaths?: readonly string[] | null;
  canonicalRefs?: readonly string[] | null;
}

export interface LoomProjectionSelection {
  relativePaths: Set<string>;
  canonicalRefs: Set<string>;
  hasSelection: boolean;
}

function normalizeValues(values: readonly string[] | null | undefined): Set<string> {
  return new Set(values?.map((value) => value.trim()).filter(Boolean) ?? []);
}

export function normalizeProjectionSelection(
  input: LoomProjectionSelectionInput | null | undefined,
): LoomProjectionSelection {
  const relativePaths = normalizeValues(input?.relativePaths);
  const canonicalRefs = normalizeValues(input?.canonicalRefs);
  return {
    relativePaths,
    canonicalRefs,
    hasSelection: relativePaths.size > 0 || canonicalRefs.size > 0,
  };
}

export function projectionEntryMatchesSelection(
  family: LoomProjectionFamily,
  entry: Pick<LoomProjectionManifestEntry, "relativePath" | "canonicalRef">,
  selection: LoomProjectionSelection,
): boolean {
  if (!selection.hasSelection) {
    return true;
  }
  return (
    selection.canonicalRefs.has(entry.canonicalRef) ||
    selection.relativePaths.has(entry.relativePath) ||
    selection.relativePaths.has(`${family}/${entry.relativePath}`)
  );
}
