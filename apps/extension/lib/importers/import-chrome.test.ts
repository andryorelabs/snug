import { describe, expect, it } from 'vitest'

import { isChromeBookmarksFile, parseChromeBookmarks } from './import-chrome'

const WEBKIT_OFFSET_MS = 11_644_473_600_000
const toWebkitMicroseconds = (unixMilliseconds: number) =>
  String((unixMilliseconds + WEBKIT_OFFSET_MS) * 1000)

describe('isChromeBookmarksFile', () => {
  it('accepts a roots object with a bookmark bar or other folder', () => {
    expect(isChromeBookmarksFile({ roots: { bookmark_bar: {} } })).toBe(true)
    expect(isChromeBookmarksFile({ roots: { other: {} } })).toBe(true)
  })

  it.each([
    null,
    'text',
    [],
    {},
    { roots: null },
    { roots: { synced: {} } },
    { roots: { bookmark_bar: 'x', other: null } },
  ])('rejects %j', (value) => {
    expect(isChromeBookmarksFile(value)).toBe(false)
  })
})

describe('parseChromeBookmarks', () => {
  it('maps roots to bar, other and mobile in order and flags them', () => {
    const file = JSON.stringify({
      roots: {
        synced: { name: 'Mobile bookmarks', children: [] },
        other: { name: 'Other bookmarks', children: [] },
        bookmark_bar: { name: 'Bookmarks bar', children: [] },
      },
    })

    const tree = parseChromeBookmarks(file)

    expect(tree.map((node) => node.title)).toEqual([
      'Bookmarks bar',
      'Other bookmarks',
      'Mobile bookmarks',
    ])
    expect(tree[0]?.isBookmarksBar).toBe(true)
    expect(tree[1]?.isOtherBookmarks).toBe(true)
    expect(tree[2]?.isMobileBookmarks).toBe(true)
  })

  it('omits roots missing from the file', () => {
    const tree = parseChromeBookmarks(
      JSON.stringify({ roots: { other: { name: 'Other', children: [] } } }),
    )

    expect(tree).toHaveLength(1)
    expect(tree[0]?.isOtherBookmarks).toBe(true)
  })

  it('converts WebKit microsecond timestamps to Unix milliseconds', () => {
    const added = Date.UTC(2024, 0, 2, 3, 4, 5)
    const tree = parseChromeBookmarks(
      JSON.stringify({
        roots: {
          bookmark_bar: {
            name: 'Bar',
            date_added: toWebkitMicroseconds(added),
            date_modified: toWebkitMicroseconds(added + 1000),
            children: [
              {
                name: 'Site',
                type: 'url',
                url: 'https://a.example/',
                date_added: toWebkitMicroseconds(added),
              },
            ],
          },
        },
      }),
    )

    expect(tree[0]?.dateAdded).toBe(added)
    expect(tree[0]?.dateGroupModified).toBe(added + 1000)
    expect(tree[0]?.children?.[0]).toMatchObject({
      title: 'Site',
      url: 'https://a.example/',
      dateAdded: added,
    })
  })

  it('falls back to now for missing or invalid timestamps', () => {
    const before = Date.now()
    const tree = parseChromeBookmarks(
      JSON.stringify({
        roots: { bookmark_bar: { name: 'Bar', date_added: 'nope' } },
      }),
    )

    expect(tree[0]?.dateAdded).toBeGreaterThanOrEqual(before)
    expect(tree[0]?.children).toEqual([])
  })

  it('drops disallowed URLs and tolerates a missing name', () => {
    const tree = parseChromeBookmarks(
      JSON.stringify({
        roots: {
          bookmark_bar: {
            children: [{ type: 'url', url: 'javascript:alert(1)' }],
          },
        },
      }),
    )

    expect(tree[0]?.title).toBe('')
    expect(tree[0]?.children?.[0]?.url).toBeUndefined()
  })

  it('throws on input that is not JSON', () => {
    expect(() => parseChromeBookmarks('<html>')).toThrow(SyntaxError)
  })
})
