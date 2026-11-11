import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = path.resolve(import.meta.dirname, '..')
const STALE_NAME_PATTERN = /(?<![\w-])(?:forge|andryore-starter)(?![\w])/i
const TEXT_EXTENSIONS = new Set([
  '.md',
  '.mdx',
  '.ts',
  '.tsx',
  '.mjs',
  '.js',
  '.json',
  '.jsonc',
  '.json5',
  '.yml',
  '.yaml',
  '.astro',
  '.css',
  '.txt',
  '.sh',
  '.csv',
])

/**
 * Paths where the old names are allowed. ADRs and the changelog record the
 * past, this file names them on purpose, and `.claude/skills/` is vendored
 * third-party text.
 */
const ALLOWED_PATHS: ReadonlySet<string> = new Set([
  'CHANGELOG.md',
  'scripts/stale-names.test.ts',
])
const ALLOWED_PREFIXES: readonly string[] = ['docs/adr/', '.claude/skills/']

/**
 * Returns the lines of a file's text that mention a stale name as a whole
 * word, so words such as "forget" or "forged" never match.
 * @param text - The file contents.
 * @returns The 1-based line numbers that mention a stale name.
 */
const findStaleNameLines = (text: string): number[] =>
  text
    .split('\n')
    .flatMap((line, index) => (STALE_NAME_PATTERN.test(line) ? index + 1 : []))

const isAllowed = (file: string): boolean =>
  ALLOWED_PATHS.has(file) ||
  ALLOWED_PREFIXES.some((prefix) => file.startsWith(prefix))

const listTrackedTextFiles = (): string[] =>
  execFileSync('git', ['ls-files', '-z'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\0')
    .filter(
      (file) =>
        file !== '' &&
        TEXT_EXTENSIONS.has(path.extname(file)) &&
        !file.endsWith('bun.lock'),
    )

describe('stale names', () => {
  it('keeps "forge" and "andryore-starter" out of every file outside ADRs and the changelog', () => {
    const offenders = listTrackedTextFiles()
      .filter((file) => !isAllowed(file))
      .flatMap((file) => {
        const lines = findStaleNameLines(
          readFileSync(path.join(REPO_ROOT, file), 'utf8'),
        )
        return lines.map((line) => `${file}:${line}`)
      })
    expect(offenders).toEqual([])
  })
})

describe('findStaleNameLines', () => {
  it('flags the whole words and the slash command', () => {
    expect(findStaleNameLines('a\nrun /forge now\nthe Forge docs')).toEqual([
      2, 3,
    ])
  })

  it('flags andryore-starter', () => {
    expect(findStaleNameLines('from andryore-starter')).toEqual([1])
  })

  it('ignores unrelated words', () => {
    expect(findStaleNameLines('forget forged forgery reforge')).toEqual([])
  })
})
