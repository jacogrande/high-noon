/**
 * Generate placeholder sprite assets
 *
 * Run with: bun run packages/client/scripts/generate-placeholders.ts
 */

import { writeFileSync } from 'fs'
import { join } from 'path'

const SPRITES_DIR = join(import.meta.dir, '../public/assets/sprites')

// Simple PNG encoder for placeholder images
// Creates uncompressed PNG with RGBA data

function createPNG(width: number, height: number, pixels: Uint8Array): Uint8Array {
  // PNG signature
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  // CRC32 table
  const crcTable: number[] = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    crcTable[n] = c
  }

  function crc32(data: Uint8Array): number {
    let crc = 0xffffffff
    for (let i = 0; i < data.length; i++) {
      crc = crcTable[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8)
    }
    return crc ^ 0xffffffff
  }

  function writeUint32BE(arr: Uint8Array, offset: number, value: number): void {
    arr[offset] = (value >>> 24) & 0xff
    arr[offset + 1] = (value >>> 16) & 0xff
    arr[offset + 2] = (value >>> 8) & 0xff
    arr[offset + 3] = value & 0xff
  }

  function createChunk(type: string, data: Uint8Array): Uint8Array {
    const chunk = new Uint8Array(4 + 4 + data.length + 4)
    writeUint32BE(chunk, 0, data.length)
    chunk[4] = type.charCodeAt(0)
    chunk[5] = type.charCodeAt(1)
    chunk[6] = type.charCodeAt(2)
    chunk[7] = type.charCodeAt(3)
    chunk.set(data, 8)
    const crcData = new Uint8Array(4 + data.length)
    crcData[0] = type.charCodeAt(0)
    crcData[1] = type.charCodeAt(1)
    crcData[2] = type.charCodeAt(2)
    crcData[3] = type.charCodeAt(3)
    crcData.set(data, 4)
    writeUint32BE(chunk, 8 + data.length, crc32(crcData))
    return chunk
  }

  // IHDR chunk
  const ihdrData = new Uint8Array(13)
  writeUint32BE(ihdrData, 0, width)
  writeUint32BE(ihdrData, 4, height)
  ihdrData[8] = 8 // bit depth
  ihdrData[9] = 6 // color type (RGBA)
  ihdrData[10] = 0 // compression
  ihdrData[11] = 0 // filter
  ihdrData[12] = 0 // interlace
  const ihdr = createChunk('IHDR', ihdrData)

  // IDAT chunk (uncompressed using zlib store)
  const rawData = new Uint8Array(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0 // filter type: none
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4
      const dstIdx = y * (1 + width * 4) + 1 + x * 4
      rawData[dstIdx] = pixels[srcIdx]!
      rawData[dstIdx + 1] = pixels[srcIdx + 1]!
      rawData[dstIdx + 2] = pixels[srcIdx + 2]!
      rawData[dstIdx + 3] = pixels[srcIdx + 3]!
    }
  }

  // Simple zlib wrapper (store, no compression)
  function deflateStore(data: Uint8Array): Uint8Array {
    const blocks: Uint8Array[] = []
    const BLOCK_SIZE = 65535

    // zlib header
    blocks.push(new Uint8Array([0x78, 0x01]))

    let offset = 0
    while (offset < data.length) {
      const remaining = data.length - offset
      const blockLen = Math.min(remaining, BLOCK_SIZE)
      const isLast = offset + blockLen >= data.length

      const block = new Uint8Array(5 + blockLen)
      block[0] = isLast ? 0x01 : 0x00
      block[1] = blockLen & 0xff
      block[2] = (blockLen >> 8) & 0xff
      block[3] = ~blockLen & 0xff
      block[4] = (~blockLen >> 8) & 0xff
      block.set(data.subarray(offset, offset + blockLen), 5)
      blocks.push(block)

      offset += blockLen
    }

    // Adler-32 checksum
    let a = 1,
      b = 0
    for (let i = 0; i < data.length; i++) {
      a = (a + data[i]!) % 65521
      b = (b + a) % 65521
    }
    const adler = (b << 16) | a
    const adlerBytes = new Uint8Array(4)
    writeUint32BE(adlerBytes, 0, adler)
    blocks.push(adlerBytes)

    const totalLen = blocks.reduce((sum, b) => sum + b.length, 0)
    const result = new Uint8Array(totalLen)
    let pos = 0
    for (const block of blocks) {
      result.set(block, pos)
      pos += block.length
    }
    return result
  }

  const compressedData = deflateStore(rawData)
  const idat = createChunk('IDAT', compressedData)

  // IEND chunk
  const iend = createChunk('IEND', new Uint8Array(0))

  // Combine all chunks
  const png = new Uint8Array(signature.length + ihdr.length + idat.length + iend.length)
  png.set(signature, 0)
  png.set(ihdr, signature.length)
  png.set(idat, signature.length + ihdr.length)
  png.set(iend, signature.length + ihdr.length + idat.length)

  return png
}

