import { describe, expect, it } from "vitest";
import { buildWorkerSystemPrompt, getBaseWorkerGuidance } from "../extensions/prompts/guidance.js";

describe("worker prompt guidance", () => {
  it("includes worker doctrine and layer boundaries", () => {
    const guidance = getBaseWorkerGuidance();
    expect(guidance).toContain("A worker is not a session branch.");
    expect(guidance).toContain("/manager");
    expect(guidance).toContain("Manager instructions are durable inbox items");
    expect(guidance).toContain("Managers own completion approval and consolidation decisions.");
    expect(guidance).toContain("Prefer SDK-backed live workers");
    expect(guidance).toContain("Workers execute ticket-linked work");
    expect(guidance).toContain("ticket -> worker -> launch flow");
    expect(guidance).toContain("Tickets remain the live execution ledger.");
    expect(guidance).toContain("Do not invent unrestricted peer meshes in v1.");
  });

  it("renders cwd-specific worker memory guidance", () => {
    const prompt = buildWorkerSystemPrompt("/tmp/example-workspace");
    expect(prompt).toContain("Worker state is persisted in SQLite via pi-storage.");
    expect(prompt).toContain("compact supervision inputs");
  });
});
