import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "packages/*/__tests__/prompt-guidance.test.ts",
      "packages/*/__tests__/attachments.test.ts",
      "packages/*/__tests__/checkpoints.test.ts",
      "packages/*/__tests__/journal.test.ts",
      "packages/*/__tests__/graph.test.ts",
      "packages/*/__tests__/analysis.test.ts",
      "packages/*/__tests__/checklist.test.ts",
      "packages/*/__tests__/backend-contract.test.ts",
      "packages/*/__tests__/contract.test.ts",
    ],
  },
});
