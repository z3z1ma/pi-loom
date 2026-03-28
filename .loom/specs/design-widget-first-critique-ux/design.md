---
id: design-widget-first-critique-ux
title: "Design widget-first critique UX"
status: archived
created-at: 2026-03-17T05:56:15.052Z
updated-at: 2026-03-28T00:12:58.373Z
research: []
initiatives: []
capabilities:
  - capability-critique-review-workspace
---

## Design Notes
Critique is Loom's durable adversarial review layer. Its human-facing UX should feel like managing review questions, packets, runs, findings, and follow-up resolution rather than operating a review tool API. The home widget should surface active critiques, blocking findings, pending follow-ups, and critiques awaiting launch or resolution.

Focused interaction should support a critique queue, packet/detail reading, run history, finding review, and follow-up conversion or resolution flows. The subsystem must make it easy to distinguish review target, verdict history, open findings, and accepted follow-up work. It should feel like a review queue with durable evidence, not just a folder browser.

The surviving human verbs should center on opening critique, launching review, and resolving findings or verdicts. Tool-mirroring verbs for read/write/run/finding operations should become unnecessary once the critique workspace supports those workflows directly.

## Capability Map
- capability-critique-review-workspace: Critique review queue and finding-management workspace

## Requirements
- req-001: Focused views must support queue scanning, packet/detail reading, run history inspection, finding review, and follow-up resolution or ticketification workflows.
  Acceptance: A reviewer can identify how a human would launch a critique, inspect runs and findings, and resolve or follow up from the subsystem UX alone.; The critique UX makes verdicts, evidence, and open findings durable and legible instead of hiding them behind commands.; The persistent widget and focused views support both queue-level triage and one-critique deep review.
  Capabilities: capability-critique-review-workspace
- req-002: The design must preserve critique as a review layer distinct from execution, specification, and documentation.
  Acceptance: A reviewer can identify how a human would launch a critique, inspect runs and findings, and resolve or follow up from the subsystem UX alone.; The critique UX makes verdicts, evidence, and open findings durable and legible instead of hiding them behind commands.; The persistent widget and focused views support both queue-level triage and one-critique deep review.
  Capabilities: capability-critique-review-workspace
- req-003: The home widget must summarize active critiques, blocking or high-severity findings, pending launches, and critiques awaiting human resolution.
  Acceptance: A reviewer can identify how a human would launch a critique, inspect runs and findings, and resolve or follow up from the subsystem UX alone.; The critique UX makes verdicts, evidence, and open findings durable and legible instead of hiding them behind commands.; The persistent widget and focused views support both queue-level triage and one-critique deep review.
  Capabilities: capability-critique-review-workspace
- req-004: The UI must support creating or launching critique work, reviewing verdict history, inspecting evidence, and resolving findings without relying on tool-mirroring slash commands.
  Acceptance: A reviewer can identify how a human would launch a critique, inspect runs and findings, and resolve or follow up from the subsystem UX alone.; The critique UX makes verdicts, evidence, and open findings durable and legible instead of hiding them behind commands.; The persistent widget and focused views support both queue-level triage and one-critique deep review.
  Capabilities: capability-critique-review-workspace
- req-005: The workspace must make it easy to tell what remains under review, what has been accepted as a concern, and what follow-up work exists.
  Acceptance: A reviewer can identify how a human would launch a critique, inspect runs and findings, and resolve or follow up from the subsystem UX alone.; The critique UX makes verdicts, evidence, and open findings durable and legible instead of hiding them behind commands.; The persistent widget and focused views support both queue-level triage and one-critique deep review.
  Capabilities: capability-critique-review-workspace
