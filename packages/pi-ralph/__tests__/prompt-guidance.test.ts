import { readFileSync } from "node:fs";
import { join } from "node:path";
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
    expect(guidance).toContain("reject shallow run updates");
    expect(guidance).toContain("resume paused or review-gated runs from durable state instead of chat residue");
    expect(guidance).toContain("Ralph orchestrates over those artifacts; it does not replace them");
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

    expect(toolSource).toContain(
      "Persist detailed Ralph iteration state, verifier evidence, critique links, blockers, and policy decisions durably",
    );
    expect(toolSource).toContain("Do not write shallow status blurbs; each update should leave the run resume-ready");
    expect(toolSource).toContain(
      "Launch only after the run packet reflects the latest objective framing, verifier evidence, critique outcomes, blockers, and decision state.",
    );
    expect(toolSource).toContain(
      "Resume only after required critique or verifier artifacts are linked into the run and the packet explains the latest blockers, rationale, and next-step expectations.",
    );
  });
});
