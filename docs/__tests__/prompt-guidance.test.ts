import { describe, expect, it } from "vitest";
import { PI_LOOM_DISABLED_TOOLS_ENV } from "#storage/runtime-tools.js";
import { buildDocsSystemPrompt, getBaseDocsGuidance } from "../prompts/guidance.js";

describe("docs prompt guidance", () => {
  it("loads durable docs doctrine from the packaged guidance file", () => {
    const guidance = getBaseDocsGuidance();

    expect(guidance).toContain("Documentation is the authoritative explanatory Loom layer");
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
    expect(guidance).toContain("governed topic ownership, verification evidence, and drift audit results explicit");
    expect(guidance).toContain("specs as standalone declarative behavior contracts for intended system behavior");
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
    expect(prompt).toContain(
      "Governed docs expose topic ownership, lifecycle, publication truth, and successor state explicitly",
    );
    expect(prompt).toContain("detail-first, self-contained explanations");
  });

  it("adds an explicit recursion guard note inside docs_update-launched sessions", () => {
    const previous = process.env[PI_LOOM_DISABLED_TOOLS_ENV];
    process.env[PI_LOOM_DISABLED_TOOLS_ENV] = "docs_update";

    try {
      const prompt = buildDocsSystemPrompt("/tmp/pi-docs-guidance");
      expect(prompt).toContain("This session was launched by docs_update.");
      expect(prompt).toContain("docs_update is unavailable here to prevent recursive fresh-maintainer launches");
      expect(prompt).toContain("persist the bounded revision through docs_write instead");
    } finally {
      if (previous === undefined) {
        delete process.env[PI_LOOM_DISABLED_TOOLS_ENV];
      } else {
        process.env[PI_LOOM_DISABLED_TOOLS_ENV] = previous;
      }
    }
  });
});
