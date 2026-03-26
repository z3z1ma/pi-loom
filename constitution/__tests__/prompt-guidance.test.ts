import { describe, expect, it } from "vitest";
import { buildConstitutionalSystemPrompt, getBaseConstitutionalGuidance } from "../prompts/guidance.js";

describe("constitutional prompt guidance", () => {
  it("loads durable constitutional doctrine from the packaged guidance file", () => {
    const guidance = getBaseConstitutionalGuidance();

    expect(guidance).toContain("Constitutional memory is the highest-order project context");
    expect(guidance).toContain("AGENTS.md remains the operational playbook");
    expect(guidance).toContain("Constitutional artifacts must be detail-first and durable");
    expect(guidance).toContain("problem framing, rationale, assumptions, scope and non-goals");
    expect(guidance).toContain("preserve constitutional questions and decisions durably");
    expect(guidance).toContain(
      "what changed, why it changed, what remains uncertain, and which artifacts are affected",
    );
    expect(guidance).toContain("research is the evidence corpus, initiatives are strategic containers");
    expect(guidance).toContain("specs are standalone declarative behavior contracts for intended system behavior");
    expect(guidance).toContain("plans as the detailed-at-that-layer container");
    expect(guidance).toContain("docs are the post-completion explanatory layer");
    expect(guidance).toContain("update documentation memory so high-level project explanations stay truthful");
  });

  it("builds a system prompt that preserves doctrine plus SQLite-backed constitutional guidance", () => {
    const cwd = "/tmp/pi-constitution-guidance";
    const prompt = buildConstitutionalSystemPrompt(cwd);

    expect(prompt.startsWith(getBaseConstitutionalGuidance())).toBe(true);
    expect(prompt).toContain("Constitutional state is persisted in SQLite via pi-storage.");
    expect(prompt).toContain(
      "Consult constitutional memory before making strategic, roadmap, or constraint-sensitive decisions.",
    );
    expect(prompt).toContain("Constitutional artifacts must be detail-first and durable.");
  });
});
