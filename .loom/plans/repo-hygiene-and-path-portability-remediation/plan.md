# Repo hygiene and path portability remediation

## Purpose / Big Picture
Turn the repository-hygiene audit findings into a coordinated implementation slice across path semantics, runtime helpers, dashboard stability, and documentation truthfulness.

## Progress
- [x] Ticket t-0008 — Standardize persisted Loom artifact paths as repo-relative (path-portability)
- [x] Ticket t-0009 — Eliminate git churn from generated dashboard timestamps (dashboard-stability)
- [x] Ticket t-0010 — Resolve critique/docs/ralph subprocess extension roots from package location (runtime-root-resolution)
- [x] Ticket t-0011 — Define and enforce commit policy for `.loom` artifacts (commit-policy)
- [x] Ticket t-0012 — Correct root README constitutional memory path (readme-path-correction)
- [x] Ticket t-0013 — Update `pi-ralph` README to match shipped functionality (ralph-readme-truthfulness)
- [x] Ticket t-0014 — Normalize Loom tool-returned path fields to repo-relative values (tool-output-path-contract)

## Surprises & Discoveries
- Observation: Critique/docs/plans stores still contained `.loom/constitutional` filesystem checks even after root documentation was corrected.
  Evidence: Full-suite verification exposed failing critique packet coverage and a grep sweep found stale `join(this.cwd, ".loom", "constitutional", "state.json")` checks in critique/docs/plans stores.

## Decision Log
- Decision: Treat `launch.json` as a runtime-local artifact and ignore it in git while keeping canonical Loom state repo-visible.
  Rationale: Launch descriptors are mutable handoff state that create git noise without representing durable project truth.
  Date/Author: 2026-03-15 / assistant

## Outcomes & Retrospective
All seven linked tickets are closed. Dashboard churn from generatedAt is removed, runtime-local launch descriptors are ignored, and durable/tool-returned path fields are repo-relative across the touched Loom layers.

## Context and Orientation
The repo now uses repo-relative path contracts for surfaced/persisted artifact references, stable dashboard shapes without generation-only timestamps, package-rooted subprocess launch helpers, and explicit maintainer guidance about canonical versus runtime-local `.loom` artifacts.

Source target: workspace:repo

Scope paths: .gitignore, packages/pi-critique, packages/pi-docs, packages/pi-initiatives, packages/pi-plans, packages/pi-ralph, packages/pi-research, packages/pi-specs, packages/pi-ticketing, README.md

Research: repository-hygiene-and-artifact-robustness-audit

## Plan of Work
Implemented across initiatives, research, specs, plans, ticketing, critique, docs, and Ralph, then validated with targeted package tests plus workspace lint/typecheck/test.

## Concrete Steps
Updated affected domain stores/models/renderers/runtime helpers, refreshed package tests, corrected documentation and ignore rules, and closed the linked tickets after verification.

## Validation and Acceptance
Verified with `npm run lint`, `npm run typecheck`, and `npm test` from the repo root after targeted package-level regression tests during implementation.

## Tickets
- t-0008 [closed] Standardize persisted Loom artifact paths as repo-relative — path-portability
- t-0009 [closed] Eliminate git churn from generated dashboard timestamps — dashboard-stability
- t-0010 [closed] Resolve critique/docs/ralph subprocess extension roots from package location — runtime-root-resolution
- t-0011 [closed] Define and enforce commit policy for `.loom` artifacts — commit-policy
- t-0012 [closed] Correct root README constitutional memory path — readme-path-correction
- t-0013 [closed] Update `pi-ralph` README to match shipped functionality — ralph-readme-truthfulness
- t-0014 [closed] Normalize Loom tool-returned path fields to repo-relative values — tool-output-path-contract

## Risks and open questions
Remaining open question: whether other non-ticketed absolute-path prompt/context surfaces (for example some workspace prompt helpers) should also be normalized in a follow-up hygiene sweep.
