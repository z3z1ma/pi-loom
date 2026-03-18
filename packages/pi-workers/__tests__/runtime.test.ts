import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createTicketStore } from "@pi-loom/pi-ticketing/extensions/domain/store.js";
import { describe, expect, it, vi } from "vitest";
import {
  buildInheritedWorkerSdkSessionConfig,
  resolveCliExtensionPathsFromArgv,
  resolveWorkspaceExtensionPaths,
  runWorkerLaunch,
} from "../extensions/domain/runtime.js";
import { createWorkerStore } from "../extensions/domain/store.js";

vi.mock("@mariozechner/pi-coding-agent", () => ({
  buildSessionContext: (entries: Array<{ type?: string; thinkingLevel?: string }>) => {
    let thinkingLevel = "off";
    for (const entry of entries) {
      if (entry.type === "thinking_level_change" && entry.thinkingLevel) {
        thinkingLevel = entry.thinkingLevel;
      }
    }
    return { messages: [], thinkingLevel, model: null };
  },
  createCodingTools: vi.fn((cwd: string) => [
    { name: "read", cwd },
    { name: "bash", cwd },
    { name: "edit", cwd },
    { name: "write", cwd },
  ]),
  DefaultResourceLoader: class {
    additionalExtensionPaths: string[];

    constructor(options?: { additionalExtensionPaths?: string[] }) {
      this.additionalExtensionPaths = options?.additionalExtensionPaths ?? [];
    }

    async reload() {}

    getExtensions() {
      return {
        extensions: this.additionalExtensionPaths.map((resolvedPath) => ({ resolvedPath })),
        errors: [],
        runtime: {},
      };
    }
  },
  createAgentSession: vi.fn(),
  SessionManager: {
    inMemory: vi.fn(() => ({ kind: "memory" })),
  },
}));

function createWorkspace(): { cwd: string; cleanup: () => void } {
  const cwd = mkdtempSync(join(tmpdir(), "pi-workers-runtime-"));
  process.env.PI_LOOM_ROOT = join(cwd, ".pi-loom-test");
  execFileSync("git", ["init"], { cwd, encoding: "utf-8" });
  execFileSync("git", ["config", "user.name", "Pi Loom Tests"], { cwd, encoding: "utf-8" });
  execFileSync("git", ["config", "user.email", "tests@example.com"], { cwd, encoding: "utf-8" });
  writeFileSync(join(cwd, "README.md"), "seed\n", "utf-8");
  execFileSync("git", ["add", "README.md"], { cwd, encoding: "utf-8" });
  execFileSync("git", ["commit", "-m", "seed"], { cwd, encoding: "utf-8" });
  return {
    cwd,
    cleanup: () => {
      delete process.env.PI_LOOM_ROOT;
      rmSync(cwd, { recursive: true, force: true });
    },
  };
}

