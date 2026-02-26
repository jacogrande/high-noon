/**
 * Old Scratch & Ghost Rider Sprite Sheet Generator
 *
 * Generates two 128×480 PNG sprite sheets (32×32 cells, 15 rows × 4 cols):
 *   - old_scratch.png  — devil in a gentleman's suit, horns, hellfire accents
 *   - ghost_rider.png  — spectral horseback rider (rider+horse silhouette)
 *
 * Row layout (same as all enemy sheets):
 *   0-2:   idle  S/E/N (2 frames)
 *   3-5:   walk  S/E/N (4 frames)
 *   6-8:   reserved
 *   9-11:  death S/E/N (3 frames)
 *   12-14: attack S/E/N (4 frames)
 *
 * Run: bun run tools/generateOldScratchSprites.ts
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

type RGBA = [number, number, number, number]
type Pat = string[]
type FrameGrid = (Pat | null)[][]

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
// OLD SCRATCH — Devil in a gentleman's suit, horns, hellfire accents
// ============================================================================

// Palette:
//   o = dark outline
//   h = horn (dark red)          H = horn highlight
//   s = skin (ruddy)             S = skin shadow
//   e = eyes (fiery amber)
//   c = coat/suit (near-black)   C = coat shadow
//   v = vest (dark crimson)      V = vest highlight
//   t = tie (blood red)
//   p = pants (very dark red)    P = pants shadow
//   b = boots
//   f = fire/hellfire glow       F = fire bright
//   k = cape/coattails

const OS: Record<string, RGBA> = {
  'o': [20, 10, 5, 255],         // dark outline
  'h': [60, 10, 10, 255],        // horn dark red
  'H': [100, 20, 15, 255],       // horn highlight
  's': [180, 100, 80, 255],      // skin (ruddy)
  'S': [140, 70, 55, 255],       // skin shadow
  'e': [255, 180, 0, 255],       // eyes (fiery amber)
  'c': [40, 0, 0, 255],          // coat/suit (near-black red)
  'C': [25, 0, 0, 255],          // coat shadow
  'v': [90, 10, 10, 255],        // vest (dark crimson)
  'V': [130, 15, 15, 255],       // vest highlight
  't': [50, 15, 15, 255],        // tie (blood red)
  'p': [30, 5, 5, 255],          // pants (very dark red)
  'P': [20, 0, 0, 255],          // pants shadow
  'b': [15, 5, 0, 255],          // boots
  'f': [255, 120, 0, 255],       // fire/hellfire glow
  'F': [255, 200, 50, 255],      // fire bright
  'k': [200, 30, 30, 255],       // cape/coattails
}

// ============================================================================
// Old Scratch — South (front view)
// ~16 wide, ~20 tall — top hat with horns, formal suit, coattails
// ============================================================================

const OS_IDLE_S_0: Pat = [
  '     H    H     ',
  '     ho  oh     ',
  '    ooooooo     ',
  '    occcccco    ',
  '    occcccco    ',
  '     osSsSo     ',
  '     seSeSs     ',
  '      oSSo      ',
  '      osso      ',
  '    ocvtvcco    ',
  '    cvVtVvcc    ',
  '    cvvtvvcc    ',
  '    oCCCCCco    ',
  '   kocccccok    ',
  '   ko pppo k    ',
  '   k opPPpo k   ',
  '    op   po     ',
  '    op   po     ',
  '    ob   bo     ',
  '    ob   bo     ',
]

const OS_IDLE_S_1 = shiftDown(OS_IDLE_S_0, 1)

// Walk S — 4-frame cycle
const OS_WALK_S_0: Pat = [
  '     H    H     ',
  '     ho  oh     ',
  '    ooooooo     ',
  '    occcccco    ',
  '    occcccco    ',
  '     osSsSo     ',
  '     seSeSs     ',
  '      oSSo      ',
  '      osso      ',
  '    ocvtvcco    ',
  '    cvVtVvcc    ',
  '    cvvtvvcc    ',
  '    oCCCCCco    ',
  '   kocccccok    ',
  '    o pppo      ',
  '    opPPpo      ',
  '     po  pp     ',
  '     bo  bo     ',
  '     bo  bo     ',
  '                ',
]

const OS_WALK_S_1 = OS_IDLE_S_0
const OS_WALK_S_2 = flipH(OS_WALK_S_0)
const OS_WALK_S_3 = OS_IDLE_S_0

// Death S — 3 frames
const OS_DEATH_S_0: Pat = [
  '      H    H    ',
  '      ho  oh    ',
  '     ooooooo    ',
  '     occcccco   ',
  '     occcccco   ',
  '      osSsSo    ',
  '      seSeSs    ',
  '       oSSo     ',
  '       osso     ',
  '     ocvtvcco   ',
  '     cvVtVvcc   ',
  '     cvvtvvcc   ',
  '     oCCCCCco   ',
  '     occcccco   ',
  '      opppo     ',
  '     opPPPpo    ',
  '     op   po    ',
  '     op   po    ',
  '     ob   bo    ',
  '     ob   bo    ',
]

const OS_DEATH_S_1: Pat = [
  '                ',
  '                ',
  '                ',
  '                ',
  '     H    H     ',
  '     ho  oh     ',
  '    ooooooo     ',
  '    occcccco    ',
  '     osSsSo     ',
  '     seSeSs     ',
  '      oSSo      ',
  '      osso      ',
  '    ocvtvccooo  ',
  '    cvVtVvccCo  ',
  '    cvvtvCCo    ',
  '    oCCCCCo     ',
  '     oppppppo   ',
  '     obbbbbo    ',
  '                ',
  '                ',
]

const OS_DEATH_S_2: Pat = [
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
  '   ooooooo      ',
  '   occccccco    ',
  '   osSsSccco    ',
  '   ossvvvcco    ',
  '   ocvtvcco     ',
  '   oCCppppo     ',
  '    obbbbbo     ',
  '                ',
  '                ',
]

// Attack S — 4 frames: idle, windup, fire burst, follow-through
const OS_ATK_S_0 = OS_IDLE_S_0

const OS_ATK_S_1: Pat = [
  '     H    H     ',
  '     ho  oh     ',
  '    ooooooo     ',
  '    occcccco    ',
  '    occcccco    ',
  '     osSsSo     ',
  '     seSeSs     ',
  '      oSSo      ',
  '      osso      ',
  '   focvtvcco    ',
  '   fcvVtVvcc    ',
  '    cvvtvvcc    ',
  '    oCCCCCco    ',
  '   kocccccok    ',
  '   ko pppo k    ',
  '   k opPPpo k   ',
  '    op   po     ',
  '    op   po     ',
  '    ob   bo     ',
  '    ob   bo     ',
]

const OS_ATK_S_2: Pat = [
  '     H    H     ',
  '     ho  oh     ',
  '    ooooooo     ',
  '    occcccco    ',
  '    occcccco    ',
  '     osSsSo     ',
  '     seSeSs     ',
  '      oSSo      ',
  '      osso      ',
  '  Ffocvtvcco    ',
  '  FfcvVtVvcc    ',
  '   fcvvtvvcc    ',
  '    oCCCCCco    ',
  '   kocccccok    ',
  '   ko pppo k    ',
  '   k opPPpo k   ',
  '    op   po     ',
  '    op   po     ',
  '    ob   bo     ',
  '    ob   bo     ',
]

const OS_ATK_S_3 = OS_ATK_S_1

// ============================================================================
// Old Scratch — East (side profile)
// ============================================================================

const OS_IDLE_E_0: Pat = [
  '     H  H       ',
  '     hooh       ',
  '    ooooooo     ',
  '    occccco     ',
  '    occccco     ',
  '     osSo       ',
  '     seSo       ',
  '      oSo       ',
  '      oso       ',
  '    ocvtco      ',
  '    cvVtcc      ',
  '    cvvtcc      ',
  '    oCCCco      ',
  '   kocccok      ',
  '    o ppo       ',
  '    opPPpo      ',
  '    op  po      ',
  '    op  po      ',
  '    ob  bo      ',
  '    ob  bo      ',
]

const OS_IDLE_E_1 = shiftDown(OS_IDLE_E_0, 1)

// Walk E
const OS_WALK_E_0: Pat = [
  '     H  H       ',
  '     hooh       ',
  '    ooooooo     ',
  '    occccco     ',
  '    occccco     ',
  '     osSo       ',
  '     seSo       ',
  '      oSo       ',
  '      oso       ',
  '    ocvtco      ',
  '    cvVtcc      ',
  '    cvvtcc      ',
  '    oCCCco      ',
  '   kocccok      ',
  '    o ppo       ',
  '    opPpo       ',
  '     po  po     ',
  '     bo  bo     ',
  '     bo  bo     ',
  '                ',
]

const OS_WALK_E_1 = OS_IDLE_E_0
const OS_WALK_E_2 = flipH(OS_WALK_E_0)
const OS_WALK_E_3 = OS_IDLE_E_0

// Death E — reuse south death
const OS_DEATH_E_0 = OS_DEATH_S_0
const OS_DEATH_E_1 = OS_DEATH_S_1
const OS_DEATH_E_2 = OS_DEATH_S_2

// Attack E — fire extends right
const OS_ATK_E_0 = OS_IDLE_E_0

const OS_ATK_E_1: Pat = [
  '     H  H       ',
  '     hooh       ',
  '    ooooooo     ',
  '    occccco     ',
  '    occccco     ',
  '     osSo       ',
  '     seSo       ',
  '      oSo       ',
  '      oso       ',
  '    ocvtcoff    ',
  '    cvVtccf     ',
  '    cvvtcc      ',
  '    oCCCco      ',
  '   kocccok      ',
  '    o ppo       ',
  '    opPPpo      ',
  '    op  po      ',
  '    op  po      ',
  '    ob  bo      ',
  '    ob  bo      ',
]

const OS_ATK_E_2: Pat = [
  '     H  H       ',
  '     hooh       ',
  '    ooooooo     ',
  '    occccco     ',
  '    occccco     ',
  '     osSo       ',
  '     seSo       ',
  '      oSo       ',
  '      oso       ',
  '    ocvtcofFf   ',
  '    cvVtccfFf   ',
  '    cvvtcc f    ',
  '    oCCCco      ',
  '   kocccok      ',
  '    o ppo       ',
  '    opPPpo      ',
  '    op  po      ',
  '    op  po      ',
  '    ob  bo      ',
  '    ob  bo      ',
]

const OS_ATK_E_3 = OS_ATK_E_1

// ============================================================================
// Old Scratch — North (back view)
// ============================================================================

const OS_IDLE_N_0: Pat = [
  '     H    H     ',
  '     ho  oh     ',
  '    ooooooo     ',
  '    occcccco    ',
  '    occcccco    ',
  '     oSSSo      ',
  '     oSSSo      ',
  '      oSo       ',
  '                ',
  '    oCCCCCCo    ',
  '    CCCCCCCC    ',
  '    CCCCCCCo    ',
  '    oCCCCCCo    ',
  '   kocccccok    ',
  '   ko pppo k    ',
  '   k opPPpo k   ',
  '    op   po     ',
  '    op   po     ',
  '    ob   bo     ',
  '    ob   bo     ',
]

const OS_IDLE_N_1 = shiftDown(OS_IDLE_N_0, 1)

// Walk N
const OS_WALK_N_0: Pat = [
  '     H    H     ',
  '     ho  oh     ',
  '    ooooooo     ',
  '    occcccco    ',
  '    occcccco    ',
  '     oSSSo      ',
  '     oSSSo      ',
  '      oSo       ',
  '                ',
  '    oCCCCCCo    ',
  '    CCCCCCCC    ',
  '    CCCCCCCo    ',
  '    oCCCCCCo    ',
  '   kocccccok    ',
  '    o pppo      ',
  '    opPPpo      ',
  '     po  pp     ',
  '     bo  bo     ',
  '     bo  bo     ',
  '                ',
]

const OS_WALK_N_1 = OS_IDLE_N_0
const OS_WALK_N_2 = flipH(OS_WALK_N_0)
const OS_WALK_N_3 = OS_IDLE_N_0

// Death N — reuse south death
const OS_DEATH_N_0 = OS_DEATH_S_0
const OS_DEATH_N_1 = OS_DEATH_S_1
const OS_DEATH_N_2 = OS_DEATH_S_2

// Attack N — derived from S attack with back-view replacements
const OS_ATK_N_0 = OS_IDLE_N_0
const OS_ATK_N_1 = replaceChars(OS_ATK_S_1, { 's': 'S', 'e': 'S', 'v': 'C', 'V': 'C', 't': 'C' })
const OS_ATK_N_2 = replaceChars(OS_ATK_S_2, { 's': 'S', 'e': 'S', 'v': 'C', 'V': 'C', 't': 'C' })
const OS_ATK_N_3 = OS_ATK_N_1

// ============================================================================
// Old Scratch — Grid assembly
// ============================================================================

const oldScratchGrid: FrameGrid = [
  /* 0  idle S  */ [OS_IDLE_S_0, OS_IDLE_S_1, null, null],
  /* 1  idle E  */ [OS_IDLE_E_0, OS_IDLE_E_1, null, null],
  /* 2  idle N  */ [OS_IDLE_N_0, OS_IDLE_N_1, null, null],
  /* 3  walk S  */ [OS_WALK_S_0, OS_WALK_S_1, OS_WALK_S_2, OS_WALK_S_3],
  /* 4  walk E  */ [OS_WALK_E_0, OS_WALK_E_1, OS_WALK_E_2, OS_WALK_E_3],
  /* 5  walk N  */ [OS_WALK_N_0, OS_WALK_N_1, OS_WALK_N_2, OS_WALK_N_3],
  /* 6  resv    */ [null, null, null, null],
  /* 7  resv    */ [null, null, null, null],
  /* 8  resv    */ [null, null, null, null],
  /* 9  death S */ [OS_DEATH_S_0, OS_DEATH_S_1, OS_DEATH_S_2, null],
  /* 10 death E */ [OS_DEATH_E_0, OS_DEATH_E_1, OS_DEATH_E_2, null],
  /* 11 death N */ [OS_DEATH_N_0, OS_DEATH_N_1, OS_DEATH_N_2, null],
  /* 12 atk S   */ [OS_ATK_S_0, OS_ATK_S_1, OS_ATK_S_2, OS_ATK_S_3],
  /* 13 atk E   */ [OS_ATK_E_0, OS_ATK_E_1, OS_ATK_E_2, OS_ATK_E_3],
  /* 14 atk N   */ [OS_ATK_N_0, OS_ATK_N_1, OS_ATK_N_2, OS_ATK_N_3],
]

