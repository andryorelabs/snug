import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";
import { parse } from "yaml";

import {
  listWorkflowFiles,
  readWorkflow,
  readWorkflowText,
  type Workflow,
  type WorkflowJob,
  type WorkflowStep,
} from "./workflow-files";

const FULL_SHA_PATTERN = /^[\da-f]{40}$/;
const VERSION_COMMENT_PATTERN = /#\s*v\d+\.\d+\.\d+\s*$/;
const USES_LINE_PATTERN = /^\s*(?:-\s+)?uses:\s*(\S+)(.*)$/;

const MAIN_REF_GUARD = "github.ref == 'refs/heads/main'";
const CODEQL_INIT = "github/codeql-action/init@";
const CODEQL_ANALYZE = "github/codeql-action/analyze@";
const CODEQL_LANGUAGES: readonly string[] = ["javascript-typescript", "actions"];

interface ShardedJob {
  readonly name?: string;
  readonly "runs-on"?: string;
  readonly strategy?: {
    readonly "fail-fast"?: boolean;
    readonly matrix?: { readonly shard?: readonly number[] };
  };
  readonly steps?: readonly WorkflowStep[];
}

/**
 * The `runs-on` expression of every light job (ADR 0031): GitHub-hosted for
 * fork PRs, otherwise the optional `BLACKSMITH_RUNNER` repository variable,
 * falling back to `ubuntu-latest` when it is unset.
 */
const ROUTED_RUNS_ON =
  "${{ github.event.pull_request.head.repo.fork && 'ubuntu-latest' || vars.BLACKSMITH_RUNNER || 'ubuntu-latest' }}";

/**
 * The only jobs, as `<file>:<job>`, allowed to use {@link ROUTED_RUNS_ON}.
 */
const ROUTED_JOBS: readonly string[] = [
  "ci.yml:quality",
  "ci.yml:changes",
  "ci.yml:commitlint",
  "ci.yml:ci-passed",
  "lint-pr.yml:validate-title",
  "lint-docs.yml:check-links",
  "lint-workflows.yml:lint",
  "labels.yml:sync",
];

const FORBIDDEN_RUNNER_LABEL_PATTERN = /^vps-|^self-hosted$/;

/**
 * The artifact the `build-site` job uploads and every E2E shard downloads.
 */
const SITE_DIST_ARTIFACT = "site-dist";

interface SiteBuildJob {
  readonly needs?: unknown;
  readonly outputs?: Record<string, string>;
}

/**
 * Tells whether one line of a `run` script runs `astro build`, directly or
 * through the site's `build` or `test:e2e` scripts.
 * @param line One line of a step's `run` script.
 * @returns True when the line builds the site.
 */
function isSiteBuildLine(line: string): boolean {
  return (
    /\bastro build\b/.test(line) ||
    /--filter=@snug\/site\b/.test(line) ||
    (/\bturbo run (?:\S+ )*test:e2e(?:\s|$)/.test(line) && !line.includes("--filter='!@snug/site'"))
  );
}

interface RunnerJob {
  readonly "runs-on"?: unknown;
  readonly uses?: string;
}

function runnerLabels(runsOn: unknown): string[] {
  if (typeof runsOn === "string") return [runsOn];
  if (Array.isArray(runsOn)) {
    return runsOn.flatMap((entry: unknown) => runnerLabels(entry));
  }
  if (runsOn !== null && typeof runsOn === "object") {
    return Object.values(runsOn).flatMap((entry: unknown) => runnerLabels(entry));
  }
  return [];
}

/**
 * Applies the runner routing rules of ADR 0031 to one workflow.
 * @param fileName The workflow file name, used to build `<file>:<job>` keys.
 * @param source The raw workflow text.
 * @param routedJobs The `<file>:<job>` keys allowed to use the routed runner.
 * @returns One message per violation; empty when the workflow is clean.
 */
function findRunnerViolations(
  fileName: string,
  source: string,
  routedJobs: readonly string[] = ROUTED_JOBS,
): string[] {
  const { jobs } = parse(source) as { jobs?: Record<string, RunnerJob> };
  const violations: string[] = [];
  const jobEntries = Object.entries(jobs ?? {});
  for (const [jobName, job] of jobEntries) {
    const key = `${fileName}:${jobName}`;
    const runsOn = job["runs-on"];
    for (const label of runnerLabels(runsOn)) {
      if (FORBIDDEN_RUNNER_LABEL_PATTERN.test(label)) {
        violations.push(`${key} uses the forbidden runner label ${label}`);
      }
    }
    if (routedJobs.includes(key)) {
      if (runsOn !== ROUTED_RUNS_ON) {
        violations.push(`${key} does not use the routed runs-on expression`);
      }
      continue;
    }
    if (JSON.stringify(job).includes("vars.BLACKSMITH_RUNNER")) {
      violations.push(`${key} reads vars.BLACKSMITH_RUNNER outside the list`);
    }
    if (runsOn !== "ubuntu-latest" && job.uses === undefined) {
      violations.push(`${key} does not use a literal ubuntu-latest`);
    }
  }
  return violations;
}

function collectSteps(workflow: Workflow): WorkflowStep[] {
  return Object.values(workflow.jobs ?? {}).flatMap((job) => job.steps ?? []);
}

function triggerNames(workflow: Workflow): string[] {
  const trigger = workflow.on;
  if (typeof trigger === "string") return [trigger];
  if (Array.isArray(trigger)) return trigger.map(String);
  return trigger !== null && typeof trigger === "object" ? Object.keys(trigger) : [];
}

function hasConcurrencyGroup(workflow: Workflow): boolean {
  const concurrency = workflow.concurrency;
  const group =
    typeof concurrency === "string"
      ? concurrency
      : (concurrency as { group?: unknown } | null | undefined)?.group;
  return typeof group === "string" && group.trim() !== "";
}

function missingTriggers(workflow: Workflow, required: readonly string[]): string[] {
  const present = triggerNames(workflow);
  return required.filter((trigger) => !present.includes(trigger));
}

function needsList(needs: unknown): string[] {
  if (typeof needs === "string") return [needs];
  return Array.isArray(needs) ? needs.map(String) : [];
}

function usesReferences(source: string): { target: string; rest: string }[] {
  return source.split("\n").flatMap((line) => {
    const match = USES_LINE_PATTERN.exec(line);
    return match ? { target: match[1] ?? "", rest: match[2] ?? "" } : [];
  });
}

function uploadArtifactPins(source: string): string[] {
  return usesReferences(source)
    .filter(({ target }) => target.startsWith("actions/upload-artifact@"))
    .map(({ target, rest }) => `${target} ${rest.trim()}`);
}

/**
 * Finds every `actions/upload-artifact` use that drifts from the shared pin.
 * @param source The raw workflow text.
 * @param expectedPin The `target # vX.Y.Z` pin every use must equal.
 * @returns One message per drifting use; empty when all match.
 */
