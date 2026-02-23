/**
 * Procedural arena generator.
 *
 * Generates a tilemap from a MapConfig using seeded RNG for deterministic
 * multiplayer-compatible maps. Uses Poisson disk sampling for obstacles,
 * bilinear value noise for hazard placement, and flood fill for connectivity.
 */

import { SeededRng } from '../../../math/rng'
import { createTilemap, addLayer, setTile, getTile, TileType, type Tilemap, type PlacedBuilding, type SkipZone, type RoadNetwork, type AlleyProfile, type SpurRoad } from '../../tilemap'
import type { MapConfig, HazardConfig } from './mapConfig'
import type { BuildingProfile } from './buildingProfiles'
import type { MapObstacle, MapObstacleDef, WeightedObstacleDef } from './mapObstacleDefs'

// ── Town layout constants ──────────────────────────────────────────────
const UNIQUE_BUILDING_IDS = new Set(['general_store', 'saloon', 'barber', 'sheriff', 'bank'])
const STREET_HALF_W = 2   // street spans [center - 2, center + 2) — 4 tiles wide, exclusive east edge
const SIDEWALK_W = 1       // 1 tile sidewalk on each side of street
const ALLEY_GAP = 1        // 1 tile horizontal gap between tier columns
const BORDER_INSET = 1     // stay 1 tile from map border
const MAX_FRONTAGE_WIDTH = 7  // widest frontage building (general_store) — used to compute back-alley X
const MAX_FILLER_WIDTH = 3    // widest filler building — used to compute far-lot X
const FRONTAGE_GAP = 1        // vertical gap between buildings on frontage (dense)
const BACK_ROW_GAP = 1        // vertical gap between buildings in back row (dense)
const FAR_LOT_GAP = 1         // vertical gap between buildings in far lots (dense)

// ── Cross alley constants ────────────────────────────────────────────
const ALLEY_MIN_DIST_FROM_BORDER = 4  // alleys stay 4 tiles from map edge
const ALLEY_MIN_DIST_FROM_CENTER = 5  // alleys stay 5 tiles from center clear zone

// ── Meandering road constants ───────────────────────────────────────
const STREET_SEGMENT_MIN = 5   // min rows before main street shifts
const STREET_SEGMENT_MAX = 8   // max rows before main street shifts
const STREET_MAX_DRIFT = 3     // max ±tiles from base center X

const ALLEY_SEGMENT_MIN = 8   // min columns before alley shifts
const ALLEY_SEGMENT_MAX = 12  // max columns before alley shifts
const ALLEY_MAX_DRIFT = 1     // max ±tiles from base center Y

const SPUR_COUNT_MIN = 4      // min spur roads per side
const SPUR_COUNT_MAX = 6      // max spur roads per side
const SPUR_WIDTH = 2          // spur road height in tiles
const SPUR_LENGTH_MIN = 4     // min spur length in tiles
const SPUR_LENGTH_MAX = 8     // max spur length in tiles
const SPUR_MIN_SPACING = 3    // min Y gap between spur roads

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
 * Generate a per-row center X for the main street.
 * Random walk with ±1 shifts every 5-8 rows, clamped to ±STREET_MAX_DRIFT.
 */
function generateStreetProfile(rng: SeededRng, baseCenterX: number, mapHeight: number): number[] {
  const profile = new Array<number>(mapHeight)
  let currentX = baseCenterX
  let segmentRemaining = STREET_SEGMENT_MIN + rng.nextInt(STREET_SEGMENT_MAX - STREET_SEGMENT_MIN + 1)

  for (let y = 0; y < mapHeight; y++) {
    profile[y] = currentX

    segmentRemaining--
    if (segmentRemaining <= 0) {
      // Pick a direction: -1, 0, +1
      const dir = rng.nextInt(3) - 1
      const next = currentX + dir
      if (Math.abs(next - baseCenterX) <= STREET_MAX_DRIFT) {
        currentX = next
      }
      segmentRemaining = STREET_SEGMENT_MIN + rng.nextInt(STREET_SEGMENT_MAX - STREET_SEGMENT_MIN + 1)
    }
  }

  return profile
}