// ============================================================================
// GHOST RIDER — Spectral horseback rider (cool greys/whites)
// Renderer applies blue tint (0x88BBFF) and 0.6 alpha, so base is grey/white
// ============================================================================

// Palette:
//   o = dark outline
//   h = hat/head               H = hat highlight
//   s = skin (pale grey)       S = skin shadow
//   e = eyes (bright)
//   c = coat (grey)            C = coat shadow
//   r = horse body             R = horse shadow
//   l = horse legs
//   m = mane
//   t = tail
//   g = ghost glow             G = ghost glow bright

const GR: Record<string, RGBA> = {
  'o': [30, 30, 40, 255],        // dark outline
  'h': [160, 170, 190, 255],     // hat/head
  'H': [200, 210, 230, 255],     // hat highlight
  's': [180, 185, 200, 255],     // skin (pale grey)
  'S': [140, 145, 160, 255],     // skin shadow
  'e': [220, 240, 255, 255],     // eyes (bright)
  'c': [100, 105, 120, 255],     // coat (grey)
  'C': [70, 75, 85, 255],        // coat shadow
  'r': [80, 85, 95, 255],        // horse body
  'R': [60, 65, 70, 255],        // horse shadow
  'l': [50, 55, 60, 255],        // horse legs
  'm': [120, 130, 150, 255],     // mane
  't': [90, 95, 110, 255],       // tail
  'g': [180, 200, 255, 255],     // ghost glow
  'G': [220, 235, 255, 255],     // ghost glow bright
}

