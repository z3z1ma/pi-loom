import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findEntityByDisplayId } from "@pi-loom/pi-storage/storage/entities.js";
import { openWorkspaceStorage } from "@pi-loom/pi-storage/storage/workspace.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRalphDashboard } from "../extensions/domain/dashboard.js";
import type { RalphLaunchDescriptor, RalphRunState } from "../extensions/domain/models.js";
import { renderLaunchDescriptor, renderLaunchPrompt } from "../extensions/domain/render.js";
import { getPiSpawnCommand, resolvePiCliScript, resolveRalphExtensionRoot } from "../extensions/domain/runtime.js";
import { createRalphStore } from "../extensions/domain/store.js";

describe("ralph runtime spawn resolution", () => {
  it("resolves the Ralph extension root from the package, not the caller workspace", () => {
    const extensionRoot = resolveRalphExtensionRoot();

    expect(extensionRoot.replace(/\\/g, "/")).toMatch(/\/packages\/pi-ralph$/);
  });

  it("renders launch packet refs without attempting repo-path translation", () => {
    const launch: RalphLaunchDescriptor = {
      runId: "run-123",
      iterationId: "iter-001",
      iteration: 1,
      createdAt: "2026-03-15T14:33:00.000Z",
      runtime: "subprocess",
      packetRef: "ralph-run:run-123:packet",
      launchRef: "ralph-run:run-123:launch",
      resume: true,
      instructions: [],
    };

    expect(renderLaunchDescriptor("/tmp/different-root", launch)).toContain("Packet ref: ralph-run:run-123:packet");
    expect(renderLaunchPrompt("/tmp/different-root", launch)).toContain(
      "Execute one bounded Ralph iteration for run run-123 using ralph-run:run-123:packet.",
    );
  });

  it("projects dashboard artifact refs from the run id", () => {
    const dashboard = buildRalphDashboard(
      {
        runId: "run-123",
        critiqueLinks: [],
        latestDecision: null,
        waitingFor: "operator",
      } as unknown as RalphRunState,
      {
        id: "run-123",
        title: "Repo hygiene",
        status: "active",
        phase: "executing",
        updatedAt: "2026-03-15T14:33:00.000Z",
        iterationCount: 2,
        policyMode: "balanced",
        decision: null,
        waitingFor: "operator",
        objectiveSummary: "Normalize stored refs",
        runRef: "ralph-run:run-123",
      },
      [],
      {
        dir: "/workspace/ralph-storage/run-123",
        state: "/workspace/ralph-storage/run-123/state.json",
        packet: "/workspace/ralph-storage/run-123/packet.md",
        run: "/workspace/ralph-storage/run-123/run.md",
        iterations: "/workspace/ralph-storage/run-123/iterations.jsonl",
        launch: "/workspace/ralph-storage/run-123/launch.json",
      },
      ["pending", "running", "reviewing", "accepted", "rejected", "failed", "cancelled"],
      ["not_run", "pass", "concerns", "fail"],
    );

    expect(dashboard.packetRef).toBe("ralph-run:run-123:packet");
    expect(dashboard.runRef).toBe("ralph-run:run-123:run");
    expect(dashboard.launchRef).toBe("ralph-run:run-123:launch");
  });

  it("reuses the current script entrypoint when running under a JS runtime", () => {
    const command = getPiSpawnCommand(["--mode", "json"], {
      execPath: "/usr/local/bin/node",
      argv1: "/custom-fork/dist/omp-cli.js",
      existsSync: (filePath) => filePath === "/custom-fork/dist/omp-cli.js",
    });

    expect(command).toEqual({
      command: "/usr/local/bin/node",
      args: ["/custom-fork/dist/omp-cli.js", "--mode", "json"],
    });
  });

  it("reuses the current executable when running as a standalone binary", () => {
    const command = getPiSpawnCommand(["--mode", "json"], {
      execPath: "/opt/tools/omp",
      argv1: "resume ralph run",
      existsSync: () => false,
    });

    expect(command).toEqual({
      command: "/opt/tools/omp",
      args: ["--mode", "json"],
    });
  });

  it("falls back to the package bin script when only package metadata is available", () => {
    const packageJsonPath = "/pkg/package.json";
    const packageJson = JSON.stringify({ bin: { pi: "dist/cli.js" } });

    expect(
      resolvePiCliScript({
        execPath: "/usr/local/bin/node",
        argv1: "resume from packet",
        existsSync: (filePath) => filePath === "/pkg/dist/cli.js",
        readFileSync: (filePath) => {
          if (filePath !== packageJsonPath) {
            throw new Error(`Unexpected path ${filePath}`);
          }
          return packageJson;
        },
        resolvePackageJson: () => packageJsonPath,
      }),
    ).toBe("/pkg/dist/cli.js");
  });

  it("falls back to the pi command when no script path can be resolved", () => {
    const command = getPiSpawnCommand(["--mode", "json", "--no-session"], {
      execPath: "/usr/local/bin/node",
      argv1: "resume from packet",
      existsSync: () => false,
      readFileSync: () => {
        throw new Error("package metadata unavailable");
      },
      resolvePackageJson: () => {
        throw new Error("package metadata unavailable");
      },
    });

    expect(command).toEqual({
      command: "pi",
      args: ["--mode", "json", "--no-session"],
    });
  });
});

