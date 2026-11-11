import { describe, expect, it } from 'vitest'

import { ChangelogError, cutRelease, readSection } from './changelog'

const REPOSITORY = 'https://github.com/andryorelabs/snug'

function changelog(unreleased: string): string {
  return `# Changelog

Intro text.

## [Unreleased]
${unreleased}
## [2.3.1] - 2026-11-03

- Clearer messages.

## [2.3.0] - 2026-11-03

### Added

### Fixed

## [2.2.0] - 2026-10-10

- Oldest entry.

[Unreleased]: ${REPOSITORY}/compare/v2.3.1...HEAD
[2.3.1]: ${REPOSITORY}/compare/v2.3.0...v2.3.1
[2.3.0]: ${REPOSITORY}/compare/v2.2.0...v2.3.0
[2.2.0]: ${REPOSITORY}/releases/tag/v2.2.0
`
}

const UNRELEASED = `
### Added

- A new thing that wraps
  over two lines.

### Changed

### Fixed

- A fix.
`

describe('cutRelease', () => {
  it('moves Unreleased into a dated section and leaves it empty', () => {
    const { text } = cutRelease(changelog(UNRELEASED), '2.4.0', '2026-11-11')

    expect(text).toContain(`## [Unreleased]

## [2.4.0] - 2026-11-11

### Added

- A new thing that wraps
  over two lines.

### Fixed

- A fix.

## [2.3.1] - 2026-11-03
`)
  })

  it('updates the compare links', () => {
    const { text } = cutRelease(changelog(UNRELEASED), '2.4.0', '2026-11-11')

    expect(text).toContain(`
[Unreleased]: ${REPOSITORY}/compare/v2.4.0...HEAD
[2.4.0]: ${REPOSITORY}/compare/v2.3.1...v2.4.0
[2.3.1]: ${REPOSITORY}/compare/v2.3.0...v2.3.1
`)
  })

  it('touches nothing outside the Unreleased section and the links', () => {
    const before = changelog(UNRELEASED)
    const { text } = cutRelease(before, '2.4.0', '2026-11-11')

    expect(text.startsWith('# Changelog\n\nIntro text.\n\n')).toBe(true)
    expect(
      text.slice(text.indexOf('## [2.3.1]'), text.indexOf('[Unreleased]:')),
    ).toBe(
      before.slice(
        before.indexOf('## [2.3.1]'),
        before.indexOf('[Unreleased]:'),
      ),
    )
    expect(text.endsWith(`[2.2.0]: ${REPOSITORY}/releases/tag/v2.2.0\n`)).toBe(
      true,
    )
  })

  it('returns one joined entry per list item', () => {
    const { items } = cutRelease(changelog(UNRELEASED), '2.4.0', '2026-11-11')

    expect(items).toEqual(['A new thing that wraps over two lines.', 'A fix.'])
  })

  it('handles a prerelease version', () => {
    const { text } = cutRelease(
      changelog(UNRELEASED),
      '2.4.0-beta.1',
      '2026-11-11',
    )

    expect(text).toContain('## [2.4.0-beta.1] - 2026-11-11')
    expect(text).toContain(
      `[Unreleased]: ${REPOSITORY}/compare/v2.4.0-beta.1...HEAD`,
    )
    expect(text).toContain(
      `[2.4.0-beta.1]: ${REPOSITORY}/compare/v2.3.1...v2.4.0-beta.1`,
    )
  })

  it.each([
    ['nothing at all', '\n'],
    ['only empty subsections', '\n### Added\n\n### Changed\n\n### Fixed\n\n'],
    ['prose without a list item', '\nComing soon.\n\n'],
  ])('rejects an Unreleased section with %s', (_label, unreleased) => {
    expect(() =>
      cutRelease(changelog(unreleased), '2.4.0', '2026-11-11'),
    ).toThrow(/no entries to release/)
  })

  it('rejects a version that already has a section', () => {
    expect(() =>
      cutRelease(changelog(UNRELEASED), '2.3.1', '2026-11-11'),
    ).toThrow(/already has a section for 2\.3\.1/)
  })

  it('rejects a CHANGELOG without an Unreleased section', () => {
    const text = changelog(UNRELEASED).replace('## [Unreleased]\n', '')

    expect(() => cutRelease(text, '2.4.0', '2026-11-11')).toThrow(
      ChangelogError,
    )
  })

  it('rejects a CHANGELOG without an Unreleased compare link', () => {
    const text = changelog(UNRELEASED).replace(/\[Unreleased\]: .*\n/, '')

    expect(() => cutRelease(text, '2.4.0', '2026-11-11')).toThrow(
      /compare\/vX\.Y\.Z\.\.\.HEAD/,
    )
  })
})

describe('readSection', () => {
  it('returns the body of a released section', () => {
    expect(readSection(changelog('\n'), '2.3.1')).toEqual({
      status: 'found',
      body: '- Clearer messages.',
    })
  })

  it('stops the last section before the link definitions', () => {
    expect(readSection(changelog('\n'), '2.2.0')).toEqual({
      status: 'found',
      body: '- Oldest entry.',
    })
  })

  it('reports a version with no section as missing', () => {
    expect(readSection(changelog('\n'), '2.4.0')).toEqual({
      status: 'missing',
    })
  })

  it('does not match a version that only shares a prefix', () => {
    expect(readSection(changelog('\n'), '2.3')).toEqual({ status: 'missing' })
  })

  it('reports a section with only subsection headings as empty', () => {
    expect(readSection(changelog('\n'), '2.3.0')).toEqual({ status: 'empty' })
  })

  it('reads the section a release cut just wrote', () => {
    const { text } = cutRelease(changelog(UNRELEASED), '2.4.0', '2026-11-11')

    expect(readSection(text, '2.4.0')).toEqual({
      status: 'found',
      body: '### Added\n\n- A new thing that wraps\n  over two lines.\n\n### Fixed\n\n- A fix.',
    })
  })
})
