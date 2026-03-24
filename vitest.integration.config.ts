import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "packages/pi-loom/**/__tests__/index.test.ts",
      "packages/pi-loom/**/__tests__/commands.test.ts",
      "packages/pi-loom/**/__tests__/store.test.ts",
      "packages/pi-loom/**/__tests__/tools.test.ts",
      "packages/pi-loom/**/__tests__/runtime.test.ts",
      "packages/pi-loom/**/__tests__/dashboard.test.ts",
      "packages/pi-loom/**/__tests__/projection.test.ts",
      "packages/pi-loom/**/__tests__/integration-smoke.test.ts",
      "packages/pi-loom/**/__tests__/ticket-workspace.test.ts",
      "packages/pi-loom/storage/__tests__/catalog.test.ts",
      "packages/pi-loom/storage/__tests__/list-query.test.ts",
      "packages/pi-loom/storage/__tests__/list-search.test.ts",
      "packages/pi-loom/storage/__tests__/link-projection-context.test.ts",
      "packages/pi-loom/storage/__tests__/link-projection-execution.test.ts",
      "packages/pi-loom/storage/__tests__/sync.test.ts",
    ],
    fileParallelism: false,
  },
});
