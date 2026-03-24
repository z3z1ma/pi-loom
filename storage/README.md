# pi-loom/storage

Internal shared storage-contract area for Pi Loom.

This area is not a Pi extension entrypoint. It defines the storage abstractions for Pi Loom's SQLite-backed canonical state. SQLite is the current and only supported durable backend.

## Scope

The contract covers the core shared-storage concepts for Pi Loom state:

- spaces / projects
- repositories
- worktrees
- persisted active-scope bindings and repository enrollment snapshots
- durable entities
- cross-entity links
- append-only events
- clone-local runtime attachments
- storage interfaces centered on the SQLite-backed catalog

## Identity and integrity rules

- Canonical storage ids are opaque ids, not human-facing slugs.
- Human-facing lookup stays on per-kind `displayId` values such as ticket ids, plan ids, or research ids.
- `displayId` values are unique within `(space, kind)` whenever they are present.
- Entity events are append-only records. Normal package flows add events; they do not rewrite or delete prior events.
- Runtime attachments remain separately mutable because they are clone-local control-plane state rather than shared canonical history.

## Intended use

All Pi Loom extension areas depend on these abstractions. Pi Loom reads canonical state from the storage layer and SQLite directly. Generated markdown packets, plans, and docs are derived from canonical records instead of serving as durable storage.

## Backend policy

- SQLite is the canonical backend.
- Network-shared SQLite is not the intended multi-machine deployment model.
- Future backends, if added, must preserve the same storage semantics instead of changing the source of truth.
- SQLite-specific features may be used when they do not blur the canonical storage boundary.

## Backup and cutover

When making breaking schema changes, back up the current catalog before opening it with the new code. A minimal manual backup flow is:

```bash
sqlite3 "$PI_LOOM_ROOT/catalog.sqlite" ".backup '$PI_LOOM_ROOT/catalog-$(date +%Y%m%d-%H%M%S).sqlite'"
```

If `PI_LOOM_ROOT` is unset, Pi Loom defaults to `~/.pi/loom`. The sync-bundle export helpers in `storage/sync.ts` are the ad hoc path for capturing JSON backups or moving canonical SQLite state between catalogs during one-time migrations.

## Important boundary

The contract separates canonical shared state from clone-local runtime state:

- canonical operational state lives in SQLite via the shared storage backend
- generated markdown bodies and review surfaces are exports from canonical records, not alternative durable stores
- clone-local runtime/worktree attachments stay local and must not masquerade as canonical shared truth

## Multi-repository scope discovery

`storage/scope.ts` owns the startup-facing multi-repository contract:

- deterministic discovery of the current repository or direct child repositories under a parent directory
- persisted active space/repository/worktree bindings stored under `$PI_LOOM_ROOT/state/scope-bindings.json`
- canonical enrollment snapshots materialized as artifact entities per space
- headless discovery, enrollment, selection, and revocation helpers that keep startup truthful when bindings are stale or contradictory

`storage/workspace.ts` uses that scope model when opening the canonical catalog so extension areas read the same active scope that discovery/selection tools expose.

Important operational consequences:

- parent-directory startup may legitimately resolve to one space with multiple enrolled repositories and no active repository selection yet; ambiguity is a real state, not an error to paper over with cwd heuristics
- stale persisted bindings are ignored with explicit diagnostics instead of silently retargeting calls to whichever repository happens to be locally present
- selected repositories may remain canonically enrolled even when their local clone or worktree is unavailable; space-level reads still work, but repository-targeted opens and runtime launches fail closed until a local worktree exists again
- repository-qualified portable paths are the canonical way to carry repo-bound file references across plans, docs, tickets, exports, and later hydration in multi-repo spaces

## Runtime and sync scope

`storage/runtime-scope.ts` and `storage/sync.ts` carry the same truth into fresh processes and exported bundles:

- runtime scope is propagated as explicit space/repository/worktree identity, not inferred from the spawned process cwd
- wrong-space runtime targets are rejected rather than coerced
- runtime scope distinguishes canonical repository membership from local clone availability, so callers can tell "known to the space" apart from "locally runnable right now"
- full-space exports are marked with `scope.kind = "space"` and `partial = false`
- repository-scoped exports are marked with `scope.kind = "repository"` and `partial = true`, and they exclude unrelated repositories instead of mislabeling a partial snapshot as the whole space
- hydration preserves the declared export scope rather than rebinding imported records to the importer's cwd