function findUploadArtifactDrift(source: string, expectedPin: string): string[] {
  return uploadArtifactPins(source)
    .filter((pin) => pin !== expectedPin)
    .map((pin) => `${pin} differs from ${expectedPin}`);
}

function isGuardedToMain(condition: string | undefined): boolean {
  const expression = (condition ?? "").replaceAll(/^\s*\$\{\{|\}\}\s*$/g, "");
  return (
    !expression.includes("||") &&
    expression
      .split("&&")
      .map((term) => term.trim())
      .includes(MAIN_REF_GUARD)
  );
}

/**
 * Finds the jobs a non-main ref could run, whatever trigger started the run.
 * @param workflow The parsed workflow document.
 * @returns The names of the jobs whose `if` does not require the main ref.
 */
function findJobsNotGuardedToMain(workflow: Workflow): string[] {
  return Object.entries(workflow.jobs ?? {})
    .filter(([, job]) => !isGuardedToMain(job.if))
    .map(([jobName]) => jobName);
}

function pushBranches(workflow: Workflow): string[] {
  const trigger = workflow.on;
  if (trigger === null || typeof trigger !== "object" || Array.isArray(trigger)) return [];
  const branches = (trigger as { push?: { branches?: unknown } | null }).push?.branches;
  return Array.isArray(branches) ? branches.map(String) : [];
}

function unwrapExpression(value: string): string {
  return value.replaceAll(/^\s*\$\{\{|\}\}\s*$/g, "").trim();
}

/**
 * Evaluates a workflow's `cancel-in-progress` for a run on the given ref.
 * @param workflow The parsed workflow document.
 * @param gitReference The `github.ref` of the run, e.g. `refs/heads/main`.
 * @returns Whether a newer run on that ref cancels the one in progress.
 * @throws {Error} When the expression is not a literal or a conjunction of
 * `github.ref != '<ref>'` terms.
 */
function doesCancelInProgress(workflow: Workflow, gitReference: string): boolean {
  const setting = (workflow.concurrency as { "cancel-in-progress"?: unknown } | undefined)?.[
    "cancel-in-progress"
  ];
  if (typeof setting === "boolean") return setting;
  return unwrapExpression(String(setting))
    .split("&&")
    .every((term) => {
      const match = /^github\.ref != '([^']+)'$/.exec(term.trim());
      if (!match) throw new Error(`unsupported cancel-in-progress term: ${term.trim()}`);
      return match[1] !== gitReference;
    });
}

const PROMOTION_EXCLUSION = "!(github.base_ref == 'main' && github.head_ref == 'develop')";

/**
 * Checks that a job runs on pull requests only and never on a promotion
 * pull request (base `main`, head `develop`).
 * @param condition The job's `if` expression.
 * @returns Whether the condition both requires a pull request and excludes a promotion.
 */
function doesSkipPromotionPullRequests(condition: string | undefined): boolean {
  const terms = unwrapExpression(condition ?? "")
    .replaceAll(/\s+/g, " ")
    .split(/ && (?![^(]*\))/)
    .map((term) => term.trim());
  return (
    terms.every((term) => !term.includes("||")) &&
    terms.includes("github.event_name == 'pull_request'") &&
    terms.includes(PROMOTION_EXCLUSION)
  );
}

/**
 * Checks that an aggregate job always runs and fails only on a failed or
 * cancelled dependency, so a skipped dependency still lets it pass.
 * @param job The aggregate job.
 * @returns Whether a skipped dependency leaves the aggregate job green.
 */
function doesTolerateSkippedNeeds(job: WorkflowJob | undefined): boolean {
  const verdict = (job?.steps ?? [])
    .map((step) => (typeof step.env?.FAILED === "string" ? step.env.FAILED : ""))
    .join("\n");
  return (
    unwrapExpression(job?.if ?? "") === "always()" &&
    verdict.includes("contains(needs.*.result, 'failure')") &&
    !verdict.includes("'skipped'") &&
    !verdict.includes("success")
  );
}

function matrixLanguages(job: WorkflowJob): string[] {
  const languages = job.strategy?.matrix?.language;
  return Array.isArray(languages) ? languages.map(String) : [];
}

/**
 * Checks that CodeQL scans every required language, each under its own
 * category so one language's results never replace another's.
 * @param workflow The parsed CodeQL workflow document.
 * @returns One message per violation; empty when the workflow is clean.
 */
function findCodeqlViolations(workflow: Workflow): string[] {
  const analysisJobs = Object.values(workflow.jobs ?? {}).filter((job) =>
    (job.steps ?? []).some((step) => step.uses?.startsWith(CODEQL_INIT)),
  );
  if (analysisJobs.length === 0) return ["no job initializes CodeQL"];

  const violations: string[] = [];
  const scanned = new Set(analysisJobs.flatMap((job) => matrixLanguages(job)));
  for (const language of CODEQL_LANGUAGES) {
    if (!scanned.has(language)) {
      violations.push(`the language matrix does not scan ${language}`);
    }
  }
  const analysisSteps = analysisJobs.flatMap((job) => job.steps ?? []);
  for (const step of analysisSteps) {
    if (step.uses?.startsWith(CODEQL_INIT) && step.with?.languages !== "${{ matrix.language }}") {
      violations.push("init does not take its language from the matrix");
    }
    if (
      step.uses?.startsWith(CODEQL_ANALYZE) &&
      step.with?.category !== "/language:${{ matrix.language }}"
    ) {
      violations.push("analyze has no per-language category");
    }
  }
  return violations;
}

function isCacheStep(step: WorkflowStep): boolean {
  return /^actions\/cache(?:\/restore|\/save)?@/.test(step.uses ?? "");
}

function cachedPaths(step: WorkflowStep): string[] {
  const path = step.with?.path;
  const lines = typeof path === "string" ? path.split("\n") : [];
  return lines.map((line) => line.trim()).filter((line) => line !== "");
}

function isNodeModulesCache(step: WorkflowStep): boolean {
  return isCacheStep(step) && cachedPaths(step).some((entry) => entry.endsWith("node_modules"));
}

function hasAffectedFlag(step: WorkflowStep): boolean {
  const environmentValues = Object.values(step.env ?? {}).map(String);
  return [step.run ?? "", ...environmentValues].some((text) => text.includes("--affected"));
}

/**
 * Applies every repository-wide workflow hygiene rule to one workflow.
 * @param workflow The parsed workflow document.
 * @param source The raw workflow text, needed for `uses:` version comments.
 * @returns One message per violation; empty when the workflow is clean.
 */
