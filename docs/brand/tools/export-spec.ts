import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

export type RasterSpec = {
  path: string
  width: number
  height: number
  maxBytes: number
}

export const MARK_PNG_SIZES = [16, 32, 48, 64, 128, 256, 512] as const
export const FAVICON_SIZES = [16, 32, 48] as const
const COVER_SIZE = { width: 1280, height: 640 } as const
const COVER_MAX_BYTES = 1_000_000
const MARK_MAX_BYTES = 64 * 1024
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const ICO_HEADER_BYTES = 6
const ICO_ENTRY_BYTES = 16

/**
 * Every raster the brand kit commits under `docs/brand`, with its exact pixel
 * size and byte budget. The export script writes them and the brand test
 * checks the committed files against this list.
 */
export const rasterSpecs: readonly RasterSpec[] = [
  ...MARK_PNG_SIZES.map((size) => ({
    path: `logo/png/mark-${size}.png`,
    width: size,
    height: size,
    maxBytes: MARK_MAX_BYTES,
  })),
  ...['cover', 'cover-light', 'social-preview'].map((name) => ({
    path: `og/${name}.png`,
    ...COVER_SIZE,
    maxBytes: COVER_MAX_BYTES,
  })),
]

export const faviconPath = 'logo/png/favicon.ico'

/**
 * Reads the pixel size from a PNG's IHDR chunk.
 * @param bytes - The PNG file contents.
 * @returns The width and height in pixels; throws when the bytes are not a PNG.
 */
export function readPngSize(bytes: Uint8Array): {
  width: number
  height: number
} {
  if (PNG_SIGNATURE.some((value, index) => bytes[index] !== value)) {
    throw new Error('Not a PNG file')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

/**
 * Throws when the PNG bytes miss the spec's pixel size or byte budget.
 * @param spec - The raster spec, with its path relative to `docs/brand`.
 * @param bytes - The PNG file contents.
 */
export function assertSpec(spec: RasterSpec, bytes: Uint8Array): void {
  const { width, height } = readPngSize(bytes)
  if (width !== spec.width || height !== spec.height) {
    throw new Error(
      `${spec.path} is ${width}x${height}, expected ${spec.width}x${spec.height}`,
    )
  }
  if (bytes.length > spec.maxBytes) {
    throw new Error(
      `${spec.path} is ${bytes.length} bytes, over ${spec.maxBytes}`,
    )
  }
}

/**
 * Checks one file on disk against its spec.
 * @param spec - The raster spec to check.
 * @param brandRoot - Absolute path of `docs/brand`.
 */
export async function assertSpecFile(
  spec: RasterSpec,
  brandRoot: string,
): Promise<void> {
  const filePath = path.join(brandRoot, spec.path)
  await stat(filePath)
  assertSpec(spec, new Uint8Array(await readFile(filePath)))
}

/**
 * Packs square PNGs (one per size, ascending) into an ICO container.
 * @param pngs - The PNG file contents, one per icon size.
 * @returns The ICO file contents.
 */
export function encodeIco(pngs: readonly Uint8Array[]): Uint8Array {
  const sizes = pngs.map((png) => readPngSize(png).width)
  const dataStart = ICO_HEADER_BYTES + ICO_ENTRY_BYTES * pngs.length
  let total = dataStart
  for (const png of pngs) {
    total += png.length
  }
  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)
  view.setUint16(2, 1, true)
  view.setUint16(4, pngs.length, true)
  let offset = dataStart
  for (const [index, png] of pngs.entries()) {
    const entry = ICO_HEADER_BYTES + ICO_ENTRY_BYTES * index
    const size = sizes[index] ?? 0
    view.setUint8(entry, size >= 256 ? 0 : size)
    view.setUint8(entry + 1, size >= 256 ? 0 : size)
    view.setUint16(entry + 4, 1, true)
    view.setUint16(entry + 6, 32, true)
    view.setUint32(entry + 8, png.length, true)
    view.setUint32(entry + 12, offset, true)
    out.set(png, offset)
    offset += png.length
  }
  return out
}

/**
 * Reads the pixel widths of every entry in an ICO container.
 * @param bytes - The ICO file contents.
 * @returns The width of each entry in pixels.
 */
export function readIcoSizes(bytes: Uint8Array): number[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint16(0, true) !== 0 || view.getUint16(2, true) !== 1) {
    throw new Error('Not an ICO file')
  }
  const count = view.getUint16(4, true)
  return Array.from({ length: count }, (_, index) => {
    const width = view.getUint8(ICO_HEADER_BYTES + ICO_ENTRY_BYTES * index)
    return width === 0 ? 256 : width
  })
}
