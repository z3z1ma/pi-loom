import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const LOOM_PROJECTION_SCHEMA_VERSION = 1 as const;
export const LOOM_PROJECTION_ROOT_DIRNAME = ".loom" as const;
export const LOOM_PROJECTION_MANIFEST_FILENAME = "manifest.json" as const;

const GITIGNORE_MANAGED_BLOCK_START = "# BEGIN pi-loom workspace projections";
const GITIGNORE_MANAGED_BLOCK_END = "# END pi-loom workspace projections";
const GITIGNORE_MANAGED_BLOCK_LINES = [
  "# High-churn local ticket projections stay untracked by default.",
  "tickets/",
  "",
  "# Reconcile scratch and conflict leftovers are never shared truth.",
  ".reconcile/",
  "**/*.conflict.md",
  "**/*.orig",
  "**/*.rej",
] as const;

export const LOOM_PROJECTION_FAMILIES = [
  "constitution",
  "specs",
  "initiatives",
  "research",
  "plans",
  "docs",
  "tickets",
] as const;

export type LoomProjectionFamily = (typeof LOOM_PROJECTION_FAMILIES)[number];
export type LoomProjectionEditabilityMode = "read_only" | "full" | "sections";
export type LoomProjectionDirtyStateKind = "clean" | "missing" | "modified";
export type LoomProjectionWriteStatus = "created" | "updated" | "unchanged";

export interface LoomProjectionEditability {
  mode: LoomProjectionEditabilityMode;
  editableSections?: string[];
}

export interface LoomProjectionManifestEntry {
  canonicalRef: string;
  relativePath: string;
  contentHash: string;
  revisionToken: string;
  baseVersion: number | null;
  editability: LoomProjectionEditability;
  metadata?: Record<string, unknown>;
}

export interface LoomProjectionManifest {
  schemaVersion: typeof LOOM_PROJECTION_SCHEMA_VERSION;
  family: LoomProjectionFamily;
  entries: LoomProjectionManifestEntry[];
  metadata?: Record<string, unknown>;
}

export interface LoomProjectionFamilyDefinition {
  family: LoomProjectionFamily;
  directoryName: string;
  manifestFileName: typeof LOOM_PROJECTION_MANIFEST_FILENAME;
  defaultGitIgnored: boolean;
}

export interface LoomProjectionConfigInput {
  rootDirName?: string;
  enabledFamilies?: readonly LoomProjectionFamily[] | "all" | null;
}

export interface LoomProjectionConfig {
  rootDirName: string;
  enabledFamilies: LoomProjectionFamily[];
}

export interface LoomProjectionPaths {
  repositoryRoot: string;
  rootDir: string;
  family: LoomProjectionFamily;
  familyDir: string;
  manifestPath: string;
}

export interface LoomProjectionWriteResult {
  path: string;
  status: LoomProjectionWriteStatus;
  contentHash: string;
  previousContentHash: string | null;
}

export interface LoomProjectionRevisionInput {
  canonicalRef: string;
  semanticInput: Record<string, unknown>;
  baseVersion?: number | null;
}

export interface CreateProjectionManifestEntryInput {
  canonicalRef: string;
  relativePath: string;
  renderedContent: string;
  revision: LoomProjectionRevisionInput;
  editability: LoomProjectionEditability;
  metadata?: Record<string, unknown>;
}

export interface LoomProjectionDirtyState {
  kind: LoomProjectionDirtyStateKind;
  absolutePath: string;
  relativePath: string;
  expectedContentHash: string;
  actualContentHash: string | null;
  revisionToken: string;
  baseVersion: number | null;
}

const PROJECTION_FAMILY_DEFINITIONS: Record<LoomProjectionFamily, LoomProjectionFamilyDefinition> = {
  constitution: {
    family: "constitution",
    directoryName: "constitution",
    manifestFileName: LOOM_PROJECTION_MANIFEST_FILENAME,
    defaultGitIgnored: false,
  },
  specs: {
    family: "specs",
    directoryName: "specs",
    manifestFileName: LOOM_PROJECTION_MANIFEST_FILENAME,
    defaultGitIgnored: false,
  },
  initiatives: {
    family: "initiatives",
    directoryName: "initiatives",
    manifestFileName: LOOM_PROJECTION_MANIFEST_FILENAME,
    defaultGitIgnored: false,
  },
  research: {
    family: "research",
    directoryName: "research",
    manifestFileName: LOOM_PROJECTION_MANIFEST_FILENAME,
    defaultGitIgnored: false,
  },
  plans: {
    family: "plans",
    directoryName: "plans",
    manifestFileName: LOOM_PROJECTION_MANIFEST_FILENAME,
    defaultGitIgnored: false,
  },
  docs: {
    family: "docs",
    directoryName: "docs",
    manifestFileName: LOOM_PROJECTION_MANIFEST_FILENAME,
    defaultGitIgnored: false,
  },
  tickets: {
    family: "tickets",
    directoryName: "tickets",
    manifestFileName: LOOM_PROJECTION_MANIFEST_FILENAME,
    defaultGitIgnored: true,
  },
};

