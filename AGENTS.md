# Repository Guidelines

## Project Overview
- `pi-loom` is an npm workspace of ten Pi extensions that implement the Loom stack: constitutional memory, research, initiatives, specs, plans, tickets, workers, critique, Ralph orchestration, and docs.
- Runtime state is file-backed under `.loom/`; package source lives under `packages/pi-*`.
- The root `package.json` is the integration point: it declares npm workspaces and loads every extension through `pi.extensions`.
- Workflow guidance lives primarily in `README.md` plus `packages/*/README.md`; treat those as the first documentation stop before inferring behavior from checked-in `.loom` examples.

## Architecture & Data Flow
1. A slash command or tool call enters through a package entrypoint such as `packages/pi-ticketing/extensions/index.ts` or `packages/pi-specs/extensions/index.ts`.
2. `extensions/index.ts` registers the package command/tool surface, initializes its ledger on `session_start`, and appends package-specific prompt guidance on `before_agent_start`.
3. `extensions/commands/*.ts` handle human-facing slash commands; `extensions/tools/*.ts` expose AI-facing tool APIs.
4. `extensions/domain/*.ts` owns the file-backed model: `store.ts`, `models.ts`, `paths.ts`, `normalize.ts`, `render.ts`, plus package-specific helpers like `dashboard.ts`, `frontmatter.ts`, `projection.ts`, `graph.ts`, or `runtime.ts`.
5. Domain stores read and write canonical `.loom/<layer>/...` artifacts such as `state.json`, `packet.md`, `dashboard.json`, markdown summaries, and append-only JSONL sidecars.
6. Package entrypoints also export a `_test` object so command handlers, prompt builders, and stores can be exercised directly from Vitest.

### Layer boundaries
- Core execution flow: `constitution -> research -> initiatives -> specs -> plans -> tickets`, with `pi-workers` adding a bounded workspace-backed execution substrate alongside ticket execution rather than replacing the ticket ledger.
- `pi-workers` is the workspace-backed execution substrate; it complements tickets with durable worker state, messaging, checkpoints, approvals, and consolidation outcomes without replacing the ticket ledger.
- `pi-critique` is the durable review layer; it does not replace tickets or plans.
- `pi-ralph` orchestrates bounded plan/execute/review loops across the other layers; it is not a general workflow engine.
- `pi-docs` is the post-completion explanatory layer.
- `pi-plans` is the only naming exception: the slash command is `/workplan`, not `/plan`.
- Command and tool families are paired by layer: `/ticket` + `ticket_*`, `/worker` + `worker_*`, `/spec` + `spec_*`, `/workplan` + `plan_*`, `/critique` + `critique_*`, `/docs` + `docs_*`, `/ralph` + `ralph_*`.

## Key Directories
- `packages/` — all extension packages.
  - `packages/pi-constitution/` — `.loom/constitution/`
  - `packages/pi-research/` — `.loom/research/`
  - `packages/pi-initiatives/` — `.loom/initiatives/`
  - `packages/pi-specs/` — `.loom/specs/`
  - `packages/pi-plans/` — `.loom/plans/`
  - `packages/pi-ticketing/` — `.loom/tickets/`
  - `packages/pi-workers/` — `.loom/workers/`
  - `packages/pi-critique/` — `.loom/critiques/`
  - `packages/pi-ralph/` — `.loom/ralph/`
  - `packages/pi-docs/` — `.loom/docs/`
- `packages/*/extensions/` — package implementation code.
- `packages/*/__tests__/` — Vitest suites.
- `.loom/` — checked-in examples of the durable storage model and active workspace data.
- `.agents/resources/` — reference material; not primary runtime code.

There is no root `scripts/` directory and no conventional root `docs/` tree. Use `README.md`, package READMEs, and `.loom/docs/` instead of inventing those paths.

## Development Commands
Run from the repo root unless a package README says otherwise:

```bash
npm install
npm run lint
npm run lint:fix
npm run typecheck
npm run check
npm run check:ci
npm run test
```

Local package loading uses `omp`, for example:

```bash
cd packages/pi-ticketing
omp -e .
```

Package manifests do not define their own `scripts`; contributor workflows are rooted in the top-level `package.json`.

## Code Conventions & Common Patterns
- Language: TypeScript only.
- Module/runtime contract: `tsconfig.json` uses `target: ES2022`, `module: Node16`, `moduleResolution: Node16`, `strict: true`, and `noEmit: true`.
- Formatting/linting: `biome.json` enables Biome’s recommended linter rules, 2-space indentation, and `lineWidth: 120`.
- Package naming is consistent: `packages/pi-<domain>`.
- Test files live under `packages/*/__tests__/` and use `*.test.ts`.
- Common package layout:
  - `extensions/index.ts` — extension entrypoint
  - `extensions/commands/*.ts` — slash command handlers
  - `extensions/tools/*.ts` — AI tool registration
  - `extensions/domain/*.ts` — persistence, rendering, normalization, dashboards
  - `extensions/prompts/guidance.ts` and `extensions/prompts/base-*.md` — system prompt augmentation
