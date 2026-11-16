/**
 * Side effects the hook needs, injectable so the policy stays testable.
 */
export interface CommitMessageDependencies {
  runCommitlint: (messageFile: string) => number;
  log: (message: string) => void;
}

/**
 * Runs the commit-msg policy: lint the message file git passes as the first
 * argument with commitlint.
 * @param messageFile - Path of the commit message file, or undefined when git passed none.
 * @param dependencies - Side effects: commitlint runner, logger.
 * @returns 0 to allow the commit, non-zero to block it.
 */
export function runCommitMessage(
  messageFile: string | undefined,
  dependencies: CommitMessageDependencies,
): number {
  if (messageFile === undefined || messageFile === "") {
    dependencies.log("commit-msg: git passed no commit message file");
    return 1;
  }
  return dependencies.runCommitlint(messageFile);
}

if (import.meta.main) {
  process.exitCode = runCommitMessage(process.argv[2], {
    runCommitlint: (messageFile) =>
      Bun.spawnSync(["bunx", "commitlint", "--edit", messageFile], {
        stdout: "inherit",
        stderr: "inherit",
      }).exitCode,
    log: (message) => {
      console.error(message);
    },
  });
}
