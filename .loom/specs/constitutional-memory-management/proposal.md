---
id: constitutional-memory-management
title: "Constitutional memory management"
status: finalized
created-at: 2026-03-28T03:48:39.509Z
updated-at: 2026-03-28T03:49:21.539Z
research: []
initiatives: []
capabilities:
  - durable-project-identity-and-policy
  - roadmap-current-focus-and-strategic-linkage
  - decision-history-and-rationale-preservation
  - derived-brief-and-completeness-orientation
---

## Overview
Pi Loom maintains a constitutional memory layer that captures durable project identity above every other Loom layer. The constitution must preserve the project's vision, guiding principles, non-negotiable constraints, roadmap intent, current focus, and recorded strategic decisions as a single durable source of policy truth that later initiatives, specs, plans, tickets, critique runs, and documentation updates can inherit without relying on chat history or ad hoc operational notes.

## Capabilities
- durable-project-identity-and-policy: Durable project identity and policy
- roadmap-current-focus-and-strategic-linkage: Roadmap, current focus, and strategic linkage
- decision-history-and-rationale-preservation: Decision history and rationale preservation
- derived-brief-and-completeness-orientation: Derived brief and completeness orientation

## Requirements
- req-001: Constraints SHALL be recorded as non-negotiable boundaries with rationale so lower layers can inherit them as governing limits rather than optional advice.
  Acceptance: A reader can recover project purpose, principles, and constraints from constitutional state alone.; Downstream artifacts can cite constitutional policy without needing transcript archaeology.; Principles and constraints include enough rationale to influence later design choices.
  Capabilities: durable-project-identity-and-policy
- req-002: Guiding principles SHALL be stored as explicit durable policy statements with rationale, allowing later readers to understand both the rule and why it exists.
  Acceptance: A reader can recover project purpose, principles, and constraints from constitutional state alone.; Downstream artifacts can cite constitutional policy without needing transcript archaeology.; Principles and constraints include enough rationale to influence later design choices.
  Capabilities: durable-project-identity-and-policy
- req-003: Lower layers SHALL treat constitutional truth as upstream policy context rather than reconstructing project identity from local package behavior alone.
  Acceptance: A reader can recover project purpose, principles, and constraints from constitutional state alone.; Downstream artifacts can cite constitutional policy without needing transcript archaeology.; Principles and constraints include enough rationale to influence later design choices.
  Capabilities: durable-project-identity-and-policy
- req-004: The constitutional record SHALL preserve a durable project identity including the project's title, purpose, and vision rather than relying on transient chat framing.
  Acceptance: A reader can recover project purpose, principles, and constraints from constitutional state alone.; Downstream artifacts can cite constitutional policy without needing transcript archaeology.; Principles and constraints include enough rationale to influence later design choices.
  Capabilities: durable-project-identity-and-policy
- req-005: Constitutional roadmap items MAY link to initiatives, research, and specs, but those lower artifacts SHALL remain their own records rather than embedded substitutes inside the constitution.
  Acceptance: A reader can tell which parts of constitutional truth are stable policy and which parts represent current strategic sequencing.; Current focus changes do not require mutating the meaning of durable principles or constraints.; Roadmap items remain understandable in isolation, including why they matter and what they connect to downstream.
  Capabilities: roadmap-current-focus-and-strategic-linkage
- req-006: Current focus SHALL be represented separately from stable principles and constraints so near-term priorities can evolve without rewriting higher-order policy.
  Acceptance: A reader can tell which parts of constitutional truth are stable policy and which parts represent current strategic sequencing.; Current focus changes do not require mutating the meaning of durable principles or constraints.; Roadmap items remain understandable in isolation, including why they matter and what they connect to downstream.
  Capabilities: roadmap-current-focus-and-strategic-linkage