function findViolations(workflow: Workflow, source: string): string[] {
  const violations: string[] = [];
  const jobs = Object.entries(workflow.jobs ?? {});

  if (triggerNames(workflow).includes("pull_request_target")) {
    violations.push("uses the pull_request_target trigger");
  }

  if (triggerNames(workflow).includes("pull_request") && !hasConcurrencyGroup(workflow)) {
    violations.push("pull_request workflow has no concurrency group");
  }

  const topLevel = JSON.stringify(workflow.permissions);
  if (topLevel !== '{"contents":"read"}' && topLevel !== "{}") {
    violations.push("top-level permissions are not contents: read or empty");
  }

  for (const [jobName, job] of jobs) {
    const timeout = job["timeout-minutes"];
    const isReusableCall = job.uses !== undefined;
    if (!isReusableCall && typeof timeout !== "number" && typeof timeout !== "string") {
      violations.push(`job "${jobName}" has no timeout-minutes`);
    }
    if (job.permissions === undefined) {
      violations.push(`job "${jobName}" does not declare permissions`);
    }
  }

  for (const step of collectSteps(workflow)) {
    if (
      step.uses?.startsWith("actions/checkout@") &&
      step.with?.["persist-credentials"] !== false
    ) {
      violations.push("actions/checkout without persist-credentials: false");
    }
    if (
      step.uses?.startsWith("actions/checkout@") &&
      step.with?.["fetch-depth"] === 0 &&
      step.with["filter"] !== "blob:none"
    ) {
      violations.push("full-history actions/checkout without filter: blob:none");
    }
    if (isCacheStep(step) && !FULL_SHA_PATTERN.test(step.uses?.split("@", 2)[1] ?? "")) {
      violations.push(`cache step ${step.uses} is not SHA-pinned`);
    }
    if (isNodeModulesCache(step) && step.with?.["restore-keys"] !== undefined) {
      violations.push("node_modules cache falls back through restore-keys");
    }
    if (step.run?.includes("${{")) {
      violations.push(`run interpolates an expression: ${step.run.trim()}`);
    }
    if (hasAffectedFlag(step) && !step.env?.TURBO_SCM_BASE) {
      violations.push("--affected without TURBO_SCM_BASE in the step env");
    }
  }

  for (const { target, rest } of usesReferences(source)) {
    if (target.startsWith("./")) continue;
    const reference = target.split("@", 2)[1] ?? "";
    if (!FULL_SHA_PATTERN.test(reference)) {
      violations.push(`${target} is not pinned to a 40-hex SHA`);
    } else if (!VERSION_COMMENT_PATTERN.test(rest)) {
      violations.push(`${target} has no # vX.Y.Z version comment`);
    }
  }

  return violations;
}

const allFiles = listWorkflowFiles();

test("there is at least one workflow to check", () => {
  expect(allFiles.length).toBeGreaterThan(0);
});

describe.each(allFiles)("%s", (fileName) => {
  test("satisfies the workflow hygiene rules", () => {
    const violations = findViolations(readWorkflow(fileName), readWorkflowText(fileName));
    expect(violations).toEqual([]);
  });
});

describe("the hygiene rules reject a broken workflow", () => {
  const broken = `
on:
  pull_request:
  pull_request_target:
concurrency:
  cancel-in-progress: true
permissions: write-all
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9
      - uses: actions/cache/restore@v6
        with:
          path: node_modules
          key: modules
          restore-keys: modules-
      - run: echo \${{ github.head_ref }}
      - run: bunx turbo run check --affected
`;
  const violations = findViolations(parse(broken) as Workflow, broken);

  test.each([
    "uses the pull_request_target trigger",
    "pull_request workflow has no concurrency group",
    "top-level permissions are not contents: read or empty",
    'job "build" has no timeout-minutes',
    'job "build" does not declare permissions',
    "actions/checkout without persist-credentials: false",
    "full-history actions/checkout without filter: blob:none",
    "cache step actions/cache/restore@v6 is not SHA-pinned",
    "node_modules cache falls back through restore-keys",
    "actions/checkout@v4 is not pinned to a 40-hex SHA",
    "actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 has no # vX.Y.Z version comment",
    "run interpolates an expression: echo ${{ github.head_ref }}",
    "--affected without TURBO_SCM_BASE in the step env",
  ])("reports: %s", (message) => {
    expect(violations).toContain(message);
  });
});

describe("runner routing (ADR 0031)", () => {
  test.each(allFiles)("%s follows the runner routing rules", (fileName) => {
    expect(findRunnerViolations(fileName, readWorkflowText(fileName))).toEqual([]);
  });

  test("every routed job exists", () => {
    const existing = new Set(
      allFiles.flatMap((fileName) =>
        Object.keys(readWorkflow(fileName).jobs ?? {}).map((jobName) => `${fileName}:${jobName}`),
      ),
    );
    for (const key of ROUTED_JOBS) {
      expect(existing).toContain(key);
    }
  });

  describe("the rules reject a broken workflow", () => {
    const broken = `
jobs:
  light:
    runs-on: ubuntu-latest
  heavy:
    runs-on: \${{ vars.BLACKSMITH_RUNNER || 'ubuntu-latest' }}
  vps:
    runs-on: vps-dind
  hosted:
    runs-on: [self-hosted, linux]
  sneaky:
    runs-on: ubuntu-latest
    env:
      RUNNER: \${{ vars.BLACKSMITH_RUNNER }}
`;
    const violations = findRunnerViolations("broken.yml", broken, ["broken.yml:light"]);

    test.each([
      "broken.yml:light does not use the routed runs-on expression",
      "broken.yml:heavy reads vars.BLACKSMITH_RUNNER outside the list",
      "broken.yml:heavy does not use a literal ubuntu-latest",
      "broken.yml:vps uses the forbidden runner label vps-dind",
      "broken.yml:vps does not use a literal ubuntu-latest",
      "broken.yml:hosted uses the forbidden runner label self-hosted",
      "broken.yml:sneaky reads vars.BLACKSMITH_RUNNER outside the list",
    ])("reports: %s", (message) => {
      expect(violations).toContain(message);
    });
  });
});

