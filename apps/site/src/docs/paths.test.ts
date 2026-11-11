import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  githubEditUrl,
  githubViewUrl,
  REPOSITORY_ROOT,
  TRANSLATIONS_DIRECTORY,
  TRANSLATIONS_REPOSITORY_PATH,
} from './paths'

describe('repository paths', () => {
  it('resolves the repository root two levels above apps/site', () => {
    expect(REPOSITORY_ROOT).toBe(path.resolve(process.cwd(), '../..'))
  })

  it('places the translations folder under the repository root', () => {
    expect(TRANSLATIONS_DIRECTORY).toBe(
      path.join(REPOSITORY_ROOT, TRANSLATIONS_REPOSITORY_PATH),
    )
  })
})

describe('githubViewUrl', () => {
  it('links a file with blob on the main branch', () => {
    expect(githubViewUrl('docs/usage.md')).toBe(
      'https://github.com/andryorelabs/snug/blob/main/docs/usage.md',
    )
  })

  it('links a folder with tree', () => {
    expect(githubViewUrl('docs/guide', true)).toBe(
      'https://github.com/andryorelabs/snug/tree/main/docs/guide',
    )
  })
})

describe('githubEditUrl', () => {
  it('opens the file in the web editor on the main branch', () => {
    expect(githubEditUrl('CHANGELOG.md')).toBe(
      'https://github.com/andryorelabs/snug/edit/main/CHANGELOG.md',
    )
  })
})
