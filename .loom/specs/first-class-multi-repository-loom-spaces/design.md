---
id: first-class-multi-repository-loom-spaces
title: "First-class multi-repository Loom spaces"
status: finalized
created-at: 2026-03-22T22:33:51.261Z
updated-at: 2026-03-22T22:37:46.443Z
research: []
initiatives: []
capabilities:
  - explicit-space-lifecycle
  - repository-enrollment-and-health
  - worktree-and-clone-identity
  - repository-qualified-addressing
  - cross-repository-entity-graph
  - parent-directory-session-behavior
  - runtime-propagation-and-routing
  - path-bearing-operation-safety
  - discovery-search-and-dashboard-ergonomics
  - export-import-and-backup-truthfulness
  - migration-and-compatibility-behavior
  - space-isolation-and-safety
  - diagnostics-observability-and-verification
  - degraded-mode-and-unavailable-repository-behavior
---

## Design Notes
## Problem framing
Pi Loom currently has strong canonical-storage primitives for spaces, repositories, worktrees, repository-owned entities, and cross-entity links, but its operational contract still behaves as though one session equals one cwd and one repository. That mismatch is acceptable only while Loom is used inside one repository at a time. It is not acceptable for a production mode where a parent directory contains multiple repositories that together implement one system and operators need shared specs, plans, tickets, initiatives, critique, Ralph runs, and docs across those repositories.

This specification defines the complete production-ready behavior for first-class multi-repository Loom spaces. The target is not merely to let the database hold multiple repositories. The target is to let humans and AI operate over multiple repositories truthfully, ergonomically, and safely without silent cwd-dependent misrouting, synthetic repository identities, clone-local leakage, or loss of headless parity.

## Goals
- Make multi-repository Loom spaces first-class canonical objects rather than accidental consequences of cwd.
- Preserve explicit repository identity and explicit worktree identity within one shared space.
- Allow Pi to start from a parent directory above several repositories and still operate safely across the shared system.
- Preserve portable canonical truth while keeping runtime-local execution details clone-local.
- Provide ergonomics that are fast when context is unambiguous and safe when context is ambiguous.
- Maintain parity across slash commands, AI-facing tools, headless execution, Ralph, critique, docs, and exported artifacts.
- Keep behavior compatible with the constitutional constraints: SQLite-first semantics, derived exports not truth, headless parity, and no clone-local leakage into canonical records.

## Non-goals
- This specification does not turn Loom into a generic workflow engine or deployment system.
- This specification does not require network-shared SQLite. The local SQLite-first contract remains the starting point, but the semantics defined here must remain valid under future shared backends.
- This specification does not require every repository in a directory tree to belong to the active space. Discovery may find candidates that are not enrolled.
- This specification does not require every operation to span multiple repositories. Single-repository work remains a degenerate, fully supported case of the broader model.
- This specification does not make clone-local runtime artifacts canonical shared truth.

## Core invariants
1. A Loom space is a first-class canonical coordination boundary, not an alias for a repository root.
2. A repository is a first-class canonical member of a Loom space.
3. A repository may have multiple clone-local worktrees or attached clones inside the same space.
4. Canonical entity identity is space-scoped; repository attribution is preserved explicitly when relevant.
5. No operation may silently execute against a different repository than the one the operator or caller would reasonably infer.
6. Ambiguous repository context must never degrade into a plausible synthetic repository identity.
7. Canonical records must remain intelligible without a specific machine path, process id, or local clone.
8. Human-facing and AI-facing surfaces must expose the same authoritative scope model.
9. Relative paths are only meaningful relative to an explicit repository/worktree scope.
10. Export, import, backup, and sync semantics must always describe their true scope.

## Domain model
### Space
A space is the shared canonical system boundary. It carries stable identity independent of cwd and may contain multiple repositories. Space-level operations include discovery, listing, selection, export, import, dashboards, and cross-repository queries.

### Repository
A repository is a canonical member of a space with stable identity, enrollment state, display metadata, remote metadata, and health/availability metadata. Repository identity must not collapse to whatever cwd happens to be active. One repository belongs to exactly one canonical space at a time.

### Worktree / clone attachment
A worktree attachment represents one clone-local execution target for a repository. Worktree identity must distinguish separate clones and separate worktrees even when they share the same branch name and the same basename on disk. Worktree identity must be stable enough to attach runtime-local state truthfully without colliding across clones.

### Canonical entities and links
Constitution, research, initiatives, specs, plans, tickets, critique, Ralph, docs, artifacts, and related entities remain canonical space-scoped records. Where repository attribution matters, it must remain explicit through owning-repository or equivalent repository-qualified metadata. Links remain explicit graph edges; they must remain resolvable without path heuristics.

## Space selection and discovery model
- Pi may start from any of the following:
  - inside a participating repository
  - inside a participating worktree
  - from a parent directory above several repositories
  - from a directory that contains no participating repository but has an explicit persisted space binding
- The system must support deterministic discovery of:
  - enrolled repositories under or near cwd
  - candidate spaces that match discovered repositories or persisted bindings
  - the active repository scope, if any
- If discovery yields one unambiguous space and one unambiguous active repository, Pi may continue without an interactive prompt.
- If discovery yields one unambiguous space but multiple possible active repositories, space-level operations may proceed while repo-sensitive operations require explicit repository selection.
- If discovery yields multiple candidate spaces or no trustworthy space, the system must require explicit selection or creation before repo-sensitive operations proceed.
- Persisted selections may accelerate startup, but they must be inspectable, revocable, and ignored when stale or contradictory.

