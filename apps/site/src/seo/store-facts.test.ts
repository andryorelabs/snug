import { describe, expect, it } from 'vitest'

import { STORE_FACTS } from './store-facts'

describe('STORE_FACTS', () => {
  it('names the product, its author and public source', () => {
    expect(STORE_FACTS.name).toBe('Snug')
    expect(STORE_FACTS.author.url).toMatch(/^https:\/\//)
    expect(STORE_FACTS.sourceUrl).toBe('https://github.com/andryorelabs/snug')
  })

  it('keeps the numeric facts plausible', () => {
    expect(STORE_FACTS.ratingValue).toBeGreaterThan(0)
    expect(STORE_FACTS.ratingValue).toBeLessThanOrEqual(5)
    expect(STORE_FACTS.ratingCount).toBeGreaterThan(0)
    expect(STORE_FACTS.userCount).toBeGreaterThan(0)
  })

  it('stamps the promo video with an ISO date', () => {
    expect(STORE_FACTS.promoVideoUploadDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
