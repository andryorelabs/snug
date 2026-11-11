import { describe, expect, it } from 'vitest'

import { rewriteMarkdownLinks, splitLeadingHeading } from './markdown'

describe('splitLeadingHeading', () => {
  it('splits the H1 from the body and strips inline markup from the title', () => {
    expect(splitLeadingHeading('# The `Snug` *guide*\n\nBody text\n')).toEqual({
      title: 'The Snug guide',
      body: 'Body text\n',
    })
  })

  it('accepts closing hashes and leading blank lines', () => {
    expect(splitLeadingHeading('\n# Title ##\nBody')).toEqual({
      title: 'Title',
      body: 'Body',
    })
  })

  it('returns the whole document when there is no leading H1', () => {
    expect(splitLeadingHeading('Intro\n\n# Later\n')).toEqual({
      title: undefined,
      body: 'Intro\n\n# Later\n',
    })
    expect(splitLeadingHeading('## Section\n').title).toBeUndefined()
  })
})

describe('rewriteMarkdownLinks', () => {
  const context = { sourcePath: 'docs/usage.md' }

  it('turns links to a published source into site routes', () => {
    expect(
      rewriteMarkdownLinks('See [exporting](guide/exporting.md).', context),
    ).toBe('See [exporting](/guide/exporting/).')
  })

  it('keeps absolute URLs and same-page anchors as written', () => {
    const markdown = '[a](https://example.com/x) and [b](#section)'

    expect(rewriteMarkdownLinks(markdown, context)).toBe(markdown)
  })

  it('rewrites reference definitions', () => {
    expect(
      rewriteMarkdownLinks('[ref]: guide/exporting.md "Title"', context),
    ).toBe('[ref]: /guide/exporting/ "Title"')
  })

  it('leaves fenced code and inline code untouched', () => {
    const markdown = [
      '```md',
      '[x](guide/exporting.md)',
      '```',
      'Use `[y](guide/exporting.md)` or [z](guide/exporting.md).',
    ].join('\n')

    expect(rewriteMarkdownLinks(markdown, context).split('\n')).toEqual([
      '```md',
      '[x](guide/exporting.md)',
      '```',
      'Use `[y](guide/exporting.md)` or [z](/guide/exporting/).',
    ])
  })

  it('prefixes the locale on rewritten routes', () => {
    expect(
      rewriteMarkdownLinks('[e](guide/exporting.md)', {
        ...context,
        locale: 'es',
      }),
    ).toBe('[e](/es/guide/exporting/)')
  })
})