function normalizeProjectionRootDirName(value: string | undefined): string {
  const trimmed = value?.trim() || LOOM_PROJECTION_ROOT_DIRNAME;
  const normalized = path.posix.normalize(trimmed.split(path.sep).join(path.posix.sep));
  if (!normalized || normalized === ".") {
    throw new Error("Projection root directory must not be empty.");
  }
  if (path.posix.isAbsolute(normalized)) {
    throw new Error(`Projection root directory ${value} must be repository-relative.`);
  }
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`Projection root directory ${value} escapes the repository root.`);
  }
  return normalized;
}

export function normalizeProjectionRelativePath(value: string): string {
  const normalized = path.posix.normalize(value.split(path.sep).join(path.posix.sep).trim());
  if (!normalized || normalized === ".") {
    throw new Error("Projection-relative path must not be empty.");
  }
  if (path.posix.isAbsolute(normalized)) {
    throw new Error(`Projection-relative path ${value} must be repository-relative.`);
  }
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`Projection-relative path ${value} escapes the projection family root.`);
  }
  return normalized;
}

export function normalizeProjectionConfig(input: LoomProjectionConfigInput = {}): LoomProjectionConfig {
  const enabledFamilies = input.enabledFamilies;
  const normalizedFamilies =
    enabledFamilies === "all" || enabledFamilies == null
      ? [...LOOM_PROJECTION_FAMILIES]
      : [...new Set(enabledFamilies)].sort(
          (left, right) => LOOM_PROJECTION_FAMILIES.indexOf(left) - LOOM_PROJECTION_FAMILIES.indexOf(right),
        );

  for (const family of normalizedFamilies) {
    if (!LOOM_PROJECTION_FAMILIES.includes(family)) {
      throw new Error(`Unknown projection family ${String(family)}.`);
    }
  }

  return {
    rootDirName: normalizeProjectionRootDirName(input.rootDirName),
    enabledFamilies: normalizedFamilies,
  };
}

export function listProjectionFamilyDefinitions(): LoomProjectionFamilyDefinition[] {
  return LOOM_PROJECTION_FAMILIES.map((family) => PROJECTION_FAMILY_DEFINITIONS[family]);
}

export function getProjectionFamilyDefinition(family: LoomProjectionFamily): LoomProjectionFamilyDefinition {
  return PROJECTION_FAMILY_DEFINITIONS[family];
}

export function resolveProjectionPaths(
  repositoryRoot: string,
  family: LoomProjectionFamily,
  configInput: LoomProjectionConfigInput = {},
): LoomProjectionPaths {
  const config = normalizeProjectionConfig(configInput);
  const definition = getProjectionFamilyDefinition(family);
  const rootDir = path.join(repositoryRoot, config.rootDirName);
  const familyDir = path.join(rootDir, definition.directoryName);
  return {
    repositoryRoot,
    rootDir,
    family,
    familyDir,
    manifestPath: path.join(familyDir, definition.manifestFileName),
  };
}

export function resolveProjectionFilePath(
  repositoryRoot: string,
  family: LoomProjectionFamily,
  relativePath: string,
  configInput: LoomProjectionConfigInput = {},
): string {
  const normalizedRelativePath = normalizeProjectionRelativePath(relativePath);
  return path.join(resolveProjectionPaths(repositoryRoot, family, configInput).familyDir, normalizedRelativePath);
}

function normalizeEditability(editability: LoomProjectionEditability): LoomProjectionEditability {
  const mode = editability.mode;
  if (mode === "sections") {
    const editableSections = [
      ...new Set(editability.editableSections?.map((value) => value.trim()).filter(Boolean) ?? []),
    ].sort((left, right) => left.localeCompare(right));
    if (editableSections.length === 0) {
      throw new Error("Section-editable projections must declare at least one editable section.");
    }
    return { mode, editableSections };
  }
  return { mode };
}

function normalizeProjectionMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) {
    return undefined;
  }
  const normalized = stableJsonValue(metadata);
  if (!normalized || Array.isArray(normalized) || typeof normalized !== "object") {
    throw new Error("Projection metadata must be a JSON object.");
  }
  return Object.keys(normalized).length > 0 ? (normalized as Record<string, unknown>) : undefined;
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stableJsonValue(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableJsonValue(entry)]),
    );
  }
  return value;
}

