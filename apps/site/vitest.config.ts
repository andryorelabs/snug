import { defineConfig } from "vitest/config";

import { coverageThresholds } from "../../scripts/coverage-floors.ts";

/**
 * `isolate: false` reuses each worker's module registry across files; measured
 * about 0.7-2 s faster on this suite, which keeps no shared module state.
 */
export default defineConfig({
  test: {
    isolate: false,
    testTimeout: 30_000,
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "json-summary"],
      include: ["src/**/*.ts", "src/components/ThemeMenu.tsx", "src/components/FaqAccordion.tsx"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/*.d.ts"],
      thresholds: coverageThresholds("apps/site"),
    },
  },
});