## Addressing and scope principles
- Every durable ref must be truthful about scope.
- Human-friendly short refs are allowed only when unambiguous within the active scope.
- When ambiguity exists, user-visible refs, errors, prompts, dashboards, and tool results must surface repository-qualified or space-qualified forms.
- Any operation that touches the filesystem, launches a runtime, reads a repository-local path, or executes repo-sensitive validation must carry explicit repository scope and, where relevant, explicit worktree scope.
- Cross-space references are invalid unless an operation explicitly supports federation; this specification assumes one active space per operation.

## UX and ergonomics principles
- Common case: when context is unambiguous, the experience should feel as simple as single-repo Loom.
- Ambiguous case: when context is ambiguous, the system must fail safe and guide the operator toward explicit disambiguation.
- The product should always make it obvious whether the caller is operating at:
  - space scope
  - repository scope
  - worktree scope
- Search, list, read, and dashboard surfaces should be broad by default and then allow intentional narrowing by repository, entity kind, status, or text.
- Repository-qualified output should be compact, readable, and stable enough to use in follow-up turns.
- Headless and AI-facing tools must be at least as expressive as the human UX. Widget or session affordances may accelerate selection but may not be the only authoritative path.

## Runtime and orchestration principles
- Shared canonical context may be space-wide; execution is always repository-targeted and often worktree-targeted.
- Ralph, critique, docs, verifier runs, and nested sessions must preserve the repository/worktree scope of the action that launched them.
- A parent directory session may remain active across many repositories, but no nested run may inherit repository scope by guesswork.
- Runtime-local artifacts stay clone-local even when their parent canonical records are space-scoped.

## Export, import, backup, and migration principles
- Full-space operations must include all enrolled repositories and their relevant state.
- Partial exports are allowed only when explicitly requested and clearly labeled.
- Import/hydration must preserve repository identities, links, and worktree attachments without collapsing them into the importing cwd.
- Backward-compatible migration may preserve legacy behavior temporarily at the edges, but canonical semantics after cutover must be unambiguous and fully multi-repo aware.

## Performance and scale expectations
- Multi-repository spaces must remain usable for a realistic service fleet, not just two small repos.
- Listing and search should remain responsive when a space contains many repositories and many entities.
- Repository qualification should not force callers to scan or materialize unrelated repositories when a narrower query is available.
- Discovery should be bounded and deterministic rather than recursively wandering the filesystem without limit.

## Failure posture
- Wrong-repository execution is a high-severity failure.
- Synthetic identities created only because cwd happened to be above many repositories are forbidden.
- Missing repository scope must produce a truthful prompt or error, never a plausible but wrong default.
- Stale persisted selections must be detected and surfaced.
- Repository unavailability, clone disappearance, detached worktrees, and conflicting enrollment must remain observable conditions rather than hidden assumptions.

## Verification strategy
Production readiness requires evidence, not only code shape. Acceptance must include end-to-end validation of discovery, enrollment, canonical writes, cross-repository links, repo-qualified reads, runtime launches, export/import semantics, failure handling, degraded modes, and operator-visible diagnostics. A feature is not complete until incorrect repository targeting, ambiguous addressing, and partial-export lies are mechanically prevented or detected.

## Capability Map
- explicit-space-lifecycle: Explicit space lifecycle and selection
- repository-enrollment-and-health: Repository enrollment, discovery, and health
- worktree-and-clone-identity: Worktree and clone identity integrity
- repository-qualified-addressing: Repository-qualified addressing and refs
- cross-repository-entity-graph: Cross-repository entity graph semantics
- parent-directory-session-behavior: Parent-directory session initialization and UX
- runtime-propagation-and-routing: Repository-targeted runtime propagation and routing
- path-bearing-operation-safety: Path, attachment, and filesystem safety
- discovery-search-and-dashboard-ergonomics: Discovery, search, list, and dashboard ergonomics
- export-import-and-backup-truthfulness: Export, import, sync, and backup truthfulness
- migration-and-compatibility-behavior: Migration, backward compatibility, and cutover behavior
- space-isolation-and-safety: Space isolation, membership integrity, and safety
- diagnostics-observability-and-verification: Diagnostics, observability, and production-readiness verification
- degraded-mode-and-unavailable-repository-behavior: Degraded modes and unavailable repository behavior

## Requirements
- req-001: The system must support creating a new canonical Loom space independent of any single repository root.
  Acceptance: A selected space remains stable and queryable even if Pi is later started from another participating repository or another parent directory.; Persisted bindings never override contradictory live discovery without surfacing the conflict.; Starting Pi from a parent directory containing multiple repositories can result in a valid active space without inventing a synthetic repository identity.; When no unambiguous active space exists, repo-sensitive operations stop until the caller chooses or creates one.
  Capabilities: explicit-space-lifecycle
- req-002: The system must support deterministic discovery of candidate spaces and candidate repositories from a starting cwd without silently converting a parent directory into a synthetic repository.
  Acceptance: A selected space remains stable and queryable even if Pi is later started from another participating repository or another parent directory.; Persisted bindings never override contradictory live discovery without surfacing the conflict.; Starting Pi from a parent directory containing multiple repositories can result in a valid active space without inventing a synthetic repository identity.; When no unambiguous active space exists, repo-sensitive operations stop until the caller chooses or creates one.
  Capabilities: explicit-space-lifecycle
- req-003: The system must support enrolling one or more repositories into an existing space and listing enrolled repositories at space scope.
  Acceptance: A selected space remains stable and queryable even if Pi is later started from another participating repository or another parent directory.; Persisted bindings never override contradictory live discovery without surfacing the conflict.; Starting Pi from a parent directory containing multiple repositories can result in a valid active space without inventing a synthetic repository identity.; When no unambiguous active space exists, repo-sensitive operations stop until the caller chooses or creates one.
  Capabilities: explicit-space-lifecycle
