/**
 * Procedural arena generator.
 *
 * Generates a tilemap from a MapConfig using seeded RNG for deterministic
 * multiplayer-compatible maps. Uses Poisson disk sampling for obstacles,
 * bilinear value noise for hazard placement, and flood fill for connectivity.
 */

import { SeededRng } from '../../../math/rng'
import { createTilemap, addLayer, setTile, getTile, TileType, type Tilemap, type PlacedBuilding } from '../../tilemap'
import type { MapConfig, HazardConfig } from './mapConfig'
import type { BuildingProfile } from './buildingProfiles'

// ── Town layout constants ──────────────────────────────────────────────
const UNIQUE_BUILDING_IDS = new Set(['general_store', 'saloon', 'barber', 'sheriff', 'bank'])
const STREET_HALF_W = 2   // street is 4 tiles wide (centered on map centerX)
const SIDEWALK_W = 1       // 1 tile sidewalk on each side of street
const ALLEY_GAP = 1        // 1 tile horizontal gap between tier columns
const BORDER_INSET = 2     // stay 2 tiles from map border
const MAX_FRONTAGE_WIDTH = 7  // widest frontage building (general_store) — used to compute back-alley X
const MAX_FILLER_WIDTH = 3    // widest filler building — used to compute far-lot X
const FRONTAGE_GAP = 1        // vertical gap between buildings on frontage (dense)
const BACK_ROW_GAP = 2        // vertical gap between buildings in back row (medium)
const FAR_LOT_GAP = 3         // vertical gap between buildings in far lots (sparse)

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

  // Track all placed obstacle centers for spacing checks
  const placed: Array<{ x: number; y: number }> = []

  // 4. Place buildings (if configured) via strip-based main street layout
  const buildings = config.obstacles.buildings
  if (buildings) {
    map.placedBuildings = placeTownBuildings(
      map, rng, buildings.profiles, centerX, centerY, clearR, placed,
    )
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
      if (getTile(map, 0, tx, ty) !== TileType.EMPTY) { fits = false; break }
    }
    if (template.halfWalls) {
      for (const offset of template.halfWalls) {
        const tx = ox + offset.dx
        const ty = oy + offset.dy
        if (tx <= 0 || tx >= width - 1 || ty <= 0 || ty >= height - 1) { fits = false; break }
        if (Math.abs(tx - centerX) <= clearR && Math.abs(ty - centerY) <= clearR) { fits = false; break }
        if (getTile(map, 0, tx, ty) !== TileType.EMPTY) { fits = false; break }
      }
    }
    if (!fits) continue

    // Stamp the template
    stampObstacle(map, template, ox, oy)

    placed.push({ x: ox, y: oy })
    genericPlaced++
  }

  // 6. Hazard scattering via interpolated value noise
  for (const hazard of config.hazards) {
    placeHazards(map, rng, hazard, centerX, centerY, clearR)
  }

  // 7. Connectivity check — remove walls that create unreachable pockets
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
 * Place a vertical strip of buildings, advancing a Y-cursor and skipping the
 * center clear zone when a building would overlap it.
 *
 * @param computeX - Given a profile, returns the tile X for placement
 * @param skipClearZone - Whether to skip the center clear zone (frontage yes, outskirts no)
 * @param clearMinY / clearMaxY - Y bounds of the clear zone (exclusive top of maxY)
 */
