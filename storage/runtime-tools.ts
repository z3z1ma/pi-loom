export const PI_LOOM_DISABLED_TOOLS_ENV = "PI_LOOM_DISABLED_TOOLS";

function normalizeToolName(toolName: string | undefined): string | null {
  const normalized = toolName?.trim();
  return normalized ? normalized : null;
}

function parseDisabledToolNames(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((entry) => normalizeToolName(entry))
    .filter((entry): entry is string => entry !== null);
}

export function readDisabledRuntimeTools(env: Record<string, string | undefined> = process.env): Set<string> {
  return new Set(parseDisabledToolNames(env[PI_LOOM_DISABLED_TOOLS_ENV]));
}

export function isRuntimeToolDisabled(
  toolName: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const normalizedToolName = normalizeToolName(toolName);
  return normalizedToolName ? readDisabledRuntimeTools(env).has(normalizedToolName) : false;
}

export function withDisabledRuntimeTools(
  env: Record<string, string | undefined>,
  toolNames: readonly string[],
  inheritedEnv: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const disabledTools = new Set<string>([...readDisabledRuntimeTools(inheritedEnv), ...readDisabledRuntimeTools(env)]);
  for (const toolName of toolNames) {
    const normalizedToolName = normalizeToolName(toolName);
    if (normalizedToolName) {
      disabledTools.add(normalizedToolName);
    }
  }

  const nextEnv = Object.fromEntries(
    Object.entries(env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0,
    ),
  );
  if (disabledTools.size > 0) {
    nextEnv[PI_LOOM_DISABLED_TOOLS_ENV] = [...disabledTools].sort().join(",");
  }
  return nextEnv;
}
