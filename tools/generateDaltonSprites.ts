/**
 * Dalton Boys Sprite Sheet Generator
 *
 * Generates two 128×480 PNG sprite sheets (32×32 cells, 15 rows × 4 cols):
 *   - dalton_emmett.png — Emmett "The Brute" (stocky shotgunner, red bandana)
 *   - dalton_bob.png    — Bob "The Deadeye" (lean marksman, long duster)
 *
 * Row layout:
 *   0-2:  idle  S/E/N (2 frames)
 *   3-5:  walk  S/E/N (4 frames)
 *   6-8:  reserved
 *   9-11: death S/E/N (3 frames)
 *   12-14: attack S/E/N (4 frames)
 *
 * Run: bun run tools/generateDaltonSprites.ts
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
  // IHDR
  const ihdr = new Uint8Array(13)
  const iv = new DataView(ihdr.buffer)
  iv.setUint32(0, w)
  iv.setUint32(4, h)
  ihdr[8] = 8  // bit depth
  ihdr[9] = 6  // RGBA
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  // Filtered scanlines (filter byte 0 = None)
  const raw = new Uint8Array(h * (1 + w * 4))
  for (let y = 0; y < h; y++) {
    const offset = y * (1 + w * 4)
    raw[offset] = 0 // filter: none
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
  w: number
  h: number

  constructor(w: number, h: number) {
    this.w = w
    this.h = h
    this.data = new Uint8Array(w * h * 4) // all transparent
  }

  set(x: number, y: number, r: number, g: number, b: number, a = 255) {
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return
    const i = (y * this.w + x) * 4
    this.data[i] = r
    this.data[i + 1] = g
    this.data[i + 2] = b
    this.data[i + 3] = a
  }

  /** Draw a pattern (array of strings) using a palette, at (ox, oy) */
  draw(ox: number, oy: number, pattern: string[], pal: Record<string, [number, number, number, number]>) {
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

  /** Copy a 32x32 cell from a frame buffer into this sheet at grid position (col, row) */
  blitCell(col: number, row: number, frame: PixelBuffer) {
    const dx = col * CELL
    const dy = row * CELL
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const si = (y * frame.w + x) * 4
        if (frame.data[si + 3]! === 0) continue
        this.set(dx + x, dy + y, frame.data[si]!, frame.data[si + 1]!, frame.data[si + 2]!, frame.data[si + 3]!)
      }
    }
  }
}

// ============================================================================
// Shared Palette
// ============================================================================

type RGBA = [number, number, number, number]
const P: Record<string, RGBA> = {
  // Outline
  'o': [25, 18, 12, 255],
  // Hat
  'h': [75, 48, 24, 255],
  'H': [105, 70, 35, 255],
  'F': [140, 55, 32, 255],  // hat band
  // Skin
  's': [225, 178, 128, 255],
  'S': [188, 140, 95, 255],
  'e': [35, 28, 22, 255],   // eyes
  // Bandana (Emmett)
  'b': [178, 52, 32, 255],
  'B': [135, 38, 22, 255],
  // Coat / vest (dusty brown 0xcc7733)
  'c': [204, 119, 51, 255],
  'C': [160, 90, 38, 255],
  // Duster (Bob — darker)
  'd': [88, 62, 38, 255],
  'D': [62, 44, 28, 255],
  // Shirt
  'w': [215, 205, 185, 255],
  'W': [180, 170, 150, 255],
  // Pants
  'p': [82, 58, 34, 255],
  'P': [58, 40, 24, 255],
  // Boots
  't': [42, 30, 18, 255],
  // Gun metal
  'g': [135, 135, 148, 255],
  'G': [88, 88, 100, 255],
  // Gun wood
  'r': [130, 82, 38, 255],
  // Belt / buckle
  'k': [165, 140, 60, 255],
  // Muzzle flash
  'm': [255, 225, 110, 255],
  'M': [255, 255, 200, 255],
  // Hair (Bob)
  'a': [110, 75, 40, 255],
}

// ============================================================================
// Frame helpers
// ============================================================================