- req-004: The system must support explicit active-space selection when cwd does not identify one unambiguous target.
  Acceptance: A selected space remains stable and queryable even if Pi is later started from another participating repository or another parent directory.; Persisted bindings never override contradictory live discovery without surfacing the conflict.; Starting Pi from a parent directory containing multiple repositories can result in a valid active space without inventing a synthetic repository identity.; When no unambiguous active space exists, repo-sensitive operations stop until the caller chooses or creates one.
  Capabilities: explicit-space-lifecycle
- req-005: The system must support persisted active-space bindings that are inspectable, revocable, and ignored when stale or contradictory.
  Acceptance: A selected space remains stable and queryable even if Pi is later started from another participating repository or another parent directory.; Persisted bindings never override contradictory live discovery without surfacing the conflict.; Starting Pi from a parent directory containing multiple repositories can result in a valid active space without inventing a synthetic repository identity.; When no unambiguous active space exists, repo-sensitive operations stop until the caller chooses or creates one.
  Capabilities: explicit-space-lifecycle
- req-006: Repository discovery under a parent directory must be bounded, deterministic, and safe against unrelated nested repositories.
  Acceptance: A repository moved to a different local path can still be recognized as the same canonical repository when stable identity evidence matches.; Discovery does not recursively attach unrelated repositories without explicit operator intent.; Removing a local clone does not delete canonical repository identity or canonical records that belong to it.; Repository lists at space scope clearly distinguish enrolled repositories from merely discovered candidates.
  Capabilities: repository-enrollment-and-health
- req-007: The system must expose repository availability and enrollment state so missing clones, moved paths, or unreachable worktrees remain observable.
  Acceptance: A repository moved to a different local path can still be recognized as the same canonical repository when stable identity evidence matches.; Discovery does not recursively attach unrelated repositories without explicit operator intent.; Removing a local clone does not delete canonical repository identity or canonical records that belong to it.; Repository lists at space scope clearly distinguish enrolled repositories from merely discovered candidates.
  Capabilities: repository-enrollment-and-health
- req-008: The system must preserve stable canonical repository identity even when the current cwd changes or multiple clones of the same repository exist.
  Acceptance: A repository moved to a different local path can still be recognized as the same canonical repository when stable identity evidence matches.; Discovery does not recursively attach unrelated repositories without explicit operator intent.; Removing a local clone does not delete canonical repository identity or canonical records that belong to it.; Repository lists at space scope clearly distinguish enrolled repositories from merely discovered candidates.
  Capabilities: repository-enrollment-and-health
- req-009: The system must record enough repository metadata to render concise, stable, human-usable repository labels and to detect likely identity mismatches.
  Acceptance: A repository moved to a different local path can still be recognized as the same canonical repository when stable identity evidence matches.; Discovery does not recursively attach unrelated repositories without explicit operator intent.; Removing a local clone does not delete canonical repository identity or canonical records that belong to it.; Repository lists at space scope clearly distinguish enrolled repositories from merely discovered candidates.
  Capabilities: repository-enrollment-and-health
- req-010: The system must support enrolling, unenrolling, and inspecting repositories without corrupting entities that already reference those repositories.
  Acceptance: A repository moved to a different local path can still be recognized as the same canonical repository when stable identity evidence matches.; Discovery does not recursively attach unrelated repositories without explicit operator intent.; Removing a local clone does not delete canonical repository identity or canonical records that belong to it.; Repository lists at space scope clearly distinguish enrolled repositories from merely discovered candidates.
  Capabilities: repository-enrollment-and-health
- req-011: Runtime attachments, process leases, and local launch descriptors must bind to explicit worktree identity rather than repository-only or cwd-only inference.
  Acceptance: Detaching or deleting one worktree does not corrupt other worktrees for the same repository.; Runtime-local records remain attributable to the correct clone after another clone of the same repository is attached.; Stale worktree attachments can be detected without erasing their canonical parent repository.; Two clones of the same remote on the same branch never collapse to the same worktree identity unless they are truly the same attached worktree.
  Capabilities: worktree-and-clone-identity
- req-012: The system must allow multiple worktrees for the same repository inside one space without identity collisions.
  Acceptance: Detaching or deleting one worktree does not corrupt other worktrees for the same repository.; Runtime-local records remain attributable to the correct clone after another clone of the same repository is attached.; Stale worktree attachments can be detected without erasing their canonical parent repository.; Two clones of the same remote on the same branch never collapse to the same worktree identity unless they are truly the same attached worktree.
  Capabilities: worktree-and-clone-identity
- req-013: Worktree disappearance or staleness must be detectable and visible to operators.
  Acceptance: Detaching or deleting one worktree does not corrupt other worktrees for the same repository.; Runtime-local records remain attributable to the correct clone after another clone of the same repository is attached.; Stale worktree attachments can be detected without erasing their canonical parent repository.; Two clones of the same remote on the same branch never collapse to the same worktree identity unless they are truly the same attached worktree.
  Capabilities: worktree-and-clone-identity
- req-014: Worktree identity must distinguish separate clones and separate worktrees of the same repository even when branch names and directory basenames match.
  Acceptance: Detaching or deleting one worktree does not corrupt other worktrees for the same repository.; Runtime-local records remain attributable to the correct clone after another clone of the same repository is attached.; Stale worktree attachments can be detected without erasing their canonical parent repository.; Two clones of the same remote on the same branch never collapse to the same worktree identity unless they are truly the same attached worktree.
  Capabilities: worktree-and-clone-identity
- req-015: Worktree records must be attachable and detachable independently of canonical repository identity.
  Acceptance: Detaching or deleting one worktree does not corrupt other worktrees for the same repository.; Runtime-local records remain attributable to the correct clone after another clone of the same repository is attached.; Stale worktree attachments can be detected without erasing their canonical parent repository.; Two clones of the same remote on the same branch never collapse to the same worktree identity unless they are truly the same attached worktree.
  Capabilities: worktree-and-clone-identity
