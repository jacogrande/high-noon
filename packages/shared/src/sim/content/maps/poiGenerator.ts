/**
 * Deterministic interactable POI generation for stage maps.
 *
 * Produces one shovel salesman spawn and N stash spawns from a tilemap
 * using only seed + stage index, so server and clients can derive matching
 * layouts without runtime coupling.
 */

import { SeededRng } from '../../../math/rng'
import { TileType, getTile, tileToWorld, type Tilemap } from '../../tilemap'
import { STASHES_PER_STAGE } from '../economy'

export interface PoiSpawn {
  x: number
  y: number
}

export interface StagePoiLayout {
  salesman: PoiSpawn
  stashes: PoiSpawn[]
}

interface TilePoint {
  tileX: number
  tileY: number
}

const MIN_CENTER_DISTANCE_TILES = 6
const MIN_STASH_SPACING_TILES = [6, 4, 2]
const SALESMAN_STASH_MIN_DISTANCE_TILES = 4

function derivePoiSeed(baseSeed: number, stageIndex: number): number {
  let h = baseSeed ^ Math.imul(stageIndex + 1, 0x6d2b79f5)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

function isWalkableFloor(map: Tilemap, tileX: number, tileY: number): boolean {
  if (tileX <= 1 || tileY <= 1 || tileX >= map.width - 2 || tileY >= map.height - 2) return false
  const solid = getTile(map, 0, tileX, tileY)
  const floor = getTile(map, 1, tileX, tileY)
  return solid === TileType.EMPTY && floor === TileType.FLOOR
}

function centerDistanceSq(tileX: number, tileY: number, cx: number, cy: number): number {
  const dx = tileX - cx
  const dy = tileY - cy
  return dx * dx + dy * dy
}

function shuffleInPlace<T>(rng: SeededRng, arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1)
    const tmp = arr[i]!
    arr[i] = arr[j]!
    arr[j] = tmp
  }
}

function toWorldCenter(map: Tilemap, tile: TilePoint): PoiSpawn {
  const world = tileToWorld(map, tile.tileX, tile.tileY)
  const half = map.tileSize / 2
  return {
    x: world.worldX + half,
    y: world.worldY + half,
  }
}

function gatherCandidates(map: Tilemap): TilePoint[] {
  const cx = Math.floor(map.width / 2)
  const cy = Math.floor(map.height / 2)
  const minCenterSq = MIN_CENTER_DISTANCE_TILES * MIN_CENTER_DISTANCE_TILES
  const out: TilePoint[] = []
  for (let y = 2; y < map.height - 2; y++) {
    for (let x = 2; x < map.width - 2; x++) {
      if (!isWalkableFloor(map, x, y)) continue
      if (centerDistanceSq(x, y, cx, cy) < minCenterSq) continue
      out.push({ tileX: x, tileY: y })
    }
  }
  return out
}

function pickCampSalesmanTile(map: Tilemap): TilePoint {
  const cx = Math.floor(map.width / 2)
  const cy = Math.floor(map.height / 2)
  const preferred: TilePoint[] = [
    { tileX: cx + 3, tileY: cy },
    { tileX: cx - 3, tileY: cy },
    { tileX: cx, tileY: cy + 3 },
    { tileX: cx, tileY: cy - 3 },
  ]
  for (const tile of preferred) {
    if (isWalkableFloor(map, tile.tileX, tile.tileY)) return tile
  }

  // Spiral fallback around center.
  for (let r = 1; r <= 10; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue
        const tileX = cx + dx
        const tileY = cy + dy
        if (isWalkableFloor(map, tileX, tileY)) {
          return { tileX, tileY }
        }
      }
    }
  }

  return { tileX: cx, tileY: cy }
}

export function generateCampSalesmanSpawn(map: Tilemap): PoiSpawn {
  return toWorldCenter(map, pickCampSalesmanTile(map))
}

export function generateStagePoiLayout(
  map: Tilemap,
  baseSeed: number,
  stageIndex: number,
  stashCount = STASHES_PER_STAGE,
): StagePoiLayout {
  const rng = new SeededRng(derivePoiSeed(baseSeed, stageIndex))
  const candidates = gatherCandidates(map)

  if (candidates.length === 0) {
    const fallback = pickCampSalesmanTile(map)
    return {
      salesman: toWorldCenter(map, fallback),
      stashes: [],
    }
  }

  shuffleInPlace(rng, candidates)

  const salesmanTile = candidates[0]!
  const stashes: TilePoint[] = []
  const salesmanMinSq = SALESMAN_STASH_MIN_DISTANCE_TILES * SALESMAN_STASH_MIN_DISTANCE_TILES

  for (const spacingTiles of MIN_STASH_SPACING_TILES) {
    if (stashes.length >= stashCount) break
    const minSq = spacingTiles * spacingTiles
    for (let i = 1; i < candidates.length && stashes.length < stashCount; i++) {
      const candidate = candidates[i]!
      if (
        centerDistanceSq(
          candidate.tileX,
          candidate.tileY,
          salesmanTile.tileX,
          salesmanTile.tileY,
        ) < salesmanMinSq
      ) {
        continue
      }
      let tooClose = false
      for (let j = 0; j < stashes.length; j++) {
        const placed = stashes[j]!
        if (centerDistanceSq(candidate.tileX, candidate.tileY, placed.tileX, placed.tileY) < minSq) {
          tooClose = true
          break
        }
      }
      if (tooClose) continue
      stashes.push(candidate)
    }
  }

  if (stashes.length < stashCount) {
    for (let i = 1; i < candidates.length && stashes.length < stashCount; i++) {
      const candidate = candidates[i]!
      if (
        centerDistanceSq(
          candidate.tileX,
          candidate.tileY,
          salesmanTile.tileX,
          salesmanTile.tileY,
        ) < salesmanMinSq
      ) {
        continue
      }
      const alreadyUsed = stashes.some(
        (stash) => stash.tileX === candidate.tileX && stash.tileY === candidate.tileY,
      )
      if (!alreadyUsed) {
        stashes.push(candidate)
      }
    }
  }

  return {
    salesman: toWorldCenter(map, salesmanTile),
    stashes: stashes.map((tile) => toWorldCenter(map, tile)),
  }
}