// ============================================================================
// Ghost Rider — South (front view)
// ~18 wide, ~22 tall — rider torso on top, horse body+legs below
// ============================================================================

const GR_IDLE_S_0: Pat = [
  '      ooooo       ',
  '     oHHHHHo      ',
  '     ohhhhho      ',
  '      osSo        ',
  '      seSes       ',
  '       oso        ',
  '     occccco      ',
  '     ccccccc      ',
  '     oCCCCCo      ',
  '    g oCCo  g     ',
  '   g omrrmo  g    ',
  '    orrrrrrro     ',
  '    orrrrrrro     ',
  '    oRRrrRRo      ',
  '    ol ol ol      ',
  '    ol ol ol      ',
  '    ol ol ol      ',
  '    ol ol ol      ',
]

const GR_IDLE_S_1 = shiftDown(GR_IDLE_S_0, 1)

// Walk S — 4-frame galloping cycle
const GR_WALK_S_0: Pat = [
  '      ooooo       ',
  '     oHHHHHo      ',
  '     ohhhhho      ',
  '      osSo        ',
  '      seSes       ',
  '       oso        ',
  '     occccco      ',
  '     ccccccc      ',
  '     oCCCCCo      ',
  '    g oCCo  g     ',
  '   g omrrmo  g    ',
  '    orrrrrrro     ',
  '    orrrrrrro     ',
  '    oRRrrRRo      ',
  '     lo  lo       ',
  '    lo    lo      ',
  '   lo      lo     ',
  '                  ',
]

