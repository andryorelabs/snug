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

const LIGHT_JOB_REASON =
  "light job (ADR 0031): a faster runner shortens every pull request, and fork pull requests fall back to ubuntu-latest";

/**
 * The only jobs, as `<file>:<job>`, allowed to use {@link ROUTED_RUNS_ON},
 * each with the reason it is routed (rule F10).
 */
const ROUTED_JOB_REASONS: Readonly<Record<string, string>> = {
  "ci.yml:quality": `${LIGHT_JOB_REASON}; format, lint, typecheck and unit tests only`,
  "ci.yml:changes": `${LIGHT_JOB_REASON}; a path diff of the pull request`,
  "ci.yml:commitlint": `${LIGHT_JOB_REASON}; lints commit messages`,
  "ci.yml:ci-passed": `${LIGHT_JOB_REASON}; the aggregate required check`,
  "lint-pr.yml:validate-title": `${LIGHT_JOB_REASON}; the required title check`,
  "lint-docs.yml:check-links": `${LIGHT_JOB_REASON}; the required link check`,
  "lint-workflows.yml:lint": `${LIGHT_JOB_REASON}; actionlint and zizmor`,
  "labels.yml:sync": `${LIGHT_JOB_REASON}; a label sync`,
};

const ROUTED_JOBS: readonly string[] = Object.keys(ROUTED_JOB_REASONS);

const HEAVY_JOB_REASON =
  "heavy job (ADR 0031): a GitHub-hosted runner is free with 4 vCPU on a public repository, and Blacksmith minutes are not";
const TRUSTED_JOB_REASON =
  "release, deploy, scheduled and code scanning jobs keep a literal ubuntu-latest (ADR 0031), so a repository variable never moves them";

/**
 * Every job, as `<file>:<job>`, that runs on a literal `ubuntu-latest`, each
 * with the reason it is not routed (rule F10, ADR 0031).
 */
const LITERAL_RUNNER_JOB_REASONS: Readonly<Record<string, string>> = {
  "browserstack.yml:plan": `${HEAVY_JOB_REASON}; it plans the BrowserStack matrix beside the heavy jobs`,
  "browserstack.yml:layout": `${HEAVY_JOB_REASON}; real-device layout runs`,
  "browserstack.yml:report-failure": `${TRUSTED_JOB_REASON}; it writes issues for nightly runs`,
  "browserstack.yml:resolve-failure": `${TRUSTED_JOB_REASON}; it closes issues for nightly runs`,
  "browserstack.yml:percy": `${HEAVY_JOB_REASON}; Percy cross-browser snapshots`,
  "ci.yml:bun-canary": `${HEAVY_JOB_REASON}; a full check and test on the latest Bun`,
  "ci.yml:build": `${HEAVY_JOB_REASON}; builds the extension zip`,
  "ci.yml:build-site": `${HEAVY_JOB_REASON}; builds the site once for every E2E shard`,
  "ci.yml:e2e": `${HEAVY_JOB_REASON}; the sharded Playwright suites`,
  "codeql.yml:analyze": `${TRUSTED_JOB_REASON}; CodeQL`,
  "deploy-site.yml:deploy": `${TRUSTED_JOB_REASON}; the site deploy`,
  "release.yml:verify": `${TRUSTED_JOB_REASON}; the release gates, check, test and build`,
  "release.yml:release": `${TRUSTED_JOB_REASON}; builds, attests and publishes the release`,
  "release.yml:publish-chrome-web-store": `${TRUSTED_JOB_REASON}; store publishing`,
  "release.yml:publish-edge-add-ons": `${TRUSTED_JOB_REASON}; store publishing`,
  "scorecard.yml:analysis": `${TRUSTED_JOB_REASON}; Scorecard`,
  "site-quality.yml:build": `${HEAVY_JOB_REASON}; builds the site image`,
  "site-quality.yml:smoke": `${HEAVY_JOB_REASON}; runs the site container`,
  "site-quality.yml:e2e": `${HEAVY_JOB_REASON}; the container Playwright shards`,
  "site-quality.yml:visual": `${HEAVY_JOB_REASON}; visual regression`,
  "site-quality.yml:lighthouse": `${TRUSTED_JOB_REASON}; the Lighthouse budget`,
  "site-quality.yml:site-quality-passed": `${HEAVY_JOB_REASON}; the aggregate of the heavy site-quality jobs, kept beside them`,
};