/** Center a compact pattern into a 32x32 frame and render it */
function renderFrame(pattern: string[], pal: Record<string, RGBA>): PixelBuffer {
  const fb = new PixelBuffer(CELL, CELL)
  const maxW = Math.max(...pattern.map(r => r.length))
  const ox = Math.floor((CELL - maxW) / 2)
  const oy = Math.floor((CELL - pattern.length) / 2)
  fb.draw(ox, oy, pattern, pal)
  return fb
}

/** Horizontal flip a pattern (for deriving directions) */
function flipH(pattern: string[]): string[] {
  return pattern.map(row => row.split('').reverse().join(''))
}

/** Shift pattern down by n rows */
function shiftDown(pattern: string[], n: number): string[] {
  const blank = ' '.repeat(pattern[0]?.length ?? 0)
  const result = [...pattern]
  for (let i = 0; i < n; i++) {
    result.pop()
    result.unshift(blank)
  }
  return result
}

/** Replace chars in pattern */
function replaceChars(pattern: string[], map: Record<string, string>): string[] {
  return pattern.map(row => {
    let r = row
    for (const [from, to] of Object.entries(map)) {
      r = r.split(from).join(to)
    }
    return r
  })
}

// ============================================================================
// EMMETT "THE BRUTE" — Frames
// ============================================================================

// Compact character art (~18 wide, ~22 tall)
// Legend: o=outline h=hat H=hatlight F=hatband s=skin S=skinshadow e=eye
//         b=bandana B=bandanadark c=coat C=coatshadow w=shirt W=shirtshadow
//         p=pants P=pantsdark t=boots g=gunmetal G=gundark k=buckle r=gunwood

const E_IDLE_S_0 = [
  '     ooooo      ',
  '    oHHHHHo     ',
  '    ohHHhho     ',
  '   oFFFFFFfo    ',
  '    osSsSo      ',
  '    seSeSs      ',
  '    oBBBo       ',
  '    obBbo       ',
  '   occccco      ',
  '   cwwwwcc      ',
  '   cWkkWcc      ',
  '   oCCCCco      ',
  '    opppo       ',
  '   opPPPpo      ',
  '   op  ppo      ',
  '   op  ppo      ',
  '   ot  tto      ',
  '   ot  tto      ',
]

const E_IDLE_S_1 = shiftDown(E_IDLE_S_0, 1)

// Walk: legs alternate
const E_WALK_S_0 = [
  '     ooooo      ',
  '    oHHHHHo     ',
  '    ohHHhho     ',
  '   oFFFFFFfo    ',
  '    osSsSo      ',
  '    seSeSs      ',
  '    oBBBo       ',
  '    obBbo       ',
  '   occccco      ',
  '   cwwwwcc      ',
  '   cWkkWcc      ',
  '   oCCCCco      ',
  '    opppo       ',
  '   opPPpo       ',
  '   op  po       ',
  '    po pp       ',
  '    to  to      ',
  '    to  to      ',
]

const E_WALK_S_1 = [
  '     ooooo      ',
  '    oHHHHHo     ',
  '    ohHHhho     ',
  '   oFFFFFFfo    ',
  '    osSsSo      ',
  '    seSeSs      ',
  '    oBBBo       ',
  '    obBbo       ',
  '   occccco      ',
  '   cwwwwcc      ',
  '   cWkkWcc      ',
  '   oCCCCco      ',
  '    opppo       ',
  '   opPPPpo      ',
  '   op  ppo      ',
  '   op  ppo      ',
  '   ot  tto      ',
  '   ot  tto      ',
]

const E_WALK_S_2 = [
  '     ooooo      ',
  '    oHHHHHo     ',
  '    ohHHhho     ',
  '   oFFFFFFfo    ',
  '    osSsSo      ',
  '    seSeSs      ',
  '    oBBBo       ',
  '    obBbo       ',
  '   occccco      ',
  '   cwwwwcc      ',
  '   cWkkWcc      ',
  '   oCCCCco      ',
  '    opppo       ',
  '    opPPpo      ',
  '    op  po      ',
  '   pp  op       ',
  '   ot  to       ',
  '   ot  to       ',
]

