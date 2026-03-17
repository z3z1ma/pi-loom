import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createResearchStore } from "../../pi-research/extensions/domain/store.js";
import { createTicketStore } from "../../pi-ticketing/extensions/domain/store.js";
import { syncSpecTickets } from "../extensions/domain/ticket-sync.js";
import { createSpecStore } from "../extensions/domain/store.js";

describe("spec to ticket synchronization", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "pi-specs-projection-"));
    process.env.PI_LOOM_ROOT = join(workspace, ".pi-loom-test");
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.PI_LOOM_ROOT;
    rmSync(workspace, { recursive: true, force: true });
  });

  it("synchronizes finalized specs into deterministic tickets with explicit provenance", async () => {
    const researchStore = createResearchStore(workspace);
    const specStore = createSpecStore(workspace);
    const ticketStore = createTicketStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T11:00:00.000Z"));
    await researchStore.createResearch({ title: "Evaluate theme architecture" });
    await specStore.createChange({ title: "Add dark mode", summary: "Support a dark theme." });
    const planned = await specStore.updatePlan("add-dark-mode", {
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
    await specStore.updateTasks("add-dark-mode", {
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
    await specStore.setInitiativeIds("add-dark-mode", ["platform-modernization"]);
    await researchStore.linkSpec("evaluate-theme-architecture", "add-dark-mode");
    await specStore.finalizeChange("add-dark-mode");

    const firstSync = await syncSpecTickets(workspace, "add-dark-mode");
    expect(firstSync.ticketSync?.mode).toBe("initial");
    expect(firstSync.ticketSync?.links).toHaveLength(2);

    const tickets = await ticketStore.listTicketsAsync();
    expect(tickets).toHaveLength(2);
    const foundationTicket = await ticketStore.readTicketAsync(firstSync.ticketSync?.links[0]?.ticketId ?? "t-0001");
    const persistTicket = await ticketStore.readTicketAsync(firstSync.ticketSync?.links[1]?.ticketId ?? "t-0002");

    expect(foundationTicket.ticket.frontmatter["spec-change"]).toBe("add-dark-mode");
    expect(foundationTicket.ticket.frontmatter["initiative-ids"]).toEqual(["platform-modernization"]);
    expect(foundationTicket.ticket.frontmatter["research-ids"]).toEqual(["evaluate-theme-architecture"]);
    expect(foundationTicket.ticket.frontmatter["spec-capabilities"]).toEqual(["theme-toggling"]);
    expect(foundationTicket.ticket.frontmatter["spec-requirements"]).toEqual([reqToggle]);
    expect(firstSync.state.researchIds).toEqual(["evaluate-theme-architecture"]);
    expect(firstSync.summary.researchIds).toEqual(["evaluate-theme-architecture"]);
    expect(persistTicket.summary.deps).toEqual([foundationTicket.summary.id]);

    const secondSync = await syncSpecTickets(workspace, "add-dark-mode");
    expect(secondSync.ticketSync?.mode).toBe("refresh");
    expect(secondSync.ticketSync?.links.map((entry) => entry.ticketId)).toEqual(
      firstSync.ticketSync?.links.map((entry) => entry.ticketId),
    );
    await expect(ticketStore.listTicketsAsync()).resolves.toHaveLength(2);

    await expect(specStore.readChange("add-dark-mode")).resolves.toMatchObject({
      ticketSync: {
        mode: "refresh",
        links: [
          expect.objectContaining({ taskId: "task-001", ticketId: foundationTicket.summary.id }),
          expect.objectContaining({ taskId: "task-002", ticketId: persistTicket.summary.id }),
        ],
      },
    });
  }, 15000);

  it("refreshes synchronized tickets when capability details change after re-sync", async () => {
    const specStore = createSpecStore(workspace);
    const ticketStore = createTicketStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));
    await specStore.createChange({ title: "Add dark mode", summary: "Support a dark theme." });
    const planned = await specStore.updatePlan("add-dark-mode", {
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
    await specStore.updateTasks("add-dark-mode", {
      tasks: [
        {
          title: "Build theme foundation",
          summary: "Add CSS variables and theme state.",
          requirements: [firstRequirement?.id ?? "missing-requirement"],
        },
      ],
    });
    await specStore.finalizeChange("add-dark-mode");

    const firstSync = await syncSpecTickets(workspace, "add-dark-mode");
    const synchronizedTicketId = firstSync.ticketSync?.links[0]?.ticketId;
    expect(synchronizedTicketId).toBeTruthy();
    await expect(ticketStore.readTicketAsync(synchronizedTicketId ?? "t-0001")).resolves.toMatchObject({
      ticket: { body: { context: expect.stringContaining("Theme toggling") } },
    });

    vi.setSystemTime(new Date("2026-03-15T12:10:00.000Z"));
    await specStore.updatePlan("add-dark-mode", {
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
    await specStore.finalizeChange("add-dark-mode");

    const refreshed = await syncSpecTickets(workspace, "add-dark-mode");
    expect(refreshed.ticketSync?.mode).toBe("refresh");
    await expect(ticketStore.readTicketAsync(synchronizedTicketId ?? "t-0001")).resolves.toMatchObject({
      ticket: { body: { context: expect.stringContaining("Theme switching") } },
    });
  }, 30000);
});
