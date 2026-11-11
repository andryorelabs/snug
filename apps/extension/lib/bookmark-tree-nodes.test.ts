import { describe, expect, it } from 'vitest'

import {
  collectBookmarkIds,
  collectFolderIds,
  collectSelectableIds,
  determineCheckedState,
  filterNodes,
  findAncestorsOfMatches,
} from './bookmark-tree-nodes'
import type { BookmarkNode } from './types'

const TREE: BookmarkNode[] = [
  {
    id: 'f1',
    title: 'Dev',
    children: [
      { id: 'b1', title: 'MDN', url: 'https://developer.mozilla.org/' },
      {
        id: 'b2',
        title: 'Skipped',
        url: 'https://skip.example/',
        isDisabled: true,
      },
      {
        id: 'f2',
        title: 'Rust',
        children: [
          { id: 'b3', title: 'Book', url: 'https://doc.rust-lang.org/' },
        ],
      },
    ],
  },
  { id: 'b4', title: 'News', url: 'https://news.example/' },
  { id: 'f3', title: 'Empty', children: [] },
  { id: 'x', title: 'Leaf without url or children' },
]

describe('collectBookmarkIds', () => {
  it('returns every bookmark id in document order, disabled ones included', () => {
    expect(collectBookmarkIds(TREE)).toEqual(['b1', 'b2', 'b3', 'b4'])
  })
})

describe('collectSelectableIds', () => {
  it('skips disabled bookmarks', () => {
    expect(collectSelectableIds(TREE)).toEqual(['b1', 'b3', 'b4'])
  })

  it('skips a whole disabled folder', () => {
    expect(
      collectSelectableIds([
        {
          id: 'f',
          title: 'F',
          isDisabled: true,
          children: [{ id: 'b', title: 'B', url: 'https://b.example/' }],
        },
      ]),
    ).toEqual([])
  })
})

describe('collectFolderIds', () => {
  it('returns every folder id, nested and empty ones included', () => {
    expect(collectFolderIds(TREE)).toEqual(['f1', 'f2', 'f3'])
  })
})

describe('determineCheckedState', () => {
  const children = TREE[0]?.children ?? []

  it('is false when nothing is checked', () => {
    expect(determineCheckedState(children, new Map())).toBe(false)
  })

  it('is indeterminate when some selectable bookmarks are checked', () => {
    expect(determineCheckedState(children, new Map([['b1', true]]))).toBe(
      'indeterminate',
    )
  })

  it('is true when every selectable bookmark is checked', () => {
    expect(
      determineCheckedState(
        children,
        new Map([
          ['b1', true],
          ['b3', true],
        ]),
      ),
    ).toBe(true)
  })

  it('is false for a folder with no selectable bookmarks', () => {
    expect(determineCheckedState([], new Map())).toBe(false)
  })
})

describe('filterNodes', () => {
  it('keeps bookmarks matching the title or url, case-insensitively', () => {
    expect(filterNodes(TREE, 'NEWS').map((node) => node.id)).toEqual(['b4'])
    expect(filterNodes(TREE, 'rust-lang').map((node) => node.id)).toEqual([
      'f1',
    ])
  })

  it('keeps only matching branches of a folder', () => {
    const [folder] = filterNodes(TREE, 'book')
    expect(folder?.id).toBe('f1')
    expect(folder?.children?.map((node) => node.id)).toEqual(['f2'])
    expect(folder?.children?.[0]?.children?.map((node) => node.id)).toEqual([
      'b3',
    ])
  })

  it('keeps a folder whole when its own title matches', () => {
    const [folder] = filterNodes(TREE, 'dev')
    expect(folder?.children).toHaveLength(3)
  })

  it('returns nothing when no node matches', () => {
    expect(filterNodes(TREE, 'zzz')).toEqual([])
  })
})

describe('findAncestorsOfMatches', () => {
  it('lists the folders that contain a match', () => {
    expect(
      findAncestorsOfMatches(TREE, 'book').toSorted((a, b) =>
        a.localeCompare(b),
      ),
    ).toEqual(['f1', 'f2'])
  })

  it('includes a folder whose own title matches', () => {
    expect(findAncestorsOfMatches(TREE, 'empty')).toEqual(['f3'])
  })

  it('is empty when nothing matches or only top-level bookmarks match', () => {
    expect(findAncestorsOfMatches(TREE, 'zzz')).toEqual([])
    expect(findAncestorsOfMatches(TREE, 'news')).toEqual([])
  })
})
