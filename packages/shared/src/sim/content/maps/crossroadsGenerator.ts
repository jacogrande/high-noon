/**
 * Crossroads Arena Generator (Stage 4)
 *
 * Generates a hand-crafted + shaped arena for the final boss encounter.
 * The crossroads has a center clearing connected by four roads (N/S/E/W),
 * with impassable darkness in the four corner quadrants.
 *
 * Layout (simplified):
 *   ████ ROAD ████
 *   ████      ████
 *   ROAD CENTER ROAD
 *   ████      ████
 *   ████ ROAD ████
 *
 * Landmark positions (lanterns, road endpoints) are stored on the tilemap
 * for use by the boss module during phase transitions.
 */

import {
  createTilemap,
  addLayer,
  setTile,
  TileType,
  type Tilemap,
  type CrossroadsLandmarks,
} from '../../tilemap'
import type { MapConfig } from './mapConfig'

// ── Layout constants ─────────────────────────────────────────────────

/** Width/height of the center clearing in tiles */
export const CENTER_SIZE = 16

/** Width of each road in tiles */
export const ROAD_WIDTH = 8

/** Full road length from center edge to map edge in tiles */
export const ROAD_LENGTH = 16

/**
 * Generate the crossroads arena tilemap.
 *
 * The map is always square (width === height) and centered.
 * Uses the MapConfig for dimensions and tile size, but ignores
 * procedural obstacle/hazard settings (those are handled by the boss).
 */
export function generateCrossroads(config: MapConfig): Tilemap {
  const { width, height, tileSize } = config

  const map = createTilemap(width, height, tileSize)

  // Layer 0: solid (walls + collision)
  addLayer(map, true)
  // Layer 1: floor (visual tile types)
  addLayer(map, false)

  const centerTileX = Math.floor(width / 2)
  const centerTileY = Math.floor(height / 2)

  // Center clearing bounds (tile coords, inclusive)
  const halfCenter = Math.floor(CENTER_SIZE / 2)
  const centerMinX = centerTileX - halfCenter
  const centerMaxX = centerTileX + halfCenter - 1
  const centerMinY = centerTileY - halfCenter
  const centerMaxY = centerTileY + halfCenter - 1

  // Road half-width
  const halfRoad = Math.floor(ROAD_WIDTH / 2)

  // ── Step 1: Fill everything with WALL (solid layer) ──────────────
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      setTile(map, 0, x, y, TileType.WALL)
    }
  }

  // ── Step 2: Carve the + shape ────────────────────────────────────

  // Helper: carve a tile (remove wall, add floor)
  const carve = (tx: number, ty: number) => {
    if (tx < 0 || tx >= width || ty < 0 || ty >= height) return
    setTile(map, 0, tx, ty, TileType.EMPTY)
    setTile(map, 1, tx, ty, TileType.FLOOR)
  }

  // Carve center clearing
  for (let y = centerMinY; y <= centerMaxY; y++) {
    for (let x = centerMinX; x <= centerMaxX; x++) {
      carve(x, y)
    }
  }

  // Carve North road: from top of map down to center
  const roadNMinX = centerTileX - halfRoad
  const roadNMaxX = centerTileX + halfRoad - 1
  for (let y = 0; y < centerMinY; y++) {
    for (let x = roadNMinX; x <= roadNMaxX; x++) {
      carve(x, y)
    }
  }

  // Carve South road: from center bottom to bottom of map
  for (let y = centerMaxY + 1; y < height; y++) {
    for (let x = roadNMinX; x <= roadNMaxX; x++) {
      carve(x, y)
    }
  }

  // Carve West road: from left of map to center
  const roadWMinY = centerTileY - halfRoad
  const roadWMaxY = centerTileY + halfRoad - 1
  for (let y = roadWMinY; y <= roadWMaxY; y++) {
    for (let x = 0; x < centerMinX; x++) {
      carve(x, y)
    }
  }

  // Carve East road: from center right to right of map
  for (let y = roadWMinY; y <= roadWMaxY; y++) {
    for (let x = centerMaxX + 1; x < width; x++) {
      carve(x, y)
    }
  }

  // ── Step 3: Compute landmark positions (world coords) ───────────

  const toWorld = (tx: number, ty: number) => ({
    x: (tx + 0.5) * tileSize,
    y: (ty + 0.5) * tileSize,
  })

  // Signpost: dead center
  const signpost = toWorld(centerTileX, centerTileY)

  // Lanterns: four corners of the center clearing (just inside corners)
  const lanternInset = 1 // 1 tile inset from corners
  const lanterns = [
    toWorld(centerMinX + lanternInset, centerMinY + lanternInset),     // NW
    toWorld(centerMaxX - lanternInset, centerMinY + lanternInset),     // NE
    toWorld(centerMinX + lanternInset, centerMaxY - lanternInset),     // SW
    toWorld(centerMaxX - lanternInset, centerMaxY - lanternInset),     // SE
  ]

  // Road endpoints: center of each road at the map edge
  const roadEndpoints = [
    toWorld(centerTileX, 1),                // North
    toWorld(centerTileX, height - 2),       // South
    toWorld(1, centerTileY),                // West
    toWorld(width - 2, centerTileY),        // East
  ]

  const landmarks: CrossroadsLandmarks = {
    signpost,
    lanterns,
    roadEndpoints,
  }

  // ── Step 4: Set metadata ─────────────────────────────────────────

  map.baseTiles = {
    style: config.baseTiles.style,
    variantCount: config.baseTiles.variantCount,
    seed: 0x4F53 // "OS" — Old Scratch. Fixed seed (crossroads is deterministic, no RNG needed)
  }
  map.crossroadsLandmarks = landmarks

  return map
}
