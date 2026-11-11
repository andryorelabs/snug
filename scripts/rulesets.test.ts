import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { listWorkflowFiles, readWorkflow } from "./workflow-files";

const RULESETS_DIRECTORY = path.resolve(import.meta.dirname, "../.github/rulesets");
const GITHUB_ACTIONS_INTEGRATION_ID = 15_368;
const REQUIRED_CHECKS = ["CI passed", "Validate PR title", "Check markdown links"];
const MATRIX_EXPRESSION_PATTERN = /\$\{\{\s*matrix\.([\w-]+)\s*\}\}/g;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

/**
 * Lists a job's matrix combinations: the product of its list keys, then each
 * `include` entry.
 * @param job One parsed workflow job.
 * @returns One record per combination, or a single empty one without a matrix.
 */
function listMatrixCombinations(job: JsonRecord): JsonRecord[] {
  const matrix = asRecord(job["strategy"])["matrix"];
  if (!isRecord(matrix)) return [{}];
  const listedKeys = Object.entries(matrix).filter(
    ([key]) => key !== "include" && key !== "exclude",
  );
  let product: JsonRecord[] = listedKeys.length === 0 ? [] : [{}];
  for (const [key, values] of listedKeys) {
    product = product.flatMap((combination) =>
      asArray(values).map((value) => ({ ...combination, [key]: value })),
    );
  }
  return [...product, ...asArray(matrix["include"]).filter((entry) => isRecord(entry))];
}

/**
 * Lists the check names a workflow reports: each job's `name` with every
 * `matrix.<key>` expression expanded per combination, or the job id when it has
 * no name. A name still holding an expression is only known at run time and is
 * left out.
 * @param workflow A parsed workflow document.
 * @returns The check names, in job order.
 */
function listCheckNames(workflow: unknown): string[] {
  return Object.entries(asRecord(asRecord(workflow)["jobs"])).flatMap(([id, job]) => {
    if (!isRecord(job)) return [];
    const name = job["name"];
    if (name === undefined) return id;
    if (typeof name !== "string") return [];
    const expanded = listMatrixCombinations(job).map((combination) =>
      name.replaceAll(MATRIX_EXPRESSION_PATTERN, (expression, key: string) => {
        const value = combination[key];
        return typeof value === "string" || typeof value === "number" ? String(value) : expression;
      }),
    );
    return [...new Set(expanded)].filter((checkName) => !checkName.includes("${{"));
  });
}

function listRules(ruleset: unknown): JsonRecord[] {
  return asArray(asRecord(ruleset)["rules"]).filter((rule) => isRecord(rule));
}

function findRule(ruleset: unknown, type: string): JsonRecord | undefined {
  return listRules(ruleset).find((rule) => rule["type"] === type);
}

function ruleParameters(ruleset: unknown, type: string): JsonRecord {
  return asRecord(findRule(ruleset, type)?.["parameters"]);
}

function listRequiredStatusChecks(ruleset: unknown): JsonRecord[] {
  return asArray(
    ruleParameters(ruleset, "required_status_checks")["required_status_checks"],
  ).filter((check) => isRecord(check));
}

function listRequiredCheckNames(ruleset: unknown): string[] {
  return listRequiredStatusChecks(ruleset)
    .map((check) => check["context"])
    .filter((context) => typeof context === "string");
}

/**
 * Finds the required checks of a ruleset that no workflow job reports.
 * @param file The ruleset file name, used in the problem line.
 * @param ruleset The parsed ruleset.
 * @param checkNames Every check name the workflows report.
 * @returns One line per required check without a matching job name.
 */
function findRulesetProblems(
  file: string,
  ruleset: unknown,
  checkNames: ReadonlySet<string>,
): string[] {
  return listRequiredCheckNames(ruleset)
    .filter((context) => !checkNames.has(context))
    .map((context) => `${file} requires check "${context}" but no workflow job is named that`);
}

function readRuleset(file: string): unknown {
  return JSON.parse(readFileSync(path.join(RULESETS_DIRECTORY, file), "utf8"));
}

function includedReferences(ruleset: unknown): unknown {
  return asRecord(asRecord(asRecord(ruleset)["conditions"])["ref_name"])["include"];
}

const checkNames = new Set(
  listWorkflowFiles().flatMap((file) => listCheckNames(readWorkflow(file))),
);
const rulesetFiles = readdirSync(RULESETS_DIRECTORY)
  .filter((file) => file.endsWith(".json"))
  .toSorted((first, second) => first.localeCompare(second));
const developRuleset = readRuleset("develop.json");
const mainRuleset = readRuleset("main.json");
const tagsRuleset = readRuleset("tags.json");

