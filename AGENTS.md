# Repository Guidelines

## Project Overview
- `pi-loom` is a single repo-root npm package. Its top-level subdirectories implement the Loom stack: constitutional memory, research, initiatives, specs, plans, tickets, critique, Ralph orchestration, docs, and storage.
- Canonical state lives in SQLite today; the checked-in repo no longer carries a `.loom/` tree. Source lives under the top-level area directories such as `constitution/`, `ticketing/`, `ralph/`, and `storage/`. Some stores may eventually export one-way review surfaces into `.loom/`, but that export path is not the current source of truth.
- The root `package.json` is both the package manifest and the integration point: it loads every extension through `pi.extensions`.
- Workflow guidance lives primarily in `README.md` plus the area READMEs under `<area>/README.md`; treat those as the first documentation stop before inferring behavior from checked-in `.loom` examples.

## Architecture & Data Flow
1. A slash command or tool call enters through an area entrypoint such as `ticketing/index.ts` or `specs/index.ts`.
2. Each area's `index.ts` registers its command/tool surface, initializes its ledger on `session_start`, and appends area-specific prompt guidance on `before_agent_start`.
3. `commands/*.ts` handle human-facing slash commands; `tools/*.ts` expose AI-facing tool APIs.
4. `domain/*.ts` owns the repo-materialized model: `store.ts`, `models.ts`, `paths.ts`, `normalize.ts`, `render.ts`, plus area-specific helpers like `overview.ts`, `frontmatter.ts`, `projection.ts`, `graph.ts`, or `runtime.ts`.
5. Domain stores own the package-local model and canonical SQLite projection logic; when human-facing artifacts are exported, they are derived from canonical records rather than treated as primary state.
6. Many stores sync canonical records and projections through `pi-loom/storage`; any future `.loom/` export is one-way and review-oriented rather than a second system of record.
7. Area entrypoints also export a `_test` object so command handlers, prompt builders, and stores can be exercised directly from Vitest.

### Workspace projections and packets
- Workspace projections are the repo-visible `.loom/<family>/...` exports for canonical records; they are review and reconcile surfaces, not canonical truth.
- Supported projection families today are `constitution`, `research`, `initiatives`, `specs`, `plans`, `docs`, and `tickets`.
- Critique and Ralph do not project into `.loom/`; their packets and runtime artifacts stay distinct from projection flows.
- Packets are fresh-process handoff artifacts compiled from canonical state. They are not reconcile targets and they do not autosync from file edits.
- Use `/loom-status`, `/loom-export`, `/loom-refresh`, and `/loom-reconcile` for the human-facing `.loom/` sync surface. `projection_status` / `projection_write` remain AI tools. Hidden file-save autosync is intentionally unsupported.
- Ticket projections are high-churn and default to local-only Git hygiene: `.loom/.gitignore` ignores `tickets/` plus `.reconcile/` scratch/conflict leftovers unless a workflow intentionally changes that default.

### Layer boundaries
- Core execution flow: `constitution -> research -> initiatives -> specs -> plans -> tickets`, with `pi-ralph` orchestrating bounded plan/execute/review loops alongside ticket execution rather than replacing the ticket ledger.
- `pi-critique` is the durable review layer; it does not replace tickets or plans.
- `pi-ralph` orchestrates bounded plan/execute/review loops across the other layers; it is not a general workflow engine.
- `pi-docs` is the post-completion explanatory layer.
- `plans` is the only naming exception among the single-command extension areas: the slash command is `/workplan`, not `/plan`.
- Command and tool families are paired by layer: `/ticket` + `ticket_*`, `/spec` + `spec_*`, `/workplan` + `plan_*`, `/critique` + `critique_*`, `/docs` + `docs_*`, `/ralph` + `ralph_*`. Cross-layer `.loom` sync is the exception: human-facing commands live under `/loom-*`, while the AI tool surface remains `projection_*`.

