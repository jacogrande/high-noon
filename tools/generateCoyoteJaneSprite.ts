/**
 * Coyote Jane Sprite Sheet Generator
 *
 * Generates a 128x480 PNG sprite sheet (32x32 cells, 15 rows x 4 cols):
 *   - coyote_jane.png — lean huntress in rawhide duster, wide-brimmed hat, bolt-action rifle
 *
 * Row layout (same as all enemy sheets):
 *   0-2:   idle  S/E/N (2 frames)
 *   3-5:   walk  S/E/N (4 frames)
 *   6-8:   reserved
 *   9-11:  death S/E/N (3 frames)
 *   12-14: attack S/E/N (4 frames)
 *
 * Run: bun run tools/generateCoyoteJaneSprite.ts
 */

import { deflateSync } from 'node:zlib'

const CELL = 32
const COLS = 4
const ROWS = 15
const WIDTH = CELL * COLS   // 128
const HEIGHT = CELL * ROWS  // 480

// ============================================================================
// Minimal PNG encoder
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
// COYOTE JANE — Lean huntress, rawhide duster, wide hat, bolt-action rifle
// ============================================================================

// Palette:
//   o = dark outline
//   h = dark brown hat         H = hat highlight
//   s = skin                   S = skin shadow
//   e = eyes
//   d = duster coat (rawhide)  D = duster shadow
//   c = shirt (muted green)    C = shirt shadow
//   p = pants                  P = pants shadow
//   t = boots
//   r = rifle barrel (metal)   R = rifle stock (wood)
//   w = rifle wood accent
//   m = muzzle flash           M = muzzle flash bright
//   k = belt buckle

const CJ: Record<string, RGBA> = {
  'o': [30, 22, 16, 255],        // dark outline
  'h': [75, 50, 25, 255],        // dark brown hat
  'H': [100, 70, 35, 255],       // hat highlight
  's': [215, 175, 128, 255],     // skin
  'S': [180, 140, 95, 255],      // skin shadow
  'e': [35, 28, 22, 255],        // eyes
  'd': [139, 90, 43, 255],       // duster coat (rawhide brown)
  'D': [100, 65, 30, 255],       // duster shadow
  'c': [120, 130, 85, 255],      // shirt (muted green)
  'C': [90, 100, 60, 255],       // shirt shadow
  'p': [60, 50, 40, 255],        // pants
  'P': [45, 35, 25, 255],        // pants shadow
  't': [42, 30, 18, 255],        // boots
  'r': [140, 140, 150, 255],     // rifle barrel (metal)
  'R': [85, 55, 30, 255],        // rifle stock
  'w': [110, 75, 40, 255],       // rifle wood
  'k': [165, 140, 60, 255],      // belt buckle
  'm': [255, 225, 110, 255],     // muzzle flash
  'M': [255, 255, 200, 255],     // muzzle flash bright
}

// ============================================================================
// South-facing (front view) — lean feminine build, wide-brimmed hat, duster
// ~14 wide, ~19 tall
// ============================================================================

const CJ_IDLE_S_0: Pat = [
  '   oooooooo    ',
  '  oHHHHHHHHo   ',
  '  ohHHHHHhho   ',
  '  ohhhhhhho    ',
  '    osSsSo     ',
  '    seSeSs     ',
  '     osso      ',
  '     osso      ',
  '   oddccddo    ',
  '   dcccccdd    ',
  '   dckkcdd     ',
  '   oDDDDDo     ',
  '   oddddddo    ',
  '    opppo      ',
  '   opPPPpo     ',
  '   op  ppo     ',
  '   op  ppo     ',
  '   ot  tto     ',
  '   ot  tto     ',
]

const CJ_IDLE_S_1 = shiftDown(CJ_IDLE_S_0, 1)