const GR_WALK_S_1: Pat = [
  '      ooooo       ',
  '     oHHHHHo      ',
  '     ohhhhho      ',
  '      osSo        ',
  '      seSes       ',
  '       oso        ',
  '     occccco      ',
  '     ccccccc      ',
  '     oCCCCCo      ',
  '    g oCCo  g     ',
  '   g omrrmo  g    ',
  '    orrrrrrro     ',
  '    orrrrrrro     ',
  '    oRRrrRRo      ',
  '    ol ol ol      ',
  '    ol ol ol      ',
  '    ol ol ol      ',
  '    ol ol ol      ',
]

const GR_WALK_S_2: Pat = [
  '      ooooo       ',
  '     oHHHHHo      ',
  '     ohhhhho      ',
  '      osSo        ',
  '      seSes       ',
  '       oso        ',
  '     occccco      ',
  '     ccccccc      ',
  '     oCCCCCo      ',
  '    g oCCo  g     ',
  '   g omrrmo  g    ',
  '    orrrrrrro     ',
  '    orrrrrrro     ',
  '    oRRrrRRo      ',
  '      ol  ol      ',
  '       ol  ol     ',
  '        ol  ol    ',
  '                  ',
]

const GR_WALK_S_3 = GR_WALK_S_1

// Death S — 3 frames: rearing, falling, dissolve
const GR_DEATH_S_0: Pat = [
  '       ooooo      ',
  '      oHHHHHo     ',
  '      ohhhhho     ',
  '       osSo       ',
  '       seSes      ',
  '        oso       ',
  '      occccco     ',
  '      ccccccc     ',
  '      oCCCCCo     ',
  '       oCCo       ',
  '      omrrmo      ',
  '     orrrrrrro    ',
  '     orrrrrrro    ',
  '     oRRrrRRo     ',
  '     ol ol ol     ',
  '     ol ol ol     ',
  '     ol ol ol     ',
  '     ol ol ol     ',
]

