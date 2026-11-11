import { defineConfig } from "vitest/config";

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
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      thresholds: { lines: 22, statements: 20, branches: 30, functions: 3 },
    },
  },
});