- req-016: Canonical refs must remain stable across machines and not depend on absolute filesystem paths.
  Acceptance: A read or write request that is ambiguous at the current scope returns a truthful disambiguation path instead of picking a repository silently.; Machine-readable results always include enough repository qualification for safe follow-up operations.; Repository-qualified refs survive movement between machines or parent directories because they are not absolute-path-based.; Two tickets with similar human meaning in different repositories can both be discovered and acted upon without caller confusion.
  Capabilities: repository-qualified-addressing
- req-017: Human-friendly short refs may resolve within the active scope only when unambiguous; otherwise repository-qualified or space-qualified refs must be required or emitted.
  Acceptance: A read or write request that is ambiguous at the current scope returns a truthful disambiguation path instead of picking a repository silently.; Machine-readable results always include enough repository qualification for safe follow-up operations.; Repository-qualified refs survive movement between machines or parent directories because they are not absolute-path-based.; Two tickets with similar human meaning in different repositories can both be discovered and acted upon without caller confusion.
  Capabilities: repository-qualified-addressing
- req-018: Path-bearing references must be repository-qualified whenever more than one repository is in play.
  Acceptance: A read or write request that is ambiguous at the current scope returns a truthful disambiguation path instead of picking a repository silently.; Machine-readable results always include enough repository qualification for safe follow-up operations.; Repository-qualified refs survive movement between machines or parent directories because they are not absolute-path-based.; Two tickets with similar human meaning in different repositories can both be discovered and acted upon without caller confusion.
  Capabilities: repository-qualified-addressing
- req-019: Rendered packets, dashboards, and error messages must surface repository qualification wherever omission could mislead the caller.
  Acceptance: A read or write request that is ambiguous at the current scope returns a truthful disambiguation path instead of picking a repository silently.; Machine-readable results always include enough repository qualification for safe follow-up operations.; Repository-qualified refs survive movement between machines or parent directories because they are not absolute-path-based.; Two tickets with similar human meaning in different repositories can both be discovered and acted upon without caller confusion.
  Capabilities: repository-qualified-addressing
- req-020: Tool, slash-command, and headless APIs must accept enough scope information to distinguish space scope from repository scope and repository scope from worktree scope.
  Acceptance: A read or write request that is ambiguous at the current scope returns a truthful disambiguation path instead of picking a repository silently.; Machine-readable results always include enough repository qualification for safe follow-up operations.; Repository-qualified refs survive movement between machines or parent directories because they are not absolute-path-based.; Two tickets with similar human meaning in different repositories can both be discovered and acted upon without caller confusion.
  Capabilities: repository-qualified-addressing
- req-021: Canonical entities remain space-scoped, and repository attribution remains explicit wherever authorship or execution locality matters.
  Acceptance: A plan can link tickets from multiple repositories and still render a truthful, repository-qualified execution view.; A ticket in one repository can reference research or a spec whose canonical meaning spans the whole space.; Graph validation reports unresolved repository-specific targets explicitly instead of hiding them.; No graph operation requires reading repo-local markdown files to re-discover canonical relationships already present in storage.
  Capabilities: cross-repository-entity-graph
- req-022: Cross-repository links between entities in the same space must resolve without filesystem heuristics.
  Acceptance: A plan can link tickets from multiple repositories and still render a truthful, repository-qualified execution view.; A ticket in one repository can reference research or a spec whose canonical meaning spans the whole space.; Graph validation reports unresolved repository-specific targets explicitly instead of hiding them.; No graph operation requires reading repo-local markdown files to re-discover canonical relationships already present in storage.
  Capabilities: cross-repository-entity-graph
- req-023: Cross-repository plans, initiatives, specs, tickets, critiques, and docs must remain readable as one system narrative without losing repository provenance.
  Acceptance: A plan can link tickets from multiple repositories and still render a truthful, repository-qualified execution view.; A ticket in one repository can reference research or a spec whose canonical meaning spans the whole space.; Graph validation reports unresolved repository-specific targets explicitly instead of hiding them.; No graph operation requires reading repo-local markdown files to re-discover canonical relationships already present in storage.
  Capabilities: cross-repository-entity-graph
- req-024: Graph queries, dashboards, and packet generation must preserve both the shared system context and the repository locality of linked records.
  Acceptance: A plan can link tickets from multiple repositories and still render a truthful, repository-qualified execution view.; A ticket in one repository can reference research or a spec whose canonical meaning spans the whole space.; Graph validation reports unresolved repository-specific targets explicitly instead of hiding them.; No graph operation requires reading repo-local markdown files to re-discover canonical relationships already present in storage.
  Capabilities: cross-repository-entity-graph
- req-025: Link validation must reject missing or out-of-space targets rather than degrading into soft guesses unless the link is explicitly optional by contract.
  Acceptance: A plan can link tickets from multiple repositories and still render a truthful, repository-qualified execution view.; A ticket in one repository can reference research or a spec whose canonical meaning spans the whole space.; Graph validation reports unresolved repository-specific targets explicitly instead of hiding them.; No graph operation requires reading repo-local markdown files to re-discover canonical relationships already present in storage.
  Capabilities: cross-repository-entity-graph
- req-026: Repository-sensitive operations must either inherit an explicit active repository or require one before execution.
  Acceptance: A parent-directory session can list repositories, plans, tickets, specs, and other entities across the active space without pretending that cwd itself is a repository.; Leaving repository scope returns the session to a truthful space-scoped mode.; Selecting a repository in a parent-directory session narrows subsequent repo-sensitive operations without hiding the underlying space.; The UI and headless responses clearly communicate whether the caller is operating at space or repository scope.
  Capabilities: parent-directory-session-behavior
