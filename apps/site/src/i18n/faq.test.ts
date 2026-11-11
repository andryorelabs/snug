import { describe, expect, it } from 'vitest'

import { getContent } from './content'
import { getLandingFaqCopy } from './faq'
import { LANDING_FAQ_KEYS } from './faq-keys'
import { LOCALES } from './locales'

describe('getLandingFaqCopy', () => {
  it('returns the kept entries in display order with their copy', () => {
    const copy = getLandingFaqCopy('en')
    const { items } = getContent('en').faq

    expect(copy.entries.map((entry) => entry.id)).toEqual([...LANDING_FAQ_KEYS])
    expect(copy.entries[0]).toMatchObject({
      question: items.network.question,
      answer: items.network.answer,
    })
  })

  it('links to the locale Guide FAQ page', () => {
    expect(getLandingFaqCopy('en').moreHref).toBe('/guide/faq/')
    expect(getLandingFaqCopy('es').moreHref).toBe('/es/guide/faq/')
  })

  it.each(LOCALES)('has a heading and a more label for %s', (locale) => {
    const copy = getLandingFaqCopy(locale)

    expect(copy.heading.length).toBeGreaterThan(0)
    expect(copy.more.length).toBeGreaterThan(0)
  })
})
