import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const REPO_ROOT = new URL('../', import.meta.url).pathname

const OWNER_SLUG_SURFACES = ['.']

const STALE_SLUG = /github\.com\/andryore\/snug/i

const WORKSPACE_PACKAGE_JSONS = [
  'apps/extension/package.json',
  'apps/site/package.json',
  'apps/video/package.json',
  'packages/ui/package.json',
]

function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z', '--', ...OWNER_SLUG_SURFACES], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
    .split('\0')
    .filter((file) => file.length > 0)
}

function isText(content: Buffer): boolean {
  return !content.subarray(0, 8000).includes(0)
}

describe('owner slug', () => {
  test('no tracked file links the old owner', () => {
    const offenders = trackedFiles().filter((file) => {
      const content = readFileSync(`${REPO_ROOT}${file}`)
      return isText(content) && STALE_SLUG.test(content.toString('utf8'))
    })
    expect(offenders).toEqual([])
  })

  test.each(WORKSPACE_PACKAGE_JSONS)(
    '%s carries full owner metadata',
    (path) => {
      const manifest = JSON.parse(
        readFileSync(`${REPO_ROOT}${path}`, 'utf8'),
      ) as {
        description?: string
        license?: string
        author?: string
        homepage?: string
        repository?: { url?: string }
        bugs?: { url?: string }
      }
      expect(manifest.description?.length).toBeGreaterThan(0)
      expect(manifest.license).toBe('MIT')
      expect(manifest.author).toBe('Andry Orellana <hello@andryore.dev>')
      expect(manifest.homepage).toBe('https://snug.andryore.dev/')
      expect(manifest.repository?.url).toBe(
        'git+https://github.com/andryorelabs/snug.git',
      )
      expect(manifest.bugs?.url).toBe(
        'https://github.com/andryorelabs/snug/issues',
      )
    },
  )
})
