/**
 * Fodder & Threat Enemy Sprite Sheet Generator
 *
 * Generates 128×480 PNG sprite sheets (32×32 cells, 15 rows × 4 cols) for:
 *   - swarmer.png    — small bandit with bandana + knife (pale pink)
 *   - grunt.png      — sturdy bandit with hat + hatchet (red-orange)
 *   - shooter.png    — gunslinger with poncho + rifle (purple)
 *   - charger.png    — bald brute with fists (dark red)
 *   - runner.png     — thin courier (bright cyan)
 *   - duelist.png    — fancy pistolero with saber (amber/gold)
 *
 * Row layout (same as all enemy sheets):
 *   0-2:   idle  S/E/N (2 frames)
 *   3-5:   walk  S/E/N (4 frames)
 *   6-8:   reserved
 *   9-11:  death S/E/N (3 frames)
 *   12-14: attack S/E/N (4 frames)
 *
 * Run: bun run tools/generateEnemySprites.ts
 */

import { deflateSync } from 'node:zlib'

const CELL = 32
const COLS = 4
const ROWS = 15
const WIDTH = CELL * COLS   // 128
const HEIGHT = CELL * ROWS  // 480

// ============================================================================
// Minimal PNG encoder (shared with Dalton generator)
// ============================================================================

function crc32(buf: Uint8Array): number {
  let c = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!
    for (let j = 0; j < 8; j++) {
      c = (c >>> 1) ^ (c & 1 ? 0xEDB88320 : 0)
    }
  }
  return (c ^ 0xFFFFFFFF) >>> 0
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const len = data.length
  const buf = new Uint8Array(12 + len)
  const view = new DataView(buf.buffer)
  view.setUint32(0, len)
  buf[4] = type.charCodeAt(0)
  buf[5] = type.charCodeAt(1)
  buf[6] = type.charCodeAt(2)
  buf[7] = type.charCodeAt(3)
  buf.set(data, 8)
  const crcData = buf.subarray(4, 8 + len)
  view.setUint32(8 + len, crc32(crcData))
  return buf
}

function encodePNG(w: number, h: number, rgba: Uint8Array): Uint8Array {
  const ihdr = new Uint8Array(13)
  const iv = new DataView(ihdr.buffer)
  iv.setUint32(0, w)
  iv.setUint32(4, h)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  const raw = new Uint8Array(h * (1 + w * 4))
  for (let y = 0; y < h; y++) {
    const offset = y * (1 + w * 4)
    raw[offset] = 0
    raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), offset + 1)
  }
  const compressed = new Uint8Array(deflateSync(raw))
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdrChunk = makeChunk('IHDR', ihdr)
  const idatChunk = makeChunk('IDAT', compressed)
  const iendChunk = makeChunk('IEND', new Uint8Array(0))
  const out = new Uint8Array(sig.length + ihdrChunk.length + idatChunk.length + iendChunk.length)
  let pos = 0
  out.set(sig, pos); pos += sig.length
  out.set(ihdrChunk, pos); pos += ihdrChunk.length
  out.set(idatChunk, pos); pos += idatChunk.length
  out.set(iendChunk, pos)
  return out
}

// ============================================================================
// Pixel buffer
// ============================================================================

class PixelBuffer {
  data: Uint8Array
  w: number; h: number
  constructor(w: number, h: number) {
    this.w = w; this.h = h
    this.data = new Uint8Array(w * h * 4)
  }
  set(x: number, y: number, r: number, g: number, b: number, a = 255) {
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return
    const i = (y * this.w + x) * 4
    this.data[i] = r; this.data[i+1] = g; this.data[i+2] = b; this.data[i+3] = a
  }
  draw(ox: number, oy: number, pattern: string[], pal: Record<string, RGBA>) {
    for (let r = 0; r < pattern.length; r++) {
      const row = pattern[r]!
      for (let c = 0; c < row.length; c++) {
        const ch = row[c]!
        if (ch === ' ') continue
        const color = pal[ch]
        if (!color) continue
        this.set(ox + c, oy + r, color[0], color[1], color[2], color[3])
      }
    }
  }
  blitCell(col: number, row: number, frame: PixelBuffer) {
    const dx = col * CELL, dy = row * CELL
    for (let y = 0; y < CELL; y++)
      for (let x = 0; x < CELL; x++) {
        const si = (y * frame.w + x) * 4
        if (frame.data[si+3]! === 0) continue
        this.set(dx+x, dy+y, frame.data[si]!, frame.data[si+1]!, frame.data[si+2]!, frame.data[si+3]!)
      }
  }
}

type RGBA = [number, number, number, number]
type Pat = string[]
type FrameGrid = (Pat | null)[][]

// ============================================================================
// Helpers
// ============================================================================

function renderFrame(pattern: Pat, pal: Record<string, RGBA>): PixelBuffer {
  const fb = new PixelBuffer(CELL, CELL)
  const maxW = Math.max(...pattern.map(r => r.length))
  const ox = Math.floor((CELL - maxW) / 2)
  const oy = Math.floor((CELL - pattern.length) / 2)
  fb.draw(ox, oy, pattern, pal)
  return fb
}

function flipH(pattern: Pat): Pat {
  return pattern.map(row => row.split('').reverse().join(''))
}

function shiftDown(pattern: Pat, n: number): Pat {
  const blank = ' '.repeat(pattern[0]?.length ?? 0)
  const result = [...pattern]
  for (let i = 0; i < n; i++) { result.pop(); result.unshift(blank) }
  return result
}

function replaceChars(pattern: Pat, map: Record<string, string>): Pat {
  return pattern.map(row => {
    let r = row
    for (const [from, to] of Object.entries(map)) r = r.split(from).join(to)
    return r
  })
}

function assembleSheet(grid: FrameGrid, pal: Record<string, RGBA>): PixelBuffer {
  const sheet = new PixelBuffer(WIDTH, HEIGHT)
  for (let row = 0; row < ROWS; row++)
    for (let col = 0; col < COLS; col++) {
      const frame = grid[row]?.[col]
      if (!frame) continue
      sheet.blitCell(col, row, renderFrame(frame, pal))
    }
  return sheet
}

async function writeSheet(name: string, grid: FrameGrid, pal: Record<string, RGBA>) {
  const sheet = assembleSheet(grid, pal)
  const png = encodePNG(WIDTH, HEIGHT, sheet.data)
  const path = `packages/client/public/assets/sprites/enemies/${name}.png`
  await Bun.write(path, png)
  console.log(`wrote ${path} (${png.length} bytes)`)
}

// ============================================================================
// SWARMER — small bandit with bandana + knife (pale pink)
// ============================================================================

const SW: Record<string, RGBA> = {
  'o': [30, 22, 16, 255],       // outline
  'b': [220, 140, 140, 255],    // bandana (pink)
  'B': [180, 100, 100, 255],    // bandana dark
  's': [225, 178, 128, 255],    // skin
  'S': [188, 140, 95, 255],     // skin shadow
  'e': [35, 28, 22, 255],       // eyes
  'c': [160, 110, 80, 255],     // shirt (tan)
  'C': [130, 85, 60, 255],      // shirt shadow
  'p': [82, 58, 34, 255],       // pants
  'P': [58, 40, 24, 255],       // pants dark
  't': [42, 30, 18, 255],       // boots
  'k': [180, 180, 195, 255],    // knife blade
  'K': [120, 120, 135, 255],    // knife dark
  'r': [110, 70, 35, 255],      // knife handle
}

const SW_IDLE_S_0: Pat = [
  '   ooo    ',
  '  obbbo   ',
  '  oBBBo   ',
  '  oseso   ',
  '  obbbo   ',
  '  occco   ',
  '  ocCco   ',
  '  oCCco   ',
  '   oppo   ',
  '  opPPpo  ',
  '  op  po  ',
  '  ot  to  ',
]
const SW_IDLE_S_1 = shiftDown(SW_IDLE_S_0, 1)

