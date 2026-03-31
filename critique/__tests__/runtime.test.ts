import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSeededGitWorkspace } from "#storage/__tests__/helpers/git-fixture.js";
import { PI_LOOM_DISABLED_TOOLS_ENV } from "#storage/runtime-tools.js";
import { resolveExtensionPackageRoot, runCritiqueLaunch } from "../domain/runtime.js";
import { createCritiqueStore } from "../domain/store.js";

describe("critique runtime spawn resolution", () => {
  it("roots extension launches at the unified pi-loom package instead of the caller workspace", () => {
    // resolveExtensionPackageRoot delegates to ralph/domain/harness.ts resolveExtensionRoot
    // which starts from import.meta.url of ralph/domain/harness.ts
    // ralph/domain is in the package root structure.
    expect(resolveExtensionPackageRoot()).toBe(resolve("."));
  });
});

describe("critique worktree branch policy", () => {
  it("uses managed branch reservations instead of external-ref ordering", async () => {
    const workspace = createSeededGitWorkspace({
      prefix: "pi-critique-runtime-branch-",
      packageName: "pi-loom",
      remoteUrl: "git@github.com:example/pi-loom.git",
    });

    try {
      const ticket = await createCritiqueStore(workspace.cwd);
      void ticket;
      const ticketStore = (await import("#ticketing/domain/store.js")).createTicketStore(workspace.cwd);
      const created = await ticketStore.createTicketAsync({
        title: "Critique branch reservation ticket",
        branchMode: "allocator",
        branchFamily: "UDP-100",
        externalRefs: ["ZZZ-2", "AAA-1"],
      });

      const worktreeModule = await import("#ralph/domain/worktree.js");
      const harnessModule = await import("#ralph/domain/harness.js");
      const provisionSpy = vi.spyOn(worktreeModule, "provisionWorktree").mockReturnValue(workspace.cwd);
      const harnessSpy = vi.spyOn(harnessModule, "runHarnessLaunch").mockResolvedValue({
        command: "pi",
        args: [],
        exitCode: 0,
        output: "ok",
        stderr: "",
        usage: { measured: false, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
        status: "completed",
        completedAt: new Date().toISOString(),
        events: [],
      });

      await runCritiqueLaunch(
        workspace.cwd,
        {
          critiqueId: "critique-001",
          createdAt: new Date().toISOString(),
          packetRef: "critique:packet",
          target: { kind: "workspace", ref: "pi-loom", locator: "workspace" },
          focusAreas: ["architecture"],
          reviewQuestion: "Does the branch policy stay aligned?",
          freshContextRequired: true,
          runtime: "descriptor_only",
          instructions: [],
        },
        undefined,
        undefined,
        undefined,
        created.summary.id,
      );

      expect(provisionSpy).toHaveBeenCalledWith(workspace.cwd, "UDP-100");
      expect(harnessSpy).toHaveBeenCalled();
      expect(harnessSpy.mock.calls[0]?.[4]).toMatchObject({
        [PI_LOOM_DISABLED_TOOLS_ENV]: "critique_launch",
      });
    } finally {
      workspace.cleanup();
    }
  }, 30000);
});

describe("critique verdict derivation", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "pi-critique-runtime-"));
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    try {
      rmSync(workspace, { recursive: true, force: true });
    } catch {}
  });

  it("does not keep a pass verdict once an active finding is recorded", async () => {
    const critiqueStore = createCritiqueStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T10:00:00.000Z"));
    const critique = await critiqueStore.createCritiqueAsync({
      title: "Workspace review",
      target: {
        kind: "workspace",
        ref: "pi-critique",
        locator: "critique",
      },
    });

    vi.setSystemTime(new Date("2026-03-15T10:05:00.000Z"));
    const withRun = await critiqueStore.recordRunAsync(critique.state.critiqueId, {
      kind: "verification",
      verdict: "pass",
      summary: "Initial verification did not find issues.",
    });
    const firstRun = withRun.runs[0];
    expect(firstRun).toBeDefined();

    vi.setSystemTime(new Date("2026-03-15T10:10:00.000Z"));
    const withFinding = await critiqueStore.addFindingAsync(critique.state.critiqueId, {
      runId: firstRun?.id ?? "missing-run",
      kind: "bug",
      severity: "medium",
      title: "Late finding",
      summary: "A concrete issue was found after the initial pass verdict.",
      recommendedAction: "Keep the critique verdict non-pass until the finding is resolved.",
    });

    expect(withFinding.state.openFindingIds).toEqual(["finding-001"]);
    expect(withFinding.state.currentVerdict).toBe("concerns");
  }, 60000);
});
