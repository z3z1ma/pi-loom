---
id: ralph-backed-worker-manager-architecture-cutover
title: "Ralph-backed worker-manager architecture cutover"
status: synthesized
created-at: 2026-03-20T05:39:47.419Z
tags:
  - architecture
  - chief
  - ralph
  - workers
source-refs:
  - docs:pi-chief-orchestration-overview
  - plan:pi-chief-manager-as-ralph-cutover
---

## Question
How should Pi Loom simplify pi-workers by making workers a manager-facing abstraction over Ralph loops instead of a parallel execution runtime?

## Objective
Produce a concrete, code-grounded architecture direction and migration plan for rebasing the worker/manager model on top of Ralph loop execution while preserving Loom layer boundaries, preserving the canonical SQLite data in Pi Loom home, and removing unnecessary backward-compatibility obligations.

## Status Summary
Implemented. The package is now Pi Chief, a manager-first orchestration layer where the manager itself is a Ralph loop, each worker is a ticket-bound Ralph loop in a managed git worktree, and a plain TypeScript daemon polls durable state between iterations instead of polling the LLM provider. Internal manager-loop tools were reduced to explicit reconcile/record semantics, worker-local message/checkpoint protocol was collapsed, and Pi Ralph launches now resolve the workspace extension root from the working tree so worker and manager subprocesses can access the correct Loom tool surface.

## Scope
- AGENTS.md
- package.json
- packages/pi-chief
- packages/pi-ralph
- README.md

## Non-Goals
- Do not preserve compatibility shims for the old worker or manager tool surfaces.
- Do not turn Pi Ralph itself into a manager-specific package or leak manager terminology into its standalone public model.

## Methodology
- Collapse worker state down to a thin ticket/worktree/Ralph wrapper.
- Inspect the live pi-workers/pi-ralph code paths and tests.
- Refactor the manager runtime onto a linked Ralph run plus a storage-polling daemon.
- Rename the package to pi-chief and update docs/tests/root workspace registration.

## Keywords
- chief
- daemon
- manager
- ralph
- workers
- worktree

## Conclusions
- Managers and workers should both be expressed as Ralph loops; the package-specific value is the durable orchestration wrapper, git worktree management, and storage-polling daemon rather than a second execution engine.
- The manager-facing AI surface should stay tiny: start, read, wait, steer, and list. Internal chief-loop tools should be reserved for the manager subprocess only.
- The package rename to Pi Chief is justified because the package is no longer fundamentally about worker CRUD; it is about chief orchestration over raw Ralph loops.
- Workers become simpler and more truthful when every successful iteration returns to the manager for judgment instead of auto-looping based on worker-local checkpoints or inbox state.

## Recommendations
- Build future orchestration features on top of the manager-as-Ralph-loop model instead of reintroducing a bespoke manager runtime.
- Keep worker state minimal and prefer linked Ralph state as the primary source of iteration truth.
- Treat free-form git fan-in as a manager intelligence seam rather than hardcoding merge policy into TypeScript.

## Open Questions
- Should the daemon ever auto-reconcile missing workers when ticket sets change, or should that always remain an explicit manager-loop action?
- Should the long-term package/tool naming stay `manager_*`, or should the public family eventually move toward explicit `chief_*` terminology?

## Linked Work
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

- spec:add-inbox-driven-manager-worker-control-plane
- spec:add-ralph-loop-orchestration-extension
- spec:add-workspace-backed-manager-worker-substrate
- ticket:pl-0080
- ticket:pl-0081
- ticket:pl-0082

## Hypotheses
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

(none)

## Artifacts
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

(none)
