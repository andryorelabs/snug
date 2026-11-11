type Rgb = [number, number, number]

const OKLCH_PATTERN =
  /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+)%)?\s*\)$/

/**
 * Reads the custom property declarations of a CSS block.
 * @param block - CSS text holding `--name: value;` declarations.
 * @returns The declarations as `name -> value`, without the leading dashes.
 */
export function readDeclarations(block: string): Record<string, string> {
  const declared: Record<string, string> = {}
  for (const match of block.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    const [, name, value] = match
    if (name !== undefined && value !== undefined) {
      declared[name] = value.trim()
    }
  }
  return declared
}

function oklchToLinearRgb(lightness: number, chroma: number, hue: number): Rgb {
  const radians = (hue * Math.PI) / 180
  const a = chroma * Math.cos(radians)
  const b = chroma * Math.sin(radians)
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

function toLinearRgb(value: string): Rgb {
  const oklch = OKLCH_PATTERN.exec(value)
  if (oklch) {
    const [, lightness, chroma, hue] = oklch
    return oklchToLinearRgb(Number(lightness), Number(chroma), Number(hue)).map(
      (channel) => Math.min(1, Math.max(0, channel)),
    ) as Rgb
  }
  const hex = /^#([\da-f]{6})$/i.exec(value)?.[1]
  if (hex === undefined) {
    throw new Error(`Unsupported color: ${value}`)
  }
  return [0, 2, 4].map((start) => {
    const srgb = Number.parseInt(hex.slice(start, start + 2), 16) / 255
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
  }) as Rgb
}

function luminance([red, green, blue]: Rgb): number {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

/**
 * WCAG contrast ratio between two opaque oklch or hex colors, as used to check
 * the text and background token pairs in `docs/brand/tokens.css`.
 * @param foreground - The text color, `oklch(...)` or `#rrggbb`.
 * @param background - The background color, `oklch(...)` or `#rrggbb`.
 * @returns The ratio, from 1 to 21.
 */
export function contrastRatio(foreground: string, background: string): number {
  const first = luminance(toLinearRgb(foreground))
  const second = luminance(toLinearRgb(background))
  const [lighter, darker] = first > second ? [first, second] : [second, first]
  return (lighter + 0.05) / (darker + 0.05)
}
