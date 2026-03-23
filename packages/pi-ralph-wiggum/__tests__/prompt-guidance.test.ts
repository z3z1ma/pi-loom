import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildRalphSystemPrompt, getBaseRalphGuidance } from "../extensions/prompts/guidance.js";

describe("ralph prompt guidance", () => {
  it("loads durable Ralph doctrine from the packaged guidance file", () => {
    const guidance = getBaseRalphGuidance();

    expect(guidance).toContain("Ralph is a first-class Loom orchestration layer.");
    expect(guidance).toContain("durable managed loop over execution, critique, revision, and operator steering");
    expect(guidance).toContain("concrete problem framing that explains why the loop exists now");
    expect(guidance).toContain("verifier evidence, critique verdicts, acceptance signals, and unresolved blockers");
    expect(guidance).toContain(
      "decision rationale covering why the loop continued, paused, halted, completed, or changed focus",
    );
    expect(guidance).toContain("assumptions, scope boundaries, risks, dependencies, edge cases, and open questions");
    expect(guidance).toContain("durable steering, stop requests, and packet context");
    expect(guidance).toContain("long transcripts as a liability");
    expect(guidance).toContain("run one bounded iteration at a time");
    expect(guidance).toContain("reject shallow run updates");
    expect(guidance).toContain(
      "bind each Ralph run to one exact ticket and use a governing plan when one is supplied or inferable; inherit the governing spec from that plan when present",
    );
    expect(guidance).toContain("multiple managed Ralph loops may coexist in one workspace");
    expect(guidance).toContain("Ralph remains directly usable on its own");
    expect(guidance).toContain("Ralph orchestrates over those artifacts as the managed loop layer");
    expect(guidance).toContain(
      "use `ralph_run` with required `ticketRef` and optional `planRef` to create or resume the system-owned Ralph run",
    );
    expect(guidance).toContain("use `ralph_steer` to queue durable steering for the next iteration boundary");
    expect(guidance).toContain("use `ralph_stop` to request a clean stop for the managed loop");
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
      "one ticket under a governing plan should advance through bounded Ralph iterations with fresh context and durable review state",
    );
    expect(toolSource).toContain(
      "Background execution is well suited to parallel ticket delivery because distinct ticket-bound runs may proceed concurrently.",
    );
    expect(toolSource).toContain(
      "Use this tool from the fresh Ralph worker session that owns the launched iteration id",
    );
    expect(toolSource).toContain("Commit one complete iteration outcome at a time");
    expect(toolSource).toContain("Background execution is well suited to parallel ticket delivery");
    expect(toolSource).toContain("ralph_job_wait");
  });
});
