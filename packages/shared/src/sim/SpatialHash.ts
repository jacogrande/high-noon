/**
 * Spatial Hash Grid
 *
 * Counting-sort spatial hash for O(1)-per-entity broadphase collision queries.
 * A single pre-allocated flat array of entity IDs sorted by cell index.
 * Each cell is a contiguous slice defined by cellStart[cell] and cellCount[cell].
 * Zero allocations after creation, deterministic iteration order.
 */

import { MAX_ENTITIES } from './components'

export interface SpatialHash {
  cellSize: number
  /** Grid cells wide */
  width: number
  /** Grid cells tall */
  height: number
  numCells: number
  /** Start offset in entities[] per cell */
  cellStart: Uint16Array
  /** Entity count per cell */
  cellCount: Uint16Array
  /** Entity IDs sorted by cell (MAX_ENTITIES capacity) */
  entities: Uint16Array
  /** Temp: cell index per rebuild-order slot */
  entityCell: Uint32Array
  /** Number of entities in the hash after last rebuild */
  entityCount: number
}

/**
 * Create a spatial hash grid. Pre-allocates all arrays once.
 *
 * @param arenaWidth - Arena width in pixels
 * @param arenaHeight - Arena height in pixels
 * @param cellSize - Cell size in pixels (should match TILE_SIZE)
 */
export function createSpatialHash(
  arenaWidth: number,
  arenaHeight: number,
  cellSize: number
): SpatialHash {
  const width = Math.ceil(arenaWidth / cellSize)
  const height = Math.ceil(arenaHeight / cellSize)
  const numCells = width * height

  return {
    cellSize,
    width,
    height,
    numCells,
    cellStart: new Uint16Array(numCells),
    cellCount: new Uint16Array(numCells),
    entities: new Uint16Array(MAX_ENTITIES),
    entityCell: new Uint32Array(MAX_ENTITIES),
    entityCount: 0,
  }
}

/**
 * Rebuild the spatial hash from scratch using counting sort.
 *
 * Three passes:
 * 1. Compute cell index per entity, count per cell
 * 2. Prefix sum → cellStart
 * 3. Place entities into sorted entities[]
 *
 * Clamps out-of-bounds positions to edge cells.
 */
export function rebuildSpatialHash(
  hash: SpatialHash,
  eids: number[],
  posX: Float32Array,
  posY: Float32Array
): void {
  const { cellSize, width, height, numCells, cellStart, cellCount, entities, entityCell } = hash
  const count = eids.length
  hash.entityCount = count

  // Clear cell counts
  cellCount.fill(0)

  // Pass 1: compute cell index per entity and count per cell
  for (let i = 0; i < count; i++) {
    const eid = eids[i]!
    let cx = Math.floor(posX[eid]! / cellSize)
    let cy = Math.floor(posY[eid]! / cellSize)

    // Clamp to grid bounds
    if (cx < 0) cx = 0
    else if (cx >= width) cx = width - 1
    if (cy < 0) cy = 0
    else if (cy >= height) cy = height - 1

    const cellIdx = cy * width + cx
    entityCell[i] = cellIdx
    cellCount[cellIdx]!++
  }

  // Pass 2: prefix sum → cellStart
  let offset = 0
  for (let c = 0; c < numCells; c++) {
    cellStart[c] = offset
    offset += cellCount[c]!
  }

  // Reset counts for placement pass (reuse as write cursors)
  cellCount.fill(0)

  // Pass 3: place entities into sorted array
  for (let i = 0; i < count; i++) {
    const eid = eids[i]!
    const cellIdx = entityCell[i]!
    const slot = cellStart[cellIdx]! + cellCount[cellIdx]!
    entities[slot] = eid
    cellCount[cellIdx]!++
  }
}

/**
 * Iterate all entities within radius of (x, y).
 *
 * Computes a bounding box in cell coords and iterates entities in overlapping cells.
 * Callers should do their own narrow-phase distance check in the callback.
 */
export function forEachInRadius(
  hash: SpatialHash,
  x: number,
  y: number,
  radius: number,
  callback: (eid: number) => void
): void {
  const { cellSize, width, height, cellStart, cellCount, entities } = hash

  // Bounding box in cell coords
  let minCX = Math.floor((x - radius) / cellSize)
  let maxCX = Math.floor((x + radius) / cellSize)
  let minCY = Math.floor((y - radius) / cellSize)
  let maxCY = Math.floor((y + radius) / cellSize)

  // Clamp to grid bounds
  if (minCX < 0) minCX = 0
  if (maxCX >= width) maxCX = width - 1
  if (minCY < 0) minCY = 0
  if (maxCY >= height) maxCY = height - 1

  for (let cy = minCY; cy <= maxCY; cy++) {
    for (let cx = minCX; cx <= maxCX; cx++) {
      const cellIdx = cy * width + cx
      const start = cellStart[cellIdx]!
      const cnt = cellCount[cellIdx]!
      for (let i = start; i < start + cnt; i++) {
        callback(entities[i]!)
      }
    }
  }
}
