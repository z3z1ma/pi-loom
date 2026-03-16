export function isMarkdownBodyProjection(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");

  if (normalized === ".loom/constitution/brief.md") {
    return true;
  }
  if (
    normalized.startsWith(".loom/constitution/") &&
    normalized.endsWith(".md") &&
    !normalized.endsWith("state.json")
  ) {
    return true;
  }
  if (normalized.startsWith(".loom/docs/") && normalized.endsWith("/doc.md")) {
    return true;
  }
  if (normalized.startsWith(".loom/specs/changes/") && /(proposal|design|tasks)\.md$/.test(normalized)) {
    return true;
  }
  if (normalized.startsWith(".loom/specs/capabilities/") && normalized.endsWith(".md")) {
    return true;
  }
  return false;
}

export function isLocalRuntimePath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  return (
    normalized.startsWith(".loom/runtime/") ||
    normalized.endsWith("/launch.json") ||
    normalized.endsWith(".loom/launch.json")
  );
}
