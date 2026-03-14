import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const PROMPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const BASE_GUIDANCE_PATH = path.join(PROMPTS_DIR, "base-constitutional-guidance.md");
const BASE_GUIDANCE = fs.readFileSync(BASE_GUIDANCE_PATH, "utf-8").trim();

export function getBaseConstitutionalGuidance(): string {
  return BASE_GUIDANCE;
}

export function buildConstitutionalSystemPrompt(cwd: string): string {
  return `${BASE_GUIDANCE}\n\nWorkspace constitutional memory root: ${path.join(cwd, ".loom", "constitution")}\nWorkspace constitutional brief: ${path.join(cwd, ".loom", "constitution", "brief.md")}\nConsult constitutional memory before making strategic, roadmap, or constraint-sensitive decisions.`;
}
