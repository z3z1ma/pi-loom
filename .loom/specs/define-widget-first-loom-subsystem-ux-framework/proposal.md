---
id: define-widget-first-loom-subsystem-ux-framework
title: "Define widget-first Loom subsystem UX framework"
status: specified
created-at: 2026-03-17T05:53:45.644Z
updated-at: 2026-03-17T05:54:44.688Z
research: []
initiatives: []
capabilities:
  - capability-common-subsystem-shell
  - capability-human-command-economy
  - capability-mode-portability-and-truthful-degradation
---

## Overview
Establish the shared human-facing interaction model for Pi Loom so every subsystem can move from slash-command-first UX toward a persistent widget home, focused drill-down interaction, and a smaller set of economic human verbs without regressing clarity, reachability, or mode portability.

## Capabilities
- capability-common-subsystem-shell: Common subsystem shell and surface split
- capability-human-command-economy: Human-facing command economy instead of tool mirroring
- capability-mode-portability-and-truthful-degradation: Mode portability and truthful degradation

## Requirements
- req-001: Each subsystem must define a persistent widget home surface that summarizes current state, actionable attention, and the highest-value next actions.
  Acceptance: A reviewer can read any subsystem UX spec and identify the persistent home widget, the focused view set, and the principal jobs assigned to each surface.; No subsystem spec relies solely on slash commands or solely on a single always-visible widget to cover all human workflows.; The resulting subsystem specs use a visibly shared interaction grammar rather than ten unrelated UI metaphors.
  Capabilities: capability-common-subsystem-shell
- req-002: Each subsystem must define one or more focused interactive views for dense browsing, editing, filtering, or drill-down work; these views are distinct from the persistent widget.
  Acceptance: A reviewer can read any subsystem UX spec and identify the persistent home widget, the focused view set, and the principal jobs assigned to each surface.; No subsystem spec relies solely on slash commands or solely on a single always-visible widget to cover all human workflows.; The resulting subsystem specs use a visibly shared interaction grammar rather than ten unrelated UI metaphors.
  Capabilities: capability-common-subsystem-shell
- req-003: Each subsystem spec must name the primary view modes it supports, such as list, board, timeline, master-detail, queue, graph, or packet/review view, and justify why those modes fit that subsystem.
  Acceptance: A reviewer can read any subsystem UX spec and identify the persistent home widget, the focused view set, and the principal jobs assigned to each surface.; No subsystem spec relies solely on slash commands or solely on a single always-visible widget to cover all human workflows.; The resulting subsystem specs use a visibly shared interaction grammar rather than ten unrelated UI metaphors.
  Capabilities: capability-common-subsystem-shell
- req-004: Subsystem home widgets and focused views must share consistent affordances for navigation, selection, opening details, and returning to the home surface so the overall product feels like one system.
  Acceptance: A reviewer can read any subsystem UX spec and identify the persistent home widget, the focused view set, and the principal jobs assigned to each surface.; No subsystem spec relies solely on slash commands or solely on a single always-visible widget to cover all human workflows.; The resulting subsystem specs use a visibly shared interaction grammar rather than ten unrelated UI metaphors.
  Capabilities: capability-common-subsystem-shell
- req-005: The framework must make the difference between persistent widget state and focused transient interaction explicit so subsystem designs do not overload one surface with both jobs.
  Acceptance: A reviewer can read any subsystem UX spec and identify the persistent home widget, the focused view set, and the principal jobs assigned to each surface.; No subsystem spec relies solely on slash commands or solely on a single always-visible widget to cover all human workflows.; The resulting subsystem specs use a visibly shared interaction grammar rather than ten unrelated UI metaphors.
  Capabilities: capability-common-subsystem-shell
- req-006: Each subsystem spec must define the minimum surviving human-facing verbs and explain why each remains valuable to a human operator.
  Acceptance: For every subsystem spec, a reviewer can identify a concise set of surviving human verbs and a clear rationale for why no additional tool-mirroring verbs are needed.; The framework yields subsystem specs that are legible to a human operator without requiring knowledge of the underlying AI tool names.; The spec family makes command-surface reduction an explicit objective with measurable replacement coverage, not an aspirational note.
  Capabilities: capability-human-command-economy
- req-007: Each subsystem spec must name which current slash commands become obsolete under the new UX model, even if exact deletion sequencing is deferred.
  Acceptance: For every subsystem spec, a reviewer can identify a concise set of surviving human verbs and a clear rationale for why no additional tool-mirroring verbs are needed.; The framework yields subsystem specs that are legible to a human operator without requiring knowledge of the underlying AI tool names.; The spec family makes command-surface reduction an explicit objective with measurable replacement coverage, not an aspirational note.
  Capabilities: capability-human-command-economy
