/**
 * Generate stage base tile atlas.
 *
 * Creates public/assets/sprites/base_tileset.png containing:
 * - row 0: red_dirt variants (6)
 * - row 1: grass variants (6)
 * - row 2: stone variants (6)
 */

import { writeFileSync } from 'fs'
import { join } from 'path'

const TILE_SIZE = 32
const VARIANTS = 6
const STYLES = 3
const WIDTH = TILE_SIZE * VARIANTS
const HEIGHT = TILE_SIZE * STYLES
const OUT_PATH = join(import.meta.dir, '../public/assets/sprites/base_tileset.png')

interface Rgb {
  r: number
  g: number
  b: number
}

interface StylePalette {
  base: Rgb
  dark: Rgb
  light: Rgb
  accent: Rgb
}

const PALETTES: StylePalette[] = [
  // red_dirt
  { base: { r: 143, g: 73, b: 52 }, dark: { r: 112, g: 54, b: 39 }, light: { r: 174, g: 94, b: 67 }, accent: { r: 120, g: 86, b: 56 } },
  // grass
  { base: { r: 82, g: 141, b: 70 }, dark: { r: 60, g: 106, b: 52 }, light: { r: 113, g: 176, b: 95 }, accent: { r: 152, g: 124, b: 82 } },
  // stone
  { base: { r: 120, g: 124, b: 132 }, dark: { r: 92, g: 96, b: 104 }, light: { r: 154, g: 160, b: 169 }, accent: { r: 103, g: 110, b: 120 } },
]

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function hash(seed: number, x: number, y: number): number {
  let h = seed >>> 0
  h ^= Math.imul(x + 0x9e3779b9, 0x85ebca6b)
  h ^= Math.imul(y + 0xc2b2ae35, 0x27d4eb2d)
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

function noise01(seed: number, x: number, y: number): number {
  return hash(seed, x, y) / 0xffffffff
}

function putPixel(pixels: Uint8Array, width: number, x: number, y: number, r: number, g: number, b: number): void {
  const i = (y * width + x) * 4
  pixels[i] = clampByte(r)
  pixels[i + 1] = clampByte(g)
  pixels[i + 2] = clampByte(b)
  pixels[i + 3] = 255
}

function drawTile(
  pixels: Uint8Array,
  atlasWidth: number,
  tileX: number,
  tileY: number,
  variant: number,
  palette: StylePalette,
): void {
  const sx = tileX * TILE_SIZE
  const sy = tileY * TILE_SIZE
  const seed = (tileY + 1) * 10007 + variant * 103

  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const nx = x / (TILE_SIZE - 1)
      const ny = y / (TILE_SIZE - 1)
      const coarse = noise01(seed, (x >> 2) + variant * 13, (y >> 2) + tileY * 17)
      const fine = noise01(seed ^ 0x5bd1e995, x + variant * 19, y + tileY * 29)
      const grain = noise01(seed ^ 0x27d4eb2d, x + variant * 7, y + tileY * 11)

      const shade = (coarse - 0.5) * 0.32 + (fine - 0.5) * 0.18 + (nx - 0.5) * 0.06 + (ny - 0.5) * 0.04
      const edge = (x <= 1 || y <= 1 || x >= TILE_SIZE - 2 || y >= TILE_SIZE - 2) ? 0.15 : 0
      const lightT = Math.max(0, shade + edge)
      const darkT = Math.max(0, -shade + edge * 0.8)

      let r = mix(palette.base.r, palette.light.r, lightT)
      let g = mix(palette.base.g, palette.light.g, lightT)
      let b = mix(palette.base.b, palette.light.b, lightT)
      r = mix(r, palette.dark.r, darkT)
      g = mix(g, palette.dark.g, darkT)
      b = mix(b, palette.dark.b, darkT)

      if (grain > 0.93) {
        r = mix(r, palette.accent.r, 0.7)
        g = mix(g, palette.accent.g, 0.7)
        b = mix(b, palette.accent.b, 0.7)
      }

      putPixel(pixels, atlasWidth, sx + x, sy + y, r, g, b)
    }
  }
}

