import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROMPTS_DIR = dirname(fileURLToPath(import.meta.url));
const BASE_GUIDANCE_PATH = join(PROMPTS_DIR, "base-ralph-guidance.md");
const BASE_GUIDANCE = readFileSync(BASE_GUIDANCE_PATH, "utf-8").trim();

export function getBaseRalphGuidance(): string {
  return BASE_GUIDANCE;
}

export function buildRalphSystemPrompt(_cwd: string): string {
  return `${BASE_GUIDANCE}\n\nRalph state is persisted in SQLite via pi-storage. Prefer durable Ralph packets and explicit policy decisions over ad hoc long-running transcripts.`;
}
