import type { Theme } from "@mariozechner/pi-coding-agent";
import type { Component } from "@mariozechner/pi-tui";
import { Box, Text, truncateToWidth } from "@mariozechner/pi-tui";
import type { AsyncJob } from "../domain/async-job-manager.js";
import type { ExecuteRalphLoopResult } from "../domain/loop.js";
import type { RalphReadResult, RalphRunSummary } from "../domain/models.js";
import { createRalphStore } from "../domain/store.js";

type RalphAsyncState = {
  state: "running" | "completed" | "failed";
  jobId: string | null;
  runId: string | null;
  type: "ralph_run";
};

export interface RalphRunRenderDetails {
  kind: "ralph_run";
  prompt: string | null;
  startedAt: number;
  created: boolean;
  updates: string[];
  run: RalphRunSummary | null;
  state: "running" | "background" | "completed";
  result: ExecuteRalphLoopResult | null;
  async: RalphAsyncState | null;
}

export interface RalphCommandRenderDetails {
  kind: "ralph_command";
  level: "result" | "error";
  prompt: string | null;
  result: ExecuteRalphLoopResult | null;
}

export interface RalphLiveCommandWidgetState {
  cwd: string;
  runId: string;
  prompt: string | null;
  startedAt: number;
  initialRuntimeArtifactCount: number;
  updates: string[];
}

function formatDurationMs(startedAt: number | null, endedAt = Date.now()): string {
  if (!startedAt || !Number.isFinite(startedAt)) {
    return "0s";
  }
  const durationMs = Math.max(0, endedAt - startedAt);
  if (durationMs < 1_000) {
    return `${durationMs}ms`;
  }
  const totalSeconds = Math.floor(durationMs / 1_000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  if (hours > 0) {
    return `${hours}h${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m${seconds}s`;
  }
  return `${seconds}s`;
}

function totalRunTokens(result: ExecuteRalphLoopResult | null): number {
  if (!result) {
    return 0;
  }
  return result.run.runtimeArtifacts.reduce((total, artifact) => total + artifact.usage.totalTokens, 0);
}

function statusColor(status: string): "success" | "error" | "warning" | "accent" | "muted" {
  if (["completed", "done", "success", "active", "running"].includes(status)) {
    return status === "completed" || status === "done" || status === "success" ? "success" : "accent";
  }
  if (["failed", "error", "halted"].includes(status)) {
    return "error";
  }
  if (["paused", "waiting_for_review", "background"].includes(status)) {
    return "warning";
  }
  return "muted";
}

function statusIcon(_theme: Theme, status: string): string {
  if (["completed", "done", "success"].includes(status)) {
    return "✓";
  }
  if (["failed", "error", "halted"].includes(status)) {
    return "✗";
  }
  if (["paused", "waiting_for_review", "background"].includes(status)) {
    return "!";
  }
  return "…";
}

function badge(theme: Theme, label: string, color: ReturnType<typeof statusColor>): string {
  return theme.fg(color, `[${label}]`);
}

const META_SEPARATOR = " · ";

function line(theme: Theme, label: string, value: string): string {
  return `${theme.fg("dim", label)} ${value}`;
}

function tree(theme: Theme, lines: string[][]): string[] {
  const rendered: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const isLast = index === lines.length - 1;
    const [head, ...tail] = lines[index];
    rendered.push(`${theme.fg("dim", isLast ? "└─" : "├─")} ${head}`);
    for (const tailLine of tail) {
      rendered.push(`${theme.fg("dim", isLast ? "   " : "│  ")} ${tailLine}`);
    }
  }
  return rendered;
}

function previewLines(text: string, limit: number, width: number, theme: Theme): string[] {
  return text
    .split("\n")
    .map((lineText) => lineText.trim())
    .filter(Boolean)
    .slice(0, limit)
    .map((lineText) => theme.fg("dim", truncateToWidth(lineText, width)));
}

function renderRunSummaryLines(
  theme: Theme,
  summary: RalphRunSummary | null,
  result: ExecuteRalphLoopResult | null,
  width: number,
): string[] {
  const runSummary = result?.run.summary ?? summary;
  if (!runSummary) {
    return [theme.fg("dim", "Run not initialized yet.")];
  }
  const state = result?.run.state;
  const latestIteration = state?.postIteration
    ? `${state.postIteration.iteration} [${state.postIteration.status}]`
    : "none";
  const runtime = result?.run.runtimeArtifacts.at(-1)
    ? `${result.run.runtimeArtifacts.at(-1)?.iteration} [${result.run.runtimeArtifacts.at(-1)?.status}]`
    : "none";
  return [
    truncateToWidth(
      `${theme.bold(runSummary.id)} ${theme.fg(statusColor(runSummary.status), `[${runSummary.status}/${runSummary.phase}]`)} ${runSummary.title}`,
      width,
    ),
    line(theme, "Waiting:", theme.fg("muted", state?.waitingFor ?? runSummary.waitingFor ?? "none")),
    line(theme, "Decision:", theme.fg("muted", state?.latestDecision?.kind ?? runSummary.decision ?? "none")),
    line(theme, "Iteration:", theme.fg("muted", latestIteration)),
    line(theme, "Runtime:", theme.fg("muted", runtime)),
  ];
}

