/**
 * Tilemap Data Structure
 *
 * Efficient tile-based map storage for collision detection.
 * Designed to work identically on client and server.
 */

/**
 * A single layer of tiles
 */
export interface TileLayer {
  /** Tile data as flat array (row-major order) */
  data: Uint8Array
  /** Whether this layer blocks movement */
  solid: boolean
}

/**
 * Complete tilemap with dimensions and layers
 */
export interface Tilemap {
  /** Width in tiles */
  width: number
  /** Height in tiles */
  height: number
  /** Size of each tile in pixels */
  tileSize: number
  /** Map layers (bottom to top) */
  layers: TileLayer[]
}

/** Tile type constants */
export const TileType = {
  EMPTY: 0,
  WALL: 1,
  FLOOR: 2,
} as const

export type TileTypeValue = (typeof TileType)[keyof typeof TileType]

/**
 * Create an empty tilemap
 */
export function createTilemap(
  width: number,
  height: number,
  tileSize: number
): Tilemap {
  return {
    width,
    height,
    tileSize,
    layers: [],
  }
}

/**
 * Add a layer to the tilemap
 */
export function addLayer(map: Tilemap, solid: boolean): TileLayer {
  const layer: TileLayer = {
    data: new Uint8Array(map.width * map.height),
    solid,
  }
  map.layers.push(layer)
  return layer
}

/**
 * Get tile index from tile coordinates
 */
export function tileIndex(map: Tilemap, tileX: number, tileY: number): number {
  return tileY * map.width + tileX
}

/**
 * Get tile value at tile coordinates
 */
export function getTile(
  map: Tilemap,
  layerIndex: number,
  tileX: number,
  tileY: number
): number {
  const layer = map.layers[layerIndex]
  if (!layer) return 0

  if (tileX < 0 || tileX >= map.width || tileY < 0 || tileY >= map.height) {
    return 0
  }

  return layer.data[tileIndex(map, tileX, tileY)] ?? 0
}

/**
 * Set tile value at tile coordinates
 */
export function setTile(
  map: Tilemap,
  layerIndex: number,
  tileX: number,
  tileY: number,
  value: number
): void {
  const layer = map.layers[layerIndex]
  if (!layer) return

  if (tileX < 0 || tileX >= map.width || tileY < 0 || tileY >= map.height) {
    return
  }

  layer.data[tileIndex(map, tileX, tileY)] = value
}

/**
 * Convert world coordinates to tile coordinates
 */
export function worldToTile(
  map: Tilemap,
  worldX: number,
  worldY: number
): { tileX: number; tileY: number } {
  return {
    tileX: Math.floor(worldX / map.tileSize),
    tileY: Math.floor(worldY / map.tileSize),
  }
}

/**
 * Convert tile coordinates to world coordinates (top-left corner)
 */
export function tileToWorld(
  map: Tilemap,
  tileX: number,
  tileY: number
): { worldX: number; worldY: number } {
  return {
    worldX: tileX * map.tileSize,
    worldY: tileY * map.tileSize,
  }
}

/**
 * Check if a world position is inside a solid tile
 *
 * Checks all solid layers for collision.
 */
export function isSolidAt(map: Tilemap, worldX: number, worldY: number): boolean {
  const { tileX, tileY } = worldToTile(map, worldX, worldY)

  // Out of bounds is solid (prevents escaping the map)
  if (tileX < 0 || tileX >= map.width || tileY < 0 || tileY >= map.height) {
    return true
  }

  // Check all solid layers
  for (let i = 0; i < map.layers.length; i++) {
    const layer = map.layers[i]
    if (!layer || !layer.solid) continue

    const tile = layer.data[tileIndex(map, tileX, tileY)]
    if (tile !== undefined && tile !== TileType.EMPTY) {
      return true
    }
  }

  return false
}

/**
 * Get the AABB bounds of a tile in world coordinates
 */
export function getTileBounds(
  map: Tilemap,
  tileX: number,
  tileY: number
): { minX: number; minY: number; maxX: number; maxY: number } {
  return {
    minX: tileX * map.tileSize,
    minY: tileY * map.tileSize,
    maxX: (tileX + 1) * map.tileSize,
    maxY: (tileY + 1) * map.tileSize,
  }
}

/**
 * Get all tiles that a circle potentially overlaps
 */
export function getTilesInCircle(
  map: Tilemap,
  centerX: number,
  centerY: number,
  radius: number
): Array<{ tileX: number; tileY: number }> {
  const tiles: Array<{ tileX: number; tileY: number }> = []

  // Get bounding box of circle in tile coordinates
  const minTileX = Math.floor((centerX - radius) / map.tileSize)
  const maxTileX = Math.floor((centerX + radius) / map.tileSize)
  const minTileY = Math.floor((centerY - radius) / map.tileSize)
  const maxTileY = Math.floor((centerY + radius) / map.tileSize)

  for (let ty = minTileY; ty <= maxTileY; ty++) {
    for (let tx = minTileX; tx <= maxTileX; tx++) {
      tiles.push({ tileX: tx, tileY: ty })
    }
  }

  return tiles
}
