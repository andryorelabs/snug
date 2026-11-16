import { readFileSync } from "node:fs";
import type { DummyRuleMap, OxlintConfig } from "oxlint";
import { describe, expect, it } from "vitest";

import oxlintConfig from "../oxlint.config.ts";
import { isRecord, parseJsonAs } from "./json-guards.ts";

/**
 * Shape of the vendored shared baseline, `scripts/oxlint-baseline.json`.
 */
interface OxlintBaseline {
  plugins: string[];
  categories: Record<string, string>;
  options: { typeAware: boolean; reportUnusedDisableDirectives: string };
  rules: DummyRuleMap;
  overrides: { files: string[]; plugins: string[]; rules: DummyRuleMap }[];
}

/**
 * Baseline rules this repo does not take, recorded in ADR 0035: tests run on
 * Vitest, so the `bun:test` focused-test rule has nothing to check.
 */
const NOT_APPLICABLE_RULES = new Set(["local/no-bun-test-only"]);

const config: OxlintConfig = oxlintConfig;
/**
 * Checks that a parsed JSON value has the baseline's top-level shape.
 * @param value The parsed document.
 * @returns Whether it is a baseline with rules, options and overrides.
 */
function isOxlintBaseline(value: unknown): value is OxlintBaseline {
  return (
    isRecord(value) &&
    Array.isArray(value.plugins) &&
    isRecord(value.categories) &&
    isRecord(value.options) &&
    isRecord(value.rules) &&
    Array.isArray(value.overrides)
  );
}

const baseline = parseJsonAs(
  readFileSync(new URL("oxlint-baseline.json", import.meta.url), "utf8"),
  isOxlintBaseline,
);

/**
 * Keeps the baseline rules this repo takes.
 * @param rules A rule map from the vendored baseline.
 * @returns The map without the not-applicable rules.
 */
function applicableRules(rules: DummyRuleMap): DummyRuleMap {
  return Object.fromEntries(
    Object.entries(rules).filter(([name]) => !NOT_APPLICABLE_RULES.has(name)),
  );
}

type OxlintOverrideConfig = NonNullable<OxlintConfig["overrides"]>[number];

/**
 * Tells whether an override applies to every file.
 * @param override An entry of the config's `overrides`.
 * @returns Whether its only glob is `**\/*`.
 */
function isCatchAll(override: OxlintOverrideConfig): boolean {
  return override.files.length === 1 && override.files[0] === "**/*";
}

/**
 * Finds baseline rules that a catch-all override sets to something other than
 * the baseline setting. File-scoped overrides are tuned per path and stay out
 * of scope: only a repo-wide relaxation breaks the shared baseline.
 * @param candidate The Oxlint config under test.
 * @param rules The baseline rules the config must keep.
 * @returns Each rule and the differing setting a catch-all override gives it.
 */
function findRelaxingCatchAlls(
  candidate: OxlintConfig,
  rules: DummyRuleMap,
): { name: string; setting: unknown }[] {
  const found: { name: string; setting: unknown }[] = [];
  const overrides = candidate.overrides ?? [];
  for (const override of overrides) {
    if (!isCatchAll(override)) {
      continue;
    }
    const overrideRules = Object.entries(override.rules ?? {});
    for (const [name, setting] of overrideRules) {
      if (Object.hasOwn(rules, name) && JSON.stringify(setting) !== JSON.stringify(rules[name])) {
        found.push({ name, setting });
      }
    }
  }
  return found;
}

const baselineRules = applicableRules(baseline.rules);
const baselineTestOverride = baseline.overrides.find((override) =>
  override.plugins.includes("jest"),
);
const baselineTestRules = applicableRules(baselineTestOverride?.rules ?? {});

describe("shared Oxlint baseline (E10)", () => {
  it("vendors a baseline with rules and a test override", () => {
    expect(Object.keys(baselineRules).length).toBeGreaterThan(80);
    expect(Object.keys(baselineTestRules).length).toBeGreaterThan(0);
  });

  it("sets every baseline rule at exactly the baseline setting", () => {
    for (const [name, setting] of Object.entries(baselineRules)) {
      expect({ name, setting: config.rules?.[name] }).toEqual({
        name,
        setting,
      });
    }
  });

  it("keeps the baseline rules in the first catch-all override", () => {
    const catchAll = config.overrides?.find((override) => isCatchAll(override));
    for (const [name, setting] of Object.entries(baselineRules)) {
      expect({ name, setting: catchAll?.rules?.[name] }).toEqual({
        name,
        setting,
      });
    }
  });

  it("lets no later catch-all override relax a baseline rule", () => {
    expect(findRelaxingCatchAlls(config, baselineRules)).toEqual([]);
  });

  it("detects a baseline rule relaxed by a later catch-all override", () => {
    const [firstRule] = Object.keys(baselineRules);
    const mutated: OxlintConfig = {
      ...config,
      overrides: [
        ...(config.overrides ?? []),
        { files: ["**/*"], rules: { [firstRule ?? ""]: "off" } },
      ],
    };
    expect(findRelaxingCatchAlls(mutated, baselineRules)).toEqual([
      { name: firstRule, setting: "off" },
    ]);
  });

  it("sets the baseline test rules at the baseline setting on test files", () => {
    const testOverride = config.overrides?.find(
      (override) => override.plugins?.includes("jest") === true,
    );
    expect(testOverride?.files).toEqual(baselineTestOverride?.files);
    expect(testOverride?.plugins).toEqual(baselineTestOverride?.plugins);
    for (const [name, setting] of Object.entries(baselineTestRules)) {
      expect({ name, setting: testOverride?.rules?.[name] }).toEqual({
        name,
        setting,
      });
    }
  });

  it("turns on the baseline categories and plugins", () => {
    expect(config.categories).toMatchObject(baseline.categories);
    expect(config.plugins).toEqual(expect.arrayContaining(baseline.plugins));
  });

  it("runs type-aware and reports unused disable directives as errors", () => {
    expect(config.options?.typeAware).toBe(true);
    expect(config.options?.reportUnusedDisableDirectives).toBe("error");
    expect(baseline.options.typeAware).toBe(true);
    expect(baseline.options.reportUnusedDisableDirectives).toBe("error");
  });

  it("keeps typescript/no-deprecated at error", () => {
    expect(config.rules?.["typescript/no-deprecated"]).toBe("error");
  });
});