function iterationStarted(run: RalphReadResult, iterationId: string): boolean {
  return run.runtimeArtifacts.some(
    (artifact) =>
      artifact.iterationId === iterationId &&
      artifact.events.some((event) => event.type === "launch_state" && event.state === "running"),
  );
}

function iterationExecuted(run: RalphReadResult, iterationId: string): boolean {
  return (
    run.iterations.some((iteration) => iteration.id === iterationId && iteration.decision !== null) ||
    iterationStarted(run, iterationId)
  );
}

export function renderRalphCommandWidgetLines(state: RalphLiveCommandWidgetState, width = 100): string[] {
  try {
    const run = createRalphStore(state.cwd).readRun(state.runId);
    const runLabel = truncateToWidth(run.summary.title || run.summary.id, Math.max(18, Math.floor(width * 0.3)));
    const executedThisCall = Math.max(
      0,
      run.runtimeArtifacts
        .slice(state.initialRuntimeArtifactCount)
        .filter((artifact) => iterationExecuted(run, artifact.iterationId)).length,
    );
    const runtimeArtifacts = run.runtimeArtifacts.slice(state.initialRuntimeArtifactCount);
    const toolCalls = runtimeArtifacts.reduce(
      (total, artifact) =>
        total + artifact.events.filter((event) => event.type === "tool_execution" && event.phase === "start").length,
      0,
    );
    const tokens = runtimeArtifacts.reduce((total, artifact) => total + artifact.usage.totalTokens, 0);
    const latestRuntimeStatus = run.runtimeArtifacts.at(-1)?.status ?? "queued";
    const parts = [
      `⏳ Ralph`,
      runLabel,
      formatDurationMs(state.startedAt),
      `${executedThisCall} it`,
      `${toolCalls} tools`,
      `${tokens} tok`,
      latestRuntimeStatus,
    ];
    return [truncateToWidth(parts.join(META_SEPARATOR), Math.max(40, width))];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [truncateToWidth(`⚠ Ralph ${META_SEPARATOR} ${message}`, Math.max(40, width))];
  }
}

export function renderRalphRunCall(args: Record<string, unknown>, theme: Theme): Component {
  const planRef = typeof args.planRef === "string" && args.planRef.trim() ? args.planRef.trim() : "(missing-plan)";
  const ticketRef =
    typeof args.ticketRef === "string" && args.ticketRef.trim() ? args.ticketRef.trim() : "(missing-ticket)";
  const target = `${planRef}/${ticketRef}`;
  const prompt =
    typeof args.steeringPrompt === "string" && args.steeringPrompt.trim()
      ? truncateToWidth(args.steeringPrompt.trim(), 50)
      : "(no steering)";
  const scopeLabel = `ticket/${ticketRef}`;
  const mode = args.background === false ? theme.fg("accent", "foreground") : theme.fg("warning", "background");
  const text = `${theme.fg("toolTitle", theme.bold("ralph_run"))} ${theme.fg("accent", target)} ${META_SEPARATOR} ${theme.fg("dim", scopeLabel)} ${META_SEPARATOR} ${mode} ${META_SEPARATOR} ${theme.fg("dim", prompt)}`;
  return new Text(text, 0, 0);
}

