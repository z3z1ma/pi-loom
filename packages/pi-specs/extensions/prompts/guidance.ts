import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROMPTS_DIR = dirname(fileURLToPath(import.meta.url));
const BASE_GUIDANCE_PATH = join(PROMPTS_DIR, "base-spec-guidance.md");
const BASE_GUIDANCE = readFileSync(BASE_GUIDANCE_PATH, "utf-8").trim();

export function getBaseSpecGuidance(): string {
  return BASE_GUIDANCE;
}

export function buildSpecSystemPrompt(_cwd: string): string {
  return `${BASE_GUIDANCE}\n\nSpecification state is persisted in SQLite via pi-storage. Prefer spec tools before planning or ticketing non-trivial feature work, and use plans as the primary bridge from specs into tickets.`;
}
