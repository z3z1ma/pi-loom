---
id: capability-critique-review-workspace
title: "Critique review queue and finding-management workspace"
change: design-widget-first-critique-ux
updated-at: 2026-03-17T05:59:05.549Z
source-changes:
  - design-widget-first-critique-ux
---

## Summary
The critique subsystem provides a persistent review widget plus focused queue, packet, run-history, and finding views for durable adversarial review work.

## Requirements
- Focused views must support queue scanning, packet/detail reading, run history inspection, finding review, and follow-up resolution or ticketification workflows.
- The design must preserve critique as a review layer distinct from execution, specification, and documentation.
- The home widget must summarize active critiques, blocking or high-severity findings, pending launches, and critiques awaiting human resolution.
- The UI must support creating or launching critique work, reviewing verdict history, inspecting evidence, and resolving findings without relying on tool-mirroring slash commands.
- The workspace must make it easy to tell what remains under review, what has been accepted as a concern, and what follow-up work exists.

## Scenarios
- A reviewer reads a critique packet, examines run history, accepts one finding into follow-up work, and resolves another as fixed from the same subsystem surface.
- A user opens critique and sees one blocking critique awaiting resolution and one queued review ready to launch, then drills into the blocking critique's findings.
- A user scans the queue to identify which review work is blocking a rollout without falling back to raw slash commands.
