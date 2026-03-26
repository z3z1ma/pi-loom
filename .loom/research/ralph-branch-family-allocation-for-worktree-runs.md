---
id: ralph-branch-family-allocation-for-worktree-runs
title: "Ralph branch-family allocation for worktree runs"
status: synthesized
created-at: 2026-03-25T06:55:50.617Z
tags:
  - architecture
  - ralph
  - ticketing
  - worktree
source-refs:
  - chat:2026-03-24-option-four-branch-plan
---

## Question
How should Pi Loom allocate durable worktree branch names when multiple Loom tickets contribute follow-up work under the same external delivery ticket such as a Jira issue?

## Objective
Replace Ralph's current external-ref and local-branch-existence heuristic with a design that supports merged follow-up work, multi-repository allocation, and idempotent reruns without losing Ralph's bounded-run model.

## Status Summary
Synthesized design direction for option four: preserve Ralph run idempotence, move branch intent into durable ticket data, allocate exact branch names canonically per repository and branch family, and preserve an explicit override escape hatch.

## Scope
- ralph/domain/loop.ts
- ralph/domain/worktree.ts
- storage canonical allocation support
- ticketing/domain/*
- tool surfaces that launch worktree-backed runs

## Non-Goals
- Implementing the feature in this planning session
- Redesigning Ralph run identity away from ticket/plan binding
- Turning external refs into the canonical branch naming contract

## Methodology
- Compare ticket external-ref behavior with branch naming needs
- Inspect current Ralph run identity and worktree naming code paths
- Model real-world Jira follow-up scenarios and multi-repository execution

## Keywords
- branch allocation
- branch family
- external refs
- jira
- ralph
- worktree

## Conclusions
- An explicit operator/tool override remains necessary as an escape hatch but should not be the primary source of truth.
- Branch intent should move into explicit ticket-level fields such as a branch family rather than being inferred from arbitrary external refs.
- Exact branch allocation should become a canonical per-repository responsibility so new follow-up tickets can deterministically obtain UDP-100-1 even when UDP-100 was merged and deleted locally.
- Ralph should keep one durable run per ticket/plan binding and always reuse that run's stored branch/worktree on retries.

## Recommendations
- Adopt the hybrid model: ticket-level branch intent plus canonical per-repository branch-family allocation plus optional explicit override at run launch.
- Sequence the implementation as storage/domain contract first, then ticket surfaces, then Ralph and sibling runtimes, then migration/backfill and docs/tests.
- Stop treating the first external ref as branch truth; at most use external refs for migration/backfill when a Jira-like identifier is unambiguous.

## Open Questions
- Should branch-family metadata live directly on ticket frontmatter/body or in a separate canonical execution envelope while projecting into ticket artifacts?
- What lifecycle states should the branch-family allocator record beyond mere allocation, and which component is responsible for marking a branch family entry as merged or retired?

## Linked Work
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

(none)

## Hypotheses
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

(none)

## Artifacts
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

(none)
