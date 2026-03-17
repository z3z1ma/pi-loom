---
id: capability-docs-library-workspace
title: "Documentation library and revision workspace"
change: design-widget-first-docs-ux
updated-at: 2026-03-17T05:59:05.868Z
source-changes:
  - design-widget-first-docs-ux
---

## Summary
The docs subsystem provides a persistent documentation widget plus focused library, detail, revision, and update-context views for maintaining high-level explanatory records.

## Requirements
- Focused views must support library scanning, document master-detail reading/editing, revision history inspection, and update-context review without relying on tool-mirroring slash commands.
- The design must preserve docs as high-level explanatory memory rather than turning the subsystem into a generic markdown file browser.
- The home widget must summarize recent documentation changes, stale docs, docs linked to recently completed work, and the most valuable next documentation actions.
- The UI must support creating a doc, updating it, reviewing revision history, and understanding linked upstream context from the same subsystem experience.
- The workspace must make it easy to identify documentation truth gaps created by recent work.

## Scenarios
- A maintainer edits a document in master-detail view, reviews prior revisions, and confirms linked upstream work before saving the update.
- A user opens docs and sees one stale operations guide, one new overview linked to completed work, and one document needing review, then drills into the stale guide.
- A user scans the docs library to find which high-level explanation needs updating next without relying on raw slash commands.
