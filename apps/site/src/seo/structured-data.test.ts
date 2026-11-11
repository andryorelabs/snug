import { describe, expect, it } from 'vitest'

import { SITE_ORIGIN } from '../i18n/locales'
import { STORE_FACTS } from './store-facts'
import {
  buildComparisonStructuredData,
  buildHowToIndexStructuredData,
  buildHowToStructuredData,
  buildStructuredData,
} from './structured-data'

interface GraphNode {
  '@type': string
  [key: string]: unknown
}

const nodesOf = (jsonLd: { '@graph': GraphNode[] }) =>
  Object.fromEntries(jsonLd['@graph'].map((node) => [node['@type'], node]))

const breadcrumbs = [
  { name: 'Home', path: '/' },
  { name: 'Page', path: '/page/' },
]

describe('buildStructuredData', () => {
  const jsonLd = buildStructuredData('es', 'Descripcion', ['One', 'Two'], {
    title: 'Titulo',
    videoId: 'abc123',
    videoDescription: 'Video',
  })
  const nodes = nodesOf(jsonLd)

  it('is one schema.org graph with the shared nodes', () => {
    expect(jsonLd['@context']).toBe('https://schema.org')
    expect(Object.keys(nodes).toSorted((a, b) => a.localeCompare(b))).toEqual([
      'Person',
      'SoftwareApplication',
      'VideoObject',
      'WebPage',
      'WebSite',
    ])
  })

  it('expresses the locale on the page and video nodes', () => {
    expect(nodes['WebPage']).toMatchObject({
      url: `${SITE_ORIGIN}/es/`,
      name: 'Titulo',
      inLanguage: 'es',
    })
    expect(nodes['VideoObject']).toMatchObject({
      embedUrl: 'https://www.youtube-nocookie.com/embed/abc123',
      thumbnailUrl: 'https://i.ytimg.com/vi/abc123/maxresdefault.jpg',
    })
  })

  it('links installs to the counted redirect and carries no ratings or reviews', () => {
    expect(nodes['SoftwareApplication']).toMatchObject({
      installUrl: `${SITE_ORIGIN}/install`,
      featureList: ['One', 'Two'],
      name: STORE_FACTS.name,
    })
    expect(JSON.stringify(jsonLd)).not.toMatch(
      /aggregateRating|"review"|FAQPage/,
    )
  })
})

describe('buildComparisonStructuredData', () => {
  const page = {
    title: 'Versus',
    description: 'Compare',
    path: '/alternatives/x/',
    breadcrumbs,
  }

  it('describes a web page about the software with a numbered breadcrumb', () => {
    const nodes = nodesOf(buildComparisonStructuredData('en', page))

    expect(nodes['WebPage']).toMatchObject({
      url: `${SITE_ORIGIN}/alternatives/x/`,
      about: { '@id': `${SITE_ORIGIN}/#software` },
    })
    expect(nodes['BreadcrumbList']?.['itemListElement']).toEqual([
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: `${SITE_ORIGIN}/`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Page',
        item: `${SITE_ORIGIN}/page/`,
      },
    ])
  })

  it('drops about when asked and adds dateModified only when known', () => {
    const plain = nodesOf(
      buildComparisonStructuredData('en', { ...page, omitAbout: true }),
    )['WebPage']
    const dated = nodesOf(
      buildComparisonStructuredData('en', {
        ...page,
        dateModified: '2026-02-03',
      }),
    )['WebPage']

    expect(plain).not.toHaveProperty('about')
    expect(plain).not.toHaveProperty('dateModified')
    expect(dated).toHaveProperty('dateModified', '2026-02-03')
  })
})

describe('buildHowToIndexStructuredData', () => {
  it('lists every page in an ItemList on a CollectionPage', () => {
    const nodes = nodesOf(
      buildHowToIndexStructuredData('en', {
        title: 'How-to',
        description: 'Guides',
        path: '/how-to/',
        breadcrumbs,
        items: [
          { name: 'One', path: '/how-to/one/' },
          { name: 'Two', path: '/how-to/two/' },
        ],
      }),
    )

    expect(nodes['CollectionPage']).toMatchObject({
      mainEntity: { '@id': `${SITE_ORIGIN}/how-to/#list` },
    })
    expect(nodes['ItemList']).toMatchObject({ numberOfItems: 2 })
    expect(nodes['ItemList']?.['itemListElement']).toEqual([
      {
        '@type': 'ListItem',
        position: 1,
        name: 'One',
        url: `${SITE_ORIGIN}/how-to/one/`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Two',
        url: `${SITE_ORIGIN}/how-to/two/`,
      },
    ])
  })
})

describe('buildHowToStructuredData', () => {
  const page = {
    title: 'Move',
    description: 'Steps',
    path: '/how-to/move/',
    breadcrumbs,
  }

  it('is about the software only when the page has a Snug section', () => {
    const withSnug = nodesOf(
      buildHowToStructuredData('en', { ...page, hasSnugSection: true }),
    )['WebPage']
    const without = nodesOf(
      buildHowToStructuredData('en', { ...page, hasSnugSection: false }),
    )['WebPage']

    expect(withSnug).toHaveProperty('about')
    expect(without).not.toHaveProperty('about')
  })
})