- req-027: Session switching, nested sessions, and persisted selections must preserve or intentionally change scope in a way the operator can understand.
  Acceptance: A parent-directory session can list repositories, plans, tickets, specs, and other entities across the active space without pretending that cwd itself is a repository.; Leaving repository scope returns the session to a truthful space-scoped mode.; Selecting a repository in a parent-directory session narrows subsequent repo-sensitive operations without hiding the underlying space.; The UI and headless responses clearly communicate whether the caller is operating at space or repository scope.
  Capabilities: parent-directory-session-behavior
- req-028: Space-level operations such as discovery, list, search, dashboards, and cross-repository reads must work without forcing one active repository when none is needed.
  Acceptance: A parent-directory session can list repositories, plans, tickets, specs, and other entities across the active space without pretending that cwd itself is a repository.; Leaving repository scope returns the session to a truthful space-scoped mode.; Selecting a repository in a parent-directory session narrows subsequent repo-sensitive operations without hiding the underlying space.; The UI and headless responses clearly communicate whether the caller is operating at space or repository scope.
  Capabilities: parent-directory-session-behavior
- req-029: Starting Pi from a parent directory above several repositories must initialize a space-level session when a valid space is discoverable or selected.
  Acceptance: A parent-directory session can list repositories, plans, tickets, specs, and other entities across the active space without pretending that cwd itself is a repository.; Leaving repository scope returns the session to a truthful space-scoped mode.; Selecting a repository in a parent-directory session narrows subsequent repo-sensitive operations without hiding the underlying space.; The UI and headless responses clearly communicate whether the caller is operating at space or repository scope.
  Capabilities: parent-directory-session-behavior
- req-030: The session must make the current scope visible and distinguish active space, active repository, and active worktree where applicable.
  Acceptance: A parent-directory session can list repositories, plans, tickets, specs, and other entities across the active space without pretending that cwd itself is a repository.; Leaving repository scope returns the session to a truthful space-scoped mode.; Selecting a repository in a parent-directory session narrows subsequent repo-sensitive operations without hiding the underlying space.; The UI and headless responses clearly communicate whether the caller is operating at space or repository scope.
  Capabilities: parent-directory-session-behavior
- req-031: Every runtime launch must carry explicit repository scope and, when relevant, explicit worktree scope from the initiating action to the executing subprocess or nested session.
  Acceptance: A critique or docs subprocess launched from a parent-directory space session executes against the intended repository rather than whichever cwd happened to spawn it.; A runtime helper cannot execute a repo-sensitive action without explicit repository scope when ambiguity exists.; Ralph nested launches preserve repository/worktree targeting even when started from a space-level parent session.; Runtime logs and artifacts identify the repository/worktree they executed against.
  Capabilities: runtime-propagation-and-routing
- req-032: Ralph, critique, docs, and any fresh-process helper must share one authoritative scope propagation contract rather than each inventing their own cwd assumptions.
  Acceptance: A critique or docs subprocess launched from a parent-directory space session executes against the intended repository rather than whichever cwd happened to spawn it.; A runtime helper cannot execute a repo-sensitive action without explicit repository scope when ambiguity exists.; Ralph nested launches preserve repository/worktree targeting even when started from a space-level parent session.; Runtime logs and artifacts identify the repository/worktree they executed against.
  Capabilities: runtime-propagation-and-routing
- req-033: Runtime helpers must never drop a parent session from multi-repo scope down to a single cwd-only identity without an explicit scope decision.
  Acceptance: A critique or docs subprocess launched from a parent-directory space session executes against the intended repository rather than whichever cwd happened to spawn it.; A runtime helper cannot execute a repo-sensitive action without explicit repository scope when ambiguity exists.; Ralph nested launches preserve repository/worktree targeting even when started from a space-level parent session.; Runtime logs and artifacts identify the repository/worktree they executed against.
  Capabilities: runtime-propagation-and-routing
- req-034: Runtime orchestration may be serialized or parallelized by policy, but queueing behavior must not erase per-repository identity or produce cross-repository drift.
  Acceptance: A critique or docs subprocess launched from a parent-directory space session executes against the intended repository rather than whichever cwd happened to spawn it.; A runtime helper cannot execute a repo-sensitive action without explicit repository scope when ambiguity exists.; Ralph nested launches preserve repository/worktree targeting even when started from a space-level parent session.; Runtime logs and artifacts identify the repository/worktree they executed against.
  Capabilities: runtime-propagation-and-routing
- req-035: Session managers, resource loaders, verifier hooks, and subprocess wrappers must expose enough scope metadata to target the intended repository safely.
  Acceptance: A critique or docs subprocess launched from a parent-directory space session executes against the intended repository rather than whichever cwd happened to spawn it.; A runtime helper cannot execute a repo-sensitive action without explicit repository scope when ambiguity exists.; Ralph nested launches preserve repository/worktree targeting even when started from a space-level parent session.; Runtime logs and artifacts identify the repository/worktree they executed against.
  Capabilities: runtime-propagation-and-routing
- req-036: Attachments, checkpoints, artifacts, plan scope paths, and similar path-bearing fields must preserve repository qualification whenever omission would be ambiguous.
  Acceptance: Ambiguous bare paths fail with a disambiguation message instead of proceeding against the wrong repository.; Attaching a file from `service-a` in a parent-directory session cannot accidentally resolve to a similarly named file in `service-b`.; Moving the parent directory on disk does not corrupt canonical path-bearing records because absolute paths are not the durable identifier.; Repository-qualified scope paths remain readable to humans and actionable to tools.
  Capabilities: path-bearing-operation-safety
- req-037: Path normalization must never rewrite distinct repositories into one flattened namespace.
  Acceptance: Ambiguous bare paths fail with a disambiguation message instead of proceeding against the wrong repository.; Attaching a file from `service-a` in a parent-directory session cannot accidentally resolve to a similarly named file in `service-b`.; Moving the parent directory on disk does not corrupt canonical path-bearing records because absolute paths are not the durable identifier.; Repository-qualified scope paths remain readable to humans and actionable to tools.
  Capabilities: path-bearing-operation-safety
