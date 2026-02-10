/**
 * Flow field system.
 *
 * Computes weighted shortest paths toward alive players with a multi-source
 * Dijkstra pass. Lava tiles have higher traversal cost so enemies prefer to
 * route around hazards when alternatives exist.
 */

import type { GameWorld, FlowField } from '../world'
import { Position } from '../components'
import { worldToTile, isSolidAt, getFloorTileTypeAt, TileType } from '../tilemap'
import { getAlivePlayers } from '../queries'
import { LAVA_PATHFIND_COST } from '../content/hazards'

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

// Reused binary min-heap buffers
let heapIndices: Uint32Array | null = null
let heapPriorities: Uint16Array | null = null
let heapSize = 0

const seedScratch: { idx: number }[] = []
const seedKeyParts: string[] = []

function heapClear(): void {
  heapSize = 0
}

function heapPush(idx: number, priority: number): void {
  let pos = heapSize++
  heapIndices![pos] = idx
  heapPriorities![pos] = priority

  while (pos > 0) {
    const parent = (pos - 1) >> 1
    if (heapPriorities![parent]! <= heapPriorities![pos]!) break

    const tmpIdx = heapIndices![parent]!
    const tmpPriority = heapPriorities![parent]!
    heapIndices![parent] = heapIndices![pos]!
    heapPriorities![parent] = heapPriorities![pos]!
    heapIndices![pos] = tmpIdx
    heapPriorities![pos] = tmpPriority
    pos = parent
  }
}

function heapPop(): { idx: number; priority: number } {
  const idx = heapIndices![0]!
  const priority = heapPriorities![0]!
  heapSize--

  if (heapSize > 0) {
    heapIndices![0] = heapIndices![heapSize]!
    heapPriorities![0] = heapPriorities![heapSize]!

    let pos = 0
    while (true) {
      const left = 2 * pos + 1
      const right = 2 * pos + 2
      let smallest = pos

      if (left < heapSize && heapPriorities![left]! < heapPriorities![smallest]!) {
        smallest = left
      }
      if (right < heapSize && heapPriorities![right]! < heapPriorities![smallest]!) {
        smallest = right
      }
      if (smallest === pos) break

      const tmpIdx = heapIndices![pos]!
      const tmpPriority = heapPriorities![pos]!
      heapIndices![pos] = heapIndices![smallest]!
      heapPriorities![pos] = heapPriorities![smallest]!
      heapIndices![smallest] = tmpIdx
      heapPriorities![smallest] = tmpPriority
      pos = smallest
    }
  }

  return { idx, priority }
}

export function flowFieldSystem(world: GameWorld, _dt: number): void {
  const tilemap = world.tilemap
  if (!tilemap) return

  const alivePlayers = getAlivePlayers(world)
  if (alivePlayers.length === 0) return

  const width = tilemap.width
  const height = tilemap.height
  seedScratch.length = 0
  seedKeyParts.length = 0

  for (const playerEid of alivePlayers) {
    const { tileX, tileY } = worldToTile(tilemap, Position.x[playerEid]!, Position.y[playerEid]!)
    seedScratch.push({ idx: tileY * width + tileX })
    seedKeyParts.push(`${tileX},${tileY}`)
  }
  seedKeyParts.sort()
  const seedKey = seedKeyParts.join('|')

  if (world.flowField && world.flowField.seedKey === seedKey) return

  const totalCells = width * height

  let ff: FlowField
  if (!world.flowField || world.flowField.width !== width || world.flowField.height !== height) {
    ff = {
      width,
      height,
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

  if (!heapIndices || heapIndices.length < totalCells) {
    heapIndices = new Uint32Array(totalCells)
    heapPriorities = new Uint16Array(totalCells)
  }

  heapClear()
  for (const seed of seedScratch) {
    ff.dist[seed.idx] = 0
    heapPush(seed.idx, 0)
  }

  const halfTile = tilemap.tileSize / 2

  while (heapSize > 0) {
    const { idx: curIdx, priority: curDist } = heapPop()
    if (curDist > ff.dist[curIdx]!) continue

    const cx = curIdx % width
    const cy = (curIdx - cx) / width

    for (let n = 0; n < 8; n++) {
      const nx = cx + NEIGHBOR_DX[n]!
      const ny = cy + NEIGHBOR_DY[n]!
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue

      const nIdx = ny * width + nx
      const nWorldX = nx * tilemap.tileSize + halfTile
      const nWorldY = ny * tilemap.tileSize + halfTile
      if (isSolidAt(tilemap, nWorldX, nWorldY)) continue

      if (NEIGHBOR_DIAG[n]) {
        const cardAIdx = DIAG_CARD_A[n]!
        const cardBIdx = DIAG_CARD_B[n]!
        const cardAx = cx + NEIGHBOR_DX[cardAIdx]!
        const cardAy = cy + NEIGHBOR_DY[cardAIdx]!
        const cardBx = cx + NEIGHBOR_DX[cardBIdx]!
        const cardBy = cy + NEIGHBOR_DY[cardBIdx]!

        const cardASolid = cardAx < 0 || cardAx >= width || cardAy < 0 || cardAy >= height ||
          isSolidAt(tilemap, cardAx * tilemap.tileSize + halfTile, cardAy * tilemap.tileSize + halfTile)
        const cardBSolid = cardBx < 0 || cardBx >= width || cardBy < 0 || cardBy >= height ||
          isSolidAt(tilemap, cardBx * tilemap.tileSize + halfTile, cardBy * tilemap.tileSize + halfTile)

        if (cardASolid && cardBSolid) continue
      }

      const floorType = getFloorTileTypeAt(tilemap, nWorldX, nWorldY)
      const edgeCost = floorType === TileType.LAVA ? LAVA_PATHFIND_COST : 1
      const newDist = curDist + edgeCost

      if (newDist < ff.dist[nIdx]!) {
        ff.dist[nIdx] = newDist

        const dirX = cx - nx
        const dirY = cy - ny
        if (NEIGHBOR_DIAG[n]) {
          ff.dirX[nIdx] = dirX * INV_SQRT2
          ff.dirY[nIdx] = dirY * INV_SQRT2
        } else {
          ff.dirX[nIdx] = dirX
          ff.dirY[nIdx] = dirY
        }

        heapPush(nIdx, newDist)
      }
    }
  }

  ff.seedKey = seedKey
  world.flowField = ff
}