// Walk S — 4-frame cycle
const CJ_WALK_S_0: Pat = [
  '   oooooooo    ',
  '  oHHHHHHHHo   ',
  '  ohHHHHHhho   ',
  '  ohhhhhhho    ',
  '    osSsSo     ',
  '    seSeSs     ',
  '     osso      ',
  '     osso      ',
  '   oddccddo    ',
  '   dcccccdd    ',
  '   dckkcdd     ',
  '   oDDDDDo     ',
  '   oddddddo    ',
  '    opppo      ',
  '   opPPpo      ',
  '   op  po      ',
  '    po pp      ',
  '    to  to     ',
  '    to  to     ',
]

const CJ_WALK_S_1 = CJ_IDLE_S_0
const CJ_WALK_S_2 = flipH(CJ_WALK_S_0)
const CJ_WALK_S_3 = CJ_IDLE_S_0

// Death S — 3 frames
const CJ_DEATH_S_0: Pat = [
  '    oooooooo   ',
  '   oHHHHHHHHo  ',
  '   ohHHHHHhho  ',
  '   ohhhhhhho   ',
  '     osSsSo    ',
  '     seSeSs    ',
  '      osso     ',
  '      osso     ',
  '    oddccddo   ',
  '    dcccccdd   ',
  '    dckkcdd    ',
  '    oDDDDDo    ',
  '    oddddddo   ',
  '     opppo     ',
  '    opPPPpo    ',
  '    op  ppo    ',
  '    op  ppo    ',
  '    ot  tto    ',
  '    ot  tto    ',
]

const CJ_DEATH_S_1: Pat = [
  '               ',
  '               ',
  '               ',
  '               ',
  '   oooooooo    ',
  '  oHHHHHHHHo   ',
  '  ohHHHHHhho   ',
  '  ohhhhhhho    ',
  '    osSsSo     ',
  '    seSeSs     ',
  '     osso      ',
  '     osso      ',
  '   oddccddoo   ',
  '   dcccccdDo   ',
  '   dckkcDo     ',
  '   oDDDDo      ',
  '    oppppppo   ',
  '    ottttto    ',
  '               ',
]

const CJ_DEATH_S_2: Pat = [
  '               ',
  '               ',
  '               ',
  '               ',
  '               ',
  '               ',
  '               ',
  '               ',
  '               ',
  '               ',
  '               ',
  '  oooooooo     ',
  '  oHHHHHHHo    ',
  '  ohhhhssSo    ',
  '  ossdddcco    ',
  '  oddcccddo    ',
  '  oDDDppppo    ',
  '   ottttto     ',
  '               ',
]

// Attack S — 4 frames: idle, aim rifle, fire, follow-through
const CJ_ATK_S_0 = CJ_IDLE_S_0

const CJ_ATK_S_1: Pat = [
  '   oooooooo    ',
  '  oHHHHHHHHo   ',
  '  ohHHHHHhho   ',
  '  ohhhhhhho    ',
  '    osSsSo     ',
  '    seSeSs     ',
  '     osso      ',
  '     osso      ',
  '  Roddccddo    ',
  '  wdcccccdd    ',
  '   dckkcdd     ',
  '   oDDDDDo     ',
  '   oddddddo    ',
  '    opppo      ',
  '   opPPPpo     ',
  '   op  ppo     ',
  '   op  ppo     ',
  '   ot  tto     ',
  '   ot  tto     ',
]

const CJ_ATK_S_2: Pat = [
  '   oooooooo    ',
  '  oHHHHHHHHo   ',
  '  ohHHHHHhho   ',
  '  ohhhhhhho    ',
  '    osSsSo     ',
  '    seSeSs     ',
  '     osso      ',
  '     osso      ',
  'mRoddccddo    ',
  'Mwdcccccdd     ',
  '   dckkcdd     ',
  '   oDDDDDo     ',
  '   oddddddo    ',
  '    opppo      ',
  '   opPPPpo     ',
  '   op  ppo     ',
  '   op  ppo     ',
  '   ot  tto     ',
  '   ot  tto     ',
]

