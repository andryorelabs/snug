export interface ReleaseNote {
  version: string
  isoDate: string
  body: string
}

const RELEASE_HEADING =
  /^## \[(\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)\] - (\d{4}-\d{2}-\d{2})$/
const NUMERIC_IDENTIFIER = /^\d+$/
const UNRELEASED_HEADING = /^## \[Unreleased\]\s*$/i
const SECOND_LEVEL_HEADING = /^## /
const LINK_REFERENCE_DEFINITION = /^\[[^\]]+\]:\s+\S+$/

function splitVersion(version: string): {
  core: number[]
  prerelease: string[]
} {
  const separator = version.indexOf('-')
  const core = separator === -1 ? version : version.slice(0, separator)
  const prerelease = separator === -1 ? '' : version.slice(separator + 1)
  return {
    core: core.split('.').map(Number),
    prerelease: prerelease === '' ? [] : prerelease.split('.'),
  }
}

function compareIdentifiersAscending(left: string, right: string): number {
  const isLeftNumeric = NUMERIC_IDENTIFIER.test(left)
  const isRightNumeric = NUMERIC_IDENTIFIER.test(right)
  if (isLeftNumeric && isRightNumeric) return Number(left) - Number(right)
  if (isLeftNumeric) return -1
  if (isRightNumeric) return 1
  if (left === right) return 0
  return left < right ? -1 : 1
}

function comparePrereleasesAscending(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) {
    return right.length - left.length
  }
  for (const [index, leftIdentifier] of left.entries()) {
    const rightIdentifier = right[index]
    if (rightIdentifier === undefined) break
    const difference = compareIdentifiersAscending(
      leftIdentifier,
      rightIdentifier,
    )
    if (difference !== 0) return difference
  }
  return left.length - right.length
}

function compareVersionsDescending(left: string, right: string): number {
  const leftVersion = splitVersion(left)
  const rightVersion = splitVersion(right)
  for (let index = 0; index < 3; index += 1) {
    const difference =
      (rightVersion.core[index] ?? 0) - (leftVersion.core[index] ?? 0)
    if (difference !== 0) return difference
  }
  return comparePrereleasesAscending(
    rightVersion.prerelease,
    leftVersion.prerelease,
  )
}

function assertRealDate(isoDate: string, lineNumber: number, line: string) {
  const parsed = new Date(`${isoDate}T00:00:00Z`)
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== isoDate
  ) {
    throw new Error(
      `CHANGELOG.md line ${lineNumber}: invalid release date in "${line}"`,
    )
  }
}

interface OpenEntry {
  version: string
  isoDate: string
  lines: string[]
}

/**
 * Parses a Keep a Changelog document into release entries, newest first.
 * Everything before the first release heading is ignored, and a bare
 * `## [Unreleased]` section is skipped, as are the compare-link reference
 * definitions (`[x.y.z]: https://…`) at the end of the file. Any other `## ` heading that is not
 * `## [x.y.z] - YYYY-MM-DD` throws an error naming the offending line.
 * @param markdown - The raw `CHANGELOG.md` contents.
 * @returns The release entries, newest first.
 */
export function parseChangelog(markdown: string): ReleaseNote[] {
  const entries: ReleaseNote[] = []
  let current: OpenEntry | null = null

  const flush = () => {
    if (!current) return
    entries.push({
      version: current.version,
      isoDate: current.isoDate,
      body: current.lines.join('\n').trim(),
    })
    current = null
  }

  const lines = markdown.split(/\r?\n/)
  for (const [index, line] of lines.entries()) {
    if (LINK_REFERENCE_DEFINITION.test(line)) continue
    if (!SECOND_LEVEL_HEADING.test(line)) {
      current?.lines.push(line)
      continue
    }
    flush()
    if (UNRELEASED_HEADING.test(line)) continue
    const match = RELEASE_HEADING.exec(line)
    if (!match) {
      throw new Error(
        `CHANGELOG.md line ${index + 1}: malformed release heading "${line}"; expected "## [x.y.z] - YYYY-MM-DD", with an optional prerelease suffix on the version`,
      )
    }
    const [, version = '', isoDate = ''] = match
    assertRealDate(isoDate, index + 1, line)
    current = { version, isoDate, lines: [] }
  }
  flush()

  return entries.toSorted((left, right) =>
    compareVersionsDescending(left.version, right.version),
  )
}

/**
 * Renders the What's new page markdown: one H2 per version followed by its
 * date line and the entry body verbatim.
 * @param entries - Entries from `parseChangelog`.
 * @returns The What's new page markdown.
 */
export function renderReleaseNotesMarkdown(entries: ReleaseNote[]): string {
  const sections = entries.map(
    (entry) => `## ${entry.version}\n\n${entry.isoDate}\n\n${entry.body}`,
  )
  return `${sections.join('\n\n')}\n`
}
