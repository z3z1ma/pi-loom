---
id: assess-vendoring-the-oh-my-pi-task-subagent-executor-into-pi-ralph
title: "Assess vendoring the oh-my-pi task-subagent executor into pi-ralph"
status: synthesized
created-at: 2026-03-21T06:05:11.402Z
tags:
  - architecture
  - orchestration
  - ralph
  - vendoring
source-refs:
  - .agents/resources/oh-my-pi/docs/task-agent-discovery.md
  - .agents/resources/oh-my-pi/packages/coding-agent/src/async/job-manager.ts
  - .agents/resources/oh-my-pi/packages/coding-agent/src/task/executor.ts
  - .agents/resources/oh-my-pi/packages/coding-agent/src/task/index.ts
  - constitution:item-003
  - packages/pi-ralph/extensions/domain/loop.ts
  - packages/pi-ralph/extensions/domain/runtime.ts
  - packages/pi-ralph/extensions/tools/ralph.ts
  - packages/pi-ralph/README.md
---

## Question
How hard would it be to vendor the oh-my-pi task/subagent sync+async execution system into pi-ralph, and what is the right cut line if the goal is better Ralph execution correctness and observability?

## Objective
Produce a source-backed assessment of vendoring scope, dependency risk, architectural fit, and recommended implementation shape for improving pi-ralph execution and observability.

## Status Summary
Assessment complete. Full vendoring of the oh-my-pi task/subagent system into pi-ralph is feasible but expensive and boundary-blurring: the task subsystem is a multi-thousand-line harness-integrated orchestration stack, not a small reusable primitive. The best fit is to vendor selective pieces—especially async job management and session-executor/event-capture patterns—while keeping Ralph run state, decisions, and critique/verifier truth in pi-ralph.

## Scope
- .agents/resources/oh-my-pi/docs/task-agent-discovery.md
- .agents/resources/oh-my-pi/packages/coding-agent/src/async/job-manager.ts
- .agents/resources/oh-my-pi/packages/coding-agent/src/task/*.ts
- packages/pi-ralph/extensions/domain/loop.ts
- packages/pi-ralph/extensions/domain/runtime.ts
- packages/pi-ralph/extensions/tools/ralph.ts
- packages/pi-ralph/README.md

## Non-Goals
- Do not decide final package boundaries for pi-chief vs pi-ralph beyond the assessment recommendations.
- Do not implement the vendoring work.
- Do not treat the current oh-my-pi task implementation as automatically acceptable for Loom without boundary review.

## Methodology
- Estimate migration difficulty by comparing dependency surfaces and subsystem sizes rather than relying on README-level descriptions.
- Inspect current pi-ralph runtime, loop, tools, and README to compare execution flow and current gaps.
- Inspect oh-my-pi task subsystem code, docs, and tests to identify the real execution model, async behavior, isolation, and observability hooks.
- Read constitutional brief and roadmap item item-003 to align with current orchestration direction.

## Keywords
- async jobs
- execution model
- observability
- pi-ralph
- subagent
- task tool
- vendoring

## Conclusions
- Current pi-ralph already has a session-runtime executor, but it is comparatively thin and under-instrumented. runRalphLaunch can emit assistant/tool events, yet ralph_run does not surface onUpdate or onEvent to callers, so live iteration visibility is largely discarded. A global sessionRuntimeLaunchQueue also serializes launches, which caps concurrency and masks queueing as hidden runtime behavior.
- Directly vendoring the entire task tool into pi-ralph would pull in agent discovery, prompt/frontmatter parsing, TUI renderers, worktree isolation, merge logic, and other task-specific concerns that do not belong in Ralph's bounded orchestration layer. That would risk turning pi-ralph into a partial harness fork rather than a clean orchestration package.
- The clean architectural cut is to vendor or reimplement a Ralph-specific worker executor that borrows three ideas from oh-my-pi: background job lifecycle management, child-session event capture, and artifactized per-iteration outputs. Ralph should keep ownership of run records, checkpoints, verifier summaries, critique links, and policy decisions.
- The oh-my-pi task subsystem is not a small copy-paste helper. The core task/async code examined is roughly 6k lines of code plus about 900 lines of tests, with deep dependencies on createAgentSession, SessionManager, settings, prompt templates, MCP proxying, tool registries, artifact paths, and optional filesystem isolation.
- The task subsystem's real execution model is in-process child AgentSession execution with strong progress/event streaming, structured completion enforcement, artifactized outputs, bounded concurrency, and optional background delivery through AsyncJobManager. Those are the parts that materially address pi-ralph's current observability and execution-control pain.

## Recommendations
- Add durable per-iteration runtime attachments in pi-ralph for live and post-mortem observability: assistant message stream, tool execution events, raw launch output/stderr, wall-clock timings, and whether the iteration exited cleanly or required synthetic runtime-failure persistence.
- Do not vendor the full task subsystem first. Start with a narrow vendoring target: AsyncJobManager plus the executor-side event/subscription pattern from task/executor.ts, adapted into a Ralph-specific iteration runner.
- If the long-term goal is manager-worker orchestration across many bounded execution units, use this vendoring work as a stepping stone toward the existing constitutional direction around workspace-backed workers and bounded orchestration, rather than entrenching task-tool internals directly as Ralph's permanent core.
- Teach ralph_run to emit incremental onUpdate progress from runRalphLaunch and optionally integrate async background execution for long iterations, reusing the job-manager semantics instead of blocking with opaque silence.
- Treat worktree/isolation, agent discovery, and generic task rendering as out of scope for the first Ralph rescue. Those belong either in a future shared execution substrate or in pi-chief/worker infrastructure, not inside pi-ralph's first recovery step.

## Open Questions
- How much of oh-my-pi's submit_result contract should Ralph adopt versus continuing to rely on ralph_checkpoint as the only trusted iteration completion primitive?
- Should Ralph gain true concurrent iteration execution at all, or only async/background single-run execution with better observability while multi-worker concurrency remains a pi-chief concern?
- Should the reusable execution slice live in pi-ralph temporarily or be extracted immediately into a shared package for pi-ralph and future worker/manager layers?

## Linked Work
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

- spec:add-inbox-driven-manager-worker-control-plane
- spec:add-ralph-loop-orchestration-extension
- spec:add-workspace-backed-manager-worker-substrate

## Hypotheses
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

(none)

## Artifacts
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

(none)
