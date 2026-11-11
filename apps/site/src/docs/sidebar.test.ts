import { describe, expect, it } from 'vitest'

import { LOCALES } from '../i18n/locales'
import { buildSidebar, readSidebarLabels } from './sidebar'

describe('readSidebarLabels', () => {
  it('reads a complete label set for every locale', () => {
    const labels = readSidebarLabels()

    expect(Object.keys(labels).toSorted((a, b) => a.localeCompare(b))).toEqual(
      [...LOCALES].toSorted((a, b) => a.localeCompare(b)),
    )
    for (const locale of LOCALES) {
      expect(labels[locale].guide.length).toBeGreaterThan(0)
      expect(labels[locale].whatsNew.length).toBeGreaterThan(0)
    }
  })
})

describe('buildSidebar', () => {
  const sidebar = buildSidebar()

  it('is a Guide group followed by What is new', () => {
    expect(sidebar).toHaveLength(2)
    expect(sidebar[0]).toHaveProperty('items')
    expect(sidebar[1]).toMatchObject({ slug: 'changelog' })
  })

  it('lists the seven Guide pages in order', () => {
    const [guide] = sidebar
    const slugs =
      guide && 'items' in guide
        ? guide.items.map((item) => ('slug' in item ? item.slug : undefined))
        : []

    expect(slugs).toEqual([
      'guide',
      'guide/exporting',
      'guide/importing',
      'guide/duplicates',
      'guide/settings',
      'guide/auto-export',
      'guide/faq',
    ])
  })

  it('uses English labels as defaults and translates the other locales', () => {
    const labels = readSidebarLabels()
    const [guide] = sidebar

    expect(guide?.label).toBe(labels.en.guide)
    expect(Object.keys(guide?.translations ?? {})).toHaveLength(
      LOCALES.length - 1,
    )
    expect(guide?.translations).not.toHaveProperty('en')
  })

  it('builds from the labels it is given', () => {
    const labels = readSidebarLabels()
    const custom = {
      ...labels,
      en: { ...labels.en, guide: 'Custom guide' },
    }

    expect(buildSidebar(custom)[0]?.label).toBe('Custom guide')
  })
})
