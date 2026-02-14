/**
 * Generate 16x16 placeholder item icons as PNGs.
 * Run with: bun tools/gen-item-icons.ts
 *
 * Each icon is a simple pixel art design on a transparent background.
 * Uses raw PNG encoding (no dependencies).
 */

import { writeFileSync } from 'fs'
import { join } from 'path'

const SIZE = 16
const OUT_DIR = join(import.meta.dir, '..', 'packages', 'client', 'public', 'assets', 'sprites', 'items')

// RGBA pixel helper
type RGBA = [number, number, number, number]
const TRANSPARENT: RGBA = [0, 0, 0, 0]

function rgba(r: number, g: number, b: number, a = 255): RGBA {
  return [r, g, b, a]
}

// Simple PNG writer (uncompressed, no dependencies)
function encodePNG(width: number, height: number, pixels: RGBA[][]): Uint8Array {
  // Build raw image data (filter byte + RGBA per row)
  const rawRows: number[] = []
  for (let y = 0; y < height; y++) {
    rawRows.push(0) // filter: None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixels[y]![x]!
      rawRows.push(r, g, b, a)
    }
  }

  // Deflate (store blocks, no actual compression - simple enough for 16x16)
  const rawData = new Uint8Array(rawRows)
  const deflated = deflateStore(rawData)

  // Build IDAT chunk
  const idatData = deflated
  const idat = makeChunk('IDAT', idatData)

  // IHDR
  const ihdr = new Uint8Array(13)
  const ihdrView = new DataView(ihdr.buffer)
  ihdrView.setUint32(0, width)
  ihdrView.setUint32(4, height)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 6   // color type: RGBA
  ihdr[10] = 0  // compression
  ihdr[11] = 0  // filter
  ihdr[12] = 0  // interlace
  const ihdrChunk = makeChunk('IHDR', ihdr)

  // IEND
  const iendChunk = makeChunk('IEND', new Uint8Array(0))

  // PNG signature
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

  // Concatenate
  const result = new Uint8Array(signature.length + ihdrChunk.length + idat.length + iendChunk.length)
  let offset = 0
  result.set(signature, offset); offset += signature.length
  result.set(ihdrChunk, offset); offset += ihdrChunk.length
  result.set(idat, offset); offset += idat.length
  result.set(iendChunk, offset)

  return result
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(4 + 4 + data.length + 4)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) chunk[4 + i] = type.charCodeAt(i)
  chunk.set(data, 8)
  const crc = crc32(chunk.subarray(4, 8 + data.length))
  view.setUint32(8 + data.length, crc)
  return chunk
}

function deflateStore(data: Uint8Array): Uint8Array {
  // zlib header (CMF=0x78, FLG=0x01) + stored deflate blocks + Adler-32
  const maxBlock = 65535
  const numBlocks = Math.ceil(data.length / maxBlock) || 1
  const out: number[] = [0x78, 0x01] // zlib header

  for (let i = 0; i < numBlocks; i++) {
    const start = i * maxBlock
    const end = Math.min(start + maxBlock, data.length)
    const blockData = data.subarray(start, end)
    const isLast = i === numBlocks - 1
    out.push(isLast ? 1 : 0) // BFINAL + BTYPE=00
    const len = blockData.length
    out.push(len & 0xff, (len >> 8) & 0xff)
    out.push((~len) & 0xff, (~len >> 8) & 0xff)
    for (let j = 0; j < blockData.length; j++) out.push(blockData[j]!)
  }

  // Adler-32
  let a = 1, b = 0
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]!) % 65521
    b = (b + a) % 65521
  }
  const adler = (b << 16) | a
  out.push((adler >> 24) & 0xff, (adler >> 16) & 0xff, (adler >> 8) & 0xff, adler & 0xff)

  return new Uint8Array(out)
}

// CRC-32 table
const crcTable: number[] = []
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  crcTable.push(c)
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

// ============================================================================
// Canvas helpers
// ============================================================================

function createCanvas(): RGBA[][] {
  return Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => [...TRANSPARENT] as RGBA)
  )
}

function setPixel(canvas: RGBA[][], x: number, y: number, color: RGBA): void {
  if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) {
    canvas[y]![x] = color
  }
}

function fillRect(canvas: RGBA[][], x: number, y: number, w: number, h: number, color: RGBA): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      setPixel(canvas, x + dx, y + dy, color)
    }
  }
}

function drawCircle(canvas: RGBA[][], cx: number, cy: number, r: number, color: RGBA): void {
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x - cx
      const dy = y - cy
      if (dx * dx + dy * dy <= r * r) {
        setPixel(canvas, x, y, color)
      }
    }
  }
}

