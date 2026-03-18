import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROMPTS_DIR = dirname(fileURLToPath(import.meta.url));
const BASE_GUIDANCE_PATH = join(PROMPTS_DIR, "base-ticketing-guidance.md");
const BASE_GUIDANCE = readFileSync(BASE_GUIDANCE_PATH, "utf-8").trim();

export function getBaseTicketingGuidance(): string {
  return BASE_GUIDANCE;
}

export function buildTicketingSystemPrompt(_cwd: string): string {
  return `${BASE_GUIDANCE}\n\nTicket state is persisted in SQLite via pi-storage. Prefer ticket tools for live work state and plan tools for durable multi-ticket execution strategy.`;
}