const SW_WALK_S_0: Pat = [
  '   ooo    ',
  '  obbbo   ',
  '  oBBBo   ',
  '  oseso   ',
  '  obbbo   ',
  '  occco   ',
  '  ocCco   ',
  '  oCCco   ',
  '   oppo   ',
  '  opPpo   ',
  '  op  po  ',
  '   to to  ',
]
const SW_WALK_S_1 = SW_IDLE_S_0
const SW_WALK_S_2 = flipH(SW_WALK_S_0)
const SW_WALK_S_3 = SW_IDLE_S_0

const SW_DEATH_S_0 = SW_IDLE_S_0
const SW_DEATH_S_1: Pat = [
  '          ',
  '          ',
  '   ooo    ',
  '  obbbo   ',
  '  oBBBo   ',
  '  oseso   ',
  '  obbbo   ',
  '  occcoo  ',
  '  ocCcCo  ',
  '  oCCCo   ',
  '   opppo  ',
  '   ottto  ',
]
const SW_DEATH_S_2: Pat = [
  '          ',
  '          ',
  '          ',
  '          ',
  '          ',
  '          ',
  '          ',
  '  ooo     ',
  '  obbbo   ',
  '  osBcco  ',
  '  occpppo ',
  '   ottto  ',
]

const SW_ATK_S_0 = SW_IDLE_S_0
const SW_ATK_S_1: Pat = [
  '   ooo    ',
  '  obbbo   ',
  '  oBBBo   ',
  '  oseso   ',
  '  obbbo   ',
  ' koccco   ',
  ' KocCco   ',
  '  oCCco   ',
  '   oppo   ',
  '  opPPpo  ',
  '  op  po  ',
  '  ot  to  ',
]
const SW_ATK_S_2: Pat = [
  '   ooo    ',
  '  obbbo   ',
  '  oBBBo   ',
  '  oseso   ',
  '  obbbo   ',
  'rkoccco   ',
  '  ocCco   ',
  '  oCCco   ',
  '   oppo   ',
  '  opPPpo  ',
  '  op  po  ',
  '  ot  to  ',
]
const SW_ATK_S_3 = SW_ATK_S_1

// Swarmer East
const SW_IDLE_E_0: Pat = [
  '  ooo     ',
  '  obbbo   ',
  '  oBBo    ',
  '  oseo    ',
  '  obbo    ',
  '  occco   ',
  '  ocCo    ',
  '  oCCo    ',
  '   opo    ',
  '  opPpo   ',
  '  op po   ',
  '  ot to   ',
]
const SW_IDLE_E_1 = shiftDown(SW_IDLE_E_0, 1)
const SW_WALK_E_0: Pat = [
  '  ooo     ',
  '  obbbo   ',
  '  oBBo    ',
  '  oseo    ',
  '  obbo    ',
  '  occco   ',
  '  ocCo    ',
  '  oCCo    ',
  '   opo    ',
  '  opPo    ',
  '   po po  ',
  '   to to  ',
]
const SW_WALK_E_1 = SW_IDLE_E_0
const SW_WALK_E_2 = flipH(SW_WALK_E_0)
const SW_WALK_E_3 = SW_IDLE_E_0
const SW_DEATH_E_0 = SW_DEATH_S_0
const SW_DEATH_E_1 = SW_DEATH_S_1
const SW_DEATH_E_2 = SW_DEATH_S_2
const SW_ATK_E_0 = SW_IDLE_E_0
const SW_ATK_E_1: Pat = [
  '  ooo     ',
  '  obbbo   ',
  '  oBBo    ',
  '  oseo    ',
  '  obbo    ',
  '  occcoK  ',
  '  ocCo k  ',
  '  oCCo    ',
  '   opo    ',
  '  opPpo   ',
  '  op po   ',
  '  ot to   ',
]
const SW_ATK_E_2: Pat = [
  '  ooo     ',
  '  obbbo   ',
  '  oBBo    ',
  '  oseo    ',
  '  obbo    ',
  '  occcoKkr',
  '  ocCo    ',
  '  oCCo    ',
  '   opo    ',
  '  opPpo   ',
  '  op po   ',
  '  ot to   ',
]
const SW_ATK_E_3 = SW_ATK_E_1

// Swarmer North
const SW_IDLE_N_0: Pat = [
  '   ooo    ',
  '  oSSso   ',
  '  oSSso   ',
  '  oSSso   ',
  '          ',
  '  oCCCo   ',
  '  oCCCo   ',
  '  oCCCo   ',
  '   oppo   ',
  '  opPPpo  ',
  '  op  po  ',
  '  ot  to  ',
]
const SW_IDLE_N_1 = shiftDown(SW_IDLE_N_0, 1)
const SW_WALK_N_0: Pat = [
  '   ooo    ',
  '  oSSso   ',
  '  oSSso   ',
  '  oSSso   ',
  '          ',
  '  oCCCo   ',
  '  oCCCo   ',
  '  oCCCo   ',
  '   oppo   ',
  '  opPpo   ',
  '  op  po  ',
  '   to to  ',
]
const SW_WALK_N_1 = SW_IDLE_N_0
const SW_WALK_N_2 = flipH(SW_WALK_N_0)
const SW_WALK_N_3 = SW_IDLE_N_0
const SW_DEATH_N_0 = SW_DEATH_S_0
const SW_DEATH_N_1 = SW_DEATH_S_1
const SW_DEATH_N_2 = SW_DEATH_S_2
const SW_ATK_N_0 = SW_IDLE_N_0
const SW_ATK_N_1 = replaceChars(SW_ATK_S_1, {'s':'S','e':'S','b':'C','B':'C'})
const SW_ATK_N_2 = replaceChars(SW_ATK_S_2, {'s':'S','e':'S','b':'C','B':'C'})
const SW_ATK_N_3 = SW_ATK_N_1

const swarmerGrid: FrameGrid = [
  [SW_IDLE_S_0, SW_IDLE_S_1, null, null],
  [SW_IDLE_E_0, SW_IDLE_E_1, null, null],
  [SW_IDLE_N_0, SW_IDLE_N_1, null, null],
  [SW_WALK_S_0, SW_WALK_S_1, SW_WALK_S_2, SW_WALK_S_3],
  [SW_WALK_E_0, SW_WALK_E_1, SW_WALK_E_2, SW_WALK_E_3],
  [SW_WALK_N_0, SW_WALK_N_1, SW_WALK_N_2, SW_WALK_N_3],
  [null, null, null, null],
  [null, null, null, null],
  [null, null, null, null],
  [SW_DEATH_S_0, SW_DEATH_S_1, SW_DEATH_S_2, null],
  [SW_DEATH_E_0, SW_DEATH_E_1, SW_DEATH_E_2, null],
  [SW_DEATH_N_0, SW_DEATH_N_1, SW_DEATH_N_2, null],
  [SW_ATK_S_0, SW_ATK_S_1, SW_ATK_S_2, SW_ATK_S_3],
  [SW_ATK_E_0, SW_ATK_E_1, SW_ATK_E_2, SW_ATK_E_3],
  [SW_ATK_N_0, SW_ATK_N_1, SW_ATK_N_2, SW_ATK_N_3],
]

// ============================================================================
// GRUNT — sturdy bandit with hat + hatchet (red-orange)
// ============================================================================

const GR: Record<string, RGBA> = {
  'o': [30, 22, 16, 255],
  'h': [140, 60, 25, 255],     // hat (dark orange)
  'H': [180, 85, 35, 255],     // hat light
  'F': [100, 40, 18, 255],     // hat band
  's': [225, 178, 128, 255],
  'S': [188, 140, 95, 255],
  'e': [35, 28, 22, 255],
  'v': [200, 90, 40, 255],     // vest (orange)
  'V': [160, 65, 28, 255],     // vest shadow
  'w': [215, 205, 185, 255],   // shirt
  'W': [180, 170, 150, 255],
  'k': [165, 140, 60, 255],    // buckle
  'p': [82, 58, 34, 255],
  'P': [58, 40, 24, 255],
  't': [42, 30, 18, 255],
  'a': [135, 135, 148, 255],   // axe blade
  'A': [100, 100, 115, 255],   // axe dark
  'r': [110, 70, 35, 255],     // axe handle
}