function fillRect(
  pixels: Uint8Array,
  width: number,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
  a: number
): void {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      const idx = (py * width + px) * 4
      pixels[idx] = r
      pixels[idx + 1] = g
      pixels[idx + 2] = b
      pixels[idx + 3] = a
    }
  }
}

function drawBorder(
  pixels: Uint8Array,
  width: number,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
  a: number,
  thickness: number = 1
): void {
  // Top
  fillRect(pixels, width, x, y, w, thickness, r, g, b, a)
  // Bottom
  fillRect(pixels, width, x, y + h - thickness, w, thickness, r, g, b, a)
  // Left
  fillRect(pixels, width, x, y, thickness, h, r, g, b, a)
  // Right
  fillRect(pixels, width, x + w - thickness, y, thickness, h, r, g, b, a)
}

// ============================================================================
// Generate Tileset (96x32, 3 tiles of 32x32 each)
// ============================================================================

function generateTileset(): void {
  const width = 96
  const height = 32
  const pixels = new Uint8Array(width * height * 4)

  // Tile 0: EMPTY (transparent)
  // Already transparent (all zeros)

  // Tile 1: WALL (brown with darker border - adobe style)
  fillRect(pixels, width, 32, 0, 32, 32, 139, 90, 43, 255) // Saddle brown fill
  drawBorder(pixels, width, 32, 0, 32, 32, 101, 67, 33, 255, 2) // Darker border

  // Tile 2: FLOOR (sandy tan)
  fillRect(pixels, width, 64, 0, 32, 32, 210, 180, 140, 255) // Tan/sand color
  // Add subtle texture dots
  for (let i = 0; i < 8; i++) {
    const dx = 64 + 4 + ((i * 7) % 24)
    const dy = 4 + ((i * 11) % 24)
    pixels[(dy * width + dx) * 4] = 190
    pixels[(dy * width + dx) * 4 + 1] = 160
    pixels[(dy * width + dx) * 4 + 2] = 120
    pixels[(dy * width + dx) * 4 + 3] = 255
  }

  const png = createPNG(width, height, pixels)
  writeFileSync(join(SPRITES_DIR, 'tileset.png'), png)
  console.log('Created tileset.png')
}

// ============================================================================
// Generate Player Spritesheet (256x160, 8 directions x 5 frames)
// ============================================================================

function generatePlayer(): void {
  const tileW = 32
  const tileH = 32
  const cols = 8 // 8 directions
  const rows = 5 // idle + 4 walk frames (reused for roll)
  const width = cols * tileW
  const height = rows * tileH
  const pixels = new Uint8Array(width * height * 4)

  // Direction indicators (relative positions for direction arrow)
  const directionOffsets: Record<string, { dx: number; dy: number }> = {
    E: { dx: 10, dy: 0 },
    SE: { dx: 7, dy: 7 },
    S: { dx: 0, dy: 10 },
    SW: { dx: -7, dy: 7 },
    W: { dx: -10, dy: 0 },
    NW: { dx: -7, dy: -7 },
    N: { dx: 0, dy: -10 },
    NE: { dx: 7, dy: -7 },
  }
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

  for (let col = 0; col < cols; col++) {
    const dir = directions[col]!
    const offset = directionOffsets[dir]!

    for (let row = 0; row < rows; row++) {
      const baseX = col * tileW
      const baseY = row * tileH
      const centerX = baseX + tileW / 2
      const centerY = baseY + tileH / 2

      // Draw player body (cyan circle approximation)
      for (let py = 0; py < tileH; py++) {
        for (let px = 0; px < tileW; px++) {
          const dx = px - tileW / 2
          const dy = py - tileH / 2
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < 12) {
            const idx = ((baseY + py) * width + (baseX + px)) * 4
            // Slight color variation for walk animation
            const walkOffset = row > 0 ? (row % 2) * 10 : 0
            pixels[idx] = 0 + walkOffset
            pixels[idx + 1] = 255 - walkOffset
            pixels[idx + 2] = 255
            pixels[idx + 3] = 255
          }
        }
      }

      // Draw direction indicator (small white dot)
      const indicatorX = Math.round(centerX + offset.dx) - baseX
      const indicatorY = Math.round(centerY + offset.dy) - baseY
      for (let iy = -2; iy <= 2; iy++) {
        for (let ix = -2; ix <= 2; ix++) {
          if (ix * ix + iy * iy <= 4) {
            const px = indicatorX + ix
            const py = indicatorY + iy
            if (px >= 0 && px < tileW && py >= 0 && py < tileH) {
              const idx = ((baseY + py) * width + (baseX + px)) * 4
              pixels[idx] = 255
              pixels[idx + 1] = 255
              pixels[idx + 2] = 255
              pixels[idx + 3] = 255
            }
          }
        }
      }
    }
  }

  const png = createPNG(width, height, pixels)
  writeFileSync(join(SPRITES_DIR, 'player.png'), png)
  console.log('Created player.png')
}