/**
 * Generate a per-column center Y for a cross alley.
 * Random walk with ±1 shifts every 8-12 columns, clamped to ±ALLEY_MAX_DRIFT.
 * Returns an AlleyProfile with the profile and bounding SkipZone.
 */
function generateAlleyProfile(
  rng: SeededRng,
  baseCenterY: number,
  alleyWidth: number,
  mapWidth: number,
): AlleyProfile {
  const profile = new Array<number>(mapWidth)
  let currentY = baseCenterY
  let segmentRemaining = ALLEY_SEGMENT_MIN + rng.nextInt(ALLEY_SEGMENT_MAX - ALLEY_SEGMENT_MIN + 1)

  let minY = baseCenterY
  let maxY = baseCenterY

  for (let x = 0; x < mapWidth; x++) {
    profile[x] = currentY
    if (currentY < minY) minY = currentY
    if (currentY > maxY) maxY = currentY

    segmentRemaining--
    if (segmentRemaining <= 0) {
      const dir = rng.nextInt(3) - 1
      const next = currentY + dir
      if (Math.abs(next - baseCenterY) <= ALLEY_MAX_DRIFT) {
        currentY = next
      }
      segmentRemaining = ALLEY_SEGMENT_MIN + rng.nextInt(ALLEY_SEGMENT_MAX - ALLEY_SEGMENT_MIN + 1)
    }
  }

  // Bounding envelope: half-width above min, half-width below max
  const halfW = Math.floor(alleyWidth / 2)
  const boundsMinY = minY - halfW
  const boundsMaxY = maxY - halfW + alleyWidth

  return {
    profile,
    width: alleyWidth,
    bounds: { minY: boundsMinY, maxY: boundsMaxY },
  }
}

/**
 * Generate spur roads branching off the main street.
 * Picks Y positions avoiding skip zones, with minimum spacing between spurs.
 */
function generateSpurRoads(
  rng: SeededRng,
  streetProfile: number[],
  mapHeight: number,
  mapWidth: number,
  skipZones: SkipZone[],
): SpurRoad[] {
  const spurs: SpurRoad[] = []

  for (const direction of [-1, 1] as const) {
    const count = SPUR_COUNT_MIN + rng.nextInt(SPUR_COUNT_MAX - SPUR_COUNT_MIN + 1)
    const placed: number[] = []

    for (let attempt = 0; attempt < count * 10 && placed.length < count; attempt++) {
      const y = 2 + rng.nextInt(mapHeight - 4 - SPUR_WIDTH)
      const length = SPUR_LENGTH_MIN + rng.nextInt(SPUR_LENGTH_MAX - SPUR_LENGTH_MIN + 1)

      // Check minimum spacing from other spurs on this side
      let tooClose = false
      for (const py of placed) {
        if (Math.abs(y - py) < SPUR_MIN_SPACING + SPUR_WIDTH) {
          tooClose = true
          break
        }
      }
      if (tooClose) continue

      // Check not overlapping skip zones
      let inSkip = false
      for (const zone of skipZones) {
        if (y < zone.maxY && y + SPUR_WIDTH > zone.minY) {
          inSkip = true
          break
        }
      }
      if (inSkip) continue

      // Compute startX from the street edge at this row
      const streetCenter = streetProfile[y]!
      const startX = direction === -1
        ? streetCenter - STREET_HALF_W - 1
        : streetCenter + STREET_HALF_W

      // Ensure spur stays within map bounds
      const endX = startX + direction * length
      if (endX < 1 || endX >= mapWidth - 1) continue

      spurs.push({ y, height: SPUR_WIDTH, startX, length, direction })
      placed.push(y)
    }
  }

  return spurs
}

/**
 * Generate the road network for a town map.
 *
 * Produces a main street offset and 0-2 horizontal cross alleys that cut
 * laterally across the town, creating distinct blocks.
 *
 * Distribution: 0 alleys (25%), 1 alley (50%), 2 alleys (25%).
 */