const CJ_ATK_S_3 = CJ_ATK_S_1

// ============================================================================
// East-facing (side profile) — narrower, rifle visible at side
// ============================================================================

const CJ_IDLE_E_0: Pat = [
  '   ooooooo     ',
  '  oHHHHHHo     ',
  '  ohHHHhho     ',
  '  ohhhhho      ',
  '    osSo       ',
  '    seSo       ',
  '     oso       ',
  '     oso       ',
  '   oddcdo      ',
  '   dcccdR      ',
  '   dckdo       ',
  '   oDDDo       ',
  '   odddddo     ',
  '    oppo       ',
  '   opPPpo      ',
  '   op po       ',
  '   op po       ',
  '   ot to       ',
  '   ot to       ',
]

const CJ_IDLE_E_1 = shiftDown(CJ_IDLE_E_0, 1)

// Walk E
const CJ_WALK_E_0: Pat = [
  '   ooooooo     ',
  '  oHHHHHHo     ',
  '  ohHHHhho     ',
  '  ohhhhho      ',
  '    osSo       ',
  '    seSo       ',
  '     oso       ',
  '     oso       ',
  '   oddcdo      ',
  '   dcccdR      ',
  '   dckdo       ',
  '   oDDDo       ',
  '   odddddo     ',
  '    oppo       ',
  '   opPpo       ',
  '    po po      ',
  '    to  to     ',
  '    to  to     ',
  '               ',
]

const CJ_WALK_E_1 = CJ_IDLE_E_0
const CJ_WALK_E_2 = flipH(CJ_WALK_E_0)
const CJ_WALK_E_3 = CJ_IDLE_E_0

// Death E — reuse south death
const CJ_DEATH_E_0 = CJ_DEATH_S_0
const CJ_DEATH_E_1 = CJ_DEATH_S_1
const CJ_DEATH_E_2 = CJ_DEATH_S_2

// Attack E — rifle extends right, fire with muzzle flash
const CJ_ATK_E_0 = CJ_IDLE_E_0

const CJ_ATK_E_1: Pat = [
  '   ooooooo     ',
  '  oHHHHHHo     ',
  '  ohHHHhho     ',
  '  ohhhhho      ',
  '    osSo       ',
  '    seSo       ',
  '     oso       ',
  '     oso       ',
  '   oddcdo      ',
  '   dcccdoRwr   ',
  '   dckdo       ',
  '   oDDDo       ',
  '   odddddo     ',
  '    oppo       ',
  '   opPPpo      ',
  '   op po       ',
  '   op po       ',
  '   ot to       ',
  '   ot to       ',
]

const CJ_ATK_E_2: Pat = [
  '   ooooooo     ',
  '  oHHHHHHo     ',
  '  ohHHHhho     ',
  '  ohhhhho      ',
  '    osSo       ',
  '    seSo       ',
  '     oso       ',
  '     oso       ',
  '   oddcdo      ',
  '   dcccdoRwrmM ',
  '   dckdo       ',
  '   oDDDo       ',
  '   odddddo     ',
  '    oppo       ',
  '   opPPpo      ',
  '   op po       ',
  '   op po       ',
  '   ot to       ',
  '   ot to       ',
]

const CJ_ATK_E_3 = CJ_ATK_E_1

// ============================================================================
// North-facing (back view) — see hat, duster back, no face
// ============================================================================

const CJ_IDLE_N_0: Pat = [
  '   oooooooo    ',
  '  ohhhhhhhho   ',
  '  ohhhhhhhho   ',
  '  ohhhhhhho    ',
  '    oSSSo      ',
  '    oSSSo      ',
  '     oSo       ',
  '               ',
  '   oDDDDDDo    ',
  '   DDDDDDDD    ',
  '   DDkkDDDD    ',
  '   oDDDDDo     ',
  '   oddddddo    ',
  '    opppo      ',
  '   opPPPpo     ',
  '   op  ppo     ',
  '   op  ppo     ',
  '   ot  tto     ',
  '   ot  tto     ',
]

