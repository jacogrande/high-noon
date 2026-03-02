/**
 * Procedural arena generator — orchestrator.
 *
 * Generates a tilemap from a MapConfig using seeded RNG for deterministic
 * multiplayer-compatible maps. Delegates to focused sub-modules for
 * street layout, building placement, hazard scattering, and connectivity.
 */

import { SeededRng } from '../../../math/rng'
import { createTilemap, addLayer, setTile, getTile, TileType, type Tilemap } from '../../tilemap'
import type { MapConfig } from './mapConfig'
import { HITCHING_POST_DEF, type MapObstacle, type MapObstacleDef, type WeightedObstacleDef } from './mapObstacleDefs'
import { generateCrossroads } from './crossroadsGenerator'
import { placeTownBuildings, stampObstacle } from './buildingPlacer'
import { placeHazards, ensureConnectivity } from './hazardPlacer'
import type { SkipZone } from '../../tilemap'

export { generateRoadNetwork } from './streetLayout'

/**
 * Derive a sub-seed from a base seed and stage index.
 */
function deriveMapSeed(baseSeed: number, stageIndex: number): number {
  let h = baseSeed ^ (stageIndex * 0x9e3779b9)
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  return (h ^ (h >>> 16)) >>> 0
}

/**
 * Derive a stable visual seed for base-tile variant picking.
 */