export function generateRoadNetwork(
  rng: SeededRng,
  centerX: number,
  centerY: number,
  clearR: number,
  mapHeight: number,
  mapWidth: number,
): RoadNetwork {
  // Main street offset: ±3 tiles from center X
  const streetCenterX = centerX + rng.nextInt(7) - 3

  // Generate meandering main street profile
  const streetProfile = generateStreetProfile(rng, streetCenterX, mapHeight)

  // Cross alley count: 0 (25%), 1 (50%), 2 (25%)
  const roll = rng.nextInt(4)
  const alleyCount = roll === 0 ? 0 : roll <= 2 ? 1 : 2

  const alleys: AlleyProfile[] = []

  // Candidate zones above and below center clear area
  const clearMinY = centerY - clearR
  const clearMaxY = centerY + clearR + 1

  const topZoneMin = ALLEY_MIN_DIST_FROM_BORDER
  const topZoneMax = clearMinY - ALLEY_MIN_DIST_FROM_CENTER
  const bottomZoneMin = clearMaxY + ALLEY_MIN_DIST_FROM_CENTER
  const bottomZoneMax = mapHeight - 1 - ALLEY_MIN_DIST_FROM_BORDER

  // Build candidate zones (top / bottom of center), shuffle for variety
  const zones: Array<{ min: number; max: number }> = []
  if (topZoneMax - topZoneMin >= 2) zones.push({ min: topZoneMin, max: topZoneMax })
  if (bottomZoneMax - bottomZoneMin >= 2) zones.push({ min: bottomZoneMin, max: bottomZoneMax })
  shuffleInPlace(zones, rng)

  for (let i = 0; i < alleyCount && i < zones.length; i++) {
    const zone = zones[i]!
    const alleyWidth = 2 + rng.nextInt(2) // 2 or 3 tiles wide
    // Account for drift padding when computing max start position
    const maxStart = zone.max - alleyWidth - ALLEY_MAX_DRIFT
    if (maxStart < zone.min + ALLEY_MAX_DRIFT) continue
    const startY = zone.min + ALLEY_MAX_DRIFT + rng.nextInt(maxStart - zone.min - ALLEY_MAX_DRIFT + 1)
    const alleyProfile = generateAlleyProfile(rng, startY, alleyWidth, mapWidth)
    alleys.push(alleyProfile)
  }

  // Sort by bounds minY for deterministic cursor advancement in placeStrip
  alleys.sort((a, b) => a.bounds.minY - b.bounds.minY)

  // Derive bounding skip zones from alley profiles
  const crossAlleyBounds = alleys.map(a => a.bounds)

  // Generate spur roads
  const spurs = generateSpurRoads(rng, streetProfile, mapHeight, mapWidth, [
    { minY: centerY - clearR, maxY: centerY + clearR + 1 },
    ...crossAlleyBounds,
  ])

  return { streetCenterX, streetProfile, alleys, crossAlleyBounds, spurs }
}

/**
 * Build a sorted array of skip zones from the center clear zone and cross alleys.
 */
