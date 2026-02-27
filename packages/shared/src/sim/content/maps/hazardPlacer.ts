/**
 * Hazard Placement & Connectivity
 *
 * Places hazard tiles using bilinear value noise and ensures all open
 * tiles are reachable via iterative flood fill.
 */

import { SeededRng } from '../../../math/rng'
import { setTile, TileType, type Tilemap } from '../../tilemap'
import type { HazardConfig } from './mapConfig'

/**
 * Place hazard tiles using bilinear value noise.
 */
export function placeHazards(
  map: Tilemap,
  rng: SeededRng,
  hazard: HazardConfig,
  centerX: number,
  centerY: number,
  clearR: number,
): void {
  const { width, height } = map
  const { tileType, noiseThreshold, noiseCellSize, maxCoverage } = hazard

  const noiseW = Math.ceil(width / noiseCellSize) + 2
  const noiseH = Math.ceil(height / noiseCellSize) + 2
  const noise = new Float32Array(noiseW * noiseH)
  for (let i = 0; i < noise.length; i++) {
    noise[i] = rng.next()
  }

  let floorCount = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const solidLayer = map.layers[0]!
      if (solidLayer.data[y * width + x] !== TileType.EMPTY) continue
      floorCount++
    }
  }
  const maxHazardTiles = Math.floor(floorCount * maxCoverage)
  let hazardCount = 0

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (hazardCount >= maxHazardTiles) return

      if (Math.abs(x - centerX) <= clearR && Math.abs(y - centerY) <= clearR) continue

      const solidLayer = map.layers[0]!
      if (solidLayer.data[y * width + x] !== TileType.EMPTY) continue

      const floorLayer = map.layers[1]!
      if (floorLayer.data[y * width + x] !== TileType.FLOOR) continue

      const nx = x / noiseCellSize
      const ny = y / noiseCellSize
      const ix = Math.floor(nx)
      const iy = Math.floor(ny)
      const fx = nx - ix
      const fy = ny - iy

      const n00 = noise[iy * noiseW + ix]!
      const n10 = noise[iy * noiseW + ix + 1]!
      const n01 = noise[(iy + 1) * noiseW + ix]!
      const n11 = noise[(iy + 1) * noiseW + ix + 1]!

      const val = n00 * (1 - fx) * (1 - fy) +
                  n10 * fx * (1 - fy) +
                  n01 * (1 - fx) * fy +
                  n11 * fx * fy

      if (val > noiseThreshold) {
        setTile(map, 1, x, y, tileType)
        hazardCount++
      }
    }
  }
}

/**
 * Iterative flood fill from center to ensure all open tiles are reachable.
 * Removes wall tiles adjacent to unreachable pockets, then re-floods until
 * no unreachable open tiles remain.
 */
export function ensureConnectivity(map: Tilemap, centerX: number, centerY: number): void {
  const { width, height } = map
  const solidLayer = map.layers[0]!
  const total = width * height
  const maxIterations = 10

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const blocked = new Uint8Array(total)
    for (let i = 0; i < total; i++) {
      blocked[i] = solidLayer.data[i] !== TileType.EMPTY ? 1 : 0
    }

    const visited = new Uint8Array(total)
    const startIdx = centerY * width + centerX
    if (blocked[startIdx]) {
      solidLayer.data[startIdx] = TileType.EMPTY
      blocked[startIdx] = 0
    }

    const queue: number[] = [startIdx]
    visited[startIdx] = 1

    while (queue.length > 0) {
      const idx = queue.pop()!
      const x = idx % width
      const y = (idx - x) / width

      if (y > 0 && !visited[idx - width] && !blocked[idx - width]) { visited[idx - width] = 1; queue.push(idx - width) }
      if (y < height - 1 && !visited[idx + width] && !blocked[idx + width]) { visited[idx + width] = 1; queue.push(idx + width) }
      if (x > 0 && !visited[idx - 1] && !blocked[idx - 1]) { visited[idx - 1] = 1; queue.push(idx - 1) }
      if (x < width - 1 && !visited[idx + 1] && !blocked[idx + 1]) { visited[idx + 1] = 1; queue.push(idx + 1) }
    }

    let removedAny = false
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x
        if (!blocked[idx] || solidLayer.data[idx] === TileType.EMPTY) continue

        const hasUnreachable =
          (y > 1 && !blocked[(y - 1) * width + x] && !visited[(y - 1) * width + x]) ||
          (y < height - 2 && !blocked[(y + 1) * width + x] && !visited[(y + 1) * width + x]) ||
          (x > 1 && !blocked[y * width + (x - 1)] && !visited[y * width + (x - 1)]) ||
          (x < width - 2 && !blocked[y * width + (x + 1)] && !visited[y * width + (x + 1)])

        if (hasUnreachable) {
          solidLayer.data[idx] = TileType.EMPTY
          removedAny = true
        }
      }
    }

    if (!removedAny) break
  }
}