- req-038: Relative paths must be interpreted only relative to an explicit repository or worktree scope.
  Acceptance: Ambiguous bare paths fail with a disambiguation message instead of proceeding against the wrong repository.; Attaching a file from `service-a` in a parent-directory session cannot accidentally resolve to a similarly named file in `service-b`.; Moving the parent directory on disk does not corrupt canonical path-bearing records because absolute paths are not the durable identifier.; Repository-qualified scope paths remain readable to humans and actionable to tools.
  Capabilities: path-bearing-operation-safety
- req-039: Rendered human review surfaces may show compact repo-relative paths, but machine-readable records must preserve enough structure to recover repository scope.
  Acceptance: Ambiguous bare paths fail with a disambiguation message instead of proceeding against the wrong repository.; Attaching a file from `service-a` in a parent-directory session cannot accidentally resolve to a similarly named file in `service-b`.; Moving the parent directory on disk does not corrupt canonical path-bearing records because absolute paths are not the durable identifier.; Repository-qualified scope paths remain readable to humans and actionable to tools.
  Capabilities: path-bearing-operation-safety
- req-040: When multiple repositories are active in a space, bare relative paths without repository qualification must be rejected for repo-sensitive operations unless there is one unambiguous active repository.
  Acceptance: Ambiguous bare paths fail with a disambiguation message instead of proceeding against the wrong repository.; Attaching a file from `service-a` in a parent-directory session cannot accidentally resolve to a similarly named file in `service-b`.; Moving the parent directory on disk does not corrupt canonical path-bearing records because absolute paths are not the durable identifier.; Repository-qualified scope paths remain readable to humans and actionable to tools.
  Capabilities: path-bearing-operation-safety
- req-041: Dashboards and summaries must surface repository distribution so callers can understand whether work is space-wide or concentrated in one repository.
  Acceptance: A caller can intentionally narrow to one repository without scanning irrelevant repositories in follow-up operations.; A user can rediscover a spec, plan, or ticket without already knowing which repository owns it.; Result payloads remain compact enough for practical AI use while still being repository-safe.; Space-level dashboards make cross-repository concentration and gaps obvious.
  Capabilities: discovery-search-and-dashboard-ergonomics
- req-042: Default result ordering must remain useful for large spaces and must not require callers to know repository ids in advance.
  Acceptance: A caller can intentionally narrow to one repository without scanning irrelevant repositories in follow-up operations.; A user can rediscover a spec, plan, or ticket without already knowing which repository owns it.; Result payloads remain compact enough for practical AI use while still being repository-safe.; Space-level dashboards make cross-repository concentration and gaps obvious.
  Capabilities: discovery-search-and-dashboard-ergonomics
- req-043: Machine-readable result payloads must include repository qualification and enough metadata for safe follow-up calls.
  Acceptance: A caller can intentionally narrow to one repository without scanning irrelevant repositories in follow-up operations.; A user can rediscover a spec, plan, or ticket without already knowing which repository owns it.; Result payloads remain compact enough for practical AI use while still being repository-safe.; Space-level dashboards make cross-repository concentration and gaps obvious.
  Capabilities: discovery-search-and-dashboard-ergonomics
- req-044: Repository filters must be optional for broad discovery and precise when callers intentionally need one repository slice.
  Acceptance: A caller can intentionally narrow to one repository without scanning irrelevant repositories in follow-up operations.; A user can rediscover a spec, plan, or ticket without already knowing which repository owns it.; Result payloads remain compact enough for practical AI use while still being repository-safe.; Space-level dashboards make cross-repository concentration and gaps obvious.
  Capabilities: discovery-search-and-dashboard-ergonomics
- req-045: Search and list surfaces must support broad-first queries across the active space and intentional narrowing by repository, entity kind, status, and text.
  Acceptance: A caller can intentionally narrow to one repository without scanning irrelevant repositories in follow-up operations.; A user can rediscover a spec, plan, or ticket without already knowing which repository owns it.; Result payloads remain compact enough for practical AI use while still being repository-safe.; Space-level dashboards make cross-repository concentration and gaps obvious.
  Capabilities: discovery-search-and-dashboard-ergonomics
- req-046: A full-space export must include all enrolled repositories, all relevant worktrees, canonical entities, links, events, and policy-permitted runtime attachments for that space.
  Acceptance: A repository-scoped export cannot be mistaken for a complete space backup because the artifact and metadata say it is partial.; A space-level restore recreates the multi-repository graph truthfully enough that linked plans, tickets, and specs remain intact.; Conflict messages identify the repository/worktree scope involved when relevant.; Importing a bundle into another machine does not rebind records to whichever cwd the import command ran from.
  Capabilities: export-import-and-backup-truthfulness
- req-047: Backup and restore documentation and tooling must state whether they operate at space scope or a narrower explicit scope.
  Acceptance: A repository-scoped export cannot be mistaken for a complete space backup because the artifact and metadata say it is partial.; A space-level restore recreates the multi-repository graph truthfully enough that linked plans, tickets, and specs remain intact.; Conflict messages identify the repository/worktree scope involved when relevant.; Importing a bundle into another machine does not rebind records to whichever cwd the import command ran from.
  Capabilities: export-import-and-backup-truthfulness
- req-048: Conflict detection must be repository-safe and must never resolve ambiguity by overwriting a different repository's state.
  Acceptance: A repository-scoped export cannot be mistaken for a complete space backup because the artifact and metadata say it is partial.; A space-level restore recreates the multi-repository graph truthfully enough that linked plans, tickets, and specs remain intact.; Conflict messages identify the repository/worktree scope involved when relevant.; Importing a bundle into another machine does not rebind records to whichever cwd the import command ran from.
  Capabilities: export-import-and-backup-truthfulness
