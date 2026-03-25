import type { ConstitutionalOverview, ConstitutionalState, RoadmapItemHorizon, RoadmapItemStatus } from "./models.js";

function zeroCounts<T extends string>(values: readonly T[]): Record<T, number> {
  return Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>;
}

const ROADMAP_STATUSES: readonly RoadmapItemStatus[] = ["candidate", "active", "paused", "completed", "superseded"];
const ROADMAP_HORIZONS: readonly RoadmapItemHorizon[] = ["now", "next", "later"];

export function buildConstitutionalOverview(state: ConstitutionalState): ConstitutionalOverview {
  const byStatus = zeroCounts(ROADMAP_STATUSES);
  const byHorizon = zeroCounts(ROADMAP_HORIZONS);
  for (const item of state.roadmapItems) {
    byStatus[item.status] += 1;
    byHorizon[item.horizon] += 1;
  }
  return {
    project: {
      projectId: state.projectId,
      title: state.title,
      updatedAt: state.updatedAt,
      strategicDirectionSummary: state.strategicDirectionSummary,
      currentFocus: [...state.currentFocus],
    },
    completeness: { ...state.completeness },
    openConstitutionQuestions: [...state.openConstitutionQuestions],
    principles: state.principles.map((entry) => ({ id: entry.id, title: entry.title })),
    constraints: state.constraints.map((entry) => ({ id: entry.id, title: entry.title })),
    roadmap: {
      total: state.roadmapItems.length,
      byStatus,
      byHorizon,
      activeItemIds: state.roadmapItems.filter((item) => item.status === "active").map((item) => item.id),
      items: state.roadmapItems.map((item) => ({ ...item })),
    },
    linkedWork: {
      initiativeIds: [...state.initiativeIds],
      researchIds: [...state.researchIds],
      specChangeIds: [...state.specChangeIds],
    },
  };
}
