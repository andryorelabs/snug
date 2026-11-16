import { readFileSync } from "node:fs";
import { defineConfig } from "oxlint";
import type { DummyRuleMap, OxlintConfig } from "oxlint";

import baseConfig from "./oxlint.config.ts";

/**
 * Shape of the vendored shared baseline, `scripts/oxlint-baseline.json`.
 */
interface OxlintBaseline {
  plugins: NonNullable<OxlintConfig["plugins"]>;
  rules: DummyRuleMap;
  overrides: {
    files: string[];
    plugins: NonNullable<OxlintConfig["plugins"]>;
    rules: DummyRuleMap;
  }[];
  ignorePatterns: string[];
}

/**
 * Baseline rules this repo does not take: snug tests run on Vitest, so the
 * `bun:test` focused-test rule has nothing to check.
 */
const EXCLUDED_BASELINE_RULES = new Set(["local/no-bun-test-only"]);

/**
 * Namespace the vendored baseline plugin is registered under here, because
 * `local` already names this repo's own plugin.
 */
const BASELINE_PLUGIN_NAME = "baseline";

const baseline = JSON.parse(
  readFileSync(new URL("scripts/oxlint-baseline.json", import.meta.url), "utf8"),
) as OxlintBaseline;

/**
 * Keeps every baseline rule except the excluded ones, moving the baseline
 * plugin's `local/` rules to its own namespace.
 * @param rules A rule map from the vendored baseline.
 * @returns The map this repo's baseline config applies.
 */
function adaptRules(rules: DummyRuleMap): DummyRuleMap {
  return Object.fromEntries(
    Object.entries(rules)
      .filter(([name]) => !EXCLUDED_BASELINE_RULES.has(name))
      .map(([name, setting]) => [
        name.startsWith("local/") ? `${BASELINE_PLUGIN_NAME}/${name.slice("local/".length)}` : name,
        setting,
      ]),
  );
}

/**
 * The shared Oxlint baseline staged on top of this repo's current config,
 * used by `bun run lint:baseline -- <path>` until every violation is fixed
 * and the baseline replaces `oxlint.config.ts`.
 */
export default defineConfig({
  ...baseConfig,
  plugins: [...new Set([...(baseConfig.plugins ?? []), ...baseline.plugins])],
  categories: { ...baseConfig.categories, correctness: "error" },
  options: {
    ...baseConfig.options,
    typeAware: true,
    reportUnusedDisableDirectives: "error",
  },
  jsPlugins: [
    ...(baseConfig.jsPlugins ?? []),
    {
      name: BASELINE_PLUGIN_NAME,
      specifier: "./scripts/oxlint-baseline-plugin.ts",
    },
  ],
  rules: { ...baseConfig.rules, ...adaptRules(baseline.rules) },
  overrides: [
    ...(baseConfig.overrides ?? []),
    ...baseline.overrides.map((override) => ({
      ...override,
      rules: adaptRules(override.rules),
    })),
  ],
  ignorePatterns: [...new Set([...(baseConfig.ignorePatterns ?? []), ...baseline.ignorePatterns])],
});