function writeWorkspaceFile(cwd: string, relativePath: string, content: string): void {
  const filePath = join(cwd, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf-8");
}

function commitWorkspaceFiles(cwd: string, message: string, ...relativePaths: string[]): void {
  execFileSync("git", ["add", ...relativePaths], { cwd, encoding: "utf-8" });
  execFileSync("git", ["commit", "-m", message], { cwd, encoding: "utf-8" });
}

describe("worker runtime", () => {
  it("parses inherited -e extension paths from argv", () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      writeWorkspaceFile(cwd, "extensions/alpha.ts", "export default {}\n");
      writeWorkspaceFile(cwd, "beta.ts", "export default {}\n");

      expect(
        resolveCliExtensionPathsFromArgv(cwd, [
          "omp",
          "-e",
          "./extensions/alpha.ts",
          "--extension",
          join(cwd, "beta.ts"),
        ]),
      ).toEqual([join(cwd, "extensions", "alpha.ts"), join(cwd, "beta.ts")]);
    } finally {
      cleanup();
    }
  }, 30000);

  it("builds inherited sdk session config from the active extension context", () => {
    const model = { provider: "openai", id: "gpt-5.4" } as never;
    const modelRegistry = { modelsJsonPath: "/tmp/omp-agent/models.json" };

    const sdkSessionConfig = buildInheritedWorkerSdkSessionConfig({
      cwd: "/workspace/root",
      model,
      modelRegistry: modelRegistry as never,
      sessionManager: {
        getEntries: () => [{ type: "thinking_level_change", thinkingLevel: "high" }],
        getLeafId: () => "leaf-1",
        getSessionFile: () => undefined,
        getSessionDir: () => "/tmp/omp-agent/sessions/current-workspace",
      } as never,
    });

    expect(sdkSessionConfig).toEqual(
      expect.objectContaining({
        ledgerRoot: "/workspace/root",
        extensionRoot: "/workspace/root",
        agentDir: "/tmp/omp-agent",
        model,
        modelRegistry,
        thinkingLevel: "high",
      }),
    );
  });

  it("builds an explicit launch prompt instead of reusing the raw packet dump", async () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      const ticketStore = createTicketStore(cwd);
      await ticketStore.initLedgerAsync();
      await ticketStore.createTicketAsync({ title: "Ticket", summary: "summary", context: "context", plan: "plan" });
      const store = createWorkerStore(cwd);
      store.createWorker({ title: "Prompt Worker", linkedRefs: { ticketIds: ["t-0001"] } });
      store.appendMessage("prompt-worker", {
        direction: "manager_to_worker",
        kind: "assignment",
        text: "Durably process the inbox",
      });

      const prepared = store.prepareLaunch("prompt-worker", false, "sdk launch", "sdk");
      expect(prepared.launch?.launchPrompt).toContain(
        "Act as this Pi worker now. Process the worker inbox, execute the requested work, and leave durable state updates behind.",
      );
      expect(prepared.launch?.launchPrompt).toContain("Before you stop:");
      expect(prepared.launch?.launchPrompt).toContain("Worker state packet:");
      expect(prepared.launch?.launchPrompt).toContain(prepared.packet);
      expect(prepared.launch?.launchPrompt).not.toBe(prepared.packet);
    } finally {
      cleanup();
    }
  }, 30000);

  it("provisions and retires Git worktree-backed worker attachments", async () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      const ticketStore = createTicketStore(cwd);
      await ticketStore.initLedgerAsync();
      await ticketStore.createTicketAsync({ title: "Ticket", summary: "summary", context: "context", plan: "plan" });
      const store = createWorkerStore(cwd);
      store.createWorker({ title: "Runtime Worker", linkedRefs: { ticketIds: ["t-0001"] } });
      const launched = store.prepareLaunch("runtime-worker", false, "prepare launch");
      expect(launched.launch).not.toBeNull();
      expect(launched.launch?.runtime).toBe("sdk");
      expect(existsSync(launched.launch?.workspacePath ?? "")).toBe(true);
      expect(launched.launch?.status).toBe("prepared");

      const retired = store.retireWorker("runtime-worker", "retired in test");
      expect(retired.state.status).toBe("retired");
      expect(retired.launch?.status).toBe("retired");
    } finally {
      cleanup();
    }
  }, 30000);

  it("recreates a prepared workspace when durable branch state changes", async () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      const ticketStore = createTicketStore(cwd);
      await ticketStore.initLedgerAsync();
      await ticketStore.createTicketAsync({ title: "Ticket", summary: "summary", context: "context", plan: "plan" });
      const store = createWorkerStore(cwd);
      store.createWorker({ title: "Runtime Worker", linkedRefs: { ticketIds: ["t-0001"] } });

      const firstLaunch = store.prepareLaunch("runtime-worker", false, "initial launch");
      expect(firstLaunch.launch?.workspacePath).toBeTruthy();
      expect(firstLaunch.launch?.runtime).toBe("sdk");
      expect(
        execFileSync("git", ["-C", firstLaunch.launch?.workspacePath ?? "", "branch", "--show-current"], {
          encoding: "utf-8",
        }).trim(),
      ).toBe("runtime-worker");

      store.updateWorker("runtime-worker", {
        workspace: { branch: "runtime-worker-rebased", baseRef: "HEAD" },
      });

      const secondLaunch = store.prepareLaunch("runtime-worker", true, "resume on new branch");
      expect(secondLaunch.launch?.workspacePath).toBe(firstLaunch.launch?.workspacePath);
      expect(
        execFileSync("git", ["-C", secondLaunch.launch?.workspacePath ?? "", "branch", "--show-current"], {
          encoding: "utf-8",
        }).trim(),
      ).toBe("runtime-worker-rebased");
      expect(secondLaunch.launch?.branch).toBe("runtime-worker-rebased");
    } finally {
      cleanup();
    }
  }, 60000);

  it("records runtime kind for SDK launches and can execute through the SDK runtime path", async () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      writeWorkspaceFile(cwd, "packages/demo-extension/index.ts", "export default {}\n");
      writeFileSync(
        join(cwd, "package.json"),
        `${JSON.stringify({ name: "runtime-fixture", pi: { extensions: ["./packages/demo-extension/index.ts"] } }, null, 2)}\n`,
        "utf-8",
      );
      commitWorkspaceFiles(cwd, "add sdk extension fixture", "package.json", "packages/demo-extension/index.ts");

      const ticketStore = createTicketStore(cwd);
      await ticketStore.initLedgerAsync();
      await ticketStore.createTicketAsync({ title: "Ticket", summary: "summary", context: "context", plan: "plan" });
      const store = createWorkerStore(cwd);
      store.createWorker({ title: "SDK Worker", linkedRefs: { ticketIds: ["t-0001"] } });
      store.appendMessage("sdk-worker", {
        direction: "manager_to_worker",
        kind: "assignment",
        text: "Complete the assigned work and resolve this inbox item",
      });

      const launched = store.prepareLaunch("sdk-worker", false, "sdk launch", "sdk");
      expect(launched.launch?.runtime).toBe("sdk");
      expect(launched.state.lastRuntimeKind).toBeNull();

      const { createAgentSession } = await import("@mariozechner/pi-coding-agent");
      const createAgentSessionMock = vi.mocked(createAgentSession);
      const sessionMock: {
        listener?: (event: unknown) => void;
        subscribe: (listener: (event: unknown) => void) => () => void;
        prompt: (_text: string) => Promise<void>;
        abort: () => void;
        dispose: () => Promise<void>;
      } = {
        subscribe(listener: (event: unknown) => void) {
          sessionMock.listener = listener;
          return () => undefined;
        },
        async prompt(_text: string) {
          sessionMock.listener?.({
            type: "message_update",
            assistantMessageEvent: { type: "text_delta", delta: "SDK output" },
          });
        },
        abort() {},
        async dispose() {},
      };
      createAgentSessionMock.mockResolvedValueOnce({
        session: sessionMock,
      } as never);

      const launch = launched.launch;
      expect(launch).not.toBeNull();
      if (!launch) throw new Error("Expected SDK launch descriptor");
      const sdkSessionConfig = {
        ledgerRoot: cwd,
        extensionRoot: cwd,
        agentDir: "/tmp/omp-agent",
        modelRegistry: { kind: "registry" } as never,
        model: { provider: "openai", id: "gpt-5.4" } as never,
        thinkingLevel: "high" as const,
      };
      store.startLaunchExecution("sdk-worker");
      store.resolveMessage(
        "sdk-worker",
        launched.dashboard.unresolvedInbox[0]?.id ?? "",
        "worker",
        "Handled the inbox item",
      );
      const execution = await runWorkerLaunch(launch, undefined, undefined, sdkSessionConfig);
      expect(execution.status).toBe("completed");
      expect(execution.output).toContain("SDK output");
      expect(createAgentSessionMock).toHaveBeenCalledTimes(1);
      const sdkOptions = createAgentSessionMock.mock.calls[0]?.[0];
      expect(sdkOptions?.cwd).toBe(cwd);
      expect(sdkOptions?.agentDir).toBe("/tmp/omp-agent");
      expect(sdkOptions?.modelRegistry).toBe(sdkSessionConfig.modelRegistry);
      expect(sdkOptions?.model).toBe(sdkSessionConfig.model);
      expect(sdkOptions?.thinkingLevel).toBe("high");
      expect(sdkOptions?.tools).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "read", cwd: launch.workspacePath }),
          expect.objectContaining({ name: "bash", cwd: launch.workspacePath }),
        ]),
      );
      const loadedExtensions =
        sdkOptions?.resourceLoader?.getExtensions().extensions.map((extension) => extension.resolvedPath) ?? [];
      expect(loadedExtensions).toContain(join(cwd, "packages", "demo-extension", "index.ts"));
      const finished = createWorkerStore(cwd).finishLaunchExecution("sdk-worker", execution);
      expect(finished.state.lastRuntimeKind).toBe("sdk");
      expect(finished.state.status).toBe("ready");
      expect(finished.state.latestTelemetry.state).toBe("idle");
      expect(finished.launch?.status).toBe("completed");
      expect(finished.launch?.note).toContain("SDK output");
    } finally {
      cleanup();
    }
  }, 90000);

  it("fails a completed launch that leaves no durable worker progress behind", async () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      const ticketStore = createTicketStore(cwd);
      await ticketStore.initLedgerAsync();
      await ticketStore.createTicketAsync({ title: "Ticket", summary: "summary", context: "context", plan: "plan" });
      const store = createWorkerStore(cwd);
      store.createWorker({ title: "No Progress Worker", linkedRefs: { ticketIds: ["t-0001"] } });
      store.appendMessage("no-progress-worker", {
        direction: "manager_to_worker",
        kind: "assignment",
        text: "Process this assignment durably",
      });

      store.prepareLaunch("no-progress-worker", true, "resume", "sdk");
      store.startLaunchExecution("no-progress-worker");
      const finished = store.finishLaunchExecution("no-progress-worker", {
        status: "completed",
        output: "I looked at it",
        error: null,
      });

      expect(finished.state.status).toBe("failed");
      expect(finished.state.latestTelemetry.state).toBe("blocked");
      expect(finished.launch?.status).toBe("failed");
      expect(finished.launch?.note).toContain("made no durable progress");
      expect(finished.launch?.note).toContain("1 actionable inbox item(s)");
      expect(finished.dashboard.unresolvedInbox).toHaveLength(1);
    } finally {
      cleanup();
    }
  }, 90000);

  it("keeps rpc runtime as a bounded fallback seam", async () => {
    const result = await runWorkerLaunch({
      workerId: "rpc-worker",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      runtime: "rpc",
      resume: false,
      workspacePath: ".",
      branch: "rpc-worker",
      baseRef: "HEAD",
      launchPrompt: "Prompt",
      command: ["rpc-session", "--mode", "rpc"],
      pid: null,
      status: "prepared",
      note: "rpc seam",
    });
    expect(result.status).toBe("failed");
    expect(result.error).toContain("RPC worker runtime fallback is not implemented yet");
  });

  it("returns a failed execution result when sdk session setup fails", async () => {
    const { createAgentSession } = await import("@mariozechner/pi-coding-agent");
    const createAgentSessionMock = vi.mocked(createAgentSession);
    createAgentSessionMock.mockRejectedValueOnce(new Error("SDK setup failed"));

    const result = await runWorkerLaunch({
      workerId: "sdk-failure-worker",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      runtime: "sdk",
      resume: false,
      workspacePath: ".",
      branch: "sdk-failure-worker",
      baseRef: "HEAD",
      launchPrompt: "Prompt",
      command: ["sdk-session", "Prompt"],
      pid: null,
      status: "prepared",
      note: "sdk setup test",
    });
    expect(result.status).toBe("failed");
    expect(result.error).toContain("SDK setup failed");
  });

  it("surfaces sdk assistant error turns instead of reporting empty completion", async () => {
    const { createAgentSession } = await import("@mariozechner/pi-coding-agent");
    const createAgentSessionMock = vi.mocked(createAgentSession);
    const sessionMock: {
      listener?: (event: unknown) => void;
      subscribe: (listener: (event: unknown) => void) => () => void;
      prompt: (_text: string) => Promise<void>;
      abort: () => void;
      dispose: () => Promise<void>;
    } = {
      subscribe(listener: (event: unknown) => void) {
        sessionMock.listener = listener;
        return () => undefined;
      },
      async prompt(_text: string) {
        sessionMock.listener?.({
          type: "message_end",
          message: {
            role: "assistant",
            content: [],
            stopReason: "error",
            errorMessage: "Provider quota exceeded",
          },
        });
      },
      abort() {},
      async dispose() {},
    };
    createAgentSessionMock.mockResolvedValueOnce({ session: sessionMock } as never);

    const result = await runWorkerLaunch({
      workerId: "sdk-error-worker",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      runtime: "sdk",
      resume: true,
      workspacePath: ".",
      branch: "sdk-error-worker",
      baseRef: "HEAD",
      launchPrompt: "Prompt",
      command: ["sdk-session", "Prompt"],
      pid: null,
      status: "prepared",
      note: "sdk error test",
    });

    expect(result.status).toBe("failed");
    expect(result.output).toBe("");
    expect(result.error).toBe("Provider quota exceeded");
  });

  it("fails sdk launches that end with an empty assistant turn and no tool activity", async () => {
    const { createAgentSession } = await import("@mariozechner/pi-coding-agent");
    const createAgentSessionMock = vi.mocked(createAgentSession);
    const sessionMock: {
      listener?: (event: unknown) => void;
      subscribe: (listener: (event: unknown) => void) => () => void;
      prompt: (_text: string) => Promise<void>;
      abort: () => void;
      dispose: () => Promise<void>;
    } = {
      subscribe(listener: (event: unknown) => void) {
        sessionMock.listener = listener;
        return () => undefined;
      },
      async prompt(_text: string) {
        sessionMock.listener?.({
          type: "message_end",
          message: {
            role: "assistant",
            content: [],
            stopReason: "end_turn",
          },
        });
      },
      abort() {},
      async dispose() {},
    };
    createAgentSessionMock.mockResolvedValueOnce({ session: sessionMock } as never);

    const result = await runWorkerLaunch({
      workerId: "sdk-empty-turn-worker",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      runtime: "sdk",
      resume: true,
      workspacePath: ".",
      branch: "sdk-empty-turn-worker",
      baseRef: "HEAD",
      launchPrompt: "Prompt",
      command: ["sdk-session", "Prompt"],
      pid: null,
      status: "prepared",
      note: "sdk empty turn test",
    });

    expect(result.status).toBe("failed");
    expect(result.output).toBe("");
    expect(result.error).toBe("SDK worker session ended with an empty assistant turn (stopReason: end_turn)");
  });

  it("resolves workspace extension entries from the worker manifest and ignores missing files", () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      writeWorkspaceFile(cwd, "packages/present-extension/index.ts", "export default {}\n");
      writeFileSync(
        join(cwd, "package.json"),
        `${JSON.stringify(
          {
            name: "runtime-fixture",
            pi: {
              extensions: ["./packages/present-extension/index.ts", "./packages/missing-extension/index.ts", 42],
            },
          },
          null,
          2,
        )}\n`,
        "utf-8",
      );

      expect(resolveWorkspaceExtensionPaths(cwd)).toEqual([join(cwd, "packages", "present-extension", "index.ts")]);
      expect(resolveWorkspaceExtensionPaths(join(cwd, "missing-workspace"))).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("reconstructs runtime kind and scheduler visibility from durable state", async () => {
    const { cwd, cleanup } = createWorkspace();
    try {
      const ticketStore = createTicketStore(cwd);
      await ticketStore.initLedgerAsync();
      await ticketStore.createTicketAsync({ title: "Ticket", summary: "summary", context: "context", plan: "plan" });

      const store = createWorkerStore(cwd);
      store.createWorker({ title: "Recovery Worker", linkedRefs: { ticketIds: ["t-0001"] } });
      store.appendMessage("recovery-worker", {
        direction: "manager_to_worker",
        kind: "assignment",
        text: "Resume me when ready",
      });
      store.prepareLaunch("recovery-worker", false, "sdk prepare", "sdk");
      await store.runManagerSchedulerPass();

      const reread = createWorkerStore(cwd).readWorker("recovery-worker");
      expect(reread.launch?.runtime).toBe("sdk");
      expect(reread.state.lastRuntimeKind).toBeNull();
      expect(reread.summary.runtimeKind).toBeNull();
      expect(reread.state.lastSchedulerSummary).toContain("resume candidate");
      expect(reread.packet).toContain("Pending approval:");
    } finally {
      cleanup();
    }
  }, 90000);
});
