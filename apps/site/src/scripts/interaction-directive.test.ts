import { describe, expect, it, vi } from 'vitest'

import interactionDirective from './interaction-directive'

const hydrateOnInteraction = vi.hoisted(() => vi.fn())

vi.mock('./hydrate-on-interaction', () => ({ hydrateOnInteraction }))

describe('interaction client directive', () => {
  it('hands the island element and its loader to the interaction hydrator', () => {
    const element = new EventTarget() as HTMLElement
    const load = vi.fn()

    interactionDirective(load, { name: 'interaction', value: '' }, element)

    expect(hydrateOnInteraction).toHaveBeenCalledExactlyOnceWith(element, load)
    expect(load).not.toHaveBeenCalled()
  })
})
