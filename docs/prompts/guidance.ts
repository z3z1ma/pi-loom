import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isRuntimeToolDisabled } from "#storage/runtime-tools.js";

const PROMPTS_DIR = dirname(fileURLToPath(import.meta.url));
const BASE_GUIDANCE_PATH = join(PROMPTS_DIR, "base-docs-guidance.md");
const BASE_GUIDANCE = readFileSync(BASE_GUIDANCE_PATH, "utf-8").trim();

export function getBaseDocsGuidance(): string {
  return BASE_GUIDANCE;
}

export function buildDocsSystemPrompt(_cwd: string): string {
  const recursionGuardNote = isRuntimeToolDisabled("docs_update")
    ? " This session was launched by docs_update. docs_update is unavailable here to prevent recursive fresh-maintainer launches; persist the bounded revision through docs_write instead."
    : "";
  return `${BASE_GUIDANCE}\n\nDocumentation state is persisted in SQLite via pi-storage. Prefer docs packets and durable high-level documentation over chat-only explanations. Governed docs expose topic ownership, lifecycle, publication truth, and successor state explicitly; update or supersede the current surface instead of fragmenting it with parallel active docs.${recursionGuardNote}`;
}