export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(stableJsonValue(value), null, 2);
}

export function hashProjectionContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function createProjectionRevisionToken(input: LoomProjectionRevisionInput): string {
  // Revision tokens should capture only the canonical facts that make an on-disk edit stale.
  // Do not feed volatile timestamps or bookkeeping counters here unless a change really affects
  // the rendered/reconcilable projection, or every no-op canonical touch will churn manifests.
  return createHash("sha256")
    .update(
      stableJsonStringify({
        canonicalRef: input.canonicalRef,
        baseVersion: input.baseVersion ?? null,
        semanticInput: input.semanticInput,
      }),
    )
    .digest("hex");
}

export function createProjectionManifestEntry(input: CreateProjectionManifestEntryInput): LoomProjectionManifestEntry {
  const canonicalRef = input.canonicalRef.trim();
  if (!canonicalRef) {
    throw new Error("Projection manifest entries require a canonical ref.");
  }
  const revisionCanonicalRef = input.revision.canonicalRef.trim();
  if (revisionCanonicalRef !== canonicalRef) {
    throw new Error(
      `Projection manifest entry ${canonicalRef} must reuse the same canonical ref in its revision descriptor.`,
    );
  }
  return {
    canonicalRef,
    relativePath: normalizeProjectionRelativePath(input.relativePath),
    contentHash: hashProjectionContent(input.renderedContent),
    revisionToken: createProjectionRevisionToken(input.revision),
    baseVersion: input.revision.baseVersion ?? null,
    editability: normalizeEditability(input.editability),
    metadata: normalizeProjectionMetadata(input.metadata),
  };
}

function normalizeProjectionManifestEntryRecord(entry: LoomProjectionManifestEntry): LoomProjectionManifestEntry {
  const canonicalRef = entry.canonicalRef.trim();
  if (!canonicalRef) {
    throw new Error("Projection manifest entries require a canonical ref.");
  }
  const contentHash = entry.contentHash.trim();
  if (!contentHash) {
    throw new Error(`Projection manifest entry ${canonicalRef} requires a content hash.`);
  }
  const revisionToken = entry.revisionToken.trim();
  if (!revisionToken) {
    throw new Error(`Projection manifest entry ${canonicalRef} requires a revision token.`);
  }
  return {
    canonicalRef,
    relativePath: normalizeProjectionRelativePath(entry.relativePath),
    contentHash,
    revisionToken,
    baseVersion: typeof entry.baseVersion === "number" ? entry.baseVersion : null,
    editability: normalizeEditability(entry.editability),
    metadata: normalizeProjectionMetadata(entry.metadata),
  };
}

export function sortProjectionManifestEntries(
  entries: readonly LoomProjectionManifestEntry[],
): LoomProjectionManifestEntry[] {
  return [...entries].sort(
    (left, right) =>
      left.relativePath.localeCompare(right.relativePath) || left.canonicalRef.localeCompare(right.canonicalRef),
  );
}

export function createProjectionManifest(
  family: LoomProjectionFamily,
  entries: readonly LoomProjectionManifestEntry[],
  metadata?: Record<string, unknown>,
): LoomProjectionManifest {
  return {
    schemaVersion: LOOM_PROJECTION_SCHEMA_VERSION,
    family,
    entries: sortProjectionManifestEntries(entries.map((entry) => normalizeProjectionManifestEntryRecord(entry))),
    metadata: normalizeProjectionMetadata(metadata),
  };
}

function ensureDirectory(dirPath: string): boolean {
  if (existsSync(dirPath)) {
    return false;
  }
  mkdirSync(dirPath, { recursive: true });
  return true;
}

export function writeProjectionFile(filePath: string, content: string): LoomProjectionWriteResult {
  const normalizedContent = content.endsWith("\n") ? content : `${content}\n`;
  const nextHash = hashProjectionContent(normalizedContent);
  const previous = existsSync(filePath) ? readFileSync(filePath, "utf-8") : null;
  const previousHash = previous === null ? null : hashProjectionContent(previous);
  if (previous === normalizedContent) {
    return {
      path: filePath,
      status: "unchanged",
      contentHash: nextHash,
      previousContentHash: previousHash,
    };
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, normalizedContent, "utf-8");
  return {
    path: filePath,
    status: previous === null ? "created" : "updated",
    contentHash: nextHash,
    previousContentHash: previousHash,
  };
}

