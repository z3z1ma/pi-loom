---
id: artifact-001
research: workspace-package-robustness-scrub-2026-03
kind: summary
title: "Cross-package scrub findings and remediations"
created-at: 2026-03-16T01:47:57.146Z
tags:
  - quality
  - robustness
  - summary
  - workspace
linked-hypotheses: []
source: null
---

## Summary
Manager-led package scrub found ten latent issues across all shipped Pi Loom packages and fixed them with targeted regressions plus workspace-level verification.

## Body
Findings by package:\n- pi-constitution: normalized roadmap artifact-path refs to canonical roadmap item IDs before validation/lookup.\n- pi-research: preserved existing artifact body content on metadata-only updates.\n- pi-initiatives: made initiative reads/dashboard discrepancy reporting resilient to stale linked roadmap/spec/ticket refs.\n- pi-specs: broadened projected-ticket drift detection so reprojection updates projection-owned fields instead of leaving stale ticket content.\n- pi-plans: stabilized plan dashboard linked-ticket counts and snapshot cloning against caller mutation/stale state.\n- pi-ticketing: blocked tickets can no longer transition into active statuses while dependencies remain unresolved.\n- pi-workers: prepare/resume recreates managed worktrees when durable branch metadata changes.\n- pi-critique: adding a new active finding after a passing run now downgrades verdict away from pass.\n- pi-ralph: verifier blockers remain authoritative when iteration/critique updates would otherwise clear review gating.\n- pi-docs: runtime entrypoint resolution now accepts extensionless shebang scripts before falling back to pi.\n\nVerification: targeted package tests plus final `npm run check && npm test` from the repo root passed after consolidation.
