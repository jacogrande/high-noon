/**
 * Test Arena Map
 *
 * A simple arena for testing collision and movement.
 * Walls around the edges with some obstacles in the middle.
 */

import { createTilemap, addLayer, setTile, TileType, type Tilemap } from '../../tilemap'

/** Arena dimensions */
export const ARENA_WIDTH = 50
export const ARENA_HEIGHT = 38
export const TILE_SIZE = 32

/**
 * Create the test arena tilemap
 *
 * Layout:
 * - Walls around all edges
 * - A few wall blocks in the middle for cover
 * - Open floor everywhere else
 */
export function createTestArena(): Tilemap {
  const map = createTilemap(ARENA_WIDTH, ARENA_HEIGHT, TILE_SIZE)

  // Add a solid wall layer (index 0)
  addLayer(map, true)

  // Add a floor layer (index 1, non-solid, for rendering)
  addLayer(map, false)

  // Fill floor
  for (let y = 0; y < ARENA_HEIGHT; y++) {
    for (let x = 0; x < ARENA_WIDTH; x++) {
      setTile(map, 1, x, y, TileType.FLOOR)
    }
  }

  // Create border walls
  for (let x = 0; x < ARENA_WIDTH; x++) {
    // Top wall
    setTile(map, 0, x, 0, TileType.WALL)
    // Bottom wall
    setTile(map, 0, x, ARENA_HEIGHT - 1, TileType.WALL)
  }

  for (let y = 0; y < ARENA_HEIGHT; y++) {
    // Left wall
    setTile(map, 0, 0, y, TileType.WALL)
    // Right wall
    setTile(map, 0, ARENA_WIDTH - 1, y, TileType.WALL)
  }

  // Add some obstacles spread across the arena
  // Top-left obstacle (2x2)
  setTile(map, 0, 10, 8, TileType.WALL)
  setTile(map, 0, 11, 8, TileType.WALL)
  setTile(map, 0, 10, 9, TileType.WALL)
  setTile(map, 0, 11, 9, TileType.WALL)

  // Top-right obstacle (2x2)
  setTile(map, 0, 38, 8, TileType.WALL)
  setTile(map, 0, 39, 8, TileType.WALL)
  setTile(map, 0, 38, 9, TileType.WALL)
  setTile(map, 0, 39, 9, TileType.WALL)

  // Bottom-left obstacle (2x2)
  setTile(map, 0, 10, 28, TileType.WALL)
  setTile(map, 0, 11, 28, TileType.WALL)
  setTile(map, 0, 10, 29, TileType.WALL)
  setTile(map, 0, 11, 29, TileType.WALL)

  // Bottom-right obstacle (2x2)
  setTile(map, 0, 38, 28, TileType.WALL)
  setTile(map, 0, 39, 28, TileType.WALL)
  setTile(map, 0, 38, 29, TileType.WALL)
  setTile(map, 0, 39, 29, TileType.WALL)

  // Center obstacle (3x2)
  setTile(map, 0, 23, 17, TileType.WALL)
  setTile(map, 0, 24, 17, TileType.WALL)
  setTile(map, 0, 25, 17, TileType.WALL)
  setTile(map, 0, 23, 18, TileType.WALL)
  setTile(map, 0, 24, 18, TileType.WALL)
  setTile(map, 0, 25, 18, TileType.WALL)

  // Extra cover: L-shape upper-mid
  setTile(map, 0, 18, 13, TileType.WALL)
  setTile(map, 0, 18, 14, TileType.WALL)
  setTile(map, 0, 18, 15, TileType.WALL)
  setTile(map, 0, 19, 15, TileType.WALL)

  // Extra cover: L-shape lower-mid
  setTile(map, 0, 31, 22, TileType.WALL)
  setTile(map, 0, 31, 23, TileType.WALL)
  setTile(map, 0, 31, 24, TileType.WALL)
  setTile(map, 0, 30, 22, TileType.WALL)

  return map
}

/**
 * Get the center spawn position of the arena in world coordinates
 */
export function getArenaCenter(): { x: number; y: number } {
  return {
    x: (ARENA_WIDTH * TILE_SIZE) / 2,
    y: (ARENA_HEIGHT * TILE_SIZE) / 2,
  }
}

/**
 * Get the playable bounds of the arena (inside walls)
 */
export function getPlayableBounds(): {
  minX: number
  minY: number
  maxX: number
  maxY: number
} {
  return {
    minX: TILE_SIZE,
    minY: TILE_SIZE,
    maxX: (ARENA_WIDTH - 1) * TILE_SIZE,
    maxY: (ARENA_HEIGHT - 1) * TILE_SIZE,
  }
}
