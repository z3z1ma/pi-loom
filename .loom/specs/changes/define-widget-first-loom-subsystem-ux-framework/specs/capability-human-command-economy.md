---
id: capability-human-command-economy
title: "Human-facing command economy instead of tool mirroring"
change: define-widget-first-loom-subsystem-ux-framework
updated-at: 2026-03-17T05:54:44.688Z
source-changes:
  - define-widget-first-loom-subsystem-ux-framework
---

## Summary
Surviving slash commands are economic verbs that launch or focus subsystem experiences and trigger meaningful work, not one-to-one wrappers around the AI-facing tools.

## Requirements
- Each subsystem spec must define the minimum surviving human-facing verbs and explain why each remains valuable to a human operator.
- Each subsystem spec must name which current slash commands become obsolete under the new UX model, even if exact deletion sequencing is deferred.
- Subsystem verbs must be phrased around human goals such as open, create, review, refine, resume, or launch rather than around internal tool names or storage operations.
- Tool-mirroring slash commands are removable only when the widget-plus-focused-view experience covers the corresponding human workflow truthfully.
- When a human action should trigger agent work, the design must route through normal user-message semantics or equivalent interaction flow rather than relying on a slash command for every tool API.

## Scenarios
- A critique user triggers a launch or review action from the subsystem UI, and the system converts that interaction into actual agent work without needing a dedicated slash command for every critique tool.
- A subsystem retains one or two verbs for frequent human entry or escalation points, while lower-level maintenance operations are no longer slash-addressable by name.
- A ticketing user opens tickets from one command and then creates, edits, filters, and reviews tickets from the widget-driven interface rather than calling separate slash commands for each tool action.