// ============================================================================
// Generate Bullet (16x16)
// ============================================================================

function generateBullet(): void {
  const width = 16
  const height = 16
  const pixels = new Uint8Array(width * height * 4)

  // Draw yellow oval bullet
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const dx = (px - width / 2) / 6
      const dy = (py - height / 2) / 3
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < 1) {
        const idx = (py * width + px) * 4
        // Yellow/orange gradient
        const brightness = 1 - dist * 0.3
        pixels[idx] = Math.round(255 * brightness)
        pixels[idx + 1] = Math.round(200 * brightness)
        pixels[idx + 2] = 0
        pixels[idx + 3] = 255
      }
    }
  }

  const png = createPNG(width, height, pixels)
  writeFileSync(join(SPRITES_DIR, 'bullet.png'), png)
  console.log('Created bullet.png')
}

// ============================================================================
// Generate JSON Spritesheet Definitions
// ============================================================================

function generateTilesetJson(): void {
  const json = {
    frames: {
      tile_empty: {
        frame: { x: 0, y: 0, w: 32, h: 32 },
        sourceSize: { w: 32, h: 32 },
        spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 },
      },
      tile_wall: {
        frame: { x: 32, y: 0, w: 32, h: 32 },
        sourceSize: { w: 32, h: 32 },
        spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 },
      },
      tile_floor: {
        frame: { x: 64, y: 0, w: 32, h: 32 },
        sourceSize: { w: 32, h: 32 },
        spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 },
      },
    },
    meta: {
      image: 'tileset.png',
      format: 'RGBA8888',
      size: { w: 96, h: 32 },
      scale: 1,
    },
  }

  writeFileSync(join(SPRITES_DIR, 'tileset.json'), JSON.stringify(json, null, 2))
  console.log('Created tileset.json')
}

function generatePlayerJson(): void {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const states = ['idle', 'walk', 'roll']
  const tileW = 32
  const tileH = 32

  const frames: Record<string, object> = {}

  for (let col = 0; col < directions.length; col++) {
    const dir = directions[col]!

    // Idle: row 0, frame 0
    frames[`player_idle_${dir}_0`] = {
      frame: { x: col * tileW, y: 0, w: tileW, h: tileH },
      sourceSize: { w: tileW, h: tileH },
      spriteSourceSize: { x: 0, y: 0, w: tileW, h: tileH },
    }

    // Walk: rows 1-4, frames 0-3
    for (let frame = 0; frame < 4; frame++) {
      frames[`player_walk_${dir}_${frame}`] = {
        frame: { x: col * tileW, y: (frame + 1) * tileH, w: tileW, h: tileH },
        sourceSize: { w: tileW, h: tileH },
        spriteSourceSize: { x: 0, y: 0, w: tileW, h: tileH },
      }
    }

    // Roll: reuse walk frames
    for (let frame = 0; frame < 4; frame++) {
      frames[`player_roll_${dir}_${frame}`] = {
        frame: { x: col * tileW, y: (frame + 1) * tileH, w: tileW, h: tileH },
        sourceSize: { w: tileW, h: tileH },
        spriteSourceSize: { x: 0, y: 0, w: tileW, h: tileH },
      }
    }
  }

  const json = {
    frames,
    meta: {
      image: 'player.png',
      format: 'RGBA8888',
      size: { w: 256, h: 160 },
      scale: 1,
    },
    animations: {
      // Define animations for each direction
      ...Object.fromEntries(
        directions.flatMap((dir) => [
          [`idle_${dir}`, [`player_idle_${dir}_0`]],
          [
            `walk_${dir}`,
            [
              `player_walk_${dir}_0`,
              `player_walk_${dir}_1`,
              `player_walk_${dir}_2`,
              `player_walk_${dir}_3`,
            ],
          ],
          [
            `roll_${dir}`,
            [
              `player_roll_${dir}_0`,
              `player_roll_${dir}_1`,
              `player_roll_${dir}_2`,
              `player_roll_${dir}_3`,
            ],
          ],
        ])
      ),
    },
  }

  writeFileSync(join(SPRITES_DIR, 'player.json'), JSON.stringify(json, null, 2))
  console.log('Created player.json')
}

// Run all generators
generateTileset()
generateTilesetJson()
generatePlayer()
generatePlayerJson()
generateBullet()

console.log('\nAll placeholder assets generated!')