function buildSkipZones(
  centerY: number,
  clearR: number,
  crossAlleys: SkipZone[],
  includeCenter: boolean,
): SkipZone[] {
  const zones: SkipZone[] = []
  if (includeCenter) {
    zones.push({ minY: centerY - clearR, maxY: centerY + clearR + 1 })
  }
  zones.push(...crossAlleys)
  zones.sort((a, b) => a.minY - b.minY)
  return zones
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

  // Track all placed obstacle centers for spacing checks
  const placed: Array<{ x: number; y: number }> = []

  // 4. Place buildings (if configured) via strip-based main street layout
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

  // 5. Place generic obstacles via Poisson-like sampling
  const { count, minSpacing, templates } = config.obstacles
  const maxAttempts = count * 20
  let genericPlaced = 0

  for (let attempt = 0; attempt < maxAttempts && genericPlaced < count; attempt++) {
    // Pick a random position (inset from borders by 2 tiles)
    const ox = 2 + rng.nextInt(width - 4)
    const oy = 2 + rng.nextInt(height - 4)

    // Reject if in exclusion zone
    if (Math.abs(ox - centerX) <= clearR && Math.abs(oy - centerY) <= clearR) continue

    // Reject if in a cross alley corridor
    let inAlley = false
    for (const alley of crossAlleys) {
      if (oy >= alley.minY && oy < alley.maxY) { inAlley = true; break }
    }
    if (inAlley) continue

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

    // Check all tiles of the template fit and don't overlap exclusion zone, borders, or alleys
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

    // Stamp the template
    stampObstacle(map, template, ox, oy)

    placed.push({ x: ox, y: oy })
    genericPlaced++
  }

  // 5b. Place strategic map obstacles (crates, barrels, boulders, etc.)
  if (config.mapObstacles) {
    const mapObstacles = placeMapObstacles(
      map, rng, config.mapObstacles, centerX, centerY, clearR, crossAlleys, placed,
    )
    map.mapObstacles = mapObstacles
  }

  // 6. Hazard scattering via interpolated value noise
  for (const hazard of config.hazards) {
    placeHazards(map, rng, hazard, centerX, centerY, clearR)
  }

  // 7. Connectivity check — removes walls in solid layer only; floor/road tiles unaffected
  ensureConnectivity(map, centerX, centerY)

  return map
}

/**
 * Stamp an obstacle (template or building profile) onto the solid layer.
 */
function stampObstacle(
  map: Tilemap,
  template: { walls: Array<{ dx: number; dy: number }>; halfWalls?: Array<{ dx: number; dy: number }> },
  ox: number,
  oy: number,
): void {
  for (const offset of template.walls) {
    setTile(map, 0, ox + offset.dx, oy + offset.dy, TileType.WALL)
  }
  if (template.halfWalls) {
    for (const offset of template.halfWalls) {
      setTile(map, 0, ox + offset.dx, oy + offset.dy, TileType.HALF_WALL)
    }
  }
}

// ── Map obstacle placement ────────────────────────────────────────────

/**
 * Pick a weighted random obstacle definition from a pool.
 */
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

/**
 * Place strategic map obstacles via Poisson-like sampling.
 * Returns an array of MapObstacle state objects for world.mapObstacles.
 */
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

    // Pick a random tile position (inset from borders by 2 tiles)
    const ox = 2 + rng.nextInt(width - 4 - (def.widthTiles - 1))
    const oy = 2 + rng.nextInt(height - 4 - (def.heightTiles - 1))

    // Reject if in center exclusion zone
    if (Math.abs(ox - centerX) <= clearR + 1 && Math.abs(oy - centerY) <= clearR + 1) continue

    // Reject if in a cross alley corridor
    let inAlley = false
    for (const alley of crossAlleys) {
      if (oy >= alley.minY - 1 && oy + def.heightTiles <= alley.maxY + 1) {
        // Check if any tile row overlaps the alley
        for (let dy = 0; dy < def.heightTiles; dy++) {
          if (oy + dy >= alley.minY && oy + dy < alley.maxY) { inAlley = true; break }
        }
        if (inAlley) break
      }
    }
    if (inAlley) continue

    // Reject if too close to existing obstacles/buildings
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

    // Collect all tile positions and check they fit
    const allOffsets = [
      ...def.walls.map(o => ({ ...o, tileType: TileType.WALL })),
      ...(def.halfWalls ?? []).map(o => ({ ...o, tileType: TileType.HALF_WALL })),
    ]

    let fits = true
    for (const offset of allOffsets) {
      const tx = ox + offset.dx
      const ty = oy + offset.dy
      if (tx <= 0 || tx >= width - 1 || ty <= 0 || ty >= height - 1) { fits = false; break }
      if (Math.abs(tx - centerX) <= clearR && Math.abs(ty - centerY) <= clearR) { fits = false; break }
      if (getTile(map, 0, tx, ty) !== TileType.EMPTY) { fits = false; break }
    }
    if (!fits) continue

    // Stamp tiles
    for (const offset of allOffsets) {
      setTile(map, 0, ox + offset.dx, oy + offset.dy, offset.tileType)
    }

    // Build tile coordinate list
    const tiles = allOffsets.map(offset => ({
      tileX: ox + offset.dx,
      tileY: oy + offset.dy,
      tileType: offset.tileType,
    }))

    // World-space center of the obstacle
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

