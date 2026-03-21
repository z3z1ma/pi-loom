import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildRalphSystemPrompt, getBaseRalphGuidance } from "../extensions/prompts/guidance.js";

describe("ralph prompt guidance", () => {
  it("loads durable Ralph doctrine from the packaged guidance file", () => {
    const guidance = getBaseRalphGuidance();

    expect(guidance).toContain("Ralph is a first-class Loom orchestration layer.");
    expect(guidance).toContain("durable loop over planning, execution, critique, and revision");
    expect(guidance).toContain("concrete problem framing that explains why the run exists now");
    expect(guidance).toContain("verifier evidence, critique verdicts, acceptance signals, and unresolved blockers");
    expect(guidance).toContain(
      "decision rationale covering why the run continued, paused, escalated, stopped, or changed focus",
    );
    expect(guidance).toContain("assumptions, scope boundaries, risks, dependencies, edge cases, and open questions");
    expect(guidance).toContain("fresh-context launch descriptors and bounded packets");
    expect(guidance).toContain("long transcripts as a liability");
    expect(guidance).toContain("execute one bounded iteration at a time");
    expect(guidance).toContain("reject shallow run updates");
    expect(guidance).toContain(
      "fresh-context launch descriptors and bounded packets that are detailed enough for a later caller to resume truthfully without chat residue",
    );
    expect(guidance).toContain("Ralph remains directly usable on its own");
    expect(guidance).toContain("Ralph orchestrates over those artifacts as the bounded loop layer");
  });

  it("builds a system prompt that preserves base doctrine and workspace Ralph root", () => {
    const cwd = "/tmp/pi-ralph-guidance";
    const prompt = buildRalphSystemPrompt(cwd);

    expect(prompt.startsWith(getBaseRalphGuidance())).toBe(true);
    expect(prompt).toContain("Ralph state is persisted in SQLite via pi-storage.");
    expect(prompt).toContain(
      "Prefer durable Ralph packets and explicit policy decisions over ad hoc long-running transcripts.",
    );
  });

  it("keeps Ralph tool prompt guidance aligned with the detail-first doctrine", () => {
    const toolSource = readFileSync(new URL("../extensions/tools/ralph.ts", import.meta.url), "utf8");

    expect(toolSource).toContain("primary Ralph loop tool");
    expect(toolSource).toContain("prompt plus current conversation context");
    expect(toolSource).toContain("safe way for a fresh Ralph worker session to commit its bounded iteration outcome");
    expect(toolSource).toContain("Use one Ralph checkpoint call per bounded iteration");
    expect(toolSource).toContain("background: true");
    expect(toolSource).toContain("ralph_job_wait");
  });
});
