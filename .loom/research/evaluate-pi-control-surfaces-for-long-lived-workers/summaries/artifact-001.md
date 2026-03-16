---
id: artifact-001
research: evaluate-pi-control-surfaces-for-long-lived-workers
kind: summary
title: "Pi interaction surfaces for long-lived worker control"
created-at: 2026-03-16T02:19:49.147Z
tags:
  - rpc
  - runtime
  - sdk
  - workers
linked-hypotheses: []
source: null
---

## Summary
Source-backed comparison of Pi's one-shot subprocess, stdio RPC, and SDK control surfaces for live worker management, with a provisional preference toward SDK embedding for Pi Loom.

## Body
Findings:\n1. Current pi-workers runtime is a one-shot subprocess pattern that spawns Pi in JSON print mode, sends one prompt, streams output, and exits. That is closer to a subagent job than a durable live worker.\n2. Pi's documented RPC mode is a long-lived newline-delimited JSON protocol over stdio. It supports prompt/steer/follow_up/abort/get_state/session commands plus event streaming and extension UI request/response frames. This is the strongest documented cross-process control surface for live workers.\n3. Pi's SDK exposes createAgentSession(), direct prompt/steer/followUp/abort methods, session managers, and event subscriptions. This is the cleanest same-runtime integration surface and avoids protocol framing overhead.\n4. Session fork/resume/branch operations are session-history controls, not worktree-aware worker abstractions. Treating them as worker lifecycle would blur the architecture and misrepresent what a worker is.\n5. No first-class Pi-native worker daemon, network RPC service, or built-in workspace/worktree worker abstraction was found in the inspected docs/source.\n\nProvisional recommendation:\n- Explore an SDK-backed worker runtime first for Pi Loom, especially anywhere the current code spawns Pi subprocesses today. This appears most consistent with the desired long-lived manager-worker model and would make event subscriptions and live control straightforward inside one host runtime.\n- Keep stdio RPC as the fallback/runtime-2 option when stronger process isolation or non-Node hosting is needed.\n\nImportant boundary:\nPi should remain the session/agent engine. Pi Loom should still own worker identity, worktree lifecycle, durable messages, checkpoints, approvals, and consolidation semantics.