// ── Town building placement helpers ────────────────────────────────────

/** Fisher-Yates shuffle using seeded RNG for determinism. */
function shuffleInPlace<T>(arr: T[], rng: SeededRng): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1)
    const tmp = arr[i]!
    arr[i] = arr[j]!
    arr[j] = tmp
  }
}

/** Check that every tile of a building profile fits on the map without overlapping existing walls. */
function canStampBuilding(map: Tilemap, profile: BuildingProfile, ox: number, oy: number): boolean {
  const { width, height } = map
  for (const offset of profile.walls) {
    const tx = ox + offset.dx
    const ty = oy + offset.dy
    if (tx <= 0 || tx >= width - 1 || ty <= 0 || ty >= height - 1) return false
    if (getTile(map, 0, tx, ty) !== TileType.EMPTY) return false
  }
  if (profile.halfWalls) {
    for (const offset of profile.halfWalls) {
      const tx = ox + offset.dx
      const ty = oy + offset.dy
      if (tx <= 0 || tx >= width - 1 || ty <= 0 || ty >= height - 1) return false
      if (getTile(map, 0, tx, ty) !== TileType.EMPTY) return false
    }
  }
  return true
}

/** Stamp a building onto the map: collision tiles, interior floor, and bookkeeping. */
function stampBuilding(
  map: Tilemap,
  profile: BuildingProfile,
  ox: number,
  oy: number,
  placedBuildings: PlacedBuilding[],
  placedCenters: Array<{ x: number; y: number }>,
): void {
  stampObstacle(map, profile, ox, oy)

  // Interior floor (skip bottom-most row to blend with surrounding tiles)
  const floorType = profile.interiorFloor ?? TileType.WOOD_FLOOR
  for (let dy = 0; dy < profile.heightTiles - 1; dy++) {
    for (let dx = 0; dx < profile.widthTiles; dx++) {
      setTile(map, 1, ox + dx, oy + dy, floorType)
    }
  }

  placedBuildings.push({ profileId: profile.id, tileX: ox, tileY: oy })
  placedCenters.push({ x: ox + profile.widthTiles / 2, y: oy + profile.heightTiles / 2 })
}

/**
 * Place a vertical strip of buildings, advancing a Y-cursor and skipping
 * any skip zones (center clear zone, cross alleys) that a building would overlap.
 *
 * @param computeX - Given a profile, returns the tile X for placement
 * @param skipZones - Sorted array of Y ranges to skip (center clear zone + cross alleys)
 */
function placeStrip(
  map: Tilemap,
  queue: BuildingProfile[],
  computeX: (profile: BuildingProfile) => number,
  skipZones: SkipZone[],
  placedBuildings: PlacedBuilding[],
  placedCenters: Array<{ x: number; y: number }>,
  gap: number = FRONTAGE_GAP,
  rng?: SeededRng,
  startYOffset: number = 0,
  yGapJitter: number = 0,
): void {
  let cursor = BORDER_INSET + startYOffset

  for (const profile of queue) {
    // Skip over any zones the building would overlap in Y
    for (const zone of skipZones) {
      if (cursor < zone.maxY && cursor + profile.heightTiles > zone.minY) {
        cursor = zone.maxY + gap
      }
    }

    // Check if building fits vertically (last tile must be before border wall)
    // Use continue (not break) so smaller buildings later in the queue can still fill the gap
    if (cursor + profile.heightTiles > map.height - 1) continue

    const ox = computeX(profile)
    if (!canStampBuilding(map, profile, ox, cursor)) {
      // Can't place — skip this building without advancing cursor
      continue
    }

    stampBuilding(map, profile, ox, cursor, placedBuildings, placedCenters)
    cursor += profile.heightTiles + gap + (rng && yGapJitter > 0 ? rng.nextInt(yGapJitter + 1) : 0)
  }
}

