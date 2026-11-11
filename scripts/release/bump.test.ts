import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { bumpVersion, runRelease } from './bump'

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '../..')
const REPOSITORY = 'https://github.com/andryorelabs/snug'

const UNRELEASED = `
### Added

- A new thing that wraps
  over two lines.

### Fixed

- A fix worth $5.
`

const FIXTURE_LOCALE = `{
  "extName": {
    "message": "Snug",
    "description": "Extension name"
  },
  "changelog_2_3_1_1": {
    "message": "Clearer messages."
  }
}
`

function fixtureFiles(unreleased: string): Record<string, string> {
  return {
    'package.json': `{
  "name": "snug-monorepo",
  "version": "0.0.0"
}
`,
    'README.md': '# Snug 2.3.1\n',
    'apps/extension/package.json': `{
  "name": "snug",
  "description": "Bookmarks",
  "version": "2.3.1",
  "dependencies": {
    "react": "19.0.0"
  }
}
`,
    'apps/extension/lib/changelog.ts': `export function getChangelog() {
  return [
    {
      version: '2.3.1',
      isoDate: '2026-11-03',
      items: [{ textKey: 'changelog_2_3_1_1' }],
    },
  ]
}
`,
    'apps/extension/locales/en.json': FIXTURE_LOCALE,
    'apps/extension/locales/es.json': FIXTURE_LOCALE.replace(
      'Clearer messages.',
      'Mensajes más claros.',
    ),
    'apps/extension/locales/notes.txt': 'not a locale\n',
    'CHANGELOG.md': `# Changelog

## [Unreleased]
${unreleased}
## [2.3.1] - 2026-11-03

- Clearer messages.

[Unreleased]: ${REPOSITORY}/compare/v2.3.1...HEAD
[2.3.1]: ${REPOSITORY}/releases/tag/v2.3.1
`,
  }
}

function readTree(directory: string): Record<string, string> {
  const entries = readdirSync(directory, {
    recursive: true,
    withFileTypes: true,
  })
  return Object.fromEntries(
    entries
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const absolutePath = path.join(entry.parentPath, entry.name)
        return [
          path.relative(directory, absolutePath).split(path.sep).join('/'),
          readFileSync(absolutePath, 'utf8'),
        ]
      }),
  )
}

function sorted(values: readonly string[]): string[] {
  return values.toSorted((first, second) => first.localeCompare(second))
}

function changedPaths(
  before: Record<string, string>,
  after: Record<string, string>,
): string[] {
  return sorted(
    [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
      (filePath) => before[filePath] !== after[filePath],
    ),
  )
}

function messageOf(localeText: string, key: string): unknown {
  const locale = JSON.parse(localeText) as Record<
    string,
    { message?: unknown } | undefined
  >
  return locale[key]?.message
}

const workspace = { root: '' }

function writeFixture(unreleased: string = UNRELEASED): Record<string, string> {
  const files = Object.entries(fixtureFiles(unreleased))
  for (const [filePath, content] of files) {
    const absolutePath = path.join(workspace.root, filePath)
    mkdirSync(path.dirname(absolutePath), { recursive: true })
    writeFileSync(absolutePath, content)
  }
  return readTree(workspace.root)
}

beforeEach(() => {
  workspace.root = mkdtempSync(path.join(tmpdir(), 'snug-release-'))
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 11, 12))
})

afterEach(() => {
  vi.useRealTimers()
  rmSync(workspace.root, { recursive: true, force: true })
})