export function renderRalphRunResult(
  result: { content: Array<{ type: string; text?: string }>; details?: unknown },
  options: { expanded: boolean; isPartial: boolean },
  theme: Theme,
): Component {
  const detailsRecord =
    result.details && typeof result.details === "object" ? (result.details as Record<string, unknown>) : null;
  const details = (detailsRecord?.ui as RalphRunRenderDetails | undefined) ?? null;
  const fallbackText = result.content.find((entry) => entry.type === "text")?.text ?? "";
  if (!details || details.kind !== "ralph_run") {
    return new Text(theme.fg("dim", truncateToWidth(fallbackText, 100)), 0, 0);
  }

  const label = details.run?.title ?? details.run?.id ?? details.prompt ?? "Ralph";
  const finalResult = details.result;
  const finalRun = finalResult?.run.summary ?? details.run;
  const finalStatus =
    details.state === "background"
      ? "background"
      : (finalRun?.status ?? (details.state === "completed" ? "completed" : "running"));
  const duration = formatDurationMs(details.startedAt);
  const updates = details.updates.slice(options.expanded ? -8 : -3);
  const meta: string[] = [];
  if (finalResult) {
    meta.push(`${finalResult.steps.length} iterations`);
    const tokenCount = totalRunTokens(finalResult);
    if (tokenCount > 0) {
      meta.push(`${tokenCount.toLocaleString()} tokens`);
    }
  }
  if (details.async?.jobId) {
    meta.push(details.async.jobId);
  }
  meta.push(duration);

  const header = `${theme.fg(statusColor(finalStatus), statusIcon(theme, finalStatus))} ${theme.fg("accent", theme.bold(`Ralph: ${label}`))} ${badge(theme, finalStatus, statusColor(finalStatus))}${meta.length > 0 ? `${META_SEPARATOR}${theme.fg("dim", meta.join(META_SEPARATOR))}` : ""}`;
  const lines = [header];

  if (options.expanded) {
    lines.push(
      ...tree(theme, [
        [theme.fg("dim", "Run"), ...renderRunSummaryLines(theme, details.run, finalResult, 96)],
        [
          theme.fg("dim", finalResult ? "Iterations" : "Updates"),
          ...(finalResult
            ? finalResult.steps.slice(-6).map((step) => {
                const stepStatus = step.finalStatus ?? "active";
                const stepPrefix = `${theme.fg(statusColor(stepStatus), statusIcon(theme, stepStatus))} ${theme.fg("accent", `${step.iterationId}`)} ${theme.fg("dim", `exit ${step.exitCode}`)} ${META_SEPARATOR} ${theme.fg("dim", step.finalDecision ?? "none")}`;
                const outputPreview = previewLines(step.output || step.stderr, 2, 88, theme);
                return [stepPrefix, ...outputPreview].join("\n");
              })
            : updates.map((update) => theme.fg("dim", truncateToWidth(update, 96)))),
        ],
      ]).flatMap((entry) => entry.split("\n")),
    );
  } else if (updates.length > 0) {
    lines.push(theme.fg("dim", truncateToWidth(updates.at(-1) ?? "", 100)));
  }

  if (finalResult?.steps.at(-1)?.output && options.expanded) {
    lines.push(theme.fg("dim", "Latest output"));
    lines.push(...previewLines(finalResult.steps.at(-1)?.output ?? "", 4, 96, theme).map((entry) => `  ${entry}`));
  }

  return new Text(lines.join("\n"), 0, 0);
}

export function renderRalphReadCall(args: Record<string, unknown>, theme: Theme): Component {
  const planRef = typeof args.planRef === "string" ? args.planRef : "(unknown-plan)";
  const ticketRef = typeof args.ticketRef === "string" ? args.ticketRef : "(unknown-ticket)";
  const mode = typeof args.mode === "string" ? args.mode : "full";
  return new Text(
    `${theme.fg("toolTitle", theme.bold("ralph_read"))} ${theme.fg("accent", `${planRef}/${ticketRef}`)} ${META_SEPARATOR} ${theme.fg("dim", mode)}`,
    0,
    0,
  );
}

export function renderRalphReadResult(
  result: { details?: unknown; content: Array<{ type: string; text?: string }> },
  options: { expanded: boolean },
  theme: Theme,
): Component {
  const details =
    result.details && typeof result.details === "object" ? (result.details as Record<string, unknown>) : null;
  const run = (details?.run as RalphReadResult | RalphRunSummary | undefined) ?? undefined;
  const overview =
    (details?.overview as
      | { run?: RalphRunSummary; waitingFor?: string; latestDecision?: { kind?: string | null } }
      | undefined) ?? undefined;
  const text = result.content.find((entry) => entry.type === "text")?.text ?? "";
  const lines: string[] = [];
  if (run && "state" in run) {
    lines.push(
      `${theme.fg("accent", theme.bold(`Ralph: ${run.summary.title}`))} ${theme.fg(statusColor(run.summary.status), `[${run.summary.status}/${run.summary.phase}]`)}`,
    );
    lines.push(line(theme, "Run:", theme.fg("muted", run.summary.id)));
    lines.push(line(theme, "Decision:", theme.fg("muted", run.state.latestDecision?.kind ?? "none")));
    lines.push(line(theme, "Waiting:", theme.fg("muted", run.state.waitingFor)));
    if (options.expanded) {
      lines.push(...previewLines(text, 8, 96, theme));
    }
    return new Text(lines.join("\n"), 0, 0);
  }
  if (overview?.run) {
    lines.push(
      `${theme.fg("accent", theme.bold(`Ralph: ${overview.run.title}`))} ${theme.fg(statusColor(overview.run.status), `[${overview.run.status}/${overview.run.phase}]`)}`,
    );
    lines.push(line(theme, "Decision:", theme.fg("muted", overview.latestDecision?.kind ?? "none")));
    lines.push(line(theme, "Waiting:", theme.fg("muted", overview.waitingFor ?? "none")));
    return new Text(lines.join("\n"), 0, 0);
  }
  return new Text(theme.fg("dim", truncateToWidth(text, options.expanded ? 400 : 100)), 0, 0);
}

