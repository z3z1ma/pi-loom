---
id: design-widget-first-docs-ux
title: "Design widget-first docs UX"
status: planned
created-at: 2026-03-17T05:56:15.396Z
updated-at: 2026-03-17T05:59:05.868Z
research: []
initiatives: []
capabilities:
  - capability-docs-library-workspace
---

## Design Notes
Documentation is Loom's high-level explanatory memory. Its human-facing UX should feel like curating a documentation library and keeping the system explanation truthful after completed work, not like operating a docs storage API. The home widget should surface recently changed docs, stale docs needing refresh, docs linked to newly completed work, and the highest-value next documentation actions.

Focused interaction should support a docs library, document master-detail, revision history, and update-packet or linked-context views. The subsystem should help users understand what a doc explains, who it is for, what changed recently, and what upstream work it is linked to.

The surviving human verbs should center on opening docs, creating a doc, and updating or reviewing a doc. Tool-mirroring verbs for packet or revision operations should become unnecessary once the docs workspace makes those workflows direct.

## Capability Map
- capability-docs-library-workspace: Documentation library and revision workspace

## Requirements
- req-001: Focused views must support library scanning, document master-detail reading/editing, revision history inspection, and update-context review without relying on tool-mirroring slash commands.
  Acceptance: A reviewer can identify how a user would create a doc, inspect existing docs, review revisions, and update stale documentation from the subsystem UX alone.; The docs UX keeps the focus on explanatory records and revision truth rather than storage mechanics.; The persistent widget and focused views cover both library-level triage and one-document deep work.
  Capabilities: capability-docs-library-workspace
- req-002: The design must preserve docs as high-level explanatory memory rather than turning the subsystem into a generic markdown file browser.
  Acceptance: A reviewer can identify how a user would create a doc, inspect existing docs, review revisions, and update stale documentation from the subsystem UX alone.; The docs UX keeps the focus on explanatory records and revision truth rather than storage mechanics.; The persistent widget and focused views cover both library-level triage and one-document deep work.
  Capabilities: capability-docs-library-workspace
- req-003: The home widget must summarize recent documentation changes, stale docs, docs linked to recently completed work, and the most valuable next documentation actions.
  Acceptance: A reviewer can identify how a user would create a doc, inspect existing docs, review revisions, and update stale documentation from the subsystem UX alone.; The docs UX keeps the focus on explanatory records and revision truth rather than storage mechanics.; The persistent widget and focused views cover both library-level triage and one-document deep work.
  Capabilities: capability-docs-library-workspace
- req-004: The UI must support creating a doc, updating it, reviewing revision history, and understanding linked upstream context from the same subsystem experience.
  Acceptance: A reviewer can identify how a user would create a doc, inspect existing docs, review revisions, and update stale documentation from the subsystem UX alone.; The docs UX keeps the focus on explanatory records and revision truth rather than storage mechanics.; The persistent widget and focused views cover both library-level triage and one-document deep work.
  Capabilities: capability-docs-library-workspace
- req-005: The workspace must make it easy to identify documentation truth gaps created by recent work.
  Acceptance: A reviewer can identify how a user would create a doc, inspect existing docs, review revisions, and update stale documentation from the subsystem UX alone.; The docs UX keeps the focus on explanatory records and revision truth rather than storage mechanics.; The persistent widget and focused views cover both library-level triage and one-document deep work.
  Capabilities: capability-docs-library-workspace
