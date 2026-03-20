import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROMPTS_DIR = dirname(fileURLToPath(import.meta.url));
const BASE_GUIDANCE_PATH = join(PROMPTS_DIR, "base-chief-guidance.md");
const BASE_GUIDANCE = readFileSync(BASE_GUIDANCE_PATH, "utf-8").trim();

export function getBaseChiefGuidance(): string {
  return BASE_GUIDANCE;
}

export function buildChiefSystemPrompt(_cwd: string): string {
  return `${BASE_GUIDANCE}\n\nChief state is persisted in SQLite via pi-storage. Prefer manager-first orchestration, manager-as-Ralph-loop execution, and daemon polling between iterations over transcript-heavy coordination.`;
}
