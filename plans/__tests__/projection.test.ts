import { describe, expect, it } from "vitest";
import {
  buildPlanProjection,
  createPlanProjectionManifest,
  reconcilePlanProjection,
  resolvePlanProjectionRelativePath,
  PLAN_PROJECTION_EDITABLE_SECTIONS,
} from "../domain/projection.js";
import type { PlanReadResult, PlanState } from "../domain/models.js";

function samplePlanState(overrides: Partial<PlanState> = {}): PlanState {
  return {
    planId: overrides.planId ?? "workspace-projections-rollout-plan",
    title: overrides.title ?? "Workspace projections rollout plan",
    status: overrides.status ?? "active",
    createdAt: overrides.createdAt ?? "2026-03-18T08:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-03-21T10:00:00.000Z",
    summary: overrides.summary ?? "Ship repository-visible projections with low churn.",
    purpose: overrides.purpose ?? "Make canonical Loom records inspectable from the repository.",
    contextAndOrientation:
      overrides.contextAndOrientation ??
      "The storage substrate exists and the remaining work is family-specific rendering.",
    milestones: overrides.milestones ?? "Land renderers, then add reconcile tests.",
    planOfWork: overrides.planOfWork ?? "Implement area-owned adapters on top of storage/projections.ts.",
    concreteSteps:
      overrides.concreteSteps ??
      "Edit research/domain/projection.ts, plans/domain/projection.ts, and docs/domain/projection.ts.",
    validation: overrides.validation ?? "Run focused Vitest suites for the three family adapters.",
    idempotenceAndRecovery:
      overrides.idempotenceAndRecovery ??
      "Re-running the focused tests is safe; re-export projections after failed reconcile attempts.",
    artifactsAndNotes: overrides.artifactsAndNotes ?? "Capture manifest expectations in the tests.",
    interfacesAndDependencies:
      overrides.interfacesAndDependencies ??
      "Keep family adapters decoupled from operator surfaces until the reconcile engine lands.",
    risksAndQuestions: overrides.risksAndQuestions ?? "Do not let editable markdown rewrite linked ticket truth.",
    outcomesAndRetrospective: overrides.outcomesAndRetrospective ?? "No retrospective yet.",
    scopePaths: overrides.scopePaths ?? [],
    sourceTarget: overrides.sourceTarget ?? { kind: "spec", ref: "workspace-projections-for-canonical-loom-records" },
    contextRefs: overrides.contextRefs ?? {
      roadmapItemIds: [],
      initiativeIds: [],
      researchIds: ["human-editable-workspace-projections-for-canonical-loom-records"],
      specChangeIds: ["workspace-projections-for-canonical-loom-records"],
      ticketIds: ["pl-0117"],
      critiqueIds: [],
      docIds: [],
    },
    linkedTickets: overrides.linkedTickets ?? [{ ticketId: "pl-0117", role: "implementation", order: 1 }],
    progress: overrides.progress ?? [
      {
        timestamp: "2026-03-21T10:00:00.000Z",
        status: "pending",
        text: "Implement research, plan, and docs family adapters.",
      },
    ],
    discoveries: overrides.discoveries ?? [
      { note: "Plan paths must stay anchored to creation date.", evidence: "Ticket acceptance criteria" },
    ],
    decisions: overrides.decisions ?? [
      {
        decision: "Keep linked ticket status read-only in projections.",
        rationale: "Tickets remain the live execution ledger.",
        date: "2026-03-21",
        author: "pi",
      },
    ],
    revisionNotes: overrides.revisionNotes ?? [
      {
        timestamp: "2026-03-21T10:00:00.000Z",
        change: "Seeded workspace projection rollout plan.",
        reason: "Need a durable execution narrative.",
      },
    ],
    packetSummary: overrides.packetSummary ?? "Workspace projection rollout packet.",
  };
}

