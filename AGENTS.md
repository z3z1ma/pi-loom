# Repository Guidelines

## Project Overview

`pi-loom` is a single TypeScript package that implements Loom's durable memory and execution layers: `constitution/`, `research/`, `initiatives/`, `specs/`, `plans/`, `ticketing/`, `critique/`, `ralph/`, `docs/`, plus shared storage in `storage/`.

The important architectural rule is that canonical state lives in SQLite via `storage/`. Repo-visible `.loom/` files are derived review/projection surfaces, not the source of truth.

The root `package.json` is also the integration point: it loads the Pi extension entrypoints through `pi.extensions` (`bidi/`, `constitution/`, `research/`, `initiatives/`, `specs/`, `plans/`, `ticketing/`, `critique/`, `ralph/`, `docs/`).

## Architecture & Data Flow

### Layer stack

The high-level stack in `README.md` is:

1. constitutional memory
2. research
3. initiatives
4. specs
5. plans
6. tickets
7. Ralph orchestration
8. critique
9. docs

### Collaborative preparation vs bounded agent execution

Pi Loom is designed around a deliberate split between two kinds of work:

- collaborative preparation layers — `constitution/`, `research/`, `initiatives/`, `specs/`, `plans/`, and ticket authoring in `ticketing/`
- bounded execution/review layers — Ralph runs, critiques, and docs updates operating from curated packets against a specific execution target

The preparation side is still usually authored with AI help, but this is where humans stay actively in the loop through conversation and the TUI: dialing in durable project rules, doing research, defining strategic initiatives, writing declarative specs, shaping execution strategy, and deciding the ticket units that are actually worth running.

The execution side should stay tightly bounded. Ralph is not meant to be a forever-chat copilot with drifting context. It is a fresh, packetized execution loop that starts with carefully curated context and aims at one logical unit of work, usually one ticket under one governing plan. Critique and docs updates follow the same philosophy: start from a compact, deliberate packet, do one job, land durable state, stop, then reassess.

Why this matters:

- fresh packets preserve the original strategic context instead of letting repeated compactions erode it
- one run per logical unit avoids cross-ticket contamination from stale transcript history
- humans can reassess between runs instead of trying to steer many units through one long conversation
- if a run misses, improve the upstream context (research, spec, plan, ticket, docs) and rerun instead of piling contradictory steering into the same session

### Repeated package pattern

Most top-level Loom layers follow the same shape:

- `index.ts` — Pi extension entrypoint; registers tools/commands, initializes its ledger on `session_start`, and extends the system prompt on `before_agent_start`
- `commands/` — when present, human-facing slash command handlers
- `domain/` — canonical models, store logic, rendering/projection helpers
- `tools/` — machine-facing tool registration
- `prompts/` — guidance text injected into the agent system prompt
- `README.md` — package-specific contract and workflow notes
- `__tests__/` — per-package unit/integration coverage

Representative files:

- `constitution/index.ts`
- `research/index.ts`
- `plans/index.ts`
- `docs/index.ts`
- `storage/contract.ts`
- `storage/workspace.ts`
- `storage/sqlite.ts`
- `storage/projections.ts`

### Storage and projection flow

Typical flow is:

1. tool or command handler receives input
2. layer store in `<layer>/domain/store.ts` validates and normalizes it
3. shared storage helpers in `storage/` read/write canonical SQLite state
4. optional packets, overviews, plans, docs, or `.loom/...` projections are rendered from canonical state

Do not treat markdown outputs as authoritative state unless the code explicitly says they are reconcile targets.

Projection rules worth preserving:

- supported projection families today are `constitution`, `research`, `initiatives`, `specs`, `plans`, `docs`, and `tickets`
- critique and Ralph remain canonical-only layers; they produce packets, runs, and review artifacts but do not project into `.loom/`
- packets are fresh-process handoff artifacts, not reconcile targets
- the human sync surface lives in `bidi/` as `/loom-status`, `/loom-export`, `/loom-refresh`, and `/loom-reconcile`; the AI surface is `projection_status` / `projection_write`

