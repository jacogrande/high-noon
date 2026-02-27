/**
 * Building Placement
 *
 * Dense 3-tier town layout: frontage, back row, and far lots on each
 * side of the main street. Handles skip zones for center clear area
 * and cross alleys.
 */

import { SeededRng } from '../../../math/rng'
import { setTile, getTile, TileType, type Tilemap, type PlacedBuilding, type SkipZone, type RoadNetwork } from '../../tilemap'
import type { BuildingProfile } from './buildingProfiles'
import { generateRoadNetwork, STREET_HALF_W } from './streetLayout'

// ── Town layout constants ──────────────────────────────────────────────
const UNIQUE_BUILDING_IDS = new Set(['general_store', 'saloon', 'barber', 'sheriff', 'bank'])
const SIDEWALK_W = 1
const ALLEY_GAP = 1
const BORDER_INSET = 1
const MAX_FRONTAGE_WIDTH = 7
const MAX_FILLER_WIDTH = 3
const FRONTAGE_GAP = 1
const BACK_ROW_GAP = 1
const FAR_LOT_GAP = 1

/** Fisher-Yates shuffle using seeded RNG for determinism. */
export function shuffleInPlace<T>(arr: T[], rng: SeededRng): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1)
    const tmp = arr[i]!
    arr[i] = arr[j]!
    arr[j] = tmp
  }
}

/** Stamp an obstacle (template or building profile) onto the solid layer. */
export function stampObstacle(
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

/** Check that every tile of a building profile fits without overlapping existing walls. */
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
    for (const zone of skipZones) {
      if (cursor < zone.maxY && cursor + profile.heightTiles > zone.minY) {
        cursor = zone.maxY + gap
      }
    }

    if (cursor + profile.heightTiles > map.height - 1) continue

    const ox = computeX(profile)
    if (!canStampBuilding(map, profile, ox, cursor)) {
      continue
    }

    stampBuilding(map, profile, ox, cursor, placedBuildings, placedCenters)
    cursor += profile.heightTiles + gap + (rng && yGapJitter > 0 ? rng.nextInt(yGapJitter + 1) : 0)
  }
}

/** Build a filler queue by cycling through shuffled filler templates. */
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
 * Build a sorted array of skip zones from the center clear zone and cross alleys.
 */
