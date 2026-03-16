import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { LoomCanonicalStorage, LoomEntityKind, LoomEntityRecord, LoomProjectionRecord } from "./contract.js";
import { assertRepoRelativePath, isRepoRelativePath } from "./contract.js";
import { createEntityId, createEventId, createLinkId, createProjectionId } from "./ids.js";
import { isLocalRuntimePath, isMarkdownBodyProjection } from "./projections.js";
import { resolveWorkspaceIdentity } from "./repository.js";

interface ImportedFile {
  relativePath: string;
  content: string;
}

interface ImportedEntityBucket {
  kind: LoomEntityKind;
  displayId: string | null;
  title: string;
  summary: string;
  status: string;
  files: ImportedFile[];
}

function walkFiles(rootDir: string, currentDir = rootDir): string[] {
  return readdirSync(currentDir)
    .flatMap((entry) => {
      const absolutePath = path.join(currentDir, entry);
      const stats = statSync(absolutePath);
      if (stats.isDirectory()) {
        return walkFiles(rootDir, absolutePath);
      }
      return [absolutePath];
    })
    .sort((left, right) => left.localeCompare(right));
}

function pickText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseJsonSummary(content: string): { title: string | null; summary: string | null; status: string | null } {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return {
      title:
        pickText(parsed.title) ??
        pickText(parsed.docId) ??
        pickText(parsed.planId) ??
        pickText(parsed.changeId) ??
        pickText(parsed.initiativeId) ??
        pickText(parsed.researchId) ??
        pickText(parsed.critiqueId) ??
        pickText(parsed.runId) ??
        pickText(parsed.projectId) ??
        pickText(parsed.workerId),
      summary: pickText(parsed.summary) ?? pickText(parsed.objective) ?? pickText(parsed.statusSummary),
      status: pickText(parsed.status),
    };
  } catch {
    return { title: null, summary: null, status: null };
  }
}

function parseMarkdownSummary(content: string): { title: string | null; summary: string | null } {
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const paragraphMatch = content
    .split(/\r?\n\r?\n/)
    .map((part) => part.trim())
    .find((part) => part.length > 0 && !part.startsWith("---") && !part.startsWith("#"));
  return {
    title: titleMatch?.[1]?.trim() ?? null,
    summary: paragraphMatch ?? null,
  };
}

