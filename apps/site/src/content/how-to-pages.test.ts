import { describe, expect, it } from 'vitest'

import { PUBLISHED_SOURCES } from '../docs/published'
import { BROWSER_FACTS } from './browser-facts'
import { HOW_TO_GROUPS, HOW_TO_PAGES } from './how-to-pages'

const slugs = Object.keys(HOW_TO_PAGES)

describe('HOW_TO_PAGES', () => {
  it('puts every page in a known group, and every group has a page', () => {
    for (const page of Object.values(HOW_TO_PAGES)) {
      expect(HOW_TO_GROUPS).toContain(page.group)
    }
    for (const group of HOW_TO_GROUPS) {
      expect(
        Object.values(HOW_TO_PAGES).some((page) => page.group === group),
      ).toBe(true)
    }
  })

  it('names browsers that have facts', () => {
    for (const page of Object.values(HOW_TO_PAGES)) {
      expect(BROWSER_FACTS).toHaveProperty(page.from)
      expect(BROWSER_FACTS).toHaveProperty(page.to)
    }
  })

  it('relates only to published Guide pages and to other How-to pages', () => {
    const guideIds = new Set(PUBLISHED_SOURCES.map((source) => source.id))
    for (const [slug, page] of Object.entries(HOW_TO_PAGES)) {
      for (const id of page.relatedGuide) expect(guideIds.has(id)).toBe(true)
      for (const related of page.relatedHowTo) {
        expect(slugs).toContain(related)
        expect(related).not.toBe(slug)
      }
    }
  })

  it('only the CSV and JSON format pages carry a real sample', () => {
    expect(
      Object.entries(HOW_TO_PAGES)
        .filter(([, page]) => page.sample !== undefined)
        .map(([slug, page]) => [slug, page.sample]),
    ).toEqual([
      ['export-chrome-bookmarks-to-csv', 'csv'],
      ['export-chrome-bookmarks-to-json', 'json'],
    ])
  })
})
