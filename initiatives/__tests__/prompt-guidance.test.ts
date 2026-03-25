import { describe, expect, it } from "vitest";
import { buildInitiativeSystemPrompt, getBaseInitiativeGuidance } from "../prompts/guidance.js";

describe("initiative prompt guidance", () => {
  it("loads durable initiative doctrine from the packaged guidance file", () => {
    const guidance = getBaseInitiativeGuidance();

    expect(guidance).toContain("Initiatives are the default strategic container for long-horizon work.");
    expect(guidance).toContain("Use initiatives to persist a substantial, self-contained strategic record");
    expect(guidance).toContain("inspect constitutional memory before creating or revising strategic context");
    expect(guidance).toContain("inspect existing initiatives before creating a new one");
    expect(guidance).toContain("make each initiative detailed enough to stand on its own strategic layer");
    expect(guidance).toContain(
      "decision-driving context, sequencing constraints, milestone intent, success signals, provenance, and unresolved strategic questions",
    );
    expect(guidance).toContain("use initiative overviews to reason over linked spec and ticket progress");
    expect(guidance).toContain(
      "create or update a plan rather than stretching the initiative itself into a ticket-by-ticket scratchpad or execution journal",
    );
    expect(guidance).toContain("plans as the durable execution-strategy layer");
    expect(guidance).toContain("docs as the post-completion explanatory layer");
    expect(guidance).toContain("update documentation memory so the high-level narrative stays truthful");
  });

  it("builds a system prompt that preserves base doctrine and workspace-specific initiative root", () => {
    const cwd = "/tmp/pi-initiatives-guidance";
    const prompt = buildInitiativeSystemPrompt(cwd);

    expect(prompt.startsWith(getBaseInitiativeGuidance())).toBe(true);
    expect(prompt).toContain("Initiative state is persisted in SQLite via pi-storage.");
    expect(prompt).toContain("Prefer initiative tools before ad-hoc strategic tracking for program-level work.");
  });
});
