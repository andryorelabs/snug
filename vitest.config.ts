import { defineConfig } from "vitest/config";

import { coverageThresholds } from "./scripts/coverage-floors.ts";

/**
 * Keeps `isolate: true`: `isolate: false` gave no consistent speed-up on the
 * tooling suites (import-bound, 22 files), so the safer default stays.
 */
export default defineConfig({
  test: {
    isolate: true,
    testTimeout: 30_000,
    include: [
      "scripts/**/*.test.ts",
      "eslint-rules/**/*.test.ts",
      "oxlint-plugins/**/*.test.ts",
      "docs/adr/**/*.test.ts",
      "docs/brand/**/*.test.ts",
      ".claude/hooks/**/*.test.ts",
    ],
    coverage: {
      provider: "v8",
      include: ["scripts/**/*.ts", "eslint-rules/**/*.mjs", "oxlint-plugins/**/*.mjs"],
      exclude: [
        "scripts/**/*.test.ts",
        "eslint-rules/**/*.test.ts",
        "oxlint-plugins/**/*.test.ts",
        "scripts/lint-parity-run.ts",
        "scripts/oxlint-baseline-plugin.ts",
        "scripts/**/*.d.ts",
      ],
      reporter: ["text", "lcov", "json-summary"],
      thresholds: coverageThresholds("."),
    },
  },
});
