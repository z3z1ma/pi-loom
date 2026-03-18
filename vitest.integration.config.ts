import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "packages/*/__tests__/commands.test.ts",
      "packages/*/__tests__/store.test.ts",
      "packages/*/__tests__/tools.test.ts",
      "packages/*/__tests__/runtime.test.ts",
      "packages/*/__tests__/dashboard.test.ts",
      "packages/*/__tests__/projection.test.ts",
      "packages/*/__tests__/integration-smoke.test.ts",
      "packages/*/__tests__/ticket-workspace.test.ts",
      "packages/pi-storage/__tests__/catalog.test.ts",
      "packages/pi-storage/__tests__/sync.test.ts",
    ],
    fileParallelism: false,
  },
});
