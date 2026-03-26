import { readFileSync } from "node:fs";
import { parseMarkdownHeadingDocument, parseMarkdownSections } from "#storage/markdown-sections.js";
import {
  createWorkspaceProjectionDocument,
  createWorkspaceProjectionManifest,
  type WorkspaceProjectionDocument,
} from "#storage/projection-documents.js";
import {
  type LoomProjectionSelectionInput,
  normalizeProjectionSelection,
  projectionEntryMatchesSelection,
} from "#storage/projection-selection.js";
import {
  assessProjectionFileState,
  ensureProjectionWorkspace,
  type LoomProjectionManifest,
  type LoomProjectionWriteResult,
  readProjectionManifest,
  resolveProjectionFilePath,
  writeProjectionFile,
  writeProjectionManifest,
} from "#storage/projections.js";
import { renderPortableRepositoryPathList } from "#storage/repository-path.js";
import type { PlanOverviewTicket, PlanReadResult, PlanState, UpdatePlanInput } from "./models.js";
import {
  renderPlanDecisions,
  renderPlanDiscoveries,
  renderPlanProgress,
  renderPlanRevisionNotes,
  renderPlanTicketList,
} from "./render.js";
import { createPlanStore } from "./store.js";

const PLAN_FAMILY = "plans" as const;

export const PLAN_PROJECTION_EDITABLE_SECTIONS = [
  "Purpose / Big Picture",
  "Outcomes & Retrospective",
  "Context and Orientation",
  "Milestones",
  "Plan of Work",
  "Concrete Steps",
  "Validation and Acceptance",
  "Idempotence and Recovery",
  "Artifacts and Notes",
  "Interfaces and Dependencies",
  "Risks and Open Questions",
] as const;

const READ_ONLY_SECTION_NOTE =
  "_Generated snapshot. Reconcile ignores edits in this section so live ticket truth and append-only plan history remain canonical._";

function renderSection(title: string, body: string): string {
  return `## ${title}\n\n${body.trim() || "(empty)"}`;
}

function renderEditableText(value: string, empty: string): string {
  return value.trim() || empty;
}

function renderReadOnlySection(title: string, body: string): string {
  return renderSection(title, `${READ_ONLY_SECTION_NOTE}\n\n${body}`);
}

function renderProjectionContext(state: PlanState): string {
  const scopePaths = renderPortableRepositoryPathList(state.scopePaths);
  const contextRefs = [
    state.contextRefs.roadmapItemIds.length > 0 ? `Roadmap: ${state.contextRefs.roadmapItemIds.join(", ")}` : null,
    state.contextRefs.initiativeIds.length > 0 ? `Initiatives: ${state.contextRefs.initiativeIds.join(", ")}` : null,
    state.contextRefs.researchIds.length > 0 ? `Research: ${state.contextRefs.researchIds.join(", ")}` : null,
    state.contextRefs.specChangeIds.length > 0 ? `Specs: ${state.contextRefs.specChangeIds.join(", ")}` : null,
    state.contextRefs.ticketIds.length > 0 ? `Tickets: ${state.contextRefs.ticketIds.join(", ")}` : null,
    state.contextRefs.critiqueIds.length > 0 ? `Critiques: ${state.contextRefs.critiqueIds.join(", ")}` : null,
    state.contextRefs.docIds.length > 0 ? `Docs: ${state.contextRefs.docIds.join(", ")}` : null,
  ].filter((value): value is string => value !== null);

  return [
    `- Status: ${state.status}`,
    `- Source target: ${state.sourceTarget.kind}:${state.sourceTarget.ref}`,
    `- Scope paths: ${scopePaths.join(", ") || "none"}`,
    ...(contextRefs.length > 0 ? contextRefs.map((value) => `- ${value}`) : ["- Context refs: none"]),
  ].join("\n");
}

