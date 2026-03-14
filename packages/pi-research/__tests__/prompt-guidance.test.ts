import { describe, expect, it } from "vitest";

describe("research prompt guidance", () => {
  it("emphasizes research as durable upstream memory", async () => {
    const { getBaseResearchGuidance, buildResearchSystemPrompt } = await import("../extensions/prompts/guidance.js");
    const guidance = getBaseResearchGuidance();

    expect(guidance).toContain("Research is the default upstream memory layer");
    expect(guidance).toContain("substantial, self-contained records");
    expect(guidance).toContain("inspect constitutional memory before narrowing solution space");
    expect(guidance).toContain("capture enough context that a future agent can reuse the investigation");
    expect(guidance).toContain("preserve rejected hypotheses");
    expect(guidance).toContain("record artifacts as canonical evidence packages");
    expect(guidance).toContain("constitutional memory as the durable project-policy layer");
    expect(guidance).toContain("plans as the execution-strategy layer for staged multi-ticket work");
    expect(guidance).toContain("docs as the post-completion explanatory layer");
    expect(guidance).toContain("update documentation memory so the durable explanation stays truthful");

    const prompt = buildResearchSystemPrompt("/tmp/demo");
    expect(prompt).toContain("/tmp/demo/.loom/research");
    expect(prompt).toContain("Prefer research tools before ad-hoc exploratory planning");
    expect(prompt).toContain("substantial, self-contained records");
  });
});