function renderJobBlock(
  jobs: AsyncJob<string, unknown, unknown>[],
  runs: RalphRunSummary[],
  expanded: boolean,
  theme: Theme,
): string[] {
  return jobs.flatMap((job) => {
    const run = runs.find((candidate) => candidate.id === (job.metadata as { runId?: string } | undefined)?.runId);
    const displayStatus = run?.status ?? job.status;
    const label = `${theme.fg(statusColor(displayStatus), statusIcon(theme, displayStatus))} ${theme.fg("accent", theme.bold(job.label))} ${badge(theme, displayStatus, statusColor(displayStatus))}${META_SEPARATOR}${theme.fg("dim", formatDurationMs(job.startTime, job.endTime ?? Date.now()))}`;
    const details = [
      line(theme, "Run:", theme.fg("muted", (job.metadata as { runId?: string } | undefined)?.runId ?? "(unknown)")),
      ...(job.errorText ? [line(theme, "Error:", theme.fg("error", job.errorText))] : []),
      line(theme, "Progress:", theme.fg("muted", job.progress?.text ?? "(none)")),
      ...(run
        ? [
            line(theme, "Decision:", theme.fg("muted", run.decision ?? "none")),
            line(theme, "Waiting:", theme.fg("muted", run.waitingFor)),
          ]
        : []),
    ];
    return [label, ...(expanded ? details : details.slice(0, 2)).map((entry) => `  ${entry}`)];
  });
}

export function renderRalphJobCall(toolName: string, args: Record<string, unknown>, theme: Theme): Component {
  const label =
    typeof args.jobId === "string"
      ? args.jobId
      : Array.isArray(args.jobIds)
        ? `${args.jobIds.length} jobs`
        : "workspace jobs";
  return new Text(`${theme.fg("toolTitle", theme.bold(toolName))} ${theme.fg("accent", label)}`, 0, 0);
}

export function renderRalphJobResult(
  result: { details?: unknown; content: Array<{ type: string; text?: string }> },
  options: { expanded: boolean },
  theme: Theme,
): Component {
  const details =
    result.details && typeof result.details === "object" ? (result.details as Record<string, unknown>) : null;
  const jobs = Array.isArray(details?.jobs)
    ? (details?.jobs as AsyncJob<string, unknown, unknown>[])
    : details?.job
      ? [details.job as AsyncJob<string, unknown, unknown>]
      : [];
  const runs = Array.isArray(details?.runs) ? (details?.runs as RalphRunSummary[]) : [];
  const text = result.content.find((entry) => entry.type === "text")?.text ?? "";
  if (jobs.length === 0) {
    return new Text(theme.fg("dim", truncateToWidth(text, 120)), 0, 0);
  }
  return new Text(renderJobBlock(jobs, runs, options.expanded, theme).join("\n"), 0, 0);
}

export function renderRalphCommandMessage(
  message: { content: string; details?: RalphCommandRenderDetails },
  options: { expanded: boolean },
  theme: Theme,
): Component {
  const details = message.details;
  const box = new Box(1, 1, (text) => theme.bg("customMessageBg", text));
  if (!details || details.kind !== "ralph_command") {
    box.addChild(new Text(message.content, 0, 0));
    return box;
  }

  const color = details.level === "error" ? "error" : "accent";
  const status = details.level === "error" ? "error" : (details.result?.run.summary.status ?? "completed");
  const header = `${theme.fg(color, statusIcon(theme, status))} ${theme.fg("accent", theme.bold("Ralph"))} ${badge(theme, details.level === "error" ? "error" : status, statusColor(status))}`;
  const lines = [header];
  if (details.result) {
    lines.push(...renderRunSummaryLines(theme, details.result.run.summary, details.result, 96));
    if (details.prompt) {
      lines.push(`Prompt: ${truncateToWidth(details.prompt, 96)}`);
    }
    const preview = previewLines(message.content, options.expanded ? 8 : 3, 96, theme);
    if (preview.length > 0) {
      lines.push(theme.fg("dim", "Result"));
      lines.push(...preview.map((entry) => `  ${entry}`));
    }
  } else {
    lines.push(theme.fg("dim", truncateToWidth(message.content, 96)));
  }
  box.addChild(new Text(lines.join("\n"), 0, 0));
  return box;
}
