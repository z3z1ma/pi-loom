import { existsSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSeededGitWorkspace } from "#storage/__tests__/helpers/git-fixture.js";
import { createTicketStore } from "#ticketing/domain/store.js";
import { executeRalphLoop } from "../domain/loop.js";
import { runRalphLaunch } from "../domain/runtime.js";
import { createRalphStore } from "../domain/store.js";

// Mock runRalphLaunch to verify it receives the correct cwd (worktree root)
// and environment variables.
vi.mock("../domain/runtime.js", async () => {
  const actual = await vi.importActual("../domain/runtime.js");
  return {
    ...actual,
    runRalphLaunch: vi.fn(async () => ({
      command: "mock-command",
      args: [],
      exitCode: 0,
      output: "Mocked Ralph session runtime output",
      stderr: "",
      usage: { measured: false },
      status: "completed",
      completedAt: new Date().toISOString(),
      events: [],
    })),
  };
});

describe("Ralph Worktree Integration", () => {
  let workspace: ReturnType<typeof createSeededGitWorkspace>;

  beforeEach(() => {
    workspace = createSeededGitWorkspace({
      prefix: "ralph-worktree-test-",
      files: {
        "README.md": "# Test Repo",
      },
    });
    // Ensure we are in a git repo (createSeededGitWorkspace does init)
  });

  afterEach(() => {
    workspace.cleanup();
    vi.clearAllMocks();
  });

  it("provisions a worktree and executes the loop inside it", async () => {
    const cwd = workspace.cwd;
    const ticketStore = createTicketStore(cwd);

    // 1. Create a dummy ticket
    // Note: createTicket signature might vary, checking expected input
    const ticketResult = await ticketStore.createTicketAsync({
      title: "Test Worktree Ticket",
      summary: "Testing worktree integration",
      type: "task",
    });

    const ticketRef = ticketResult.summary.id;

    // 2. Call executeRalphLoop with executionMode: 'worktree'
    const result = await executeRalphLoop(
      { cwd },
      {
        ticketRef,
        prompt: "Fix the bug",
        executionMode: "worktree",
      },
    );

    // 3. Verify runRalphLaunch was called with a worktree path
    expect(runRalphLaunch).toHaveBeenCalled();
    const calls = vi.mocked(runRalphLaunch).mock.calls;
    const lastCall = calls[calls.length - 1];
    const [launchCwd, _launch, _signal, _onOutput, launchEnv] = lastCall;

    // Verify CWD is a worktree path
    expect(launchCwd).not.toBe(cwd);
    expect(launchCwd).toContain(".ralph-worktrees");
    expect(launchCwd).toContain("ralph-");

    // Verify Environment contains PI_LOOM_ROOT pointing to the original repo
    // process.env.PI_LOOM_ROOT is set by createSeededGitWorkspace
    // The test expects launchEnv to override/set it correctly.
    expect(launchEnv).toMatchObject({
      PI_LOOM_ROOT: process.env.PI_LOOM_ROOT ?? cwd, // Fallback to cwd if env not set, but it should be set
    });

    // 4. Verify Ralph Store has persisted the execution environment
    const ralphStore = createRalphStore(cwd);
    const run = await ralphStore.readRunAsync(result.run.state.runId);

    expect(run.state.executionEnv).toEqual(
      expect.objectContaining({
        mode: "worktree",
        // repositoryRoot might be undefined in executionEnv if it matched PI_LOOM_ROOT?
        // Let's check what verifyRalphLoop puts there.
        // It puts repositoryRoot: runtimeScope.repositoryRoot
        worktreeRoot: launchCwd,
      }),
    );

    // 5. Verify the worktree actually exists on disk
    expect(existsSync(launchCwd)).toBe(true);
  });
});