const GR_DEATH_S_1: Pat = [
  '                  ',
  '                  ',
  '                  ',
  '                  ',
  '      ooooo       ',
  '     oHHHHHo      ',
  '     ohhhhho      ',
  '      osSo        ',
  '      seSes       ',
  '       oso        ',
  '     occcccoo     ',
  '     cccccCCo     ',
  '      orrrrrrro   ',
  '      orrrrrrro   ',
  '      oRRrrRRo    ',
  '       olllllo    ',
  '       olllllo    ',
  '                  ',
]

const GR_DEATH_S_2: Pat = [
  '                  ',
  '                  ',
  '                  ',
  '                  ',
  '                  ',
  '                  ',
  '                  ',
  '                  ',
  '                  ',
  '                  ',
  '                  ',
  '    g   g   g     ',
  '      ooo         ',
  '     ohhsso       ',
  '     occrrro      ',
  '      oRRRRo      ',
  '    g  lll  g     ',
  '   G          G   ',
]

// Attack S — 4 frames: idle, rider winds up, spectral lash extends, follow-through
const GR_ATK_S_0 = GR_IDLE_S_0

const GR_ATK_S_1: Pat = [
  '      ooooo       ',
  '     oHHHHHo      ',
  '     ohhhhho      ',
  '      osSo        ',
  '      seSes       ',
  '       oso        ',
  '    goccccco      ',
  '    gccccccc      ',
  '     oCCCCCo      ',
  '    g oCCo  g     ',
  '   g omrrmo  g    ',
  '    orrrrrrro     ',
  '    orrrrrrro     ',
  '    oRRrrRRo      ',
  '    ol ol ol      ',
  '    ol ol ol      ',
  '    ol ol ol      ',
  '    ol ol ol      ',
]

