import { createHash } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { CreateTicketInput, UpdateTicketInput } from "@pi-loom/pi-ticketing/extensions/domain/models.js";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import type {
  SpecChangeRecord,
  SpecRequirementRecord,
  SpecTaskRecord,
  SpecTicketProjection,
  TicketProjectionEntry,
} from "./models.js";
import { normalizeStringList } from "./normalize.js";
import { getProjectionPath } from "./paths.js";
import { createSpecStore } from "./store.js";

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function writeJson(path: string, value: unknown): void {
  ensureDir(dirname(path));
  const tempPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  renameSync(tempPath, path);
}

function taskSignature(change: SpecChangeRecord, task: SpecTaskRecord): string {
  const requirements = task.requirements
    .map((requirementId) => change.state.requirements.find((requirement) => requirement.id === requirementId))
    .filter((requirement): requirement is SpecRequirementRecord => requirement !== undefined)
    .map((requirement) => ({ id: requirement.id, text: requirement.text, acceptance: requirement.acceptance }));
  return createHash("sha256")
    .update(
      JSON.stringify({
        changeId: change.state.changeId,
        task: {
          id: task.id,
          title: task.title,
          summary: task.summary,
          deps: task.deps,
          requirements: task.requirements,
          capabilities: task.capabilities,
          acceptance: task.acceptance,
        },
        requirements,
      }),
    )
    .digest("hex")
    .slice(0, 16);
}

function topoSort(tasks: SpecTaskRecord[]): SpecTaskRecord[] {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: SpecTaskRecord[] = [];

  function visit(taskId: string): void {
    if (visited.has(taskId)) {
      return;
    }
    if (visiting.has(taskId)) {
      throw new Error(`Task dependency cycle detected at ${taskId}`);
    }
    const task = taskById.get(taskId);
    if (!task) {
      throw new Error(`Unknown task dependency: ${taskId}`);
    }
    visiting.add(taskId);
    for (const dependency of task.deps) {
      visit(dependency);
    }
    visiting.delete(taskId);
    visited.add(taskId);
    ordered.push(task);
  }

  for (const task of tasks) {
    visit(task.id);
  }

  return ordered;
}

