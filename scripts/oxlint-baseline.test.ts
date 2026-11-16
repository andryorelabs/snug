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

  it("keeps the baseline rules in the final catch-all override", () => {
    const catchAll = config.overrides?.find(
      (override) => override.files.length === 1 && override.files[0] === "**/*",
    );
    for (const [name, setting] of Object.entries(baselineRules)) {
      expect({ name, setting: catchAll?.rules?.[name] }).toEqual({
        name,
        setting,
      });
    }
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
