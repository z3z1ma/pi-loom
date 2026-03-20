import { describe, expect, it } from "vitest";
import { buildWorkerSystemPrompt, getBaseWorkerGuidance } from "../extensions/prompts/guidance.js";

describe("worker prompt guidance", () => {
  it("includes worker doctrine and layer boundaries", () => {
    const guidance = getBaseWorkerGuidance();
    expect(guidance).toContain("Managers are the primary AI-facing surface of this package.");
    expect(guidance).toContain("manager_start");
    expect(guidance).toContain("manager_wait");
    expect(guidance).toContain("Workers are internal implementation details");
    expect(guidance).toContain("ticket-bound wrapper around one linked Ralph run");
    expect(guidance).toContain("Use `manager_steer`");
    expect(guidance).toContain("Ralph remains standalone and directly usable outside Pi Workers.");
    expect(guidance).not.toContain("/manager");
  });

  it("renders cwd-specific worker memory guidance", () => {
    const prompt = buildWorkerSystemPrompt("/tmp/example-workspace");
    expect(prompt).toContain("Worker state is persisted in SQLite via pi-storage.");
    expect(prompt).toContain("manager-first orchestration");
  });
});