const E_WALK_S_3 = E_WALK_S_1 // passing position = contact mirror

// Death frames
const E_DEATH_S_0 = [
  '      ooooo     ',
  '     oHHHHHo    ',
  '     ohHHhho    ',
  '    oFFFFFFfo   ',
  '     osSsSo     ',
  '     seSeSs     ',
  '     oBBBo      ',
  '     obBbo      ',
  '    occccco     ',
  '    cwwwwcc     ',
  '    cWkkWcc     ',
  '    oCCCCco     ',
  '     opppo      ',
  '    opPPPpo     ',
  '    op  ppo     ',
  '    op  ppo     ',
  '    ot  tto     ',
  '    ot  tto     ',
]

const E_DEATH_S_1 = [
  '                ',
  '                ',
  '                ',
  '                ',
  '     ooooo      ',
  '    oHHHHHo     ',
  '    ohHHhho     ',
  '   oFFFFFFfo    ',
  '    osSsSo      ',
  '    seSeSs      ',
  '    oBBBo       ',
  '    obBbo       ',
  '   occcccooo    ',
  '   cwwwwccCo    ',
  '   cWkkWcCo     ',
  '   oCCCCoo      ',
  '    oppppppo    ',
  '    ottttto     ',
]

const E_DEATH_S_2 = [
  '                ',
  '                ',
  '                ',
  '                ',
  '                ',
  '                ',
  '                ',
  '                ',
  '                ',
  '                ',
  '    ooooo       ',
  '   oHHHHHo      ',
  '   oFFFFFFo     ',
  '   osSsSsso     ',
  '   obBbccco     ',
  '   occwwccco    ',
  '   oCCpppppo    ',
  '    ottttto     ',
]

// Attack frames (shotgun blast)
const E_ATK_S_0 = [
  '     ooooo      ',
  '    oHHHHHo     ',
  '    ohHHhho     ',
  '   oFFFFFFfo    ',
  '    osSsSo      ',
  '    seSeSs      ',
  '    oBBBo       ',
  '    obBbo       ',
  '   occccco      ',
  '   cwwwwcc      ',
  '   cWkkWcc      ',
  '   oCCCCco      ',
  '    opppo       ',
  '   opPPPpo      ',
  '   op  ppo      ',
  '   op  ppo      ',
  '   ot  tto      ',
  '   ot  tto      ',
]

const E_ATK_S_1 = [
  '     ooooo      ',
  '    oHHHHHo     ',
  '    ohHHhho     ',
  '   oFFFFFFfo    ',
  '    osSsSo      ',
  '    seSeSs      ',
  '    oBBBo       ',
  '    obBbo       ',
  '  goccccco      ',
  '  GcwwwwccGg    ',
  '   cWkkWcc      ',
  '   oCCCCco      ',
  '    opppo       ',
  '   opPPPpo      ',
  '   op  ppo      ',
  '   op  ppo      ',
  '   ot  tto      ',
  '   ot  tto      ',
]

const E_ATK_S_2 = [
  '     ooooo      ',
  '    oHHHHHo     ',
  '    ohHHhho     ',
  '   oFFFFFFfo    ',
  '    osSsSo      ',
  '    seSeSs      ',
  '    oBBBo       ',
  '    obBbo       ',
  ' mgoccccco      ',
  ' MGcwwwwccGg    ',
  '   cWkkWcc      ',
  '   oCCCCco      ',
  '    opppo       ',
  '   opPPPpo      ',
  '   op  ppo      ',
  '   op  ppo      ',
  '   ot  tto      ',
  '   ot  tto      ',
]

const E_ATK_S_3 = E_ATK_S_1 // recoil = back to level

// --- Emmett East (side profile) ---

