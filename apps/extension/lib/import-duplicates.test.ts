import { beforeEach, describe, expect, it } from 'vitest'

import { summarizeImportDuplicates } from './import-duplicates'
import {
  resetFakeBookmarks,
  seedFakeBookmarksTree,
} from './testing/fake-bookmarks'

beforeEach(() => {
  resetFakeBookmarks()
})

describe('summarizeImportDuplicates', () => {
  it('counts bookmarks already in the browser as skipped', async () => {
    seedFakeBookmarksTree([
      {
        id: 'b1',
        title: 'Existing',
        url: 'https://a.example/',
        parentId: '1',
        syncing: false,
      },
    ])
    const file = JSON.stringify([
      { title: 'Existing', url: 'https://a.example/' },
      { title: 'New', url: 'https://b.example/' },
    ])

    const summary = await summarizeImportDuplicates(file, 'application/json')

    expect(summary).toEqual({ skippedDuplicates: 1, importableCount: 1 })
  })

  it('returns zeros for an unreadable file', async () => {
    await expect(
      summarizeImportDuplicates('{not json', 'application/json'),
    ).resolves.toEqual({ skippedDuplicates: 0, importableCount: 0 })
  })
})
