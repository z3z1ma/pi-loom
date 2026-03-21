import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface FakeHarnessOutcome {
  stopReason?: string;
  text?: string;
  errorMessage?: string;
  waitForAbort?: boolean;
  deferAssistantUntilSessionIdle?: boolean;
}

export interface FakeHarnessHookContext {
  phase: "prompt" | "sessionWaitForIdle" | "agentWaitForIdle" | "abort";
  promptText?: string;
  sessionOptions?: Record<string, unknown>;
  env: NodeJS.ProcessEnv;
  outcome: FakeHarnessOutcome;
  emitEvent: (event: unknown) => void;
}

declare global {
  // eslint-disable-next-line no-var
  var __piLoomHarnessCalls: unknown[] | undefined;
  // eslint-disable-next-line no-var
  var __piLoomHarnessOutcome: FakeHarnessOutcome | undefined;
  // eslint-disable-next-line no-var
  var __piLoomHarnessHook: ((context: FakeHarnessHookContext) => void | Promise<void>) | undefined;
}

export function resetFakeHarnessState(): void {
  globalThis.__piLoomHarnessCalls = [];
  globalThis.__piLoomHarnessOutcome = undefined;
  globalThis.__piLoomHarnessHook = undefined;
}

export function clearFakeHarnessState(): void {
  delete globalThis.__piLoomHarnessCalls;
  delete globalThis.__piLoomHarnessOutcome;
  delete globalThis.__piLoomHarnessHook;
}

export function createFakeHarnessPackage(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "pi-loom-harness-"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify(
      {
        name: "@oh-my-pi/pi-coding-agent",
        type: "module",
        main: "./index.mjs",
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(root, "index.mjs"),
    `
class FakeSession {
  constructor(options) {
    this.options = options;
    this.state = { messages: [] };
    this.listeners = [];
    this.pendingPromptResolve = null;
    this.messageDelivered = false;
    this.bindings = null;
    this.agent = {
      waitForIdle: async () => {
        globalThis.__piLoomHarnessCalls.push({ type: "agentWaitForIdle" });
        await this.runHook("agentWaitForIdle");
      },
    };
    this.modelRegistry = {
      find(provider, modelId) {
        globalThis.__piLoomHarnessCalls.push({ type: "modelRegistryFind", provider, modelId });
        return { provider, id: modelId, reasoning: true };
      },
    };
  }

  currentOutcome() {
    return globalThis.__piLoomHarnessOutcome ?? { stopReason: "stop", text: "session runtime ok" };
  }

  async runHook(phase, promptText) {
    await globalThis.__piLoomHarnessHook?.({
      phase,
      promptText,
      sessionOptions: this.options,
      env: { ...process.env },
      outcome: this.currentOutcome(),
      emitEvent: (event) => this.emitEvent(event),
    });
  }

  emitEvent(event) {
    globalThis.__piLoomHarnessCalls.push({ type: "emitEvent", event });
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  emitAssistantMessage(outcome = this.currentOutcome()) {
    if (this.messageDelivered) {
      return;
    }
    this.messageDelivered = true;
    const message = {
      role: "assistant",
      stopReason: outcome.stopReason ?? "stop",
      errorMessage: outcome.errorMessage,
      content: outcome.text ? [{ type: "text", text: outcome.text }] : [],
    };
    this.state.messages.push(message);
    this.emitEvent({ type: "message_end", message });
  }

  async bindExtensions(bindings) {
    this.bindings = bindings;
    globalThis.__piLoomHarnessCalls.push({ type: "bindExtensions", bindings });
  }

  getAllTools() {
    return [{ name: "read" }, { name: "ralph_checkpoint" }, { name: "manager_record" }];
  }

  async setActiveToolsByName(toolNames) {
    globalThis.__piLoomHarnessCalls.push({ type: "setActiveTools", toolNames });
  }

  async setModel(model) {
    globalThis.__piLoomHarnessCalls.push({ type: "setModel", model });
  }

  async newSession(options) {
    globalThis.__piLoomHarnessCalls.push({ type: "newSession", options });
    return true;
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((candidate) => candidate !== listener);
    };
  }

  async prompt(text) {
    globalThis.__piLoomHarnessCalls.push({ type: "prompt", text, env: { ...process.env } });
    const outcome = this.currentOutcome();
    await this.runHook("prompt", text);
    if (outcome.waitForAbort) {
      return new Promise((resolve) => {
        this.pendingPromptResolve = resolve;
      });
    }
    if (!outcome.deferAssistantUntilSessionIdle) {
      this.emitAssistantMessage(outcome);
    }
  }

  async waitForIdle() {
    globalThis.__piLoomHarnessCalls.push({ type: "sessionWaitForIdle" });
    await this.runHook("sessionWaitForIdle");
    if (this.currentOutcome().deferAssistantUntilSessionIdle) {
      this.emitAssistantMessage(this.currentOutcome());
    }
  }

  async abort() {
    globalThis.__piLoomHarnessCalls.push({ type: "abort" });
    await this.runHook("abort");
    this.emitAssistantMessage({
      stopReason: "aborted",
      errorMessage: this.currentOutcome().errorMessage ?? "Aborted",
      text: "",
    });
    this.pendingPromptResolve?.();
    this.pendingPromptResolve = null;
  }

  async dispose() {
    globalThis.__piLoomHarnessCalls.push({ type: "dispose" });
  }
}

export const SessionManager = {
  inMemory(cwd) {
    globalThis.__piLoomHarnessCalls.push({ type: "sessionManagerInMemory", cwd });
    return { cwd };
  },
};

export class DefaultResourceLoader {
  constructor(options) {
    this.options = options;
    globalThis.__piLoomHarnessCalls.push({ type: "resourceLoaderConstructed", options });
  }

  async reload() {
    globalThis.__piLoomHarnessCalls.push({ type: "resourceLoaderReload", options: this.options });
  }
}

export async function createAgentSession(options) {
  globalThis.__piLoomHarnessCalls.push({ type: "createAgentSession", options });
  return { session: new FakeSession(options) };
}
`,
  );

  return {
    root,
    cleanup: () => {
      rmSync(root, { recursive: true, force: true });
    },
  };
}