export function buildSkipZones(
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
 * Dense 3-tier town layout.
 *
 * Generates a road network (main street + 0-2 cross alleys) first, then
 * organises buildings in three depth tiers on each side of the main street.
 */
export function placeTownBuildings(
  map: Tilemap,
  rng: SeededRng,
  profiles: BuildingProfile[],
  centerX: number,
  centerY: number,
  clearR: number,
  placedCenters: Array<{ x: number; y: number }>,
): { buildings: PlacedBuilding[]; roadNetwork: RoadNetwork } {
  const placedBuildings: PlacedBuilding[] = []

  const roadNetwork = generateRoadNetwork(rng, centerX, centerY, clearR, map.height, map.width)
  const { streetCenterX, crossAlleyBounds } = roadNetwork

  const frontageSkipZones = buildSkipZones(centerY, clearR, crossAlleyBounds, true)
  const outerSkipZones = buildSkipZones(centerY, clearR, crossAlleyBounds, false)

  const noDitherBuildings: BuildingProfile[] = []
  const regularProfiles: BuildingProfile[] = []
  for (const p of profiles) {
    if (p.noDither) noDitherBuildings.push(p)
    else regularProfiles.push(p)
  }

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
  for (let i = 0; i < tallUnique.length; i++) {
    innerStrips[2 + (i % 2)]!.push(tallUnique[i]!)
  }
  for (let i = 0; i < shortUnique.length; i++) {
    innerStrips[i % 4]!.push(shortUnique[i]!)
  }

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

  const FAR_LOT_FILLER_COUNT = 10
  const westFarLots = [...noDitherBuildings, ...buildFillerQueue(rng, filler, FAR_LOT_FILLER_COUNT)]
  const eastFarLots = [...noDitherBuildings, ...buildFillerQueue(rng, filler, FAR_LOT_FILLER_COUNT)]

  const westSidewalkX = streetCenterX - STREET_HALF_W - SIDEWALK_W
  const eastFrontageX = streetCenterX + STREET_HALF_W + SIDEWALK_W

  const westBackAlleyEdge = westSidewalkX - MAX_FRONTAGE_WIDTH - ALLEY_GAP
  const eastBackAlleyStart = eastFrontageX + MAX_FRONTAGE_WIDTH + ALLEY_GAP

  const westFarLotEdge = westBackAlleyEdge - MAX_FILLER_WIDTH - ALLEY_GAP
  const eastFarLotStart = eastBackAlleyStart + MAX_FILLER_WIDTH + ALLEY_GAP

  const computeWestFrontageX = (p: BuildingProfile) => westSidewalkX - p.widthTiles - rng.nextInt(2)
  const computeEastFrontageX = (_p: BuildingProfile) => eastFrontageX + rng.nextInt(2)
  const computeWestBackRowX = (p: BuildingProfile) => westBackAlleyEdge - p.widthTiles - rng.nextInt(2)
  const computeEastBackRowX = (_p: BuildingProfile) => eastBackAlleyStart + rng.nextInt(2)
  const computeWestFarLotX = (p: BuildingProfile) => westFarLotEdge - p.widthTiles - rng.nextInt(2)
  const computeEastFarLotX = (_p: BuildingProfile) => eastFarLotStart + rng.nextInt(2)

  const yOffset = (queue: BuildingProfile[]) =>
    queue.length > 0 && queue[0]!.noDither ? 0 : rng.nextInt(2)

  const westFrontageYOff = yOffset(westFrontage)
  const eastFrontageYOff = yOffset(eastFrontage)
  const westBackRowYOff = yOffset(westBackRow)
  const eastBackRowYOff = yOffset(eastBackRow)
  const westFarLotsYOff = yOffset(westFarLots)
  const eastFarLotsYOff = yOffset(eastFarLots)

  placeStrip(map, westFrontage, computeWestFrontageX, frontageSkipZones, placedBuildings, placedCenters, FRONTAGE_GAP, rng, westFrontageYOff, 1)
  placeStrip(map, eastFrontage, computeEastFrontageX, frontageSkipZones, placedBuildings, placedCenters, FRONTAGE_GAP, rng, eastFrontageYOff, 1)

  placeStrip(map, westBackRow, computeWestBackRowX, outerSkipZones, placedBuildings, placedCenters, BACK_ROW_GAP, rng, westBackRowYOff, 0)
  placeStrip(map, eastBackRow, computeEastBackRowX, outerSkipZones, placedBuildings, placedCenters, BACK_ROW_GAP, rng, eastBackRowYOff, 0)

  placeStrip(map, westFarLots, computeWestFarLotX, outerSkipZones, placedBuildings, placedCenters, FAR_LOT_GAP, rng, westFarLotsYOff, 0)
  placeStrip(map, eastFarLots, computeEastFarLotX, outerSkipZones, placedBuildings, placedCenters, FAR_LOT_GAP, rng, eastFarLotsYOff, 0)

  if (process.env.NODE_ENV !== 'production') {
    const finalPlacedIds = new Set(placedBuildings.map(b => b.profileId))
    for (const id of UNIQUE_BUILDING_IDS) {
      if (!finalPlacedIds.has(id)) {
        console.warn(`[mapGenerator] unique building '${id}' failed to place — check strip geometry`)
      }
    }
  }

  // Stamp road tiles
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

  const stampRoadTile = (x: number, y: number) => {
    if (x < 1 || x >= map.width - 1 || y < 1 || y >= map.height - 1) return
    const idx = y * map.width + x
    if (solidLayer.data[idx] !== TileType.EMPTY) return
    if (floorLayer.data[idx] !== TileType.FLOOR && floorLayer.data[idx] !== TileType.ROAD) return
    if (buildingFootprint.has(idx)) return
    floorLayer.data[idx] = TileType.ROAD
  }

  const { streetProfile, alleys, spurs } = roadNetwork
  for (let y = 1; y < map.height - 1; y++) {
    const cx = streetProfile[y]!
    const minX = cx - STREET_HALF_W
    const maxX = cx + STREET_HALF_W
    for (let x = minX; x < maxX; x++) {
      stampRoadTile(x, y)
    }

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

  for (const alley of alleys) {
    const halfW = Math.floor(alley.width / 2)
    for (let x = 1; x < map.width - 1; x++) {
      const cy = alley.profile[x]!
      const minY = cy - halfW
      const maxY = minY + alley.width
      for (let y = minY; y < maxY; y++) {
        stampRoadTile(x, y)
      }

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
