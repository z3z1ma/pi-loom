---
id: session-based-ralph-and-chief-iteration-execution
title: "Session-based Ralph and Chief iteration execution"
status: archived
created-at: 2026-03-21T00:55:54.148Z
updated-at: 2026-03-28T00:12:30.424Z
research: []
initiatives: []
capabilities:
  - bounded-session-runtime
  - daemon-hop-continuity
  - in-process-chief-scheduling
---

## Overview
Bounded Ralph iterations and Chief manager/worker launches should execute through a session-runtime path that mirrors createAgentSession behavior closely enough to preserve the parent harness model, auth, tool, extension, and prompt environment across direct Ralph launches and detached Chief daemon hops, without depending on brittle CLI re-entry.

## Capabilities
- bounded-session-runtime: Bounded session-backed iteration execution
- daemon-hop-continuity: Detached Chief daemon session continuity
- in-process-chief-scheduling: In-process Chief scheduling continuity

## Requirements
- req-001: A bounded Ralph iteration launch runs through a fresh session created from the current harness SDK or a compatible fallback package root resolved from the parent harness metadata.
  Acceptance: Direct `/ralph` or `ralph_run` launches execute without reconstructing an unrelated CLI invocation.; Failure modes name the real assistant/runtime error rather than a misleading success-without-state message when possible.
  Capabilities: bounded-session-runtime
- req-002: The runtime preserves or forwards the parent session model/auth/tool environment needed for correct execution, including detached Chief daemon hops.
  Acceptance: Direct `/ralph` or `ralph_run` launches execute without reconstructing an unrelated CLI invocation.; Failure modes name the real assistant/runtime error rather than a misleading success-without-state message when possible.
  Capabilities: bounded-session-runtime
- req-003: The runtime surfaces truthful assistant error output and durable checkpoint absence as runtime failures.
  Acceptance: Direct `/ralph` or `ralph_run` launches execute without reconstructing an unrelated CLI invocation.; Failure modes name the real assistant/runtime error rather than a misleading success-without-state message when possible.
  Capabilities: bounded-session-runtime
- req-004: Starting a manager daemon preserves the parent session context needed for later session-runtime Ralph launches.
  Acceptance: A manager started from a parent session can launch later bounded iterations that behave like the parent harness session rather than a generic CLI fallback.; Focused tests cover daemon-hop context preservation and session-runtime launch behavior.
  Capabilities: daemon-hop-continuity
- req-005: The design remains compatible with both regular Pi and Oh My Pi style harnesses when a compatible SDK package can be resolved from parent harness metadata.
  Acceptance: A manager started from a parent session can launch later bounded iterations that behave like the parent harness session rather than a generic CLI fallback.; Focused tests cover daemon-hop context preservation and session-runtime launch behavior.
  Capabilities: daemon-hop-continuity
- req-006: Worker launcher hops preserve the same parent session context instead of replacing it with daemon-local process metadata.
  Acceptance: A manager started from a parent session can launch later bounded iterations that behave like the parent harness session rather than a generic CLI fallback.; Focused tests cover daemon-hop context preservation and session-runtime launch behavior.
  Capabilities: daemon-hop-continuity
- req-007: The runtime preserves or forwards the parent session model/auth/tool environment needed for correct execution.
  Acceptance: Direct `/ralph` or `ralph_run` launches execute without reconstructing an unrelated CLI invocation.; Failure modes name the real assistant/runtime error rather than a misleading success-without-state message when possible.
  Capabilities: bounded-session-runtime
- req-008: Manager-only internal runtime flags are kept inside manager passes and do not leak into worker passes.
  Acceptance: A manager started from a parent session can later launch manager and worker iterations that behave like the parent harness session without detached daemon processes.; Focused tests cover duplicate scheduling coalescence, worker completion re-scheduling, and manager-only env isolation.
  Capabilities: in-process-chief-scheduling
- req-009: Starting or steering a manager schedules future Chief work on the current process rather than spawning detached daemon scripts.
  Acceptance: A manager started from a parent session can later launch manager and worker iterations that behave like the parent harness session without detached daemon processes.; Focused tests cover duplicate scheduling coalescence, worker completion re-scheduling, and manager-only env isolation.
  Capabilities: in-process-chief-scheduling
- req-010: Worker launches are coalesced in-process and, when they finish, they re-schedule the owning manager on the parent event loop.
  Acceptance: A manager started from a parent session can later launch manager and worker iterations that behave like the parent harness session without detached daemon processes.; Focused tests cover duplicate scheduling coalescence, worker completion re-scheduling, and manager-only env isolation.
  Capabilities: in-process-chief-scheduling

## Clarifications
(none)