const GR_ATK_S_2: Pat = [
  '      ooooo       ',
  '     oHHHHHo      ',
  '     ohhhhho      ',
  '      osSo        ',
  '      seSes       ',
  '       oso        ',
  '  Ggoccccco       ',
  '  Ggccccccc       ',
  '     oCCCCCo      ',
  '    g oCCo  g     ',
  '   g omrrmo  g    ',
  '    orrrrrrro     ',
  '    orrrrrrro     ',
  '    oRRrrRRo      ',
  '    ol ol ol      ',
  '    ol ol ol      ',
  '    ol ol ol      ',
  '    ol ol ol      ',
]

const GR_ATK_S_3 = GR_ATK_S_1

// ============================================================================
// Ghost Rider — East (side profile)
// ============================================================================

const GR_IDLE_E_0: Pat = [
  '     ooooo        ',
  '    oHHHHo        ',
  '    ohhhho        ',
  '     osSo         ',
  '     seSo         ',
  '      oso         ',
  '    occcco        ',
  '    ccccco        ',
  '    oCCCo         ',
  '   g oCo  g       ',
  '  g omrrmo g      ',
  '   orrrrrrrro     ',
  '   orrrrrrrrot    ',
  '   oRRrrrRRo t    ',
  '   ol   ol        ',
  '   ol   ol        ',
  '   ol   ol        ',
  '   ol   ol        ',
]

const GR_IDLE_E_1 = shiftDown(GR_IDLE_E_0, 1)