function ticketPlan(change: SpecChangeRecord, task: SpecTaskRecord): string {
  const requirementLines = task.requirements.map((requirementId) => {
    const requirement = change.state.requirements.find((candidate) => candidate.id === requirementId);
    return requirement ? `- ${requirement.id}: ${requirement.text}` : `- ${requirementId}`;
  });
  return [
    `Spec change: ${change.state.changeId}`,
    task.summary ? `Task summary: ${task.summary}` : "",
    requirementLines.length > 0 ? `Requirements:\n${requirementLines.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function ticketContext(change: SpecChangeRecord, _task: SpecTaskRecord, capabilityIds: string[]): string {
  const capabilityLines = capabilityIds.map((capabilityId) => {
    const capability = change.state.capabilities.find((candidate) => candidate.id === capabilityId);
    return capability ? `- ${capability.id}: ${capability.title}` : `- ${capabilityId}`;
  });
  return [
    `Projected from finalized spec ${change.state.changeId}: ${change.state.title}`,
    capabilityLines.length > 0 ? `Capabilities:\n${capabilityLines.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function ticketAcceptance(change: SpecChangeRecord, task: SpecTaskRecord): string[] {
  const linkedRequirementAcceptance = task.requirements.flatMap((requirementId) => {
    const requirement = change.state.requirements.find((candidate) => candidate.id === requirementId);
    if (!requirement) {
      return [];
    }
    return requirement.acceptance.length > 0 ? requirement.acceptance : [requirement.text];
  });
  return normalizeStringList([...linkedRequirementAcceptance, ...task.acceptance]);
}

function buildCreateInput(
  change: SpecChangeRecord,
  task: SpecTaskRecord,
  dependencyTicketIds: string[],
  capabilityIds: string[],
): CreateTicketInput {
  const relativeSpecPath = `.loom/specs/changes/${change.state.changeId}/proposal.md`;
  return {
    title: task.title,
    summary: task.summary,
    context: ticketContext(change, task, capabilityIds),
    plan: ticketPlan(change, task),
    acceptance: ticketAcceptance(change, task),
    deps: dependencyTicketIds,
    links: [relativeSpecPath],
    labels: ["spec-projected"],
    type: "task",
    priority: "medium",
    initiativeIds: change.state.initiativeIds,
    researchIds: change.state.researchIds,
    specChange: change.state.changeId,
    specCapabilities: capabilityIds,
    specRequirements: task.requirements,
  };
}

function buildUpdateInput(
  change: SpecChangeRecord,
  task: SpecTaskRecord,
  dependencyTicketIds: string[],
  capabilityIds: string[],
): UpdateTicketInput {
  return {
    title: task.title,
    summary: task.summary,
    context: ticketContext(change, task, capabilityIds),
    plan: ticketPlan(change, task),
    acceptance: ticketAcceptance(change, task),
    deps: dependencyTicketIds,
    links: [`.loom/specs/changes/${change.state.changeId}/proposal.md`],
    labels: ["spec-projected"],
    initiativeIds: change.state.initiativeIds,
    researchIds: change.state.researchIds,
    specChange: change.state.changeId,
    specCapabilities: capabilityIds,
    specRequirements: task.requirements,
  };
}

function ticketExists(cwd: string, ticketId: string): boolean {
  try {
    createTicketStore(cwd).readTicket(ticketId);
    return true;
  } catch {
    return false;
  }
}

function projectedTicketMatches(
  cwd: string,
  ticketId: string,
  expectedDeps: string[],
  change: SpecChangeRecord,
  task: SpecTaskRecord,
  capabilityIds: string[],
  initiativeIds: string[],
  researchIds: string[],
  changeId: string,
): boolean {
  const result = createTicketStore(cwd).readTicket(ticketId);
  return (
    result.ticket.frontmatter.title === task.title &&
    result.ticket.body.summary === task.summary &&
    result.ticket.body.context === ticketContext(change, task, capabilityIds) &&
    result.ticket.body.plan === ticketPlan(change, task) &&
    JSON.stringify(result.ticket.frontmatter.deps) === JSON.stringify(expectedDeps) &&
    JSON.stringify(result.ticket.frontmatter.links) ===
      JSON.stringify([`.loom/specs/changes/${changeId}/proposal.md`]) &&
    JSON.stringify(result.ticket.frontmatter.labels) === JSON.stringify(["spec-projected"]) &&
    JSON.stringify(result.ticket.frontmatter.acceptance) === JSON.stringify(ticketAcceptance(change, task)) &&
    result.ticket.frontmatter.type === "task" &&
    result.ticket.frontmatter.priority === "medium" &&
    JSON.stringify(result.ticket.frontmatter["initiative-ids"]) === JSON.stringify(initiativeIds) &&
    JSON.stringify(result.ticket.frontmatter["research-ids"]) === JSON.stringify(researchIds) &&
    result.ticket.frontmatter["spec-change"] === changeId &&
    JSON.stringify(result.ticket.frontmatter["spec-capabilities"]) === JSON.stringify(capabilityIds) &&
    JSON.stringify(result.ticket.frontmatter["spec-requirements"]) === JSON.stringify(task.requirements)
  );
}

export function projectSpecTickets(cwd: string, ref: string): SpecChangeRecord {
  const specStore = createSpecStore(cwd);
  const change = specStore.readChange(ref);
  if (change.summary.archived || change.state.status !== "finalized") {
    throw new Error(`Spec change ${change.state.changeId} must be active and finalized before ticket projection.`);
  }

  const orderedTasks = topoSort(change.state.tasks);
  const previousProjection = change.projection;
  const ticketStore = createTicketStore(cwd);
  ticketStore.initLedger();

  const ticketIdsByTask = new Map<string, string>();
  const nextEntries: TicketProjectionEntry[] = [];
  const mode: SpecTicketProjection["mode"] = previousProjection ? "refresh" : "initial";

  for (const task of orderedTasks) {
    const signature = taskSignature(change, task);
    const previousEntry = previousProjection?.tickets.find((entry) => entry.taskId === task.id) ?? null;
    const dependencyTicketIds = task.deps.map((dependencyTaskId) => {
      const dependencyTicketId = ticketIdsByTask.get(dependencyTaskId);
      if (!dependencyTicketId) {
        throw new Error(`Task ${task.id} depends on unresolved task ${dependencyTaskId}`);
      }
      return dependencyTicketId;
    });
    const capabilityIds =
      task.capabilities.length > 0
        ? task.capabilities
        : normalizeStringList(
            task.requirements.flatMap((requirementId) => {
              const requirement = change.state.requirements.find((candidate) => candidate.id === requirementId);
              return requirement?.capabilities ?? [];
            }),
          );

    let ticketId: string;
    if (
      previousEntry &&
      previousEntry.signature === signature &&
      ticketExists(cwd, previousEntry.ticketId) &&
      projectedTicketMatches(
        cwd,
        previousEntry.ticketId,
        dependencyTicketIds,
        change,
        task,
        capabilityIds,
        change.state.initiativeIds,
        change.state.researchIds,
        change.state.changeId,
      )
    ) {
      ticketId = previousEntry.ticketId;
    } else if (previousEntry && ticketExists(cwd, previousEntry.ticketId)) {
      const updated = ticketStore.updateTicket(
        previousEntry.ticketId,
        buildUpdateInput(change, task, dependencyTicketIds, capabilityIds),
      );
      ticketId = updated.summary.id;
    } else {
      const created = ticketStore.createTicket(buildCreateInput(change, task, dependencyTicketIds, capabilityIds));
      ticketId = created.summary.id;
    }

    ticketIdsByTask.set(task.id, ticketId);
    nextEntries.push({
      taskId: task.id,
      ticketId,
      signature,
      capabilityIds,
      requirementIds: task.requirements,
      dependencyTaskIds: task.deps,
    });
  }

  const projection: SpecTicketProjection = {
    changeId: change.state.changeId,
    projectedAt: new Date().toISOString(),
    mode,
    capabilityIds: normalizeStringList(change.state.capabilities.map((capability) => capability.id)),
    tickets: nextEntries,
  };
  writeJson(getProjectionPath(cwd, change.state.changeId), projection);
  return specStore.readChange(change.state.changeId);
}