const GR_IDLE_S_0: Pat = [
  '    ooooo   ',
  '   oHHHHHo  ',
  '   ohhhho   ',
  '  oFFFFFo   ',
  '   osSsSo   ',
  '   seSeSs   ',
  '    osso    ',
  '   ovvvvo   ',
  '   vwwwvv   ',
  '   vWkkVv   ',
  '   oVVVVo   ',
  '    oppo    ',
  '   opPPpo   ',
  '   op  po   ',
  '   ot  to   ',
  '   ot  to   ',
]
const GR_IDLE_S_1 = shiftDown(GR_IDLE_S_0, 1)

const GR_WALK_S_0: Pat = [
  '    ooooo   ',
  '   oHHHHHo  ',
  '   ohhhho   ',
  '  oFFFFFo   ',
  '   osSsSo   ',
  '   seSeSs   ',
  '    osso    ',
  '   ovvvvo   ',
  '   vwwwvv   ',
  '   vWkkVv   ',
  '   oVVVVo   ',
  '    oppo    ',
  '   opPpo    ',
  '   op  po   ',
  '    to to   ',
  '    to to   ',
]
const GR_WALK_S_1 = GR_IDLE_S_0
const GR_WALK_S_2 = flipH(GR_WALK_S_0)
const GR_WALK_S_3 = GR_IDLE_S_0

const GR_DEATH_S_0 = GR_IDLE_S_0
const GR_DEATH_S_1: Pat = [
  '            ',
  '            ',
  '            ',
  '    ooooo   ',
  '   oHHHHHo  ',
  '   ohhhho   ',
  '  oFFFFFo   ',
  '   osSsSo   ',
  '   seSeSs   ',
  '    osso    ',
  '   ovvvvoo  ',
  '   vwwwvVo  ',
  '   vWkkVo   ',
  '   oVVVo    ',
  '    oppppo  ',
  '    ottto   ',
]
const GR_DEATH_S_2: Pat = [
  '            ',
  '            ',
  '            ',
  '            ',
  '            ',
  '            ',
  '            ',
  '            ',
  '            ',
  '   ooooo    ',
  '  oHHHHHo   ',
  '  oFFFFsso  ',
  '  osSsvvvo  ',
  '  ovvwwvvo  ',
  '  oVVpppppo ',
  '   ottttto  ',
]

const GR_ATK_S_0 = GR_IDLE_S_0
const GR_ATK_S_1: Pat = [
  '    ooooo   ',
  '   oHHHHHo  ',
  '   ohhhho   ',
  '  oFFFFFo   ',
  '   osSsSo   ',
  '   seSeSs   ',
  '    osso    ',
  '  aovvvvo   ',
  '  AvwwwvvAa ',
  '   vWkkVv   ',
  '   oVVVVo   ',
  '    oppo    ',
  '   opPPpo   ',
  '   op  po   ',
  '   ot  to   ',
  '   ot  to   ',
]
const GR_ATK_S_2: Pat = [
  '    ooooo   ',
  '   oHHHHHo  ',
  '   ohhhho   ',
  '  oFFFFFo   ',
  '   osSsSo   ',
  '   seSeSs   ',
  '    osso    ',
  ' raovvvvo   ',
  '  AvwwwvvAa ',
  '   vWkkVv   ',
  '   oVVVVo   ',
  '    oppo    ',
  '   opPPpo   ',
  '   op  po   ',
  '   ot  to   ',
  '   ot  to   ',
]
const GR_ATK_S_3 = GR_ATK_S_1

// Grunt East
const GR_IDLE_E_0: Pat = [
  '   oooo     ',
  '  oHHHHo    ',
  '  ohhhho    ',
  '  oFFFo     ',
  '   osso     ',
  '   seSo     ',
  '    oso     ',
  '  ovvvvo    ',
  '  vwwvo     ',
  '  vkWvo     ',
  '  oVVVo     ',
  '   oppo     ',
  '  opPpo     ',
  '  op po     ',
  '  ot to     ',
  '  ot to     ',
]
const GR_IDLE_E_1 = shiftDown(GR_IDLE_E_0, 1)
const GR_WALK_E_0: Pat = [
  '   oooo     ',
  '  oHHHHo    ',
  '  ohhhho    ',
  '  oFFFo     ',
  '   osso     ',
  '   seSo     ',
  '    oso     ',
  '  ovvvvo    ',
  '  vwwvo     ',
  '  vkWvo     ',
  '  oVVVo     ',
  '   oppo     ',
  '  opPo      ',
  '   po po    ',
  '   to  to   ',
  '            ',
]
const GR_WALK_E_1 = GR_IDLE_E_0
const GR_WALK_E_2 = flipH(GR_WALK_E_0)
const GR_WALK_E_3 = GR_IDLE_E_0
const GR_DEATH_E_0 = GR_DEATH_S_0
const GR_DEATH_E_1 = GR_DEATH_S_1
const GR_DEATH_E_2 = GR_DEATH_S_2
const GR_ATK_E_0 = GR_IDLE_E_0
const GR_ATK_E_1: Pat = [
  '   oooo     ',
  '  oHHHHo    ',
  '  ohhhho    ',
  '  oFFFo     ',
  '   osso     ',
  '   seSo     ',
  '    oso     ',
  '  ovvvvo    ',
  '  vwwvoAa   ',
  '  vkWvo     ',
  '  oVVVo     ',
  '   oppo     ',
  '  opPpo     ',
  '  op po     ',
  '  ot to     ',
  '  ot to     ',
]
const GR_ATK_E_2: Pat = [
  '   oooo     ',
  '  oHHHHo    ',
  '  ohhhho    ',
  '  oFFFo     ',
  '   osso     ',
  '   seSo     ',
  '    oso     ',
  '  ovvvvo    ',
  '  vwwvoAar  ',
  '  vkWvo     ',
  '  oVVVo     ',
  '   oppo     ',
  '  opPpo     ',
  '  op po     ',
  '  ot to     ',
  '  ot to     ',
]
const GR_ATK_E_3 = GR_ATK_E_1

// Grunt North
const GR_IDLE_N_0: Pat = [
  '    ooooo   ',
  '   ohhhho   ',
  '   ohhhho   ',
  '  ohhhhhho  ',
  '   oSSso    ',
  '   oSSso    ',
  '            ',
  '   oVVVVo   ',
  '   VVVVVVv  ',
  '   VVkkVVv  ',
  '   oVVVVo   ',
  '    oppo    ',
  '   opPPpo   ',
  '   op  po   ',
  '   ot  to   ',
  '   ot  to   ',
]
const GR_IDLE_N_1 = shiftDown(GR_IDLE_N_0, 1)
const GR_WALK_N_0: Pat = [
  '    ooooo   ',
  '   ohhhho   ',
  '   ohhhho   ',
  '  ohhhhhho  ',
  '   oSSso    ',
  '   oSSso    ',
  '            ',
  '   oVVVVo   ',
  '   VVVVVVv  ',
  '   VVkkVVv  ',
  '   oVVVVo   ',
  '    oppo    ',
  '   opPpo    ',
  '   op  po   ',
  '    to to   ',
  '    to to   ',
]
const GR_WALK_N_1 = GR_IDLE_N_0
const GR_WALK_N_2 = flipH(GR_WALK_N_0)
const GR_WALK_N_3 = GR_IDLE_N_0
const GR_DEATH_N_0 = GR_DEATH_S_0
const GR_DEATH_N_1 = GR_DEATH_S_1
const GR_DEATH_N_2 = GR_DEATH_S_2
const GR_ATK_N_0 = GR_IDLE_N_0
const GR_ATK_N_1 = replaceChars(GR_ATK_S_1, {'s':'S','e':'S','v':'V','w':'V','W':'V'})
const GR_ATK_N_2 = replaceChars(GR_ATK_S_2, {'s':'S','e':'S','v':'V','w':'V','W':'V'})
const GR_ATK_N_3 = GR_ATK_N_1

