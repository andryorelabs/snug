// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import { resetFakeI18n } from '@/lib/testing/fake-i18n'

import { parseXBEL } from './import-xbel'

beforeEach(() => {
  resetFakeI18n()
})

const xbel = (body: string) =>
  `<?xml version="1.0"?><xbel version="1.0">${body}</xbel>`

describe('parseXBEL', () => {
  it('maps folders titled like the browser roots to those roots', () => {
    const { tree, hasLocationData } = parseXBEL(
      xbel(`
        <folder><title>Bookmarks bar</title>
          <bookmark href="https://a.example/"><title>A</title></bookmark>
        </folder>
        <folder><title>Other bookmarks</title>
          <bookmark href="https://b.example/"><title>B</title></bookmark>
        </folder>
        <folder><title>Mobile bookmarks</title>
          <bookmark href="https://c.example/"><title>C</title></bookmark>
        </folder>`),
    )

    expect(hasLocationData).toBe(true)
    expect(tree.map((node) => node.title)).toEqual([
      'Bookmarks bar',
      'Other bookmarks',
      'Mobile bookmarks',
    ])
    expect(tree[0]).toMatchObject({ isBookmarksBar: true })
    expect(tree[1]).toMatchObject({ isOtherBookmarks: true })
    expect(tree[2]).toMatchObject({ isMobileBookmarks: true })
    expect(tree[0]?.children?.[0]).toMatchObject({
      title: 'A',
      url: 'https://a.example/',
    })
  })

  it('puts a flat export in Other bookmarks without location data', () => {
    const { tree, hasLocationData } = parseXBEL(
      xbel(`
        <bookmark href="https://a.example/" added="2024-01-02T03:04:05Z"><title>A</title></bookmark>
        <folder><title>Reading</title>
          <bookmark href="https://b.example/"><title>B</title></bookmark>
        </folder>`),
    )

    expect(hasLocationData).toBe(false)
    expect(tree).toHaveLength(1)
    expect(tree[0]).toMatchObject({ isOtherBookmarks: true })
    const [first, folder] = tree[0]?.children ?? []
    expect(first).toMatchObject({
      title: 'A',
      dateAdded: Date.parse('2024-01-02T03:04:05Z'),
    })
    expect(folder?.title).toBe('Reading')
    expect(folder?.children?.[0]?.title).toBe('B')
  })

  it('keeps an empty Other root when a root folder is present', () => {
    const { tree } = parseXBEL(
      xbel(
        '<folder><title>Bookmarks bar</title><bookmark href="https://a.example/"><title>A</title></bookmark></folder>',
      ),
    )

    expect(tree.map((node) => node.title)).toEqual([
      'Bookmarks bar',
      'Other bookmarks',
    ])
    expect(tree[1]?.children).toEqual([])
  })

  it('recognizes the live browser root titles', () => {
    const { tree, hasLocationData } = parseXBEL(
      xbel(
        '<folder><title>Favoritos</title><bookmark href="https://a.example/"><title>A</title></bookmark></folder>',
      ),
      {
        bookmarksBarTitle: 'Favoritos',
        otherBookmarksTitle: 'Otros',
        mobileTitle: 'Movil',
      },
    )

    expect(hasLocationData).toBe(true)
    expect(tree[0]).toMatchObject({ isBookmarksBar: true })
  })

  it('leaves disallowed addresses without a url', () => {
    const { tree } = parseXBEL(
      xbel(
        '<bookmark href="javascript:alert(1)"><title>Bad</title></bookmark><bookmark><title>None</title></bookmark>',
      ),
    )

    expect(tree[0]?.children?.map((child) => child.url)).toEqual([
      undefined,
      undefined,
    ])
  })

  it.each([
    ['plain text', 'hello'],
    ['malformed xml', '<xbel><folder></xbel>'],
    ['a different root element', '<?xml version="1.0"?><opml></opml>'],
  ])('rejects %s', (_name, content) => {
    expect(() => parseXBEL(content)).toThrow('Invalid XBEL document')
  })
})