function deriveBaseTileSeed(baseSeed: number, stageIndex: number): number {
  let h = baseSeed ^ Math.imul(stageIndex + 1, 0x7f4a7c15)
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

// ── Map obstacle placement ────────────────────────────────────────────

function pickWeightedObstacle(rng: SeededRng, pool: WeightedObstacleDef[]): MapObstacleDef {
  let totalWeight = 0
  for (const entry of pool) totalWeight += entry.weight
  let roll = rng.nextInt(totalWeight)
  for (const entry of pool) {
    roll -= entry.weight
    if (roll < 0) return entry.def
  }
  return pool[pool.length - 1]!.def
}

function placeMapObstacles(
  map: Tilemap,
  rng: SeededRng,
  cfg: { count: number; minSpacing: number; pool: WeightedObstacleDef[] },
  centerX: number,
  centerY: number,
  clearR: number,
  crossAlleys: SkipZone[],
  existingPlaced: Array<{ x: number; y: number }>,
): MapObstacle[] {
  const { width, height, tileSize } = map
  const obstacles: MapObstacle[] = []
  let nextId = 1
  const maxAttempts = cfg.count * 30
  let placedCount = 0

  for (let attempt = 0; attempt < maxAttempts && placedCount < cfg.count; attempt++) {
    const def = pickWeightedObstacle(rng, cfg.pool)

    const ox = 2 + rng.nextInt(width - 4 - (def.widthTiles - 1))
    const oy = 2 + rng.nextInt(height - 4 - (def.heightTiles - 1))

    if (Math.abs(ox - centerX) <= clearR + 1 && Math.abs(oy - centerY) <= clearR + 1) continue

    let inAlley = false
    for (const alley of crossAlleys) {
      if (oy >= alley.minY - 1 && oy + def.heightTiles <= alley.maxY + 1) {
        for (let dy = 0; dy < def.heightTiles; dy++) {
          if (oy + dy >= alley.minY && oy + dy < alley.maxY) { inAlley = true; break }
        }
        if (inAlley) break
      }
    }
    if (inAlley) continue

    const obsCenterX = ox + def.widthTiles / 2
    const obsCenterY = oy + def.heightTiles / 2
    let tooClose = false
    for (const p of existingPlaced) {
      const dx = obsCenterX - p.x
      const dy = obsCenterY - p.y
      if (dx * dx + dy * dy < cfg.minSpacing * cfg.minSpacing) {
        tooClose = true
        break
      }
    }
    if (tooClose) continue

    // Solid-layer offsets (walls + half-walls)
    const solidOffsets = [
      ...def.walls.map(o => ({ ...o, tileType: TileType.WALL })),
      ...(def.halfWalls ?? []).map(o => ({ ...o, tileType: TileType.HALF_WALL })),
    ]
    // Floor-layer offsets (hazard tiles like cactus) — already carry tileType
    const floorOffsets = def.floorTiles ?? []

    let fits = true
    for (const offset of [...solidOffsets, ...floorOffsets]) {
      const tx = ox + offset.dx
      const ty = oy + offset.dy
      if (tx <= 0 || tx >= width - 1 || ty <= 0 || ty >= height - 1) { fits = false; break }
      if (Math.abs(tx - centerX) <= clearR && Math.abs(ty - centerY) <= clearR) { fits = false; break }
      if (getTile(map, 0, tx, ty) !== TileType.EMPTY) { fits = false; break }
    }
    if (!fits) continue

    // Stamp solid-layer tiles
    for (const offset of solidOffsets) {
      setTile(map, 0, ox + offset.dx, oy + offset.dy, offset.tileType)
    }
    // Stamp floor-layer tiles (non-solid hazards)
    for (const offset of floorOffsets) {
      setTile(map, 1, ox + offset.dx, oy + offset.dy, offset.tileType)
    }

    const tiles = [...solidOffsets, ...floorOffsets].map(offset => ({
      tileX: ox + offset.dx,
      tileY: oy + offset.dy,
      tileType: offset.tileType,
    }))

    const worldCenterX = (ox + def.widthTiles / 2) * tileSize
    const worldCenterY = (oy + def.heightTiles / 2) * tileSize

    const obstacle: MapObstacle = {
      id: nextId++,
      type: def.type,
      x: worldCenterX,
      y: worldCenterY,
      tiles,
      jumpable: def.jumpable,
      widthTiles: def.widthTiles,
      heightTiles: def.heightTiles,
    }
    if (def.hp !== undefined) {
      obstacle.hp = def.hp
      obstacle.maxHp = def.hp
    }
    obstacles.push(obstacle)

    existingPlaced.push({ x: obsCenterX, y: obsCenterY })
    placedCount++
  }

  return obstacles
}

// ── Center landmarks ──────────────────────────────────────────────────

/**
 * Place hitching posts at the north and south edges of the center clear zone.
 * These indestructible half-wall landmarks orient the player during the boss
 * fight and provide light cover without obstructing the arena.
 */
function placeCenterLandmarks(
  map: Tilemap,
  centerX: number,
  centerY: number,
  clearR: number,
  tileSize: number,
): void {
  const obstacles = map.mapObstacles!
  let nextId = obstacles.length > 0 ? Math.max(...obstacles.map(o => o.id)) + 1 : 1
  const def = HITCHING_POST_DEF
  const halfW = Math.floor(def.widthTiles / 2)

  // Place just outside the north and south edges of the clear zone
  const positions = [
    { ox: centerX - halfW, oy: centerY - clearR - 2 },  // north
    { ox: centerX - halfW, oy: centerY + clearR + 1 },  // south
  ]

  for (const { ox, oy } of positions) {
    // Verify tiles are clear
    let fits = true
    const offsets = def.halfWalls ?? []
    for (const offset of offsets) {
      const tx = ox + offset.dx
      const ty = oy + offset.dy
      if (tx <= 0 || tx >= map.width - 1 || ty <= 0 || ty >= map.height - 1) { fits = false; break }
      if (getTile(map, 0, tx, ty) !== TileType.EMPTY) { fits = false; break }
    }
    if (!fits) continue

    // Stamp half-wall tiles
    for (const offset of offsets) {
      setTile(map, 0, ox + offset.dx, oy + offset.dy, TileType.HALF_WALL)
    }

    const worldCenterX = (ox + def.widthTiles / 2) * tileSize
    const worldCenterY = (oy + def.heightTiles / 2) * tileSize

    obstacles.push({
      id: nextId++,
      type: def.type,
      x: worldCenterX,
      y: worldCenterY,
      tiles: offsets.map(offset => ({
        tileX: ox + offset.dx,
        tileY: oy + offset.dy,
        tileType: TileType.HALF_WALL,
      })),
      jumpable: def.jumpable,
      widthTiles: def.widthTiles,
      heightTiles: def.heightTiles,
    })
  }
}

// ── Main orchestrator ─────────────────────────────────────────────────

export function generateArena(config: MapConfig, baseSeed: number, stageIndex: number): Tilemap {
  const mapSeed = deriveMapSeed(baseSeed, stageIndex)
  const rng = new SeededRng(mapSeed)
  const { width, height, tileSize } = config

  const map = createTilemap(width, height, tileSize)
  map.baseTiles = {
    style: config.baseTiles.style,
    variantCount: Math.max(1, Math.floor(config.baseTiles.variantCount)),
    seed: deriveBaseTileSeed(baseSeed, stageIndex),
  }
  addLayer(map, true)
  addLayer(map, false)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      setTile(map, 1, x, y, TileType.FLOOR)
    }
  }

  for (let x = 0; x < width; x++) {
    setTile(map, 0, x, 0, TileType.WALL)
    setTile(map, 0, x, height - 1, TileType.WALL)
  }
  for (let y = 0; y < height; y++) {
    setTile(map, 0, 0, y, TileType.WALL)
    setTile(map, 0, width - 1, y, TileType.WALL)
  }

  const centerX = Math.floor(width / 2)
  const centerY = Math.floor(height / 2)
  const clearR = config.centerClearRadius

  const placed: Array<{ x: number; y: number }> = []

  const buildings = config.obstacles.buildings
  let crossAlleys: SkipZone[] = []
  if (buildings) {
    const result = placeTownBuildings(
      map, rng, buildings.profiles, centerX, centerY, clearR, placed,
    )
    map.placedBuildings = result.buildings
    map.roadNetwork = result.roadNetwork
    map.crossAlleys = result.roadNetwork.crossAlleyBounds
    crossAlleys = result.roadNetwork.crossAlleyBounds
  }

  // Generic obstacles via Poisson-like sampling
  const { count, minSpacing, templates } = config.obstacles
  const maxAttempts = count * 20
  let genericPlaced = 0

  for (let attempt = 0; attempt < maxAttempts && genericPlaced < count; attempt++) {
    const ox = 2 + rng.nextInt(width - 4)
    const oy = 2 + rng.nextInt(height - 4)

    if (Math.abs(ox - centerX) <= clearR && Math.abs(oy - centerY) <= clearR) continue

    let inAlley = false
    for (const alley of crossAlleys) {
      if (oy >= alley.minY && oy < alley.maxY) { inAlley = true; break }
    }
    if (inAlley) continue

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

    const template = templates[rng.nextInt(templates.length)]!

    let fits = true
    for (const offset of template.walls) {
      const tx = ox + offset.dx
      const ty = oy + offset.dy
      if (tx <= 0 || tx >= width - 1 || ty <= 0 || ty >= height - 1) { fits = false; break }
      if (Math.abs(tx - centerX) <= clearR && Math.abs(ty - centerY) <= clearR) { fits = false; break }
      for (const alley of crossAlleys) { if (ty >= alley.minY && ty < alley.maxY) { fits = false; break } }
      if (!fits) break
      if (getTile(map, 0, tx, ty) !== TileType.EMPTY) { fits = false; break }
    }
    if (template.halfWalls) {
      for (const offset of template.halfWalls) {
        const tx = ox + offset.dx
        const ty = oy + offset.dy
        if (tx <= 0 || tx >= width - 1 || ty <= 0 || ty >= height - 1) { fits = false; break }
        if (Math.abs(tx - centerX) <= clearR && Math.abs(ty - centerY) <= clearR) { fits = false; break }
        for (const alley of crossAlleys) { if (ty >= alley.minY && ty < alley.maxY) { fits = false; break } }
        if (!fits) break
        if (getTile(map, 0, tx, ty) !== TileType.EMPTY) { fits = false; break }
      }
    }
    if (!fits) continue

    stampObstacle(map, template, ox, oy)

    placed.push({ x: ox, y: oy })
    genericPlaced++
  }

  if (config.mapObstacles) {
    const mapObstacles = placeMapObstacles(
      map, rng, config.mapObstacles, centerX, centerY, clearR, crossAlleys, placed,
    )
    map.mapObstacles = mapObstacles
  }

  // Place center landmarks (hitching posts) for town maps.
  // Two posts on opposite edges of the center clear zone provide orientation
  // and light cover for the boss arena.
  if (buildings && map.mapObstacles) {
    placeCenterLandmarks(map, centerX, centerY, clearR, tileSize)
  }

  for (const hazard of config.hazards) {
    placeHazards(map, rng, hazard, centerX, centerY, clearR)
  }

  ensureConnectivity(map, centerX, centerY)

  return map
}

/**
 * Generate a tilemap using the appropriate generator for the map config.
 */
export function generateMap(config: MapConfig, baseSeed: number, stageIndex: number): Tilemap {
  if (config.baseTiles.style === 'crossroads_dirt') {
    return generateCrossroads(config)
  }
  return generateArena(config, baseSeed, stageIndex)
}
