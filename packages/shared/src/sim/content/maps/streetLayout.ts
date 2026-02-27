/**
 * Street Layout Generator
 *
 * Generates the road network for town maps: a meandering main street,
 * 0-2 cross alleys, and spur roads branching off the main street.
 */

import { SeededRng } from '../../../math/rng'
import type { RoadNetwork, AlleyProfile, SkipZone, SpurRoad } from '../../tilemap'
import { shuffleInPlace } from './buildingPlacer'

// ── Meandering road constants ───────────────────────────────────────
const STREET_SEGMENT_MIN = 5
const STREET_SEGMENT_MAX = 8
const STREET_MAX_DRIFT = 3

const ALLEY_SEGMENT_MIN = 8
const ALLEY_SEGMENT_MAX = 12
const ALLEY_MAX_DRIFT = 1

const SPUR_COUNT_MIN = 4
const SPUR_COUNT_MAX = 6
const SPUR_WIDTH = 2
const SPUR_LENGTH_MIN = 4
const SPUR_LENGTH_MAX = 8
const SPUR_MIN_SPACING = 3

// ── Cross alley constants ────────────────────────────────────────────
const ALLEY_MIN_DIST_FROM_BORDER = 4
const ALLEY_MIN_DIST_FROM_CENTER = 5

export const STREET_HALF_W = 2

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

      let tooClose = false
      for (const py of placed) {
        if (Math.abs(y - py) < SPUR_MIN_SPACING + SPUR_WIDTH) {
          tooClose = true
          break
        }
      }
      if (tooClose) continue

      let inSkip = false
      for (const zone of skipZones) {
        if (y < zone.maxY && y + SPUR_WIDTH > zone.minY) {
          inSkip = true
          break
        }
      }
      if (inSkip) continue

      const streetCenter = streetProfile[y]!
      const startX = direction === -1
        ? streetCenter - STREET_HALF_W - 1
        : streetCenter + STREET_HALF_W

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
 */
export function generateRoadNetwork(
  rng: SeededRng,
  centerX: number,
  centerY: number,
  clearR: number,
  mapHeight: number,
  mapWidth: number,
): RoadNetwork {
  const streetCenterX = centerX + rng.nextInt(7) - 3
  const streetProfile = generateStreetProfile(rng, streetCenterX, mapHeight)

  const roll = rng.nextInt(4)
  const alleyCount = roll === 0 ? 0 : roll <= 2 ? 1 : 2

  const alleys: AlleyProfile[] = []

  const clearMinY = centerY - clearR
  const clearMaxY = centerY + clearR + 1

  const topZoneMin = ALLEY_MIN_DIST_FROM_BORDER
  const topZoneMax = clearMinY - ALLEY_MIN_DIST_FROM_CENTER
  const bottomZoneMin = clearMaxY + ALLEY_MIN_DIST_FROM_CENTER
  const bottomZoneMax = mapHeight - 1 - ALLEY_MIN_DIST_FROM_BORDER

  const zones: Array<{ min: number; max: number }> = []
  if (topZoneMax - topZoneMin >= 2) zones.push({ min: topZoneMin, max: topZoneMax })
  if (bottomZoneMax - bottomZoneMin >= 2) zones.push({ min: bottomZoneMin, max: bottomZoneMax })
  shuffleInPlace(zones, rng)

  for (let i = 0; i < alleyCount && i < zones.length; i++) {
    const zone = zones[i]!
    const alleyWidth = 2 + rng.nextInt(2)
    const maxStart = zone.max - alleyWidth - ALLEY_MAX_DRIFT
    if (maxStart < zone.min + ALLEY_MAX_DRIFT) continue
    const startY = zone.min + ALLEY_MAX_DRIFT + rng.nextInt(maxStart - zone.min - ALLEY_MAX_DRIFT + 1)
    const alleyProfile = generateAlleyProfile(rng, startY, alleyWidth, mapWidth)
    alleys.push(alleyProfile)
  }

  alleys.sort((a, b) => a.bounds.minY - b.bounds.minY)

  const crossAlleyBounds = alleys.map(a => a.bounds)

  const spurs = generateSpurRoads(rng, streetProfile, mapHeight, mapWidth, [
    { minY: centerY - clearR, maxY: centerY + clearR + 1 },
    ...crossAlleyBounds,
  ])

  return { streetCenterX, streetProfile, alleys, crossAlleyBounds, spurs }
}
