import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";
import {
  discoverWorkspaceScope,
  enrollRepositoryInScope,
  readPersistedScopeBinding,
  revokeActiveScopeSelection,
  selectActiveScope,
  unenrollRepositoryInScope,
} from "#storage/repository.js";
import { openWorkspaceStorage } from "#storage/workspace.js";

const ScopeManageActionEnum = StringEnum(["select", "revoke", "enroll", "unenroll"] as const);

const ScopeReadParams = Type.Object({});
const ScopeManageParams = Type.Object({
  action: ScopeManageActionEnum,
  repositoryId: Type.Optional(
    Type.String({ description: "Repository id from `scope_read` results when selecting, enrolling, or unenrolling." }),
  ),
  worktreeId: Type.Optional(
    Type.String({
      description: "Optional worktree id from `scope_read` results when selecting a specific clone/worktree.",
    }),
  ),
  persist: Type.Optional(
    Type.Boolean({ description: "Persist the selection for future startups. Defaults to true for `select`." }),
  ),
});

type ScopeManageParamsValue = Static<typeof ScopeManageParams>;
type DiscoveredScope = Awaited<ReturnType<typeof discoverWorkspaceScope>>;
type ScopeDiagnosticKind =
  | "persisted_space_conflict"
  | "persisted_scope_conflict"
  | "stale_binding"
  | "persisted_disambiguation"
  | "repository_unavailable"
  | "unknown";

type ScopeRepositoryEntry = DiscoveredScope["enrolledRepositories"][number];

interface ScopeDiagnosticView {
  kind: ScopeDiagnosticKind;
  message: string;
}

interface ScopeToolSummary {
  scopeRoot: string;
  space: { id: string; title: string };
  activeScope: {
    state: "ambiguous" | "resolved";
    ambiguityReason: string | null;
    bindingSource: string;
    repository: {
      id: string;
      displayName: string;
      slug: string;
      discoverySource: "cwd" | "child" | null;
      locallyAvailable: boolean;
    } | null;
    worktree: { id: string; branch: string } | null;
  };
  discovery: {
    startedInsideRepository: boolean;
    enrolledRepositoryCount: number;
    unenrolledCandidateCount: number;
  };
  persistedBinding:
    | {
        status: "active" | "ignored";
        source: "selection" | "persisted";
        repositoryId: string | null;
        worktreeId: string | null;
        selectedAt: string;
        staleReason: string | null;
      }
    | { status: "none"; source: null; repositoryId: null; worktreeId: null; selectedAt: null; staleReason: null };
  diagnostics: ScopeDiagnosticView[];
}

function machineResult(details: Record<string, unknown>, text: string) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

function classifyScopeDiagnostic(message: string): ScopeDiagnosticKind {
  if (message.startsWith("Persisted space binding ")) {
    return "persisted_space_conflict";
  }
  if (message.startsWith("Persisted binding for space ")) {
    return "persisted_scope_conflict";
  }
  if (message.startsWith("Persisted repository binding ")) {
    return "stale_binding";
  }
  if (message.startsWith("Using persisted repository binding ")) {
    return "persisted_disambiguation";
  }
  if (message.includes("has no locally available worktree")) {
    return "repository_unavailable";
  }
  return "unknown";
}

function resolveRepositoryEntry(scope: DiscoveredScope, repositoryId: string | null): ScopeRepositoryEntry | null {
  if (!repositoryId) {
    return null;
  }
  return (
    scope.enrolledRepositories
      .concat(scope.candidateRepositories)
      .find((entry) => entry.repository.id === repositoryId) ?? null
  );
}

function resolveAmbiguityReason(scope: DiscoveredScope): string | null {
  if (!scope.identity.activeScope.isAmbiguous) {
    return null;
  }
  if (!scope.identity.discovery.startedInsideRepository && scope.identity.repositories.length > 1) {
    return `Multiple repositories are available under ${scope.identity.discovery.scopeRoot}; select one before repository-bound operations.`;
  }
  return "Repository-sensitive operations require an explicit repository selection.";
}