- req-049: Import and hydration must preserve repository identity, repository membership, worktree attachments, links, and event history without collapsing them to the importing cwd.
  Acceptance: A repository-scoped export cannot be mistaken for a complete space backup because the artifact and metadata say it is partial.; A space-level restore recreates the multi-repository graph truthfully enough that linked plans, tickets, and specs remain intact.; Conflict messages identify the repository/worktree scope involved when relevant.; Importing a bundle into another machine does not rebind records to whichever cwd the import command ran from.
  Capabilities: export-import-and-backup-truthfulness
- req-050: Repository-scoped or worktree-scoped exports are allowed only when explicitly requested and must be labeled as partial snapshots.
  Acceptance: A repository-scoped export cannot be mistaken for a complete space backup because the artifact and metadata say it is partial.; A space-level restore recreates the multi-repository graph truthfully enough that linked plans, tickets, and specs remain intact.; Conflict messages identify the repository/worktree scope involved when relevant.; Importing a bundle into another machine does not rebind records to whichever cwd the import command ran from.
  Capabilities: export-import-and-backup-truthfulness
- req-051: Any temporary compatibility surface must degrade toward one canonical representation rather than preserving parallel truths indefinitely.
  Acceptance: A repository already using Loom can join a multi-repository space without losing its existing canonical history.; Cutover does not rely on hidden shims forever; the canonical steady state is one explicit multi-repo-aware model.; Legacy cwd-derived identities that would become wrong in parent-directory mode are surfaced and corrected rather than silently perpetuated.; Single-repository users do not need to understand the entire multi-repo model to continue normal work, but the system still stores truthful canonical identity.
  Capabilities: migration-and-compatibility-behavior
- req-052: Legacy single-repository sessions must continue to work as the unambiguous special case of the new model.
  Acceptance: A repository already using Loom can join a multi-repository space without losing its existing canonical history.; Cutover does not rely on hidden shims forever; the canonical steady state is one explicit multi-repo-aware model.; Legacy cwd-derived identities that would become wrong in parent-directory mode are surfaced and corrected rather than silently perpetuated.; Single-repository users do not need to understand the entire multi-repo model to continue normal work, but the system still stores truthful canonical identity.
  Capabilities: migration-and-compatibility-behavior
- req-053: Persisted records created before cutover must remain readable and migratable without inventing incorrect repository identity.
  Acceptance: A repository already using Loom can join a multi-repository space without losing its existing canonical history.; Cutover does not rely on hidden shims forever; the canonical steady state is one explicit multi-repo-aware model.; Legacy cwd-derived identities that would become wrong in parent-directory mode are surfaced and corrected rather than silently perpetuated.; Single-repository users do not need to understand the entire multi-repo model to continue normal work, but the system still stores truthful canonical identity.
  Capabilities: migration-and-compatibility-behavior
- req-054: The system must define a deterministic migration path from single-repository cwd-derived behavior to explicit space/repository/worktree semantics.
  Acceptance: A repository already using Loom can join a multi-repository space without losing its existing canonical history.; Cutover does not rely on hidden shims forever; the canonical steady state is one explicit multi-repo-aware model.; Legacy cwd-derived identities that would become wrong in parent-directory mode are surfaced and corrected rather than silently perpetuated.; Single-repository users do not need to understand the entire multi-repo model to continue normal work, but the system still stores truthful canonical identity.
  Capabilities: migration-and-compatibility-behavior
- req-055: User-visible messaging and diagnostics must explain when legacy assumptions were upgraded, ignored, or rejected.
  Acceptance: A repository already using Loom can join a multi-repository space without losing its existing canonical history.; Cutover does not rely on hidden shims forever; the canonical steady state is one explicit multi-repo-aware model.; Legacy cwd-derived identities that would become wrong in parent-directory mode are surfaced and corrected rather than silently perpetuated.; Single-repository users do not need to understand the entire multi-repo model to continue normal work, but the system still stores truthful canonical identity.
  Capabilities: migration-and-compatibility-behavior
- req-056: A canonical repository may belong to only one space at a time unless an explicit future federation feature says otherwise.
  Acceptance: A repository cannot be accidentally enrolled into two spaces because two parent directories happen to contain clones of it.; A tool call targeting a record from another space fails clearly instead of acting on a same-looking display id in the current space.; Dangerous membership changes surface the affected records and required remediation.; Parent-directory ambiguity cannot produce wrong-space writes.
  Capabilities: space-isolation-and-safety
- req-057: Cross-space links, reads, or mutations must be rejected or made explicitly federated; they must never happen by accident through cwd overlap.
  Acceptance: A repository cannot be accidentally enrolled into two spaces because two parent directories happen to contain clones of it.; A tool call targeting a record from another space fails clearly instead of acting on a same-looking display id in the current space.; Dangerous membership changes surface the affected records and required remediation.; Parent-directory ambiguity cannot produce wrong-space writes.
  Capabilities: space-isolation-and-safety
- req-058: Membership changes that would orphan repository-owned records or break repository qualification must surface their impact before commit.
  Acceptance: A repository cannot be accidentally enrolled into two spaces because two parent directories happen to contain clones of it.; A tool call targeting a record from another space fails clearly instead of acting on a same-looking display id in the current space.; Dangerous membership changes surface the affected records and required remediation.; Parent-directory ambiguity cannot produce wrong-space writes.
  Capabilities: space-isolation-and-safety
- req-059: Repository-sensitive actions from a parent-directory session must remain impossible until active scope is truthful.
  Acceptance: A repository cannot be accidentally enrolled into two spaces because two parent directories happen to contain clones of it.; A tool call targeting a record from another space fails clearly instead of acting on a same-looking display id in the current space.; Dangerous membership changes surface the affected records and required remediation.; Parent-directory ambiguity cannot produce wrong-space writes.
  Capabilities: space-isolation-and-safety