Packets matter architecturally. They are the curated context windows that let Ralph, critique, and docs update work from stable intent instead of from a long, drifting transcript.

### Scope model

This repo is multi-repository aware. Do not assume the current working directory uniquely identifies the active repository.

Relevant files:

- `README.md`
- `storage/workspace.ts`
- `storage/scope.ts`
- `storage/runtime-scope.ts`

Important rules:

- repository/worktree selection can be explicit
- repository-bound operations may require `repositoryId` / `worktreeId`
- path-bearing references may need repository-qualified paths in ambiguous sessions
- ambiguity should fail closed, not silently guess

## Key Directories

- `constitution/` — durable project vision, principles, constraints, roadmap, decisions
- `research/` — exploratory evidence and reusable findings
- `initiatives/` — strategic outcome tracking across specs/tickets
- `specs/` — declarative behavior contracts
- `plans/` — execution strategy bridging specs/initiatives to tickets
- `ticketing/` — live execution ledger, workbench commands, attachments/checkpoints
- `critique/` — adversarial review records, findings, verdicts
- `ralph/` — bounded managed execution/review loops tied to tickets/plans
- `docs/` — durable high-level documentation records and governed docs workflows
- `storage/` — SQLite backend, schema/contracts, scope resolution, projections, sync; shared implementation, not a Pi extension entrypoint
- `.loom/` — derived workspace projections and review surfaces; not canonical storage
- `bidi/` — bidirectional sync surface between repo-visible Markdown projections and canonical storage; owns `/loom-*` commands plus projection tools

There is no repo-root `scripts/` directory. Operational flows live in npm scripts, package command handlers, and tool modules such as `docs/tools/docs.ts` or `ticketing/commands/ticket.ts`.

## Important Files

- `README.md` — best single overview of the stack, projections, scope model, and development workflow
- `CONSTITUTION.md` — durable project direction and cross-layer design intent
- `package.json` — authoritative commands, extension entrypoints, package/runtime metadata
- `tsconfig.json` — strict TypeScript, `module: Node16`, `target: ES2022`, `noEmit`
- `biome.json` — formatting/linting defaults
- `vitest.config.ts` — default test lane
- `vitest.integration.config.ts` — curated integration lane for heavier cross-package flows
- `storage/README.md` — canonical storage contract and multi-repo/storage invariants
- `storage/contract.ts` — canonical storage interfaces and entity types
- `storage/sqlite.ts` — SQLite backend and schema/migration logic
- `storage/projections.ts` — `.loom` projection rules and family definitions
- `plans/README.md`, `ticketing/README.md`, `docs/README.md`, `ralph/README.md` — layer-specific contracts worth reading before large changes

## Development Commands

Use npm. This repo is not set up around Bun.

```bash
npm install
npm run test                # default fast lane
npm run test:integration    # heavier SQLite/workspace flows
npm run typecheck
npm run lint
npm run lint:fix
npm run check               # lint + typecheck
npm run check:ci            # CI-style check
omp -e .                    # load Pi Loom locally
```

Practical guidance:

- Start with targeted tests for the package you touched when possible.
- `npm run test` is the default verification lane.
- Use `npm run test:integration` when changes affect storage, scope resolution, projections, worktrees, runtime launches, or other cross-layer flows.

## Runtime / Tooling Preferences

- Package manager: `npm`
- Runtime/module system: Node + ESM (`"type": "module"`)
- TypeScript: strict, `Node16` module resolution, `ES2022` target, `noEmit`
- Formatter/linter: Biome
- Database: SQLite via `better-sqlite3`
- Local entrypoint: `omp -e .`

There is no build output step in normal development. `npm run typecheck` validates types only; it does not emit artifacts.

Formatting defaults from `biome.json`:

- 2-space indentation
- 120-column line width