const gruntGrid: FrameGrid = [
  [GR_IDLE_S_0, GR_IDLE_S_1, null, null],
  [GR_IDLE_E_0, GR_IDLE_E_1, null, null],
  [GR_IDLE_N_0, GR_IDLE_N_1, null, null],
  [GR_WALK_S_0, GR_WALK_S_1, GR_WALK_S_2, GR_WALK_S_3],
  [GR_WALK_E_0, GR_WALK_E_1, GR_WALK_E_2, GR_WALK_E_3],
  [GR_WALK_N_0, GR_WALK_N_1, GR_WALK_N_2, GR_WALK_N_3],
  [null, null, null, null],
  [null, null, null, null],
  [null, null, null, null],
  [GR_DEATH_S_0, GR_DEATH_S_1, GR_DEATH_S_2, null],
  [GR_DEATH_E_0, GR_DEATH_E_1, GR_DEATH_E_2, null],
  [GR_DEATH_N_0, GR_DEATH_N_1, GR_DEATH_N_2, null],
  [GR_ATK_S_0, GR_ATK_S_1, GR_ATK_S_2, GR_ATK_S_3],
  [GR_ATK_E_0, GR_ATK_E_1, GR_ATK_E_2, GR_ATK_E_3],
  [GR_ATK_N_0, GR_ATK_N_1, GR_ATK_N_2, GR_ATK_N_3],
]

// ============================================================================
// SHOOTER — gunslinger with poncho + rifle (purple)
// ============================================================================

const SH: Record<string, RGBA> = {
  'o': [30, 22, 16, 255],
  'h': [100, 45, 120, 255],    // hat (dark purple)
  'H': [140, 65, 160, 255],    // hat light
  'F': [70, 30, 90, 255],      // hat band
  's': [225, 178, 128, 255],
  'S': [188, 140, 95, 255],
  'e': [35, 28, 22, 255],
  'c': [150, 60, 190, 255],    // poncho (purple)
  'C': [110, 40, 145, 255],    // poncho shadow
  'w': [215, 205, 185, 255],
  'W': [180, 170, 150, 255],
  'k': [165, 140, 60, 255],
  'p': [82, 58, 34, 255],
  'P': [58, 40, 24, 255],
  't': [42, 30, 18, 255],
  'g': [135, 135, 148, 255],   // gun metal
  'G': [88, 88, 100, 255],
  'r': [110, 70, 35, 255],     // gun wood
  'm': [255, 225, 110, 255],   // muzzle flash
  'M': [255, 255, 200, 255],
}

const SH_IDLE_S_0: Pat = [
  '    ooooo   ',
  '   oHHHHHo  ',
  '   ohhhho   ',
  '  oFFFFFo   ',
  '   osSsSo   ',
  '   seSeSs   ',
  '    osso    ',
  '  occccco   ',
  '  cccccccc  ',
  '  cCCCCCCc  ',
  '  occccco   ',
  '   owwwo    ',
  '   owkwo    ',
  '    oppo    ',
  '   opPPpo   ',
  '   ot  to   ',
]
const SH_IDLE_S_1 = shiftDown(SH_IDLE_S_0, 1)

const SH_WALK_S_0: Pat = [
  '    ooooo   ',
  '   oHHHHHo  ',
  '   ohhhho   ',
  '  oFFFFFo   ',
  '   osSsSo   ',
  '   seSeSs   ',
  '    osso    ',
  '  occccco   ',
  '  cccccccc  ',
  '  cCCCCCCc  ',
  '  occccco   ',
  '   owwwo    ',
  '   owkwo    ',
  '    oppo    ',
  '   op  po   ',
  '    to to   ',
]
const SH_WALK_S_1 = SH_IDLE_S_0
const SH_WALK_S_2 = flipH(SH_WALK_S_0)
const SH_WALK_S_3 = SH_IDLE_S_0

const SH_DEATH_S_0 = SH_IDLE_S_0
const SH_DEATH_S_1: Pat = [
  '            ',
  '            ',
  '            ',
  '    ooooo   ',
  '   oHHHHHo  ',
  '   ohhhho   ',
  '  oFFFFFo   ',
  '   osSsSo   ',
  '   seSeSs   ',
  '    osso    ',
  '  occcccoo  ',
  '  ccccccCo  ',
  '  cCCCCCo   ',
  '  occccoo   ',
  '   opppppo  ',
  '    ottto   ',
]
const SH_DEATH_S_2: Pat = [
  '            ',
  '            ',
  '            ',
  '            ',
  '            ',
  '            ',
  '            ',
  '            ',
  '            ',
  '   ooooo    ',
  '  oHHHHHo   ',
  '  oFFFFsso  ',
  '  osSsccco  ',
  '  occccccco ',
  '  oCCpppppo ',
  '   otttto   ',
]

const SH_ATK_S_0 = SH_IDLE_S_0
const SH_ATK_S_1: Pat = [
  '    ooooo   ',
  '   oHHHHHo  ',
  '   ohhhho   ',
  '  oFFFFFo   ',
  '   osSsSo   ',
  '   seSeSs   ',
  '    osso    ',
  ' Goccccco   ',
  ' Gcccccccc  ',
  '  cCCCCCCc  ',
  '  occccco   ',
  '   owwwo    ',
  '   owkwo    ',
  '    oppo    ',
  '   opPPpo   ',
  '   ot  to   ',
]
const SH_ATK_S_2: Pat = [
  '    ooooo   ',
  '   oHHHHHo  ',
  '   ohhhho   ',
  '  oFFFFFo   ',
  '   osSsSo   ',
  '   seSeSs   ',
  '    osso    ',
  'mGoccccco   ',
  'MGcccccccc  ',
  '  cCCCCCCc  ',
  '  occccco   ',
  '   owwwo    ',
  '   owkwo    ',
  '    oppo    ',
  '   opPPpo   ',
  '   ot  to   ',
]
const SH_ATK_S_3 = SH_ATK_S_1

// Shooter East
const SH_IDLE_E_0: Pat = [
  '   oooo     ',
  '  oHHHHo    ',
  '  ohhho     ',
  '  oFFFo     ',
  '   osSo     ',
  '   seSo     ',
  '    oso     ',
  '  occcco    ',
  '  ccccccc   ',
  '  cCCCCcc   ',
  '  occcco    ',
  '   owwo     ',
  '   okWo     ',
  '    opo     ',
  '  opPpo     ',
  '  ot to     ',
]
const SH_IDLE_E_1 = shiftDown(SH_IDLE_E_0, 1)
const SH_WALK_E_0: Pat = [
  '   oooo     ',
  '  oHHHHo    ',
  '  ohhho     ',
  '  oFFFo     ',
  '   osSo     ',
  '   seSo     ',
  '    oso     ',
  '  occcco    ',
  '  ccccccc   ',
  '  cCCCCcc   ',
  '  occcco    ',
  '   owwo     ',
  '   okWo     ',
  '    opo     ',
  '   po po    ',
  '   to  to   ',
]
const SH_WALK_E_1 = SH_IDLE_E_0
const SH_WALK_E_2 = flipH(SH_WALK_E_0)
const SH_WALK_E_3 = SH_IDLE_E_0
const SH_DEATH_E_0 = SH_DEATH_S_0
const SH_DEATH_E_1 = SH_DEATH_S_1
const SH_DEATH_E_2 = SH_DEATH_S_2
const SH_ATK_E_0 = SH_IDLE_E_0
const SH_ATK_E_1: Pat = [
  '   oooo     ',
  '  oHHHHo    ',
  '  ohhho     ',
  '  oFFFo     ',
  '   osSo     ',
  '   seSo     ',
  '    oso     ',
  '  occcco    ',
  '  cccccccGGr',
  '  cCCCCcc   ',
  '  occcco    ',
  '   owwo     ',
  '   okWo     ',
  '    opo     ',
  '  opPpo     ',
  '  ot to     ',
]
const SH_ATK_E_2: Pat = [
  '   oooo     ',
  '  oHHHHo    ',
  '  ohhho     ',
  '  oFFFo     ',
  '   osSo     ',
  '   seSo     ',
  '    oso     ',
  '  occcco    ',
  '  cccccccGmM',
  '  cCCCCcc   ',
  '  occcco    ',
  '   owwo     ',
  '   okWo     ',
  '    opo     ',
  '  opPpo     ',
  '  ot to     ',
]
const SH_ATK_E_3 = SH_ATK_E_1