- req-060: Safety checks must prioritize preventing wrong-space or wrong-repository writes over preserving convenience.
  Acceptance: A repository cannot be accidentally enrolled into two spaces because two parent directories happen to contain clones of it.; A tool call targeting a record from another space fails clearly instead of acting on a same-looking display id in the current space.; Dangerous membership changes surface the affected records and required remediation.; Parent-directory ambiguity cannot produce wrong-space writes.
  Capabilities: space-isolation-and-safety
- req-061: Automated verification must cover discovery, enrollment, addressing, runtime propagation, path safety, export/import truthfulness, migration, and degraded modes across multiple repositories.
  Acceptance: A failing runtime or tool call reveals which repository/worktree it targeted and why.; An operator can always inspect why the session selected a given space or repository.; Audit trails remain sufficient for a later reviewer to reconstruct repository targeting decisions.; Test coverage includes a parent directory above multiple repositories and catches ambiguous-path, wrong-repository, and partial-export regressions.
  Capabilities: diagnostics-observability-and-verification
- req-062: Errors and warnings must identify the exact missing or conflicting scope rather than reporting generic cwd failures.
  Acceptance: A failing runtime or tool call reveals which repository/worktree it targeted and why.; An operator can always inspect why the session selected a given space or repository.; Audit trails remain sufficient for a later reviewer to reconstruct repository targeting decisions.; Test coverage includes a parent directory above multiple repositories and catches ambiguous-path, wrong-repository, and partial-export regressions.
  Capabilities: diagnostics-observability-and-verification
- req-063: Observability artifacts such as logs, dashboards, and runtime records must retain repository/worktree attribution for auditability.
  Acceptance: A failing runtime or tool call reveals which repository/worktree it targeted and why.; An operator can always inspect why the session selected a given space or repository.; Audit trails remain sufficient for a later reviewer to reconstruct repository targeting decisions.; Test coverage includes a parent directory above multiple repositories and catches ambiguous-path, wrong-repository, and partial-export regressions.
  Capabilities: diagnostics-observability-and-verification
- req-064: Production-ready status requires regression tests that fail if the system reintroduces synthetic parent-directory repository identities or wrong-repository execution.
  Acceptance: A failing runtime or tool call reveals which repository/worktree it targeted and why.; An operator can always inspect why the session selected a given space or repository.; Audit trails remain sufficient for a later reviewer to reconstruct repository targeting decisions.; Test coverage includes a parent directory above multiple repositories and catches ambiguous-path, wrong-repository, and partial-export regressions.
  Capabilities: diagnostics-observability-and-verification
- req-065: The system must expose operator-visible diagnostics for active space, active repository, active worktree, discovery source, persisted binding source, and ambiguity state.
  Acceptance: A failing runtime or tool call reveals which repository/worktree it targeted and why.; An operator can always inspect why the session selected a given space or repository.; Audit trails remain sufficient for a later reviewer to reconstruct repository targeting decisions.; Test coverage includes a parent directory above multiple repositories and catches ambiguous-path, wrong-repository, and partial-export regressions.
  Capabilities: diagnostics-observability-and-verification
- req-066: Recovery guidance must tell the operator whether to reattach a repository, select another worktree, or narrow the requested scope.
  Acceptance: A space dashboard still shows cross-repository work even when one repository is not checked out on the current machine.; Canonical plans and specs remain readable even when some linked repositories are unavailable locally.; Recovery instructions are actionable and repository-specific.; Trying to attach a file or run a verifier for an unavailable repository fails clearly and explains the missing local prerequisite.
  Capabilities: degraded-mode-and-unavailable-repository-behavior
- req-067: Repository-sensitive operations must fail or pause truthfully when the required repository or worktree is unavailable.
  Acceptance: A space dashboard still shows cross-repository work even when one repository is not checked out on the current machine.; Canonical plans and specs remain readable even when some linked repositories are unavailable locally.; Recovery instructions are actionable and repository-specific.; Trying to attach a file or run a verifier for an unavailable repository fails clearly and explains the missing local prerequisite.
  Capabilities: degraded-mode-and-unavailable-repository-behavior
- req-068: Space-level canonical reads, dashboards, and planning views must continue to work even when one or more enrolled repositories are locally unavailable.
  Acceptance: A space dashboard still shows cross-repository work even when one repository is not checked out on the current machine.; Canonical plans and specs remain readable even when some linked repositories are unavailable locally.; Recovery instructions are actionable and repository-specific.; Trying to attach a file or run a verifier for an unavailable repository fails clearly and explains the missing local prerequisite.
  Capabilities: degraded-mode-and-unavailable-repository-behavior
- req-069: The system must distinguish canonical absence from local unavailability so callers do not mistake a missing clone for a missing repository record.
  Acceptance: A space dashboard still shows cross-repository work even when one repository is not checked out on the current machine.; Canonical plans and specs remain readable even when some linked repositories are unavailable locally.; Recovery instructions are actionable and repository-specific.; Trying to attach a file or run a verifier for an unavailable repository fails clearly and explains the missing local prerequisite.
  Capabilities: degraded-mode-and-unavailable-repository-behavior
- req-070: Unavailable repositories must remain visible in summaries and diagnostics so gaps are obvious.
  Acceptance: A space dashboard still shows cross-repository work even when one repository is not checked out on the current machine.; Canonical plans and specs remain readable even when some linked repositories are unavailable locally.; Recovery instructions are actionable and repository-specific.; Trying to attach a file or run a verifier for an unavailable repository fails clearly and explains the missing local prerequisite.
  Capabilities: degraded-mode-and-unavailable-repository-behavior
