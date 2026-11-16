const KEY_FILE_PATTERN = /\.env\.keys$/;

/**
 * Side effects the hook needs, injectable so the policy stays testable.
 */
export interface PreCommitDependencies {
  listStagedPaths: () => string[];
  log: (message: string) => void;
}

/**
 * Picks the staged paths whose name ends in `.env.keys`, the file that holds
 * the dotenvx decryption keys.
 * @param paths - Repo-relative staged paths.
 * @returns The paths that must never be committed.
 */
export function findKeyFiles(paths: readonly string[]): string[] {
  return paths.filter((stagedPath) => KEY_FILE_PATTERN.test(stagedPath));
}

/**
 * Runs the pre-commit policy: refuse a commit that stages a `.env.keys` file.
 * @param dependencies - Side effects: staged-path reader, logger.
 * @returns 0 to allow the commit, non-zero to block it.
 */
export function runPreCommit(dependencies: PreCommitDependencies): number {
  const keyFiles = findKeyFiles(dependencies.listStagedPaths());
  if (keyFiles.length > 0) {
    dependencies.log(
      `Refusing to commit ${keyFiles.join(", ")}: it holds decryption keys. Unstage it with: git reset HEAD -- <path>`,
    );
    return 1;
  }
  return 0;
}

function readStagedPaths(): string[] {
  const result = Bun.spawnSync(["git", "diff", "--cached", "--name-only"], {
    stdout: "pipe",
    stderr: "inherit",
  });
  if (result.exitCode !== 0) {
    throw new Error("git diff --cached failed");
  }
  return result.stdout
    .toString()
    .split("\n")
    .filter((line) => line !== "");
}

if (import.meta.main) {
  process.exitCode = runPreCommit({
    listStagedPaths: readStagedPaths,
    log: (message) => console.error(message),
  });
}