- req-007: Roadmap items SHALL preserve explicit identity, status, horizon, summary, and rationale so strategic sequencing remains intelligible over time.
  Acceptance: A reader can tell which parts of constitutional truth are stable policy and which parts represent current strategic sequencing.; Current focus changes do not require mutating the meaning of durable principles or constraints.; Roadmap items remain understandable in isolation, including why they matter and what they connect to downstream.
  Capabilities: roadmap-current-focus-and-strategic-linkage
- req-008: Strategic direction summaries SHALL remain recoverable from the constitutional record so later agents can orient quickly without losing the detailed roadmap beneath them.
  Acceptance: A reader can tell which parts of constitutional truth are stable policy and which parts represent current strategic sequencing.; Current focus changes do not require mutating the meaning of durable principles or constraints.; Roadmap items remain understandable in isolation, including why they matter and what they connect to downstream.
  Capabilities: roadmap-current-focus-and-strategic-linkage
- req-009: A constitutional decision SHALL explain the rationale for a principle, constraint, or roadmap change well enough that later agents can apply it without recreating the original conversation.
  Acceptance: A reader can inspect constitutional decisions as durable provenance rather than relying on commit messages or chats.; Affected-artifact references make the scope of a decision legible.; Later updates do not erase the existence of earlier strategic decisions.
  Capabilities: decision-history-and-rationale-preservation
- req-010: Affected-artifact references SHALL make it possible to trace which downstream constitutional sections or linked work items a decision touched.
  Acceptance: A reader can inspect constitutional decisions as durable provenance rather than relying on commit messages or chats.; Affected-artifact references make the scope of a decision legible.; Later updates do not erase the existence of earlier strategic decisions.
  Capabilities: decision-history-and-rationale-preservation
- req-011: Constitutional decisions SHALL be recorded durably with the question, answer, decision kind, and affected artifacts rather than being left only in chat.
  Acceptance: A reader can inspect constitutional decisions as durable provenance rather than relying on commit messages or chats.; Affected-artifact references make the scope of a decision legible.; Later updates do not erase the existence of earlier strategic decisions.
  Capabilities: decision-history-and-rationale-preservation
- req-012: Decision history SHALL remain append-only enough for later readers to distinguish current constitutional state from the sequence of clarifications and revisions that led to it.
  Acceptance: A reader can inspect constitutional decisions as durable provenance rather than relying on commit messages or chats.; Affected-artifact references make the scope of a decision legible.; Later updates do not erase the existence of earlier strategic decisions.
  Capabilities: decision-history-and-rationale-preservation
- req-013: Completeness or similar rollups SHALL reflect whether the key constitutional sections are present and linked coherently, not whether downstream work is finished.
  Acceptance: A brief can orient a new agent quickly without replacing the detailed constitution.; Completeness signals describe record completeness, not speculative project completion.; Derived views remain consistent with the underlying constitutional state.
  Capabilities: derived-brief-and-completeness-orientation
- req-014: Derived orientation surfaces SHALL stay faithful to the underlying constitutional record rather than introducing policy that does not exist in canonical state.
  Acceptance: A brief can orient a new agent quickly without replacing the detailed constitution.; Completeness signals describe record completeness, not speculative project completion.; Derived views remain consistent with the underlying constitutional state.
  Capabilities: derived-brief-and-completeness-orientation
- req-015: Readers SHALL be able to move from a brief or overview back to the underlying constitutional detail when higher-fidelity context is needed.
  Acceptance: A brief can orient a new agent quickly without replacing the detailed constitution.; Completeness signals describe record completeness, not speculative project completion.; Derived views remain consistent with the underlying constitutional state.
  Capabilities: derived-brief-and-completeness-orientation
- req-016: The constitutional system MAY produce a compact brief or overview for prompt-budget-constrained use, but the detailed constitutional record SHALL remain the authoritative source.
  Acceptance: A brief can orient a new agent quickly without replacing the detailed constitution.; Completeness signals describe record completeness, not speculative project completion.; Derived views remain consistent with the underlying constitutional state.
  Capabilities: derived-brief-and-completeness-orientation

## Clarifications
(none)