/**
 * Checks that every job's runner choice carries a recorded reason (rule F10):
 * each runnable job is listed once, in the routed or the literal-runner table,
 * with a non-empty reason, and every listed job exists.
 * @param jobKeys Every `<file>:<job>` key except reusable workflow calls,
 * which have no runner of their own.
 * @param routed The routed jobs and their reasons.
 * @param literal The literal-runner jobs and their reasons.
 * @returns One message per problem; empty when every runner has a reason.
 */
function findRunnerReasonProblems(
  jobKeys: readonly string[],
  routed: Readonly<Record<string, string>>,
  literal: Readonly<Record<string, string>>,
): string[] {
  const problems: string[] = [];
  for (const key of jobKeys) {
    const isRouted = Object.hasOwn(routed, key);
    const isLiteral = Object.hasOwn(literal, key);
    if (!isRouted && !isLiteral) problems.push(`${key} has no recorded runner reason`);
    if (isRouted && isLiteral) problems.push(`${key} is listed as both routed and literal`);
  }
  for (const [key, reason] of [...Object.entries(routed), ...Object.entries(literal)]) {
    if (reason.trim() === "") problems.push(`${key} has an empty runner reason`);
    if (!jobKeys.includes(key)) problems.push(`${key} is listed but no such job exists`);
  }
  return problems;
}

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

const PUBLIC_REPOSITORY_GUARD = "!github.event.repository.private";

/**
 * Checks that a job's `if` requires a public repository: code scanning and
 * Scorecard need GitHub Advanced Security, which a private repository lacks.
 * @param condition The job's `if` expression.
 * @returns Whether every run of the job requires a public repository.
 */