describe("ci.yml", () => {
  const workflow = readWorkflow("ci.yml");

  test("keeps the aggregate job name", () => {
    expect(workflow.jobs?.["ci-passed"]).toMatchObject({ name: "CI passed" });
  });

  test("keeps BrowserStack out of the ci-passed needs on purpose", () => {
    const needs = workflow.jobs?.["ci-passed"]?.needs;
    expect(needs).toEqual(
      expect.arrayContaining(["quality", "build", "build-site", "e2e", "commitlint"]),
    );
    expect(needs).not.toContain("browserstack");
  });

  describe("develop branch (ADR 0040)", () => {
    test("runs on a push to main and to develop", () => {
      expect(pushBranches(workflow)).toEqual(["main", "develop"]);
    });

    test("never cancels an in-progress run on main or develop", () => {
      expect(doesCancelInProgress(workflow, "refs/heads/main")).toBe(false);
      expect(doesCancelInProgress(workflow, "refs/heads/develop")).toBe(false);
    });

    test("still cancels a superseded pull request run", () => {
      expect(doesCancelInProgress(workflow, "refs/pull/1/merge")).toBe(true);
    });

    test("skips Commitlint on a promotion pull request", () => {
      expect(doesSkipPromotionPullRequests(workflow.jobs?.commitlint?.if)).toBe(true);
    });

    test("the aggregate job passes when Commitlint is skipped", () => {
      expect(needsList(workflow.jobs?.["ci-passed"]?.needs)).toContain("commitlint");
      expect(doesTolerateSkippedNeeds(workflow.jobs?.["ci-passed"])).toBe(true);
    });

    test("the rules reject a cancelling main, a lint on promotion and a strict aggregate", () => {
      const cancelling = parse(
        "concurrency:\n  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}\n",
      ) as Workflow;
      expect(doesCancelInProgress(cancelling, "refs/heads/develop")).toBe(true);
      expect(doesSkipPromotionPullRequests("github.event_name == 'pull_request'")).toBe(false);
      expect(
        doesSkipPromotionPullRequests(
          `github.event_name == 'pull_request' || ${PROMOTION_EXCLUSION}`,
        ),
      ).toBe(false);
      expect(
        doesSkipPromotionPullRequests(
          `github.event_name == 'pull_request' && ${PROMOTION_EXCLUSION}`,
        ),
      ).toBe(true);
      const strict = parse(`
jobs:
  ci-passed:
    if: always()
    steps:
      - env:
          FAILED: \${{ contains(needs.*.result, 'failure') || contains(needs.*.result, 'skipped') }}
`) as Workflow;
      expect(doesTolerateSkippedNeeds(strict.jobs?.["ci-passed"])).toBe(false);
      const gated = parse(`
jobs:
  ci-passed:
    steps:
      - env:
          FAILED: \${{ contains(needs.*.result, 'failure') }}
`) as Workflow;
      expect(doesTolerateSkippedNeeds(gated.jobs?.["ci-passed"])).toBe(false);
    });
  });

  test("keys the eslint cache on the local eslint rules too", () => {
    const cacheStep = collectSteps(workflow).find((step) =>
      String(step.with?.path).includes(".eslintcache"),
    );
    expect(String(cacheStep?.with?.key)).toContain("eslint-rules/**");
  });

  test("runs both linters through the quality job", () => {
    const quality = workflow.jobs?.["quality"];
    expect(quality?.steps?.some((step) => step.run?.includes("check:root"))).toBe(true);
    const rootScripts = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { scripts: Record<string, string> };
    for (const script of ["lint", "lint:fix"]) {
      const command = rootScripts.scripts[script] ?? "";
      expect(command).toContain("oxlint");
      expect(command).toContain("eslint");
    }
    for (const script of ["lint:eslint", "lint:fix"]) {
      const eslintInvocations = (rootScripts.scripts[script] ?? "")
        .split("&&")
        .filter((part) => /\beslint\b/.test(part));
      expect(eslintInvocations.length).toBeGreaterThan(0);
      for (const invocation of eslintInvocations) {
        expect(invocation).toContain('"**/*.astro"');
      }
    }
    const oxlintShards = Object.keys(rootScripts.scripts).filter((script) =>
      script.startsWith("lint:oxlint:"),
    );
    expect(oxlintShards.length).toBeGreaterThan(0);
    for (const shard of oxlintShards) {
      expect(rootScripts.scripts[shard]).toMatch(/^oxlint --type-aware --deny-warnings(?: |$)/);
      expect((rootScripts.scripts["lint:oxlint"] ?? "").split(/\s+/)).toContain(shard);
    }
    expect(rootScripts.scripts["lint"]).toContain("bun run lint:oxlint");
    expect(rootScripts.scripts["check:root"]).toContain("bun run lint");
  });

  test("lint-staged runs eslint only on staged astro files", async () => {
    const lintStagedUrl = new URL("../lint-staged.config.mjs", import.meta.url);
    const { default: lintStaged } = (await import(lintStagedUrl.href)) as {
      default: Record<string, string[]>;
    };
    for (const [glob, commands] of Object.entries(lintStaged)) {
      const isEslintCommand = commands.some((command) => /\beslint\b/.test(command));
      expect(isEslintCommand).toBe(glob === "*.astro");
    }
  });

  test("every checkout that feeds turbo fetches full history", () => {
    const jobs = Object.values(workflow.jobs ?? {});
    for (const job of jobs) {
      if (!job.steps?.some((step) => step.run?.includes("turbo run"))) continue;
      const checkout = job.steps.find((step) => step.uses?.startsWith("actions/checkout@"));
      expect(checkout?.with?.["fetch-depth"]).toBe(0);
      expect(checkout?.with?.["filter"]).toBe("blob:none");
    }
  });

  test("commitlint and change detection keep a blobless full history", () => {
    for (const jobName of ["commitlint", "changes"]) {
      const checkout = workflow.jobs?.[jobName]?.steps?.find((step) =>
        step.uses?.startsWith("actions/checkout@"),
      );
      expect(checkout?.with).toMatchObject({
        "fetch-depth": 0,
        filter: "blob:none",
      });
    }
  });

  describe.each(["quality", "build", "build-site", "e2e"])(
    "%s restores node_modules on an exact bun.lock hit",
    (jobName) => {
      const steps = workflow.jobs?.[jobName]?.steps ?? [];
      const cache = steps.find((step) => isNodeModulesCache(step));
      const skipped = `steps.${cache?.id ?? "?"}.outputs.cache-hit != 'true'`;
      const hit = `steps.${cache?.id ?? "?"}.outputs.cache-hit == 'true'`;

      test("caches root and workspace node_modules on the lockfile hash", () => {
        expect(cache?.id).toBe("node-modules");
        expect(cache?.with?.key).toBe("${{ runner.os }}-node-modules-${{ hashFiles('bun.lock') }}");
        expect(cache?.with?.["restore-keys"]).toBeUndefined();
        expect(cachedPaths(cache ?? {})).toEqual([
          "node_modules",
          "apps/*/node_modules",
          "packages/*/node_modules",
        ]);
      });

      test("skips the bun cache and bun install on a hit", () => {
        const install = steps.find((step) => step.run?.startsWith("bun install"));
        const bunCache = steps.find(
          (step) => isCacheStep(step) && String(step.with?.path).includes(".bun/install/cache"),
        );
        expect(install?.if).toBe(skipped);
        expect(bunCache?.if).toBe(skipped);
        expect(steps.indexOf(cache ?? {})).toBeLessThan(steps.indexOf(bunCache ?? {}));
      });

      test.runIf(jobName !== "build-site")("reruns the extension postinstall on a hit", () => {
        const prepare = steps.find((step) => step.if === hit);
        expect(prepare?.run).toBe("bun run --cwd apps/extension postinstall");
      });
    },
  );

  describe("build-site builds the site once per run", () => {
    const { jobs } = parse(readWorkflowText("ci.yml")) as {
      jobs?: Record<string, ShardedJob & SiteBuildJob>;
    };
    const buildSite = jobs?.["build-site"];
    const buildSiteSteps = buildSite?.steps ?? [];
    const buildStep = buildSiteSteps.find((step) => step.run?.includes("turbo run build"));
    const e2eSteps = jobs?.e2e?.steps ?? [];
    const download = e2eSteps.find((step) => step.uses?.startsWith("actions/download-artifact@"));
    const e2eRun = e2eSteps.find((step) => step.run?.includes("turbo run"));

    test("runs on a literal ubuntu-latest", () => {
      expect(buildSite?.["runs-on"]).toBe("ubuntu-latest");
      expect(ROUTED_JOBS).not.toContain("ci.yml:build-site");
    });

    test("builds only the site, scoped to affected workspaces", () => {
      expect(buildStep?.id).toBe("site-build");
      expect(buildStep?.run).toMatch(
        /bunx turbo run build --filter=@snug\/site "\$\{affected_flags\[@\]\}"/,
      );
      expect(hasAffectedFlag(buildStep ?? {})).toBe(true);
      expect(buildStep?.run).toContain("apps/site/dist/index.html");
      expect(buildSite?.outputs?.built).toBe("${{ steps.site-build.outputs.built }}");
    });

    test(`uploads apps/site/dist as ${SITE_DIST_ARTIFACT} only when built`, () => {
      const upload = buildSiteSteps.find((step) =>
        step.uses?.startsWith("actions/upload-artifact@"),
      );
      expect(upload?.if).toBe("steps.site-build.outputs.built == 'true'");
      expect(upload?.with).toMatchObject({
        name: SITE_DIST_ARTIFACT,
        path: "apps/site/dist",
        "if-no-files-found": "error",
      });
    });

    test("every shard needs build-site and downloads dist only when built", () => {
      expect(needsList(jobs?.e2e?.needs)).toContain("build-site");
      expect(download?.if).toBe("needs.build-site.outputs.built == 'true'");
      expect(download?.with).toMatchObject({
        name: SITE_DIST_ARTIFACT,
        path: "apps/site/dist",
      });
      expect(e2eSteps.indexOf(download ?? {})).toBeLessThan(e2eSteps.indexOf(e2eRun ?? {}));
    });

    test("shards run the site suite against the downloaded dist", () => {
      expect(e2eRun?.run).toMatch(
        /bunx turbo run test:e2e:prebuilt "\$\{affected_flags\[@\]\}" -- --shard="\$\{SHARD\}\/4"/,
      );
      const siteScripts = (
        JSON.parse(readFileSync(new URL("../apps/site/package.json", import.meta.url), "utf8")) as {
          scripts: Record<string, string>;
        }
      ).scripts;
      expect(siteScripts["test:e2e:prebuilt"]).toBe("playwright test");
      const turboTasks = (
        JSON.parse(readFileSync(new URL("../turbo.json", import.meta.url), "utf8")) as {
          tasks: Record<string, unknown>;
        }
      ).tasks;
      expect(turboTasks["test:e2e:prebuilt"]).toEqual(turboTasks["test:e2e"]);
    });

    test("astro build runs in build-site and nowhere else", () => {
      const siteBuilders = Object.entries(jobs ?? {}).flatMap(([jobName, job]) =>
        (job.steps ?? []).flatMap((step) =>
          (step.run ?? "")
            .split("\n")
            .filter((line) => isSiteBuildLine(line))
            .map(() => jobName),
        ),
      );
      expect(siteBuilders).toEqual(["build-site"]);
    });

    test.each([
      ["bunx astro build", true],
      ["bunx turbo run build --filter=@snug/site", true],
      ['bunx turbo run test:e2e "${affected_flags[@]}"', true],
      ["bunx turbo run check test:e2e", true],
      ["bunx turbo run test:e2e --filter='!@snug/site'", false],
      ["bunx turbo run test:e2e:prebuilt", false],
      ["bunx turbo run zip", false],
    ])('a step line "%s" builds the site: %s', (line, expected) => {
      expect(isSiteBuildLine(line)).toBe(expected);
    });
  });

  describe("sharded e2e", () => {
    const { jobs } = parse(readWorkflowText("ci.yml")) as {
      jobs?: Record<string, ShardedJob>;
    };
    const e2e = jobs?.e2e;
    const e2eRun = e2e?.steps?.find((step) => step.run?.includes("turbo run test:e2e"));

    test("e2e runs as 4 shards", () => {
      expect(e2e?.strategy?.["fail-fast"]).toBe(false);
      expect(e2e?.strategy?.matrix?.shard).toEqual([1, 2, 3, 4]);
      expect(e2e?.name).toBe("E2E (Playwright ${{ matrix.shard }}/4)");
      expect(e2e?.["runs-on"]).toBe("ubuntu-latest");
    });

    test("forwards --shard to turbo", () => {
      expect(e2eRun?.env?.SHARD).toBe("${{ matrix.shard }}");
      expect(e2eRun?.run).toMatch(
        /bunx turbo run test:e2e --filter='!@snug\/site' "\$\{affected_flags\[@\]\}" -- --shard="\$\{SHARD\}\/4"/,
      );
      expect(e2eRun?.run).toMatch(
        /bunx turbo run test:e2e:prebuilt "\$\{affected_flags\[@\]\}" -- --shard="\$\{SHARD\}\/4"/,
      );
      expect(hasAffectedFlag(e2eRun ?? {})).toBe(true);
    });

    test("failure artifacts are named per shard", () => {
      const uploads = (e2e?.steps ?? []).filter((step) =>
        step.uses?.startsWith("actions/upload-artifact@"),
      );
      expect(uploads.map((step) => step.with?.name)).toEqual([
        "playwright-report-${{ matrix.shard }}",
        "site-playwright-report-${{ matrix.shard }}",
      ]);
      for (const upload of uploads) {
        expect(upload.if).toBe("failure()");
      }
    });

    test("the site Playwright config splits shards inside files", () => {
      const siteConfig = readFileSync(
        new URL("../apps/site/playwright.config.ts", import.meta.url),
        "utf8",
      );
      expect(siteConfig).toMatch(/^\s*fullyParallel:\s*true,/m);
    });

    test("CI passed fails when any shard fails or is cancelled", () => {
      const checkStep = workflow.jobs?.["ci-passed"]?.steps?.[0];
      const failed = String(checkStep?.env?.FAILED);
      expect(workflow.jobs?.["ci-passed"]?.if).toBe("always()");
      expect(failed).toContain("contains(needs.*.result, 'failure')");
      expect(failed).toMatch(/contains\(needs\.\*\.result,\s*'cancelled'\)/);
    });
  });

  test("affected runs resolve the pull request base ref", () => {
    const affectedSteps = collectSteps(workflow).filter((step) => hasAffectedFlag(step));
    expect(affectedSteps.length).toBeGreaterThan(0);
    for (const step of affectedSteps) {
      expect(step.env?.TURBO_SCM_BASE).toBe("origin/${{ github.base_ref }}");
    }
  });
});