// Shooter North
const SH_IDLE_N_0: Pat = [
  '    ooooo   ',
  '   ohhhho   ',
  '   ohhhho   ',
  '  ohhhhhho  ',
  '   oSSso    ',
  '   oSSso    ',
  '            ',
  '  oCCCCCo   ',
  '  CCCCCCCC  ',
  '  CCCCCCCC  ',
  '  oCCCCCo   ',
  '   oWWWo    ',
  '   oWkWo    ',
  '    oppo    ',
  '   opPPpo   ',
  '   ot  to   ',
]
const SH_IDLE_N_1 = shiftDown(SH_IDLE_N_0, 1)
const SH_WALK_N_0: Pat = [
  '    ooooo   ',
  '   ohhhho   ',
  '   ohhhho   ',
  '  ohhhhhho  ',
  '   oSSso    ',
  '   oSSso    ',
  '            ',
  '  oCCCCCo   ',
  '  CCCCCCCC  ',
  '  CCCCCCCC  ',
  '  oCCCCCo   ',
  '   oWWWo    ',
  '   oWkWo    ',
  '    oppo    ',
  '   op  po   ',
  '    to to   ',
]
const SH_WALK_N_1 = SH_IDLE_N_0
const SH_WALK_N_2 = flipH(SH_WALK_N_0)
const SH_WALK_N_3 = SH_IDLE_N_0
const SH_DEATH_N_0 = SH_DEATH_S_0
const SH_DEATH_N_1 = SH_DEATH_S_1
const SH_DEATH_N_2 = SH_DEATH_S_2
const SH_ATK_N_0 = SH_IDLE_N_0
const SH_ATK_N_1 = replaceChars(SH_ATK_S_1, {'s':'S','e':'S','c':'C','w':'W','W':'W'})
const SH_ATK_N_2 = replaceChars(SH_ATK_S_2, {'s':'S','e':'S','c':'C','w':'W','W':'W'})
const SH_ATK_N_3 = SH_ATK_N_1

const shooterGrid: FrameGrid = [
  [SH_IDLE_S_0, SH_IDLE_S_1, null, null],
  [SH_IDLE_E_0, SH_IDLE_E_1, null, null],
  [SH_IDLE_N_0, SH_IDLE_N_1, null, null],
  [SH_WALK_S_0, SH_WALK_S_1, SH_WALK_S_2, SH_WALK_S_3],
  [SH_WALK_E_0, SH_WALK_E_1, SH_WALK_E_2, SH_WALK_E_3],
  [SH_WALK_N_0, SH_WALK_N_1, SH_WALK_N_2, SH_WALK_N_3],
  [null, null, null, null],
  [null, null, null, null],
  [null, null, null, null],
  [SH_DEATH_S_0, SH_DEATH_S_1, SH_DEATH_S_2, null],
  [SH_DEATH_E_0, SH_DEATH_E_1, SH_DEATH_E_2, null],
  [SH_DEATH_N_0, SH_DEATH_N_1, SH_DEATH_N_2, null],
  [SH_ATK_S_0, SH_ATK_S_1, SH_ATK_S_2, SH_ATK_S_3],
  [SH_ATK_E_0, SH_ATK_E_1, SH_ATK_E_2, SH_ATK_E_3],
  [SH_ATK_N_0, SH_ATK_N_1, SH_ATK_N_2, SH_ATK_N_3],
]

// ============================================================================
// CHARGER — big bald brute with fists (dark red)
// ============================================================================

const CH: Record<string, RGBA> = {
  'o': [30, 22, 16, 255],
  's': [200, 155, 110, 255],    // skin (tanned)
  'S': [165, 120, 80, 255],
  'e': [35, 28, 22, 255],
  'c': [160, 30, 20, 255],      // shirt (dark red)
  'C': [120, 18, 12, 255],      // shirt shadow
  'w': [190, 175, 160, 255],
  'k': [165, 140, 60, 255],
  'p': [70, 50, 30, 255],
  'P': [48, 34, 20, 255],
  't': [42, 30, 18, 255],
  'f': [200, 155, 110, 255],    // fist (same as skin)
  'F': [165, 120, 80, 255],    // fist shadow
}

const CH_IDLE_S_0: Pat = [
  '    ooooo     ',
  '   oSSSSso    ',
  '   oSSSSso    ',
  '   oeSeSeo    ',
  '   osSSSso    ',
  '    oSSo      ',
  '   occcccco   ',
  '  occccccco   ',
  '  ccccccccc   ',
  '  oCCkkCCCo   ',
  '  oCCCCCCCo   ',
  '    opppo     ',
  '   opPPPpo    ',
  '   opp ppo    ',
  '   op   po    ',
  '   ot   to    ',
  '   ot   to    ',
]
const CH_IDLE_S_1 = shiftDown(CH_IDLE_S_0, 1)

const CH_WALK_S_0: Pat = [
  '    ooooo     ',
  '   oSSSSso    ',
  '   oSSSSso    ',
  '   oeSeSeo    ',
  '   osSSSso    ',
  '    oSSo      ',
  '   occcccco   ',
  '  occccccco   ',
  '  ccccccccc   ',
  '  oCCkkCCCo   ',
  '  oCCCCCCCo   ',
  '    opppo     ',
  '   opPPpo     ',
  '   op   po    ',
  '    po  pp    ',
  '    to   to   ',
  '    to   to   ',
]
const CH_WALK_S_1 = CH_IDLE_S_0
const CH_WALK_S_2 = flipH(CH_WALK_S_0)
const CH_WALK_S_3 = CH_IDLE_S_0

const CH_DEATH_S_0 = CH_IDLE_S_0
const CH_DEATH_S_1: Pat = [
  '              ',
  '              ',
  '              ',
  '    ooooo     ',
  '   oSSSSso    ',
  '   oSSSSso    ',
  '   oeSeSeo    ',
  '   osSSSso    ',
  '    oSSo      ',
  '   occccccoo  ',
  '  occcccccCo  ',
  '  ccccccCCo   ',
  '  oCCkkCCo    ',
  '  oCCCCCCo    ',
  '    oppppppo  ',
  '    otttto    ',
  '              ',
]
const CH_DEATH_S_2: Pat = [
  '              ',
  '              ',
  '              ',
  '              ',
  '              ',
  '              ',
  '              ',
  '              ',
  '              ',
  '              ',
  '   ooooo      ',
  '  oSSSSso     ',
  '  oSSsSccco   ',
  '  osSccccco   ',
  '  oCCCCppppo  ',
  '   otttttto   ',
  '              ',
]

const CH_ATK_S_0 = CH_IDLE_S_0
const CH_ATK_S_1: Pat = [
  '    ooooo     ',
  '   oSSSSso    ',
  '   oSSSSso    ',
  '   oeSeSeo    ',
  '   osSSSso    ',
  '    oSSo      ',
  '  foccccccof  ',
  '  Foccccccof  ',
  '  ccccccccc   ',
  '  oCCkkCCCo   ',
  '  oCCCCCCCo   ',
  '    opppo     ',
  '   opPPPpo    ',
  '   opp ppo    ',
  '   op   po    ',
  '   ot   to    ',
  '   ot   to    ',
]
const CH_ATK_S_2: Pat = [
  '    ooooo     ',
  '   oSSSSso    ',
  '   oSSSSso    ',
  '   oeSeSeo    ',
  '   osSSSso    ',
  '    oSSo      ',
  ' fFoccccccofF ',
  '  occccccco   ',
  '  ccccccccc   ',
  '  oCCkkCCCo   ',
  '  oCCCCCCCo   ',
  '    opppo     ',
  '   opPPPpo    ',
  '   opp ppo    ',
  '   op   po    ',
  '   ot   to    ',
  '   ot   to    ',
]
const CH_ATK_S_3 = CH_ATK_S_1