const E_IDLE_E_0 = [
  '    oooo        ',
  '   oHHHHo       ',
  '   ohHHho       ',
  '   oFFFFo       ',
  '    osSo        ',
  '    seSo        ',
  '    oBBo        ',
  '    obbo        ',
  '   occcco       ',
  '   cwwwco       ',
  '   cWkWco       ',
  '   oCCCco       ',
  '    oppo        ',
  '   opPPpo       ',
  '   op po        ',
  '   op po        ',
  '   ot to        ',
  '   ot to        ',
]

const E_IDLE_E_1 = shiftDown(E_IDLE_E_0, 1)

const E_WALK_E_0 = [
  '    oooo        ',
  '   oHHHHo       ',
  '   ohHHho       ',
  '   oFFFFo       ',
  '    osSo        ',
  '    seSo        ',
  '    oBBo        ',
  '    obbo        ',
  '   occcco       ',
  '   cwwwco       ',
  '   cWkWco       ',
  '   oCCCco       ',
  '    oppo        ',
  '   opPpo        ',
  '    po po       ',
  '    to  to      ',
  '    to  to      ',
  '                ',
]

const E_WALK_E_1 = E_IDLE_E_0
const E_WALK_E_2 = flipH(E_WALK_E_0)
const E_WALK_E_3 = E_IDLE_E_0

const E_DEATH_E_0 = E_DEATH_S_0 // reuse
const E_DEATH_E_1 = E_DEATH_S_1
const E_DEATH_E_2 = E_DEATH_S_2

const E_ATK_E_0 = [
  '    oooo        ',
  '   oHHHHo       ',
  '   ohHHho       ',
  '   oFFFFo       ',
  '    osSo        ',
  '    seSo        ',
  '    oBBo        ',
  '    obbo        ',
  '   occcco       ',
  '   cwwwcoGg     ',
  '   cWkWco       ',
  '   oCCCco       ',
  '    oppo        ',
  '   opPPpo       ',
  '   op po        ',
  '   op po        ',
  '   ot to        ',
  '   ot to        ',
]

const E_ATK_E_1 = [
  '    oooo        ',
  '   oHHHHo       ',
  '   ohHHho       ',
  '   oFFFFo       ',
  '    osSo        ',
  '    seSo        ',
  '    oBBo        ',
  '    obbo        ',
  '   occccoGGg    ',
  '   cwwwcoGGg    ',
  '   cWkWco       ',
  '   oCCCco       ',
  '    oppo        ',
  '   opPPpo       ',
  '   op po        ',
  '   op po        ',
  '   ot to        ',
  '   ot to        ',
]

const E_ATK_E_2 = [
  '    oooo        ',
  '   oHHHHo       ',
  '   ohHHho       ',
  '   oFFFFo       ',
  '    osSo        ',
  '    seSo        ',
  '    oBBo        ',
  '    obbo        ',
  '   occccoGGgmM  ',
  '   cwwwcoGGgmM  ',
  '   cWkWco       ',
  '   oCCCco       ',
  '    oppo        ',
  '   opPPpo       ',
  '   op po        ',
  '   op po        ',
  '   ot to        ',
  '   ot to        ',
]

const E_ATK_E_3 = E_ATK_E_1

// --- Emmett North (back view) ---

const E_IDLE_N_0 = [
  '     ooooo      ',
  '    ohhhhho     ',
  '    ohhhhho     ',
  '   ohhhhhho     ',
  '    ohhho       ',
  '    oSSso       ',
  '    oSSso       ',
  '                ',
  '   oCCCCCo      ',
  '   CCCCCCCC     ',
  '   CCkkCCCC     ',
  '   oCCCCCo      ',
  '    opppo       ',
  '   opPPPpo      ',
  '   op  ppo      ',
  '   op  ppo      ',
  '   ot  tto      ',
  '   ot  tto      ',
]

const E_IDLE_N_1 = shiftDown(E_IDLE_N_0, 1)