- Some packages add domain-specific helpers rather than inventing a new top-level layout: `pi-ticketing` adds `graph/query/journal/attachments/checkpoints`, `pi-specs` adds `analysis/checklist/projection`, `pi-workers` adds worker runtime/messaging/checkpoint helpers, and `pi-critique`/`pi-docs`/`pi-ralph` include runtime subprocess helpers.
- Keep changes aligned with the file-backed design. If behavior changes, update the store/model/render path, the prompt guidance, the package README, and the matching tests together.
- Prefer explicit links across layers (`initiative`, `spec`, `ticket`, `worker`, `research`, `critique`, `docs`, `ralph`) over implicit inference. The repository is designed around durable IDs and recorded relationships.

## Important Files
- `README.md` — authoritative high-level architecture and layer semantics.
- `CONSTITUTION.md` — design direction and repository-wide intent behind the Loom stack.
- `package.json` — root scripts, workspace definition, extension registration.
- `tsconfig.json` — strict TypeScript contract.
- `biome.json` — formatting/lint rules and included file set.
- `vitest.config.ts` — Node test environment and test discovery glob.
- `packages/*/README.md` — package-specific behavior, layout, and local `omp -e .` usage.
- `packages/*/extensions/index.ts` — fastest way to understand a package’s command/tool surface.
- Representative checked-in Loom artifacts such as `.loom/docs/overviews/loom-ralph-orchestration-overview/doc.md` or `.loom/specs/changes/*` — useful for understanding the persisted data shape.
- The checked-in workspace `.loom/` tree is also dogfooding state for Pi Loom itself; use it as product fixture/examples, not as proof that cross-layer linkage is complete or that missing links define roadmap priority.
- Treat checked-in `.loom/` data as examples, not proof that every documented domain is currently populated. Some package READMEs describe expected artifact layouts that may not yet exist in this checkout.

## Runtime/Tooling Preferences
- Use npm workspaces. The repo is locked by `package-lock.json`; do not switch package managers casually.
- There is no build step. Validation is `npm run typecheck`, not emitted output.
- Use root-level commands for linting, type-checking, and tests.
- Use `omp -e .` from inside a package when you need to load a single extension locally.
- Vitest is configured from the repo root with `packages/*/__tests__/**/*.test.ts`; run targeted tests from the root so path resolution matches the workspace config.

## Testing & QA
- Framework: Vitest (`vitest.config.ts`), Node environment.
- Test discovery is root-scoped: `packages/*/__tests__/**/*.test.ts`.
- Tests are also part of root type-checking because `tsconfig.json` includes `packages/*/**/*.ts`.
- Common suite pattern across packages: `index.test.ts`, `commands.test.ts`, `tools.test.ts`, `store.test.ts`, and `prompt-guidance.test.ts`.
- Package-specific suites cover the domain-specific pieces:
  - `pi-ticketing`: `graph`, `attachments`, `journal`, `checkpoints`
  - `pi-specs`: `analysis`, `checklist`, `projection`
  - `pi-initiatives`: `dashboard`
  - `pi-research`: `integration-smoke`
  - `pi-critique`, `pi-docs`, `pi-ralph`: `runtime`
- No coverage thresholds are configured in `vitest.config.ts`; rely on symmetric test updates instead. If you change a store, tool, command, runtime adapter, or prompt builder, add or update the corresponding test file in the same package.
- Prompt guidance is part of the product. Changes to `extensions/prompts/` should be reflected in `prompt-guidance.test.ts`.

## Practical Editing Advice For AI Assistants
- Start at `README.md`, then read the target package README, then open that package’s `extensions/index.ts`.
- Follow the existing package pattern instead of introducing a new layout.
- Treat `.loom/` data as canonical examples of persisted shape; do not add shadow state elsewhere.
- When asked what to build next or how mature a subsystem is, prefer `CONSTITUTION.md`, constitutional memory, package READMEs, shipped code, and tests over incidental gaps in the checked-in `.loom/` dogfood state.
- Do not assume a documented `.loom` subtree is already populated; confirm actual files before depending on them. `pi-ralph` documents run artifacts even when none are checked in yet.
- When adding a new cross-layer feature, check whether the right home is research, initiative, spec, plan, ticket, critique, Ralph, or docs before wiring code.
- Avoid creating new top-level structure unless the repo already uses it. In particular, do not invent root `docs/` or `scripts/` directories for work that belongs in `.loom/` or package READMEs.
