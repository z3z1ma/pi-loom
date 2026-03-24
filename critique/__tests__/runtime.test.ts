import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveExtensionPackageRoot } from "../domain/runtime.js";
import { createCritiqueStore } from "../domain/store.js";

describe("critique runtime spawn resolution", () => {
  it("roots extension launches at the unified pi-loom package instead of the caller workspace", () => {
    // resolveExtensionPackageRoot delegates to ralph/domain/harness.ts resolveExtensionRoot
    // which starts from import.meta.url of ralph/domain/harness.ts
    // ralph/domain is in the package root structure.
    expect(resolveExtensionPackageRoot()).toBe(resolve("."));
  });
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