describe('bumpVersion on a fixture copy', () => {
  it('writes 2.4.0 into every version field and the CHANGELOG', () => {
    writeFixture()

    bumpVersion(workspace.root, '2.4.0')
    const after = readTree(workspace.root)

    expect(
      JSON.parse(after['apps/extension/package.json'] ?? '') as unknown,
    ).toMatchObject({ version: '2.4.0', dependencies: { react: '19.0.0' } })
    expect(after['apps/extension/lib/changelog.ts']).toBe(
      `export function getChangelog() {
  return [
    {
      version: '2.4.0',
      isoDate: '2026-11-11',
      items: [
        { textKey: 'changelog_2_4_0_1' },
        { textKey: 'changelog_2_4_0_2' },
      ],
    },
    {
      version: '2.3.1',
      isoDate: '2026-11-03',
      items: [{ textKey: 'changelog_2_3_1_1' }],
    },
  ]
}
`,
    )
    expect(after['CHANGELOG.md']).toBe(`# Changelog

## [Unreleased]

## [2.4.0] - 2026-11-11

### Added

- A new thing that wraps
  over two lines.

### Fixed

- A fix worth $5.

## [2.3.1] - 2026-11-03

- Clearer messages.

[Unreleased]: ${REPOSITORY}/compare/v2.4.0...HEAD
[2.4.0]: ${REPOSITORY}/compare/v2.3.1...v2.4.0
[2.3.1]: ${REPOSITORY}/releases/tag/v2.3.1
`)
  })

  it('adds the changelog strings to every locale', () => {
    writeFixture()

    bumpVersion(workspace.root, '2.4.0')
    const after = readTree(workspace.root)

    expect(after['apps/extension/locales/en.json']).toBe(`{
  "extName": {
    "message": "Snug",
    "description": "Extension name"
  },
  "changelog_2_3_1_1": {
    "message": "Clearer messages."
  },
  "changelog_2_4_0_1": {
    "message": "A new thing that wraps over two lines."
  },
  "changelog_2_4_0_2": {
    "message": "A fix worth $$5."
  }
}
`)
    const spanish = after['apps/extension/locales/es.json'] ?? ''
    expect(messageOf(spanish, 'changelog_2_3_1_1')).toBe('Mensajes más claros.')
    expect(messageOf(spanish, 'changelog_2_4_0_1')).toBe(
      'A new thing that wraps over two lines.',
    )
    expect(messageOf(spanish, 'changelog_2_4_0_2')).toBe('A fix worth $$5.')
  })

  it('changes no other file and reports exactly the files it wrote', () => {
    const before = writeFixture()

    const changed = bumpVersion(workspace.root, '2.4.0')
    const after = readTree(workspace.root)

    expect(changedPaths(before, after)).toEqual([
      'apps/extension/lib/changelog.ts',
      'apps/extension/locales/en.json',
      'apps/extension/locales/es.json',
      'apps/extension/package.json',
      'CHANGELOG.md',
    ])
    expect(sorted(changed.map((file) => file.path))).toEqual(
      changedPaths(before, after),
    )
    expect(changed.every((file) => file.summary.length > 0)).toBe(true)
  })

  it('keeps a single entry on one line in the in-app changelog', () => {
    writeFixture('\n- Only one.\n')

    bumpVersion(workspace.root, '2.4.0')

    expect(
      readTree(workspace.root)['apps/extension/lib/changelog.ts'],
    ).toContain(
      `      version: '2.4.0',
      isoDate: '2026-11-11',
      items: [{ textKey: 'changelog_2_4_0_1' }],
`,
    )
  })

  it('follows the quote style of the in-app changelog', () => {
    writeFixture()
    const dataPath = path.join(
      workspace.root,
      'apps/extension/lib/changelog.ts',
    )
    writeFileSync(dataPath, readFileSync(dataPath, 'utf8').replaceAll("'", '"'))

    bumpVersion(workspace.root, '2.4.0')

    const source = readFileSync(dataPath, 'utf8')
    expect(source).toContain('version: "2.4.0",')
    expect(source).toContain('{ textKey: "changelog_2_4_0_1" },')
    expect(source).not.toContain("'")
  })

  it('handles a prerelease suffix', () => {
    writeFixture()

    bumpVersion(workspace.root, '2.4.0-beta.1')
    const after = readTree(workspace.root)

    expect(after['apps/extension/package.json']).toContain(
      '"version": "2.4.0-beta.1"',
    )
    expect(after['apps/extension/lib/changelog.ts']).toContain(
      "version: '2.4.0-beta.1',",
    )
    expect(after['apps/extension/lib/changelog.ts']).toContain(
      "{ textKey: 'changelog_2_4_0_beta_1_1' },",
    )
    expect(
      messageOf(
        after['apps/extension/locales/en.json'] ?? '',
        'changelog_2_4_0_beta_1_2',
      ),
    ).toBe('A fix worth $$5.')
    expect(after['CHANGELOG.md']).toContain('## [2.4.0-beta.1] - 2026-11-11')
    expect(after['CHANGELOG.md']).toContain(
      `[2.4.0-beta.1]: ${REPOSITORY}/compare/v2.3.1...v2.4.0-beta.1`,
    )
  })

  it('releases the final version after its prerelease', () => {
    writeFixture()
    bumpVersion(workspace.root, '2.4.0-beta.1')
    const changelogPath = path.join(workspace.root, 'CHANGELOG.md')
    writeFileSync(
      changelogPath,
      readFileSync(changelogPath, 'utf8').replace(
        '## [Unreleased]\n',
        '## [Unreleased]\n\n- Stabilized.\n',
      ),
    )

    bumpVersion(workspace.root, '2.4.0')

    expect(readFileSync(changelogPath, 'utf8')).toContain(
      `[2.4.0]: ${REPOSITORY}/compare/v2.4.0-beta.1...v2.4.0`,
    )
  })

  it.each([
    ['an invalid version', 'banana', /not a valid version/],
    ['a leading v', 'v2.4.0', /not a valid version/],
    ['a partial version', '2.4', /not a valid version/],
    ['the current version', '2.3.1', /not higher than the current version/],
    ['a lower version', '2.3.0', /not higher than the current version/],
    [
      'a prerelease of the current version',
      '2.3.1-beta.1',
      /not higher than the current version 2\.3\.1/,
    ],
  ])('rejects %s and writes nothing', (_label, version, message) => {
    const before = writeFixture()

    expect(() => bumpVersion(workspace.root, version)).toThrow(message)
    expect(readTree(workspace.root)).toEqual(before)
  })

  it.each([
    ['empty', '\n'],
    ['holding only empty subsections', '\n### Added\n\n### Fixed\n\n'],
  ])('rejects an Unreleased section %s and writes nothing', (_label, text) => {
    const before = writeFixture(text)

    expect(() => bumpVersion(workspace.root, '2.4.0')).toThrow(
      /no entries to release/,
    )
    expect(readTree(workspace.root)).toEqual(before)
  })

  it('writes nothing when a locale already carries a new key', () => {
    writeFixture()
    const localePath = path.join(
      workspace.root,
      'apps/extension/locales/es.json',
    )
    writeFileSync(
      localePath,
      readFileSync(localePath, 'utf8').replace(
        'changelog_2_3_1_1',
        'changelog_2_4_0_1',
      ),
    )
    const before = readTree(workspace.root)

    expect(() => bumpVersion(workspace.root, '2.4.0')).toThrow(
      'apps/extension/locales/es.json already has the key "changelog_2_4_0_1"',
    )
    expect(readTree(workspace.root)).toEqual(before)
  })
})

