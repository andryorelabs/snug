import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { parseJsonRecord } from "./json-guards";
import { ChangelogError } from "./release/changelog";
import { releaseNotes } from "./release/release-notes";

const USAGE = "Usage: bun scripts/release-gates.ts <tag> [--allowed-signers <file>]";
const MANIFEST_PATH = "apps/extension/package.json";

/**
 * What the release gates inspect: a tag (such as `v2.4.0`) in the repository
 * checkout at the tagged commit, with an optional SSH allowed signers file
 * for `git tag -v` (unset uses the git config) and extra environment for the
 * git processes.
 */
export interface ReleaseGateInput {
  readonly tag: string;
  readonly repositoryRoot: string;
  readonly allowedSignersFile?: string | undefined;
  readonly environment?: Readonly<Record<string, string>> | undefined;
  readonly expectedCommit?: string | undefined;
}

function git(input: ReleaseGateInput, commandArguments: readonly string[]) {
  const signerConfig =
    input.allowedSignersFile === undefined
      ? []
      : ["-c", `gpg.ssh.allowedSignersFile=${input.allowedSignersFile}`];
  return spawnSync("git", [...signerConfig, ...commandArguments], {
    cwd: input.repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, ...input.environment },
  });
}

function findTagProblems(input: ReleaseGateInput): string[] {
  const { tag } = input;
  const objectType = git(input, ["cat-file", "-t", `refs/tags/${tag}`]);
  if (objectType.status !== 0) return [`tag ${tag} does not exist`];
  if (objectType.stdout.trim() !== "tag") {
    return [`tag ${tag} is a lightweight tag; a release tag is annotated and signed (git tag -s)`];
  }
  if (git(input, ["tag", "-v", tag]).status !== 0) {
    return [`tag ${tag} has no valid signature (git tag -v failed)`];
  }
  if (input.expectedCommit === undefined) return [];
  const taggedCommit = git(input, ["rev-list", "-n", "1", `refs/tags/${tag}`]).stdout.trim();
  return taggedCommit === input.expectedCommit
    ? []
    : [
        `tag ${tag} points at ${taggedCommit}, not at the commit being released ${input.expectedCommit}`,
      ];
}

function findVersionProblems(input: ReleaseGateInput): string[] {
  const manifest = parseJsonRecord(
    readFileSync(path.join(input.repositoryRoot, MANIFEST_PATH), "utf8"),
  );
  const version = String(manifest.version);
  return input.tag === `v${version}`
    ? []
    : [`tag ${input.tag} does not match ${MANIFEST_PATH} version ${version}`];
}

function findChangelogProblems(input: ReleaseGateInput): string[] {
  const changelog = readFileSync(path.join(input.repositoryRoot, "CHANGELOG.md"), "utf8");
  try {
    releaseNotes(input.tag, changelog);
    return [];
  } catch (error) {
    if (error instanceof ChangelogError) return [error.message];
    throw error;
  }
}

/**
 * Checks the release gates of ADR 0026 (rules F4 and F13) for a tag: it is
 * annotated and signed, it equals `v` plus the extension manifest version, and
 * `CHANGELOG.md` has a non-empty section for it. `release.yml` runs this before
 * anything is built.
 * @param input The tag and the repository checkout it lives in.
 * @returns One message per failed gate; empty when the tag may be released.
 */
export function findReleaseGateProblems(input: ReleaseGateInput): string[] {
  return [
    ...findTagProblems(input),
    ...findVersionProblems(input),
    ...findChangelogProblems(input),
  ];
}

/**
 * Where {@link runReleaseGates} runs and reports.
 */
export interface ReleaseGateRunContext {
  readonly repositoryRoot: string;
  readonly environment?: Readonly<Record<string, string>> | undefined;
  readonly expectedCommit?: string | undefined;
  readonly log: (message: string) => void;
  readonly error: (message: string) => void;
}

function parseArguments(
  commandArguments: readonly string[],
): { tag: string; allowedSignersFile: string | undefined } | undefined {
  const [tag, flag, file, ...extra] = commandArguments;
  if (tag === undefined || tag.startsWith("-") || extra.length > 0) return undefined;
  if (flag === undefined) return { tag, allowedSignersFile: undefined };
  if (flag !== "--allowed-signers" || file === undefined) return undefined;
  return { tag, allowedSignersFile: file };
}

/**
 * Runs `bun scripts/release-gates.ts <tag> [--allowed-signers <file>]`.
 * @param commandArguments The arguments after the script name.
 * @param context The repository root and the output sinks.
 * @returns The process exit code: 0 when every gate passes, 1 otherwise.
 */
export function runReleaseGates(
  commandArguments: readonly string[],
  context: ReleaseGateRunContext,
): number {
  const parsed = parseArguments(commandArguments);
  if (parsed === undefined) {
    context.error(USAGE);
    return 1;
  }
  const problems = findReleaseGateProblems({
    ...parsed,
    repositoryRoot: context.repositoryRoot,
    environment: context.environment,
    expectedCommit: context.expectedCommit,
  });
  for (const problem of problems) context.error(`release-gates: ${problem}`);
  if (problems.length > 0) return 1;
  context.log(`release-gates: tag ${parsed.tag} is signed, annotated, versioned and noted`);
  return 0;
}

if (import.meta.main) {
  process.exitCode = runReleaseGates(process.argv.slice(2), {
    repositoryRoot: path.resolve(import.meta.dirname, ".."),
    expectedCommit: process.env.GITHUB_SHA,
    log: (message) => {
      console.log(message);
    },
    error: (message) => {
      console.error(message);
    },
  });
}
