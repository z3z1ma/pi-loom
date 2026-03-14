import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROMPTS_DIR = dirname(fileURLToPath(import.meta.url));
const BASE_GUIDANCE_PATH = join(PROMPTS_DIR, "base-docs-guidance.md");
const BASE_GUIDANCE = readFileSync(BASE_GUIDANCE_PATH, "utf-8").trim();

export function getBaseDocsGuidance(): string {
  return BASE_GUIDANCE;
}

export function buildDocsSystemPrompt(cwd: string): string {
  return `${BASE_GUIDANCE}\n\nWorkspace docs memory root: ${join(cwd, ".loom", "docs")}\nPrefer docs packets and durable high-level documentation over chat-only explanations.`;
}