describe.each([
  ["ci.yml", "e2e"],
  ["site-quality.yml", "e2e"],
])("%s:%s caches Playwright browsers", (fileName, jobName) => {
  const steps = readWorkflow(fileName).jobs?.[jobName]?.steps ?? [];
  const version = steps.find((step) => step.id === "playwright-version");
  const cache = steps.find(
    (step) => isCacheStep(step) && cachedPaths(step).includes("~/.cache/ms-playwright"),
  );
  const installs = steps.filter((step) => /^bunx playwright install\b/.test(step.run ?? ""));

  test("keys the browser cache on the installed Playwright version", () => {
    expect(version?.run).toContain("bunx playwright --version");
    expect(cache?.id).toBe("playwright-cache");
    expect(cache?.with?.key).toBe(
      "${{ runner.os }}-playwright-${{ steps.playwright-version.outputs.version }}",
    );
    expect(cache?.with?.["restore-keys"]).toBeUndefined();
    expect(steps.indexOf(version ?? {})).toBeLessThan(steps.indexOf(cache ?? {}));
  });

  test("downloads browsers on a miss and only system deps on a hit", () => {
    expect(installs.map((step) => ({ if: step.if, run: step.run }))).toEqual([
      {
        if: "steps.playwright-cache.outputs.cache-hit != 'true'",
        run: "bunx playwright install --with-deps chromium",
      },
      {
        if: "steps.playwright-cache.outputs.cache-hit == 'true'",
        run: "bunx playwright install-deps chromium",
      },
    ]);
  });
});