// Charger East
const CH_IDLE_E_0: Pat = [
  '   ooooo      ',
  '  oSSSSo      ',
  '  oSSSSo      ',
  '  oeSeSo      ',
  '  osSSSo      ',
  '   oSo        ',
  '  occccco     ',
  '  occccco     ',
  '  cccccc      ',
  '  oCkkCo      ',
  '  oCCCCo      ',
  '   oppo       ',
  '  opPPpo      ',
  '  opp po      ',
  '  op  po      ',
  '  ot  to      ',
  '  ot  to      ',
]
const CH_IDLE_E_1 = shiftDown(CH_IDLE_E_0, 1)
const CH_WALK_E_0: Pat = [
  '   ooooo      ',
  '  oSSSSo      ',
  '  oSSSSo      ',
  '  oeSeSo      ',
  '  osSSSo      ',
  '   oSo        ',
  '  occccco     ',
  '  occccco     ',
  '  cccccc      ',
  '  oCkkCo      ',
  '  oCCCCo      ',
  '   oppo       ',
  '  opPpo       ',
  '   po po      ',
  '   to  to     ',
  '   to  to     ',
  '              ',
]
const CH_WALK_E_1 = CH_IDLE_E_0
const CH_WALK_E_2 = flipH(CH_WALK_E_0)
const CH_WALK_E_3 = CH_IDLE_E_0
const CH_DEATH_E_0 = CH_DEATH_S_0
const CH_DEATH_E_1 = CH_DEATH_S_1
const CH_DEATH_E_2 = CH_DEATH_S_2
const CH_ATK_E_0 = CH_IDLE_E_0
const CH_ATK_E_1: Pat = [
  '   ooooo      ',
  '  oSSSSo      ',
  '  oSSSSo      ',
  '  oeSeSo      ',
  '  osSSSo      ',
  '   oSo        ',
  '  occccco     ',
  '  occcccofo   ',
  '  cccccc      ',
  '  oCkkCo      ',
  '  oCCCCo      ',
  '   oppo       ',
  '  opPPpo      ',
  '  opp po      ',
  '  op  po      ',
  '  ot  to      ',
  '  ot  to      ',
]
const CH_ATK_E_2: Pat = [
  '   ooooo      ',
  '  oSSSSo      ',
  '  oSSSSo      ',
  '  oeSeSo      ',
  '  osSSSo      ',
  '   oSo        ',
  '  occccco     ',
  '  occcccofFo  ',
  '  cccccc      ',
  '  oCkkCo      ',
  '  oCCCCo      ',
  '   oppo       ',
  '  opPPpo      ',
  '  opp po      ',
  '  op  po      ',
  '  ot  to      ',
  '  ot  to      ',
]
const CH_ATK_E_3 = CH_ATK_E_1

// Charger North
const CH_IDLE_N_0: Pat = [
  '    ooooo     ',
  '   oSSSSso    ',
  '   oSSSSso    ',
  '   oSSSSso    ',
  '   oSSSSo     ',
  '    oSo       ',
  '   oCCCCCCo   ',
  '  oCCCCCCCo   ',
  '  CCCCCCCCC   ',
  '  oCCkkCCCo   ',
  '  oCCCCCCCo   ',
  '    opppo     ',
  '   opPPPpo    ',
  '   opp ppo    ',
  '   op   po    ',
  '   ot   to    ',
  '   ot   to    ',
]
const CH_IDLE_N_1 = shiftDown(CH_IDLE_N_0, 1)
const CH_WALK_N_0: Pat = [
  '    ooooo     ',
  '   oSSSSso    ',
  '   oSSSSso    ',
  '   oSSSSso    ',
  '   oSSSSo     ',
  '    oSo       ',
  '   oCCCCCCo   ',
  '  oCCCCCCCo   ',
  '  CCCCCCCCC   ',
  '  oCCkkCCCo   ',
  '  oCCCCCCCo   ',
  '    opppo     ',
  '   opPPpo     ',
  '   op   po    ',
  '    po  pp    ',
  '    to   to   ',
  '    to   to   ',
]
const CH_WALK_N_1 = CH_IDLE_N_0
const CH_WALK_N_2 = flipH(CH_WALK_N_0)
const CH_WALK_N_3 = CH_IDLE_N_0
const CH_DEATH_N_0 = CH_DEATH_S_0
const CH_DEATH_N_1 = CH_DEATH_S_1
const CH_DEATH_N_2 = CH_DEATH_S_2
const CH_ATK_N_0 = CH_IDLE_N_0
const CH_ATK_N_1 = replaceChars(CH_ATK_S_1, {'s':'S','e':'S','c':'C','f':'F'})
const CH_ATK_N_2 = replaceChars(CH_ATK_S_2, {'s':'S','e':'S','c':'C','f':'F'})
const CH_ATK_N_3 = CH_ATK_N_1

const chargerGrid: FrameGrid = [
  [CH_IDLE_S_0, CH_IDLE_S_1, null, null],
  [CH_IDLE_E_0, CH_IDLE_E_1, null, null],
  [CH_IDLE_N_0, CH_IDLE_N_1, null, null],
  [CH_WALK_S_0, CH_WALK_S_1, CH_WALK_S_2, CH_WALK_S_3],
  [CH_WALK_E_0, CH_WALK_E_1, CH_WALK_E_2, CH_WALK_E_3],
  [CH_WALK_N_0, CH_WALK_N_1, CH_WALK_N_2, CH_WALK_N_3],
  [null, null, null, null],
  [null, null, null, null],
  [null, null, null, null],
  [CH_DEATH_S_0, CH_DEATH_S_1, CH_DEATH_S_2, null],
  [CH_DEATH_E_0, CH_DEATH_E_1, CH_DEATH_E_2, null],
  [CH_DEATH_N_0, CH_DEATH_N_1, CH_DEATH_N_2, null],
  [CH_ATK_S_0, CH_ATK_S_1, CH_ATK_S_2, CH_ATK_S_3],
  [CH_ATK_E_0, CH_ATK_E_1, CH_ATK_E_2, CH_ATK_E_3],
  [CH_ATK_N_0, CH_ATK_N_1, CH_ATK_N_2, CH_ATK_N_3],
]

// ============================================================================
// RUNNER — thin courier (bright cyan)
// ============================================================================

const RN: Record<string, RGBA> = {
  'o': [20, 50, 55, 255],       // outline (dark teal)
  'h': [50, 170, 200, 255],     // cap
  'H': [70, 200, 230, 255],     // cap light
  's': [225, 178, 128, 255],
  'S': [188, 140, 95, 255],
  'e': [35, 28, 22, 255],
  'c': [60, 190, 215, 255],     // shirt (cyan)
  'C': [40, 150, 175, 255],     // shirt shadow
  'b': [110, 75, 40, 255],      // bag strap
  'B': [140, 95, 50, 255],      // bag
  'p': [75, 65, 55, 255],       // pants
  'P': [55, 45, 38, 255],
  't': [42, 35, 25, 255],
}

const RN_IDLE_S_0: Pat = [
  '  ooo   ',
  ' oHHHo  ',
  ' ohhho  ',
  '  oso   ',
  '  oeso  ',
  ' ocbco  ',
  ' occco  ',
  ' oCBco  ',
  '  oppo  ',
  ' opPpo  ',
  ' op po  ',
  ' ot to  ',
]
const RN_IDLE_S_1 = shiftDown(RN_IDLE_S_0, 1)

const RN_WALK_S_0: Pat = [
  '  ooo   ',
  ' oHHHo  ',
  ' ohhho  ',
  '  oso   ',
  '  oeso  ',
  ' ocbco  ',
  ' occco  ',
  ' oCBco  ',
  '  oppo  ',
  ' opPo   ',
  '  po po ',
  '  to to ',
]
const RN_WALK_S_1 = RN_IDLE_S_0
const RN_WALK_S_2 = flipH(RN_WALK_S_0)
const RN_WALK_S_3 = RN_IDLE_S_0

const RN_DEATH_S_0 = RN_IDLE_S_0
const RN_DEATH_S_1: Pat = [
  '        ',
  '        ',
  '  ooo   ',
  ' oHHHo  ',
  ' ohhho  ',
  '  oso   ',
  '  oeso  ',
  ' ocbco  ',
  ' occBo  ',
  ' oCCo   ',
  '  opppo ',
  '  ottto ',
]
const RN_DEATH_S_2: Pat = [
  '        ',
  '        ',
  '        ',
  '        ',
  '        ',
  '        ',
  '        ',
  ' ooo    ',
  ' ohhso  ',
  ' oscco  ',
  ' ocBppo ',
  '  ottto ',
]

