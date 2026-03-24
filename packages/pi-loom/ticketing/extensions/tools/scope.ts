import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";
import {
  discoverWorkspaceScope,
  enrollRepositoryInScope,
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

function machineResult(details: Record<string, unknown>, text: string) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

function renderScopeRead(scope: Awaited<ReturnType<typeof discoverWorkspaceScope>>): string {
  const selectedRepository = scope.identity.repository;
  const selectedWorktree = scope.identity.worktree;
  const bindingSummary = scope.binding
    ? `${scope.binding.bindingSource} repository=${scope.binding.repositoryId ?? "(none)"} worktree=${scope.binding.worktreeId ?? "(none)"}`
    : "(none)";
  const diagnostics =
    scope.diagnostics.length > 0
      ? `Diagnostics:\n${scope.diagnostics.map((entry) => `- ${entry}`).join("\n")}`
      : "Diagnostics: none";
  const renderRepository = (
    entry: {
      repository: { id: string; displayName: string; slug: string };
      current: boolean;
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
    return `${prefix}${entry.current ? "*" : "-"} ${entry.repository.displayName} [${entry.repository.id}] slug=${entry.repository.slug} availability=${availability} worktrees=${worktrees}`;
  };

  return [
    `Scope root: ${scope.identity.discovery.scopeRoot}`,
    `Space: ${scope.identity.space.title} [${scope.identity.space.id}]`,
    `Active scope: ${scope.identity.activeScope.isAmbiguous ? "ambiguous" : "resolved"}`,
    `Selected repository: ${selectedRepository ? `${selectedRepository.displayName} [${selectedRepository.id}]` : "(none)"}`,
    `Selected worktree: ${selectedWorktree ? `${selectedWorktree.id} (${selectedWorktree.branch})` : "(none)"}`,
    `Binding: ${bindingSummary}`,
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

async function manageScope(ctx: ExtensionContext, params: ScopeManageParamsValue) {
  const { storage } = await openWorkspaceStorage(ctx.cwd);
  switch (params.action) {
    case "select":
      return selectActiveScope(
        ctx.cwd,
        { repositoryId: params.repositoryId ?? null, worktreeId: params.worktreeId ?? null, persist: params.persist },
        storage,
      );
    case "revoke":
      revokeActiveScopeSelection(ctx.cwd);
      return discoverWorkspaceScope(ctx.cwd, storage);
    case "enroll":
      if (!params.repositoryId) {
        throw new Error("repositoryId is required for enroll");
      }
      return enrollRepositoryInScope(ctx.cwd, params.repositoryId, storage);
    case "unenroll":
      if (!params.repositoryId) {
        throw new Error("repositoryId is required for unenroll");
      }
      return unenrollRepositoryInScope(ctx.cwd, params.repositoryId, storage);
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
      return machineResult({ scope }, renderScopeRead(scope));
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
      if (params.action === "select" && "space" in result) {
        return machineResult(
          { action: params.action, identity: result },
          [
            `Selected repository: ${result.repository ? `${result.repository.displayName} [${result.repository.id}]` : "(none)"}`,
            `Selected worktree: ${result.worktree ? `${result.worktree.id} (${result.worktree.branch})` : "(none)"}`,
            `Binding source: ${result.activeScope.bindingSource}`,
            ...(result.discovery.diagnostics.length > 0
              ? [`Diagnostics: ${result.discovery.diagnostics.join(" | ")}`]
              : []),
          ].join("\n"),
        );
      }
      const scope = result as Awaited<ReturnType<typeof discoverWorkspaceScope>>;
      return machineResult({ action: params.action, scope }, renderScopeRead(scope));
    },
  });
}
