---
id: capability-ralph-run-workspace
title: "Ralph run and iteration workspace"
change: design-widget-first-ralph-ux
updated-at: 2026-03-17T05:59:05.726Z
source-changes:
  - design-widget-first-ralph-ux
---

## Summary
The Ralph subsystem provides a persistent orchestration widget plus focused run-list, iteration-timeline, verifier, and decision views for bounded loop management.

## Requirements
- Focused views must support scanning runs, inspecting one run in detail, reviewing iteration history, examining verifier and critique context, and acting on continuation decisions.
- The design must preserve Ralph as an orchestration layer distinct from plans, tickets, critique, and workers.
- The home widget must summarize active runs, waiting state, blocking verifier or critique signals, and the most important next orchestration actions.
- The UI must support creating, launching, resuming, pausing, completing, halting, or escalating runs through direct workflows instead of tool-mirroring slash commands.
- The workspace must make run state, decision rationale, and blocking evidence legible enough for a human to trust and steer long-horizon loops.

## Scenarios
- A reviewer inspects verifier evidence and critique links for one run, then chooses whether to continue, pause, or halt from the same subsystem experience.
- A user opens Ralph and sees one run waiting on critique, one active run nearing an iteration limit, and one paused run, then drills into the blocked run's iteration timeline.
- A user scans the run list to decide which orchestration loop most urgently needs attention without raw slash commands.