const RN_ATK_S_0 = RN_IDLE_S_0
const RN_ATK_S_1 = RN_WALK_S_0
const RN_ATK_S_2 = RN_WALK_S_2
const RN_ATK_S_3 = RN_IDLE_S_0

// Runner East
const RN_IDLE_E_0: Pat = [
  '  ooo   ',
  ' oHHo   ',
  ' ohho   ',
  '  oso   ',
  '  oeo   ',
  ' ocbco  ',
  ' occo   ',
  ' oCBo   ',
  '  opo   ',
  ' opPo   ',
  ' op po  ',
  ' ot to  ',
]
const RN_IDLE_E_1 = shiftDown(RN_IDLE_E_0, 1)
const RN_WALK_E_0: Pat = [
  '  ooo   ',
  ' oHHo   ',
  ' ohho   ',
  '  oso   ',
  '  oeo   ',
  ' ocbco  ',
  ' occo   ',
  ' oCBo   ',
  '  opo   ',
  ' opPo   ',
  '  po po ',
  '  to to ',
]
const RN_WALK_E_1 = RN_IDLE_E_0
const RN_WALK_E_2 = flipH(RN_WALK_E_0)
const RN_WALK_E_3 = RN_IDLE_E_0
const RN_DEATH_E_0 = RN_DEATH_S_0
const RN_DEATH_E_1 = RN_DEATH_S_1
const RN_DEATH_E_2 = RN_DEATH_S_2
const RN_ATK_E_0 = RN_IDLE_E_0
const RN_ATK_E_1 = RN_WALK_E_0
const RN_ATK_E_2 = RN_WALK_E_2
const RN_ATK_E_3 = RN_IDLE_E_0

// Runner North
const RN_IDLE_N_0: Pat = [
  '  ooo   ',
  ' ohhho  ',
  ' ohhho  ',
  '  oSo   ',
  '  oSo   ',
  ' oCbCo  ',
  ' oCCo   ',
  ' oCBo   ',
  '  oppo  ',
  ' opPpo  ',
  ' op po  ',
  ' ot to  ',
]
const RN_IDLE_N_1 = shiftDown(RN_IDLE_N_0, 1)
const RN_WALK_N_0: Pat = [
  '  ooo   ',
  ' ohhho  ',
  ' ohhho  ',
  '  oSo   ',
  '  oSo   ',
  ' oCbCo  ',
  ' oCCo   ',
  ' oCBo   ',
  '  oppo  ',
  ' opPo   ',
  '  po po ',
  '  to to ',
]
const RN_WALK_N_1 = RN_IDLE_N_0
const RN_WALK_N_2 = flipH(RN_WALK_N_0)
const RN_WALK_N_3 = RN_IDLE_N_0
const RN_DEATH_N_0 = RN_DEATH_S_0
const RN_DEATH_N_1 = RN_DEATH_S_1
const RN_DEATH_N_2 = RN_DEATH_S_2
const RN_ATK_N_0 = RN_IDLE_N_0
const RN_ATK_N_1 = RN_WALK_N_0
const RN_ATK_N_2 = RN_WALK_N_2
const RN_ATK_N_3 = RN_IDLE_N_0

const runnerGrid: FrameGrid = [
  [RN_IDLE_S_0, RN_IDLE_S_1, null, null],
  [RN_IDLE_E_0, RN_IDLE_E_1, null, null],
  [RN_IDLE_N_0, RN_IDLE_N_1, null, null],
  [RN_WALK_S_0, RN_WALK_S_1, RN_WALK_S_2, RN_WALK_S_3],
  [RN_WALK_E_0, RN_WALK_E_1, RN_WALK_E_2, RN_WALK_E_3],
  [RN_WALK_N_0, RN_WALK_N_1, RN_WALK_N_2, RN_WALK_N_3],
  [null, null, null, null],
  [null, null, null, null],
  [null, null, null, null],
  [RN_DEATH_S_0, RN_DEATH_S_1, RN_DEATH_S_2, null],
  [RN_DEATH_E_0, RN_DEATH_E_1, RN_DEATH_E_2, null],
  [RN_DEATH_N_0, RN_DEATH_N_1, RN_DEATH_N_2, null],
  [RN_ATK_S_0, RN_ATK_S_1, RN_ATK_S_2, RN_ATK_S_3],
  [RN_ATK_E_0, RN_ATK_E_1, RN_ATK_E_2, RN_ATK_E_3],
  [RN_ATK_N_0, RN_ATK_N_1, RN_ATK_N_2, RN_ATK_N_3],
]

// ============================================================================
// DUELIST — fancy pistolero with saber (amber/gold)
// ============================================================================

const DU: Record<string, RGBA> = {
  'o': [30, 22, 16, 255],
  'h': [170, 130, 40, 255],    // hat (gold)
  'H': [210, 165, 55, 255],    // hat light
  'F': [130, 95, 25, 255],     // hat band
  's': [225, 178, 128, 255],
  'S': [188, 140, 95, 255],
  'e': [35, 28, 22, 255],
  'c': [180, 135, 45, 255],    // coat (amber)
  'C': [140, 100, 30, 255],    // coat shadow
  'w': [215, 205, 185, 255],
  'W': [180, 170, 150, 255],
  'k': [200, 180, 80, 255],    // buckle (gold)
  'p': [82, 58, 34, 255],
  'P': [58, 40, 24, 255],
  't': [42, 30, 18, 255],
  'g': [190, 195, 210, 255],   // saber blade
  'G': [150, 155, 170, 255],   // saber dark
  'r': [110, 70, 35, 255],     // saber handle
  'a': [90, 60, 30, 255],      // hair/mustache
}

const DU_IDLE_S_0: Pat = [
  '    oooooo   ',
  '   oHHHHHHo  ',
  '   ohHHHhho  ',
  '  oFFFFFFfo  ',
  '   osSsSso   ',
  '   seSeSss   ',
  '    oaao     ',
  '    osso     ',
  '   occccco   ',
  '   cwwwwcc   ',
  '   cWkkWcc   ',
  '   oCCCCco   ',
  '   occccco   ',
  '    oppo     ',
  '   opPPpo    ',
  '   op  po    ',
  '   ot  to    ',
  '   ot  to    ',
]
const DU_IDLE_S_1 = shiftDown(DU_IDLE_S_0, 1)

const DU_WALK_S_0: Pat = [
  '    oooooo   ',
  '   oHHHHHHo  ',
  '   ohHHHhho  ',
  '  oFFFFFFfo  ',
  '   osSsSso   ',
  '   seSeSss   ',
  '    oaao     ',
  '    osso     ',
  '   occccco   ',
  '   cwwwwcc   ',
  '   cWkkWcc   ',
  '   oCCCCco   ',
  '   occccco   ',
  '    oppo     ',
  '   opPpo     ',
  '   op  po    ',
  '    to to    ',
  '    to to    ',
]
const DU_WALK_S_1 = DU_IDLE_S_0
const DU_WALK_S_2 = flipH(DU_WALK_S_0)
const DU_WALK_S_3 = DU_IDLE_S_0

const DU_DEATH_S_0 = DU_IDLE_S_0
const DU_DEATH_S_1: Pat = [
  '             ',
  '             ',
  '             ',
  '             ',
  '    oooooo   ',
  '   oHHHHHHo  ',
  '   ohHHHhho  ',
  '  oFFFFFFfo  ',
  '   osSsSso   ',
  '   seSeSss   ',
  '    oaao     ',
  '    osso     ',
  '   occcccoo  ',
  '   cwwwwcCo  ',
  '   cWkkWCo   ',
  '   oCCCCo    ',
  '    opppppo  ',
  '    otttto   ',
]
const DU_DEATH_S_2: Pat = [
  '             ',
  '             ',
  '             ',
  '             ',
  '             ',
  '             ',
  '             ',
  '             ',
  '             ',
  '             ',
  '             ',
  '   oooooo    ',
  '  oHHHHHHo   ',
  '  oFFFFsso   ',
  '  osSsccco   ',
  '  occwwccco  ',
  '  oCCpppppo  ',
  '   otttto    ',
]