// Walk E — galloping
const GR_WALK_E_0: Pat = [
  '     ooooo        ',
  '    oHHHHo        ',
  '    ohhhho        ',
  '     osSo         ',
  '     seSo         ',
  '      oso         ',
  '    occcco        ',
  '    ccccco        ',
  '    oCCCo         ',
  '   g oCo  g       ',
  '  g omrrmo g      ',
  '   orrrrrrrro     ',
  '   orrrrrrrrot    ',
  '   oRRrrrRRo t    ',
  '    lo   lo       ',
  '   lo     lo      ',
  '  lo       lo     ',
  '                  ',
]

const GR_WALK_E_1 = GR_IDLE_E_0

const GR_WALK_E_2: Pat = [
  '     ooooo        ',
  '    oHHHHo        ',
  '    ohhhho        ',
  '     osSo         ',
  '     seSo         ',
  '      oso         ',
  '    occcco        ',
  '    ccccco        ',
  '    oCCCo         ',
  '   g oCo  g       ',
  '  g omrrmo g      ',
  '   orrrrrrrro     ',
  '   orrrrrrrrot    ',
  '   oRRrrrRRo t    ',
  '     ol   ol      ',
  '      ol   ol     ',
  '       ol   ol    ',
  '                  ',
]

const GR_WALK_E_3 = GR_IDLE_E_0

// Death E — reuse south death
const GR_DEATH_E_0 = GR_DEATH_S_0
const GR_DEATH_E_1 = GR_DEATH_S_1
const GR_DEATH_E_2 = GR_DEATH_S_2

// Attack E — spectral lash extends right
const GR_ATK_E_0 = GR_IDLE_E_0

const GR_ATK_E_1: Pat = [
  '     ooooo        ',
  '    oHHHHo        ',
  '    ohhhho        ',
  '     osSo         ',
  '     seSo         ',
  '      oso         ',
  '    occcco        ',
  '    cccccogg      ',
  '    oCCCo         ',
  '   g oCo  g       ',
  '  g omrrmo g      ',
  '   orrrrrrrro     ',
  '   orrrrrrrrot    ',
  '   oRRrrrRRo t    ',
  '   ol   ol        ',
  '   ol   ol        ',
  '   ol   ol        ',
  '   ol   ol        ',
]

const GR_ATK_E_2: Pat = [
  '     ooooo        ',
  '    oHHHHo        ',
  '    ohhhho        ',
  '     osSo         ',
  '     seSo         ',
  '      oso         ',
  '    occcco        ',
  '    cccccogGGg    ',
  '    oCCCo   Gg    ',
  '   g oCo  g       ',
  '  g omrrmo g      ',
  '   orrrrrrrro     ',
  '   orrrrrrrrot    ',
  '   oRRrrrRRo t    ',
  '   ol   ol        ',
  '   ol   ol        ',
  '   ol   ol        ',
  '   ol   ol        ',
]

const GR_ATK_E_3 = GR_ATK_E_1

// ============================================================================
// Ghost Rider — North (back view)
// ============================================================================

const GR_IDLE_N_0: Pat = [
  '      ooooo       ',
  '     ohhhhho      ',
  '     ohhhhho      ',
  '      oSSo        ',
  '      oSSo        ',
  '       oSo        ',
  '     oCCCCCo      ',
  '     CCCCCCo      ',
  '     oCCCCCo      ',
  '    g oCCo  g     ',
  '   g omrrmo  g    ',
  '    orrrrrrro     ',
  '    orrrrrrrot    ',
  '    oRRrrRRo t    ',
  '    ol ol ol      ',
  '    ol ol ol      ',
  '    ol ol ol      ',
  '    ol ol ol      ',
]

const GR_IDLE_N_1 = shiftDown(GR_IDLE_N_0, 1)

// Walk N
const GR_WALK_N_0: Pat = [
  '      ooooo       ',
  '     ohhhhho      ',
  '     ohhhhho      ',
  '      oSSo        ',
  '      oSSo        ',
  '       oSo        ',
  '     oCCCCCo      ',
  '     CCCCCCo      ',
  '     oCCCCCo      ',
  '    g oCCo  g     ',
  '   g omrrmo  g    ',
  '    orrrrrrro     ',
  '    orrrrrrrot    ',
  '    oRRrrRRo t    ',
  '     lo  lo       ',
  '    lo    lo      ',
  '   lo      lo     ',
  '                  ',
]