/**
 * Build a filler queue by cycling through shuffled filler templates.
 * Each call gets a fresh shuffle for variety across strips.
 */
function buildFillerQueue(rng: SeededRng, fillerProfiles: BuildingProfile[], count: number): BuildingProfile[] {
  const shuffled = [...fillerProfiles]
  shuffleInPlace(shuffled, rng)
  const queue: BuildingProfile[] = []
  for (let i = 0; i < count; i++) {
    queue.push(shuffled[i % shuffled.length]!)
  }
  return queue
}

/**
 * Dense 3-tier town layout for Stage 1 (Town).
 *
 * Generates a road network (main street + 0-2 cross alleys) first, then
 * organises buildings in three depth tiers on each side of the main street:
 * - Frontage (dense, gap=1): mixed unique + filler buildings, skip center + alleys
 * - Back row (dense, gap=1): mixed unique + filler buildings, skip alleys only
 * - Far lots (dense, gap=1): filler only (width ≤ 3) + water towers, skip alleys only
 *
 * Cross alleys create horizontal corridors through the town, breaking the layout
 * into distinct blocks. 0 alleys = classic single-street, 1 = T-intersection,
 * 2 = grid of blocks.
 */
function placeTownBuildings(
  map: Tilemap,
  rng: SeededRng,
  profiles: BuildingProfile[],
  centerX: number,
  centerY: number,
  clearR: number,
  placedCenters: Array<{ x: number; y: number }>,
): { buildings: PlacedBuilding[]; roadNetwork: RoadNetwork } {
  const placedBuildings: PlacedBuilding[] = []

  // 1. Generate road network (main street offset + cross alleys + spurs)
  const roadNetwork = generateRoadNetwork(rng, centerX, centerY, clearR, map.height, map.width)
  const { streetCenterX, crossAlleyBounds } = roadNetwork

  // 2. Build skip zone arrays
  //    Frontage: skip center clear zone + cross alley bounds
  //    Outer strips (back row, far lots): skip cross alley bounds only
  const frontageSkipZones = buildSkipZones(centerY, clearR, crossAlleyBounds, true)
  const outerSkipZones = buildSkipZones(centerY, clearR, crossAlleyBounds, false)

  // 3. Separate water towers (noDither) from regular buildings
  const noDitherBuildings: BuildingProfile[] = []
  const regularProfiles: BuildingProfile[] = []
  for (const p of profiles) {
    if (p.noDither) noDitherBuildings.push(p)
    else regularProfiles.push(p)
  }

  // 4. Deal unique buildings to strips
  //    Tall buildings (height >= 7) go to back row strips (2,3) which have more
  //    vertical space (they don't skip center). Short ones deal round-robin.
  const unique = regularProfiles.filter(p => UNIQUE_BUILDING_IDS.has(p.id))
  const filler = regularProfiles.filter(p => !UNIQUE_BUILDING_IDS.has(p.id))
  shuffleInPlace(unique, rng)

  const tallUnique: BuildingProfile[] = []
  const shortUnique: BuildingProfile[] = []
  for (const p of unique) {
    if (p.heightTiles >= 7) tallUnique.push(p)
    else shortUnique.push(p)
  }

  const innerStrips: BuildingProfile[][] = [[], [], [], []]
  // Tall uniques → back row strips (index 2=westBack, 3=eastBack)
  for (let i = 0; i < tallUnique.length; i++) {
    innerStrips[2 + (i % 2)]!.push(tallUnique[i]!)
  }
  // Short uniques → round-robin across all 4 strips
  for (let i = 0; i < shortUnique.length; i++) {
    innerStrips[i % 4]!.push(shortUnique[i]!)
  }

  // 5. Build filler pool, shuffle, and deal round-robin after unique
  const INNER_FILLER_COUNT = 28
  const fillerPool = buildFillerQueue(rng, filler, INNER_FILLER_COUNT)
  shuffleInPlace(fillerPool, rng)
  for (let i = 0; i < fillerPool.length; i++) {
    innerStrips[i % 4]!.push(fillerPool[i]!)
  }

  const westFrontage = innerStrips[0]!
  const eastFrontage = innerStrips[1]!
  const westBackRow = innerStrips[2]!
  const eastBackRow = innerStrips[3]!

  // 6. Far lots: water towers first, then regular filler
  const FAR_LOT_FILLER_COUNT = 10
  const westFarLots = [...noDitherBuildings, ...buildFillerQueue(rng, filler, FAR_LOT_FILLER_COUNT)]
  const eastFarLots = [...noDitherBuildings, ...buildFillerQueue(rng, filler, FAR_LOT_FILLER_COUNT)]

  // 7. Compute X positions for 3 tiers
  const westSidewalkX = streetCenterX - STREET_HALF_W - SIDEWALK_W
  const eastFrontageX = streetCenterX + STREET_HALF_W + SIDEWALK_W

  const westBackAlleyEdge = westSidewalkX - MAX_FRONTAGE_WIDTH - ALLEY_GAP
  const eastBackAlleyStart = eastFrontageX + MAX_FRONTAGE_WIDTH + ALLEY_GAP

  const westFarLotEdge = westBackAlleyEdge - MAX_FILLER_WIDTH - ALLEY_GAP
  const eastFarLotStart = eastBackAlleyStart + MAX_FILLER_WIDTH + ALLEY_GAP

  // Per-building X jitter: reduced for frontage (0-1) for tighter street edge
  const computeWestFrontageX = (p: BuildingProfile) => westSidewalkX - p.widthTiles - rng.nextInt(2)
  const computeEastFrontageX = (_p: BuildingProfile) => eastFrontageX + rng.nextInt(2)
  const computeWestBackRowX = (p: BuildingProfile) => westBackAlleyEdge - p.widthTiles - rng.nextInt(2)
  const computeEastBackRowX = (_p: BuildingProfile) => eastBackAlleyStart + rng.nextInt(2)
  const computeWestFarLotX = (p: BuildingProfile) => westFarLotEdge - p.widthTiles - rng.nextInt(2)
  const computeEastFarLotX = (_p: BuildingProfile) => eastFarLotStart + rng.nextInt(2)

  // 8. Per-strip Y-cursor start offsets (stagger building rows)
  //    Skip jitter when the first building is noDither (water tower) — those
  //    must sit at the top edge so the roof extends off-map.
  const yOffset = (queue: BuildingProfile[]) =>
    queue.length > 0 && queue[0]!.noDither ? 0 : rng.nextInt(2)

  const westFrontageYOff = yOffset(westFrontage)
  const eastFrontageYOff = yOffset(eastFrontage)
  const westBackRowYOff = yOffset(westBackRow)
  const eastBackRowYOff = yOffset(eastBackRow)
  const westFarLotsYOff = yOffset(westFarLots)
  const eastFarLotsYOff = yOffset(eastFarLots)

  // 9. Place all 6 strips
  // Frontage: dense (gap=1), skip center + cross alleys, slight Y gap jitter
  placeStrip(map, westFrontage, computeWestFrontageX, frontageSkipZones, placedBuildings, placedCenters, FRONTAGE_GAP, rng, westFrontageYOff, 1)
  placeStrip(map, eastFrontage, computeEastFrontageX, frontageSkipZones, placedBuildings, placedCenters, FRONTAGE_GAP, rng, eastFrontageYOff, 1)

  // Back row: dense (gap=1), skip cross alleys only
  placeStrip(map, westBackRow, computeWestBackRowX, outerSkipZones, placedBuildings, placedCenters, BACK_ROW_GAP, rng, westBackRowYOff, 0)
  placeStrip(map, eastBackRow, computeEastBackRowX, outerSkipZones, placedBuildings, placedCenters, BACK_ROW_GAP, rng, eastBackRowYOff, 0)

  // Far lots: dense (gap=1), skip cross alleys only
  placeStrip(map, westFarLots, computeWestFarLotX, outerSkipZones, placedBuildings, placedCenters, FAR_LOT_GAP, rng, westFarLotsYOff, 0)
  placeStrip(map, eastFarLots, computeEastFarLotX, outerSkipZones, placedBuildings, placedCenters, FAR_LOT_GAP, rng, eastFarLotsYOff, 0)

  // 10. Verify all unique buildings were placed (catch layout geometry regressions)
  if (process.env.NODE_ENV !== 'production') {
    const finalPlacedIds = new Set(placedBuildings.map(b => b.profileId))
    for (const id of UNIQUE_BUILDING_IDS) {
      if (!finalPlacedIds.has(id)) {
        console.warn(`[mapGenerator] unique building '${id}' failed to place — check strip geometry`)
      }
    }
  }

  // 11. Stamp road tiles on floor layer for main street + cross alleys + spurs
  //     Skip tiles inside building footprints (the bottom row of each building
  //     stays as FLOOR since stampBuilding intentionally omits it from WOOD_FLOOR).
  const floorLayer = map.layers[1]!
  const solidLayer = map.layers[0]!

  const buildingFootprint = new Set<number>()
  for (const b of placedBuildings) {
    const profile = profiles.find(p => p.id === b.profileId)
    if (!profile) continue
    for (let dy = 0; dy < profile.heightTiles; dy++) {
      for (let dx = 0; dx < profile.widthTiles; dx++) {
        buildingFootprint.add((b.tileY + dy) * map.width + (b.tileX + dx))
      }
    }
  }

  /** Stamp a single road tile if valid (bounds, not solid, not interior floor, not in building) */
  const stampRoadTile = (x: number, y: number) => {
    if (x < 1 || x >= map.width - 1 || y < 1 || y >= map.height - 1) return
    const idx = y * map.width + x
    if (solidLayer.data[idx] !== TileType.EMPTY) return
    if (floorLayer.data[idx] !== TileType.FLOOR && floorLayer.data[idx] !== TileType.ROAD) return
    if (buildingFootprint.has(idx)) return
    floorLayer.data[idx] = TileType.ROAD
  }

  // Main street: 4 tiles wide, using per-row profile for center X
  const { streetProfile, alleys, spurs } = roadNetwork
  for (let y = 1; y < map.height - 1; y++) {
    const cx = streetProfile[y]!
    const minX = cx - STREET_HALF_W
    const maxX = cx + STREET_HALF_W
    for (let x = minX; x < maxX; x++) {
      stampRoadTile(x, y)
    }

    // Corner fill: when profile shifts, stamp the union rectangle to prevent diagonal gaps
    if (y > 1) {
      const prevCx = streetProfile[y - 1]!
      if (cx !== prevCx) {
        const unionMinX = Math.min(cx, prevCx) - STREET_HALF_W
        const unionMaxX = Math.max(cx, prevCx) + STREET_HALF_W
        for (let x = unionMinX; x < unionMaxX; x++) {
          stampRoadTile(x, y)
          stampRoadTile(x, y - 1)
        }
      }
    }
  }

  // Cross alleys: per-column profile for center Y, with corner fill at bends
  for (const alley of alleys) {
    const halfW = Math.floor(alley.width / 2)
    for (let x = 1; x < map.width - 1; x++) {
      const cy = alley.profile[x]!
      const minY = cy - halfW
      const maxY = minY + alley.width
      for (let y = minY; y < maxY; y++) {
        stampRoadTile(x, y)
      }

      // Corner fill at bends
      if (x > 1) {
        const prevCy = alley.profile[x - 1]!
        if (cy !== prevCy) {
          const unionMinY = Math.min(cy, prevCy) - halfW
          const unionMaxY = Math.max(cy, prevCy) - halfW + alley.width
          for (let y = unionMinY; y < unionMaxY; y++) {
            stampRoadTile(x, y)
            stampRoadTile(x - 1, y)
          }
        }
      }
    }
  }

  // Spur roads: short side streets branching off main street
  for (const spur of spurs) {
    const dir = spur.direction
    for (let i = 0; i < spur.length; i++) {
      const x = spur.startX + dir * i
      for (let dy = 0; dy < spur.height; dy++) {
        stampRoadTile(x, spur.y + dy)
      }
    }
  }

  return { buildings: placedBuildings, roadNetwork }
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
