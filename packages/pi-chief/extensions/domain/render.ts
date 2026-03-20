import type { ManagerReadResult, ManagerSummary, WorkerReadResult, WorkerRuntimeDescriptor, WorkerSummary } from "./models.js";

function renderList(title: string, values: string[]): string {
  if (values.length === 0) {
    return `${title}: none`;
  }
  return `${title}:\n${values.map((value) => `- ${value}`).join("\n")}`;
}

export function renderWorkerDetail(result: WorkerReadResult): string {
  const { state } = result;
  return [
    `${state.workerId} [${state.status}] ${state.title}`,
    `Objective: ${state.objective || "(none)"}`,
    `Manager: ${state.managerId}`,
    `Ticket: ${state.ticketId}`,
    `Linked Ralph run: ${state.ralphRunId}`,
    `Workspace: ${state.workspace.strategy} ${state.workspace.branch} @ ${state.workspace.baseRef}`,
    `Pending instructions: ${state.pendingInstructions.join(" | ") || "(none)"}`,
    `Summary: ${state.summary || "(none)"}`,
  ].join("\n");
}

export function renderWorkerList(workers: WorkerSummary[]): string {
  if (workers.length === 0) {
    return "No workers.";
  }
  return workers
    .map((worker) => `${worker.id} [${worker.status}] ticket=${worker.ticketId} branch=${worker.branch} ${worker.title}`)
    .join("\n");
}

export function renderLaunchDescriptor(launch: WorkerRuntimeDescriptor): string {
  return [
    `Worker ${launch.workerId} launch`,
    `Runtime: ${launch.runtime}`,
    `Workspace path: ${launch.workspaceDir}`,
    `Branch/base: ${launch.branch} / ${launch.baseRef}`,
    `Resume: ${launch.resume ? "yes" : "no"}`,
    `Status: ${launch.status}`,
    `Note: ${launch.note || "(none)"}`,
    `Command: ${launch.command.join(" ")}`,
  ].join("\n");
}

export function renderManagerList(managers: ManagerSummary[]): string {
  if (managers.length === 0) {
    return "No managers.";
  }
  return managers
    .map(
      (manager) =>
        `${manager.id} [${manager.status}/${manager.managerRunStatus}] ${manager.title} target=${manager.targetRef} workers=${manager.workerCount} pending=${manager.pendingMessages}`,
    )
    .join("\n");
}

export function renderManagerDetail(result: ManagerReadResult): string {
  const pending = result.messages.filter(
    (message) => message.direction === "manager_to_operator" && message.status !== "resolved",
  );
  const recent = result.messages
    .slice(-5)
    .map((message) => `${message.id} ${message.direction}/${message.kind} [${message.status}] ${message.text}`);
  return [
    `${result.summary.id} [${result.state.status}] ${result.state.title}`,
    `Objective: ${result.state.objective || "(none)"}`,
    `Target ref: ${result.state.targetRef}`,
    `Manager Ralph run: ${result.state.ralphRunId} [${result.managerLoop.status}/${result.managerLoop.phase}] waiting=${result.managerLoop.waitingFor}`,
    `Manager summary: ${result.state.summary || "(none)"}`,
    renderList(
      "Linked refs",
      [
        ...result.state.linkedRefs.initiativeIds.map((ref) => `initiative:${ref}`),
        ...result.state.linkedRefs.researchIds.map((ref) => `research:${ref}`),
        ...result.state.linkedRefs.specChangeIds.map((ref) => `spec:${ref}`),
        ...result.state.linkedRefs.planIds.map((ref) => `plan:${ref}`),
        ...result.state.linkedRefs.ticketIds.map((ref) => `ticket:${ref}`),
        ...result.state.linkedRefs.critiqueIds.map((ref) => `critique:${ref}`),
        ...result.state.linkedRefs.docIds.map((ref) => `doc:${ref}`),
      ],
    ),
    renderList(
      "Workers",
      result.workers.map(
        (worker) => `${worker.id} [${worker.status}] ticket=${worker.ticketId} branch=${worker.branch} ralph=${worker.ralphRunId}`,
      ),
    ),
    `Latest manager-loop decision: ${result.managerLoop.latestDecision ?? "(none)"}`,
    `Latest manager-loop summary: ${result.managerLoop.latestSummary || "(none)"}`,
    `Next launch prepared: ${result.managerLoop.nextLaunchPrepared ?? "(none)"}`,
    renderList(
      "Pending manager output",
      pending.map((message) => `${message.kind}${message.workerId ? ` ${message.workerId}` : ""}: ${message.text}`),
    ),
    renderList("Recent manager messages", recent),
  ].join("\n");
}
