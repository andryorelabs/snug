import { defineConfig } from "vitest/config";

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
      ],
      reporter: ["text", "lcov"],
      thresholds: { lines: 91, statements: 91, branches: 83, functions: 90 },
    },
  },
});