- req-008: Subsystem verbs must be phrased around human goals such as open, create, review, refine, resume, or launch rather than around internal tool names or storage operations.
  Acceptance: For every subsystem spec, a reviewer can identify a concise set of surviving human verbs and a clear rationale for why no additional tool-mirroring verbs are needed.; The framework yields subsystem specs that are legible to a human operator without requiring knowledge of the underlying AI tool names.; The spec family makes command-surface reduction an explicit objective with measurable replacement coverage, not an aspirational note.
  Capabilities: capability-human-command-economy
- req-009: Tool-mirroring slash commands are removable only when the widget-plus-focused-view experience covers the corresponding human workflow truthfully.
  Acceptance: For every subsystem spec, a reviewer can identify a concise set of surviving human verbs and a clear rationale for why no additional tool-mirroring verbs are needed.; The framework yields subsystem specs that are legible to a human operator without requiring knowledge of the underlying AI tool names.; The spec family makes command-surface reduction an explicit objective with measurable replacement coverage, not an aspirational note.
  Capabilities: capability-human-command-economy
- req-010: When a human action should trigger agent work, the design must route through normal user-message semantics or equivalent interaction flow rather than relying on a slash command for every tool API.
  Acceptance: For every subsystem spec, a reviewer can identify a concise set of surviving human verbs and a clear rationale for why no additional tool-mirroring verbs are needed.; The framework yields subsystem specs that are legible to a human operator without requiring knowledge of the underlying AI tool names.; The spec family makes command-surface reduction an explicit objective with measurable replacement coverage, not an aspirational note.
  Capabilities: capability-human-command-economy
- req-011: Acceptance for each subsystem must include at least one observable statement about mode-specific behavior so the UI contract remains truthful.
  Acceptance: A user or reviewer can tell what remains possible when the richer focused UI is unavailable.; Each subsystem spec contains an explicit mode-behavior section or equivalent acceptance covering interactive TUI, RPC, and non-interactive behavior.; Subsystem specs do not rely on hidden mode assumptions to make their UX appear more complete than it is.
  Capabilities: capability-mode-portability-and-truthful-degradation
- req-012: Each subsystem spec must state which experiences require interactive TUI, which can degrade to RPC-safe string widgets or textual summaries, and what the non-interactive fallback is.
  Acceptance: A user or reviewer can tell what remains possible when the richer focused UI is unavailable.; Each subsystem spec contains an explicit mode-behavior section or equivalent acceptance covering interactive TUI, RPC, and non-interactive behavior.; Subsystem specs do not rely on hidden mode assumptions to make their UX appear more complete than it is.
  Capabilities: capability-mode-portability-and-truthful-degradation
- req-013: Focused views that require `ctx.ui.custom(...)` must document how the user is informed when that mode is unavailable and what alternative path remains.
  Acceptance: A user or reviewer can tell what remains possible when the richer focused UI is unavailable.; Each subsystem spec contains an explicit mode-behavior section or equivalent acceptance covering interactive TUI, RPC, and non-interactive behavior.; Subsystem specs do not rely on hidden mode assumptions to make their UX appear more complete than it is.
  Capabilities: capability-mode-portability-and-truthful-degradation
- req-014: No subsystem spec may claim capabilities that only exist in a richer runtime mode without also defining the degraded behavior for RPC/headless execution.
  Acceptance: A user or reviewer can tell what remains possible when the richer focused UI is unavailable.; Each subsystem spec contains an explicit mode-behavior section or equivalent acceptance covering interactive TUI, RPC, and non-interactive behavior.; Subsystem specs do not rely on hidden mode assumptions to make their UX appear more complete than it is.
  Capabilities: capability-mode-portability-and-truthful-degradation
- req-015: Persistent widget designs must account for the reduced remote surface by defining a textual fallback rather than assuming rich component widgets are always available.
  Acceptance: A user or reviewer can tell what remains possible when the richer focused UI is unavailable.; Each subsystem spec contains an explicit mode-behavior section or equivalent acceptance covering interactive TUI, RPC, and non-interactive behavior.; Subsystem specs do not rely on hidden mode assumptions to make their UX appear more complete than it is.
  Capabilities: capability-mode-portability-and-truthful-degradation

## Clarifications
(none)
