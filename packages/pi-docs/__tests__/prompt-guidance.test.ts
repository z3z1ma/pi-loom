import { describe, expect, it } from "vitest";
import { buildDocsSystemPrompt, getBaseDocsGuidance } from "../extensions/prompts/guidance.js";

describe("docs prompt guidance", () => {
  it("loads durable docs doctrine from the packaged guidance file", () => {
    const guidance = getBaseDocsGuidance();

    expect(guidance).toContain("Documentation is the durable explanatory Loom layer");
    expect(guidance).toContain("detail-first, self-contained explanations");
    expect(guidance).toContain("rather than API-reference snippets");
    expect(guidance).toContain("inspect existing docs before creating a new documentation record");
    expect(guidance).toContain("problem framing");
    expect(guidance).toContain("rationale for the current design");
    expect(guidance).toContain("scope and non-goals");
    expect(guidance).toContain(
      "someone who was not present for the implementation can still understand what changed and why it matters",
    );
    expect(guidance).toContain("do not write shallow blurbs or minimal summaries");
    expect(guidance).toContain("plans as the execution-strategy layer");
    expect(guidance).toContain("use plans for pre-completion execution strategy");
    expect(guidance).toContain("preserve revision history");
  });

  it("builds a system prompt that preserves base doctrine and workspace docs root", () => {
    const cwd = "/tmp/pi-docs-guidance";
    const prompt = buildDocsSystemPrompt(cwd);

    expect(prompt.startsWith(getBaseDocsGuidance())).toBe(true);
    expect(prompt).toContain("Documentation state is persisted in SQLite via pi-storage.");
    expect(prompt).toContain("Prefer docs packets and durable high-level documentation over chat-only explanations.");
    expect(prompt).toContain("detail-first, self-contained explanations");
  });
});
