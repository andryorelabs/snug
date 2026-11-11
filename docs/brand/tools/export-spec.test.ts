import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  assertSpec,
  encodeIco,
  faviconPath,
  FAVICON_SIZES,
  rasterSpecs,
  readIcoSizes,
  readPngSize,
} from './export-spec'

const BRAND_ROOT = path.join(import.meta.dirname, '..')

function readBrand(relativePath: string): Uint8Array {
  return new Uint8Array(readFileSync(path.join(BRAND_ROOT, relativePath)))
}

function fakePng(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

describe('committed brand rasters', () => {
  it('covers 16 to 512 px marks and the three og images', () => {
    const paths = rasterSpecs.map((spec) => spec.path)
    expect(paths).toContain('logo/png/mark-16.png')
    expect(paths).toContain('logo/png/mark-512.png')
    expect(paths).toContain('og/cover.png')
    expect(paths).toContain('og/cover-light.png')
    expect(paths).toContain('og/social-preview.png')
  })

  for (const spec of rasterSpecs) {
    it(`${spec.path} meets its pixel size and byte budget`, () => {
      expect(() => assertSpec(spec, readBrand(spec.path))).not.toThrow()
    })
  }

  it('favicon.ico holds the favicon sizes', () => {
    expect(readIcoSizes(readBrand(faviconPath))).toEqual([...FAVICON_SIZES])
  })
})

describe('assertSpec', () => {
  const spec = { path: 'x.png', width: 16, height: 16, maxBytes: 100 }

  it('accepts a matching PNG', () => {
    expect(() => assertSpec(spec, fakePng(16, 16))).not.toThrow()
  })

  it('rejects wrong dimensions', () => {
    expect(() => assertSpec(spec, fakePng(32, 16))).toThrow('32x16')
  })

  it('rejects an oversized file', () => {
    expect(() =>
      assertSpec({ ...spec, maxBytes: 10 }, fakePng(16, 16)),
    ).toThrow('over 10')
  })

  it('rejects bytes that are not a PNG', () => {
    expect(() => readPngSize(new Uint8Array(33))).toThrow('Not a PNG')
  })
})

describe('encodeIco', () => {
  it('round-trips the entry sizes', () => {
    const ico = encodeIco([fakePng(16, 16), fakePng(256, 256)])
    expect(readIcoSizes(ico)).toEqual([16, 256])
  })

  it('rejects bytes that are not an ICO', () => {
    expect(() => readIcoSizes(new Uint8Array(6))).toThrow('Not an ICO')
  })
})
