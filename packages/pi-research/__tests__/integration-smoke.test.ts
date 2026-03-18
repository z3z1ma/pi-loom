import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitiativeStore } from "../../pi-initiatives/extensions/domain/store.js";
import { createSpecStore } from "../../pi-specs/extensions/domain/store.js";
import { ensureSpecTickets } from "../../pi-specs/extensions/domain/ticket-sync.js";
import { createTicketStore } from "../../pi-ticketing/extensions/domain/store.js";
import { createResearchStore } from "../extensions/domain/store.js";

describe("research integration smoke", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "pi-research-smoke-"));
    process.env.PI_LOOM_ROOT = join(workspace, ".pi-loom-test");
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.PI_LOOM_ROOT;
    rmSync(workspace, { recursive: true, force: true });
  });

  it("preserves research provenance from discovery through initiative, spec, and linked tickets", async () => {
    const researchStore = createResearchStore(workspace);
    const initiativeStore = createInitiativeStore(workspace);
    const specStore = createSpecStore(workspace);
    const ticketStore = createTicketStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T14:00:00.000Z"));
    const research = await researchStore.createResearch({
      title: "Evaluate theme architecture",
      question: "Should theme state move into a shared service?",
      objective: "Decide the theme-state boundary before implementation.",
      openQuestions: ["How should SSR hydration work?"],
      keywords: ["theme", "architecture"],
    });
    await researchStore.recordHypothesis(research.state.researchId, {
      statement: "A shared service reduces duplicated persistence logic.",
      evidence: ["Storage reads are duplicated in multiple call sites."],
      results: ["Prototype collapses persistence into one module."],
      status: "supported",
      confidence: "high",
    });
    await researchStore.recordArtifact(research.state.researchId, {
      kind: "source",
      title: "Theme architecture notes",
      summary: "Survey of current ownership and persistence.",
      body: "Prototype and source review both point toward a shared service boundary.",
      sourceUri: "https://example.com/theme-notes",
      linkedHypothesisIds: ["hyp-001"],
    });

    await initiativeStore.createInitiative({
      title: "Theme modernization",
      objective: "Modernize theme architecture across the product.",
    });
    await researchStore.linkInitiative(research.state.researchId, "theme-modernization");

    await specStore.createChange({ title: "Add dark mode", summary: "Support a dark theme." });
    await researchStore.linkSpec(research.state.researchId, "add-dark-mode");
    const planned = await specStore.updatePlan("add-dark-mode", {
      designNotes: "Use a shared theme service and persistent storage adapter.",
      capabilities: [
        {
          title: "Theme toggling",
          summary: "Allow switching themes.",
          requirements: ["Users can toggle dark mode.", "The theme preference persists."],
          acceptance: ["Theme changes immediately."],
          scenarios: ["User toggles the theme from settings."],
        },
      ],
    });
    const [reqToggle, reqPersist] = planned.state.requirements.map((requirement) => requirement.id);
    await specStore.updateTasks("add-dark-mode", {
      tasks: [
        {
          title: "Build theme foundation",
          summary: "Add shared service and theme state.",
          requirements: [reqToggle],
        },
        {
          title: "Persist theme choice",
          summary: "Store the selected theme durably.",
          requirements: [reqPersist],
          deps: ["task-001"],
        },
      ],
    });
    await specStore.finalizeChange("add-dark-mode");

    const ensured = await ensureSpecTickets(workspace, "add-dark-mode");
    const linkedTickets = ensured.linkedTickets?.links ?? [];
    const firstTicket = await ticketStore.readTicketAsync(linkedTickets[0]?.ticketId ?? "t-0001");
    const secondTicket = await ticketStore.readTicketAsync(linkedTickets[1]?.ticketId ?? "t-0002");
    await researchStore.linkTicket(research.state.researchId, firstTicket.summary.id);

    const refreshedResearch = await researchStore.readResearch(research.state.researchId);
    const refreshedInitiative = await initiativeStore.readInitiative("theme-modernization");
    const refreshedSpec = await specStore.readChange("add-dark-mode");
    const refreshedTicket = await ticketStore.readTicketAsync(firstTicket.summary.id);

    expect(refreshedResearch.dashboard).toMatchObject({
      linkedInitiatives: { total: 1, items: [expect.objectContaining({ id: "theme-modernization" })] },
      linkedSpecs: { total: 1, items: [expect.objectContaining({ id: "add-dark-mode" })] },
      linkedTickets: { total: 1 },
      hypotheses: { counts: { supported: 1 } },
      artifacts: { counts: { source: 1 } },
    });
    expect(refreshedResearch.map.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relation: "links_initiative", to: "initiative:theme-modernization" }),
        expect.objectContaining({ relation: "links_spec", to: "spec:add-dark-mode" }),
        expect.objectContaining({ relation: "links_ticket", to: `ticket:${firstTicket.summary.id}` }),
        expect.objectContaining({ relation: "supports_hypothesis", to: "hyp-001" }),
      ]),
    );

    expect(refreshedInitiative.state.researchIds).toEqual([research.state.researchId]);
    expect(refreshedSpec.state.researchIds).toEqual([research.state.researchId]);
    expect(refreshedSpec.summary.researchIds).toEqual([research.state.researchId]);
    expect(refreshedTicket.ticket.frontmatter["research-ids"]).toEqual([research.state.researchId]);
    expect(refreshedTicket.summary.researchIds).toEqual([research.state.researchId]);
    expect(secondTicket.ticket.frontmatter["research-ids"]).toEqual([research.state.researchId]);
    expect(linkedTickets).toHaveLength(2);
  }, 60000);
});
