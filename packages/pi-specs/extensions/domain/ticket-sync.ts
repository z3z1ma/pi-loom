import { createHash } from "node:crypto";
import type { CreateTicketInput, UpdateTicketInput } from "@pi-loom/pi-ticketing/extensions/domain/models.js";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import { findEntityByDisplayId, upsertEntityByDisplayId } from "@pi-loom/pi-storage/storage/entities.js";
import { openWorkspaceStorage } from "@pi-loom/pi-storage/storage/workspace.js";
import type {
  SpecChangeRecord,
  SpecRequirementRecord,
  SpecTaskRecord,
  SpecTicketSyncEntry,
  SpecTicketSyncState,
} from "./models.js";
import { normalizeStringList } from "./normalize.js";
import { createSpecStore } from "./store.js";

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
    `Synchronized from finalized spec ${change.state.changeId}: ${change.state.title}`,
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
    labels: ["spec-synced"],
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
    labels: ["spec-synced"],
    initiativeIds: change.state.initiativeIds,
    researchIds: change.state.researchIds,
    specChange: change.state.changeId,
    specCapabilities: capabilityIds,
    specRequirements: task.requirements,
  };
}

async function ticketExists(cwd: string, ticketId: string): Promise<boolean> {
  try {
    await createTicketStore(cwd).readTicketAsync(ticketId);
    return true;
  } catch {
    return false;
  }
}

async function syncedTicketMatches(
  cwd: string,
  ticketId: string,
  expectedDeps: string[],
  change: SpecChangeRecord,
  task: SpecTaskRecord,
  capabilityIds: string[],
  initiativeIds: string[],
  researchIds: string[],
  changeId: string,
): Promise<boolean> {
  const result = await createTicketStore(cwd).readTicketAsync(ticketId);
  return (
    result.ticket.frontmatter.title === task.title &&
    result.ticket.body.summary === task.summary &&
    result.ticket.body.context === ticketContext(change, task, capabilityIds) &&
    result.ticket.body.plan === ticketPlan(change, task) &&
    JSON.stringify(result.ticket.frontmatter.deps) === JSON.stringify(expectedDeps) &&
    JSON.stringify(result.ticket.frontmatter.links) === JSON.stringify([`.loom/specs/changes/${changeId}/proposal.md`]) &&
    JSON.stringify(result.ticket.frontmatter.labels) === JSON.stringify(["spec-synced"]) &&
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

async function readTicketSyncState(cwd: string, changeId: string): Promise<SpecTicketSyncState | null> {
  const { storage, identity } = await openWorkspaceStorage(cwd);
  const entity = await findEntityByDisplayId(storage, identity.space.id, "spec_change", changeId);
  if (!entity) {
    return null;
  }
  const attributes = entity.attributes as { ticketSync?: SpecTicketSyncState | null };
  return attributes.ticketSync ?? null;
}

async function persistTicketSyncState(
  cwd: string,
  change: SpecChangeRecord,
  ticketSync: SpecTicketSyncState,
): Promise<SpecChangeRecord> {
  const { storage, identity } = await openWorkspaceStorage(cwd);
  const entity = await findEntityByDisplayId(storage, identity.space.id, "spec_change", change.state.changeId);
  if (!entity) {
    throw new Error(`Unknown spec change: ${change.state.changeId}`);
  }
  const attributes = entity.attributes as Record<string, unknown>;
  await upsertEntityByDisplayId(storage, {
    kind: "spec_change",
    spaceId: identity.space.id,
    owningRepositoryId: identity.repository.id,
    displayId: entity.displayId ?? entity.id,
    title: entity.title,
    summary: entity.summary,
    status: entity.status,
    version: entity.version + 1,
    tags: entity.tags,
    pathScopes: entity.pathScopes,
    attributes: {
      ...attributes,
      ticketSync,
    },
    createdAt: entity.createdAt,
    updatedAt: ticketSync.syncedAt,
  });
  return {
    ...change,
    ticketSync,
    summary: {
      ...change.summary,
      updatedAt: ticketSync.syncedAt,
    },
  };
}

export async function syncSpecTickets(cwd: string, ref: string): Promise<SpecChangeRecord> {
  const specStore = createSpecStore(cwd);
  const change = await specStore.readChange(ref);
  if (change.summary.archived || change.state.status !== "finalized") {
    throw new Error(`Spec change ${change.state.changeId} must be active and finalized before ticket synchronization.`);
  }

  const orderedTasks = topoSort(change.state.tasks);
  const previousSync = await readTicketSyncState(cwd, change.state.changeId);
  const ticketStore = createTicketStore(cwd);
  ticketStore.initLedger();

  const ticketIdsByTask = new Map<string, string>();
  const nextEntries: SpecTicketSyncEntry[] = [];
  const mode: SpecTicketSyncState["mode"] = previousSync ? "refresh" : "initial";

  for (const task of orderedTasks) {
    const signature = taskSignature(change, task);
    const previousEntry = previousSync?.links.find((entry) => entry.taskId === task.id) ?? null;
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
      (await ticketExists(cwd, previousEntry.ticketId)) &&
      (await syncedTicketMatches(
        cwd,
        previousEntry.ticketId,
        dependencyTicketIds,
        change,
        task,
        capabilityIds,
        change.state.initiativeIds,
        change.state.researchIds,
        change.state.changeId,
      ))
    ) {
      ticketId = previousEntry.ticketId;
    } else if (previousEntry && (await ticketExists(cwd, previousEntry.ticketId))) {
      const updated = await ticketStore.updateTicketAsync(
        previousEntry.ticketId,
        buildUpdateInput(change, task, dependencyTicketIds, capabilityIds),
      );
      ticketId = updated.summary.id;
    } else {
      const created = await ticketStore.createTicketAsync(
        buildCreateInput(change, task, dependencyTicketIds, capabilityIds),
      );
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

  return persistTicketSyncState(cwd, change, {
    changeId: change.state.changeId,
    syncedAt: new Date().toISOString(),
    mode,
    capabilityIds: normalizeStringList(change.state.capabilities.map((capability) => capability.id)),
    links: nextEntries,
  });
}
