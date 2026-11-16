import { readFileSync } from "node:fs";
import JSON5 from "json5";
import { describe, expect, test } from "vitest";

import { isRecord, parseJsonAs } from "./json-guards";
interface PackageRule {
  groupName?: string;
  matchDepNames?: string[];
  matchPackageNames?: string[];
  matchManagers?: string[];
  rangeStrategy?: string;
  automerge?: boolean;
  enabled?: boolean;
  matchDepTypes?: string[];
}

interface CustomManager {
  depNameTemplate?: string;
}

interface RenovateConfig {
  baseBranchPatterns?: string[];
  enabledManagers?: string[];
  customManagers?: CustomManager[];
  packageRules: PackageRule[];
}

const config = JSON5.parse<RenovateConfig>(
  readFileSync(new URL("../renovate.json5", import.meta.url), "utf8"),
);

/**
 * Toolchain pin groups (standard rule F5) and the dependencies each one owns.
 */
const PIN_GROUPS: Readonly<Record<string, readonly string[]>> = {
  oxc: ["oxlint", "oxlint-tsgolint", "oxfmt"],
  typescript7: ["typescript7"],
  bun: ["bun", "@types/bun"],
};

/**
 * Tells whether a Renovate name matcher matches a dependency name.
 * @param pattern An exact name or a trailing `**` glob.
 * @param name The dependency name.
 * @returns True when the matcher selects the dependency.
 */
function isNameMatching(pattern: string, name: string): boolean {
  return pattern.endsWith("**") ? name.startsWith(pattern.slice(0, -2)) : pattern === name;
}

/**
 * Tells whether a rule can apply to a dependency: it filters by no name, or names it.
 * @param rule A `packageRules` entry.
 * @param dependencyName The `depName` Renovate extracts, such as `oxlint`.
 * @returns True when the rule may select the dependency.
 */
function canRuleApply(rule: PackageRule, dependencyName: string): boolean {
  const names = [...(rule.matchDepNames ?? []), ...(rule.matchPackageNames ?? [])];
  return names.length === 0 || names.some((pattern) => isNameMatching(pattern, dependencyName));
}

/**
 * Resolves the automerge value the last applicable rule leaves on a
 * dependency, as Renovate applies `packageRules` in order and later rules win.
 * @param rules The package rules, in config order.
 * @param dependencyName The `depName` Renovate extracts, such as `oxlint`.
 * @returns True when the dependency ends up automerged.
 */
function isAutomergeEffective(rules: readonly PackageRule[], dependencyName: string): boolean {
  let isAutomerged = false;
  for (const rule of rules) {
    if (rule.automerge !== undefined && canRuleApply(rule, dependencyName)) {
      isAutomerged = rule.automerge;
    }
  }
  return isAutomerged;
}

/**
 * Lists every way a config breaks the toolchain pin-group policy.
 * @param renovate The parsed Renovate config.
 * @returns One message per problem.
 */
function pinGroupProblems(renovate: RenovateConfig): string[] {
  const problems: string[] = [];
  for (const [groupName, members] of Object.entries(PIN_GROUPS)) {
    const group = renovate.packageRules.find((rule) => rule.groupName === groupName);
    if (group === undefined) {
      problems.push(`no "${groupName}" group`);
      continue;
    }
    if (JSON.stringify(group.matchDepNames) !== JSON.stringify(members)) {
      problems.push(`"${groupName}" group matches ${JSON.stringify(group.matchDepNames)}`);
    }
    if (group.rangeStrategy !== "pin") problems.push(`"${groupName}" group is not exact-pinned`);
    for (const member of members) {
      if (isAutomergeEffective(renovate.packageRules, member)) {
        problems.push(`${member} ("${groupName}" group) automerges`);
      }
    }
  }
  return problems;
}

/**
 * Lists the pinned dependencies a rule disables, which leaves them unmanaged.
 * @param renovate The parsed Renovate config.
 * @returns The disabled pin-group members.
 */
function disabledPins(renovate: RenovateConfig): string[] {
  return Object.values(PIN_GROUPS)
    .flat()
    .filter((member) =>
      renovate.packageRules.some((rule) => rule.enabled === false && canRuleApply(rule, member)),
    );
}

