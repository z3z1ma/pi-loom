import {
  createProjectionManifest,
  createProjectionManifestEntry,
  type LoomProjectionEditability,
  type LoomProjectionFamily,
  type LoomProjectionManifest,
  type LoomProjectionManifestEntry,
} from "./projections.js";

export interface WorkspaceProjectionDocument {
  family: LoomProjectionFamily;
  canonicalRef: string;
  relativePath: string;
  renderedContent: string;
  manifestEntry: LoomProjectionManifestEntry;
}

export interface CreateWorkspaceProjectionDocumentInput {
  family: LoomProjectionFamily;
  canonicalRef: string;
  relativePath: string;
  renderedContent: string;
  semanticInput: Record<string, unknown>;
  editability: LoomProjectionEditability;
  baseVersion?: number | null;
}

export function createWorkspaceProjectionDocument(
  input: CreateWorkspaceProjectionDocumentInput,
): WorkspaceProjectionDocument {
  return {
    family: input.family,
    canonicalRef: input.canonicalRef,
    relativePath: input.relativePath,
    renderedContent: input.renderedContent,
    manifestEntry: createProjectionManifestEntry({
      canonicalRef: input.canonicalRef,
      relativePath: input.relativePath,
      renderedContent: input.renderedContent,
      revision: {
        canonicalRef: input.canonicalRef,
        semanticInput: input.semanticInput,
        baseVersion: input.baseVersion ?? null,
      },
      editability: input.editability,
    }),
  };
}

export function createWorkspaceProjectionManifest(
  family: LoomProjectionFamily,
  documents: readonly WorkspaceProjectionDocument[],
): LoomProjectionManifest {
  for (const document of documents) {
    if (document.family !== family) {
      throw new Error(
        `Workspace projection manifest for ${family} cannot include ${document.family}:${document.canonicalRef}.`,
      );
    }
  }
  return createProjectionManifest(
    family,
    documents.map((document) => document.manifestEntry),
  );
}