function drawLine(canvas: RGBA[][], x0: number, y0: number, x1: number, y1: number, color: RGBA): void {
  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy
  let cx = x0, cy = y0
  while (true) {
    setPixel(canvas, cx, cy, color)
    if (cx === x1 && cy === y1) break
    const e2 = 2 * err
    if (e2 > -dy) { err -= dy; cx += sx }
    if (e2 < dx) { err += dx; cy += sy }
  }
}

// ============================================================================
// Item Icon Designs
// ============================================================================

// Colors
const BRASS = rgba(212, 160, 70)
const BRASS_DARK = rgba(170, 120, 40)
const SILVER = rgba(176, 176, 192)
const SILVER_DARK = rgba(120, 120, 140)
const GOLD = rgba(255, 200, 0)
const GOLD_DARK = rgba(200, 150, 0)
const RED = rgba(220, 50, 50)
const RED_DARK = rgba(160, 30, 30)
const GREEN = rgba(80, 200, 80)
const BROWN = rgba(139, 90, 43)
const BROWN_DARK = rgba(100, 65, 30)
const AMBER = rgba(255, 170, 50)
const WHITE = rgba(240, 240, 240)
const GRAY = rgba(100, 100, 100)
const DARK = rgba(50, 50, 50)
const LEATHER = rgba(160, 100, 50)
const LEATHER_DARK = rgba(120, 75, 35)
const TEAL = rgba(50, 180, 160)
const PURPLE = rgba(140, 60, 180)

function drawGunOilTin(): RGBA[][] {
  const c = createCanvas()
  // Tin can body
  fillRect(c, 4, 3, 8, 10, BRASS)
  fillRect(c, 5, 3, 6, 10, BRASS_DARK)
  // Lid
  fillRect(c, 3, 2, 10, 2, BRASS)
  // Label stripe
  fillRect(c, 5, 6, 6, 3, DARK)
  // Oil drip
  setPixel(c, 7, 13, BRASS_DARK)
  setPixel(c, 8, 14, BRASS_DARK)
  return c
}

function drawGunpowderPouch(): RGBA[][] {
  const c = createCanvas()
  // Pouch body (rounded)
  fillRect(c, 4, 5, 8, 8, BROWN)
  fillRect(c, 5, 4, 6, 10, BROWN)
  fillRect(c, 3, 7, 10, 4, BROWN_DARK)
  // Drawstring
  drawLine(c, 5, 4, 7, 2, LEATHER)
  drawLine(c, 10, 4, 8, 2, LEATHER)
  setPixel(c, 7, 2, LEATHER)
  setPixel(c, 8, 2, LEATHER)
  // Gunpowder spilling
  setPixel(c, 6, 14, DARK)
  setPixel(c, 8, 13, DARK)
  setPixel(c, 10, 14, DARK)
  return c
}

function drawTrailDustBoots(): RGBA[][] {
  const c = createCanvas()
  // Left boot
  fillRect(c, 2, 4, 4, 8, BROWN)
  fillRect(c, 1, 12, 6, 2, BROWN_DARK)
  fillRect(c, 2, 3, 3, 2, BROWN)
  // Boot sole
  fillRect(c, 1, 14, 6, 1, DARK)
  // Right boot
  fillRect(c, 9, 4, 4, 8, BROWN)
  fillRect(c, 8, 12, 6, 2, BROWN_DARK)
  fillRect(c, 9, 3, 3, 2, BROWN)
  fillRect(c, 8, 14, 6, 1, DARK)
  // Dust particles
  setPixel(c, 0, 13, rgba(180, 160, 120, 150))
  setPixel(c, 15, 12, rgba(180, 160, 120, 150))
  setPixel(c, 7, 14, rgba(180, 160, 120, 100))
  return c
}

function drawLeatherDuster(): RGBA[][] {
  const c = createCanvas()
  // Coat body
  fillRect(c, 5, 2, 6, 3, LEATHER)
  fillRect(c, 4, 5, 8, 6, LEATHER_DARK)
  fillRect(c, 3, 8, 10, 5, LEATHER)
  fillRect(c, 2, 11, 12, 3, LEATHER_DARK)
  // Collar
  fillRect(c, 5, 1, 6, 2, LEATHER)
  setPixel(c, 5, 1, LEATHER_DARK)
  setPixel(c, 10, 1, LEATHER_DARK)
  // Buttons
  setPixel(c, 8, 5, BRASS)
  setPixel(c, 8, 7, BRASS)
  setPixel(c, 8, 9, BRASS)
  return c
}

