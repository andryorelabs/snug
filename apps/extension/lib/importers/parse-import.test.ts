// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import { resetFakeI18n } from '@/lib/testing/fake-i18n'

import { parseImportFile, parseLocationAwareImport } from './parse-import'

beforeEach(() => {
  resetFakeI18n()
})

const HTML_FILE = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
  <DT><H3 PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>
  <DL><p><DT><A HREF="https://a.example/">A</A></DL><p>
</DL><p>`

const XBEL_FILE =
  '<?xml version="1.0"?><xbel version="1.0"><bookmark href="https://x.example/"><title>X</title></bookmark></xbel>'

const CHROME_FILE = JSON.stringify({
  roots: { bookmark_bar: { name: 'Bookmarks bar', children: [] } },
})

describe('parseImportFile', () => {
  it('parses HTML with location data', () => {
    const parsed = parseImportFile(HTML_FILE, 'text/html')

    expect(parsed.format).toBe('html')
    expect(parsed.hasLocationData).toBe(true)
    expect(parsed.skippedInvalidUrl).toBe(0)
    expect(parsed.tree.some((node) => node.isBookmarksBar)).toBe(true)
  })

  it('parses CSV without location data and counts skipped rows', () => {
    const csv =
      'title,url,folder\nGood,https://a.example/,\nBad,javascript:x,\n'

    const parsed = parseImportFile(csv, 'text/csv')

    expect(parsed.format).toBe('csv')
    expect(parsed.hasLocationData).toBe(false)
    expect(parsed.skippedInvalidUrl).toBe(1)
  })

  it('parses a Chrome Bookmarks file', () => {
    const parsed = parseImportFile(CHROME_FILE, 'application/json')

    expect(parsed.format).toBe('chrome')
    expect(parsed.hasLocationData).toBe(true)
  })

  it('parses XBEL', () => {
    const parsed = parseImportFile(XBEL_FILE, 'application/xml')

    expect(parsed.format).toBe('xbel')
    expect(parsed.tree[0]?.children?.[0]?.title).toBe('X')
  })

  it('throws the localized message for an unsupported file', () => {
    expect(() => parseImportFile('???', 'application/octet-stream')).toThrow(
      'Unsupported file format',
    )
  })
})

describe('parseLocationAwareImport', () => {
  it('returns the cached tree for the same JSON text', () => {
    const json = JSON.stringify([{ title: 'A', url: 'https://a.example/' }])

    const first = parseLocationAwareImport(json, 'json')
    const second = parseLocationAwareImport(json, 'json')

    expect(first).toBeDefined()
    expect(second).toBe(first)
  })

  it('detects roots in a Chrome file', () => {
    expect(
      parseLocationAwareImport(CHROME_FILE, 'chrome')?.hasLocationData,
    ).toBe(true)
  })

  it('returns undefined for formats without location data', () => {
    expect(parseLocationAwareImport('a,b', 'csv')).toBeUndefined()
    expect(parseLocationAwareImport('x', 'unknown')).toBeUndefined()
  })
})
