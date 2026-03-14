import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROMPTS_DIR = dirname(fileURLToPath(import.meta.url));
const BASE_GUIDANCE_PATH = join(PROMPTS_DIR, "base-spec-guidance.md");
const BASE_GUIDANCE = readFileSync(BASE_GUIDANCE_PATH, "utf-8").trim();

export function getBaseSpecGuidance(): string {
  return BASE_GUIDANCE;
}

export function buildSpecSystemPrompt(cwd: string): string {
  return `${BASE_GUIDANCE}\n\nWorkspace spec memory root: ${join(cwd, ".loom", "specs")}\nPrefer spec tools before direct ticket generation for non-trivial feature work.`;
}
