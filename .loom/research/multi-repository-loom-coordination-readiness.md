---
id: multi-repository-loom-coordination-readiness
title: "Multi-repository Loom coordination readiness"
status: synthesized
created-at: 2026-03-22T22:14:28.089Z
tags:
  - architecture
  - multi-repo
  - research
  - storage
source-refs:
  - CONSTITUTION.md
  - packages/pi-critique/extensions/domain/runtime.ts
  - packages/pi-docs/extensions/domain/runtime.ts
  - packages/pi-plans/extensions/domain/store.ts
  - packages/pi-ralph-wiggum/extensions/domain/runtime.ts
  - packages/pi-research/extensions/domain/map.ts
  - packages/pi-storage/README.md
  - packages/pi-storage/storage/repository.ts
  - packages/pi-storage/storage/sync.ts
  - packages/pi-storage/storage/workspace.ts
  - packages/pi-ticketing/extensions/domain/store.ts
  - README.md
---

## Question
How close is Pi Loom to first-class, production-ready support for specs, plans, tickets, initiatives, and related Loom layers that span multiple repositories when Pi is launched from a parent directory above several service repositories?

## Objective
Assess the current implementation and tests to determine which parts of the Loom stack already support cross-repository modeling, which parts still assume a single cwd/repository, and what gaps block production-ready multi-repository use from a parent directory.

## Status Summary
Synthesis complete. Pi Loom is materially closer at the storage/data-model level than at the runtime and tool-entrypoint level. Shared-space canonical modeling already exists, but parent-directory multi-repo operation is still blocked by single-cwd identity/bootstrap, missing repository-selection surfaces, single-root runtime launches, and lack of multi-repo test coverage.

## Scope
- CONSTITUTION.md
- packages/pi-critique
- packages/pi-docs
- packages/pi-plans
- packages/pi-ralph-wiggum
- packages/pi-research
- packages/pi-specs
- packages/pi-storage
- packages/pi-ticketing
- README.md

## Non-Goals
- Do not implement multi-repository support in this investigation.
- Do not redesign the full future architecture beyond identifying concrete gaps and likely design pressure points.
- Do not treat incidental checked-in .loom examples as proof of multi-repository readiness.

## Methodology
- Inspect constitutional memory and existing repository docs for declared multi-repository intent.
- Inspect existing tests for evidence of cross-repository coverage or lack thereof.
- Inspect layer stores and tool schemas for explicit repository/workspace selection versus implicit ctx.cwd scoping.
- Read storage, identity, linking, and runtime code to determine current scoping boundaries.
- Run targeted existing integration tests relevant to storage identity/sync and Ralph runtime forwarding.

## Keywords
- cross-repository
- microservices
- multi-repository
- parent directory
- PI_LOOM_ROOT
- readiness
- repository
- space
- workspace identity
- worktree

## Conclusions
- Canonical storage is already structured for multi-repo shared truth: spaces, repositories, worktrees, repository-owned entities, and canonical cross-entity links exist in one SQLite catalog.
- Current evidence does not justify calling the feature production-ready. The codebase is plausibly around halfway there overall: strong underlying storage primitives, some cross-layer canonical integration, but missing the explicit multi-repo identity contract, addressing model, runtime routing, export semantics, and test coverage needed for trustworthy parent-directory operation.
- Layer packages are partially prepared once records already coexist in one shared space. Tickets are the most advanced because they explicitly avoid id-prefix collisions across repositories and preserve `owningRepositoryId`; plans/specs/research already resolve related records canonically by display id inside one space.
- The current bootstrap path is the main blocker. `resolveWorkspaceIdentity(cwd)` and `openWorkspaceStorage(cwd)` derive and seed exactly one space/repository/worktree from one cwd, so a parent directory above many repositories collapses to a synthetic single repository instead of a real multi-repository space.
- User-facing tools and runtime entrypoints are not first-class multi-repo yet. They consistently route through one `ctx.cwd` store and expose no repository selector, while critique/docs fresh-process launches ignore Ralph’s limited parent-session forwarding and operate on one cwd only.

## Recommendations
- Add end-to-end tests for the target mode before calling it production-ready: parent directory above multiple git repos, shared-space entity creation across repos, cross-repo links, repo-aware reads/writes, fresh-process launches, and sync/export behavior.
- Add repository-aware addressing to the tool and store surfaces where ambiguity matters: discovery/list filters, read/mutate refs, attachments, scope paths, and any place where `displayId` or a path alone is insufficient from a parent session.
- Define an explicit multi-repository space contract above `cwd` discovery: how a shared space is selected/created, how repositories are discovered/registered, and how parent-directory sessions map to canonical `spaceId` plus multiple repository/worktree identities.
- Harden storage identity and export semantics for the multi-repo case: eliminate worktree collisions across same-branch clones, make sync/export space-complete or explicitly repo-scoped, and add top-level enumeration/selection APIs for spaces and repositories.
- Refactor bootstrap/runtime paths so parent-directory sessions can carry multiple repository roots or explicit repository targets instead of one implicit cwd. Critique/docs launches should inherit the same scoped context model as Ralph rather than dropping to a single cwd.

## Open Questions
- How should user-facing tools select repository scope when listing or mutating tickets, plans, and specs from a shared parent-directory session?
- Should a parent directory above many repos map to one existing Loom space, or should spaces be explicitly user-created and selected independent of cwd-derived repository identity?
- Which runtime and verifier behaviors must remain clone-local per repository versus shared at the multi-repository space level?

## Linked Work
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

(none)

## Hypotheses
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

- hyp-002 [supported/high] Pi Loom is not yet first-class or production-ready for parent-directory multi-repository use because entrypoints, identity bootstrap, and runtime launches still assume one active cwd/repository.
  Evidence: `packages/pi-storage/storage/repository.ts` resolves exactly one space/repository/worktree from one cwd and falls back to the cwd path when Git metadata is unavailable.; `packages/pi-storage/storage/workspace.ts` immediately upserts only that single resolved identity.; Layer stores and tools consistently call `openWorkspaceStorage(this.cwd)` / `create*Store(ctx.cwd)` with no repo selector, and runtime launchers spawn or create sessions with one cwd.
  Results: Launching Pi above many repos would collapse to a synthetic single repository/space rather than discovering child repos.; User-facing listing, reading, and mutation flows cannot truthfully target or disambiguate multiple repositories from one parent session.
- hyp-003 [supported/medium] Tickets are the closest Loom layer to practical multi-repository support inside a shared space, but they still rely on single-cwd addressing and file resolution.
  Evidence: `packages/pi-ticketing/extensions/domain/store.ts` stores `owningRepositoryId`, computes per-repository ticket prefixes, and avoids collisions against other repositories in the same space.; Cross-layer links are canonical, but discovery and local file attachment behavior still assume one working tree.; The same store resolves attachments and path-like refs against `this.cwd`, and the tool surface exposes no repository selector beyond human-facing ticket refs.
  Results: Ticket ids and canonical link ownership are better prepared than plans/specs/docs for cross-repo coexistence.; Ticket UX would still become ambiguous or unsafe in a parent-directory session without explicit repository scope.

## Artifacts
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

- artifact-002 [note] Layer package readiness findings (hyp-001, hyp-002)
- artifact-003 [note] Runtime and harness findings (hyp-002)
