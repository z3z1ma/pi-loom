---
id: evaluate-pi-control-surfaces-for-long-lived-workers
title: "Evaluate Pi control surfaces for long-lived workers"
status: synthesized
created-at: 2026-03-16T02:19:49.094Z
tags:
  - manager-worker
  - rpc
  - runtime
  - sdk
  - workers
source-refs:
  - .agents/resources/oh-my-pi/docs/rpc.md
  - .agents/resources/oh-my-pi/docs/sdk.md
  - .agents/resources/oh-my-pi/docs/session-operations-export-share-fork-resume.md
  - .loom/research/prepare-manager-worker-architecture-from-pi-supervisor-and-pi-extension-interfaces/research.md
  - "node_modules/@mariozechner/pi-coding-agent/examples/extensions/subagent/index.ts"
  - "node_modules/@mariozechner/pi-coding-agent/examples/rpc-extension-ui.ts"
  - "node_modules/@mariozechner/pi-coding-agent/examples/sdk/11-sessions.ts"
  - packages/pi-workers/extensions/domain/runtime.ts
---

## Question
What Pi runtime/control surfaces are available for live, long-lived worker processes, and which direction best fits Pi Loom's manager-worker model without falling back to TUI/tmux automation?

## Objective
Produce durable source-backed guidance on whether Pi Loom should keep one-shot subprocess workers, move to long-lived RPC workers, or embed Pi via the SDK for long-lived manager-controlled workers.

## Status Summary
Research synthesized. Pi clearly exposes one-shot CLI/JSON, long-lived stdio RPC, and in-process SDK control surfaces; no first-class workspace-backed worker daemon or network RPC service was found. The current preference is to explore an SDK-backed worker runtime first, with RPC as the strongest cross-process fallback.

## Scope
- .agents/resources/oh-my-pi/docs/rpc.md
- .agents/resources/oh-my-pi/docs/sdk.md
- .agents/resources/oh-my-pi/docs/session-operations-export-share-fork-resume.md
- .loom/research/prepare-manager-worker-architecture-from-pi-supervisor-and-pi-extension-interfaces/research.md
- node_modules/@mariozechner/pi-coding-agent/examples/extensions/subagent/index.ts
- node_modules/@mariozechner/pi-coding-agent/examples/rpc-extension-ui.ts
- node_modules/@mariozechner/pi-coding-agent/examples/sdk/11-sessions.ts
- packages/pi-workers/extensions/domain/runtime.ts

## Non-Goals
- Claim undocumented Pi transport or daemon capabilities
- Commit to a final implementation before a dedicated design session

## Methodology
- Capture a provisional recommendation while preserving tradeoffs and open questions
- Compare those surfaces with current pi-workers subprocess runtime
- Map each surface to the needs of long-lived, worktree-backed workers
- Read current Pi RPC, SDK, and session-operation docs

## Keywords
- manager-worker
- pi
- rpc
- runtime
- sdk
- workers
- worktree

## Conclusions
- Long-lived stdio RPC is sufficient to build live workers with steering, follow-up, abort, state inspection, and extension-UI round trips, but it remains a process/session protocol rather than a worker/domain model.
- No documented Pi-native HTTP/WebSocket/gRPC daemon surface or first-class workspace/worktree worker abstraction was found in the inspected docs/source.
- Pi currently exposes three meaningful control surfaces for this problem: one-shot CLI/JSON subprocesses, long-lived stdio RPC sessions, and in-process SDK sessions.
- Pi session fork/resume/branch operations are session-history primitives, not workspace-aware worker abstractions, so they should not be treated as the worker substrate.
- The SDK offers the cleanest same-runtime control surface for a robust manager-worker implementation because it exposes direct session methods plus event subscriptions without protocol framing overhead.

## Recommendations
- Continue to let Pi Loom own worker identity, worktree lifecycle, durable messaging, approvals, and consolidation; Pi should remain the agent/session engine rather than the source of worker semantics.
- Do not overload session fork/tree/resume as worker management primitives; they are conversation/session operations and would make the design lie about what a worker is.
- Explore an SDK-backed worker runtime first for Pi Loom wherever Pi subprocesses are currently spawned, so worker execution stays consistent and event-driven within one host runtime.
- Keep RPC as a fallback path when process isolation or cross-language hosting is required, because it already supports long-lived live control over stdio.

## Open Questions
- How much isolation does Pi Loom truly need between manager and worker before SDK embedding becomes too tightly coupled?
- Should Pi Loom support both SDK-backed and RPC-backed worker runtimes behind one worker contract, or pick one canonical runtime first?
- What recovery contract should an SDK-backed worker host expose when a session throws or the host needs to restart?

## Linked Work
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

- initiative:workspace-backed-manager-worker-coordination
- spec:add-inbox-driven-manager-worker-control-plane
- spec:add-workspace-backed-manager-worker-substrate

## Hypotheses
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

- hyp-001 [supported/medium] For Pi Loom's long-lived workers, the in-process SDK is the cleanest primary integration surface because it provides direct session control and event subscriptions without RPC framing overhead.
  Evidence: .agents/resources/oh-my-pi/docs/sdk.md:1-20; node_modules/@mariozechner/pi-coding-agent/examples/sdk/11-sessions.ts:1-39
  Results: The SDK exposes createAgentSession(), session managers, direct prompt/steer/followUp/abort methods, and event subscriptions, which aligns closely with a live manager-worker host running in one runtime.
- hyp-002 [supported/high] Pi's stdio RPC mode is sufficient to run long-lived live workers from a separate host process, but it remains a protocol surface rather than a first-class worker abstraction.
  Evidence: .agents/resources/oh-my-pi/docs/rpc.md:1-120; node_modules/@mariozechner/pi-coding-agent/examples/rpc-extension-ui.ts:1-120
  Results: RPC mode supports prompt/steer/follow_up/abort/get_state, event streaming, and extension UI round trips over stdio, which is enough for live worker control from an external manager.
- hyp-003 [supported/high] Pi session fork/resume/branch operations should not be treated as the worker substrate because they are session-history controls, not workspace-aware worker lifecycle primitives.
  Evidence: .agents/resources/oh-my-pi/docs/session-operations-export-share-fork-resume.md:1-120; .loom/research/prepare-manager-worker-architecture-from-pi-supervisor-and-pi-extension-interfaces/research.md:31-42
  Results: The documented session operations mutate session identity/history and do not model worktree ownership or worker lifecycle, so using them as workers would blur the architecture and misstate the abstraction.

## Artifacts
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

(none)
