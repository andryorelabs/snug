const SECTION_HEADING = /^## \[/;
const SUBSECTION_HEADING = /^### /;
const LINK_DEFINITION = /^\[[^\]]+\]:\s/;
const UNRELEASED_HEADING = /^## \[Unreleased\]\s*$/i;
const UNRELEASED_LINK = /^\[Unreleased\]: (\S+)\/compare\/v(\S+)\.\.\.HEAD\s*$/i;
const LIST_ITEM = /^[-*] +(.*)$/;

/**
 * A CHANGELOG that cannot be released or read as asked. The message is
 * written for the person cutting the release.
 */
export class ChangelogError extends Error {
  override readonly name = "ChangelogError";
}

/**
 * The CHANGELOG after a release is cut: the full `text` with the new dated
 * section and compare links, and `items`, one plain-text entry per list item
 * that was under `[Unreleased]`.
 */
export interface ReleaseCut {
  readonly text: string;
  readonly items: readonly string[];
}

/**
 * What the CHANGELOG holds for one version.
 */
export type SectionLookup =
  | { readonly status: "missing" }
  | { readonly status: "empty" }
  | { readonly status: "found"; readonly body: string };

function hasContent(line: string): boolean {
  return line.trim() !== "";
}

function findSectionBody(
  lines: readonly string[],
  isHeading: (line: string) => boolean,
): { headingIndex: number; body: string[] } | undefined {
  const headingIndex = lines.findIndex((line) => isHeading(line));
  if (headingIndex === -1) {
    return undefined;
  }
  const rest = lines.slice(headingIndex + 1);
  const length = rest.findIndex((line) => SECTION_HEADING.test(line) || LINK_DEFINITION.test(line));
  return {
    headingIndex,
    body: length === -1 ? rest : rest.slice(0, length),
  };
}

function dropEmptySubsections(body: readonly string[]): string[] {
  const kept: string[] = [];
  let subsection: string[] = [];
  const flush = () => {
    const [first = "", ...rest] = subsection;
    if (!SUBSECTION_HEADING.test(first) || rest.some((line) => hasContent(line))) {
      kept.push(...subsection);
    }
    subsection = [];
  };
  for (const line of body) {
    if (SUBSECTION_HEADING.test(line)) {
      flush();
    }
    subsection.push(line);
  }
  flush();
  return kept;
}

function trimBlankEdges(lines: readonly string[]): string[] {
  const first = lines.findIndex((line) => hasContent(line));
  const last = lines.findLastIndex((line) => hasContent(line));
  return first === -1 ? [] : lines.slice(first, last + 1);
}

function listItems(body: readonly string[]): string[] {
  const items: string[] = [];
  let isInsideItem = false;
  for (const line of body) {
    const item = LIST_ITEM.exec(line);
    if (item) {
      items.push((item[1] ?? "").trim());
      isInsideItem = true;
    } else if (isInsideItem && /^\s+\S/.test(line)) {
      items[items.length - 1] += ` ${line.trim()}`;
    } else if (hasContent(line)) {
      isInsideItem = false;
    }
  }
  return items;
}

/**
 * Moves everything under `[Unreleased]` into a dated section for `version`
 * and rewrites the compare links, leaving `[Unreleased]` empty. Subsection
 * headings with nothing under them are not carried over.
 * @param changelog The current CHANGELOG text.
 * @param version The version being released, without a leading `v`.
 * @param isoDate The release date as `YYYY-MM-DD`.
 * @returns The new CHANGELOG text and the released entries.
 * @throws {ChangelogError} When `[Unreleased]` is missing or has no list
 * item, when the version already has a section, or when the `[Unreleased]`
 * compare link is missing.
 */
export function cutRelease(changelog: string, version: string, isoDate: string): ReleaseCut {
  const lines = changelog.split("\n");
  const unreleased = findSectionBody(lines, (line) => UNRELEASED_HEADING.test(line));
  if (!unreleased) {
    throw new ChangelogError('CHANGELOG.md has no "## [Unreleased]" section');
  }
  if (lines.some((line) => line.startsWith(`## [${version}]`))) {
    throw new ChangelogError(`CHANGELOG.md already has a section for ${version}`);
  }
  const body = trimBlankEdges(dropEmptySubsections(unreleased.body));
  const items = listItems(body);
  if (items.length === 0) {
    throw new ChangelogError(
      'The "## [Unreleased]" section of CHANGELOG.md has no entries to release',
    );
  }
  const afterUnreleased = lines.slice(unreleased.headingIndex + 1 + unreleased.body.length);
  const linkIndex = afterUnreleased.findIndex((line) => UNRELEASED_LINK.test(line));
  const link = UNRELEASED_LINK.exec(afterUnreleased[linkIndex] ?? "");
  if (!link) {
    throw new ChangelogError(
      'CHANGELOG.md has no "[Unreleased]: <repo>/compare/vX.Y.Z...HEAD" link to update',
    );
  }
  const [, repositoryUrl = "", previousVersion = ""] = link;
  afterUnreleased.splice(
    linkIndex,
    1,
    `[Unreleased]: ${repositoryUrl}/compare/v${version}...HEAD`,
    `[${version}]: ${repositoryUrl}/compare/v${previousVersion}...v${version}`,
  );
  const text = [
    ...lines.slice(0, unreleased.headingIndex + 1),
    "",
    `## [${version}] - ${isoDate}`,
    "",
    ...body,
    "",
    ...afterUnreleased,
  ].join("\n");
  return { text, items };
}

/**
 * Looks up the CHANGELOG section of one released version.
 * @param changelog The CHANGELOG text.
 * @param version The version to look up, without a leading `v`.
 * @returns `missing` when no `## [version]` heading exists, `empty` when the
 * section holds nothing but blank lines and subsection headings, otherwise
 * the section body without its heading.
 */
export function readSection(changelog: string, version: string): SectionLookup {
  const section = findSectionBody(changelog.split("\n"), (line) =>
    line.startsWith(`## [${version}]`),
  );
  if (!section) {
    return { status: "missing" };
  }
  const body = trimBlankEdges(dropEmptySubsections(section.body));
  return body.length === 0 ? { status: "empty" } : { status: "found", body: body.join("\n") };
}
