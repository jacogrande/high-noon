/**
 * Flow Field System
 *
 * BFS pathfinding from the player position. Computes direction vectors
 * per tile cell so enemies can navigate around obstacles.
 * Recomputes only when the player crosses a tile boundary.
 */

import type { GameWorld, FlowField } from '../world'
import { Position } from '../components'
import { worldToTile, isSolidAt } from '../tilemap'
import { getAlivePlayers } from '../queries'

const UNREACHABLE = 0xFFFF
const INV_SQRT2 = 0.7071067811865476

// 8-directional neighbor offsets: dx, dy
const NEIGHBOR_DX = [-1, 0, 1, -1, 1, -1, 0, 1]
const NEIGHBOR_DY = [-1, -1, -1, 0, 0, 1, 1, 1]
// Whether each neighbor is diagonal
const NEIGHBOR_DIAG = [true, false, true, false, false, true, false, true]
// For diagonals, the two adjacent cardinal indices (in NEIGHBOR_DX/DY)
// Index mapping: 0=NW 1=N 2=NE 3=W 4=E 5=SW 6=S 7=SE
const DIAG_CARD_A = [1, -1, 1, -1, -1, 6, -1, 6] // N or S
const DIAG_CARD_B = [3, -1, 4, -1, -1, 3, -1, 4] // W or E

// Pre-allocated buffers (reused across calls). Module-level for zero-allocation reuse.
// Safe for determinism because they are fully overwritten each call.
let queueBuffer: Uint32Array | null = null
const _seeds: { idx: number }[] = []
const _keyParts: string[] = []

export function flowFieldSystem(world: GameWorld, _dt: number): void {
  const tilemap = world.tilemap
  if (!tilemap) return

  const alivePlayers = getAlivePlayers(world)
  if (alivePlayers.length === 0) return

  // Build seed key from sorted alive player tile positions (reuse module-level arrays)
  const w = tilemap.width
  const h = tilemap.height
  _seeds.length = 0
  _keyParts.length = 0

  for (const pid of alivePlayers) {
    const { tileX, tileY } = worldToTile(tilemap, Position.x[pid]!, Position.y[pid]!)
    _seeds.push({ idx: tileY * w + tileX })
    _keyParts.push(`${tileX},${tileY}`)
  }
  _keyParts.sort()
  const seedKey = _keyParts.join('|')

  // Skip if no player has moved to a new cell
  if (world.flowField && world.flowField.seedKey === seedKey) {
    return
  }

  const totalCells = w * h

  // Allocate or reuse flow field
  let ff: FlowField
  if (!world.flowField || world.flowField.width !== w || world.flowField.height !== h) {
    ff = {
      width: w,
      height: h,
      dirX: new Float32Array(totalCells),
      dirY: new Float32Array(totalCells),
      dist: new Uint16Array(totalCells),
      seedKey: '',
    }
  } else {
    ff = world.flowField
    ff.dirX.fill(0)
    ff.dirY.fill(0)
  }
  ff.dist.fill(UNREACHABLE)

  // Allocate queue buffer
  if (!queueBuffer || queueBuffer.length < totalCells) {
    queueBuffer = new Uint32Array(totalCells)
  }

  // Multi-source BFS: seed from all alive player cells
  let head = 0
  let tail = 0
  for (const seed of _seeds) {
    ff.dist[seed.idx] = 0
    queueBuffer[tail++] = seed.idx
  }

  const halfTile = tilemap.tileSize / 2

  while (head < tail) {
    const curIdx = queueBuffer[head++]!
    const cx = curIdx % w
    const cy = (curIdx - cx) / w
    const curDist = ff.dist[curIdx]!

    for (let n = 0; n < 8; n++) {
      const nx = cx + NEIGHBOR_DX[n]!
      const ny = cy + NEIGHBOR_DY[n]!

      // Bounds check
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue

      const nIdx = ny * w + nx

      // Already visited
      if (ff.dist[nIdx] !== UNREACHABLE) continue

      // Solid check (use tile center)
      const nWorldX = nx * tilemap.tileSize + halfTile
      const nWorldY = ny * tilemap.tileSize + halfTile
      if (isSolidAt(tilemap, nWorldX, nWorldY)) continue

      // Diagonal corner-cutting prevention
      if (NEIGHBOR_DIAG[n]) {
        const cardAIdx = DIAG_CARD_A[n]!
        const cardBIdx = DIAG_CARD_B[n]!
        const cardAx = cx + NEIGHBOR_DX[cardAIdx]!
        const cardAy = cy + NEIGHBOR_DY[cardAIdx]!
        const cardBx = cx + NEIGHBOR_DX[cardBIdx]!
        const cardBy = cy + NEIGHBOR_DY[cardBIdx]!

        const cardASolid = cardAx < 0 || cardAx >= w || cardAy < 0 || cardAy >= h ||
          isSolidAt(tilemap, cardAx * tilemap.tileSize + halfTile, cardAy * tilemap.tileSize + halfTile)
        const cardBSolid = cardBx < 0 || cardBx >= w || cardBy < 0 || cardBy >= h ||
          isSolidAt(tilemap, cardBx * tilemap.tileSize + halfTile, cardBy * tilemap.tileSize + halfTile)

        if (cardASolid && cardBSolid) continue
      }

      ff.dist[nIdx] = curDist + 1

      // Direction: from neighbor toward current cell (one step closer to nearest player)
      const dirX = cx - nx // always -1, 0, or 1
      const dirY = cy - ny
      if (NEIGHBOR_DIAG[n]) {
        ff.dirX[nIdx] = dirX * INV_SQRT2
        ff.dirY[nIdx] = dirY * INV_SQRT2
      } else {
        ff.dirX[nIdx] = dirX
        ff.dirY[nIdx] = dirY
      }

      queueBuffer[tail++] = nIdx
    }
  }

  ff.seedKey = seedKey
  world.flowField = ff
}
