import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROMPTS_DIR = dirname(fileURLToPath(import.meta.url));
const BASE_GUIDANCE_PATH = join(PROMPTS_DIR, "base-worker-guidance.md");
const BASE_GUIDANCE = readFileSync(BASE_GUIDANCE_PATH, "utf-8").trim();

export function getBaseWorkerGuidance(): string {
  return BASE_GUIDANCE;
}

export function buildWorkerSystemPrompt(_cwd: string): string {
  return `${BASE_GUIDANCE}\n\nWorker state is persisted in SQLite via pi-storage. Prefer manager-first orchestration, durable manager state, and explicit operator review plus worker outcome recording between Ralph iterations over transcript-heavy coordination.`;
}