function buildScopeSummary(scope: DiscoveredScope): ScopeToolSummary {
  const selectedRepository = scope.identity.repository;
  const selectedWorktree = scope.identity.worktree;
  const selectedEntry = resolveRepositoryEntry(scope, selectedRepository?.id ?? null);
  const persistedBinding = readPersistedScopeBinding(scope.identity.discovery.scopeRoot);
  return {
    scopeRoot: scope.identity.discovery.scopeRoot,
    space: { id: scope.identity.space.id, title: scope.identity.space.title },
    activeScope: {
      state: scope.identity.activeScope.isAmbiguous ? "ambiguous" : "resolved",
      ambiguityReason: resolveAmbiguityReason(scope),
      bindingSource: scope.identity.activeScope.bindingSource,
      repository: selectedRepository
        ? {
            id: selectedRepository.id,
            displayName: selectedRepository.displayName,
            slug: selectedRepository.slug,
            discoverySource: selectedEntry?.discoverySource ?? null,
            locallyAvailable: selectedEntry?.locallyAvailable ?? true,
          }
        : null,
      worktree: selectedWorktree ? { id: selectedWorktree.id, branch: selectedWorktree.branch } : null,
    },
    discovery: {
      startedInsideRepository: scope.identity.discovery.startedInsideRepository,
      enrolledRepositoryCount: scope.enrolledRepositories.length,
      unenrolledCandidateCount: scope.candidateRepositories.length,
    },
    persistedBinding: persistedBinding
      ? (() => {
          const status: "active" | "ignored" =
            !scope.identity.activeScope.isAmbiguous &&
            scope.identity.activeScope.repositoryId === persistedBinding.repositoryId
              ? "active"
              : "ignored";
          return {
            status,
            source: persistedBinding.bindingSource,
            repositoryId: persistedBinding.repositoryId,
            worktreeId: persistedBinding.worktreeId,
            selectedAt: persistedBinding.selectedAt,
            staleReason: persistedBinding.staleReason,
          };
        })()
      : {
          status: "none",
          source: null,
          repositoryId: null,
          worktreeId: null,
          selectedAt: null,
          staleReason: null,
        },
    diagnostics: scope.diagnostics.map((message) => ({ kind: classifyScopeDiagnostic(message), message })),
  };
}

function renderPersistedBinding(summary: ScopeToolSummary): string {
  if (summary.persistedBinding.status === "none") {
    return "none";
  }
  return `${summary.persistedBinding.status} source=${summary.persistedBinding.source} repository=${summary.persistedBinding.repositoryId ?? "(none)"} worktree=${summary.persistedBinding.worktreeId ?? "(none)"}`;
}

function renderScopeRead(scope: DiscoveredScope): string {
  const summary = buildScopeSummary(scope);
  const diagnostics =
    summary.diagnostics.length > 0
      ? `Diagnostics:\n${summary.diagnostics.map((entry) => `- [${entry.kind}] ${entry.message}`).join("\n")}`
      : "Diagnostics: none";
  const renderRepository = (
    entry: {
      repository: { id: string; displayName: string; slug: string };
      current: boolean;
      discoverySource: "cwd" | "child";
      worktrees: { id: string; branch: string }[];
      locallyAvailable: boolean;
      unavailableReason: string | null;
    },
    prefix: string,
  ) => {
    const worktrees = entry.worktrees.map((worktree) => `${worktree.id} (${worktree.branch})`).join(", ") || "(none)";
    const availability = entry.locallyAvailable
      ? "available"
      : `unavailable: ${entry.unavailableReason ?? "no local worktree"}`;
    return `${prefix}${entry.current ? "*" : "-"} ${entry.repository.displayName} [${entry.repository.id}] slug=${entry.repository.slug} source=${entry.discoverySource} availability=${availability} worktrees=${worktrees}`;
  };

  return [
    `Scope root: ${summary.scopeRoot}`,
    `Space: ${summary.space.title} [${summary.space.id}]`,
    `Active scope: ${summary.activeScope.state} (bindingSource=${summary.activeScope.bindingSource})`,
    ...(summary.activeScope.ambiguityReason ? [`Ambiguity: ${summary.activeScope.ambiguityReason}`] : []),
    `Selected repository: ${summary.activeScope.repository ? `${summary.activeScope.repository.displayName} [${summary.activeScope.repository.id}]` : "(none)"}`,
    `Selected worktree: ${summary.activeScope.worktree ? `${summary.activeScope.worktree.id} (${summary.activeScope.worktree.branch})` : "(none)"}`,
    `Discovery: startedInsideRepository=${summary.discovery.startedInsideRepository ? "yes" : "no"} activeRepositorySource=${summary.activeScope.repository?.discoverySource ?? "(none)"}`,
    `Persisted binding: ${renderPersistedBinding(summary)}`,
    `Enrolled repositories (${scope.enrolledRepositories.length}):`,
    ...(scope.enrolledRepositories.length > 0
      ? scope.enrolledRepositories.map((entry) => renderRepository(entry, "  "))
      : ["  (none)"]),
    `Discovery candidates not enrolled (${scope.candidateRepositories.length}):`,
    ...(scope.candidateRepositories.length > 0
      ? scope.candidateRepositories.map((entry) => renderRepository(entry, "  "))
      : ["  (none)"]),
    diagnostics,
  ].join("\n");
}

