import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "constitution/**/__tests__/**/*.test.ts",
      "research/**/__tests__/**/*.test.ts",
      "initiatives/**/__tests__/**/*.test.ts",
      "specs/**/__tests__/**/*.test.ts",
      "plans/**/__tests__/**/*.test.ts",
      "ticketing/**/__tests__/**/*.test.ts",
      "critique/**/__tests__/**/*.test.ts",
      "ralph/**/__tests__/**/*.test.ts",
      "docs/**/__tests__/**/*.test.ts",
      "storage/**/__tests__/**/*.test.ts",
    ],
  },
});