function createPNG(width: number, height: number, pixels: Uint8Array): Uint8Array {
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const crcTable: number[] = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crcTable[n] = c
  }

  const crc32 = (data: Uint8Array): number => {
    let crc = 0xffffffff
    for (let i = 0; i < data.length; i++) {
      crc = crcTable[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8)
    }
    return crc ^ 0xffffffff
  }

  const writeU32 = (arr: Uint8Array, offset: number, value: number): void => {
    arr[offset] = (value >>> 24) & 0xff
    arr[offset + 1] = (value >>> 16) & 0xff
    arr[offset + 2] = (value >>> 8) & 0xff
    arr[offset + 3] = value & 0xff
  }

  const chunk = (type: string, data: Uint8Array): Uint8Array => {
    const out = new Uint8Array(12 + data.length)
    writeU32(out, 0, data.length)
    out[4] = type.charCodeAt(0)
    out[5] = type.charCodeAt(1)
    out[6] = type.charCodeAt(2)
    out[7] = type.charCodeAt(3)
    out.set(data, 8)
    const crcInput = new Uint8Array(4 + data.length)
    crcInput.set(out.subarray(4, 8), 0)
    crcInput.set(data, 4)
    writeU32(out, out.length - 4, crc32(crcInput))
    return out
  }

  const ihdrData = new Uint8Array(13)
  writeU32(ihdrData, 0, width)
  writeU32(ihdrData, 4, height)
  ihdrData[8] = 8
  ihdrData[9] = 6
  ihdrData[10] = 0
  ihdrData[11] = 0
  ihdrData[12] = 0
  const ihdr = chunk('IHDR', ihdrData)

  const raw = new Uint8Array(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4
      const dst = y * (1 + width * 4) + 1 + x * 4
      raw[dst] = pixels[src]!
      raw[dst + 1] = pixels[src + 1]!
      raw[dst + 2] = pixels[src + 2]!
      raw[dst + 3] = pixels[src + 3]!
    }
  }

  const deflateStore = (data: Uint8Array): Uint8Array => {
    const blocks: Uint8Array[] = [new Uint8Array([0x78, 0x01])]
    const MAX = 65535
    let offset = 0
    while (offset < data.length) {
      const len = Math.min(MAX, data.length - offset)
      const last = offset + len >= data.length
      const block = new Uint8Array(5 + len)
      block[0] = last ? 0x01 : 0x00
      block[1] = len & 0xff
      block[2] = (len >> 8) & 0xff
      block[3] = ~len & 0xff
      block[4] = (~len >> 8) & 0xff
      block.set(data.subarray(offset, offset + len), 5)
      blocks.push(block)
      offset += len
    }

    let a = 1
    let b = 0
    for (let i = 0; i < data.length; i++) {
      a = (a + data[i]!) % 65521
      b = (b + a) % 65521
    }
    const adler = new Uint8Array(4)
    writeU32(adler, 0, (b << 16) | a)
    blocks.push(adler)

    const total = blocks.reduce((sum, part) => sum + part.length, 0)
    const out = new Uint8Array(total)
    let pos = 0
    for (const part of blocks) {
      out.set(part, pos)
      pos += part.length
    }
    return out
  }

  const idat = chunk('IDAT', deflateStore(raw))
  const iend = chunk('IEND', new Uint8Array(0))

  const png = new Uint8Array(signature.length + ihdr.length + idat.length + iend.length)
  let offset = 0
  png.set(signature, offset); offset += signature.length
  png.set(ihdr, offset); offset += ihdr.length
  png.set(idat, offset); offset += idat.length
  png.set(iend, offset)
  return png
}

function main(): void {
  const pixels = new Uint8Array(WIDTH * HEIGHT * 4)
  for (let styleRow = 0; styleRow < STYLES; styleRow++) {
    const palette = PALETTES[styleRow]!
    for (let variant = 0; variant < VARIANTS; variant++) {
      drawTile(pixels, WIDTH, variant, styleRow, variant, palette)
    }
  }
  writeFileSync(OUT_PATH, createPNG(WIDTH, HEIGHT, pixels))
  console.log(`Created ${OUT_PATH}`)
}

main()