const E_WALK_N_0 = [
  '     ooooo      ',
  '    ohhhhho     ',
  '    ohhhhho     ',
  '   ohhhhhho     ',
  '    ohhho       ',
  '    oSSso       ',
  '    oSSso       ',
  '                ',
  '   oCCCCCo      ',
  '   CCCCCCCC     ',
  '   CCkkCCCC     ',
  '   oCCCCCo      ',
  '    opppo       ',
  '   opPPpo       ',
  '   op  po       ',
  '    po pp       ',
  '    to  to      ',
  '    to  to      ',
]
const E_WALK_N_1 = E_IDLE_N_0
const E_WALK_N_2 = flipH(E_WALK_N_0)
const E_WALK_N_3 = E_IDLE_N_0

const E_DEATH_N_0 = E_DEATH_S_0
const E_DEATH_N_1 = E_DEATH_S_1
const E_DEATH_N_2 = E_DEATH_S_2

const E_ATK_N_0 = E_IDLE_N_0
const E_ATK_N_1 = E_ATK_S_1.map(r => replaceChars([r], { 's': 'S', 'e': 'S', 'b': 'C', 'B': 'C', 'w': 'C', 'W': 'C' })[0]!)
const E_ATK_N_2 = E_ATK_S_2.map(r => replaceChars([r], { 's': 'S', 'e': 'S', 'b': 'C', 'B': 'C', 'w': 'C', 'W': 'C' })[0]!)
const E_ATK_N_3 = E_ATK_N_1

// ============================================================================
// BOB "THE DEADEYE" — Frames
// ============================================================================

const B_IDLE_S_0 = [
  '    oooooo      ',
  '   oHHHHHHo     ',
  '   ohHHHhho     ',
  '  oFFFFFFFfo    ',
  '    osSsSo      ',
  '    seSeSs      ',
  '     aSa        ',
  '     sss        ',
  '    odddddo     ',
  '    dwwwwd      ',
  '    dWkkWd      ',
  '    oDDDDdo     ',
  '    odddddo     ',
  '     oppo       ',
  '    opPPpo      ',
  '    op  po      ',
  '    op  po      ',
  '    ot  to      ',
  '    ot  to      ',
]

const B_IDLE_S_1 = shiftDown(B_IDLE_S_0, 1)

const B_WALK_S_0 = [
  '    oooooo      ',
  '   oHHHHHHo     ',
  '   ohHHHhho     ',
  '  oFFFFFFFfo    ',
  '    osSsSo      ',
  '    seSeSs      ',
  '     aSa        ',
  '     sss        ',
  '    odddddo     ',
  '    dwwwwd      ',
  '    dWkkWd      ',
  '    oDDDDdo     ',
  '    odddddo     ',
  '     oppo       ',
  '    opPpo       ',
  '    op  po      ',
  '     po to      ',
  '     to to      ',
  '     to         ',
]

const B_WALK_S_1 = B_IDLE_S_0
const B_WALK_S_2 = flipH(B_WALK_S_0)
const B_WALK_S_3 = B_IDLE_S_0

const B_DEATH_S_0 = [
  '     oooooo     ',
  '    oHHHHHHo    ',
  '    ohHHHhho    ',
  '   oFFFFFFFfo   ',
  '     osSsSo     ',
  '     seSeSs     ',
  '      aSa       ',
  '      sss       ',
  '     odddddo    ',
  '     dwwwwd     ',
  '     dWkkWd     ',
  '     oDDDDdo    ',
  '     odddddo    ',
  '      oppo      ',
  '     opPPpo     ',
  '     op  po     ',
  '     op  po     ',
  '     ot  to     ',
  '     ot  to     ',
]

const B_DEATH_S_1 = [
  '                ',
  '                ',
  '                ',
  '                ',
  '    oooooo      ',
  '   oHHHHHHo     ',
  '   ohHHHhho     ',
  '  oFFFFFFFfo    ',
  '    osSsSo      ',
  '    seSeSs      ',
  '     aSa        ',
  '     sss        ',
  '    odddddoo    ',
  '    dwwwwdDo    ',
  '    dWkkWDo     ',
  '    oDDDDo      ',
  '     oppppppo   ',
  '     otttto     ',
]

