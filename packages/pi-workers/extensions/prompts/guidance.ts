import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROMPTS_DIR = dirname(fileURLToPath(import.meta.url));
const BASE_GUIDANCE_PATH = join(PROMPTS_DIR, "base-worker-guidance.md");
const BASE_GUIDANCE = readFileSync(BASE_GUIDANCE_PATH, "utf-8").trim();

export function getBaseWorkerGuidance(): string {
  return BASE_GUIDANCE;
}

export function buildWorkerSystemPrompt(cwd: string): string {
  return `${BASE_GUIDANCE}\n\nWorkspace worker memory root: ${join(cwd, ".loom", "workers")}\nPrefer durable worker records, compact supervision inputs, and explicit manager approval over transcript-heavy coordination.`;
}
