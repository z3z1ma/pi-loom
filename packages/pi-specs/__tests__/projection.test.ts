import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createResearchStore } from "../../pi-research/extensions/domain/store.js";
import { createTicketStore } from "../../pi-ticketing/extensions/domain/store.js";
import { projectSpecTickets } from "../extensions/domain/projection.js";
import { createSpecStore } from "../extensions/domain/store.js";

describe("spec to ticket projection", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "pi-specs-projection-"));
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(workspace, { recursive: true, force: true });
  });

  it("projects finalized specs into deterministic tickets with explicit provenance", () => {
    const researchStore = createResearchStore(workspace);
    const specStore = createSpecStore(workspace);
    const ticketStore = createTicketStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T11:00:00.000Z"));
    researchStore.createResearch({ title: "Evaluate theme architecture" });
    specStore.createChange({ title: "Add dark mode", summary: "Support a dark theme." });
    const planned = specStore.updatePlan("add-dark-mode", {
      designNotes: "Use CSS variables and persistence.",
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

    vi.setSystemTime(new Date("2026-03-15T11:05:00.000Z"));
    const [reqToggle, reqPersist] = planned.state.requirements.map((requirement) => requirement.id);
    specStore.updateTasks("add-dark-mode", {
      tasks: [
        {
          title: "Build theme foundation",
          summary: "Add CSS variables and theme state.",
          requirements: [reqToggle],
        },
        {
          title: "Persist theme choice",
          summary: "Write the selected theme to durable storage.",
          requirements: [reqPersist],
          deps: ["task-001"],
        },
      ],
    });
    specStore.setInitiativeIds("add-dark-mode", ["platform-modernization"]);
    researchStore.linkSpec("evaluate-theme-architecture", "add-dark-mode");
    specStore.finalizeChange("add-dark-mode");

    const firstProjection = projectSpecTickets(workspace, "add-dark-mode");
    expect(firstProjection.projection?.tickets).toHaveLength(2);
    expect(existsSync(join(workspace, ".loom", "specs", "changes", "add-dark-mode", "ticket-projection.json"))).toBe(
      true,
    );

    const tickets = ticketStore.listTickets();
    expect(tickets).toHaveLength(2);
    const foundationTicket = ticketStore.readTicket(firstProjection.projection?.tickets[0]?.ticketId ?? "t-0001");
    const persistTicket = ticketStore.readTicket(firstProjection.projection?.tickets[1]?.ticketId ?? "t-0002");

    expect(foundationTicket.ticket.frontmatter["spec-change"]).toBe("add-dark-mode");
    expect(foundationTicket.ticket.frontmatter["initiative-ids"]).toEqual(["platform-modernization"]);
    expect(foundationTicket.ticket.frontmatter["research-ids"]).toEqual(["evaluate-theme-architecture"]);
    expect(foundationTicket.ticket.frontmatter["spec-capabilities"]).toEqual(["theme-toggling"]);
    expect(foundationTicket.ticket.frontmatter["spec-requirements"]).toEqual([reqToggle]);
    expect(firstProjection.state.researchIds).toEqual(["evaluate-theme-architecture"]);
    expect(firstProjection.summary.researchIds).toEqual(["evaluate-theme-architecture"]);
    expect(persistTicket.summary.deps).toEqual([foundationTicket.summary.id]);

    const secondProjection = projectSpecTickets(workspace, "add-dark-mode");
    expect(secondProjection.projection?.tickets.map((entry) => entry.ticketId)).toEqual(
      firstProjection.projection?.tickets.map((entry) => entry.ticketId),
    );
    expect(ticketStore.listTickets()).toHaveLength(2);

    const projectionFile = readFileSync(
      join(workspace, ".loom", "specs", "changes", "add-dark-mode", "ticket-projection.json"),
      "utf-8",
    );
    expect(projectionFile).toContain('"mode": "refresh"');
  });

  it("refreshes projected tickets when capability details change after reprojection", () => {
    const specStore = createSpecStore(workspace);
    const ticketStore = createTicketStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));
    specStore.createChange({ title: "Add dark mode", summary: "Support a dark theme." });
    const planned = specStore.updatePlan("add-dark-mode", {
      designNotes: "Use CSS variables and persistence.",
      capabilities: [
        {
          id: "theme-toggling",
          title: "Theme toggling",
          summary: "Allow switching themes.",
          requirements: ["Users can toggle dark mode."],
          acceptance: ["Theme changes immediately."],
          scenarios: ["User toggles the theme from settings."],
        },
      ],
    });
    const firstRequirement = planned.state.requirements[0];
    expect(firstRequirement).toBeDefined();

    vi.setSystemTime(new Date("2026-03-15T12:05:00.000Z"));
    specStore.updateTasks("add-dark-mode", {
      tasks: [
        {
          title: "Build theme foundation",
          summary: "Add CSS variables and theme state.",
          requirements: [firstRequirement?.id ?? "missing-requirement"],
        },
      ],
    });
    specStore.finalizeChange("add-dark-mode");

    const firstProjection = projectSpecTickets(workspace, "add-dark-mode");
    const projectedTicketId = firstProjection.projection?.tickets[0]?.ticketId;
    expect(projectedTicketId).toBeTruthy();
    expect(ticketStore.readTicket(projectedTicketId ?? "t-0001").ticket.body.context).toContain("Theme toggling");

    vi.setSystemTime(new Date("2026-03-15T12:10:00.000Z"));
    specStore.updatePlan("add-dark-mode", {
      capabilities: [
        {
          id: "theme-toggling",
          title: "Theme switching",
          summary: "Allow switching themes.",
          requirements: ["Users can toggle dark mode."],
          acceptance: ["Theme changes immediately."],
          scenarios: ["User toggles the theme from settings."],
        },
      ],
    });
    specStore.finalizeChange("add-dark-mode");

    projectSpecTickets(workspace, "add-dark-mode");
    expect(ticketStore.readTicket(projectedTicketId ?? "t-0001").ticket.body.context).toContain("Theme switching");
  });
});
