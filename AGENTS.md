# Repository Guidelines

## Project Overview
- `pi-loom` is an npm workspace with one real package: `packages/pi-loom/`. Its subdirectories implement the Loom stack: constitutional memory, research, initiatives, specs, plans, tickets, critique, Ralph orchestration, docs, and storage.
- Most repo-visible state is materialized under `.loom/`; source lives under `packages/pi-loom/*`. Several stores also sync canonical entity/projection data through `pi-loom/storage` as part of the SQLite-first migration.
- The root `package.json` is the integration point: it declares npm workspaces and loads every extension through `pi.extensions`.
- Workflow guidance lives primarily in `README.md`, `packages/pi-loom/README.md`, and the area READMEs under `packages/pi-loom/*/README.md`; treat those as the first documentation stop before inferring behavior from checked-in `.loom` examples.

## Architecture & Data Flow
1. A slash command or tool call enters through an area entrypoint such as `packages/pi-loom/ticketing/extensions/index.ts` or `packages/pi-loom/specs/extensions/index.ts`.
2. Each area's `extensions/index.ts` registers its command/tool surface, initializes its ledger on `session_start`, and appends area-specific prompt guidance on `before_agent_start`.
3. `extensions/commands/*.ts` handle human-facing slash commands; `extensions/tools/*.ts` expose AI-facing tool APIs.
4. `extensions/domain/*.ts` owns the repo-materialized model: `store.ts`, `models.ts`, `paths.ts`, `normalize.ts`, `render.ts`, plus area-specific helpers like `dashboard.ts`, `frontmatter.ts`, `projection.ts`, `graph.ts`, or `runtime.ts`.
5. Domain stores own the repo-materialized model: `.loom/<layer>/...` artifacts such as `state.json`, `packet.md`, `dashboard.json`, markdown summaries, and append-only JSONL sidecars.
6. Many stores also sync canonical records and projections through `pi-loom/storage`; `.loom/` remains the user-visible review surface while the storage contract carries the longer-term shared-state direction.
7. Area entrypoints also export a `_test` object so command handlers, prompt builders, and stores can be exercised directly from Vitest.

### Layer boundaries
- Core execution flow: `constitution -> research -> initiatives -> specs -> plans -> tickets`, with `pi-ralph` orchestrating bounded plan/execute/review loops alongside ticket execution rather than replacing the ticket ledger.
- `pi-critique` is the durable review layer; it does not replace tickets or plans.
- `pi-ralph` orchestrates bounded plan/execute/review loops across the other layers; it is not a general workflow engine.
- `pi-docs` is the post-completion explanatory layer.
- `plans` is the only naming exception among the single-command extension areas: the slash command is `/workplan`, not `/plan`.
- Command and tool families are paired by layer: `/ticket` + `ticket_*`, `/spec` + `spec_*`, `/workplan` + `plan_*`, `/critique` + `critique_*`, `/docs` + `docs_*`, `/ralph` + `ralph_*`.

## Key Directories
- `packages/` — workspace package roots.
  - `packages/pi-loom/` — the sole workspace package and extension loader root.
  - `packages/pi-loom/constitution/` — `.loom/constitution/`
  - `packages/pi-loom/research/` — `.loom/research/`
  - `packages/pi-loom/initiatives/` — `.loom/initiatives/`
  - `packages/pi-loom/specs/` — `.loom/specs/`
  - `packages/pi-loom/plans/` — `.loom/plans/`
  - `packages/pi-loom/ticketing/` — `.loom/tickets/`
  - `packages/pi-loom/critique/` — `.loom/critiques/`
  - `packages/pi-loom/ralph-wiggum/` — `.loom/ralph/`
  - `packages/pi-loom/docs/` — `.loom/docs/`
