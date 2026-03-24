import { describe, expect, it } from "vitest";
import { buildSpecSystemPrompt, getBaseSpecGuidance } from "../extensions/prompts/guidance.js";

describe("spec prompt guidance", () => {
  it("loads durable spec doctrine from the packaged guidance file", () => {
    const guidance = getBaseSpecGuidance();

    expect(guidance).toContain(
      "Specifications are declarative, implementation-decoupled descriptions of desired program behavior.",
    );
    expect(guidance).toContain(
      "Plans turn accepted behavior into implementation strategy and linked execution work. Tickets carry the concrete execution record for that work.",
    );
    expect(guidance).toContain("Specs must be detail-first artifacts, not skeletal placeholders.");
    expect(guidance).toContain("self-contained contracts");
    expect(guidance).toContain(
      "an implementer who did not author the spec can still understand what behavior must be true and why",
    );
    expect(guidance).toContain(
      "problem framing, desired outcomes, rationale, assumptions, constraints, scope boundaries",
    );
    expect(guidance).toContain("Reject blurbs that merely name the capability.");
    expect(guidance).toContain(
      "Title specs around the behavior or capability being specified, not around the implementation delta.",
    );
    expect(guidance).toContain(
      "Prefer `Dark theme support` or `Offline draft recovery` over `Add dark mode` or `Implement draft restore`.",
    );
    expect(guidance).toContain("inspect constitutional memory before locking the spec");
    expect(guidance).toContain("inspect initiative memory before opening or extending a spec");
    expect(guidance).toContain("durable project-policy layer above initiatives");
    expect(guidance).toContain("inspect existing specs and canonical capabilities before creating a new spec");
    expect(guidance).toContain(
      "write proposal, clarifications, design notes, capabilities, and acceptance so the spec captures substantial bounded detail rather than a thin summary, with behavior-first language that stays valid even as implementation evolves",
    );
    expect(guidance).toContain("use the `specify` step to record capabilities and design notes");
    expect(guidance).toContain("let plans, not specs, own ticket linkage and execution sequencing");
    expect(guidance).toContain("create or update a plan so execution strategy stays durable");
    expect(guidance).toContain("finalize the spec before turning it into plans and tickets");
    expect(guidance).toContain(
      "treat specs as the durable behavior contract, plans as the durable implementation-strategy bridge into linked tickets",
    );
    expect(guidance).toContain("docs as the post-completion explanatory layer");
    expect(guidance).toContain("update documentation memory after implementation is complete");
  });

  it("builds a system prompt that preserves base doctrine and workspace-specific spec root", () => {
    const cwd = "/tmp/pi-specs-guidance";
    const prompt = buildSpecSystemPrompt(cwd);

    expect(prompt.startsWith(getBaseSpecGuidance())).toBe(true);
    expect(prompt).toContain("Specification state is persisted in SQLite via pi-storage.");
    expect(prompt).toContain(
      "Prefer spec tools before implementation on non-trivial feature work, and use plans to translate accepted behavior into ticketed execution.",
    );
    expect(prompt).toContain(
      "Specifications are declarative, implementation-decoupled descriptions of desired program behavior.",
    );
    expect(prompt).toContain("Specs must be detail-first artifacts, not skeletal placeholders.");
  });
});
