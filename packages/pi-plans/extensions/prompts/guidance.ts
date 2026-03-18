import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROMPTS_DIR = dirname(fileURLToPath(import.meta.url));
const BASE_GUIDANCE_PATH = join(PROMPTS_DIR, "base-plan-guidance.md");
const BASE_GUIDANCE = readFileSync(BASE_GUIDANCE_PATH, "utf-8").trim();

export function getBasePlanGuidance(): string {
  return BASE_GUIDANCE;
}

export function buildPlanSystemPrompt(_cwd: string): string {
  return `${BASE_GUIDANCE}\n\nPlan state is persisted in SQLite via pi-storage. Prefer plan packets for durable execution strategy and ticket tools for the live execution state.`;
}
