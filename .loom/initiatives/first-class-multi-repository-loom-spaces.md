---
id: first-class-multi-repository-loom-spaces
title: "First-class multi-repository Loom spaces"
status: active
created-at: 2026-03-22T22:40:27.937Z
updated-at: 2026-03-22T22:41:20.460Z
owners: []
tags:
  - multi-repo
  - roadmap
  - runtime
  - spaces
  - storage
  - tooling
research:
  - multi-repository-loom-coordination-readiness
spec-changes: []
tickets: []
capabilities: []
roadmap-refs:
  - item-005
---

## Objective
Turn multi-repository Loom spaces into a production-ready operating mode so Pi can coordinate specs, plans, tickets, initiatives, critique, Ralph runs, docs, and related Loom layers across several repositories that form one coherent system, regardless of whether the session starts inside one repository or from a parent directory above them.

## Outcomes
- Cross-repository plans, tickets, specs, critique, Ralph, and docs remain queryable and operable as one system narrative while preserving repository-local provenance.
- Pi can start from a parent directory above several repositories and bind truthfully to an explicit Loom space rather than synthesizing one fake repository identity from cwd.
- Repo-sensitive operations such as file attachments, runtime launches, verification, and path-bearing references require explicit repository/worktree scope whenever ambiguity exists.
- Repositories and worktrees become explicit, stable first-class coordination targets across storage, tool addressing, runtime launches, dashboards, and exported artifacts.
- Space-level export/import, migration, and diagnostics become truthful enough for production use and future backend portability.

## Scope
- Add end-to-end verification coverage for parent-directory multi-repo operation, degraded modes, and wrong-repository safety guarantees.
- Add explicit repository/worktree-aware addressing and scoping to user-facing and AI-facing Loom surfaces where ambiguity matters.
- Define and ship the canonical multi-repository space contract above cwd-derived identity.
- Harden storage identity, sync/export semantics, and migration behavior for multiple repositories and multiple local worktrees per repository.
- Unify runtime propagation across Ralph, critique, docs, and nested sessions so repository-targeted execution is explicit and durable.

## Non-Goals
- Do not blur clone-local runtime attachments into canonical shared truth.
- Do not preserve indefinite compatibility shims that keep single-cwd and explicit multi-repo contracts alive as competing truths.
- Do not require network-shared SQLite as part of this initiative; the semantics must remain SQLite-first and portable to later backends.
- Do not turn Loom into a general workflow engine or deployment orchestrator.

## Success Metrics
- A dedicated multi-repository test suite catches ambiguous-path, wrong-repository, partial-export, and stale-binding regressions before release.
- Cross-repository read/write flows for plans, tickets, specs, critique, Ralph, and docs can be exercised from one parent-directory session with repository-qualified safety and no cwd-dependent misrouting.
- Full-space export/import preserves repository membership, worktree identity, and cross-repository links without collapsing records to the importer cwd.
- Repo-sensitive runtime launches and file/path operations fail safe under ambiguity and execute correctly once repository/worktree scope is explicit.
- Starting Pi above a directory containing multiple enrolled repositories never produces a synthetic repository identity and instead binds to an explicit space or requires truthful selection.

## Status Summary
Active initiative. Roadmap item `item-005` now tracks first-class multi-repository Loom spaces as the next active roadmap item. The finalized spec `first-class-multi-repository-loom-spaces` and synthesized research `multi-repository-loom-coordination-readiness` establish the target behavior and current gaps; execution planning is the next downstream step.

## Risks
- Migration from legacy single-repository assumptions could accidentally preserve synthetic identities or stale bindings unless cutover behavior is explicit and aggressively verified.
- Repository-qualified addressing can become verbose or ergonomically poor if result formats and selection flows are not carefully designed for both humans and AI.
- Runtime propagation across fresh-process helpers may diverge from Ralph unless one authoritative scope contract is imposed across packages.
- The largest risk is accidental semantic drift where some packages adopt explicit repository scoping while others continue to infer cwd, creating partial truth and subtle misrouting bugs.
- Worktree identity hardening may reveal hidden assumptions in runtime attachments, export/import logic, and diagnostics that currently depend on weak clone identity.

## Linked Roadmap
- item-005 [next/active] First-class multi-repository Loom spaces — Establish multi-repository Loom spaces as a first-class operating mode so Pi can run from a parent directory above multiple service repositories while preserving explicit space, repository, and worktree identity across canonical records, tool surfaces, runtime launches, and exported artifacts.

## Milestones
- milestone-001:  [planned]

## Strategic Decisions
- 2026-03-22T22:41:20.460Z [clarification] How should this initiative relate to the finalized multi-repository spec in the current codebase? -> Treat `first-class-multi-repository-loom-spaces` as the governing finalized specification for this initiative, even though the current implementation rejects post-finalization initiative-link updates on the spec record itself. Until that linkage behavior changes, the initiative carries the spec relationship in its strategic status and downstream planning context rather than mutating the finalized spec.
