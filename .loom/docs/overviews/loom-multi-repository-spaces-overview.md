---
id: loom-multi-repository-spaces-overview
title: "Loom multi-repository spaces overview"
status: active
type: overview
section: overviews
audience:
  - ai
  - human
source: spec:first-class-multi-repository-loom-spaces
topics: []
outputs: []
upstream-path: null
---

# Loom multi-repository spaces overview

Loom supports a first-class multi-repository operating model where a single "Loom space" spans multiple repositories. This allows for coordinated work (plans, tickets, research, specs) across a system that is split into several git repositories, without losing the identity of individual repositories or relying on fragile current-working-directory (CWD) assumptions.

## Concepts

### Space
The **Space** is the canonical coordination boundary. It represents the "system" or "project" as a whole.
- Contains multiple **Repositories**.
- Persisted in the SQLite catalog.
- Acts as the container for all Loom artifacts (tickets, plans, specs, etc.).
- Independent of any single file system location (though currently backed by local SQLite).

### Repository
A **Repository** is a canonical member of a Space.
- Has a stable identity (e.g., `github.com/org/repo`).
- Can be enrolled or unenrolled from a Space.
- Owns source code and repository-specific artifacts.
- Loom artifacts like Tickets are "owned" by a Repository to avoid naming collisions (e.g., `pl-123` in Repo A is distinct from `pl-123` in Repo B, though typically they share a sequence or use distinct prefixes if configured).

### Worktree
A **Worktree** is a local checkout of a Repository.
- A Repository can have multiple Worktrees (e.g., main checkout, feature branch worktrees).
- Runtime operations (editing files, running tests) happen in a Worktree.
- A Space knows about Worktrees but treats them as ephemeral runtime binding targets.

## Operating Model

### Startup and Discovery
Loom startup is no longer strictly bound to "one session = one repo".
- **Parent-Directory Startup**: You can start Loom from a parent directory containing multiple repositories. Loom detects the Space (via `.pi/loom` or similar) and discovers enrolled Repositories in the subdirectories.
- **Repository-Directory Startup**: Starting inside a repository directory automatically infers the active Repository and Worktree, provided it is enrolled in the Space.

### Scope Selection
When operating in a Space with multiple Repositories, ambiguity must be resolved explicitly.
- `scope_read`: Displays the current Space, enrolled Repositories, and the active Repository/Worktree (if selected).
- `scope_write`: Used to explicitly **select**, **enroll**, or **unenroll** a Repository.
  - If you start in a parent directory, you may need to `select` a Repository before performing repository-specific actions (like creating a ticket bound to that repo).
  - Broad reads (e.g., listing all tickets in the space) do not require a specific selection and will return results from all enrolled repositories.

### Portable Paths
To avoid ambiguity, file paths in a multi-repository Space are **Repository-Qualified**.
- Format: `<repo-slug>:path/to/file` (e.g., `my-backend:src/main.ts`).
- Relative paths (e.g., `src/main.ts`) are only accepted if an active Repository is currently selected.
- Loom artifacts (Plans, Docs) should use qualified paths to ensure they remain valid regardless of where the reader is located.

### Runtime Targeting
When Loom launches subprocesses (e.g., for `ralph_run`, `critique_launch`, or `docs_update`), it propagates the **Explicit Scope** (Space/Repository/Worktree) to the child process.
- The child process does not guess its scope from CWD.
- It receives the canonical scope identifiers, ensuring it operates on the correct canonical artifacts.
- If a specific Worktree is required (e.g., to run tests), the launch fails if that Worktree is not available.

### Export and Import
- **Space Export**: A full snapshot of the Space, including all Repositories and artifacts. (`scope.kind = "space"`, `partial = false`).
- **Repository Export**: A partial snapshot containing only artifacts relevant to a specific Repository. (`scope.kind = "repository"`, `partial = true`). Use this for moving a single repo's context or backing up specific parts of the system.

### Degraded Mode
A Repository remains enrolled in the Space even if its local Worktree is missing (e.g., deleted or not yet cloned on this machine).
- **Read Operations**: You can still read Tickets, Specs, and Plans associated with the "missing" Repository from the SQLite catalog.
- **Write/Runtime Operations**: Actions requiring file access (edits, test runs) will fail with a diagnostic indicating the Worktree is unavailable.