- `packages/pi-loom/storage/` — internal shared storage-contract area for canonical entities, projections, links, and runtime attachments; not a Pi extension entrypoint.
- `packages/pi-loom/*/extensions/` — area implementation code.
- `packages/pi-loom/*/__tests__/` — Vitest suites.
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
cd packages/pi-loom
omp -e .
```

The single package manifest does not define its own `scripts`; contributor workflows are rooted in the top-level `package.json`.

## Code Conventions & Common Patterns
- Language: TypeScript only.
- Module/runtime contract: `tsconfig.json` uses `target: ES2022`, `module: Node16`, `moduleResolution: Node16`, `strict: true`, and `noEmit: true`.
- Formatting/linting: `biome.json` enables Biome’s recommended linter rules, 2-space indentation, and `lineWidth: 120`.
- Area naming is consistent under `packages/pi-loom/<domain>`.
- Test files live under `packages/pi-loom/*/__tests__/` and use `*.test.ts`.
- Common area layout:
  - `extensions/index.ts` — extension entrypoint
  - `extensions/commands/*.ts` — slash command handlers
  - `extensions/tools/*.ts` — AI tool registration
  - `extensions/domain/*.ts` — persistence, rendering, normalization, dashboards
  - `extensions/prompts/guidance.ts` and `extensions/prompts/base-*.md` — system prompt augmentation
- Entry points usually register one slash command + one tool family, initialize the store on `session_start` and `before_agent_start`, and expose a `_test` export.
- Stores increasingly follow a projection + canonical-sync pattern: write repo-relative `.loom/` artifacts for reviewability, then sync canonical entity/projection data through `pi-loom/storage`.
- Some areas add domain-specific helpers rather than inventing a new top-level layout: `ticketing` adds `graph/query/journal/attachments/checkpoints`, `specs` adds `analysis/checklist/projection`, and `critique`/`docs`/`ralph-wiggum` include runtime subprocess helpers.
- Keep changes aligned with the current repo-materialized + canonical-sync design. If behavior changes, update the store/model/render path, the prompt guidance, the package README, and the matching tests together.
- Prefer explicit links across layers (`initiative`, `spec`, `ticket`, `worker`, `research`, `critique`, `docs`, `ralph`) over implicit inference. The repository is designed around durable IDs and recorded relationships.

## Important Files
- `README.md` — authoritative high-level architecture and layer semantics.
- `CONSTITUTION.md` — design direction and repository-wide intent behind the Loom stack.
- `package.json` — root scripts, workspace definition, extension registration.
- `tsconfig.json` — strict TypeScript contract.
- `biome.json` — formatting/lint rules and included file set.
- `vitest.config.ts` — Node test environment and test discovery glob.
- `packages/pi-loom/storage/README.md` and `packages/pi-loom/storage/` — storage migration boundary and shared canonical storage contract.
- `packages/pi-loom/README.md` plus `packages/pi-loom/*/README.md` — package and area-specific behavior, layout, and local `omp -e .` usage.
- `packages/pi-loom/*/extensions/index.ts` — fastest way to understand an area’s command/tool surface.
- Representative checked-in Loom artifacts such as `.loom/docs/overviews/loom-ralph-orchestration-overview/doc.md` or `.loom/specs/changes/*` — useful for understanding the persisted data shape.
- The checked-in workspace `.loom/` tree is also dogfooding state for Pi Loom itself; use it as product fixture/examples, not as proof that cross-layer linkage is complete or that missing links define roadmap priority.
- Treat checked-in `.loom/` data as examples, not proof that every documented domain is currently populated. Some package READMEs describe expected artifact layouts that may not yet exist in this checkout.

## Runtime/Tooling Preferences
- Use npm workspaces. The repo is locked by `package-lock.json`; do not switch package managers casually.
- There is no build step. Validation is `npm run typecheck`, not emitted output.
- Use root-level commands for linting, type-checking, and tests.
- Use `omp -e .` from inside `packages/pi-loom` when you need to load Pi Loom locally.
- Root `package.json` is the authoritative extension loader. `packages/pi-loom/storage/` participates as shared implementation, not as a `pi.extensions` entrypoint.
- Vitest is configured from the repo root with `packages/pi-loom/**/__tests__/**/*.test.ts`; run targeted tests from the root so path resolution matches the workspace config.
- Extension UI has an important interactive-mode quirk: `ctx.ui.setWidget(...)` is funneled through Oh My Pi's `ExtensionUiController.setHookWidget`, which calls `statusLine.setHookStatus(key, String(content))`. In practice that means interactive widgets are flattened into a single status-line string; arrays are stringified, newlines are sanitized away, and `undefined` can render literally if passed through the widget path.
- For live one-line extension status in interactive sessions, prefer `ctx.ui.setStatus(key, text)` and clear it with `ctx.ui.setStatus(key, undefined)`. Reserve `setWidget` for RPC mode or for hosts that truly honor widget lines/components, and verify behavior in the actual Pi TUI before depending on multiline rendering.

## Testing & QA
- Framework: Vitest (`vitest.config.ts`), Node environment.
- Test discovery is root-scoped: `packages/pi-loom/**/__tests__/**/*.test.ts`.
- Tests are also part of root type-checking because `tsconfig.json` includes `packages/pi-loom/**/*.ts`.
- Store tests commonly create a temp workspace and override `PI_LOOM_ROOT`; mirror that pattern when adding new ledger/store coverage.
- Many suites freeze time with `vi.useFakeTimers()` + `vi.setSystemTime(...)` so IDs, timestamps, and JSONL records stay deterministic.
- Common suite pattern across areas: `index.test.ts`, `commands.test.ts`, `tools.test.ts`, `store.test.ts`, and `prompt-guidance.test.ts`.
- Area-specific suites cover the domain-specific pieces:
  - `ticketing`: `graph`, `attachments`, `journal`, `checkpoints`
  - `specs`: `analysis`, `checklist`, `projection`
  - `initiatives`: `dashboard`
  - `research`: `integration-smoke`
  - `critique`, `docs`, `ralph-wiggum`: `runtime`
- Runtime tests often assert repo-relative path rendering and CLI spawn resolution; avoid introducing absolute-path assumptions in dashboards, prompts, or launch descriptors.
- No coverage thresholds are configured in `vitest.config.ts`; rely on symmetric test updates instead. If you change a store, tool, command, runtime adapter, or prompt builder, add or update the corresponding test file in the same package.
- Prompt guidance is part of the product. Changes to `extensions/prompts/` should be reflected in `prompt-guidance.test.ts`.

## Practical Editing Advice For AI Assistants
- Start at `README.md` and `CONSTITUTION.md`, then read `packages/pi-loom/README.md`, then the target area README, then open that area’s `extensions/index.ts`.
- Follow the existing area pattern instead of introducing a new layout.
- Treat `.loom/` data as the current repo-materialized review surface; do not add shadow state elsewhere, and remember that some stores also sync canonical state through `pi-storage`.
- When asked what to build next or how mature a subsystem is, prefer `CONSTITUTION.md`, constitutional memory, package READMEs, shipped code, and tests over incidental gaps in the checked-in `.loom/` dogfood state.
- Do not assume a documented `.loom` subtree is already populated; confirm actual files before depending on them. `pi-ralph` documents run artifacts even when none are checked in yet.
- When adding a new cross-layer feature, check whether the right home is research, initiative, spec, plan, ticket, critique, Ralph, or docs before wiring code.
- Avoid creating new top-level structure unless the repo already uses it. In particular, do not invent root `docs/` or `scripts/` directories for work that belongs in `.loom/` or package/area READMEs.
