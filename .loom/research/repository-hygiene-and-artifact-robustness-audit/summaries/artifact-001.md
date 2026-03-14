---
id: artifact-001
research: repository-hygiene-and-artifact-robustness-audit
kind: summary
title: "Cross-package audit findings on path portability and artifact hygiene"
created-at: 2026-03-15T21:53:25.258Z
tags:
  - audit
  - findings
  - repo-hygiene
linked-hypotheses: []
source: null
---

## Summary
Summarizes the ticket-worthy issues found during the repository robustness audit across persisted path fields, generated dashboards, subprocess launch roots, and documentation/commit guidance.

## Body
Key findings:
- Multiple packages persist absolute workspace paths into checked-in `.loom` artifacts, especially initiative dashboards plus plan/critique/docs/ralph dashboards and launch descriptors.
- Dashboard builders stamp volatile generation timestamps, creating git churn when no durable truth changes.
- Critique/docs/ralph fresh subprocess helpers derive `pi -e` from the consumer workspace instead of the package root.
- Repository docs do not currently define which `.loom` artifacts are canonical versus generated/runtime-only.
- The root README documents the wrong constitutional artifact path, and the `pi-ralph` README understates shipped functionality.

Filed tickets: t-0008 through t-0013.
