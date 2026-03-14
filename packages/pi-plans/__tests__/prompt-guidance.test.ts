import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPlanSystemPrompt, getBasePlanGuidance } from "../extensions/prompts/guidance.js";

describe("plan prompt guidance", () => {
  it("loads durable planning doctrine from the packaged guidance file", () => {
    const guidance = getBasePlanGuidance();

    expect(guidance).toContain("Plans are a first-class Loom memory layer.");
    expect(guidance).toContain("bounded, high-context execution-strategy artifact");
    expect(guidance).toContain(
      "compile the relevant constitutional, research, initiative, spec, ticket, critique, and documentation context",
    );
    expect(guidance).toContain("detailed `plan.md` artifact that explains sequencing, workstreams, rationale");
    expect(guidance).toContain("a later worker can understand why this rollout is structured the way it is");
    expect(guidance).toContain(
      "tickets remain both the high-fidelity execution system of record and comprehensive, self-contained units of work",
    );
    expect(guidance).toContain(
      "use the ticket layer to create, refine, or link tickets explicitly. Plans wrap those tickets in broader execution context",
    );
  });

  it("builds a system prompt that preserves base doctrine and workspace plan root", () => {
    const cwd = "/tmp/pi-plans-guidance";
    const prompt = buildPlanSystemPrompt(cwd);

    expect(prompt.startsWith(getBasePlanGuidance())).toBe(true);
    expect(prompt).toContain(`Workspace plan memory root: ${join(cwd, ".loom", "plans")}`);
    expect(prompt).toContain(
      "Prefer plan packets for durable execution strategy and ticket tools for the live execution state.",
    );
  });
});