describe("site-quality.yml", () => {
  const FAN_OUT_JOBS = ["smoke", "e2e", "visual", "lighthouse"] as const;
  const AGGREGATE_JOB = "site-quality-passed";
  const SITE_IMAGE_ARTIFACT = "site-image";
  const SITE_IMAGE_PATH = "${{ runner.temp }}/site-image.tar";
  const PREBUILT_SHIM_PATH =
    'export PATH="${GITHUB_WORKSPACE}/.github/scripts/prebuilt-site-image:${PATH}"';

  const workflow = readWorkflow("site-quality.yml");
  const { jobs } = parse(readWorkflowText("site-quality.yml")) as {
    jobs?: Record<string, ShardedJob & SiteBuildJob>;
  };

  function stepsOf(jobName: string): readonly WorkflowStep[] {
    return jobs?.[jobName]?.steps ?? [];
  }

  function runLines(jobName: string): string[] {
    return stepsOf(jobName).flatMap((step) => (step.run ?? "").split("\n"));
  }

  test("runs as build, four parallel checks and one aggregate job", () => {
    expect(Object.keys(jobs ?? {})).toEqual(["build", ...FAN_OUT_JOBS, AGGREGATE_JOB]);
  });

  test("build saves the site image and shares it as an artifact", () => {
    const steps = stepsOf("build");
    const buildStep = steps.find((step) => step.run?.includes("docker build"));
    const upload = steps.find((step) => step.uses?.startsWith("actions/upload-artifact@"));
    expect(needsList(jobs?.build?.needs)).toEqual([]);
    expect(buildStep?.run).toContain("-t snug-site:ci .");
    expect(buildStep?.run).toContain(
      'docker save --output "${RUNNER_TEMP}/site-image.tar" snug-site:ci',
    );
    expect(upload?.with).toMatchObject({
      name: SITE_IMAGE_ARTIFACT,
      path: SITE_IMAGE_PATH,
      "if-no-files-found": "error",
    });
  });

  test("the image is built in the build job and nowhere else", () => {
    const builders = Object.keys(jobs ?? {}).filter((jobName) =>
      runLines(jobName).some((line) => /\bdocker build\b|\b(?:astro|bun run) build\b/.test(line)),
    );
    expect(builders).toEqual(["build"]);
  });

  test.each(FAN_OUT_JOBS)(
    "%s needs build and loads the shared image before using it",
    (jobName) => {
      const steps = stepsOf(jobName);
      const download = steps.find((step) => step.uses?.startsWith("actions/download-artifact@"));
      const load = steps.find((step) => step.run?.includes("docker load"));
      const firstUse = steps.find(
        (step) => step !== load && /docker run|smoke\.sh|test:visual/.test(step.run ?? ""),
      );
      expect(needsList(jobs?.[jobName]?.needs)).toEqual(["build"]);
      expect(download?.with).toMatchObject({
        name: SITE_IMAGE_ARTIFACT,
        path: "${{ runner.temp }}",
      });
      expect(load?.run).toBe('docker load --input "${RUNNER_TEMP}/site-image.tar"');
      expect(steps.indexOf(download ?? {})).toBeLessThan(steps.indexOf(load ?? {}));
      expect(firstUse).toBeDefined();
      expect(steps.indexOf(load ?? {})).toBeLessThan(steps.indexOf(firstUse ?? {}));
    },
  );

  test.each([
    ["smoke", "bash apps/site/docker/smoke.sh"],
    ["visual", "bun run test:visual"],
  ])("%s reuses the shared image where its script would rebuild it", (jobName, command) => {
    const step = stepsOf(jobName).find((candidate) => candidate.run?.includes(command));
    const lines = (step?.run ?? "").split("\n");
    expect(lines).toContain(PREBUILT_SHIM_PATH);
    expect(lines.indexOf(PREBUILT_SHIM_PATH)).toBeLessThan(lines.indexOf(command));
    expect(step?.env?.PREBUILT_SITE_IMAGE).toBe("snug-site:ci");
  });

  test.each(["build", "smoke", "visual"])(
    "%s fetches the full history last-modified.sh needs",
    (jobName) => {
      const checkout = stepsOf(jobName).find((step) => step.uses?.startsWith("actions/checkout@"));
      expect(checkout?.with).toMatchObject({
        "fetch-depth": 0,
        filter: "blob:none",
      });
    },
  );

  test("smoke audits the dist copied out of the shared image", () => {
    const lines = runLines("smoke");
    const copy = lines.findIndex((line) => line.includes(':/usr/share/nginx/html" apps/site/dist'));
    const audit = lines.findIndex((line) =>
      line.includes("bun run test src/seo/distribution-audit.test.ts"),
    );
    expect(copy).toBeGreaterThan(-1);
    expect(audit).toBeGreaterThan(copy);
    const auditStep = stepsOf("smoke").find((step) =>
      step.run?.includes("distribution-audit.test.ts"),
    );
    expect(auditStep?.env?.REQUIRE_DIST).toBe("1");
  });

  test("e2e runs as 2 shards that split inside files", () => {
    const e2e = jobs?.e2e;
    const run = stepsOf("e2e").find((step) => step.run?.includes("bun run test:container"));
    expect(e2e?.strategy?.["fail-fast"]).toBe(false);
    expect(e2e?.strategy?.matrix?.shard).toEqual([1, 2]);
    expect(e2e?.name).toBe("E2E (container ${{ matrix.shard }}/2)");
    expect(run?.env?.SHARD).toBe("${{ matrix.shard }}");
    expect(run?.run).toBe('bun run test:container --fully-parallel --shard="${SHARD}/2"');
  });

  test("failure artifacts never collide across jobs or shards", () => {
    const names = Object.keys(jobs ?? {}).flatMap((jobName) =>
      stepsOf(jobName)
        .filter(
          (step) => step.uses?.startsWith("actions/upload-artifact@") && step.if === "failure()",
        )
        .map((step) => String(step.with?.name)),
    );
    expect(names).toEqual(["site-container-report-${{ matrix.shard }}", "site-visual-report"]);
  });

  test("every job runs on a literal ubuntu-latest", () => {
    const runners = Object.values(jobs ?? {}).map((job) => job["runs-on"]);
    expect(runners).toEqual(runners.map(() => "ubuntu-latest"));
    expect(ROUTED_JOBS.filter((key) => key.startsWith("site-quality.yml:"))).toEqual([]);
  });

  describe("the aggregate job", () => {
    const aggregate = workflow.jobs?.[AGGREGATE_JOB];

    test('is named "Site quality passed"', () => {
      expect(jobs?.[AGGREGATE_JOB]?.name).toBe("Site quality passed");
    });

    test("waits on every other job and always runs", () => {
      expect(needsList(aggregate?.needs)).toEqual(["build", ...FAN_OUT_JOBS]);
      expect(aggregate?.if).toBe("always()");
    });

    test("fails when any job fails or is cancelled", () => {
      const checkStep = aggregate?.steps?.[0];
      const failed = String(checkStep?.env?.FAILED);
      expect(failed).toContain("contains(needs.*.result, 'failure')");
      expect(failed).toMatch(/contains\(needs\.\*\.result,\s*'cancelled'\)/);
      expect(checkStep?.run).toMatch(
        /if \[\[ "\$\{FAILED\}" == "true" \]\]; then\n(?:.*\n)*\s*exit 1\n/,
      );
    });
  });

  describe("the prebuilt-site-image docker shim", () => {
    const shimDirectory = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../.github/scripts/prebuilt-site-image",
    );

    function runShim(
      shimArguments: readonly string[],
      environment: Record<string, string> = {},
    ): { status: number | null; calls: string[]; stderr: string } {
      const fakeBin = mkdtempSync(path.join(tmpdir(), "fake-docker-"));
      const log = path.join(fakeBin, "calls.log");
      const fakeDocker = path.join(fakeBin, "docker");
      writeFileSync(fakeDocker, '#!/usr/bin/env bash\necho "$*" >> "$CALLS"\n');
      chmodSync(fakeDocker, 0o755);
      writeFileSync(log, "");
      try {
        const result = spawnSync("bash", [path.join(shimDirectory, "docker"), ...shimArguments], {
          encoding: "utf8",
          env: {
            PATH: [shimDirectory, fakeBin, process.env["PATH"] ?? ""].join(":"),
            CALLS: log,
            ...environment,
          },
        });
        return {
          status: result.status,
          calls: readFileSync(log, "utf8").split("\n").filter(Boolean),
          stderr: result.stderr,
        };
      } finally {
        rmSync(fakeBin, { recursive: true, force: true });
      }
    }

    test("turns a build into a tag of the prebuilt image", () => {
      const { status, calls } = runShim(
        [
          "build",
          "-f",
          "apps/site/Dockerfile",
          "--build-arg",
          "LAST_MODIFIED_DATES={}",
          "-t",
          "snug-site-smoke",
          ".",
        ],
        { PREBUILT_SITE_IMAGE: "snug-site:ci" },
      );
      expect(status).toBe(0);
      expect(calls).toEqual(["tag snug-site:ci snug-site-smoke"]);
    });

    test("passes every other command to the real docker untouched", () => {
      const { status, calls } = runShim(["run", "-d", "--name", "site", "snug-site-smoke"], {
        PREBUILT_SITE_IMAGE: "snug-site:ci",
      });
      expect(status).toBe(0);
      expect(calls).toEqual(["run -d --name site snug-site-smoke"]);
    });

    test.each([
      [
        "no prebuilt image is named",
        ["build", "-t", "snug-site-smoke", "."],
        {},
        "PREBUILT_SITE_IMAGE is not set",
      ],
      [
        "the build names no tag",
        ["build", "."],
        { PREBUILT_SITE_IMAGE: "snug-site:ci" },
        "has no -t <tag>",
      ],
    ])("refuses a build when %s", (_case, shimArguments, environment, message) => {
      const { status, calls, stderr } = runShim(shimArguments, environment);
      expect(status).toBe(1);
      expect(calls).toEqual([]);
      expect(stderr).toContain(message);
    });
  });
});

