import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCritiqueSystemPrompt, getBaseCritiqueGuidance } from "../extensions/prompts/guidance.js";

describe("critique prompt guidance", () => {
  it("loads durable critique doctrine from the packaged guidance file", () => {
    const guidance = getBaseCritiqueGuidance();

    expect(guidance).toContain("Critique is a first-class Loom memory layer.");
    expect(guidance).toContain("fresh reviewer context");
    expect(guidance).toContain("Critique is distinct from execution and distinct from Ralph looping");
    expect(guidance).toContain("persist concrete findings and follow-up tickets");
    expect(guidance).toContain(
      "Durable critique artifacts must be self-contained and detail-first at the critique layer",
    );
    expect(guidance).toContain(
      "the concrete evidence already gathered, including changed files, commands, tests, and relevant artifacts",
    );
    expect(guidance).toContain(
      "the rationale, assumptions, dependencies, and constraints that shape whether the work is actually correct",
    );
    expect(guidance).toContain(
      "the likely failure modes, edge cases, risks, and what follow-up verification would falsify the current conclusion",
    );
    expect(guidance).toContain(
      "critique runs should explain the verdict with substantial evidence, reasoning, residual risk, and explicit verification status",
    );
    expect(guidance).toContain(
      "findings should capture the exact problem, why it matters, the evidence trail, affected scope, failure mode, and actionable next step",
    );
    expect(guidance).toContain(
      "record the open question and what evidence would resolve it instead of hiding uncertainty behind a verdict",
    );
    expect(guidance).toContain("allow a long timeout");
    expect(guidance).toContain("lands a durable `critique_run`");
    expect(guidance).toContain("linked constitutional, initiative, research, spec, plan, and ticket context");
    expect(guidance).toContain("review the plan layer when the execution strategy itself");
    expect(guidance).toContain(
      "documentation memory rather than trying to turn critique itself into the durable docs corpus",
    );
  });

  it("builds a system prompt that preserves base doctrine and workspace critique root", () => {
    const cwd = "/tmp/pi-critique-guidance";
    const prompt = buildCritiqueSystemPrompt(cwd);

    expect(prompt.startsWith(getBaseCritiqueGuidance())).toBe(true);
    expect(prompt).toContain("Critique state is persisted in SQLite via pi-storage.");
    expect(prompt).toContain("Prefer critique packets and durable findings over inline self-review.");
    expect(prompt).toContain("self-contained and detail-first at the critique layer");
  });
});