Internal imports use the `#...` alias map from `package.json`, for example:

```ts
import { findEntityByDisplayId } from "#storage/entities.js";
import { createConstitutionalStore } from "#constitution/domain/store.js";
```

## Code Conventions & Common Patterns

### Preserve the existing package layout

If you add behavior to a Loom layer, prefer the established structure instead of inventing a parallel one:

- extension wiring in `index.ts`
- persistence and domain logic in `domain/`
- tool registration in `tools/`
- prompt text in `prompts/`
- tests in `__tests__/`

### Canonical state vs derived artifacts

Keep the boundary honest:

- SQLite-backed stores are canonical
- `.loom/` projections are derived review surfaces
- packets, overviews, and rendered docs/plans are outputs, not alternate stores

If a change appears to require updating both SQLite-backed truth and a checked-in projection manually, verify whether the projection should instead be regenerated.

### Scope-sensitive code should fail closed

When touching workspace/repository-bound logic:

- prefer explicit repository/worktree identity over cwd inference
- preserve repository-qualified path handling in ambiguous multi-repo sessions
- do not add "best guess" fallbacks that hide scope mistakes

### Follow existing layer contracts

Each layer has a distinct role. Preserve those boundaries:

- constitution stores durable project policy and roadmap intent
- research stores discovery, evidence, hypotheses, and artifacts
- initiatives store strategic outcomes and milestones
- specs describe intended behavior
- plans describe execution strategy
- tickets carry live execution state and define the unit of bounded execution Ralph should work against
- critique stores review findings
- docs explain accepted system reality

Treat finalized specs and durable critique/docs records as governed history, not scratch space for ad hoc execution notes.

Ralph, critique, and docs update should be treated as packetized fresh-context runs, not as places to compensate for weak upstream artifacts. When execution quality is poor, fix the constitution/research/spec/plan/ticket inputs first.

Avoid moving responsibilities between layers just to simplify one local change.

## Testing & QA

Tests are organized per package under `__tests__/`:

- `docs/__tests__/`
- `plans/__tests__/`
- `ticketing/__tests__/`
- `storage/__tests__/`
- similar layouts exist across the other Loom layers

Common test patterns:

- temp workspaces and isolated `PI_LOOM_ROOT`
- seeded git fixtures via `storage/__tests__/helpers/git-fixture.ts`
- exact prompt/tool registration assertions
- runtime/worktree coverage in the integration lane
- backend-parity storage coverage against both in-memory and SQLite catalogs where the existing suite already does so

When adding tests:

- place them next to the layer you changed
- follow existing `*.test.ts` naming under that layer's `__tests__/`
- prefer real store/runtime flows for storage- or scope-heavy behavior
- update prompt-guidance or tool-contract tests when changing agent-facing text or tool schemas

`vitest.integration.config.ts` is a manual allowlist, not a glob. If you add an integration-style test, include it there or it will not run in `npm run test:integration`.

## Assistant Working Notes

Before changing a subsystem, read its local `README.md` and one representative `index.ts` + `domain/store.ts` pair. For cross-layer work, also read `README.md` and the relevant `storage/` files first.

Good first reads for most tasks:

- `README.md`
- `package.json`
- `storage/README.md`
- the target layer's `README.md`
- the target layer's `index.ts`
- the target layer's `domain/store.ts`

When projections are involved, use `projection_status` to confirm whether a family is clean/modified/missing/not exported before reconcile, and use `projection_write` for explicit export, refresh, or reconcile actions rather than assuming file edits autosync.

When reasoning about an agentic workflow problem, ask first whether it belongs on the preparation side or the execution side. If the run is under-specified, resist adding more in-run steering; improve the upstream research/spec/plan/ticket packet inputs and rerun in fresh context.

When documenting or reviewing docs behavior, distinguish carefully between:

- canonical docs records in `docs/`
- repo-visible projections in `.loom/docs/`
- historical projections under `.loom/docs/history/`
