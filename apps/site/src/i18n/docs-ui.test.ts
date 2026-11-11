import { describe, expect, it } from 'vitest'

import { DOCS_PATHS, DOCS_UI } from './docs-ui'

describe('DOCS_UI', () => {
  it('carries non-empty English chrome copy', () => {
    for (const value of Object.values(DOCS_UI)) {
      expect(value.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('DOCS_PATHS', () => {
  it('points at the top-level Guide pages with surrounding slashes', () => {
    expect(DOCS_PATHS).toEqual({ guide: '/guide/', whatsNew: '/changelog/' })
  })
})
