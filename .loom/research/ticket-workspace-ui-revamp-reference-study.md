---
id: ticket-workspace-ui-revamp-reference-study
title: "Ticket workspace UI revamp reference study"
status: synthesized
created-at: 2026-03-17T19:07:39.439Z
tags:
  - planning
  - research
  - ticketing
  - ui
source-refs:
  - .agents/resources/oh-my-pi/packages/coding-agent/src/modes/components/settings-selector.ts
  - .agents/resources/oh-my-pi/packages/coding-agent/src/modes/controllers/selector-controller.ts
  - .agents/resources/oh-my-pi/packages/tui/src/components/tab-bar.ts
  - .agents/resources/pi-mono/packages/coding-agent/src/modes/interactive/components/settings-selector.ts
  - .agents/resources/pi-mono/packages/coding-agent/src/modes/interactive/interactive-mode.ts
  - .agents/resources/pi-mono/packages/tui/src/components/settings-list.ts
  - .agents/resources/pi-subagents/agent-manager.ts
  - .agents/resources/pi-subagents/index.ts
  - .agents/resources/pi-subagents/README.md
  - https://textual.textualize.io/guide/screens/
  - https://textual.textualize.io/widgets/tabs/
  - packages/pi-ticketing/extensions/commands/ticket.ts
  - packages/pi-ticketing/extensions/ui/ticket-workspace.ts
  - packages/pi-ticketing/README.md
---

## Question
What ticket workspace interaction model should replace the current /ticket open home surface, and which existing Pi UIs provide the strongest source-backed patterns to borrow?

## Objective
Preserve durable evidence for a ticket workspace redesign by comparing the current pi-loom ticket UI with source-backed Pi settings and pi-subagents experiences, plus general modal/tab TUI guidance.

## Status Summary
Completed source-backed comparison. Current ticket UI is a textual custom view with a single vertical action list, while reference Pi UIs use selector replacement or centered overlays, tabbed categorization, subordinate submenus, richer keybinding affordances, and explicit focus restoration. The added pi-subagents evidence strengthens the recommendation to use a centered overlay with a single multi-screen stateful shell.

## Scope
- .agents/resources/oh-my-pi/packages/coding-agent/src/modes/components/settings-selector.ts
- .agents/resources/oh-my-pi/packages/coding-agent/src/modes/controllers/selector-controller.ts
- .agents/resources/oh-my-pi/packages/tui/src/components/tab-bar.ts
- .agents/resources/pi-mono/packages/coding-agent/src/modes/interactive/components/settings-selector.ts
- .agents/resources/pi-mono/packages/coding-agent/src/modes/interactive/interactive-mode.ts
- .agents/resources/pi-mono/packages/tui/src/components/settings-list.ts
- .agents/resources/pi-subagents/agent-manager.ts
- .agents/resources/pi-subagents/index.ts
- .agents/resources/pi-subagents/README.md
- packages/pi-ticketing/extensions/commands/ticket.ts
- packages/pi-ticketing/extensions/ui/ticket-workspace.ts

## Non-Goals
- No code changes
- No implementation estimates beyond planning-level sequencing
- No runtime screenshots or visual capture

## Methodology
- Inspect local pi-subagents overlay manager sources and README for modal patterns.
- Inspect local source mirrors for pi-mono /settings and oh-my-pi tabbed settings flows.
- Read the current ticket workspace source and README to understand existing command and UI behavior.
- Review official documentation summaries for modal and tabbed TUI behavior to cross-check focus and keyboard-navigation expectations.

## Keywords
- overlay modal
- pi-mono
- pi-subagents
- settings selector
- tabbed tui
- ticket ui
- ticket workspace

## Conclusions
- A beautiful revamp can stay truthful to the ticket ledger by separating durable data access from a richer view-model layer rather than changing store semantics.
- Pi settings provides the right navigation model: tabs for major ticket surfaces, focused lists within each tab, submenus/editors for mutations, and cancel behavior that returns focus cleanly.
- pi-subagents provides the right container model: a centered overlay and a single internal state machine that owns list/detail/edit/task-input flows without dropping the user back into separate commands.
- The best fit for /ticket is a modal-or-drawer workspace built as a dedicated component, not incremental decoration of renderTicketWorkspaceText().
- The biggest gap is not color or copy; it is interaction architecture. The current ticket home is a flat text dump plus action list, while the reference UIs are stateful containers with strong information hierarchy and progressive disclosure.

## Recommendations
- Default the interactive presentation to a centered overlay workbench when overlay support is available; treat drawer-like detail panels inside that shell as the first step toward the 'pull up/down' feel.
- Design keyboard-first flows explicitly: Tab/Shift+Tab or Left/Right for tabs, Up/Down within lists, Enter to drill in, Esc to back/close, and a small set of memorable shortcuts for create/filter/review.
- Implement the revamp in phased slices with snapshot tests on rendering logic and command-flow tests on navigation, overlay opening, and fallback behavior.
- Introduce a ticket workspace view-model layer that derives inbox counts, lane summaries, activity, dependencies, and detail payloads from existing store APIs so the UI renders cards/panels instead of raw strings.
- Replace the current line-oriented workspace renderer with a componentized ticket workbench shell that supports tabs, stacked panels, and an overlay-capable presentation mode.
- Use pi-subagents-style internal screen ownership: one component should manage overview, list/board, detail, create/edit, and review flows with explicit back-stack and Esc behavior.

## Open Questions
- How much inline editing should happen inside the new workspace versus delegating to ctx.ui.input/editor for long-form fields?
- Should the home widget remain a lightweight summary once the main workspace becomes an overlay, or also be upgraded into a compact mini-dashboard?
- Should the interactive /ticket shell use centered overlay, bottom drawer, or adapt based on terminal size?

## Linked Work
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

(none)

## Hypotheses
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

(none)

## Artifacts
_Generated summary. Reconcile ignores edits in this section so canonical hypotheses, artifacts, and linked work are preserved._

(none)
