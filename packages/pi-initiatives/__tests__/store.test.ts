import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createResearchStore } from "../../pi-research/extensions/domain/store.js";
import { createSpecStore } from "../../pi-specs/extensions/domain/store.js";
import { findEntityByDisplayId } from "../../pi-storage/storage/entities.js";
import { openWorkspaceStorage } from "../../pi-storage/storage/workspace.js";
import { createTicketStore } from "../../pi-ticketing/extensions/domain/store.js";
import { createInitiativeStore } from "../extensions/domain/store.js";

describe("InitiativeStore durable memory", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "pi-initiatives-store-"));
    process.env.PI_LOOM_ROOT = join(workspace, ".pi-loom-test");
    process.env.PI_LOOM_ROOT = join(workspace, ".pi-loom-test");
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.PI_LOOM_ROOT;
    delete process.env.PI_LOOM_ROOT;
    rmSync(workspace, { recursive: true, force: true });
  });

  it("writes durable initiative artifacts, links multiple specs and tickets, and preserves archive state", async () => {
    const initiativeStore = createInitiativeStore(workspace);
    const researchStore = createResearchStore(workspace);
    const specStore = createSpecStore(workspace);
    const ticketStore = createTicketStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));
    await researchStore.createResearch({ title: "Investigate theme migration" });
    await specStore.createChange({ title: "Add dark mode", summary: "Support a dark theme." });
    await specStore.createChange({ title: "Modernize theming tokens", summary: "Replace legacy color literals." });
    const blocker = await ticketStore.createTicketAsync({ title: "Prepare token inventory" });
    const dependent = await ticketStore.createTicketAsync({
      title: "Apply token migration",
      deps: [blocker.summary.id],
    });

    const created = await initiativeStore.createInitiative({
      title: "Platform modernization",
      objective: "Coordinate the long-horizon modernization program.",
      outcomes: ["Shared theming strategy", "Stable migration sequencing"],
      scope: ["Theme system", "Token migration"],
      nonGoals: ["Visual redesign"],
      successMetrics: ["No legacy color literals remain"],
      risks: ["Migration may stall on unknown token consumers"],
      statusSummary: "Scoping and sequencing underway.",
      owners: ["platform"],
      tags: ["modernization", "ui"],
      specChangeIds: ["add-dark-mode", "modernize-theming-tokens"],
      ticketIds: [blocker.summary.id, dependent.summary.id],
      milestones: [
        {
          title: "Define migration path",
          description: "Lock the initial spec and ticket graph.",
          specChangeIds: ["add-dark-mode"],
          ticketIds: [dependent.summary.id],
        },
      ],
    });

    expect(created.state.initiativeId).toBe("platform-modernization");
    expect(created.summary.ref).toBe("initiative:platform-modernization");
    expect(created.dashboard.linkedSpecs.total).toBe(2);
    expect(created.dashboard.linkedTickets.total).toBe(2);
    expect(created.dashboard.linkedTickets.blocked).toBe(0);
    expect(created.dashboard.milestones[0]).toMatchObject({ health: "pending" });
    expect(created.state.researchIds).toEqual([]);
    expect((await specStore.readChange("add-dark-mode")).state.initiativeIds).toEqual(["platform-modernization"]);
    expect((await ticketStore.readTicketAsync(blocker.summary.id)).summary.initiativeIds).toEqual([
      "platform-modernization",
    ]);
    const { storage, identity } = await openWorkspaceStorage(workspace);
    const blockerEntity = await findEntityByDisplayId(storage, identity.space.id, "ticket", blocker.summary.id);
    const initiativeEntity = await findEntityByDisplayId(
      storage,
      identity.space.id,
      "initiative",
      created.state.initiativeId,
    );
    expect(blockerEntity).toBeTruthy();
    expect(initiativeEntity).toBeTruthy();
    expect(
      (await storage.listLinks(blockerEntity?.id ?? "missing")).filter(
        (link) => link.fromEntityId === blockerEntity?.id && link.toEntityId === initiativeEntity?.id,
      ),
    ).toEqual([expect.objectContaining({ kind: "belongs_to" })]);

    const linkedResearch = await researchStore.linkInitiative("investigate-theme-migration", "platform-modernization");
    expect(linkedResearch.state.initiativeIds).toEqual(["platform-modernization"]);
    const hydrated = await initiativeStore.readInitiative("platform-modernization");
    expect(hydrated.state.researchIds).toEqual(["investigate-theme-migration"]);
    expect(hydrated.summary.ref).toBe("initiative:platform-modernization");
    expect(hydrated.dashboard.linkedResearch.items).toMatchObject([
      {
        id: "investigate-theme-migration",
        ref: "research:investigate-theme-migration",
      },
    ]);
    expect(hydrated.dashboard).not.toHaveProperty("generatedAt");

    vi.setSystemTime(new Date("2026-03-15T12:10:00.000Z"));
    const updated = await initiativeStore.recordDecision(
      "platform-modernization",
      "Should dark mode land before token migration?",
      "Yes, so the migration can target the finalized theme contract.",
    );
    expect(updated.decisions).toHaveLength(1);

    vi.setSystemTime(new Date("2026-03-15T12:15:00.000Z"));
    const archived = await initiativeStore.archiveInitiative("platform-modernization");
    expect(archived.state.status).toBe("archived");
    expect(archived.state.archivedAt).toBe("2026-03-15T12:15:00.000Z");
    expect(archived.summary.ref).toBe("initiative:platform-modernization");
    expect((await initiativeStore.listInitiatives({ includeArchived: true }))[0]?.ref).toBe(
      "initiative:platform-modernization",
    );
    expect((await specStore.readChange("modernize-theming-tokens")).summary.initiativeIds).toEqual([
      "platform-modernization",
    ]);

    expect(hydrated.dashboard.linkedResearch.items[0]?.ref).toBe("research:investigate-theme-migration");
    expect(hydrated.dashboard).not.toHaveProperty("generatedAt");

    expect(archived.brief).toContain("## Objective");
    expect(archived.brief).toContain("Coordinate the long-horizon modernization program.");
    expect(archived.brief).toContain("## Milestones");
  }, 120000);

  it("awaits ticket membership synchronization before resolving ticket link mutations", async () => {
    const initiativeStore = createInitiativeStore(workspace);
    const ticketStore = createTicketStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T13:00:00.000Z"));
    const ticket = await ticketStore.createTicketAsync({ title: "Await linkage" });
    const initiative = await initiativeStore.createInitiative({ title: "Await sync" });

    const storeWithPrivateSync = initiativeStore as unknown as {
      syncTicketMembership: (initiativeId: string, previousIds: string[], nextIds: string[]) => Promise<void>;
    };
    const originalSync = storeWithPrivateSync.syncTicketMembership.bind(initiativeStore);

    let releaseLinkSync: (() => void) | undefined;
    storeWithPrivateSync.syncTicketMembership = vi.fn(async () => {
      await new Promise<void>((resolve) => {
        releaseLinkSync = resolve;
      });
    });

    let linkedSettled = false;
    const linkedPromise = initiativeStore
      .linkTicket(initiative.state.initiativeId, ticket.summary.id)
      .then((result) => {
        linkedSettled = true;
        return result;
      });

    await vi.waitFor(() => expect(storeWithPrivateSync.syncTicketMembership).toHaveBeenCalledTimes(1));
    expect(linkedSettled).toBe(false);
    releaseLinkSync?.();
    await linkedPromise;
    expect(linkedSettled).toBe(true);

    storeWithPrivateSync.syncTicketMembership = originalSync;

    let releaseUnlinkSync: (() => void) | undefined;
    storeWithPrivateSync.syncTicketMembership = vi.fn(async () => {
      await new Promise<void>((resolve) => {
        releaseUnlinkSync = resolve;
      });
    });

    let unlinkedSettled = false;
    const unlinkPromise = initiativeStore
      .unlinkTicket(initiative.state.initiativeId, ticket.summary.id)
      .then((result) => {
        unlinkedSettled = true;
        return result;
      });

    await vi.waitFor(() => expect(storeWithPrivateSync.syncTicketMembership).toHaveBeenCalledTimes(1));
    expect(unlinkedSettled).toBe(false);
    releaseUnlinkSync?.();
    await unlinkPromise;
    expect(unlinkedSettled).toBe(true);

    storeWithPrivateSync.syncTicketMembership = originalSync;
  }, 120000);

  it("rolls back staged initiative membership when create fails after backlink sync starts", async () => {
    const initiativeStore = createInitiativeStore(workspace);
    const ticketStore = createTicketStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T14:00:00.000Z"));
    const ticket = await ticketStore.createTicketAsync({ title: "Rollback ticket" });

    await expect(
      initiativeStore.createInitiative({
        title: "Broken initiative",
        ticketIds: [ticket.summary.id],
        specChangeIds: ["missing-spec"],
      }),
    ).rejects.toThrow("Unknown spec change: missing-spec");

    const { storage, identity } = await openWorkspaceStorage(workspace);
    expect(await findEntityByDisplayId(storage, identity.space.id, "initiative", "broken-initiative")).toBeNull();
    expect((await ticketStore.readTicketAsync(ticket.summary.id)).summary.initiativeIds).toEqual([]);
  });

  it("updates linked research ids through updateInitiative", async () => {
    const initiativeStore = createInitiativeStore(workspace);
    const researchStore = createResearchStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T15:00:00.000Z"));
    const initiative = await initiativeStore.createInitiative({ title: "Research updates" });
    const researchA = await researchStore.createResearch({ title: "First research" });
    const researchB = await researchStore.createResearch({ title: "Second research" });

    const updated = await initiativeStore.updateInitiative(initiative.state.initiativeId, {
      researchIds: [researchA.state.researchId, researchB.state.researchId],
    });

    expect(updated.state.researchIds).toEqual([researchA.state.researchId, researchB.state.researchId]);
  });
});
