import { describe, expect, it } from "vitest";
import { buildChiefSystemPrompt, getBaseChiefGuidance } from "../extensions/prompts/guidance.js";

describe("chief prompt guidance", () => {
  it("includes chief doctrine and layer boundaries", () => {
    const guidance = getBaseChiefGuidance();
    expect(guidance).toContain("Pi Chief Wiggum is a thin orchestration layer on top of Pi Ralph Wiggum.");
    expect(guidance).toContain("Managers are the primary AI-facing surface of this package.");
    expect(guidance).toContain("manager_start");
    expect(guidance).toContain("manager_wait");
    expect(guidance).toContain("manager is itself a Ralph loop");
    expect(guidance).toContain("Workers are internal implementation details");
    expect(guidance).toContain("ticket-bound Ralph loop running inside one managed git worktree");
    expect(guidance).toContain("Ralph remains standalone and directly usable outside Pi Chief Wiggum.");
    expect(guidance).not.toContain("/manager");
  });

  it("renders cwd-specific chief memory guidance", () => {
    const prompt = buildChiefSystemPrompt("/tmp/example-workspace");
    expect(prompt).toContain("Chief state is persisted in SQLite via pi-storage.");
    expect(prompt).toContain("manager-as-Ralph-loop execution");
  });
});