function isSkippedOnPrivateRepositories(condition: string | undefined): boolean {
  const expression = unwrapExpression(condition ?? "");
  return (
    !expression.includes("||") &&
    expression
      .split("&&")
      .map((term) => term.trim())
      .includes(PUBLIC_REPOSITORY_GUARD)
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

  if (!hasConcurrencyGroup(workflow)) {
    violations.push("workflow has no concurrency group");
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

/**
 * A command a CI step may run although it is not a script call, with the
 * reason it may (rule F10, `steps-call-scripts`). The pattern matches the
 * whole command text, from its first word after any `VAR=value` prefix.
 */
interface ScriptExemption {
  readonly command: RegExp;
  readonly reason: string;
}

/**
 * The commands `steps-call-scripts` admits besides a script call. Each entry
 * is as narrow as the workflows allow and carries its own reason; an entry no
 * step uses fails the suite.
 */
const STEPS_CALL_SCRIPTS_EXEMPTIONS: readonly ScriptExemption[] = [
  {
    command: /^(?:echo|printf|exit|cd|read|export|wait|true|test|\[\[x\]\])(?:\s|$)/,
    reason: "shell builtins: output, tests and control flow inside a step, not a tool",
  },
  {
    command: /^(?:sleep|seq|ls|grep -q \.$|sed 's\/\^\/\* \/')(?:\s|$)/,
    reason:
      "coreutils on every runner image: waits, loops, zip lookups and the allowed signers format",
  },
  {
    command: /^bun install --frozen-lockfile(?: --ignore-scripts)?$/,
    reason: "installs the dependencies every script needs, so no script can run before it",
  },
  {
    command: /^bunx turbo run /,
    reason:
      "turbo is the task runner behind bun run check, test and zip; CI calls it directly to pass --affected and --shard, which the package.json scripts do not forward",
  },
  {
    command:
      /^bunx playwright(?:@1\.63\.0)? (?:--version|install --with-deps chromium|install-deps chromium)$/,
    reason:
      "installs or names the Playwright browser of the runner, which no workspace script does; the 1.63 pin is the Chromium Lighthouse needs",
  },
  {
    command: /^bunx commitlint --from "\$\{BASE_SHA\}" --to "\$\{HEAD_SHA\}" --verbose$/,
    reason:
      "lints the exact commit range of the pull request event, which lint:commits does not take",
  },
  {
    command: /^bunx wxt submit --(?:chrome|edge)-zip "\$\{zip_path\}"$/,
    reason: "submits the attested release zip to a store, which only the release workflow may do",
  },
  {
    command: /^docker (?:build|save|load|run|logs|create|cp|rm) /,
    reason: "builds, moves and runs the site container image that site-quality and deploy test",
  },
  {
    command:
      /^bash (?:apps\/site\/docker\/(?:last-modified|smoke)\.sh|\.github\/scripts\/deploy-coolify\.sh)$/,
    reason: "repo shell scripts: the site image's dates, the nginx smoke test and the deploy hook",
  },
  {
    command: /^curl -fs -o \/dev\/null http:\/\/127\.0\.0\.1:8080\/$/,
    reason: "the readiness probe of the site container started in the step",
  },
  {
    command:
      /^curl -sSLO "https:\/\/github\.com\/rhysd\/actionlint\/releases\/download\/|^tar xzf "actionlint_|^sha256sum -c -$|^actionlint -color$/,
    reason:
      "installs the checksum-verified actionlint release and runs it; actionlint is a Go binary no package script reaches",
  },
  {
    command:
      /^git (?:fetch --no-tags (?:--force )?origin |merge-base --is-ancestor |diff --name-only |cat-file -e )/,
    reason:
      "release ancestry, the release tag fetch and the site change detection read the checkout's history in place",
  },
  {
    command: /^gh (?:api |release (?:view|create) |issue (?:list|create|comment|close) )/,
    reason:
      "reads the tagger's keys and the CI result, publishes the GitHub Release and reports nightly failures with the job token",
  },
  {
    command: /^gpg --batch --quiet --import$/,
    reason: "imports the tagger's GPG keys so git tag -v can check the release tag",
  },
  {
    command: /^(?:jq -r|jq -nc|yq) /,
    reason:
      "reads a field of a JSON or YAML document, or builds the BrowserStack matrix JSON, inside a step",
  },
];

const SCRIPT_CALL_PATTERN =
  /^bun (?:run (?:--cwd \S+ )?(?:--[\w-]+ )*[\w:-]+|scripts\/[\w./-]+\.ts)(?:\s|$)/;
const BUN_RUN_SCRIPT_PATTERN = /^bun run (?:--cwd (\S+) )?(?:--[\w-]+ )*([\w:-]+)(?:\s|$)/;
const COMMAND_SEPARATOR_PATTERN = /[|;&()\n]/;
const RESERVED_WORDS: ReadonlySet<string> = new Set([
  "if",
  "then",
  "else",
  "elif",
  "fi",
  "do",
  "done",
  "while",
  "until",
  "esac",
  "{",
  "}",
  "!",
  "time",
]);
const CLAUSE_WORDS: ReadonlySet<string> = new Set(["for", "case", "select"]);
const ASSIGNMENT_WORD_PATTERN = /^[A-Za-z_]\w*(?:\[[^\]]*\])?\+?=/;
const REDIRECTION_OPERATOR_PATTERN = /^\d*(?:<<<|<<-?|>>|<>|>&|<&|>\||<|>)$/;
const ATTACHED_REDIRECTION_PATTERN = /^\d*(?:<<<|<<-?|>>|<>|>&|<&|>\||<|>)\S/;
const HEREDOC_START_PATTERN = /(?<!<)<<-?\s*(['"]?)([A-Za-z_]\w*)\1/;
const CASE_PATTERNS_PATTERN = /(\bin\b|;;)(\s*)([^;()\n]*\))/g;
const ARRAY_ASSIGNMENT_START_PATTERN = /[A-Za-z_]\w*\+?=\(/g;
const FUNCTION_DEFINITION_PATTERN = /(?:^|[\n;&|{}])\s*([A-Za-z_][\w-]*)\s*\(\s*\)/g;

interface MaskedScript {
  readonly masked: string;
  readonly substitutions: readonly string[];
  readonly end: number;
}

function removeHeredocBodies(script: string): string {
  const kept: string[] = [];
  let terminator: string | undefined;
  for (const line of script.split("\n")) {
    if (terminator !== undefined) {
      if (line.trim() === terminator) terminator = undefined;
      continue;
    }
    kept.push(line);
    terminator = HEREDOC_START_PATTERN.exec(line)?.[2];
  }
  return kept.join("\n");
}

/**
 * Scans `text` from `start`, masking quoted text, `${ }` expansions, comments
 * and `$( )` substitutions so separators inside them do not split commands.
 * With `isInsideSubstitution`, the scan stops at the `)` closing the substitution.
 * @param text The shell script.
 * @param start The index to scan from.
 * @param isInsideSubstitution Whether the scan starts inside a `$( )`.
 * @returns The masked text, the substitutions found and where the scan stopped.
 */
function maskShell(text: string, start: number, isInsideSubstitution: boolean): MaskedScript {
  let masked = "";
  const substitutions: string[] = [];
  let quote: "'" | '"' | undefined;
  let depth = 0;
  let index = start;
  while (index < text.length) {
    const character = text[index] ?? "";
    const next = text[index + 1] ?? "";
    let width = 1;
    let replacement: string | undefined = "x";
    if (quote === "'") {
      if (character === "'") quote = undefined;
    } else if (character === "\\") {
      width = Math.min(2, text.length - index);
    } else if (character === "$" && next === "(") {
      const inner = maskShell(text, index + 2, true);
      substitutions.push(text.slice(index + 2, inner.end));
      width = Math.min(inner.end + 1, text.length) - index;
    } else if (character === "$" && next === "{") {
      const close = text.indexOf("}", index);
      width = (close === -1 ? text.length : close + 1) - index;
    } else if (quote === '"') {
      if (character === '"') quote = undefined;
    } else if (character === "'" || character === '"') {
      quote = character;
    } else if (character === "#" && (index === start || /\s/.test(text[index - 1] ?? ""))) {
      const newline = text.indexOf("\n", index);
      width = (newline === -1 ? text.length : newline) - index;
      replacement = " ";
    } else if (character === ")" && isInsideSubstitution && depth === 0) {
      return { masked, substitutions, end: index };
    } else {
      if (character === "(") depth += 1;
      else if (character === ")") depth -= 1;
      replacement = undefined;
    }
    masked += replacement === undefined ? character : replacement.repeat(width);
    index += width;
  }
  return { masked, substitutions, end: index };
}

function maskCasePatterns(masked: string): string {
  return masked.replaceAll(
    CASE_PATTERNS_PATTERN,
    (_match, keyword: string, space: string, patterns: string) =>
      `${keyword}${space}${" ".repeat(patterns.length)}`,
  );
}

function maskArrayAssignments(masked: string): string {
  let result = masked;
  for (const match of masked.matchAll(ARRAY_ASSIGNMENT_START_PATTERN)) {
    const open = match.index + match[0].length - 1;
    const close = result.indexOf(")", open);
    const stop = close === -1 ? result.length : close + 1;
    result = `${result.slice(0, open)}${"x".repeat(stop - open)}${result.slice(stop)}`;
  }
  return result;
}

function commandIn(
  script: string,
  masked: string,
  span: { start: number; end: number },
  functions: ReadonlySet<string>,
): string | undefined {
  const segment = masked.slice(span.start, span.end);
  const words = segment.matchAll(/\S+/g).toArray();
  let position = 0;
  while (position < words.length) {
    const word = words[position]?.[0] ?? "";
    if (CLAUSE_WORDS.has(word)) return undefined;
    if (REDIRECTION_OPERATOR_PATTERN.test(word)) {
      position += 2;
    } else if (
      RESERVED_WORDS.has(word) ||
      ASSIGNMENT_WORD_PATTERN.test(word) ||
      ATTACHED_REDIRECTION_PATTERN.test(word)
    ) {
      position += 1;
    } else {
      break;
    }
  }
  const head = words[position];
  if (head === undefined) return undefined;
  const headStart = span.start + head.index;
  if (functions.has(script.slice(headStart, headStart + head[0].length))) return undefined;
  const length = masked.slice(headStart, span.end).trimEnd().length;
  return script.slice(headStart, headStart + length);
}

function listScriptCommands(script: string): string[] {
  const { masked: quoted, substitutions } = maskShell(script, 0, false);
  const masked = maskArrayAssignments(maskCasePatterns(quoted));
  const functions = new Set(
    masked.matchAll(FUNCTION_DEFINITION_PATTERN).map((match) => match[1] ?? ""),
  );
  const commands: string[] = [];
  let start = 0;
  for (let index = 0; index <= masked.length; index += 1) {
    if (index < masked.length && !COMMAND_SEPARATOR_PATTERN.test(masked[index] ?? "")) continue;
    const command = commandIn(script, masked, { start, end: index }, functions);
    if (command !== undefined) commands.push(command);
    start = index + 1;
  }
  return [
    ...commands,
    ...substitutions.flatMap((substitution) => listScriptCommands(substitution)),
  ];
}

/**
 * Lists every command a `run:` script executes, each from its first word:
 * commands joined by `&&`, `||`, `|` and `;`, inside `if`, loops and groups,
 * and inside `$( )` substitutions. Heredoc bodies, `case` patterns, array
 * lists and calls to functions the script defines are not commands; each
 * `[[ ]]` or `(( ))` test is one `[[x]]` command, since the `||` and `&&`
 * inside a test do not split commands. Ported
 * from aokit's workflow rules library: a shell parser in miniature.
 * @param run The step's `run` script.
 * @returns The commands, in order, then those inside substitutions.
 */
function listStepCommands(run: string): string[] {
  const script = removeHeredocBodies(run.replaceAll("\r\n", "\n"))
    .replaceAll("\\\n", "  ")
    .replaceAll(/\d*>&\d+/g, "")
    .replaceAll(/\$\(\([^\n]*?\)\)/g, "0")
    .replaceAll(/\(\([^\n]*?\)\)/g, "[[x]]")
    .replaceAll(/\[\[[^\n]*?\]\]/g, "[[x]]");
  return listScriptCommands(script);
}

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Reads the `scripts` keys of a workspace's `package.json`.
 * @param directory The workspace directory, relative to the repository root.
 * @returns The script names; empty when the manifest has none.
 */
function readPackageScripts(directory: string): ReadonlySet<string> {
  const manifest = JSON.parse(
    readFileSync(path.join(REPOSITORY_ROOT, directory, "package.json"), "utf8"),
  ) as { scripts?: Record<string, unknown> };
  return new Set(Object.keys(manifest.scripts ?? {}));
}

/**
 * Tells whether a command calls a script: a repo script under `scripts/`, or
 * `bun run <name>` where `<name>` is a script of the root `package.json` (or
 * of the `--cwd` workspace). `bun run` also executes `node_modules/.bin`
 * binaries, which is a raw tool call.
 * @param command One command from {@link listStepCommands}.
 * @param directory The directory the command runs in, relative to the root.
 * @returns Whether the command is a script call.
 */
function isScriptCall(command: string, directory = "."): boolean {
  if (!SCRIPT_CALL_PATTERN.test(command)) return false;
  const match = BUN_RUN_SCRIPT_PATTERN.exec(command);
  return (
    match === null || readPackageScripts(path.join(directory, match[1] ?? ".")).has(match[2] ?? "")
  );
}

/**
 * The `steps-call-scripts` rule (F10): a step calls `bun run <script>` or a
 * repo script under `scripts/`, never a raw tool such as `bunx commitlint`,
 * unless an exemption admits the command with a reason.
 * @param workflow The parsed workflow document.
 * @param exemptions The admitted commands and their reasons.
 * @returns One message per command that is neither a script call nor exempt.
 */
function findStepScriptProblems(
  workflow: Workflow,
  exemptions: readonly ScriptExemption[] = STEPS_CALL_SCRIPTS_EXEMPTIONS,
): string[] {
  return listRunCommands(workflow)
    .filter(
      ({ command, directory }) =>
        !isScriptCall(command, directory) &&
        exemptions.every((exemption) => !exemption.command.test(command)),
    )
    .map(({ step, command }) => `step "${step}" runs \`${command}\` directly`);
}

interface RunCommand {
  readonly step: string;
  readonly command: string;
  readonly directory: string;
}

/**
 * Lists every command of every `run:` step with the directory it runs in: the
 * step's `working-directory`, then any `cd` earlier in the same script.
 * @param workflow The parsed workflow document.
 * @returns One entry per command, in step order.
 */
function listRunCommands(workflow: Workflow): RunCommand[] {
  return collectSteps(workflow).flatMap((step) => {
    const stepName = step.name ?? step.uses ?? "run";
    const workingDirectory = (step as { "working-directory"?: unknown })["working-directory"];
    let directory = typeof workingDirectory === "string" ? workingDirectory : ".";
    return listStepCommands(step.run ?? "").map((command) => {
      const entry = { step: stepName, command, directory };
      const change = /^cd (\S+)$/.exec(command);
      if (change) directory = path.join(directory, change[1] ?? ".");
      return entry;
    });
  });
}

const allFiles = listWorkflowFiles();

describe("steps call scripts (F10)", () => {
  test.each(allFiles)("every %s step calls a script or an exempted command", (fileName) => {
    expect(findStepScriptProblems(readWorkflow(fileName))).toEqual([]);
  });

  test("every exemption admits a command some step runs, and has a reason", () => {
    const commands = allFiles.flatMap((fileName) =>
      listRunCommands(readWorkflow(fileName)).map(({ command }) => command),
    );
    for (const exemption of STEPS_CALL_SCRIPTS_EXEMPTIONS) {
      expect(exemption.reason.trim()).not.toBe("");
      expect(commands.some((command) => exemption.command.test(command))).toBe(true);
    }
  });

  test("lists the commands of a script, joined, nested and substituted", () => {
    expect(
      listStepCommands(
        [
          'if [[ -z "${A}" || -n "${B}" ]]; then',
          '  value="$(bunx tsc --noEmit)" && bun run check',
          "fi",
          "while (( SECONDS < 10 )); do sleep 1; done",
          "gh release view v1 > /dev/null 2>&1 | grep -q .",
          "cat <<EOF",
          "bunx hidden",
          "EOF",
        ].join("\n"),
      ),
    ).toEqual([
      "[[x]]",
      "bun run check",
      "[[x]]",
      "sleep 1",
      "gh release view v1 > /dev/null",
      "grep -q .",
      "cat <<EOF",
      "bunx tsc --noEmit",
    ]);
  });

  test("the rule rejects a raw tool, an unknown script and a script outside its workspace", () => {
    const broken = parse(`
jobs:
  lint:
    steps:
      - name: Lint
        run: |
          bunx oxlint .
          bun run not-a-script
          bun run check
      - name: Site
        working-directory: apps/site
        run: |
          bun run test:visual
          bun run release
`) as Workflow;

    expect(findStepScriptProblems(broken, [])).toEqual([
      'step "Lint" runs `bunx oxlint .` directly',
      'step "Lint" runs `bun run not-a-script` directly',
      'step "Site" runs `bun run release` directly',
    ]);
  });
});

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
    "workflow has no concurrency group",
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

  test("every job's runner carries a recorded reason (F10)", () => {
    const runnableJobKeys = allFiles.flatMap((fileName) =>
      Object.entries(readWorkflow(fileName).jobs ?? {})
        .filter(([, job]) => job.uses === undefined)
        .map(([jobName]) => `${fileName}:${jobName}`),
    );

    expect(
      findRunnerReasonProblems(runnableJobKeys, ROUTED_JOB_REASONS, LITERAL_RUNNER_JOB_REASONS),
    ).toEqual([]);
  });

  test("the reason rule rejects an unlisted, doubly listed, unreasoned or stale job", () => {
    expect(
      findRunnerReasonProblems(
        ["a.yml:new", "a.yml:both", "a.yml:blank"],
        { "a.yml:both": "light", "a.yml:blank": " " },
        { "a.yml:both": "heavy", "a.yml:gone": "heavy" },
      ),
    ).toEqual([
      "a.yml:new has no recorded runner reason",
      "a.yml:both is listed as both routed and literal",
      "a.yml:blank has an empty runner reason",
      "a.yml:gone is listed but no such job exists",
    ]);
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

  describe("latest-Bun canary (F9)", () => {
    const canary = workflow.jobs?.["bun-canary"];
    const setupBun = (canary?.steps ?? []).find((step) =>
      step.uses?.startsWith("oven-sh/setup-bun@"),
    );

    test("installs the latest Bun, not the pinned one", () => {
      expect(setupBun?.with?.["bun-version"]).toBe("latest");
      expect(setupBun?.with?.["bun-version-file"]).toBeUndefined();
    });

    test("runs check and test on it", () => {
      const runs = (canary?.steps ?? []).map((step) => step.run ?? "").join("\n");
      expect(runs).toContain("bun run check");
      expect(runs).toContain("bun run test");
    });

    test("never blocks CI passed: a Bun release breaks the canary, not merges", () => {
      expect(needsList(workflow.jobs?.["ci-passed"]?.needs)).not.toContain("bun-canary");
    });
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

  test("analyzes without a build (F7)", () => {
    const init = collectSteps(readWorkflow("codeql.yml")).find((step) =>
      step.uses?.startsWith(CODEQL_INIT),
    );
    expect(init?.with?.["build-mode"]).toBe("none");
  });
});

describe("manual dispatch (F6)", () => {
  test.each(["ci.yml", "codeql.yml", "lint-docs.yml"])(
    "%s accepts workflow_dispatch",
    (fileName) => {
      expect(missingTriggers(readWorkflow(fileName), ["workflow_dispatch"])).toEqual([]);
    },
  );
});

describe("code scanning skips private repositories (F7)", () => {
  test.each(["codeql.yml", "scorecard.yml"])(
    "every %s job skips a private repository",
    (fileName) => {
      const jobs = Object.values(readWorkflow(fileName).jobs ?? {});
      expect(jobs.length).toBeGreaterThan(0);
      for (const job of jobs) {
        expect(isSkippedOnPrivateRepositories(job.if)).toBe(true);
      }
    },
  );

  test("the rule rejects a condition that can still run on a private repository", () => {
    expect(isSkippedOnPrivateRepositories(undefined)).toBe(false);
    expect(isSkippedOnPrivateRepositories("github.ref == 'refs/heads/main'")).toBe(false);
    expect(isSkippedOnPrivateRepositories(`${PUBLIC_REPOSITORY_GUARD} || always()`)).toBe(false);
    expect(isSkippedOnPrivateRepositories(`\${{ ${PUBLIC_REPOSITORY_GUARD} }}`)).toBe(true);
  });
});

describe("lint-workflows.yml (F10)", () => {
  test("runs on pushes to main and develop, not only on pull requests", () => {
    const workflow = readWorkflow("lint-workflows.yml");
    expect(pushBranches(workflow)).toEqual(["main", "develop"]);
    expect(missingTriggers(workflow, ["pull_request"])).toEqual([]);
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

  test("runs the release gates before any install, check, test or build (F4, F13)", () => {
    const verifySteps = workflow.jobs?.verify?.steps ?? [];
    const gateIndex = verifySteps.findIndex((step) =>
      (step.run ?? "").includes(
        'bun scripts/release-gates.ts "${GITHUB_REF_NAME}" --allowed-signers',
      ),
    );
    const firstBuildIndex = verifySteps.findIndex((step) =>
      /bun install|bun run|turbo/.test(step.run ?? ""),
    );

    expect(gateIndex).toBeGreaterThanOrEqual(0);
    expect(firstBuildIndex).toBeGreaterThan(gateIndex);
    expect(verifySteps[gateIndex]?.if).toBeUndefined();
    expect(verifySteps[gateIndex]?.["continue-on-error"]).toBeUndefined();
  });

  test("fetches the tag object itself before the gates read it", () => {
    expect(verifyRuns).toContain(
      'git fetch --no-tags --force origin "+refs/tags/${GITHUB_REF_NAME}:refs/tags/${GITHUB_REF_NAME}"',
    );
  });

  test("never cancels a release in progress (F6)", () => {
    expect(hasConcurrencyGroup(workflow)).toBe(true);
    expect(doesCancelInProgress(workflow, "refs/tags/v1.0.0")).toBe(false);
  });

  test("the CI wait survives a failed check-runs call (F6)", () => {
    expect(verifyRuns).toMatch(/gh api [^\n]*check-runs[\s\S]*?\) \|\| run_json=''/);
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

describe("flaky test summary (E20)", () => {
  test.each([
    ["ci.yml", "e2e", "Run E2E tests", "apps/extension/test-results/report.json"],
    ["ci.yml", "e2e", "Run E2E tests", "apps/site/test-results/report.json"],
    [
      "site-quality.yml",
      "e2e",
      "Run the smoke and accessibility spec",
      "apps/site/test-results/report.json",
    ],
  ])(
    "%s:%s summarizes %s's retried tests from %s",
    (fileName, jobName, testStepName, reportPath) => {
      const steps = readWorkflow(fileName).jobs?.[jobName]?.steps ?? [];
      const testIndex = steps.findIndex((step) => step.name === testStepName);
      const summaryIndex = steps.findIndex(
        (step) =>
          (step.run ?? "").includes("bun scripts/flaky-summary.ts") &&
          (step.run ?? "").includes(`=${reportPath}`),
      );

      expect(testIndex).toBeGreaterThanOrEqual(0);
      expect(summaryIndex).toBeGreaterThan(testIndex);
      expect(steps[summaryIndex]?.if).toBe("${{ !cancelled() }}");
    },
  );

  test.each([
    "apps/extension/playwright.config.ts",
    "apps/site/playwright.config.ts",
    "apps/site/playwright.container.config.ts",
  ])("%s writes the JSON report the summary reads in CI", (configPath) => {
    const source = readFileSync(path.join(REPOSITORY_ROOT, configPath), "utf8");
    expect(source).toContain('["json", { outputFile: "test-results/report.json" }]');
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