const DU_ATK_S_0 = DU_IDLE_S_0
const DU_ATK_S_1: Pat = [
  '    oooooo   ',
  '   oHHHHHHo  ',
  '   ohHHHhho  ',
  '  oFFFFFFfo  ',
  '   osSsSso   ',
  '   seSeSss   ',
  '    oaao     ',
  '    osso     ',
  '  goccccco   ',
  '  Gcwwwwcc   ',
  '   cWkkWcc   ',
  '   oCCCCco   ',
  '   occccco   ',
  '    oppo     ',
  '   opPPpo    ',
  '   op  po    ',
  '   ot  to    ',
  '   ot  to    ',
]
const DU_ATK_S_2: Pat = [
  '    oooooo   ',
  '   oHHHHHHo  ',
  '   ohHHHhho  ',
  '  oFFFFFFfo  ',
  '   osSsSso   ',
  '   seSeSss   ',
  '    oaao     ',
  '    osso     ',
  'rgoccccco    ',
  '  cwwwwcc    ',
  '   cWkkWcc   ',
  '   oCCCCco   ',
  '   occccco   ',
  '    oppo     ',
  '   opPPpo    ',
  '   op  po    ',
  '   ot  to    ',
  '   ot  to    ',
]
const DU_ATK_S_3 = DU_ATK_S_1

// Duelist East
const DU_IDLE_E_0: Pat = [
  '   ooooo     ',
  '  oHHHHHo    ',
  '  ohHHhho    ',
  '  oFFFFo     ',
  '   osSso     ',
  '   seSso     ',
  '    oao      ',
  '    oso      ',
  '  occcco     ',
  '  cwwco      ',
  '  ckWco      ',
  '  oCCCo      ',
  '  occcco     ',
  '   oppo      ',
  '  opPpo      ',
  '  op po      ',
  '  ot to      ',
  '  ot to      ',
]
const DU_IDLE_E_1 = shiftDown(DU_IDLE_E_0, 1)
const DU_WALK_E_0: Pat = [
  '   ooooo     ',
  '  oHHHHHo    ',
  '  ohHHhho    ',
  '  oFFFFo     ',
  '   osSso     ',
  '   seSso     ',
  '    oao      ',
  '    oso      ',
  '  occcco     ',
  '  cwwco      ',
  '  ckWco      ',
  '  oCCCo      ',
  '  occcco     ',
  '   oppo      ',
  '  opPo       ',
  '   po po     ',
  '   to  to    ',
  '   to  to    ',
]
const DU_WALK_E_1 = DU_IDLE_E_0
const DU_WALK_E_2 = flipH(DU_WALK_E_0)
const DU_WALK_E_3 = DU_IDLE_E_0
const DU_DEATH_E_0 = DU_DEATH_S_0
const DU_DEATH_E_1 = DU_DEATH_S_1
const DU_DEATH_E_2 = DU_DEATH_S_2
const DU_ATK_E_0 = DU_IDLE_E_0
const DU_ATK_E_1: Pat = [
  '   ooooo     ',
  '  oHHHHHo    ',
  '  ohHHhho    ',
  '  oFFFFo     ',
  '   osSso     ',
  '   seSso     ',
  '    oao      ',
  '    oso      ',
  '  occccoGg   ',
  '  cwwco      ',
  '  ckWco      ',
  '  oCCCo      ',
  '  occcco     ',
  '   oppo      ',
  '  opPpo      ',
  '  op po      ',
  '  ot to      ',
  '  ot to      ',
]
const DU_ATK_E_2: Pat = [
  '   ooooo     ',
  '  oHHHHHo    ',
  '  ohHHhho    ',
  '  oFFFFo     ',
  '   osSso     ',
  '   seSso     ',
  '    oao      ',
  '    oso      ',
  '  occccoGggr ',
  '  cwwco      ',
  '  ckWco      ',
  '  oCCCo      ',
  '  occcco     ',
  '   oppo      ',
  '  opPpo      ',
  '  op po      ',
  '  ot to      ',
  '  ot to      ',
]
const DU_ATK_E_3 = DU_ATK_E_1

// Duelist North
const DU_IDLE_N_0: Pat = [
  '    oooooo   ',
  '   ohhhhhho  ',
  '   ohhhhhho  ',
  '  ohhhhhho   ',
  '   oSSSso    ',
  '   oaaSso    ',
  '    oSo      ',
  '    oSo      ',
  '   oCCCCCo   ',
  '   CCCCCCCc  ',
  '   CCkkCCCc  ',
  '   oCCCCCo   ',
  '   oCCCCCo   ',
  '    oppo     ',
  '   opPPpo    ',
  '   op  po    ',
  '   ot  to    ',
  '   ot  to    ',
]
const DU_IDLE_N_1 = shiftDown(DU_IDLE_N_0, 1)
const DU_WALK_N_0: Pat = [
  '    oooooo   ',
  '   ohhhhhho  ',
  '   ohhhhhho  ',
  '  ohhhhhho   ',
  '   oSSSso    ',
  '   oaaSso    ',
  '    oSo      ',
  '    oSo      ',
  '   oCCCCCo   ',
  '   CCCCCCCc  ',
  '   CCkkCCCc  ',
  '   oCCCCCo   ',
  '   oCCCCCo   ',
  '    oppo     ',
  '   opPpo     ',
  '   op  po    ',
  '    to to    ',
  '    to to    ',
]
const DU_WALK_N_1 = DU_IDLE_N_0
const DU_WALK_N_2 = flipH(DU_WALK_N_0)
const DU_WALK_N_3 = DU_IDLE_N_0
const DU_DEATH_N_0 = DU_DEATH_S_0
const DU_DEATH_N_1 = DU_DEATH_S_1
const DU_DEATH_N_2 = DU_DEATH_S_2
const DU_ATK_N_0 = DU_IDLE_N_0
const DU_ATK_N_1 = replaceChars(DU_ATK_S_1, {'s':'S','e':'S','a':'S','c':'C','w':'C','W':'C'})
const DU_ATK_N_2 = replaceChars(DU_ATK_S_2, {'s':'S','e':'S','a':'S','c':'C','w':'C','W':'C'})
const DU_ATK_N_3 = DU_ATK_N_1

const duelistGrid: FrameGrid = [
  [DU_IDLE_S_0, DU_IDLE_S_1, null, null],
  [DU_IDLE_E_0, DU_IDLE_E_1, null, null],
  [DU_IDLE_N_0, DU_IDLE_N_1, null, null],
  [DU_WALK_S_0, DU_WALK_S_1, DU_WALK_S_2, DU_WALK_S_3],
  [DU_WALK_E_0, DU_WALK_E_1, DU_WALK_E_2, DU_WALK_E_3],
  [DU_WALK_N_0, DU_WALK_N_1, DU_WALK_N_2, DU_WALK_N_3],
  [null, null, null, null],
  [null, null, null, null],
  [null, null, null, null],
  [DU_DEATH_S_0, DU_DEATH_S_1, DU_DEATH_S_2, null],
  [DU_DEATH_E_0, DU_DEATH_E_1, DU_DEATH_E_2, null],
  [DU_DEATH_N_0, DU_DEATH_N_1, DU_DEATH_N_2, null],
  [DU_ATK_S_0, DU_ATK_S_1, DU_ATK_S_2, DU_ATK_S_3],
  [DU_ATK_E_0, DU_ATK_E_1, DU_ATK_E_2, DU_ATK_E_3],
  [DU_ATK_N_0, DU_ATK_N_1, DU_ATK_N_2, DU_ATK_N_3],
]

// ============================================================================
// Generate all sprites
// ============================================================================

await writeSheet('swarmer', swarmerGrid, SW)
await writeSheet('grunt', gruntGrid, GR)
await writeSheet('shooter', shooterGrid, SH)
await writeSheet('charger', chargerGrid, CH)
await writeSheet('runner', runnerGrid, RN)
await writeSheet('duelist', duelistGrid, DU)

console.log('done — 6 enemy sprite sheets generated')