const B_DEATH_S_2 = [
  '                ',
  '                ',
  '                ',
  '                ',
  '                ',
  '                ',
  '                ',
  '                ',
  '                ',
  '                ',
  '                ',
  '   oooooo       ',
  '  oHHHHHHo      ',
  '  oFFFFFsso     ',
  '   osSsdddo     ',
  '   oddwwdddo    ',
  '   oDDpppppo    ',
  '    ottttto     ',
]

// Bob attack: aims rifle forward
const B_ATK_S_0 = B_IDLE_S_0

const B_ATK_S_1 = [
  '    oooooo      ',
  '   oHHHHHHo     ',
  '   ohHHHhho     ',
  '  oFFFFFFFfo    ',
  '    osSsSo      ',
  '    seSeSs      ',
  '     aSa        ',
  '     sss        ',
  '   rodddddo     ',
  '   Gdwwwwd      ',
  '    dWkkWd      ',
  '    oDDDDdo     ',
  '    odddddo     ',
  '     oppo       ',
  '    opPPpo      ',
  '    op  po      ',
  '    op  po      ',
  '    ot  to      ',
  '    ot  to      ',
]

const B_ATK_S_2 = [
  '    oooooo      ',
  '   oHHHHHHo     ',
  '   ohHHHhho     ',
  '  oFFFFFFFfo    ',
  '    osSsSo      ',
  '    seSeSs      ',
  '     aSa        ',
  '     sss        ',
  '  mrodddddo    ',
  '  MGdwwwwd      ',
  '    dWkkWd      ',
  '    oDDDDdo     ',
  '    odddddo     ',
  '     oppo       ',
  '    opPPpo      ',
  '    op  po      ',
  '    op  po      ',
  '    ot  to      ',
  '    ot  to      ',
]

const B_ATK_S_3 = B_ATK_S_1

// --- Bob East ---

const B_IDLE_E_0 = [
  '    ooooo       ',
  '   oHHHHHo      ',
  '   ohHHhho      ',
  '  oFFFFFo       ',
  '    osSo        ',
  '    seSo        ',
  '     aso        ',
  '     sso        ',
  '    oddddo      ',
  '    dwwdo       ',
  '    dkWdo       ',
  '    oDDdo       ',
  '    oddddo      ',
  '     oppo       ',
  '    opPpo       ',
  '    op po       ',
  '    op po       ',
  '    ot to       ',
  '    ot to       ',
]

const B_IDLE_E_1 = shiftDown(B_IDLE_E_0, 1)

const B_WALK_E_0 = [
  '    ooooo       ',
  '   oHHHHHo      ',
  '   ohHHhho      ',
  '  oFFFFFo       ',
  '    osSo        ',
  '    seSo        ',
  '     aso        ',
  '     sso        ',
  '    oddddo      ',
  '    dwwdo       ',
  '    dkWdo       ',
  '    oDDdo       ',
  '    oddddo      ',
  '     oppo       ',
  '    opPo        ',
  '     po po      ',
  '     to  to     ',
  '     to  to     ',
  '                ',
]

const B_WALK_E_1 = B_IDLE_E_0
const B_WALK_E_2 = flipH(B_WALK_E_0)
const B_WALK_E_3 = B_IDLE_E_0

const B_DEATH_E_0 = B_DEATH_S_0
const B_DEATH_E_1 = B_DEATH_S_1
const B_DEATH_E_2 = B_DEATH_S_2

const B_ATK_E_0 = [
  '    ooooo       ',
  '   oHHHHHo      ',
  '   ohHHhho      ',
  '  oFFFFFo       ',
  '    osSo        ',
  '    seSo        ',
  '     aso        ',
  '     sso        ',
  '    oddddo      ',
  '    dwwdoGGr    ',
  '    dkWdo       ',
  '    oDDdo       ',
  '    oddddo      ',
  '     oppo       ',
  '    opPpo       ',
  '    op po       ',
  '    op po       ',
  '    ot to       ',
  '    ot to       ',
]

