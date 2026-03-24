import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROMPTS_DIR = dirname(fileURLToPath(import.meta.url));
const BASE_GUIDANCE_PATH = join(PROMPTS_DIR, "base-critique-guidance.md");
const BASE_GUIDANCE = readFileSync(BASE_GUIDANCE_PATH, "utf-8").trim();

export function getBaseCritiqueGuidance(): string {
  return BASE_GUIDANCE;
}

export function buildCritiqueSystemPrompt(_cwd: string): string {
  return `${BASE_GUIDANCE}\n\nCritique state is persisted in SQLite via pi-storage. Prefer critique packets and durable findings over inline self-review.`;
}