function renderPlanProjectionMarkdown(state: PlanState, linkedTickets: PlanOverviewTicket[]): string {
  return `${[
    `# ${state.title}`,
    "",
    renderSection(
      "Purpose / Big Picture",
      renderEditableText(
        state.purpose || state.summary,
        "Explain what a user or maintainer can do after this work and how they can see it working.",
      ),
    ),
    "",
    renderReadOnlySection("Progress", renderPlanProgress(state, linkedTickets)),
    "",
    renderReadOnlySection("Surprises & Discoveries", renderPlanDiscoveries(state)),
    "",
    renderReadOnlySection("Decision Log", renderPlanDecisions(state)),
    "",
    renderSection(
      "Outcomes & Retrospective",
      renderEditableText(state.outcomesAndRetrospective, "No retrospective recorded yet."),
    ),
    "",
    renderSection(
      "Context and Orientation",
      renderEditableText(
        state.contextAndOrientation,
        "Explain the current repository state, define any Loom-specific terms in plain language, and orient a novice to the files that matter before they edit anything.",
      ),
    ),
    "",
    renderReadOnlySection("Projection Context", renderProjectionContext(state)),
    "",
    renderSection(
      "Milestones",
      renderEditableText(
        state.milestones,
        "Describe each milestone as a narrative checkpoint: what will exist afterward, which commands to run, and what observable result proves success.",
      ),
    ),
    "",
    renderSection(
      "Plan of Work",
      renderEditableText(
        state.planOfWork,
        "Describe the sequence of edits and why that order is the safest path through the linked execution slice.",
      ),
    ),
    "",
    renderSection(
      "Concrete Steps",
      renderEditableText(
        state.concreteSteps,
        "List the exact repository-relative files to edit plus the exact commands to run, including working directory and short expected output when relevant.",
      ),
    ),
    "",
    renderSection(
      "Validation and Acceptance",
      renderEditableText(
        state.validation,
        "Describe the observable behavior, targeted tests, and expected outputs that prove the plan worked beyond merely compiling.",
      ),
    ),
    "",
    renderSection(
      "Idempotence and Recovery",
      renderEditableText(
        state.idempotenceAndRecovery,
        "Explain which steps are safe to repeat, how to recover from a partial failure, and how to avoid leaving the workspace in a misleading state.",
      ),
    ),
    "",
    renderSection(
      "Artifacts and Notes",
      renderEditableText(
        state.artifactsAndNotes,
        "Record concise command transcripts, diff excerpts, or other durable notes that prove the current state of the work.",
      ),
    ),
    "",
    renderSection(
      "Interfaces and Dependencies",
      renderEditableText(
        state.interfacesAndDependencies,
        "Name the modules, tools, durable records, and any required function/type surfaces that must exist at the end of the work.",
      ),
    ),
    "",
    renderReadOnlySection("Linked Tickets", renderPlanTicketList(linkedTickets)),
    "",
    renderSection(
      "Risks and Open Questions",
      renderEditableText(state.risksAndQuestions, "No additional risks or open questions recorded."),
    ),
    "",
    renderReadOnlySection("Revision Notes", renderPlanRevisionNotes(state)),
  ]
    .join("\n")
    .trimEnd()}\n`;
}

function planProjectionSemanticInput(plan: PlanReadResult): Record<string, unknown> {
  return {
    title: plan.state.title,
    status: plan.state.status,
    createdAt: plan.state.createdAt,
    purpose: plan.state.purpose,
    summary: plan.state.summary,
    outcomesAndRetrospective: plan.state.outcomesAndRetrospective,
    contextAndOrientation: plan.state.contextAndOrientation,
    milestones: plan.state.milestones,
    planOfWork: plan.state.planOfWork,
    concreteSteps: plan.state.concreteSteps,
    validation: plan.state.validation,
    idempotenceAndRecovery: plan.state.idempotenceAndRecovery,
    artifactsAndNotes: plan.state.artifactsAndNotes,
    interfacesAndDependencies: plan.state.interfacesAndDependencies,
    risksAndQuestions: plan.state.risksAndQuestions,
    scopePaths: renderPortableRepositoryPathList(plan.state.scopePaths),
    contextRefs: plan.state.contextRefs,
    linkedTickets: plan.overview.linkedTickets.map((ticket) => ({
      ticketId: ticket.ticketId,
      role: ticket.role,
      order: ticket.order,
      status: ticket.status,
      title: ticket.title,
    })),
    progress: plan.state.progress,
    discoveries: plan.state.discoveries,
    decisions: plan.state.decisions,
    revisionNotes: plan.state.revisionNotes,
  };
}

function parseEditableText(section: string): string {
  const trimmed = section.trim();
  return trimmed === "(empty)" ? "" : trimmed;
}

function requireEditableSections(sections: Record<string, string>, filePath: string): void {
  const missing = PLAN_PROJECTION_EDITABLE_SECTIONS.filter((section) => !(section in sections));
  if (missing.length > 0) {
    throw new Error(
      `Plan projection ${filePath} is missing editable sections: ${missing.join(", ")}. Re-export before reconciling.`,
    );
  }
}

export function resolvePlanProjectionRelativePath(state: PlanState): string {
  const createdYear = state.createdAt.slice(0, 4);
  if (!/^\d{4}$/.test(createdYear)) {
    throw new Error(`Plan ${state.planId} has invalid createdAt timestamp: ${state.createdAt}`);
  }
  return `${createdYear}/${state.planId}.md`;
}

export function buildPlanProjection(plan: PlanReadResult): WorkspaceProjectionDocument {
  const renderedContent = renderPlanProjectionMarkdown(plan.state, plan.overview.linkedTickets);
  return createWorkspaceProjectionDocument({
    family: PLAN_FAMILY,
    canonicalRef: `plan:${plan.state.planId}`,
    relativePath: resolvePlanProjectionRelativePath(plan.state),
    renderedContent,
    semanticInput: planProjectionSemanticInput(plan),
    editability: { mode: "sections", editableSections: [...PLAN_PROJECTION_EDITABLE_SECTIONS] },
  });
}

export function createPlanProjectionManifest(plans: readonly PlanReadResult[]): LoomProjectionManifest {
  return createWorkspaceProjectionManifest(
    PLAN_FAMILY,
    plans.map((plan) => buildPlanProjection(plan)),
  );
}

export interface PlanProjectionFileResult {
  path: string;
  write: LoomProjectionWriteResult;
  plan: PlanReadResult;
}

export interface PlanProjectionExportResult {
  manifest: LoomProjectionManifest;
  files: PlanProjectionFileResult[];
  plans: PlanReadResult[];
}

async function loadPlanProjectionRecords(cwd: string): Promise<PlanReadResult[]> {
  const store = createPlanStore(cwd);
  const summaries = await store.listPlans();
  const plans = await Promise.all(summaries.map((summary) => store.readPlan(summary.id)));
  return plans.sort((left, right) => left.state.planId.localeCompare(right.state.planId));
}

export async function exportPlanProjections(cwd: string): Promise<PlanProjectionExportResult> {
  ensureProjectionWorkspace(cwd, { enabledFamilies: [PLAN_FAMILY] });
  const plans = await loadPlanProjectionRecords(cwd);
  const manifest = createPlanProjectionManifest(plans);
  const files = plans.map((plan) => {
    const projection = buildPlanProjection(plan);
    const path = resolveProjectionFilePath(cwd, PLAN_FAMILY, projection.relativePath);
    return {
      path,
      write: writeProjectionFile(path, projection.renderedContent),
      plan,
    };
  });
  writeProjectionManifest(resolveProjectionFilePath(cwd, PLAN_FAMILY, "manifest.json"), manifest);
  return { manifest, files, plans };
}

export function reconcilePlanProjection(current: PlanReadResult, markdown: string): UpdatePlanInput {
  const relativePath = resolvePlanProjectionRelativePath(current.state);
  const parsed = parseMarkdownHeadingDocument(markdown, relativePath);
  const sections = parseMarkdownSections(parsed.body);
  requireEditableSections(sections, relativePath);

  return {
    title: parsed.title || current.state.title,
    purpose: parseEditableText(sections["Purpose / Big Picture"] ?? ""),
    outcomesAndRetrospective: parseEditableText(sections["Outcomes & Retrospective"] ?? ""),
    contextAndOrientation: parseEditableText(sections["Context and Orientation"] ?? ""),
    milestones: parseEditableText(sections.Milestones ?? ""),
    planOfWork: parseEditableText(sections["Plan of Work"] ?? ""),
    concreteSteps: parseEditableText(sections["Concrete Steps"] ?? ""),
    validation: parseEditableText(sections["Validation and Acceptance"] ?? ""),
    idempotenceAndRecovery: parseEditableText(sections["Idempotence and Recovery"] ?? ""),
    artifactsAndNotes: parseEditableText(sections["Artifacts and Notes"] ?? ""),
    interfacesAndDependencies: parseEditableText(sections["Interfaces and Dependencies"] ?? ""),
    risksAndQuestions: parseEditableText(sections["Risks and Open Questions"] ?? ""),
  };
}

export async function reconcilePlanProjections(
  cwd: string,
  selectionInput: LoomProjectionSelectionInput = {},
): Promise<PlanReadResult[]> {
  const store = createPlanStore(cwd);
  const plans = await loadPlanProjectionRecords(cwd);
  const selection = normalizeProjectionSelection(selectionInput);
  const manifest = readProjectionManifest(resolveProjectionFilePath(cwd, PLAN_FAMILY, "manifest.json"));
  if (!manifest) {
    throw new Error("Projection family plans has no manifest. Export it before reconciling.");
  }
  const manifestEntriesByPath = new Map(manifest.entries.map((entry) => [entry.relativePath, entry]));
  const updated: PlanReadResult[] = [];
  let matchedSelection = false;

  for (const plan of plans) {
    const projection = buildPlanProjection(plan);
    if (!projectionEntryMatchesSelection(PLAN_FAMILY, projection.manifestEntry, selection)) {
      continue;
    }
    matchedSelection = true;
    const manifestEntry = manifestEntriesByPath.get(projection.relativePath);
    if (!manifestEntry) {
      throw new Error(`Projection plans/${projection.relativePath} is not exported. Refresh it before reconciling.`);
    }
    const state = assessProjectionFileState(cwd, PLAN_FAMILY, manifestEntry);
    if (state.kind === "missing") {
      throw new Error(`Projection plans/${projection.relativePath} is missing. Refresh it before reconciling.`);
    }
    if (state.kind !== "modified") {
      continue;
    }
    if (
      manifestEntry.revisionToken !== projection.manifestEntry.revisionToken ||
      manifestEntry.baseVersion !== projection.manifestEntry.baseVersion
    ) {
      throw new Error(`Projection plans/${projection.relativePath} is stale. Refresh it before reconciling.`);
    }
    updated.push(
      await store.updatePlan(
        plan.state.planId,
        reconcilePlanProjection(plan, readFileSync(state.absolutePath, "utf-8")),
      ),
    );
  }

  if (selection.hasSelection && !matchedSelection) {
    throw new Error("No plan projections matched the requested selection.");
  }

  return updated;
}