const CJ_IDLE_N_1 = shiftDown(CJ_IDLE_N_0, 1)

// Walk N
const CJ_WALK_N_0: Pat = [
  '   oooooooo    ',
  '  ohhhhhhhho   ',
  '  ohhhhhhhho   ',
  '  ohhhhhhho    ',
  '    oSSSo      ',
  '    oSSSo      ',
  '     oSo       ',
  '               ',
  '   oDDDDDDo    ',
  '   DDDDDDDD    ',
  '   DDkkDDDD    ',
  '   oDDDDDo     ',
  '   oddddddo    ',
  '    opppo      ',
  '   opPPpo      ',
  '   op  po      ',
  '    po pp      ',
  '    to  to     ',
  '    to  to     ',
]

const CJ_WALK_N_1 = CJ_IDLE_N_0
const CJ_WALK_N_2 = flipH(CJ_WALK_N_0)
const CJ_WALK_N_3 = CJ_IDLE_N_0

// Death N — reuse south death
const CJ_DEATH_N_0 = CJ_DEATH_S_0
const CJ_DEATH_N_1 = CJ_DEATH_S_1
const CJ_DEATH_N_2 = CJ_DEATH_S_2

// Attack N — derived from S attack with back-view replacements
const CJ_ATK_N_0 = CJ_IDLE_N_0
const CJ_ATK_N_1 = replaceChars(CJ_ATK_S_1, {'s':'S','e':'S','c':'D','d':'D','C':'D'})
const CJ_ATK_N_2 = replaceChars(CJ_ATK_S_2, {'s':'S','e':'S','c':'D','d':'D','C':'D'})
const CJ_ATK_N_3 = CJ_ATK_N_1

// ============================================================================
// Assemble grid
// ============================================================================

const coyoteJaneGrid: FrameGrid = [
  /* 0  idle S  */ [CJ_IDLE_S_0, CJ_IDLE_S_1, null, null],
  /* 1  idle E  */ [CJ_IDLE_E_0, CJ_IDLE_E_1, null, null],
  /* 2  idle N  */ [CJ_IDLE_N_0, CJ_IDLE_N_1, null, null],
  /* 3  walk S  */ [CJ_WALK_S_0, CJ_WALK_S_1, CJ_WALK_S_2, CJ_WALK_S_3],
  /* 4  walk E  */ [CJ_WALK_E_0, CJ_WALK_E_1, CJ_WALK_E_2, CJ_WALK_E_3],
  /* 5  walk N  */ [CJ_WALK_N_0, CJ_WALK_N_1, CJ_WALK_N_2, CJ_WALK_N_3],
  /* 6  resv    */ [null, null, null, null],
  /* 7  resv    */ [null, null, null, null],
  /* 8  resv    */ [null, null, null, null],
  /* 9  death S */ [CJ_DEATH_S_0, CJ_DEATH_S_1, CJ_DEATH_S_2, null],
  /* 10 death E */ [CJ_DEATH_E_0, CJ_DEATH_E_1, CJ_DEATH_E_2, null],
  /* 11 death N */ [CJ_DEATH_N_0, CJ_DEATH_N_1, CJ_DEATH_N_2, null],
  /* 12 atk S   */ [CJ_ATK_S_0, CJ_ATK_S_1, CJ_ATK_S_2, CJ_ATK_S_3],
  /* 13 atk E   */ [CJ_ATK_E_0, CJ_ATK_E_1, CJ_ATK_E_2, CJ_ATK_E_3],
  /* 14 atk N   */ [CJ_ATK_N_0, CJ_ATK_N_1, CJ_ATK_N_2, CJ_ATK_N_3],
]

// ============================================================================
// Generate
// ============================================================================

await writeSheet('coyote_jane', coyoteJaneGrid, CJ)

console.log('done — coyote_jane sprite sheet generated')