/**
 * Appends a rule to the real config.
 * @param rule The rule to append.
 * @returns A mutated copy of the config.
 */
function withRule(rule: PackageRule): RenovateConfig {
  return { ...config, packageRules: [...config.packageRules, rule] };
}

/**
 * Changes one group's rule in the real config.
 * @param groupName The group whose rule changes.
 * @param change The fields to override on that rule.
 * @returns A mutated copy of the config.
 */
function withGroupChange(groupName: string, change: Partial<PackageRule>): RenovateConfig {
  return {
    ...config,
    packageRules: config.packageRules.map((rule) =>
      rule.groupName === groupName ? { ...rule, ...change } : rule,
    ),
  };
}

describe("renovate.json5", () => {
  test("targets develop as the base branch", () => {
    expect(config.baseBranchPatterns).toEqual(["develop"]);
  });

  test("every toolchain pin group is exact-pinned and never automerged", () => {
    expect(pinGroupProblems(config)).toEqual([]);
  });

  test("WHEN the oxc group re-enables automerge THEN the policy check fails", () => {
    expect(pinGroupProblems(withGroupChange("oxc", { automerge: true }))).toEqual([
      'oxlint ("oxc" group) automerges',
      'oxlint-tsgolint ("oxc" group) automerges',
      'oxfmt ("oxc" group) automerges',
    ]);
  });

  test("WHEN the typescript7 group re-enables automerge THEN the policy check fails", () => {
    expect(pinGroupProblems(withGroupChange("typescript7", { automerge: true }))).toEqual([
      'typescript7 ("typescript7" group) automerges',
    ]);
  });

  test("WHEN a later broad rule turns automerge on THEN the policy check fails", () => {
    const problems = pinGroupProblems(
      withRule({ matchDepTypes: ["devDependencies"], automerge: true }),
    );
    expect(problems).toContain('oxfmt ("oxc" group) automerges');
    expect(problems).toContain('typescript7 ("typescript7" group) automerges');
  });

  test("WHEN typescript7 rejoins the oxc group THEN the policy check fails", () => {
    const merged = withGroupChange("oxc", {
      matchDepNames: ["oxlint", "oxlint-tsgolint", "oxfmt", "typescript7"],
    });
    expect(pinGroupProblems(merged)).toContain(
      '"oxc" group matches ["oxlint","oxlint-tsgolint","oxfmt","typescript7"]',
    );
  });

  test("no rule disables a toolchain pin, packageManager bun included", () => {
    expect(disabledPins(config)).toEqual([]);
    expect(disabledPins(withRule({ matchPackageNames: ["bun"], enabled: false }))).toEqual(["bun"]);
  });

  test("workflow tool pins are Renovate-managed", () => {
    const managed = (config.customManagers ?? []).map((manager) => manager.depNameTemplate);
    expect(managed).toEqual(expect.arrayContaining(["rhysd/actionlint", "zizmorcore/zizmor"]));
    expect(config.enabledManagers).toBeUndefined();
    expect(
      config.packageRules.filter(
        (rule) => rule.enabled === false && rule.matchManagers?.includes("github-actions"),
      ),
    ).toEqual([]);
  });

  test("no longer carries the retired eslint group", () => {
    expect(config.packageRules.some((rule) => rule.groupName === "eslint")).toBe(false);
  });
});

describe("toolchain pins", () => {
  const manifest = parseJsonAs(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    (
      value,
    ): value is {
      devDependencies: Record<string, string>;
      workspaces: { catalog: Record<string, string> };
    } => isRecord(value) && isRecord(value.devDependencies) && isRecord(value.workspaces),
  );

  test.each(["oxlint", "oxlint-tsgolint", "oxfmt"])("%s is pinned to an exact version", (name) => {
    expect(manifest.devDependencies[name]).toMatch(/^\d+\.\d+\.\d+/);
  });

  test("typescript7 is pinned to an exact version", () => {
    expect(manifest.workspaces.catalog.typescript7).toMatch(/^npm:typescript@\d+\.\d+\.\d+/);
  });
});