function drawTinStarBadge(): RGBA[][] {
  const c = createCanvas()
  // Star shape (5 points)
  const starColor = BRASS
  const starDark = BRASS_DARK
  // Center
  fillRect(c, 5, 5, 6, 6, starColor)
  // Top point
  fillRect(c, 7, 1, 2, 4, starColor)
  // Bottom-left point
  fillRect(c, 2, 10, 4, 3, starColor)
  setPixel(c, 3, 9, starColor)
  // Bottom-right point
  fillRect(c, 10, 10, 4, 3, starColor)
  setPixel(c, 12, 9, starColor)
  // Top-left point
  fillRect(c, 2, 3, 3, 3, starColor)
  setPixel(c, 4, 5, starColor)
  // Top-right point
  fillRect(c, 11, 3, 3, 3, starColor)
  setPixel(c, 11, 5, starColor)
  // Center circle
  setPixel(c, 7, 7, starDark)
  setPixel(c, 8, 7, starDark)
  setPixel(c, 7, 8, starDark)
  setPixel(c, 8, 8, starDark)
  return c
}

function drawFoolsGoldNugget(): RGBA[][] {
  const c = createCanvas()
  // Irregular nugget shape
  fillRect(c, 5, 5, 7, 6, GOLD)
  fillRect(c, 4, 6, 9, 4, GOLD)
  fillRect(c, 6, 4, 5, 8, GOLD)
  // Highlights
  setPixel(c, 6, 5, rgba(255, 240, 100))
  setPixel(c, 7, 5, rgba(255, 240, 100))
  setPixel(c, 5, 6, rgba(255, 230, 80))
  // Shadows
  setPixel(c, 10, 10, GOLD_DARK)
  setPixel(c, 11, 9, GOLD_DARK)
  setPixel(c, 10, 11, GOLD_DARK)
  setPixel(c, 9, 11, GOLD_DARK)
  // $ symbol
  setPixel(c, 7, 7, GOLD_DARK)
  setPixel(c, 8, 7, GOLD_DARK)
  setPixel(c, 7, 8, GOLD_DARK)
  setPixel(c, 8, 9, GOLD_DARK)
  setPixel(c, 7, 9, GOLD_DARK)
  setPixel(c, 8, 8, GOLD_DARK)
  return c
}

function drawRattlesnakeFang(): RGBA[][] {
  const c = createCanvas()
  // Fang (curved tooth)
  const fang = WHITE
  fillRect(c, 7, 2, 2, 10, fang)
  fillRect(c, 6, 3, 1, 8, fang)
  setPixel(c, 7, 12, fang)
  // Tip (sharp, slightly red)
  setPixel(c, 7, 13, rgba(200, 200, 200))
  setPixel(c, 7, 14, rgba(180, 180, 180))
  // Venom drip
  setPixel(c, 8, 13, GREEN)
  setPixel(c, 9, 14, GREEN)
  setPixel(c, 8, 15, rgba(60, 180, 60, 180))
  // Root
  fillRect(c, 6, 1, 4, 2, rgba(200, 190, 170))
  return c
}

function drawMoonshineFlask(): RGBA[][] {
  const c = createCanvas()
  // Flask body (round bottom)
  fillRect(c, 4, 6, 8, 7, SILVER)
  fillRect(c, 5, 5, 6, 9, SILVER)
  fillRect(c, 3, 8, 10, 4, SILVER_DARK)
  // Neck
  fillRect(c, 6, 2, 4, 4, SILVER)
  // Cork
  fillRect(c, 7, 1, 2, 2, BROWN)
  // Liquid inside (green tint)
  fillRect(c, 5, 9, 6, 3, rgba(100, 200, 100, 180))
  // Label
  setPixel(c, 7, 7, DARK)
  setPixel(c, 8, 7, DARK)
  // Shine
  setPixel(c, 5, 6, rgba(220, 220, 240))
  return c
}

function drawPowderKeg(): RGBA[][] {
  const c = createCanvas()
  // Barrel body
  fillRect(c, 3, 4, 10, 9, BROWN)
  fillRect(c, 4, 3, 8, 11, BROWN)
  // Bands
  fillRect(c, 3, 5, 10, 1, GRAY)
  fillRect(c, 3, 11, 10, 1, GRAY)
  // Top
  fillRect(c, 5, 2, 6, 2, BROWN_DARK)
  // Fuse
  drawLine(c, 8, 2, 10, 0, DARK)
  // Spark
  setPixel(c, 10, 0, AMBER)
  setPixel(c, 11, 0, rgba(255, 100, 0))
  setPixel(c, 10, 1, rgba(255, 150, 50, 200))
  // Skull and crossbones (simplified)
  setPixel(c, 7, 7, WHITE)
  setPixel(c, 8, 7, WHITE)
  setPixel(c, 7, 8, WHITE)
  setPixel(c, 8, 8, WHITE)
  setPixel(c, 6, 9, WHITE)
  setPixel(c, 9, 9, WHITE)
  return c
}

