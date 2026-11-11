const NUMERIC_IDENTIFIER = String.raw`0|[1-9]\d*`
const PRERELEASE_IDENTIFIER = String.raw`(?:${NUMERIC_IDENTIFIER}|\d*[a-zA-Z-][0-9a-zA-Z-]*)`
const VERSION_PATTERN = new RegExp(
  String.raw`^(${NUMERIC_IDENTIFIER})\.(${NUMERIC_IDENTIFIER})\.(${NUMERIC_IDENTIFIER})` +
    String.raw`(?:-(${PRERELEASE_IDENTIFIER}(?:\.${PRERELEASE_IDENTIFIER})*))?$`,
)

/**
 * A parsed `MAJOR.MINOR.PATCH[-prerelease]` version.
 */
export interface Version {
  readonly major: number
  readonly minor: number
  readonly patch: number
  readonly prerelease: readonly string[]
}

/**
 * Parses a release version. Accepts SemVer 2.0.0 without build metadata and
 * without a leading `v`, since the value is written verbatim into
 * `package.json` and the CHANGELOG heading.
 * @param text The version as typed, such as `2.4.0` or `2.4.0-beta.1`.
 * @returns The parsed version, or `undefined` when the text is not valid.
 */
export function parseVersion(text: string): Version | undefined {
  const match = VERSION_PATTERN.exec(text)
  if (!match) {
    return undefined
  }
  const [, major, minor, patch, prerelease] = match
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    prerelease: prerelease ? prerelease.split('.') : [],
  }
}

function compareIdentifiers(first: string, second: string): number {
  const isFirstNumeric = /^\d+$/.test(first)
  const isSecondNumeric = /^\d+$/.test(second)
  if (isFirstNumeric && isSecondNumeric) {
    return Number(first) - Number(second)
  }
  if (isFirstNumeric !== isSecondNumeric) {
    return isFirstNumeric ? -1 : 1
  }
  if (first === second) {
    return 0
  }
  return first < second ? -1 : 1
}

function comparePrerelease(
  first: readonly string[],
  second: readonly string[],
): number {
  if (first.length === 0 || second.length === 0) {
    return second.length - first.length
  }
  const sharedLength = Math.min(first.length, second.length)
  const firstDifference = first
    .slice(0, sharedLength)
    .map((identifier, index) =>
      compareIdentifiers(identifier, second[index] ?? ''),
    )
    .find((difference) => difference !== 0)
  return firstDifference ?? first.length - second.length
}

/**
 * Orders two versions by SemVer precedence, so `2.4.0-beta.1` sorts before
 * `2.4.0` and after `2.3.1`.
 * @param first The version on the left.
 * @param second The version on the right.
 * @returns A negative number when `first` is lower, positive when it is
 * higher, and zero when both have the same precedence.
 */
export function compareVersions(first: Version, second: Version): number {
  return (
    first.major - second.major ||
    first.minor - second.minor ||
    first.patch - second.patch ||
    comparePrerelease(first.prerelease, second.prerelease)
  )
}
