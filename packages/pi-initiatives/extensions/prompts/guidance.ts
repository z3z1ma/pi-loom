import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROMPTS_DIR = dirname(fileURLToPath(import.meta.url));
const BASE_GUIDANCE_PATH = join(PROMPTS_DIR, "base-initiative-guidance.md");
const BASE_GUIDANCE = readFileSync(BASE_GUIDANCE_PATH, "utf-8").trim();

export function getBaseInitiativeGuidance(): string {
  return BASE_GUIDANCE;
}

export function buildInitiativeSystemPrompt(_cwd: string): string {
  return `${BASE_GUIDANCE}\n\nInitiative state is persisted in SQLite via pi-storage. Prefer initiative tools before ad-hoc strategic tracking for program-level work.`;
}
