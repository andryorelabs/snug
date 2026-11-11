import { describe, expect, it } from 'vitest'

import type { ParsedBookmark } from '@/lib/types'

import { shouldClearMobileRoot } from './mobile-root'

const mobileNode = (children?: ParsedBookmark[]): ParsedBookmark =>
  ({ title: 'Mobile', children }) as ParsedBookmark

describe('shouldClearMobileRoot', () => {
  it('is false for a Mobile node with no children', () => {
    expect(shouldClearMobileRoot(mobileNode([]))).toBe(false)
    expect(shouldClearMobileRoot(mobileNode())).toBe(false)
  })

  it('is true when the Mobile node has any child, folders included', () => {
    expect(
      shouldClearMobileRoot(
        mobileNode([{ title: 'Folder', dateAdded: 1, children: [] }]),
      ),
    ).toBe(true)
    expect(
      shouldClearMobileRoot(
        mobileNode([{ title: 'A', dateAdded: 1, url: 'https://a.example' }]),
      ),
    ).toBe(true)
  })
})