describe("workflow check names", () => {
  test("a matrix job name expands to one check per combination", () => {
    const workflow = {
      jobs: {
        e2e: {
          name: "E2E (Playwright ${{ matrix.shard }}/2)",
          strategy: { matrix: { shard: [1, 2] } },
        },
        digest: {
          name: "digest (${{ matrix.os }})",
          strategy: {
            matrix: {
              os: ["ubuntu-latest"],
              include: [{ os: "macos-latest" }],
            },
          },
        },
        dynamic: {
          name: "${{ matrix.label }} (${{ needs.plan.outputs.tier }})",
        },
        plain: { "runs-on": "ubuntu-latest" },
      },
    };

    expect(listCheckNames(workflow)).toEqual([
      "E2E (Playwright 1/2)",
      "E2E (Playwright 2/2)",
      "digest (ubuntu-latest)",
      "digest (macos-latest)",
      "plain",
    ]);
  });

  test("the real workflows report the sharded E2E checks", () => {
    expect(checkNames).toContain("E2E (Playwright 4/4)");
  });
});

describe(".github/rulesets", () => {
  test("holds exactly the develop, main and tags rulesets", () => {
    expect(rulesetFiles).toEqual(["develop.json", "main.json", "tags.json"]);
  });

  test("every required check equals a real workflow job name", () => {
    const problems = rulesetFiles.flatMap((file) =>
      findRulesetProblems(file, readRuleset(file), checkNames),
    );

    expect(problems).toEqual([]);
  });

  test("a required check that no job reports is a problem", () => {
    const ruleset = {
      rules: [
        {
          type: "required_status_checks",
          parameters: {
            required_status_checks: [{ context: "CI passed" }, { context: "Lint everything" }],
          },
        },
      ],
    };

    expect(findRulesetProblems("main.json", ruleset, checkNames)).toEqual([
      'main.json requires check "Lint everything" but no workflow job is named that',
    ]);
  });

  test.each(rulesetFiles)("%s is active with no bypass actors", (file) => {
    const ruleset = asRecord(readRuleset(file));

    expect(ruleset["enforcement"]).toBe("active");
    expect(ruleset["bypass_actors"]).toEqual([]);
  });
});

describe("develop ruleset", () => {
  test("is named develop and targets refs/heads/develop", () => {
    expect(asRecord(developRuleset)["name"]).toBe("develop");
    expect(asRecord(developRuleset)["target"]).toBe("branch");
    expect(includedReferences(developRuleset)).toEqual(["refs/heads/develop"]);
  });

  test.each([
    "deletion",
    "non_fast_forward",
    "required_linear_history",
    "required_signatures",
    "pull_request",
    "required_status_checks",
  ])("has the %s rule", (type) => {
    expect(findRule(developRuleset, type)).toBeDefined();
  });

  test("requires a squash-merged pull request with resolved threads", () => {
    const parameters = ruleParameters(developRuleset, "pull_request");

    expect(parameters["allowed_merge_methods"]).toEqual(["squash"]);
    expect(parameters["required_review_thread_resolution"]).toBe(true);
  });

  test("requires the three checks, strictly, from GitHub Actions", () => {
    const parameters = ruleParameters(developRuleset, "required_status_checks");

    expect(parameters["strict_required_status_checks_policy"]).toBe(true);
    expect(listRequiredCheckNames(developRuleset)).toEqual(REQUIRED_CHECKS);
    expect(
      listRequiredStatusChecks(developRuleset).map((check) => check["integration_id"]),
    ).toEqual(REQUIRED_CHECKS.map(() => GITHUB_ACTIONS_INTEGRATION_ID));
  });
});

describe("main ruleset", () => {
  test("targets the default branch", () => {
    expect(asRecord(mainRuleset)["target"]).toBe("branch");
    expect(includedReferences(mainRuleset)).toEqual(["~DEFAULT_BRANCH"]);
  });

  test.each([
    "deletion",
    "non_fast_forward",
    "required_signatures",
    "pull_request",
    "required_status_checks",
  ])("has the %s rule", (type) => {
    expect(findRule(mainRuleset, type)).toBeDefined();
  });

  test("does not require linear history, so promotions can be merge commits", () => {
    expect(findRule(mainRuleset, "required_linear_history")).toBeUndefined();
  });

  test("allows merge commits only, with resolved threads", () => {
    const parameters = ruleParameters(mainRuleset, "pull_request");

    expect(parameters["allowed_merge_methods"]).toEqual(["merge"]);
    expect(parameters["required_review_thread_resolution"]).toBe(true);
  });

  test("requires the three checks, not strictly, from GitHub Actions", () => {
    const parameters = ruleParameters(mainRuleset, "required_status_checks");

    expect(parameters["strict_required_status_checks_policy"]).toBe(false);
    expect(listRequiredCheckNames(mainRuleset)).toEqual(REQUIRED_CHECKS);
    expect(listRequiredStatusChecks(mainRuleset).map((check) => check["integration_id"])).toEqual(
      REQUIRED_CHECKS.map(() => GITHUB_ACTIONS_INTEGRATION_ID),
    );
  });
});

describe("tags ruleset", () => {
  test("targets version tags", () => {
    expect(asRecord(tagsRuleset)["target"]).toBe("tag");
    expect(includedReferences(tagsRuleset)).toEqual(["refs/tags/v*"]);
  });

  test.each(["deletion", "update"])("has the %s rule", (type) => {
    expect(findRule(tagsRuleset, type)).toBeDefined();
  });
});