const B_ATK_E_1 = [
  '    ooooo       ',
  '   oHHHHHo      ',
  '   ohHHhho      ',
  '  oFFFFFo       ',
  '    osSo        ',
  '    seSo        ',
  '     aso        ',
  '     sso        ',
  '    oddddo      ',
  '    dwwdoGGGr   ',
  '    dkWdo       ',
  '    oDDdo       ',
  '    oddddo      ',
  '     oppo       ',
  '    opPpo       ',
  '    op po       ',
  '    op po       ',
  '    ot to       ',
  '    ot to       ',
]

const B_ATK_E_2 = [
  '    ooooo       ',
  '   oHHHHHo      ',
  '   ohHHhho      ',
  '  oFFFFFo       ',
  '    osSo        ',
  '    seSo        ',
  '     aso        ',
  '     sso        ',
  '    oddddo      ',
  '    dwwdoGGGrmM ',
  '    dkWdo       ',
  '    oDDdo       ',
  '    oddddo      ',
  '     oppo       ',
  '    opPpo       ',
  '    op po       ',
  '    op po       ',
  '    ot to       ',
  '    ot to       ',
]

const B_ATK_E_3 = B_ATK_E_1

// --- Bob North ---

const B_IDLE_N_0 = [
  '    oooooo      ',
  '   ohhhhhho     ',
  '   ohhhhhho     ',
  '  ohhhhhhhho    ',
  '    ohhho       ',
  '    oaaSo       ',
  '     aSo        ',
  '     SSo        ',
  '    oDDDDDo     ',
  '    DDDDDDDD    ',
  '    DDkkDDDD    ',
  '    oDDDDDo     ',
  '    oDDDDDo     ',
  '     oppo       ',
  '    opPPpo      ',
  '    op  po      ',
  '    op  po      ',
  '    ot  to      ',
  '    ot  to      ',
]

const B_IDLE_N_1 = shiftDown(B_IDLE_N_0, 1)

const B_WALK_N_0 = [
  '    oooooo      ',
  '   ohhhhhho     ',
  '   ohhhhhho     ',
  '  ohhhhhhhho    ',
  '    ohhho       ',
  '    oaaSo       ',
  '     aSo        ',
  '     SSo        ',
  '    oDDDDDo     ',
  '    DDDDDDDD    ',
  '    DDkkDDDD    ',
  '    oDDDDDo     ',
  '    oDDDDDo     ',
  '     oppo       ',
  '    opPpo       ',
  '    op  po      ',
  '     po to      ',
  '     to to      ',
  '     to         ',
]
const B_WALK_N_1 = B_IDLE_N_0
const B_WALK_N_2 = flipH(B_WALK_N_0)
const B_WALK_N_3 = B_IDLE_N_0

const B_DEATH_N_0 = B_DEATH_S_0
const B_DEATH_N_1 = B_DEATH_S_1
const B_DEATH_N_2 = B_DEATH_S_2

const B_ATK_N_0 = B_IDLE_N_0
const B_ATK_N_1 = B_ATK_S_1.map(r => replaceChars([r], { 's': 'S', 'e': 'S', 'a': 'S', 'w': 'D', 'W': 'D', 'd': 'D' })[0]!)
const B_ATK_N_2 = B_ATK_S_2.map(r => replaceChars([r], { 's': 'S', 'e': 'S', 'a': 'S', 'w': 'D', 'W': 'D', 'd': 'D' })[0]!)
const B_ATK_N_3 = B_ATK_N_1

// ============================================================================
// Assemble sprite sheets
// ============================================================================

type FrameGrid = (string[] | null)[][]  // [row][col]

function assembleSheet(grid: FrameGrid): PixelBuffer {
  const sheet = new PixelBuffer(WIDTH, HEIGHT)
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const frame = grid[row]?.[col]
      if (!frame) continue
      const fb = renderFrame(frame, P)
      sheet.blitCell(col, row, fb)
    }
  }
  return sheet
}