function drawSidewinderBelt(): RGBA[][] {
  const c = createCanvas()
  // Belt curve
  fillRect(c, 1, 6, 14, 3, LEATHER)
  fillRect(c, 2, 5, 12, 1, LEATHER_DARK)
  fillRect(c, 2, 9, 12, 1, LEATHER_DARK)
  // Bullet loops with bullets
  for (let i = 0; i < 5; i++) {
    const bx = 2 + i * 3
    fillRect(c, bx, 3, 2, 3, BRASS)
    setPixel(c, bx, 2, RED_DARK)
    setPixel(c, bx + 1, 2, RED_DARK)
  }
  // Buckle
  fillRect(c, 0, 6, 2, 3, SILVER)
  setPixel(c, 0, 7, SILVER_DARK)
  return c
}

function drawDeadMansDeed(): RGBA[][] {
  const c = createCanvas()
  // Parchment
  fillRect(c, 2, 1, 12, 14, rgba(230, 210, 170))
  fillRect(c, 3, 2, 10, 12, rgba(220, 200, 160))
  // Rolled edges
  fillRect(c, 2, 1, 12, 1, rgba(200, 180, 140))
  fillRect(c, 2, 14, 12, 1, rgba(200, 180, 140))
  // Text lines
  fillRect(c, 4, 4, 8, 1, rgba(60, 40, 20))
  fillRect(c, 4, 6, 7, 1, rgba(60, 40, 20))
  fillRect(c, 4, 8, 8, 1, rgba(60, 40, 20))
  fillRect(c, 4, 10, 5, 1, rgba(60, 40, 20))
  // Blood/wax seal
  drawCircle(c, 10, 12, 2, RED)
  setPixel(c, 10, 12, RED_DARK)
  return c
}

function drawGrimHarvest(): RGBA[][] {
  const c = createCanvas()
  // Scythe handle
  drawLine(c, 4, 14, 11, 3, BROWN)
  drawLine(c, 5, 14, 12, 3, BROWN_DARK)
  // Scythe blade
  fillRect(c, 8, 1, 4, 2, SILVER)
  fillRect(c, 11, 2, 3, 2, SILVER)
  fillRect(c, 12, 3, 2, 3, SILVER_DARK)
  fillRect(c, 13, 4, 1, 3, SILVER_DARK)
  setPixel(c, 13, 7, SILVER_DARK)
  // Edge highlight
  setPixel(c, 8, 1, rgba(220, 220, 240))
  setPixel(c, 9, 1, rgba(220, 220, 240))
  // Eerie glow
  setPixel(c, 7, 2, PURPLE)
  setPixel(c, 14, 5, rgba(140, 60, 180, 120))
  return c
}

// ============================================================================
// Generate all icons
// ============================================================================

const ITEMS: Array<{ key: string; draw: () => RGBA[][] }> = [
  { key: 'gun_oil_tin', draw: drawGunOilTin },
  { key: 'gunpowder_pouch', draw: drawGunpowderPouch },
  { key: 'trail_dust_boots', draw: drawTrailDustBoots },
  { key: 'leather_duster', draw: drawLeatherDuster },
  { key: 'tin_star_badge', draw: drawTinStarBadge },
  { key: 'fools_gold_nugget', draw: drawFoolsGoldNugget },
  { key: 'rattlesnake_fang', draw: drawRattlesnakeFang },
  { key: 'moonshine_flask', draw: drawMoonshineFlask },
  { key: 'powder_keg', draw: drawPowderKeg },
  { key: 'sidewinder_belt', draw: drawSidewinderBelt },
  { key: 'dead_mans_deed', draw: drawDeadMansDeed },
  { key: 'grim_harvest', draw: drawGrimHarvest },
]

console.log(`Generating ${ITEMS.length} item icons (${SIZE}x${SIZE}) to ${OUT_DIR}`)

for (const item of ITEMS) {
  const pixels = item.draw()
  const png = encodePNG(SIZE, SIZE, pixels)
  const path = join(OUT_DIR, `${item.key}.png`)
  writeFileSync(path, png)
  console.log(`  ${item.key}.png (${png.length} bytes)`)
}

console.log('Done!')
