---
id: ralph-runtime-execution-and-observability-overview
title: "Ralph runtime execution and observability overview"
status: active
type: overview
section: overviews
topic-id: ralph-runtime-execution-and-observability
topic-role: owner
publication-status: current-owner
publication-summary: "Current canonical overview for governed topic ralph-runtime-execution-and-observability."
recommended-action: update-current-owner
current-owner: ralph-runtime-execution-and-observability-overview
active-owners:
  - ralph-runtime-execution-and-observability-overview
audience:
  - ai
  - human
source: workspace:workspace
verified-at: 2026-03-27T10:46:33.159Z
verification-source: manual:pl-0131-iter-001
successor: null
successor-title: null
predecessors: []
retirement-reason: null
topics:
  - iterations
  - ralph
  - runtime-observability
outputs: []
upstream-path: null
---

# Ralph runtime execution and observability overview

Ralph's execution substrate is observable and bounded. Each `ralph_run` launch prepares one fresh-context ticket iteration and records durable runtime artifacts describing what happened during that bounded run.

## Runtime artifacts

Per-iteration runtime artifacts capture launch lifecycle state, streamed assistant output, tool activity, stderr, exit status, and missing-ticket-activity failures.

## Background control

Long-running Ralph work can run in the background. `ralph_job_read`, `ralph_job_wait`, and `ralph_job_cancel` provide explicit job control without losing durable Ralph state.

## Checkpoint truthfulness

A session exit is not success on its own. Ralph treats trusted ticket activity and checkpoint evidence as the source of truthful iteration completion.
