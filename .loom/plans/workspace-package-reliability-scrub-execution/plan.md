# Workspace package reliability scrub execution

## Purpose / Big Picture
Turn the broad package scrub into durable, reviewable execution slices so package-cluster work can proceed in parallel without losing layer context.

## Progress
- [x] Ticket t-0027 — Manage workspace package reliability scrub (manager)
- [x] Ticket t-0028 — Scrub foundation memory packages for robustness issues (foundation-cluster)
- [x] Ticket t-0029 — Scrub ticketing and worker execution packages (execution-cluster)
- [x] Ticket t-0030 — Scrub critique Ralph and docs packages (orchestration-cluster)

## Surprises & Discoveries
- Observation: Every package task found at least one concrete latent issue despite a fully green baseline.
  Evidence: The manager-led scrub landed ten fixes across constitution, research, initiatives, specs, plans, ticketing, workers, critique, Ralph, and docs after `lsp diagnostics` and baseline `npm test` were already green.

## Decision Log
- Decision: Use package-scoped scrub tasks under three durable worker clusters instead of one monolithic audit pass.
  Rationale: The package files were independent enough to review and patch in parallel while still rolling up to manager-supervised cluster tickets and worker records.
  Date/Author: 2026-03-16 / assistant

## Outcomes & Retrospective
The scrub found ten concrete latent issues across all ten packages. Worker records, tickets, research, and plan state now reflect a completed manager-led remediation pass with successful workspace verification.

## Context and Orientation
The workspace began with green diagnostics and tests plus a recently completed hygiene remediation plan. This scrub focused on latent correctness, robustness, and cohesion issues across all ten shipped packages.

Source target: initiative:workspace-package-reliability-scrub

Scope paths: packages/pi-constitution, packages/pi-critique, packages/pi-docs, packages/pi-initiatives, packages/pi-plans, packages/pi-ralph, packages/pi-research, packages/pi-specs, packages/pi-ticketing, packages/pi-workers

Roadmap: item-002
Initiatives: workspace-package-reliability-scrub
Research: repository-hygiene-and-artifact-robustness-audit, workspace-package-robustness-scrub-2026-03

## Plan of Work
Split the scrub into foundation, execution, and review/orchestration clusters under manager supervision; inspect each package in its cluster; land targeted fixes with regression coverage; then run workspace verification.

## Concrete Steps
Created initiative/research/plan/tickets/workers, launched package-level scrub tasks, applied ten package fixes, addressed post-merge lint/typecheck fallout, and re-ran workspace verification.

## Validation and Acceptance
Targeted package tests landed for each fix, then `npm run check && npm test` passed from the repo root.

## Tickets
- t-0027 [closed] Manage workspace package reliability scrub — manager
- t-0028 [closed] Scrub foundation memory packages for robustness issues — foundation-cluster
- t-0029 [closed] Scrub ticketing and worker execution packages — execution-cluster
- t-0030 [closed] Scrub critique Ralph and docs packages — orchestration-cluster

## Risks and open questions
Remaining question: whether any unaudited package surfaces outside the inspected file set still need path/canonicalization hardening.