describe('bumpVersion on a copy of this repository', () => {
  it('fits the real package, in-app changelog, locales and CHANGELOG', () => {
    for (const filePath of [
      'apps/extension/package.json',
      'apps/extension/lib/changelog.ts',
      'apps/extension/locales',
      'CHANGELOG.md',
    ]) {
      cpSync(
        path.join(REPOSITORY_ROOT, filePath),
        path.join(workspace.root, filePath),
        {
          recursive: true,
        },
      )
    }
    const changelogPath = path.join(workspace.root, 'CHANGELOG.md')
    writeFileSync(
      changelogPath,
      readFileSync(changelogPath, 'utf8').replace(
        /^## \[Unreleased\]\n/m,
        '## [Unreleased]\n\n- A release script fixture entry.\n',
      ),
    )
    const before = readTree(workspace.root)
    const localePaths = Object.keys(before).filter((filePath) =>
      filePath.startsWith('apps/extension/locales/'),
    )

    bumpVersion(workspace.root, '999.0.0')
    const after = readTree(workspace.root)

    expect(localePaths.length).toBeGreaterThanOrEqual(10)
    expect(changedPaths(before, after)).toEqual(sorted(Object.keys(before)))
    expect(after['apps/extension/package.json']).toContain(
      '"version": "999.0.0"',
    )
    expect(after['apps/extension/lib/changelog.ts']).toMatch(
      /return \[\n\s+\{\n\s+version: (['"])999\.0\.0\1,\n\s+isoDate: \1\d{4}-\d{2}-\d{2}\1,\n\s+items: \[\{ textKey: \1changelog_999_0_0_1\1 \}\],\n\s+\},\n\s+\{\n\s+version: /,
    )
    for (const localePath of localePaths) {
      expect(messageOf(after[localePath] ?? '', 'changelog_999_0_0_1')).toBe(
        'A release script fixture entry.',
      )
    }
    expect(after['CHANGELOG.md']).toMatch(
      /## \[Unreleased\]\n\n## \[999\.0\.0\] - \d{4}-\d{2}-\d{2}\n\n- A release script fixture entry\.\n\n## \[/,
    )
    expect(after['CHANGELOG.md']).toMatch(
      /\n\[Unreleased\]: (\S+)\/compare\/v999\.0\.0\.\.\.HEAD\n\[999\.0\.0\]: \1\/compare\/v\d\S*\.\.\.v999\.0\.0\n/,
    )
  })
})

describe('runRelease', () => {
  it('prepares the release, lists the changed files and exits 0', () => {
    writeFixture()
    const lines: string[] = []

    const exitCode = runRelease(['2.4.0'], workspace.root, (line) => {
      lines.push(line)
    })

    expect(exitCode).toBe(0)
    expect(lines.join('\n')).toContain(
      'apps/extension/package.json: version 2.3.1 -> 2.4.0',
    )
    expect(lines.join('\n')).toContain('chore: 🔖 release v2.4.0')
    expect(lines.join('\n')).toContain(
      'Nothing was committed, tagged or pushed',
    )
  })

  it('exits 1 with the reason when the release is rejected', () => {
    const before = writeFixture()
    const lines: string[] = []

    const exitCode = runRelease(['2.3.1'], workspace.root, (line) => {
      lines.push(line)
    })

    expect(exitCode).toBe(1)
    expect(lines).toEqual([
      'release: 2.3.1 is not higher than the current version 2.3.1',
    ])
    expect(readTree(workspace.root)).toEqual(before)
  })

  it.each([[[]], [['2.4.0', '2.5.0']]])(
    'exits 1 with usage for arguments %j',
    (commandArguments) => {
      const before = writeFixture()
      const lines: string[] = []

      const exitCode = runRelease(commandArguments, workspace.root, (line) => {
        lines.push(line)
      })

      expect(exitCode).toBe(1)
      expect(lines[0]).toContain('Usage: bun run release <version>')
      expect(readTree(workspace.root)).toEqual(before)
    },
  )
})
