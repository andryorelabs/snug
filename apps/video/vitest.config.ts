import { defineConfig } from "vitest/config";

import { coverageThresholds } from "../../scripts/coverage-floors.ts";

/**
 * Keeps `isolate: true`: the suite is a single test file, so sharing the
 * module registry saves nothing measurable.
 */
export default defineConfig({
  test: {
    isolate: true,
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      thresholds: coverageThresholds("apps/video"),
    },
  },
});
