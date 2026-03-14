import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSpecSystemPrompt, getBaseSpecGuidance } from "../extensions/prompts/guidance.js";

describe("spec prompt guidance", () => {
  it("loads durable spec doctrine from the packaged guidance file", () => {
    const guidance = getBaseSpecGuidance();

    expect(guidance).toContain("Specifications bridge research and execution.");
    expect(guidance).toContain("Specs must be detail-first artifacts, not skeletal placeholders.");
    expect(guidance).toContain("self-contained contracts");
    expect(guidance).toContain(
      "an implementer who did not author the spec can still understand what must be true and why",
    );
    expect(guidance).toContain(
      "problem framing, desired outcomes, rationale, assumptions, constraints, scope boundaries",
    );
    expect(guidance).toContain("Reject blurbs that merely name the change.");
    expect(guidance).toContain("inspect constitutional memory before locking the spec");
    expect(guidance).toContain("inspect initiative memory before opening or extending a spec");
    expect(guidance).toContain("durable project-policy layer above initiatives");
    expect(guidance).toContain("inspect existing spec changes and canonical capabilities before creating a new change");
    expect(guidance).toContain(
      "write proposal, clarifications, design notes, capabilities, and acceptance so the spec captures substantial bounded detail",
    );
    expect(guidance).toContain(
      "project tickets only after the spec captures enough detail to serve as the durable contract",
    );
    expect(guidance).toContain("create or update a plan so execution strategy stays durable");
    expect(guidance).toContain("finalize the spec before projecting tickets from it");
    expect(guidance).toContain("plans as the durable execution-strategy bridge into linked tickets");
    expect(guidance).toContain("docs as the post-completion explanatory layer");
    expect(guidance).toContain("update documentation memory after implementation is complete");
  });

  it("builds a system prompt that preserves base doctrine and workspace-specific spec root", () => {
    const cwd = "/tmp/pi-specs-guidance";
    const prompt = buildSpecSystemPrompt(cwd);

    expect(prompt.startsWith(getBaseSpecGuidance())).toBe(true);
    expect(prompt).toContain(`Workspace spec memory root: ${join(cwd, ".loom", "specs")}`);
    expect(prompt).toContain("Prefer spec tools before direct ticket generation for non-trivial feature work.");
    expect(prompt).toContain("Specs must be detail-first artifacts, not skeletal placeholders.");
  });
});