describe("codeql.yml", () => {
  test("exists as a workflow (ADR 0004)", () => {
    expect(allFiles).toContain("codeql.yml");
  });

  test("scans javascript-typescript and actions under separate categories", () => {
    expect(findCodeqlViolations(readWorkflow("codeql.yml"))).toEqual([]);
  });

  test("the rule rejects a single-language scan without a category", () => {
    const broken = `
jobs:
  analyze:
    steps:
      - uses: github/codeql-action/init@9b3254085494b55a0f7c4c2b3d2d52cc712ce370 # v4.39.1
        with:
          languages: javascript-typescript
      - uses: github/codeql-action/analyze@9b3254085494b55a0f7c4c2b3d2d52cc712ce370 # v4.39.1
`;
    expect(findCodeqlViolations(parse(broken) as Workflow)).toEqual([
      "the language matrix does not scan javascript-typescript",
      "the language matrix does not scan actions",
      "init does not take its language from the matrix",
      "analyze has no per-language category",
    ]);
  });

  test("the rule rejects a workflow that never initializes CodeQL", () => {
    expect(findCodeqlViolations(parse("jobs: {}") as Workflow)).toEqual([
      "no job initializes CodeQL",
    ]);
  });

  test("runs on a push to main and to develop (ADR 0040)", () => {
    expect(pushBranches(readWorkflow("codeql.yml"))).toEqual(["main", "develop"]);
  });

  test("never cancels an in-progress run on main or develop", () => {
    const workflow = readWorkflow("codeql.yml");
    expect(doesCancelInProgress(workflow, "refs/heads/main")).toBe(false);
    expect(doesCancelInProgress(workflow, "refs/heads/develop")).toBe(false);
    expect(doesCancelInProgress(workflow, "refs/pull/1/merge")).toBe(true);
  });
});

