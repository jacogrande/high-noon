/**
 * Procedural arena generator.
 *
 * Generates a tilemap from a MapConfig using seeded RNG for deterministic
 * multiplayer-compatible maps. Uses Poisson disk sampling for obstacles,
 * bilinear value noise for hazard placement, and flood fill for connectivity.
 */

import { SeededRng } from '../../../math/rng'
import { createTilemap, addLayer, setTile, TileType, type Tilemap } from '../../tilemap'
import type { MapConfig, ObstacleTemplate, HazardConfig } from './mapConfig'

/**
 * Derive a sub-seed from a base seed and stage index.
 * Ensures map generation is isolated from gameplay RNG.
 */
function deriveMapSeed(baseSeed: number, stageIndex: number): number {
  // Simple hash combine
  let h = baseSeed ^ (stageIndex * 0x9e3779b9)
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  return (h ^ (h >>> 16)) >>> 0
}

/**
 * Derive a stable visual seed for base-tile variant picking.
 * Kept separate from map generation so visual and collision layout concerns
 * remain decoupled.
 */
function deriveBaseTileSeed(baseSeed: number, stageIndex: number): number {
  let h = baseSeed ^ Math.imul(stageIndex + 1, 0x7f4a7c15)
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

/**
 * Generate a tilemap from a MapConfig.
 *
 * @param config - Map configuration for the stage
 * @param baseSeed - World seed (from world.initialSeed)
 * @param stageIndex - Stage index (0, 1, 2, ...)
 */
export function generateArena(config: MapConfig, baseSeed: number, stageIndex: number): Tilemap {
  const mapSeed = deriveMapSeed(baseSeed, stageIndex)
  const rng = new SeededRng(mapSeed)
  const { width, height, tileSize } = config

  // 1. Create tilemap with solid + floor layers
  const map = createTilemap(width, height, tileSize)
  map.baseTiles = {
    style: config.baseTiles.style,
    variantCount: Math.max(1, Math.floor(config.baseTiles.variantCount)),
    seed: deriveBaseTileSeed(baseSeed, stageIndex),
  }
  addLayer(map, true)   // layer 0: solid
  addLayer(map, false)  // layer 1: floor

  // Fill floor
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      setTile(map, 1, x, y, TileType.FLOOR)
    }
  }

  // 2. Place border walls
  for (let x = 0; x < width; x++) {
    setTile(map, 0, x, 0, TileType.WALL)
    setTile(map, 0, x, height - 1, TileType.WALL)
  }
  for (let y = 0; y < height; y++) {
    setTile(map, 0, 0, y, TileType.WALL)
    setTile(map, 0, width - 1, y, TileType.WALL)
  }

  // 3. Center exclusion zone
  const centerX = Math.floor(width / 2)
  const centerY = Math.floor(height / 2)
  const clearR = config.centerClearRadius

  // 4. Place obstacles via Poisson-like sampling
  const placed: Array<{ x: number; y: number }> = []
  const { count, minSpacing, templates } = config.obstacles
  const maxAttempts = count * 20

  for (let attempt = 0; attempt < maxAttempts && placed.length < count; attempt++) {
    // Pick a random position (inset from borders by 2 tiles)
    const ox = 2 + rng.nextInt(width - 4)
    const oy = 2 + rng.nextInt(height - 4)

    // Reject if in exclusion zone
    if (Math.abs(ox - centerX) <= clearR && Math.abs(oy - centerY) <= clearR) continue

    // Reject if too close to existing obstacles
    let tooClose = false
    for (const p of placed) {
      const dx = ox - p.x
      const dy = oy - p.y
      if (dx * dx + dy * dy < minSpacing * minSpacing) {
        tooClose = true
        break
      }
    }
    if (tooClose) continue

    // Pick a random template
    const template = templates[rng.nextInt(templates.length)]!

    // Check all tiles of the template fit and don't overlap exclusion zone or borders
    let fits = true
    for (const offset of template.walls) {
      const tx = ox + offset.dx
      const ty = oy + offset.dy
      if (tx <= 0 || tx >= width - 1 || ty <= 0 || ty >= height - 1) { fits = false; break }
      if (Math.abs(tx - centerX) <= clearR && Math.abs(ty - centerY) <= clearR) { fits = false; break }
    }
    if (template.halfWalls) {
      for (const offset of template.halfWalls) {
        const tx = ox + offset.dx
        const ty = oy + offset.dy
        if (tx <= 0 || tx >= width - 1 || ty <= 0 || ty >= height - 1) { fits = false; break }
        if (Math.abs(tx - centerX) <= clearR && Math.abs(ty - centerY) <= clearR) { fits = false; break }
      }
    }
    if (!fits) continue

    // Stamp the template
    for (const offset of template.walls) {
      setTile(map, 0, ox + offset.dx, oy + offset.dy, TileType.WALL)
    }
    if (template.halfWalls) {
      for (const offset of template.halfWalls) {
        setTile(map, 0, ox + offset.dx, oy + offset.dy, TileType.HALF_WALL)
      }
    }

    placed.push({ x: ox, y: oy })
  }

  // 5. Hazard scattering via interpolated value noise
  for (const hazard of config.hazards) {
    placeHazards(map, rng, hazard, centerX, centerY, clearR)
  }

  // 6. Connectivity check — remove walls that create unreachable pockets
  ensureConnectivity(map, centerX, centerY)

  return map
}

/**
 * Place hazard tiles using bilinear value noise.
 */
function placeHazards(
  map: Tilemap,
  rng: SeededRng,
  hazard: HazardConfig,
  centerX: number,
  centerY: number,
  clearR: number,
): void {
  const { width, height } = map
  const { tileType, noiseThreshold, noiseCellSize, maxCoverage } = hazard

  // Generate coarse noise grid
  const noiseW = Math.ceil(width / noiseCellSize) + 2
  const noiseH = Math.ceil(height / noiseCellSize) + 2
  const noise = new Float32Array(noiseW * noiseH)
  for (let i = 0; i < noise.length; i++) {
    noise[i] = rng.next()
  }

  // Count eligible floor tiles for coverage cap
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

      // Skip exclusion zone
      if (Math.abs(x - centerX) <= clearR && Math.abs(y - centerY) <= clearR) continue

      // Skip solid tiles
      const solidLayer = map.layers[0]!
      if (solidLayer.data[y * width + x] !== TileType.EMPTY) continue

      // Skip tiles already assigned a hazard by a previous pass
      const floorLayer = map.layers[1]!
      if (floorLayer.data[y * width + x] !== TileType.FLOOR) continue

      // Bilinear interpolation of noise
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
function ensureConnectivity(map: Tilemap, centerX: number, centerY: number): void {
  const { width, height } = map
  const solidLayer = map.layers[0]!
  const total = width * height
  const maxIterations = 10

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    // Build blocked array from current solid layer state
    const blocked = new Uint8Array(total)
    for (let i = 0; i < total; i++) {
      blocked[i] = solidLayer.data[i] !== TileType.EMPTY ? 1 : 0
    }

    // Flood fill from center (4-connected)
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

    // Find walls adjacent to unreachable open tiles and remove them
    let removedAny = false
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x
        if (!blocked[idx] || solidLayer.data[idx] === TileType.EMPTY) continue

        // Check 4-connected neighbors for unreachable open tiles
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

    // If no walls were removed, all open tiles are reachable
    if (!removedAny) break
  }
}