// Emmett sheet layout
const emmettGrid: FrameGrid = [
  /* 0  idle S */  [E_IDLE_S_0, E_IDLE_S_1, null, null],
  /* 1  idle E */  [E_IDLE_E_0, E_IDLE_E_1, null, null],
  /* 2  idle N */  [E_IDLE_N_0, E_IDLE_N_1, null, null],
  /* 3  walk S */  [E_WALK_S_0, E_WALK_S_1, E_WALK_S_2, E_WALK_S_3],
  /* 4  walk E */  [E_WALK_E_0, E_WALK_E_1, E_WALK_E_2, E_WALK_E_3],
  /* 5  walk N */  [E_WALK_N_0, E_WALK_N_1, E_WALK_N_2, E_WALK_N_3],
  /* 6  resv  */  [null, null, null, null],
  /* 7  resv  */  [null, null, null, null],
  /* 8  resv  */  [null, null, null, null],
  /* 9  deathS*/  [E_DEATH_S_0, E_DEATH_S_1, E_DEATH_S_2, null],
  /* 10 deathE*/  [E_DEATH_E_0, E_DEATH_E_1, E_DEATH_E_2, null],
  /* 11 deathN*/  [E_DEATH_N_0, E_DEATH_N_1, E_DEATH_N_2, null],
  /* 12 atk S */  [E_ATK_S_0, E_ATK_S_1, E_ATK_S_2, E_ATK_S_3],
  /* 13 atk E */  [E_ATK_E_0, E_ATK_E_1, E_ATK_E_2, E_ATK_E_3],
  /* 14 atk N */  [E_ATK_N_0, E_ATK_N_1, E_ATK_N_2, E_ATK_N_3],
]

// Bob sheet layout
const bobGrid: FrameGrid = [
  /* 0  idle S */  [B_IDLE_S_0, B_IDLE_S_1, null, null],
  /* 1  idle E */  [B_IDLE_E_0, B_IDLE_E_1, null, null],
  /* 2  idle N */  [B_IDLE_N_0, B_IDLE_N_1, null, null],
  /* 3  walk S */  [B_WALK_S_0, B_WALK_S_1, B_WALK_S_2, B_WALK_S_3],
  /* 4  walk E */  [B_WALK_E_0, B_WALK_E_1, B_WALK_E_2, B_WALK_E_3],
  /* 5  walk N */  [B_WALK_N_0, B_WALK_N_1, B_WALK_N_2, B_WALK_N_3],
  /* 6  resv  */  [null, null, null, null],
  /* 7  resv  */  [null, null, null, null],
  /* 8  resv  */  [null, null, null, null],
  /* 9  deathS*/  [B_DEATH_S_0, B_DEATH_S_1, B_DEATH_S_2, null],
  /* 10 deathE*/  [B_DEATH_E_0, B_DEATH_E_1, B_DEATH_E_2, null],
  /* 11 deathN*/  [B_DEATH_N_0, B_DEATH_N_1, B_DEATH_N_2, null],
  /* 12 atk S */  [B_ATK_S_0, B_ATK_S_1, B_ATK_S_2, B_ATK_S_3],
  /* 13 atk E */  [B_ATK_E_0, B_ATK_E_1, B_ATK_E_2, B_ATK_E_3],
  /* 14 atk N */  [B_ATK_N_0, B_ATK_N_1, B_ATK_N_2, B_ATK_N_3],
]

// ============================================================================
// Write files
// ============================================================================

const outDir = 'packages/client/public/assets/sprites/enemies'

const emmettSheet = assembleSheet(emmettGrid)
const emmettPng = encodePNG(WIDTH, HEIGHT, emmettSheet.data)
await Bun.write(`${outDir}/dalton_emmett.png`, emmettPng)
console.log(`wrote ${outDir}/dalton_emmett.png (${emmettPng.length} bytes)`)

const bobSheet = assembleSheet(bobGrid)
const bobPng = encodePNG(WIDTH, HEIGHT, bobSheet.data)
await Bun.write(`${outDir}/dalton_bob.png`, bobPng)
console.log(`wrote ${outDir}/dalton_bob.png (${bobPng.length} bytes)`)
