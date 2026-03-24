import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/pi-loom/**/__tests__/**/*.test.ts"],
  },
});