function samplePlan(overrides: Partial<PlanState> = {}): PlanReadResult {
  const state = samplePlanState(overrides);
  return {
    state,
    summary: {
      id: state.planId,
      title: state.title,
      status: state.status,
      updatedAt: state.updatedAt,
      repository: null,
      sourceKind: state.sourceTarget.kind,
      sourceRef: state.sourceTarget.ref,
      linkedTicketCount: state.linkedTickets.length,
      summary: state.summary,
      ref: `plan:${state.planId}`,
    },
    packet: "packet",
    plan: "plan",
    overview: {
      plan: {
        id: state.planId,
        title: state.title,
        status: state.status,
        updatedAt: state.updatedAt,
        repository: null,
        sourceKind: state.sourceTarget.kind,
        sourceRef: state.sourceTarget.ref,
        linkedTicketCount: state.linkedTickets.length,
        summary: state.summary,
        ref: `plan:${state.planId}`,
      },
      packetRef: `plan:${state.planId}:packet`,
      planRef: `plan:${state.planId}:document`,
      sourceTarget: state.sourceTarget,
      contextRefs: state.contextRefs,
      scopePaths: state.scopePaths,
      linkedTickets: [
        {
          ticketId: "pl-0117",
          role: "implementation",
          order: 1,
          status: "in_progress",
          title: "Project research, plans, and docs into .loom",
          ref: "ticket:pl-0117",
        },
      ],
      counts: { tickets: 1, byStatus: { in_progress: 1 } },
    },
  } as PlanReadResult;
}

describe("plan workspace projections", () => {
  it("renders stable created-date paths and shared-manifest entries", () => {
    const original = samplePlan();
    const later = samplePlan({ planId: "alpha-plan", title: "Alpha plan", updatedAt: "2026-04-01T00:00:00.000Z" });

    const originalProjection = buildPlanProjection(original);
    const updatedProjection = buildPlanProjection(samplePlan({ updatedAt: "2026-04-22T00:00:00.000Z" }));
    const manifest = createPlanProjectionManifest([original, later]);

    expect(resolvePlanProjectionRelativePath(original.state)).toBe("2026/workspace-projections-rollout-plan.md");
    expect(updatedProjection.relativePath).toBe(originalProjection.relativePath);
    expect(originalProjection.manifestEntry.editability).toEqual({
      mode: "sections",
      editableSections: [...PLAN_PROJECTION_EDITABLE_SECTIONS].sort((left, right) => left.localeCompare(right)),
    });
    expect(originalProjection.renderedContent).toContain("## Projection Context");
    expect(originalProjection.renderedContent).toContain("Generated snapshot. Reconcile ignores edits in this section");
    expect(manifest.entries.map((entry) => entry.relativePath)).toEqual([
      "2026/alpha-plan.md",
      "2026/workspace-projections-rollout-plan.md",
    ]);
  });

  it("reconciles only approved plan sections and ignores generated ticket/history snapshots", () => {
    const current = samplePlan();
    const rendered = buildPlanProjection(current).renderedContent;
    const edited = rendered
      .replace("# Workspace projections rollout plan", "# Workspace projections rollout implementation")
      .replace(
        "Make canonical Loom records inspectable from the repository.",
        "Make canonical Loom records inspectable from the repository without letting projections become a second system of record.",
      )
      .replace(
        "## Linked Tickets\n\n_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._\n\n- pl-0117 [in_progress] Project research, plans, and docs into .loom — implementation",
        "## Linked Tickets\n\n- totally rewritten local notes",
      );

    const update = reconcilePlanProjection(current, edited);

    expect(update).toMatchObject({
      title: "Workspace projections rollout implementation",
      purpose:
        "Make canonical Loom records inspectable from the repository without letting projections become a second system of record.",
      planOfWork: "Implement area-owned adapters on top of storage/projections.ts.",
    });
    expect(update).not.toHaveProperty("linkedTickets");
    expect(update).not.toHaveProperty("progress");
    expect(update).not.toHaveProperty("revisionNotes");
  });
});
