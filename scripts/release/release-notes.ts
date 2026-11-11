import { readFileSync } from "node:fs";
import path from "node:path";

import { ChangelogError, readSection } from "./changelog";

/**
 * Returns the release notes of a tag: the body of its CHANGELOG section.
 * `release.yml` runs this before anything is built or published, so a tag
 * without notes never reaches a store.
 * @param tag The pushed tag, such as `v2.4.0`.
 * @param changelog The CHANGELOG text at the tagged commit.
 * @returns The section body, without its heading.
 * @throws {ChangelogError} When the section for the tag is missing or empty.
 */
export function releaseNotes(tag: string, changelog: string): string {
  const version = tag.replace(/^v/, "");
  const section = readSection(changelog, version);
  if (section.status === "missing") {
    throw new ChangelogError(`CHANGELOG.md has no "## [${version}]" section for the tag ${tag}`);
  }
  if (section.status === "empty") {
    throw new ChangelogError(`The "## [${version}]" section of CHANGELOG.md is empty`);
  }
  return section.body;
}

/**
 * Runs `bun scripts/release/release-notes.ts <tag>`.
 * @param commandArguments The arguments after the script name.
 * @param readChangelog Reads the CHANGELOG text.
 * @param output Receives the release notes and error lines.
 * @param output.notes Receives the release notes, for standard output.
 * @param output.error Receives each error line, for standard error.
 * @returns The process exit code: 0 with the notes written, 1 otherwise.
 */
export function runReleaseNotes(
  commandArguments: readonly string[],
  readChangelog: () => string,
  output: { notes: (text: string) => void; error: (message: string) => void },
): number {
  const [tag, ...extra] = commandArguments;
  if (!tag || extra.length > 0) {
    output.error("Usage: bun scripts/release/release-notes.ts <tag>");
    return 1;
  }
  try {
    output.notes(releaseNotes(tag, readChangelog()));
    return 0;
  } catch (error) {
    if (error instanceof ChangelogError) {
      output.error(`release-notes: ${error.message}`);
      return 1;
    }
    throw error;
  }
}

if (import.meta.main) {
  process.exitCode = runReleaseNotes(
    process.argv.slice(2),
    () => readFileSync(path.resolve(import.meta.dirname, "../../CHANGELOG.md"), "utf8"),
    {
      notes: (text) => console.log(text),
      error: (message) => console.error(message),
    },
  );
}
