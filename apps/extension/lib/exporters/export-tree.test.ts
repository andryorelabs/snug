import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ExportCanceledError } from '@/lib/export-control'
import {
  resetFakeBookmarks,
  seedFakeBookmarksTree,
} from '@/lib/testing/fake-bookmarks'
import type { ExtendedBookmarkTreeNode } from '@/lib/types'

import { buildExportTree, escapeXml } from './export-tree'
import type { TreeExportOptions } from './export-tree'

const options: TreeExportOptions = {
  selectedBookmarks: null,
  includeDateAdded: false,
  includeDateLastUsed: false,
  includeDateGroupModified: false,
  hideOtherBookmarks: false,
  hideParentFolder: false,
}

const bookmark = (
  id: string,
  parentId: string,
  extra: Partial<ExtendedBookmarkTreeNode> = {},
): ExtendedBookmarkTreeNode => ({
  id,
  parentId,
  title: `Title ${id}`,
  url: `https://example.com/${id}`,
  syncing: false,
  ...extra,
})

beforeEach(() => {
  resetFakeBookmarks()
})

describe('buildExportTree', () => {
  it('builds folders and bookmarks in tree order from the live tree', async () => {
    seedFakeBookmarksTree(
      [
        {
          id: '10',
          parentId: '1',
          title: 'Dev',
          syncing: false,
          children: [bookmark('11', '10')],
        },
      ],
      [bookmark('20', '2')],
    )

    const tree = await buildExportTree(options)

    expect(tree).toEqual([
      {
        kind: 'folder',
        title: 'Bookmarks bar',
        children: [
          {
            kind: 'folder',
            title: 'Dev',
            children: [
              {
                kind: 'bookmark',
                title: 'Title 11',
                url: 'https://example.com/11',
              },
            ],
          },
        ],
      },
      {
        kind: 'folder',
        title: 'Other bookmarks',
        children: [
          {
            kind: 'bookmark',
            title: 'Title 20',
            url: 'https://example.com/20',
          },
        ],
      },
    ])
  })

  it('includes dates only for the enabled options', async () => {
    seedFakeBookmarksTree([
      {
        id: '10',
        parentId: '1',
        title: 'Dev',
        syncing: false,
        dateAdded: 100,
        dateGroupModified: 300,
        children: [bookmark('11', '10', { dateAdded: 200, dateLastUsed: 250 })],
      },
    ])

    const [bar] = await buildExportTree({
      ...options,
      includeDateAdded: true,
      includeDateLastUsed: true,
      includeDateGroupModified: true,
    })
    const [folder] = bar?.kind === 'folder' ? bar.children : []

    expect(folder).toMatchObject({
      kind: 'folder',
      dateAdded: 100,
      dateGroupModified: 300,
    })
    const [firstChild] = folder?.kind === 'folder' ? folder.children : []
    expect(firstChild).toMatchObject({
      dateAdded: 200,
      dateLastUsed: 250,
    })

    const [plainBar] = await buildExportTree(options)
    const [plainFolder] = plainBar?.kind === 'folder' ? plainBar.children : []
    expect(plainFolder).not.toHaveProperty('dateAdded')
    expect(plainFolder).not.toHaveProperty('dateGroupModified')
  })

  it('lifts the contents of hidden folders into their parent', async () => {
    seedFakeBookmarksTree(
      [
        {
          id: '10',
          parentId: '1',
          title: 'Dev',
          syncing: false,
          children: [bookmark('11', '10')],
        },
      ],
      [bookmark('20', '2')],
    )

    const tree = await buildExportTree({
      ...options,
      hideParentFolder: true,
      hideOtherBookmarks: true,
    })

    expect(tree.map((node) => node.title)).toEqual([
      'Bookmarks bar',
      'Title 20',
    ])
    const [bar] = tree
    expect(
      bar?.kind === 'folder' ? bar.children.map((node) => node.title) : [],
    ).toEqual(['Title 11'])
  })

  it('exports only the selected bookmarks when given', async () => {
    const tree = await buildExportTree({
      ...options,
      selectedBookmarks: [bookmark('30', '1')],
    })

    expect(tree).toEqual([
      { kind: 'bookmark', title: 'Title 30', url: 'https://example.com/30' },
    ])
  })

  it('reports progress and honors cancellation', async () => {
    seedFakeBookmarksTree([bookmark('11', '1')])
    const onProgress = vi.fn()
    await buildExportTree({ ...options, onProgress })
    expect(onProgress).toHaveBeenLastCalledWith({ done: 1, total: 1 })

    const controller = new AbortController()
    controller.abort()
    await expect(
      buildExportTree({ ...options, signal: controller.signal }),
    ).rejects.toBeInstanceOf(ExportCanceledError)
  })
})

describe('escapeXml', () => {
  it('escapes the five XML special characters', () => {
    expect(escapeXml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; &apos;Jerry&apos;&lt;/a&gt;',
    )
  })

  it('drops control characters XML 1.0 cannot carry but keeps whitespace', () => {
    expect(escapeXml('a\u{0}b\u{8}c\td\ne\u{1F}f')).toBe('abc\td\nef')
  })
})