function resolveEntityBucket(relativePath: string, content: string): ImportedEntityBucket | null {
  const normalized = relativePath.replace(/\\/g, "/");
  const jsonSummary = normalized.endsWith(".json") || normalized.endsWith(".jsonl") ? parseJsonSummary(content) : null;
  const markdownSummary = normalized.endsWith(".md") ? parseMarkdownSummary(content) : null;

  const createBucket = (
    kind: LoomEntityKind,
    displayId: string | null,
    titleFallback: string,
  ): ImportedEntityBucket => ({
    kind,
    displayId,
    title: jsonSummary?.title ?? markdownSummary?.title ?? titleFallback,
    summary: jsonSummary?.summary ?? markdownSummary?.summary ?? "",
    status: jsonSummary?.status ?? "active",
    files: [{ relativePath, content }],
  });

  if (normalized.startsWith(".loom/constitution/")) {
    return createBucket("constitution", "constitution", "Constitution");
  }

  const docMatch = normalized.match(/^\.loom\/docs\/[^/]+\/([^/]+)\//);
  if (docMatch) {
    return createBucket("documentation", docMatch[1] ?? null, docMatch[1] ?? "Documentation");
  }

  const researchMatch = normalized.match(/^\.loom\/research\/([^/]+)\//);
  if (researchMatch) {
    return createBucket("research", researchMatch[1] ?? null, researchMatch[1] ?? "Research");
  }

  const initiativeMatch = normalized.match(/^\.loom\/initiatives\/([^/]+)\//);
  if (initiativeMatch) {
    return createBucket("initiative", initiativeMatch[1] ?? null, initiativeMatch[1] ?? "Initiative");
  }

  const planMatch = normalized.match(/^\.loom\/plans\/([^/]+)\//);
  if (planMatch) {
    return createBucket("plan", planMatch[1] ?? null, planMatch[1] ?? "Plan");
  }

  const critiqueMatch = normalized.match(/^\.loom\/critiques\/([^/]+)\//);
  if (critiqueMatch) {
    return createBucket("critique", critiqueMatch[1] ?? null, critiqueMatch[1] ?? "Critique");
  }

  const workerMatch = normalized.match(/^\.loom\/workers\/([^/]+)\//);
  if (workerMatch) {
    return createBucket("worker", workerMatch[1] ?? null, workerMatch[1] ?? "Worker");
  }

  const ralphMatch = normalized.match(/^\.loom\/ralph\/([^/]+)\//);
  if (ralphMatch) {
    return createBucket("ralph_run", ralphMatch[1] ?? null, ralphMatch[1] ?? "Ralph Run");
  }

  const changeMatch = normalized.match(/^\.loom\/specs\/changes\/([^/]+)\//);
  if (changeMatch) {
    return createBucket("spec_change", changeMatch[1] ?? null, changeMatch[1] ?? "Spec Change");
  }

  const capabilityMatch = normalized.match(/^\.loom\/specs\/capabilities\/([^/.]+)\.md$/);
  if (capabilityMatch) {
    return createBucket("spec_capability", capabilityMatch[1] ?? null, capabilityMatch[1] ?? "Spec Capability");
  }

  const ticketMatch = normalized.match(/^\.loom\/tickets\/(?:closed\/)?(t-[^./]+)(?:\.|\.md$)/);
  if (ticketMatch) {
    return createBucket("ticket", ticketMatch[1] ?? null, ticketMatch[1] ?? "Ticket");
  }

  const artifactMatch = normalized.match(/^\.loom\/(artifacts|checkpoints)\/([^/.]+)/);
  if (artifactMatch) {
    return createBucket("artifact", artifactMatch[2] ?? null, artifactMatch[2] ?? "Artifact");
  }

  return null;
}

function mergeBuckets(existing: ImportedEntityBucket | undefined, next: ImportedEntityBucket): ImportedEntityBucket {
  if (!existing) {
    return next;
  }
  return {
    ...existing,
    title: existing.title || next.title,
    summary: existing.summary || next.summary,
    status: existing.status !== "active" ? existing.status : next.status,
    files: [...existing.files, ...next.files],
  };
}

type ImportedLinkTargetKind =
  | "research"
  | "initiative"
  | "spec_change"
  | "ticket"
  | "critique"
  | "documentation"
  | "plan"
  | "ralph_run";

interface ImportedLink {
  targetKind: ImportedLinkTargetKind;
  targetDisplayId: string;
  kind: "references" | "depends_on" | "belongs_to";
}

function parseJsonObject(files: ImportedFile[]): Record<string, unknown> | null {
  const stateFile = files.find(
    (file) => file.relativePath.endsWith("/state.json") || file.relativePath.endsWith("state.json"),
  );
  if (!stateFile) {
    return null;
  }
  try {
    return JSON.parse(stateFile.content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean);
  }
  return [];
}

function parseTicketFrontmatter(files: ImportedFile[]): Record<string, unknown> {
  const ticketMarkdown = files.find((file) => /^\.loom\/tickets\/(?:closed\/)?t-[^/]+\.md$/.test(file.relativePath));
  if (!ticketMarkdown) {
    return {};
  }

  const match = ticketMarkdown.content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return {};
  }

  const result: Record<string, unknown> = {};
  let currentKey: string | null = null;
  for (const line of match[1].split(/\r?\n/)) {
    const listMatch = line.match(/^\s*-\s+(.*)$/);
    if (listMatch && currentKey) {
      const existing = Array.isArray(result[currentKey]) ? (result[currentKey] as string[]) : [];
      existing.push(listMatch[1]?.trim() ?? "");
      result[currentKey] = existing.filter(Boolean);
      continue;
    }

    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!keyMatch) {
      currentKey = null;
      continue;
    }

    currentKey = keyMatch[1] ?? null;
    const rawValue = keyMatch[2]?.trim() ?? "";
    if (!rawValue) {
      result[currentKey] = [];
      continue;
    }
    result[currentKey] = rawValue;
  }

  return result;
}

function collectLinksFromKeys(
  source: Record<string, unknown>,
  mapping: Array<{ key: string; targetKind: ImportedLinkTargetKind; kind?: ImportedLink["kind"] }>,
): ImportedLink[] {
  return mapping.flatMap(({ key, targetKind, kind }) => {
    const values = parseStringList(source[key]);
    if (values.length > 0) {
      return values.map((value) => ({ targetKind, targetDisplayId: value, kind: kind ?? "references" }));
    }
    const single = pickText(source[key]);
    return single ? [{ targetKind, targetDisplayId: single, kind: kind ?? "references" }] : [];
  });
}

function extractImportedLinks(bucket: ImportedEntityBucket): ImportedLink[] {
  const state = parseJsonObject(bucket.files);
  const ticketFrontmatter = bucket.kind === "ticket" ? parseTicketFrontmatter(bucket.files) : null;

  switch (bucket.kind) {
    case "constitution":
      return collectLinksFromKeys(state ?? {}, [
        { key: "initiativeIds", targetKind: "initiative" },
        { key: "researchIds", targetKind: "research" },
        { key: "specChangeIds", targetKind: "spec_change" },
      ]);
    case "research":
      return collectLinksFromKeys(state ?? {}, [
        { key: "initiativeIds", targetKind: "initiative", kind: "belongs_to" },
        { key: "specChangeIds", targetKind: "spec_change" },
        { key: "ticketIds", targetKind: "ticket" },
      ]);
    case "initiative":
      return collectLinksFromKeys(state ?? {}, [
        { key: "researchIds", targetKind: "research" },
        { key: "specChangeIds", targetKind: "spec_change" },
        { key: "ticketIds", targetKind: "ticket" },
      ]);
    case "spec_change":
      return collectLinksFromKeys(state ?? {}, [
        { key: "initiativeIds", targetKind: "initiative", kind: "belongs_to" },
        { key: "researchIds", targetKind: "research" },
      ]);
    case "plan":
    case "documentation":
    case "critique": {
      const contextRefs = (state?.contextRefs ?? {}) as Record<string, unknown>;
      return collectLinksFromKeys(contextRefs, [
        { key: "initiativeIds", targetKind: "initiative" },
        { key: "researchIds", targetKind: "research" },
        { key: "specChangeIds", targetKind: "spec_change" },
        { key: "ticketIds", targetKind: "ticket" },
        { key: "critiqueIds", targetKind: "critique" },
        { key: "docIds", targetKind: "documentation" },
      ]);
    }
    case "ralph_run": {
      const linkedRefs = (state?.linkedRefs ?? {}) as Record<string, unknown>;
      return collectLinksFromKeys(linkedRefs, [
        { key: "initiativeIds", targetKind: "initiative" },
        { key: "researchIds", targetKind: "research" },
        { key: "specChangeIds", targetKind: "spec_change" },
        { key: "ticketIds", targetKind: "ticket" },
        { key: "critiqueIds", targetKind: "critique" },
        { key: "docIds", targetKind: "documentation" },
        { key: "planIds", targetKind: "plan" },
      ]);
    }
    case "ticket": {
      return [
        ...collectLinksFromKeys(ticketFrontmatter ?? {}, [
          { key: "deps", targetKind: "ticket", kind: "depends_on" },
          { key: "dependencies", targetKind: "ticket", kind: "depends_on" },
        ]),
        ...collectLinksFromKeys(ticketFrontmatter ?? {}, [{ key: "parent", targetKind: "ticket", kind: "belongs_to" }]),
        ...collectLinksFromKeys(ticketFrontmatter ?? {}, [
          { key: "initiative-ids", targetKind: "initiative", kind: "belongs_to" },
        ]),
        ...collectLinksFromKeys(ticketFrontmatter ?? {}, [{ key: "research-ids", targetKind: "research" }]),
        ...collectLinksFromKeys(ticketFrontmatter ?? {}, [{ key: "spec-change", targetKind: "spec_change" }]),
      ];
    }
    default:
      return [];
  }
}

export async function importWorkspaceSnapshot(
  cwd: string,
  storage: LoomCanonicalStorage,
): Promise<{ importedEntityIds: string[] }> {
  const identity = resolveWorkspaceIdentity(cwd);
  const loomRoot = path.join(cwd, ".loom");
  const buckets = new Map<string, ImportedEntityBucket>();

  await storage.upsertSpace(identity.space);
  await storage.upsertRepository(identity.repository);
  await storage.upsertWorktree(identity.worktree);

  if (!existsSync(loomRoot)) {
    return { importedEntityIds: [] };
  }

  for (const absolutePath of walkFiles(loomRoot)) {
    const relativePath = assertRepoRelativePath(path.relative(cwd, absolutePath).split(path.sep).join("/"));
    if (isLocalRuntimePath(relativePath)) {
      continue;
    }
    const content = readFileSync(absolutePath, "utf-8");
    const bucket = resolveEntityBucket(relativePath, content);
    if (!bucket) {
      continue;
    }
    const mapKey = `${bucket.kind}:${bucket.displayId ?? relativePath}`;
    buckets.set(mapKey, mergeBuckets(buckets.get(mapKey), bucket));
  }

  const importedEntityIds: string[] = [];
  const entityDisplayMap = new Map<string, string>();
  for (const [bucketKey, bucket] of buckets) {
    const entityId = createEntityId(bucket.kind, identity.space.id, bucket.displayId, bucketKey);
    const record: LoomEntityRecord = {
      id: entityId,
      kind: bucket.kind,
      spaceId: identity.space.id,
      owningRepositoryId: identity.repository.id,
      displayId: bucket.displayId,
      title: bucket.title,
      summary: bucket.summary,
      status: bucket.status,
      version: 1,
      tags: [bucket.kind, "imported-from-filesystem"],
      pathScopes: bucket.files.map((file) => ({
        repositoryId: identity.repository.id,
        relativePath: file.relativePath,
        role: isMarkdownBodyProjection(file.relativePath) ? "projection" : "canonical",
      })),
      attributes: {
        importedFrom: "filesystem",
        filesByPath: Object.fromEntries(bucket.files.map((file) => [file.relativePath, file.content])),
      },
      createdAt: identity.space.createdAt,
      updatedAt: identity.space.updatedAt,
    };
    await storage.upsertEntity(record);
    await storage.appendEvent({
      id: createEventId(entityId, 1),
      entityId,
      kind: "imported",
      sequence: 1,
      createdAt: identity.space.createdAt,
      actor: "filesystem-import",
      payload: { source: "filesystem", bucketKey },
    });

    if (bucket.displayId) {
      entityDisplayMap.set(`${bucket.kind}:${bucket.displayId}`, entityId);
    }

    for (const file of bucket.files.filter((entry) => isMarkdownBodyProjection(entry.relativePath))) {
      const projection: LoomProjectionRecord = {
        id: createProjectionId("markdown", entityId, file.relativePath),
        entityId,
        kind:
          bucket.kind === "constitution"
            ? "constitution_markdown_body"
            : bucket.kind === "documentation"
              ? "documentation_markdown_body"
              : "spec_markdown_body",
        materialization: "repo_materialized",
        repositoryId: identity.repository.id,
        relativePath: file.relativePath,
        contentHash: null,
        version: 1,
        content: file.content,
        createdAt: identity.space.createdAt,
        updatedAt: identity.space.updatedAt,
      };
      await storage.upsertProjection(projection);
    }

    importedEntityIds.push(entityId);
  }

  for (const bucket of buckets.values()) {
    const sourceEntityId = bucket.displayId ? entityDisplayMap.get(`${bucket.kind}:${bucket.displayId}`) : null;
    if (!sourceEntityId) {
      continue;
    }
    const links = extractImportedLinks(bucket);
    for (const link of links) {
      const targetEntityId = entityDisplayMap.get(`${link.targetKind}:${link.targetDisplayId}`);
      if (!targetEntityId) {
        continue;
      }
      await storage.upsertLink({
        id: createLinkId(link.kind, sourceEntityId, targetEntityId),
        kind: link.kind,
        fromEntityId: sourceEntityId,
        toEntityId: targetEntityId,
        metadata: { importedFrom: "filesystem" },
        createdAt: identity.space.createdAt,
        updatedAt: identity.space.updatedAt,
      });
    }
  }

  return { importedEntityIds: importedEntityIds.sort((left, right) => left.localeCompare(right)) };
}

export async function materializeRepositoryProjections(
  cwd: string,
  storage: LoomCanonicalStorage,
  entityIds: readonly string[],
): Promise<string[]> {
  const writtenPaths: string[] = [];
  for (const entityId of entityIds) {
    const projections = await storage.listProjections(entityId);
    for (const projection of projections) {
      if (
        projection.materialization !== "repo_materialized" ||
        !projection.relativePath ||
        projection.content === null
      ) {
        continue;
      }
      if (!isRepoRelativePath(projection.relativePath)) {
        throw new Error(`Projection path must stay repo-relative: ${projection.relativePath}`);
      }
      const absolutePath = path.join(cwd, projection.relativePath);
      mkdirSync(path.dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, projection.content, "utf-8");
      writtenPaths.push(projection.relativePath);
    }
  }
  return writtenPaths.sort((left, right) => left.localeCompare(right));
}
