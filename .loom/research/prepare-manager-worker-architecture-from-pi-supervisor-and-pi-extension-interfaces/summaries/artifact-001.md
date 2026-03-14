---
id: artifact-001
research: prepare-manager-worker-architecture-from-pi-supervisor-and-pi-extension-interfaces
kind: summary
title: "Manager-worker architecture prep synthesis"
created-at: 2026-03-15T23:49:33.508Z
tags:
  - manager-worker
  - pi-runtime
  - pi-supervisor
  - ralph
linked-hypotheses:
  - hyp-001
  - hyp-002
  - hyp-003
source: null
---

## Summary
Source-backed synthesis comparing pi-supervisor, Pi extension/runtime surfaces, and current pi-loom Ralph boundaries to derive a bounded manager-worker direction.

## Body
Key findings:
1. pi-supervisor proves a strong lightweight pattern: a separate in-memory Pi session with no tools/extensions can supervise another agent from compact session snapshots and inject steering without polluting the worker context.
2. Current Pi runtime surfaces already support extension event observation, message injection, bounded subprocess/task spawning, and session-branch/fork flows, but those are session/process primitives rather than workspace/worktree primitives.
3. Current pi-loom boundaries explicitly keep Ralph bounded, plans as execution strategy, and tickets as the live execution ledger. Manager-worker should therefore be introduced as a workspace-aware execution mechanism that Ralph or plans can invoke, not as Ralph swallowing all orchestration.

Recommended architectural direction:
- Define worker = ephemeral workspace + Pi session + inbox/outbox + ticket attachment, instead of equating worker with a Pi session alone.
- Reuse pi-supervisor's out-of-band watchdog pattern for manager oversight: manager keeps compressed worker telemetry and recent deltas, not full worker transcript context.
- Add explicit workspace lifecycle and worker messaging surfaces rather than overloading existing session fork/tree APIs.
- Preserve ticket truth: workers execute against tickets/workspaces, managers consolidate/merge, but live execution state still lands in tickets and linked plan/Ralph artifacts.
- Keep peer broadcast optional and bounded; default routing should be manager-mediated.

Important constraints:
- Constitutional memory currently defers broader worker coordination until the local durable core and Ralph verifier boundaries are stronger.
- Session fork/tree today is not a Git worktree abstraction.
- Headless/subagent UI is weak; worker-manager communication should be durable/structured, not widget-driven.
- Ralph launch today captures only final assistant text from one subprocess, so richer worker telemetry needs a new contract.

Open questions:
- Which new Loom layer or extension should own workspace records and worker inbox/outbox state?
- How much of manager-worker should be exposed through Ralph versus separate workspace/worker tools?
- What merge/review contract should a manager satisfy before fan-in from multiple workers?
