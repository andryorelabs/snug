const ZERO_SHA = "0".repeat(40);
const MAIN_REF = "refs/heads/main";
const HEADS_PREFIX = "refs/heads/";
const SLUG = "[a-z0-9._-]+";
const CONVENTIONAL_TYPES = "feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert";

const VALID_BRANCH = new RegExp(
  `^((${CONVENTIONAL_TYPES})/${SLUG}|ao-\\d+-${SLUG}|renovate/.+|worktree-${SLUG})$`,
);

/**
 * One `<local ref> <local sha> <remote ref> <remote sha>` line git feeds a pre-push hook.
 */
export interface PushLine {
  localSha: string;
  remoteReference: string;
}

/**
 * What the hook should do after reading the pushed refs.
 */
export type PushDecision =
  | { kind: "reject"; message: string }
  | { kind: "skip" }
  | { kind: "check"; branches: string[] };

/**
 * Side effects the hook needs, injectable so the policy stays testable.
 */
export interface PrePushDependencies {
  hasOriginMain: () => boolean;
  runAffectedCheck: () => number;
  log: (message: string) => void;
}

/**
 * Whether a branch name follows the repo convention: `<type>/<slug>`,
 * `ao-<n>-<slug>`, `renovate/*` or `worktree-*`. `main` is not valid here;
 * pushing it is refused separately.
 * @param name - The branch name without the `refs/heads/` prefix.
 * @returns True when the name is accepted.
 */
// oxlint-disable-next-line unicorn-js/consistent-boolean-name -- name fixed by the ticket interface
export function validateBranch(name: string): boolean {
  return VALID_BRANCH.test(name);
}

/**
 * Parses the stdin git passes to a pre-push hook, ignoring blank lines.
 * @param input - Raw hook stdin.
 * @returns The pushed refs.
 */
export function parsePushLines(input: string): PushLine[] {
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => {
      const [, localSha = "", remoteReference = ""] = line.split(/\s+/, 4);
      return { localSha, remoteReference };
    });
}

function invalidBranchMessage(branch: string): string {
  return [
    `Invalid branch name: ${branch}`,
    "Expected: <type>/<kebab-slug> (e.g. feat/add-export), ao-<n>-<slug>, renovate/* or worktree-*",
    "Types: feat fix docs style refactor perf test build ci chore revert",
  ].join("\n");
}

/**
 * Decides what a push means: refuse `main` and invalid branch names, skip
 * pushes that carry no commits (deletes, tag-only), otherwise run the check.
 * @param lines - The pushed refs.
 * @returns The decision.
 */
export function decidePush(lines: readonly PushLine[]): PushDecision {
  const branches: string[] = [];
  let hasCommits = false;
  for (const { localSha, remoteReference } of lines) {
    if (localSha === ZERO_SHA) {
      continue;
    }
    if (remoteReference === MAIN_REF) {
      return {
        kind: "reject",
        message: "Refusing to push to main directly. Push a feature branch and open a PR.",
      };
    }
    if (!remoteReference.startsWith(HEADS_PREFIX)) {
      continue;
    }
    hasCommits = true;
    const branch = remoteReference.slice(HEADS_PREFIX.length);
    if (!validateBranch(branch)) {
      return { kind: "reject", message: invalidBranchMessage(branch) };
    }
    branches.push(branch);
  }
  return hasCommits ? { kind: "check", branches } : { kind: "skip" };
}

/**
 * Runs the pre-push policy and returns the hook's exit code.
 * @param input - Raw hook stdin.
 * @param dependencies - Side effects: origin/main probe, check runner, logger.
 * @returns 0 to allow the push, non-zero to block it.
 */
export function runPrePush(input: string, dependencies: PrePushDependencies): number {
  const decision = decidePush(parsePushLines(input));
  if (decision.kind === "reject") {
    dependencies.log(decision.message);
    return 1;
  }
  if (decision.kind === "skip") {
    return 0;
  }
  if (!dependencies.hasOriginMain()) {
    dependencies.log("pre-push: origin/main not found, skipping affected check");
    return 0;
  }
  dependencies.log("pre-push: TURBO_SCM_BASE=origin/main bunx turbo run check --affected");
  return dependencies.runAffectedCheck();
}

function spawnSyncStatus(command: string[], environment?: Record<string, string>) {
  const result = Bun.spawnSync(command, {
    env: { ...process.env, ...environment },
    stdout: "inherit",
    stderr: "inherit",
  });
  return result.exitCode;
}

if (import.meta.main) {
  const exitCode = runPrePush(await Bun.stdin.text(), {
    hasOriginMain: () =>
      spawnSyncStatus(["git", "rev-parse", "--verify", "--quiet", "origin/main"]) === 0,
    runAffectedCheck: () =>
      spawnSyncStatus(["bunx", "turbo", "run", "check", "--affected"], {
        TURBO_SCM_BASE: "origin/main",
      }),
    log: (message) => console.error(message),
  });
  process.exitCode = exitCode;
}
