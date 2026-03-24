import { describe, expect, it } from "vitest";
import { buildTicketingSystemPrompt, getBaseTicketingGuidance } from "../extensions/prompts/guidance.js";

describe("ticketing prompt guidance", () => {
  it("loads durable ticketing doctrine from the packaged guidance file", () => {
    const guidance = getBaseTicketingGuidance();

    expect(guidance).toContain("durable local ticket ledger");
    expect(guidance).toContain("Ticketing is the default execution ledger for non-trivial work.");
    expect(guidance).toContain("fundamental unit of executable work in Loom");
    expect(guidance).toContain(
      "a capable newcomer can understand why the work exists, what generally needs to happen, and what evidence means it is done",
    );
    expect(guidance).toContain(
      "Treat each ticket body as a high-quality execution record and a complete unit of work, not a blurb.",
    );
    expect(guidance).toContain("problem framing, why this work matters now, relevant assumptions and constraints");
    expect(guidance).toContain("concrete acceptance criteria");
    expect(guidance).toContain(
      "Keep tickets detailed at the execution layer without duplicating a neighboring layer's live state.",
    );
    expect(guidance).toContain("inspect initiative memory before relying on tickets alone");
    expect(guidance).toContain("inspect constitutional memory before acting");
    expect(guidance).toContain(
      "settle the intended behavior in the specification first and then create or update a plan before opening execution tickets",
    );
    expect(guidance).toContain("inspect or create a plan so execution sequencing");
    expect(guidance).toContain("linked initiative, specification, or plan context");
    expect(guidance).toContain("inspect existing tickets before creating duplicates");
    expect(guidance).toContain("detailed enough to survive handoff as the fundamental quantum of work");
    expect(guidance).toContain("a newcomer can tell why the work exists, what to do next, and what proves completion");
    expect(guidance).toContain("prefer durable specifics over vague blurbs");
    expect(guidance).toContain("constitutional memory as the durable project-policy layer");
    expect(guidance).toContain("plans as the durable execution-strategy layer");
    expect(guidance).toContain(
      "treat tickets as both the durable source of live execution truth and the complete self-contained definition of each unit of work",
    );
    expect(guidance).toContain("docs as the post-completion explanatory layer");
    expect(guidance).toContain("update documentation memory so high-level docs stay truthful");
  });

  it("builds a system prompt that preserves the base doctrine and workspace-specific ledger root", () => {
    const cwd = "/tmp/pi-ticketing-guidance";
    const prompt = buildTicketingSystemPrompt(cwd);

    expect(prompt.startsWith(getBaseTicketingGuidance())).toBe(true);
    expect(prompt).toContain("Ticket state is persisted in SQLite via pi-storage.");
    expect(prompt).toContain(
      "Prefer ticket tools for live work state and plan tools for durable multi-ticket execution strategy.",
    );
    expect(prompt).toContain(
      "Treat each ticket body as a high-quality execution record and a complete unit of work, not a blurb.",
    );
  });
});