export function writeProjectionManifest(filePath: string, manifest: LoomProjectionManifest): LoomProjectionWriteResult {
  const normalizedManifest = createProjectionManifest(manifest.family, manifest.entries, manifest.metadata);
  return writeProjectionFile(filePath, stableJsonStringify(normalizedManifest));
}

export function readProjectionManifest(filePath: string): LoomProjectionManifest | null {
  if (!existsSync(filePath)) {
    return null;
  }
  const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as Partial<LoomProjectionManifest>;
  if (parsed.schemaVersion !== LOOM_PROJECTION_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported projection manifest schema ${String(parsed.schemaVersion)} in ${filePath}; expected ${LOOM_PROJECTION_SCHEMA_VERSION}.`,
    );
  }
  if (!parsed.family || !LOOM_PROJECTION_FAMILIES.includes(parsed.family)) {
    throw new Error(`Projection manifest ${filePath} has unknown family ${String(parsed.family)}.`);
  }
  if (!Array.isArray(parsed.entries)) {
    throw new Error(`Projection manifest ${filePath} must contain an entries array.`);
  }
  return createProjectionManifest(parsed.family, parsed.entries as LoomProjectionManifestEntry[], parsed.metadata);
}

function renderManagedGitignoreBlock(): string {
  return [GITIGNORE_MANAGED_BLOCK_START, ...GITIGNORE_MANAGED_BLOCK_LINES, GITIGNORE_MANAGED_BLOCK_END].join("\n");
}

function upsertManagedGitignoreBlock(existing: string | null): string {
  const managedBlock = renderManagedGitignoreBlock();
  if (!existing || existing.trim().length === 0) {
    return `${managedBlock}\n`;
  }

  const startIndex = existing.indexOf(GITIGNORE_MANAGED_BLOCK_START);
  const endIndex = existing.indexOf(GITIGNORE_MANAGED_BLOCK_END);
  if (startIndex >= 0 && endIndex >= startIndex) {
    const afterEnd = endIndex + GITIGNORE_MANAGED_BLOCK_END.length;
    const replaced = `${existing.slice(0, startIndex)}${managedBlock}${existing.slice(afterEnd)}`;
    return replaced.endsWith("\n") ? replaced : `${replaced}\n`;
  }

  const trimmed = existing.trimEnd();
  return `${trimmed}\n\n${managedBlock}\n`;
}

export function ensureProjectionGitignore(
  repositoryRoot: string,
  configInput: LoomProjectionConfigInput = {},
): LoomProjectionWriteResult {
  const config = normalizeProjectionConfig(configInput);
  const gitignorePath = path.join(repositoryRoot, config.rootDirName, ".gitignore");
  const existing = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf-8") : null;
  return writeProjectionFile(gitignorePath, upsertManagedGitignoreBlock(existing));
}

export function ensureProjectionWorkspace(
  repositoryRoot: string,
  configInput: LoomProjectionConfigInput = {},
): {
  config: LoomProjectionConfig;
  rootDir: string;
  gitignore: LoomProjectionWriteResult;
  families: Array<LoomProjectionPaths & { created: boolean }>;
} {
  const config = normalizeProjectionConfig(configInput);
  const rootDir = path.join(repositoryRoot, config.rootDirName);
  ensureDirectory(rootDir);
  const families = config.enabledFamilies.map((family) => {
    const paths = resolveProjectionPaths(repositoryRoot, family, config);
    return { ...paths, created: ensureDirectory(paths.familyDir) };
  });

  return {
    config,
    rootDir,
    gitignore: ensureProjectionGitignore(repositoryRoot, config),
    families,
  };
}

export function assessProjectionContentState(
  entry: LoomProjectionManifestEntry,
  currentContent: string | null,
  absolutePath: string,
): LoomProjectionDirtyState {
  const currentHash = currentContent === null ? null : hashProjectionContent(currentContent);
  return {
    kind: currentHash === null ? "missing" : currentHash === entry.contentHash ? "clean" : "modified",
    absolutePath,
    relativePath: entry.relativePath,
    expectedContentHash: entry.contentHash,
    actualContentHash: currentHash,
    revisionToken: entry.revisionToken,
    baseVersion: entry.baseVersion,
  };
}

export function assessProjectionFileState(
  repositoryRoot: string,
  family: LoomProjectionFamily,
  entry: LoomProjectionManifestEntry,
  configInput: LoomProjectionConfigInput = {},
): LoomProjectionDirtyState {
  const absolutePath = resolveProjectionFilePath(repositoryRoot, family, entry.relativePath, configInput);
  const currentContent = existsSync(absolutePath) ? readFileSync(absolutePath, "utf-8") : null;
  return assessProjectionContentState(entry, currentContent, absolutePath);
}
