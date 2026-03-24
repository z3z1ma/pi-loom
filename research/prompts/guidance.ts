import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROMPTS_DIR = dirname(fileURLToPath(import.meta.url));
const BASE_GUIDANCE_PATH = join(PROMPTS_DIR, "base-research-guidance.md");
const BASE_GUIDANCE = readFileSync(BASE_GUIDANCE_PATH, "utf-8").trim();

export function getBaseResearchGuidance(): string {
  return BASE_GUIDANCE;
}

export function buildResearchSystemPrompt(_cwd: string): string {
  return `${BASE_GUIDANCE}\n\nResearch state is persisted in SQLite via pi-storage. Prefer research tools before ad-hoc exploratory planning when uncertainty or reusable discovery is present.`;
}
