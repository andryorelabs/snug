import { describe, expect, it } from 'vitest'

import { getContent } from './content'
import { LANDING_FAQ_KEYS } from './faq-keys'

describe('LANDING_FAQ_KEYS', () => {
  it('lists six unique keys', () => {
    expect(LANDING_FAQ_KEYS).toHaveLength(6)
    expect(new Set(LANDING_FAQ_KEYS).size).toBe(6)
  })

  it('names items that exist in the English FAQ', () => {
    const { items } = getContent('en').faq
    for (const key of LANDING_FAQ_KEYS) {
      expect(items[key].question.length).toBeGreaterThan(0)
    }
  })
})
