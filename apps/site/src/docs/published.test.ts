import { describe, expect, it } from 'vitest'

import {
  findPublishedSource,
  PUBLISHED_SOURCES,
  publishedRoute,
} from './published'

describe('PUBLISHED_SOURCES', () => {
  it('has unique ids and source paths', () => {
    expect(new Set(PUBLISHED_SOURCES.map((source) => source.id)).size).toBe(
      PUBLISHED_SOURCES.length,
    )
    expect(
      new Set(PUBLISHED_SOURCES.map((source) => source.sourcePath)).size,
    ).toBe(PUBLISHED_SOURCES.length)
  })

  it('keeps descriptions within 155 characters and titles within 53', () => {
    for (const source of PUBLISHED_SOURCES) {
      expect(source.description.length).toBeLessThanOrEqual(155)
      expect(source.seoTitle.length).toBeLessThanOrEqual(53)
    }
  })

  it('publishes only repository markdown, with the changelog as its own kind', () => {
    for (const source of PUBLISHED_SOURCES) {
      expect(source.sourcePath).toMatch(/\.md$/)
    }
    expect(
      PUBLISHED_SOURCES.filter((source) => source.kind === 'changelog').map(
        (source) => source.sourcePath,
      ),
    ).toEqual(['CHANGELOG.md'])
  })
})

describe('findPublishedSource', () => {
  it('finds a published file by its repository path', () => {
    expect(findPublishedSource('docs/guide/faq.md')?.id).toBe('guide/faq')
  })

  it('returns undefined for a file outside the allowlist', () => {
    expect(findPublishedSource('README.md')).toBeUndefined()
  })
})

describe('publishedRoute', () => {
  const faq = PUBLISHED_SOURCES.find((source) => source.id === 'guide/faq')

  it('routes English pages without a locale prefix', () => {
    expect(faq && publishedRoute(faq, 'en')).toBe('/guide/faq/')
  })

  it('prefixes other locales', () => {
    expect(faq && publishedRoute(faq, 'es')).toBe('/es/guide/faq/')
  })
})