describe("main-only workflows never trigger or run on develop (ADR 0040)", () => {
  test.each(["deploy-site.yml", "labels.yml", "scorecard.yml", "browserstack.yml"])(
    "%s pushes run from main only",
    (fileName) => {
      expect(pushBranches(readWorkflow(fileName))).toEqual(["main"]);
    },
  );

  test("release.yml runs on version tags only", () => {
    const trigger = readWorkflow("release.yml").on as {
      push?: Record<string, unknown>;
    };
    expect(Object.keys(trigger)).toEqual(["push"]);
    expect(trigger.push).toEqual({ tags: ["v*"] });
  });

  test.each(["deploy-site.yml", "release.yml", "labels.yml", "scorecard.yml", "browserstack.yml"])(
    "%s never names develop",
    (fileName) => {
      expect(readWorkflowText(fileName)).not.toMatch(/\bdevelop\b/);
    },
  );

  test("the rule reads the push branches a workflow lists", () => {
    const widened = parse("on:\n  push:\n    branches: [main, develop]\n") as Workflow;
    expect(pushBranches(widened)).not.toEqual(["main"]);
    expect(pushBranches(parse("on: push\n") as Workflow)).toEqual([]);
  });
});

describe("deploy-site.yml", () => {
  test("every job runs from the main ref only, on every trigger path", () => {
    const workflow = readWorkflow("deploy-site.yml");
    expect(Object.keys(workflow.jobs ?? {}).length).toBeGreaterThan(0);
    expect(findJobsNotGuardedToMain(workflow)).toEqual([]);
  });

  test("the rule rejects a job a non-main ref can reach", () => {
    const broken = `
jobs:
  unguarded:
    steps: []
  dispatch-escape:
    if: github.event_name == 'workflow_dispatch' || github.ref == 'refs/heads/main'
    steps: []
  other-ref:
    if: github.ref == 'refs/heads/develop'
    steps: []
  guarded:
    if: \${{ github.ref == 'refs/heads/main' && github.actor != 'renovate[bot]' }}
    steps: []
`;
    expect(findJobsNotGuardedToMain(parse(broken) as Workflow)).toEqual([
      "unguarded",
      "dispatch-escape",
      "other-ref",
    ]);
  });
});

describe("labels.yml", () => {
  const workflow = readWorkflow("labels.yml");

  test("can be dispatched by hand", () => {
    expect(missingTriggers(workflow, ["workflow_dispatch"])).toEqual([]);
  });

  test("the rule rejects a workflow without workflow_dispatch", () => {
    const broken = parse("on:\n  push:\n  pull_request:\n") as Workflow;
    expect(missingTriggers(broken, ["workflow_dispatch"])).toEqual(["workflow_dispatch"]);
  });

  test("only a run on the main ref writes labels", () => {
    const labeler = collectSteps(workflow).find((step) =>
      step.uses?.startsWith("crazy-max/ghaction-github-labeler@"),
    );
    expect(labeler?.with?.["dry-run"]).toBe("${{ github.ref != 'refs/heads/main' }}");
  });
});

describe("release.yml (ADR 0026)", () => {
  const workflow = readWorkflow("release.yml");
  const jobs = Object.entries(workflow.jobs ?? {});
  const verifyRuns = (workflow.jobs?.verify?.steps ?? []).map((step) => step.run ?? "").join("\n");

  test("has a read-only verify job", () => {
    expect(workflow.jobs?.verify).toBeDefined();
    expect(workflow.jobs?.verify?.permissions).toEqual({
      contents: "read",
      checks: "read",
    });
  });

  test("verify checks main ancestry, CI passed, check, test and build", () => {
    expect(verifyRuns).toContain("merge-base --is-ancestor");
    expect(verifyRuns).toContain("CI passed");
    expect(verifyRuns).toContain("bun run check");
    expect(verifyRuns).toContain("bun run test");
    expect(verifyRuns).toContain("bun run build");
  });

  test("every job except verify needs verify", () => {
    const others = jobs.filter(([name]) => name !== "verify");
    expect(others.length).toBeGreaterThan(0);
    for (const [, job] of others) {
      expect(needsList(job.needs)).toContain("verify");
    }
  });

  test("publish jobs skip a version already released", () => {
    const publishJobs = jobs.filter(([name]) => name.startsWith("publish-"));
    expect(publishJobs.length).toBeGreaterThan(0);
    for (const [, job] of publishJobs) {
      expect(job.if).toContain("already-released");
    }
  });
});

describe("browserstack.yml nightly failure reporting", () => {
  const workflow = readWorkflow("browserstack.yml");
  const report = workflow.jobs?.["report-failure"];
  const resolve = workflow.jobs?.["resolve-failure"];

  test("only the two reporting jobs may write issues", () => {
    const writers = Object.entries(workflow.jobs ?? {})
      .filter(([, job]) => (job.permissions as { issues?: string } | undefined)?.issues === "write")
      .map(([name]) => name);
    expect(writers).toEqual(["report-failure", "resolve-failure"]);
  });

  test("reporting jobs wait on layout and run for scheduled runs only", () => {
    for (const job of [report, resolve]) {
      expect(needsList(job?.needs)).toEqual(["layout"]);
      expect(String(job?.if)).toContain("github.event_name == 'schedule'");
    }
  });

  test("failure is reported on failure and closed only on layout success", () => {
    expect(String(report?.if)).toContain("needs.layout.result == 'failure'");
    expect(String(resolve?.if)).toContain("needs.layout.result == 'success'");
  });

  test("the ci.yml caller grants the issues permission the reporting jobs request", () => {
    const caller = readWorkflow("ci.yml").jobs?.browserstack;
    expect((caller?.permissions as { issues?: string } | undefined)?.issues).toBe("write");
  });

  test("the failure report opts out of the implicit success() gate", () => {
    expect(String(report?.if)).toMatch(/\b(always|failure)\(\)/);
  });
});

describe("upload-artifact pins", () => {
  const ciPins = [...new Set(uploadArtifactPins(readWorkflowText("ci.yml")))];
  const expectedPin = ciPins[0] ?? "";

  test("ci.yml uses a single pin", () => {
    expect(ciPins).toHaveLength(1);
  });

  test.each(allFiles)("%s matches the ci.yml pin", (fileName) => {
    expect(findUploadArtifactDrift(readWorkflowText(fileName), expectedPin)).toEqual([]);
  });

  test("the rule rejects a use pinned to another version", () => {
    const broken = `
      - uses: ${expectedPin}
      - uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
`;
    expect(findUploadArtifactDrift(broken, expectedPin)).toEqual([
      `actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2 differs from ${expectedPin}`,
    ]);
  });
});