## Key Directories
- `bidi/` — cross-layer `.loom` sync command/tool area
- `constitution/` — constitutional memory area
- `research/` — research memory area
- `initiatives/` — initiative memory area
- `specs/` — specification memory area
- `plans/` — planning memory area
- `ticketing/` — ticket execution area
- `critique/` — critique memory area
- `ralph/` — Ralph orchestration area
- `docs/` — documentation memory area
- `storage/` — internal shared storage-contract area for canonical entities, projections, links, and runtime attachments; not a Pi extension entrypoint.
- `*/{commands,domain,prompts,tools,ui}/` — area implementation code.
- `*/__tests__/` — Vitest suites.
- `.agents/resources/` — reference material; not primary runtime code.

There is no root `scripts/` directory. The root-level `docs/` directory is Pi Loom's documentation extension area, not a generic grab-bag for miscellaneous repository prose. Keep operational/workflow guidance in `README.md` and the area READMEs unless work truly belongs to the docs extension area.

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
omp -e .
```

The package manifest is the top-level `package.json`; contributor workflows are rooted there.

## Code Conventions & Common Patterns
- Language: TypeScript only.
- Module/runtime contract: `tsconfig.json` uses `target: ES2022`, `module: Node16`, `moduleResolution: Node16`, `strict: true`, and `noEmit: true`.
- Formatting/linting: `biome.json` enables Biome’s recommended linter rules, 2-space indentation, and `lineWidth: 120`.
- Area naming is consistent at the repo root: `<domain>/`.
- Test files live under `*/__tests__/` and use `*.test.ts`.
- Common area layout:
  - `index.ts` — extension entrypoint
  - `commands/*.ts` — slash command handlers
  - `tools/*.ts` — AI tool registration
  - `domain/*.ts` — persistence, rendering, normalization, overviews
  - `prompts/guidance.ts` and `prompts/base-*.md` — system prompt augmentation
- Entry points usually register one slash command + one tool family, initialize the store on `session_start` and `before_agent_start`, and expose a `_test` export.
- Stores increasingly follow a projection + canonical-sync pattern: keep canonical entity/projection data in `pi-loom/storage`, and treat any exported repo artifacts as derived review surfaces rather than primary state.
- Some areas add domain-specific helpers rather than inventing a new top-level layout: `ticketing` adds `graph/query/journal/attachments/checkpoints`, `specs` adds `analysis/checklist/projection`, and `critique`/`docs`/`ralph` include runtime subprocess helpers.
- Keep changes aligned with the current repo-materialized + canonical-sync design. If behavior changes, update the store/model/render path, the prompt guidance, the package README, and the matching tests together.
- Prefer explicit links across layers (`initiative`, `spec`, `ticket`, `worker`, `research`, `critique`, `docs`, `ralph`) over implicit inference. The repository is designed around durable IDs and recorded relationships.

## Important Files
- `README.md` — authoritative high-level architecture and layer semantics.
- `CONSTITUTION.md` — design direction and repository-wide intent behind the Loom stack.
- `package.json` — root scripts, workspace definition, extension registration.
- `tsconfig.json` — strict TypeScript contract.
- `biome.json` — formatting/lint rules and included file set.
- `vitest.config.ts` — Node test environment and test discovery glob.
- `storage/README.md` and `storage/` — storage migration boundary and shared canonical storage contract.
- `README.md` plus `*/README.md` — package and area-specific behavior, layout, and local `omp -e .` usage.
- `*/index.ts` — fastest way to understand an area’s command/tool surface.
- `DATA_PLANE.md` — current-state map of the SQLite-backed canonical storage plane.
- Package and area READMEs may describe future export layouts under `.loom/`; treat those as design intent unless the code path explicitly emits them.

## Runtime/Tooling Preferences
- Use npm. The repo is locked by `package-lock.json`; do not switch package managers casually.
- There is no build step. Validation is `npm run typecheck`, not emitted output.
- Use root-level commands for linting, type-checking, and tests.
- Use `omp -e .` from the repo root when you need to load Pi Loom locally.
- Root `package.json` is the authoritative extension loader. `storage/` participates as shared implementation, not as a `pi.extensions` entrypoint.
- Vitest is configured from the repo root with `**/__tests__/**/*.test.ts`; run targeted tests from the root so path resolution matches the workspace config.
- Extension UI has an important interactive-mode quirk: `ctx.ui.setWidget(...)` is funneled through Oh My Pi's `ExtensionUiController.setHookWidget`, which calls `statusLine.setHookStatus(key, String(content))`. In practice that means interactive widgets are flattened into a single status-line string; arrays are stringified, newlines are sanitized away, and `undefined` can render literally if passed through the widget path.
- For live one-line extension status in interactive sessions, prefer `ctx.ui.setStatus(key, text)` and clear it with `ctx.ui.setStatus(key, undefined)`. Reserve `setWidget` for RPC mode or for hosts that truly honor widget lines/components, and verify behavior in the actual Pi TUI before depending on multiline rendering.

## Testing & QA
- Framework: Vitest (`vitest.config.ts`), Node environment.
- Test discovery is root-scoped across the top-level areas.
- Tests are also part of root type-checking because `tsconfig.json` includes every top-level area's `**/*.ts`.
- Store tests commonly create a temp workspace and override `PI_LOOM_ROOT`; mirror that pattern when adding new ledger/store coverage.
- Many suites freeze time with `vi.useFakeTimers()` + `vi.setSystemTime(...)` so IDs, timestamps, and JSONL records stay deterministic.
- Common suite pattern across areas: `index.test.ts`, `commands.test.ts`, `tools.test.ts`, `store.test.ts`, and `prompt-guidance.test.ts`.
- Area-specific suites cover the domain-specific pieces:
  - `ticketing`: `graph`, `attachments`, `journal`, `checkpoints`
  - `specs`: `analysis`, `checklist`, `projection`
  - `initiatives`: `overview`
  - `research`: `integration-smoke`
  - `critique`, `docs`, `ralph`: `runtime`
- Runtime tests often assert repo-relative path rendering and CLI spawn resolution; avoid introducing absolute-path assumptions in overviews, prompts, or launch descriptors.
- No coverage thresholds are configured in `vitest.config.ts`; rely on symmetric test updates instead. If you change a store, tool, command, runtime adapter, or prompt builder, add or update the corresponding test file in the same package.
- Prompt guidance is part of the product. Changes to `prompts/` should be reflected in `prompt-guidance.test.ts`.

## Practical Editing Advice For AI Assistants
- Start at `README.md` and `CONSTITUTION.md`, then read the target area README, then open that area’s `index.ts`.
- Follow the existing area pattern instead of introducing a new layout.
- Treat SQLite-backed canonical state as the source of truth. Exported `.loom/` material, when present, is derived and one-way.
- When projections are involved, distinguish repo-visible projections from packets: projections may be exported and reconciled explicitly, while packets are fresh handoff artifacts that are never the source of truth.
- Use `projection_status` before reconcile when you need to know whether a projected file is clean, modified, missing, or not exported. Use `projection_write` for explicit export/refresh/reconcile operations instead of assuming file edits are imported automatically.
- When asked what to build next or how mature a subsystem is, prefer `CONSTITUTION.md`, constitutional memory, package READMEs, shipped code, tests, and `DATA_PLANE.md` over hypothetical future `.loom/` exports.
- Do not assume a documented `.loom` subtree exists yet; confirm code paths and actual files before depending on them. `pi-ralph` documents run artifacts even when none are exported in this checkout.
- When adding a new cross-layer feature, check whether the right home is research, initiative, spec, plan, ticket, critique, Ralph, or docs before wiring code.
- Avoid creating new top-level structure unless the repo already uses it. In particular, do not invent root `scripts/` or new sibling top-level content areas for work that belongs in the existing area directories or the package/area READMEs.
