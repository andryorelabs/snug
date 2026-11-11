import { describe, expect, it } from 'vitest'

import {
  isBookmarksBar,
  isOtherBookmarks,
  ROOT_FOLDER_IDS,
} from './root-folders'

describe('isBookmarksBar', () => {
  it('matches the folderType marker on any id', () => {
    expect(isBookmarksBar({ id: '42', folderType: 'bookmarks-bar' })).toBe(true)
  })

  it('matches the legacy fixed id', () => {
    expect(isBookmarksBar({ id: ROOT_FOLDER_IDS.bookmarksBar })).toBe(true)
  })

  it('rejects other nodes', () => {
    expect(isBookmarksBar({ id: '2', folderType: 'other' })).toBe(false)
    expect(isBookmarksBar({ id: '99' })).toBe(false)
  })
})

describe('isOtherBookmarks', () => {
  it('matches the folderType marker on any id', () => {
    expect(isOtherBookmarks({ id: '77', folderType: 'other' })).toBe(true)
  })

  it('matches the legacy fixed id', () => {
    expect(isOtherBookmarks({ id: ROOT_FOLDER_IDS.otherBookmarks })).toBe(true)
  })

  it('rejects other nodes', () => {
    expect(isOtherBookmarks({ id: '1', folderType: 'bookmarks-bar' })).toBe(
      false,
    )
    expect(isOtherBookmarks({ id: '99' })).toBe(false)
  })
})