const GR_WALK_N_1 = GR_IDLE_N_0

const GR_WALK_N_2: Pat = [
  '      ooooo       ',
  '     ohhhhho      ',
  '     ohhhhho      ',
  '      oSSo        ',
  '      oSSo        ',
  '       oSo        ',
  '     oCCCCCo      ',
  '     CCCCCCo      ',
  '     oCCCCCo      ',
  '    g oCCo  g     ',
  '   g omrrmo  g    ',
  '    orrrrrrro     ',
  '    orrrrrrrot    ',
  '    oRRrrRRo t    ',
  '      ol  ol      ',
  '       ol  ol     ',
  '        ol  ol    ',
  '                  ',
]

const GR_WALK_N_3 = GR_IDLE_N_0

// Death N — reuse south death
const GR_DEATH_N_0 = GR_DEATH_S_0
const GR_DEATH_N_1 = GR_DEATH_S_1
const GR_DEATH_N_2 = GR_DEATH_S_2

// Attack N — derived from S attack with back-view replacements
const GR_ATK_N_0 = GR_IDLE_N_0
const GR_ATK_N_1 = replaceChars(GR_ATK_S_1, { 's': 'S', 'e': 'S', 'c': 'C', 'H': 'h' })
const GR_ATK_N_2 = replaceChars(GR_ATK_S_2, { 's': 'S', 'e': 'S', 'c': 'C', 'H': 'h' })
const GR_ATK_N_3 = GR_ATK_N_1

// ============================================================================
// Ghost Rider — Grid assembly
// ============================================================================

const ghostRiderGrid: FrameGrid = [
  /* 0  idle S  */ [GR_IDLE_S_0, GR_IDLE_S_1, null, null],
  /* 1  idle E  */ [GR_IDLE_E_0, GR_IDLE_E_1, null, null],
  /* 2  idle N  */ [GR_IDLE_N_0, GR_IDLE_N_1, null, null],
  /* 3  walk S  */ [GR_WALK_S_0, GR_WALK_S_1, GR_WALK_S_2, GR_WALK_S_3],
  /* 4  walk E  */ [GR_WALK_E_0, GR_WALK_E_1, GR_WALK_E_2, GR_WALK_E_3],
  /* 5  walk N  */ [GR_WALK_N_0, GR_WALK_N_1, GR_WALK_N_2, GR_WALK_N_3],
  /* 6  resv    */ [null, null, null, null],
  /* 7  resv    */ [null, null, null, null],
  /* 8  resv    */ [null, null, null, null],
  /* 9  death S */ [GR_DEATH_S_0, GR_DEATH_S_1, GR_DEATH_S_2, null],
  /* 10 death E */ [GR_DEATH_E_0, GR_DEATH_E_1, GR_DEATH_E_2, null],
  /* 11 death N */ [GR_DEATH_N_0, GR_DEATH_N_1, GR_DEATH_N_2, null],
  /* 12 atk S   */ [GR_ATK_S_0, GR_ATK_S_1, GR_ATK_S_2, GR_ATK_S_3],
  /* 13 atk E   */ [GR_ATK_E_0, GR_ATK_E_1, GR_ATK_E_2, GR_ATK_E_3],
  /* 14 atk N   */ [GR_ATK_N_0, GR_ATK_N_1, GR_ATK_N_2, GR_ATK_N_3],
]

// ============================================================================
// Generate
// ============================================================================

await writeSheet('old_scratch', oldScratchGrid, OS)
await writeSheet('ghost_rider', ghostRiderGrid, GR)

console.log('done — old_scratch + ghost_rider sprite sheets generated')