async function getScope(ctx: ExtensionContext) {
  const { storage } = await openWorkspaceStorage(ctx.cwd);
  return discoverWorkspaceScope(ctx.cwd, storage);
}

async function manageScope(
  ctx: ExtensionContext,
  params: ScopeManageParamsValue,
): Promise<{
  action: ScopeManageParamsValue["action"];
  scope: DiscoveredScope;
  identity?: Awaited<ReturnType<typeof selectActiveScope>>;
}> {
  const { storage } = await openWorkspaceStorage(ctx.cwd);
  switch (params.action) {
    case "select":
      return {
        action: params.action,
        identity: await selectActiveScope(
          ctx.cwd,
          { repositoryId: params.repositoryId ?? null, worktreeId: params.worktreeId ?? null, persist: params.persist },
          storage,
        ),
        scope: await discoverWorkspaceScope(ctx.cwd, storage),
      };
    case "revoke":
      revokeActiveScopeSelection(ctx.cwd);
      return { action: params.action, scope: await discoverWorkspaceScope(ctx.cwd, storage) };
    case "enroll":
      if (!params.repositoryId) {
        throw new Error("repositoryId is required for enroll");
      }
      return { action: params.action, scope: await enrollRepositoryInScope(ctx.cwd, params.repositoryId, storage) };
    case "unenroll":
      if (!params.repositoryId) {
        throw new Error("repositoryId is required for unenroll");
      }
      return { action: params.action, scope: await unenrollRepositoryInScope(ctx.cwd, params.repositoryId, storage) };
  }
}

export function registerScopeTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "scope_read",
    label: "scope_read",
    description:
      "Inspect multi-repository startup scope, including active selection, persisted binding, enrolled repositories, and discovered unenrolled candidates.",
    promptSnippet:
      "Read the active multi-repository scope before acting when startup or repository selection might be ambiguous.",
    promptGuidelines: [
      "Use this tool when a parent directory may contain multiple repositories and you need the truthful active scope state before taking repository-sensitive actions.",
      "Prefer these results over guessing from cwd alone; the output separates enrolled repositories from merely discovered candidates and surfaces persisted-binding diagnostics.",
    ],
    parameters: ScopeReadParams,
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const scope = await getScope(ctx);
      return machineResult({ scope, scopeSummary: buildScopeSummary(scope) }, renderScopeRead(scope));
    },
  });

  pi.registerTool({
    name: "scope_write",
    label: "scope_write",
    description:
      "Select, revoke, enroll, or unenroll the active repository scope so startup and headless follow-up flows stay explicit and inspectable.",
    promptSnippet:
      "Use this when repository selection or enrollment must change durably instead of being guessed from cwd.",
    promptGuidelines: [
      "Select only enrolled repositories; enroll a discovered candidate first instead of silently promoting it.",
      "Use revoke when a persisted binding is stale or no longer desired so the next startup can surface ambiguity truthfully.",
    ],
    parameters: ScopeManageParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await manageScope(ctx, params);
      return machineResult(
        {
          action: result.action,
          ...(result.identity ? { identity: result.identity } : {}),
          scope: result.scope,
          scopeSummary: buildScopeSummary(result.scope),
        },
        [`Action: ${result.action}`, renderScopeRead(result.scope)].join("\n"),
      );
    },
  });
}