describe("ralph review-state gating", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "pi-ralph-runtime-"));
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(workspace, { recursive: true, force: true });
  });

  it("keeps reviewing runs gated when iteration verifier evidence is blocking", async () => {
    const store = createRalphStore(workspace);

    vi.setSystemTime(new Date("2026-03-16T09:00:00.000Z"));
    const created = store.createRun({
      title: "Verifier-blocked review",
      objective: "Keep launch safety truthful while a verifier blocker is active.",
      policySnapshot: {
        verifierRequired: true,
        critiqueRequired: false,
      },
    });

    vi.setSystemTime(new Date("2026-03-16T09:01:00.000Z"));
    const reviewed = store.appendIteration(created.state.runId, {
      status: "reviewing",
      focus: "Record verifier evidence",
      summary: "Verifier blocked launch pending operator review.",
      verifier: {
        sourceKind: "test",
        sourceRef: "packages/pi-ralph/__tests__/runtime.test.ts",
        verdict: "fail",
        blocker: true,
        summary: "Runtime safety checks failed.",
      },
    });

    expect(reviewed.state.status).toBe("waiting_for_review");
    expect(reviewed.state.phase).toBe("reviewing");
    expect(reviewed.state.waitingFor).toBe("operator");
    expect(reviewed.launch.packetRef).toBe(`ralph-run:${created.state.runId}:packet`);

    const { storage, identity } = await openWorkspaceStorage(workspace);
    const runEntity = await findEntityByDisplayId(storage, identity.space.id, "ralph_run", created.state.runId);
    expect(runEntity?.attributes).toEqual(
      expect.objectContaining({
        state: expect.objectContaining({
          runId: created.state.runId,
          waitingFor: "operator",
          nextIterationId: null,
          postIteration: expect.objectContaining({
            iterationId: "iter-001",
            status: "reviewing",
          }),
        }),
      }),
    );
    expect(runEntity?.attributes).not.toHaveProperty("record");

    const readback = store.readRun(created.state.runId);
    expect(readback.iterations).toHaveLength(1);
    expect(readback.iterations[0]).toMatchObject({ id: "iter-001", status: "reviewing" });
    expect(readback.state.waitingFor).toBe("operator");
    expect(readback.launch).toMatchObject({
      iterationId: "iter-001",
      runtime: "descriptor_only",
      packetRef: `ralph-run:${created.state.runId}:packet`,
    });

    expect(() => store.prepareLaunch(created.state.runId)).toThrow(
      "Ralph run verifier-blocked-review is waiting for operator and cannot launch until that gate is cleared.",
    );
  }, 90000);
});