function placeStrip(
  map: Tilemap,
  queue: BuildingProfile[],
  computeX: (profile: BuildingProfile) => number,
  skipClearZone: boolean,
  clearMinY: number,
  clearMaxY: number,
  placedBuildings: PlacedBuilding[],
  placedCenters: Array<{ x: number; y: number }>,
  gap: number = FRONTAGE_GAP,
): void {
  let cursor = BORDER_INSET

  for (const profile of queue) {
    // Skip over center clear zone if building would overlap it in Y
    if (skipClearZone && cursor < clearMaxY && cursor + profile.heightTiles > clearMinY) {
      cursor = clearMaxY + gap
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
    cursor += profile.heightTiles + gap
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
 * Organises buildings in three depth tiers on each side of a vertical main street:
 * - Frontage (dense, gap=1): unique named buildings + filler copies
 * - Back row (medium, gap=2): filler copies behind the frontage
 * - Far lots (sparse, gap=3): filler copies at the town edges
 *
 * Filler profiles are reused across strips — same sprite, multiple placements.
 * Expected total: ~25-35 buildings (vs 14 in the single-tier layout).
 */
function placeTownBuildings(
  map: Tilemap,
  rng: SeededRng,
  profiles: BuildingProfile[],
  centerX: number,
  centerY: number,
  clearR: number,
  placedCenters: Array<{ x: number; y: number }>,
): PlacedBuilding[] {
  const placedBuildings: PlacedBuilding[] = []

  // 1. Split profiles into unique (named) and filler
  const unique: BuildingProfile[] = []
  const filler: BuildingProfile[] = []
  for (const p of profiles) {
    if (UNIQUE_BUILDING_IDS.has(p.id)) unique.push(p)
    else filler.push(p)
  }

  // 2. Shuffle both lists for variety across seeds
  shuffleInPlace(unique, rng)
  shuffleInPlace(filler, rng)

  // 3. Sort unique by height descending so tallest go to opposite sides
  //    (prevents two h=8 buildings from exhausting one strip). The shuffle
  //    above is still effective: for equal-height pairs, it randomises
  //    which goes west vs east.
  unique.sort((a, b) => b.heightTiles - a.heightTiles)

  // 4. Alternate unique to west/east frontage
  const westUnique: BuildingProfile[] = []
  const eastUnique: BuildingProfile[] = []
  for (let i = 0; i < unique.length; i++) {
    if (i % 2 === 0) westUnique.push(unique[i]!)
    else eastUnique.push(unique[i]!)
  }

  // 5. Gap optimization: keep tallest first, sort rest ascending so shortest
  //    unique fits in the gap between tallest building and the clear zone
  const sortRestAscending = (arr: BuildingProfile[]) => {
    if (arr.length <= 1) return arr
    const [first, ...rest] = arr
    rest.sort((a, b) => a.heightTiles - b.heightTiles)
    return [first!, ...rest]
  }

  // 6. Build filler queues for each of 6 strips
  //    noDither buildings (water towers) only go in far lots — inner strips
  //    would hide things placed behind them since they never go transparent.
  const innerFiller = filler.filter(p => !p.noDither)
  const FRONTAGE_FILLER_COUNT = 6
  const BACK_ROW_FILLER_COUNT = 8
  const FAR_LOT_FILLER_COUNT = 6

  const westFrontageFiller = buildFillerQueue(rng, innerFiller, FRONTAGE_FILLER_COUNT)
  const eastFrontageFiller = buildFillerQueue(rng, innerFiller, FRONTAGE_FILLER_COUNT)
  const westBackRow = buildFillerQueue(rng, innerFiller, BACK_ROW_FILLER_COUNT)
  const eastBackRow = buildFillerQueue(rng, innerFiller, BACK_ROW_FILLER_COUNT)
  const westFarLots = buildFillerQueue(rng, filler, FAR_LOT_FILLER_COUNT)
  const eastFarLots = buildFillerQueue(rng, filler, FAR_LOT_FILLER_COUNT)

  // 7. Combine frontage queues: unique first, then filler
  const westFrontage = [...sortRestAscending(westUnique), ...westFrontageFiller]
  const eastFrontage = [...sortRestAscending(eastUnique), ...eastFrontageFiller]

  // 8. Compute X positions for 3 tiers
  //    Street corridor: centerX-2 .. centerX+1  (4 tiles wide)
  //    Sidewalks: 1 tile on each side of street
  const westSidewalkX = centerX - STREET_HALF_W - SIDEWALK_W  // x=22 for 50-wide map
  const eastFrontageX = centerX + STREET_HALF_W + SIDEWALK_W  // x=28

  const westBackAlleyEdge = westSidewalkX - MAX_FRONTAGE_WIDTH - ALLEY_GAP  // 22-7-1=14
  const eastBackAlleyStart = eastFrontageX + MAX_FRONTAGE_WIDTH + ALLEY_GAP  // 28+7+1=36

  const westFarLotEdge = westBackAlleyEdge - MAX_FILLER_WIDTH - ALLEY_GAP   // 14-3-1=10
  const eastFarLotStart = eastBackAlleyStart + MAX_FILLER_WIDTH + ALLEY_GAP  // 36+3+1=40

  const computeWestFrontageX = (p: BuildingProfile) => westSidewalkX - p.widthTiles
  const computeEastFrontageX = (_p: BuildingProfile) => eastFrontageX
  const computeWestBackRowX = (p: BuildingProfile) => westBackAlleyEdge - p.widthTiles
  const computeEastBackRowX = (_p: BuildingProfile) => eastBackAlleyStart
  const computeWestFarLotX = (p: BuildingProfile) => westFarLotEdge - p.widthTiles
  const computeEastFarLotX = (_p: BuildingProfile) => eastFarLotStart

  // Clear zone Y bounds
  const clearMinY = centerY - clearR
  const clearMaxY = centerY + clearR + 1

  // 9. Place all 6 strips
  // Frontage: dense (gap=1), skip clear zone
  placeStrip(map, westFrontage, computeWestFrontageX, true, clearMinY, clearMaxY, placedBuildings, placedCenters, FRONTAGE_GAP)
  placeStrip(map, eastFrontage, computeEastFrontageX, true, clearMinY, clearMaxY, placedBuildings, placedCenters, FRONTAGE_GAP)

  // Back row: medium density (gap=2), no clear zone skip
  placeStrip(map, westBackRow, computeWestBackRowX, false, clearMinY, clearMaxY, placedBuildings, placedCenters, BACK_ROW_GAP)
  placeStrip(map, eastBackRow, computeEastBackRowX, false, clearMinY, clearMaxY, placedBuildings, placedCenters, BACK_ROW_GAP)

  // Far lots: sparse (gap=3), no clear zone skip
  placeStrip(map, westFarLots, computeWestFarLotX, false, clearMinY, clearMaxY, placedBuildings, placedCenters, FAR_LOT_GAP)
  placeStrip(map, eastFarLots, computeEastFarLotX, false, clearMinY, clearMaxY, placedBuildings, placedCenters, FAR_LOT_GAP)

  // 10. Verify all unique buildings were placed (catch layout geometry regressions)
  if (process.env.NODE_ENV !== 'production') {
    const finalPlacedIds = new Set(placedBuildings.map(b => b.profileId))
    for (const id of UNIQUE_BUILDING_IDS) {
      if (!finalPlacedIds.has(id)) {
        console.warn(`[mapGenerator] unique building '${id}' failed to place — check strip geometry`)
      }
    }
  }

  return placedBuildings
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
