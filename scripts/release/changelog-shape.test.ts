import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPOSITORY_URL = "https://github.com/andryorelabs/snug";
const GROUPS = ["Added", "Changed", "Fixed"] as const;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

interface ReleaseSection {
  readonly version: string;
  readonly lines: readonly string[];
}

/**
 * Splits a CHANGELOG into its released sections, leaving out `[Unreleased]`.
 * @param changelog The CHANGELOG text.
 * @returns One entry per `## [x.y.z]` heading, newest first.
 */
function releaseSections(changelog: string): ReleaseSection[] {
  const sections: { version: string; lines: string[] }[] = [];
  let isInRelease = false;
  for (const line of changelog.split("\n")) {
    const heading = /^## \[([^\]]+)\]/.exec(line);
    if (heading) {
      const version = heading[1] ?? "";
      isInRelease = version !== "Unreleased";
      if (isInRelease) sections.push({ version, lines: [] });
    } else if (/^\[[^\]]+\]: /.test(line)) {
      isInRelease = false;
    } else if (isInRelease) {
      sections.at(-1)?.lines.push(line);
    }
  }
  return sections;
}

/**
 * Lists the problems with the group structure of one released section.
 * @param section The released section.
 * @returns A message per problem; empty when the section is well formed.
 */
function groupProblems(section: ReleaseSection): string[] {
  const problems: string[] = [];
  const headings = section.lines
    .filter((line) => line.startsWith("### "))
    .map((line) => line.slice(4).trim());
  if (headings.length === 0) {
    problems.push(`[${section.version}] has no ### group heading`);
  }
  for (const heading of headings) {
    if (!(GROUPS as readonly string[]).includes(heading)) {
      problems.push(`[${section.version}] has an unknown group "### ${heading}"`);
    }
  }
  if (new Set(headings).size !== headings.length) {
    problems.push(`[${section.version}] repeats a group heading`);
  }
  const firstContent = section.lines.find((line) => line.trim() !== "");
  if (firstContent !== undefined && headings.length > 0 && !firstContent.startsWith("### ")) {
    problems.push(`[${section.version}] has content before its first group heading`);
  }
  return problems;
}

/**
 * Reads the compare-link reference definitions at the end of a CHANGELOG.
 * @param changelog The CHANGELOG text.
 * @returns A map from the reference label to its URL.
 */
function linkReferences(changelog: string): Map<string, string> {
  const references = new Map<string, string>();
  for (const match of changelog.matchAll(/^\[([^\]]+)\]: (\S+)$/gm)) {
    references.set(match[1] ?? "", match[2] ?? "");
  }
  return references;
}

/**
 * Lists the problems with the compare-link references of a CHANGELOG.
 * @param changelog The CHANGELOG text.
 * @returns A message per problem; empty when every version has its link.
 */
function linkProblems(changelog: string): string[] {
  const problems: string[] = [];
  const references = linkReferences(changelog);
  const versions = releaseSections(changelog).map((section) => section.version);
  for (const version of versions) {
    const url = references.get(version);
    if (url === undefined) {
      problems.push(`[${version}] has no compare-link reference`);
    } else if (
      !url.startsWith(`${REPOSITORY_URL}/compare/`) &&
      url !== `${REPOSITORY_URL}/releases/tag/v${version}`
    ) {
      problems.push(`[${version}] links to ${url}`);
    } else if (url.includes("/compare/") && !url.endsWith(`...v${version}`)) {
      problems.push(`[${version}] compare link does not end at v${version}`);
    }
  }
  const newest = versions[0];
  if (references.get("Unreleased") !== `${REPOSITORY_URL}/compare/v${newest ?? ""}...HEAD`) {
    problems.push("[Unreleased] must compare the newest release with HEAD");
  }
  return problems;
}

const GROUPED = `# Changelog

## [Unreleased]

## [1.1.0] - 2026-01-02

### Added

- Thing.

## [1.0.0] - 2026-01-01

### Fixed

- Other.

[Unreleased]: ${REPOSITORY_URL}/compare/v1.1.0...HEAD
[1.1.0]: ${REPOSITORY_URL}/compare/v1.0.0...v1.1.0
[1.0.0]: ${REPOSITORY_URL}/releases/tag/v1.0.0
`;

describe("CHANGELOG.md shape", () => {
  const changelog = readFileSync(path.resolve(import.meta.dirname, "../../CHANGELOG.md"), "utf8");

  it("opens with the Keep a Changelog and SemVer preamble", () => {
    expect(changelog).toContain("https://keepachangelog.com/en/1.1.0/");
    expect(changelog).toContain("https://semver.org/spec/v2.0.0.html");
  });

  it("has an Unreleased section and valid SemVer release headings", () => {
    expect(changelog).toMatch(/^## \[Unreleased\]$/m);
    const sections = releaseSections(changelog);
    expect(sections.length).toBeGreaterThan(0);
    for (const section of sections) {
      expect(section.version).toMatch(SEMVER);
    }
    expect(sections.at(-1)?.version).toBe("0.1.0");
  });

  it("groups every release under Added, Changed or Fixed", () => {
    expect(releaseSections(changelog).flatMap((section) => groupProblems(section))).toEqual([]);
  });

  it("links every version, back to 0.1.0", () => {
    expect(linkProblems(changelog)).toEqual([]);
  });
});

describe("CHANGELOG shape checks", () => {
  it("accept a grouped changelog with a link per version", () => {
    expect(releaseSections(GROUPED).flatMap((section) => groupProblems(section))).toEqual([]);
    expect(linkProblems(GROUPED)).toEqual([]);
  });

  it("reject a release without a group heading", () => {
    const flat = GROUPED.replace("### Added\n\n", "");
    expect(releaseSections(flat).flatMap((section) => groupProblems(section))).toEqual([
      "[1.1.0] has no ### group heading",
    ]);
  });

  it("reject an unknown group heading", () => {
    const unknown = GROUPED.replace("### Added", "### Misc");
    expect(releaseSections(unknown).flatMap((section) => groupProblems(section))).toEqual([
      '[1.1.0] has an unknown group "### Misc"',
    ]);
  });

  it("reject a version without a compare link", () => {
    const missing = GROUPED.replace(/^\[1\.0\.0\]: .*\n/m, "");
    expect(linkProblems(missing)).toEqual(["[1.0.0] has no compare-link reference"]);
  });

  it("reject a stale Unreleased link", () => {
    const stale = GROUPED.replace("compare/v1.1.0...HEAD", "compare/v1.0.0...HEAD");
    expect(linkProblems(stale)).toEqual(["[Unreleased] must compare the newest release with HEAD"]);
  });
});
