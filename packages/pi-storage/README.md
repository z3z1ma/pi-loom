# @pi-loom/pi-storage

Internal shared storage-contract package for Pi Loom.

This package is not a Pi extension. It defines the storage abstractions for Pi Loom's SQLite-backed canonical state. SQLite is the current and only supported durable backend.

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

All Pi Loom packages depend on these abstractions. Packages read canonical state from pi-storage and SQLite directly. Generated markdown packets, plans, and docs are derived from canonical records instead of serving as durable storage.

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

`storage/workspace.ts` uses that scope model when opening the canonical catalog so packages read the same active scope that discovery/selection tools expose.
