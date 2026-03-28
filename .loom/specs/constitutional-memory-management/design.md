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

## Design Notes
## Problem framing
Pi Loom uses constitutional memory as the highest-order durable context. Without an explicit constitutional contract, later layers risk drifting into chat-local assumptions about project purpose, durable boundaries, or roadmap priorities.

## Desired behavior
The constitution must behave as a durable policy layer: stable enough to anchor lower work, detailed enough to stand alone, and explicit about what is durable versus what is merely current focus or open strategic uncertainty.

## Scope
This spec covers the constitutional record itself, including vision, principles, constraints, roadmap items, current focus, derived summaries such as the brief and completeness rollup, and append-only decision history. It also covers how lower layers should relate to constitutional truth.

## Non-goals
This spec does not redefine operational instructions such as AGENTS.md, nor does it turn the constitution into a replacement for research, initiatives, specs, plans, tickets, critique, or docs. It also does not require that every constitutional update trigger downstream execution immediately.

## Dependencies and adjacent specs
The constitution depends on the canonical storage substrate for persistence and on lower layers only for linkage, not for authority. Initiatives, specs, plans, tickets, critique, and docs consume constitutional truth; they do not replace it.

## Risks and edge cases
The main risks are either making constitutional memory too thin to guide future work or overloading it with lower-layer execution detail. Another risk is letting current focus or roadmap churn rewrite durable principles and constraints without preserving the rationale for the change.

## Verification expectations
A conforming implementation can recover project vision, principles, constraints, roadmap context, current focus, and decision rationale from the constitutional record alone. A reader should be able to distinguish stable principles from evolving roadmap/current-focus material and should be able to trace linked downstream artifacts without reconstructing the original conversation.

## Provenance
Derived from the constitutional brief, CONSTITUTION.md, README.md, constitutional memory tool contract, and the constitution extension wiring in the current repository.

## Open questions
The constitution may evolve in detail and representation, but it must remain the durable project-policy layer above initiatives and specs.

## Capability Map
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
