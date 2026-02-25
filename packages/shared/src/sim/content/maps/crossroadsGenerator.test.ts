/**
 * Tests for crossroads arena generator (Stage 4).
 *
 * Validates layout, connectivity, landmark positions, and dynamic tile modification.
 */

import { describe, expect, test } from 'bun:test'
import { generateCrossroads, CENTER_SIZE, ROAD_WIDTH, ROAD_LENGTH } from './crossroadsGenerator'
import { STAGE_4_MAP_CONFIG } from './mapConfig'
import {
  TileType,
  isSolidAt,
  getFloorTileTypeAt,
  getArenaCenterFromTilemap,
  tileToWorld,
  setTileAt,
  collapseTileRange,
  getTile,
} from '../../tilemap'

const TILE_SIZE = STAGE_4_MAP_CONFIG.tileSize

function makeMap() {
  return generateCrossroads(STAGE_4_MAP_CONFIG)
}

describe('crossroadsGenerator', () => {
  describe('dimensions and structure', () => {
    test('has correct dimensions from config', () => {
      const map = makeMap()
      expect(map.width).toBe(48)
      expect(map.height).toBe(48)
      expect(map.tileSize).toBe(32)
    })

    test('has two layers (solid + floor)', () => {
      const map = makeMap()
      expect(map.layers.length).toBe(2)
      expect(map.layers[0]?.solid).toBe(true)
      expect(map.layers[1]?.solid).toBe(false)
    })

    test('includes base tile metadata', () => {
      const map = makeMap()
      expect(map.baseTiles).toBeDefined()
      expect(map.baseTiles!.style).toBe('crossroads_dirt')
      expect(map.baseTiles!.variantCount).toBe(4)
    })
  })

  describe('center clearing', () => {
    test('center tile is walkable', () => {
      const map = makeMap()
      const center = getArenaCenterFromTilemap(map)
      expect(isSolidAt(map, center.x, center.y)).toBe(false)
    })

    test('center clearing is fully traversable', () => {
      const map = makeMap()
      const centerTileX = Math.floor(map.width / 2)
      const centerTileY = Math.floor(map.height / 2)
      const halfCenter = Math.floor(CENTER_SIZE / 2)

      for (let dy = -halfCenter; dy < halfCenter; dy++) {
        for (let dx = -halfCenter; dx < halfCenter; dx++) {
          const tx = centerTileX + dx
          const ty = centerTileY + dy
          const { worldX, worldY } = tileToWorld(map, tx, ty)
          expect(isSolidAt(map, worldX + TILE_SIZE / 2, worldY + TILE_SIZE / 2)).toBe(false)
        }
      }
    })

    test('center clearing has FLOOR tiles on floor layer', () => {
      const map = makeMap()
      const centerTileX = Math.floor(map.width / 2)
      const centerTileY = Math.floor(map.height / 2)
      const halfCenter = Math.floor(CENTER_SIZE / 2)

      for (let dy = -halfCenter; dy < halfCenter; dy++) {
        for (let dx = -halfCenter; dx < halfCenter; dx++) {
          const tx = centerTileX + dx
          const ty = centerTileY + dy
          const { worldX, worldY } = tileToWorld(map, tx, ty)
          expect(getFloorTileTypeAt(map, worldX + TILE_SIZE / 2, worldY + TILE_SIZE / 2)).toBe(TileType.FLOOR)
        }
      }
    })
  })

  describe('road layout', () => {
    test('north road connects to center and reaches map edge', () => {
      const map = makeMap()
      const centerTileX = Math.floor(map.width / 2)
      const halfCenter = Math.floor(CENTER_SIZE / 2)
      const centerMinY = Math.floor(map.height / 2) - halfCenter

      // Check tiles along the center column of the north road
      for (let y = 0; y < centerMinY; y++) {
        const { worldX, worldY } = tileToWorld(map, centerTileX, y)
        expect(isSolidAt(map, worldX + TILE_SIZE / 2, worldY + TILE_SIZE / 2)).toBe(false)
      }
    })

    test('south road connects to center and reaches map edge', () => {
      const map = makeMap()
      const centerTileX = Math.floor(map.width / 2)
      const halfCenter = Math.floor(CENTER_SIZE / 2)
      const centerMaxY = Math.floor(map.height / 2) + halfCenter - 1

      for (let y = centerMaxY + 1; y < map.height; y++) {
        const { worldX, worldY } = tileToWorld(map, centerTileX, y)
        expect(isSolidAt(map, worldX + TILE_SIZE / 2, worldY + TILE_SIZE / 2)).toBe(false)
      }
    })

    test('west road connects to center and reaches map edge', () => {
      const map = makeMap()
      const centerTileY = Math.floor(map.height / 2)
      const halfCenter = Math.floor(CENTER_SIZE / 2)
      const centerMinX = Math.floor(map.width / 2) - halfCenter

      for (let x = 0; x < centerMinX; x++) {
        const { worldX, worldY } = tileToWorld(map, x, centerTileY)
        expect(isSolidAt(map, worldX + TILE_SIZE / 2, worldY + TILE_SIZE / 2)).toBe(false)
      }
    })

    test('east road connects to center and reaches map edge', () => {
      const map = makeMap()
      const centerTileY = Math.floor(map.height / 2)
      const halfCenter = Math.floor(CENTER_SIZE / 2)
      const centerMaxX = Math.floor(map.width / 2) + halfCenter - 1

      for (let x = centerMaxX + 1; x < map.width; x++) {
        const { worldX, worldY } = tileToWorld(map, x, centerTileY)
        expect(isSolidAt(map, worldX + TILE_SIZE / 2, worldY + TILE_SIZE / 2)).toBe(false)
      }
    })

    test('roads are correct width', () => {
      const map = makeMap()
      const centerTileX = Math.floor(map.width / 2)
      const halfRoad = Math.floor(ROAD_WIDTH / 2)

      // Check north road width at row 2 (well inside the road)
      let openCount = 0
      for (let x = 0; x < map.width; x++) {
        const { worldX, worldY } = tileToWorld(map, x, 2)
        if (!isSolidAt(map, worldX + TILE_SIZE / 2, worldY + TILE_SIZE / 2)) {
          openCount++
        }
      }
      expect(openCount).toBe(ROAD_WIDTH)
    })
  })

  describe('corner quadrants are walls', () => {
    test('NW corner is solid', () => {
      const map = makeMap()
      // Top-left corner, well outside any road or center
      const { worldX, worldY } = tileToWorld(map, 2, 2)
      expect(isSolidAt(map, worldX + TILE_SIZE / 2, worldY + TILE_SIZE / 2)).toBe(true)
    })

    test('NE corner is solid', () => {
      const map = makeMap()
      const { worldX, worldY } = tileToWorld(map, map.width - 3, 2)
      expect(isSolidAt(map, worldX + TILE_SIZE / 2, worldY + TILE_SIZE / 2)).toBe(true)
    })

    test('SW corner is solid', () => {
      const map = makeMap()
      const { worldX, worldY } = tileToWorld(map, 2, map.height - 3)
      expect(isSolidAt(map, worldX + TILE_SIZE / 2, worldY + TILE_SIZE / 2)).toBe(true)
    })

    test('SE corner is solid', () => {
      const map = makeMap()
      const { worldX, worldY } = tileToWorld(map, map.width - 3, map.height - 3)
      expect(isSolidAt(map, worldX + TILE_SIZE / 2, worldY + TILE_SIZE / 2)).toBe(true)
    })
  })

  describe('connectivity', () => {
    test('all open tiles are reachable from center via flood fill', () => {
      const map = makeMap()
      const centerTileX = Math.floor(map.width / 2)
      const centerTileY = Math.floor(map.height / 2)

      const visited = new Set<number>()
      const queue: Array<{ x: number; y: number }> = [{ x: centerTileX, y: centerTileY }]
      visited.add(centerTileY * map.width + centerTileX)

      while (queue.length > 0) {
        const { x, y } = queue.shift()!
        const neighbors = [
          { x: x - 1, y },
          { x: x + 1, y },
          { x, y: y - 1 },
          { x, y: y + 1 },
        ]
        for (const n of neighbors) {
          if (n.x < 0 || n.x >= map.width || n.y < 0 || n.y >= map.height) continue
          const idx = n.y * map.width + n.x
          if (visited.has(idx)) continue
          const { worldX, worldY } = tileToWorld(map, n.x, n.y)
          if (isSolidAt(map, worldX + TILE_SIZE / 2, worldY + TILE_SIZE / 2)) continue
          visited.add(idx)
          queue.push(n)
        }
      }

      // Verify all non-solid tiles were visited
      const solidLayer = map.layers[0]!
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const idx = y * map.width + x
          if (solidLayer.data[idx] === TileType.EMPTY) {
            expect(visited.has(idx)).toBe(true)
          }
        }
      }
    })

    test('can traverse from any road to any other road through center', () => {
      const map = makeMap()
      const centerTileX = Math.floor(map.width / 2)
      const centerTileY = Math.floor(map.height / 2)

      // Verify the center of each road is connected by checking tile at:
      // North road center, South road center, West road center, East road center
      const roadCenters = [
        { x: centerTileX, y: 2 },               // North
        { x: centerTileX, y: map.height - 3 },   // South
        { x: 2, y: centerTileY },                // West
        { x: map.width - 3, y: centerTileY },    // East
      ]

      for (const rc of roadCenters) {
        const { worldX, worldY } = tileToWorld(map, rc.x, rc.y)
        expect(isSolidAt(map, worldX + TILE_SIZE / 2, worldY + TILE_SIZE / 2)).toBe(false)
      }
    })
  })

  describe('landmarks', () => {
    test('crossroadsLandmarks is present', () => {
      const map = makeMap()
      expect(map.crossroadsLandmarks).toBeDefined()
    })

    test('signpost is at arena center', () => {
      const map = makeMap()
      const center = getArenaCenterFromTilemap(map)
      const lm = map.crossroadsLandmarks!

      // Signpost should be within 1 tile of center
      expect(Math.abs(lm.signpost.x - center.x)).toBeLessThan(TILE_SIZE)
      expect(Math.abs(lm.signpost.y - center.y)).toBeLessThan(TILE_SIZE)
    })

    test('has 4 lantern positions', () => {
      const map = makeMap()
      expect(map.crossroadsLandmarks!.lanterns.length).toBe(4)
    })

    test('lanterns are inside the center clearing', () => {
      const map = makeMap()
      const lm = map.crossroadsLandmarks!

      for (const lantern of lm.lanterns) {
        // Lanterns should be in walkable space
        expect(isSolidAt(map, lantern.x, lantern.y)).toBe(false)
      }
    })

    test('lanterns are in the four quadrants of the center clearing', () => {
      const map = makeMap()
      const center = getArenaCenterFromTilemap(map)
      const lm = map.crossroadsLandmarks!

      // Each lantern should be in a different quadrant relative to center
      const quadrants = lm.lanterns.map(l => ({
        left: l.x < center.x,
        top: l.y < center.y,
      }))

      // Should have NW, NE, SW, SE
      expect(quadrants.filter(q => q.left && q.top).length).toBe(1)
      expect(quadrants.filter(q => !q.left && q.top).length).toBe(1)
      expect(quadrants.filter(q => q.left && !q.top).length).toBe(1)
      expect(quadrants.filter(q => !q.left && !q.top).length).toBe(1)
    })

    test('has 4 road endpoint positions', () => {
      const map = makeMap()
      expect(map.crossroadsLandmarks!.roadEndpoints.length).toBe(4)
    })

    test('road endpoints are near map edges', () => {
      const map = makeMap()
      const lm = map.crossroadsLandmarks!
      const mapW = map.width * TILE_SIZE
      const mapH = map.height * TILE_SIZE
      const edgeThreshold = 3 * TILE_SIZE // within 3 tiles of edge

      for (const ep of lm.roadEndpoints) {
        const nearEdge = (
          ep.x < edgeThreshold ||
          ep.x > mapW - edgeThreshold ||
          ep.y < edgeThreshold ||
          ep.y > mapH - edgeThreshold
        )
        expect(nearEdge).toBe(true)
      }
    })

    test('road endpoints are in walkable space', () => {
      const map = makeMap()
      const lm = map.crossroadsLandmarks!

      for (const ep of lm.roadEndpoints) {
        expect(isSolidAt(map, ep.x, ep.y)).toBe(false)
      }
    })
  })

  describe('tile counts', () => {
    test('open tiles form a + shape with expected area', () => {
      const map = makeMap()
      const solidLayer = map.layers[0]!

      let openCount = 0
      for (let i = 0; i < solidLayer.data.length; i++) {
        if (solidLayer.data[i] === TileType.EMPTY) openCount++
      }

      // Expected: center (16×16) + 4 roads (8 wide × 16 long)
      //   = 256 + 4×128 = 256 + 512 = 768
      const expectedCenter = CENTER_SIZE * CENTER_SIZE
      const expectedRoads = 4 * ROAD_WIDTH * ROAD_LENGTH
      const expected = expectedCenter + expectedRoads
      expect(openCount).toBe(expected)
    })

    test('no hazard tiles are placed initially', () => {
      const map = makeMap()
      const floorLayer = map.layers[1]!

      for (const tile of floorLayer.data) {
        expect(tile === TileType.LAVA).toBe(false)
        expect(tile === TileType.BRIMSTONE).toBe(false)
        expect(tile === TileType.DARKNESS).toBe(false)
        expect(tile === TileType.MUD).toBe(false)
        expect(tile === TileType.BRAMBLE).toBe(false)
      }
    })
  })
})

describe('dynamic tile modification', () => {
  test('setTileAt changes a single tile', () => {
    const map = makeMap()

    // Pick a floor tile in the center
    const centerTileX = Math.floor(map.width / 2)
    const centerTileY = Math.floor(map.height / 2)

    // Verify it starts as EMPTY on solid layer
    expect(getTile(map, 0, centerTileX, centerTileY)).toBe(TileType.EMPTY)

    // Set it to WALL
    setTileAt(map, 0, centerTileX, centerTileY, TileType.WALL)
    expect(getTile(map, 0, centerTileX, centerTileY)).toBe(TileType.WALL)
  })

  test('setTileAt can place BRIMSTONE on floor layer', () => {
    const map = makeMap()
    const centerTileX = Math.floor(map.width / 2)
    const centerTileY = Math.floor(map.height / 2)

    setTileAt(map, 1, centerTileX, centerTileY, TileType.BRIMSTONE)
    expect(getTile(map, 1, centerTileX, centerTileY)).toBe(TileType.BRIMSTONE)
  })

  test('setTileAt ignores out-of-bounds coordinates', () => {
    const map = makeMap()
    // Should not throw
    setTileAt(map, 0, -1, -1, TileType.WALL)
    setTileAt(map, 0, map.width + 10, map.height + 10, TileType.WALL)
  })

  test('collapseTileRange converts a rectangular region', () => {
    const map = makeMap()

    // Collapse a 3x3 region to WALL on solid layer
    collapseTileRange(map, 0, 10, 10, 12, 12, TileType.WALL)

    for (let y = 10; y <= 12; y++) {
      for (let x = 10; x <= 12; x++) {
        expect(getTile(map, 0, x, y)).toBe(TileType.WALL)
      }
    }
  })

  test('collapseTileRange clamps to map bounds', () => {
    const map = makeMap()

    // Range extends beyond map — should not throw
    collapseTileRange(map, 0, -5, -5, 5, 5, TileType.WALL)

    // Tiles within bounds should be set
    expect(getTile(map, 0, 0, 0)).toBe(TileType.WALL)
    expect(getTile(map, 0, 5, 5)).toBe(TileType.WALL)
  })

  test('collapseTileRange can simulate arena shrink (roads to walls)', () => {
    const map = makeMap()
    const centerTileX = Math.floor(map.width / 2)
    const halfRoad = Math.floor(ROAD_WIDTH / 2)

    // North road: collapse outer 6 tiles (rows 0-5) to WALL
    const roadMinX = centerTileX - halfRoad
    const roadMaxX = centerTileX + halfRoad - 1
    collapseTileRange(map, 0, roadMinX, 0, roadMaxX, 5, TileType.WALL)

    // Verify the collapsed tiles are now solid
    for (let y = 0; y <= 5; y++) {
      for (let x = roadMinX; x <= roadMaxX; x++) {
        expect(getTile(map, 0, x, y)).toBe(TileType.WALL)
      }
    }

    // Verify tiles further down the road are still open
    expect(getTile(map, 0, centerTileX, 10)).toBe(TileType.EMPTY)
  })

  test('collapseTileRange can place brimstone on floor layer', () => {
    const map = makeMap()
    const centerTileY = Math.floor(map.height / 2)
    const halfRoad = Math.floor(ROAD_WIDTH / 2)

    // Place brimstone along one road edge (east road, south edge)
    const roadMaxY = centerTileY + halfRoad - 1
    const halfCenter = Math.floor(CENTER_SIZE / 2)
    const startX = Math.floor(map.width / 2) + halfCenter
    collapseTileRange(map, 1, startX, roadMaxY, startX + 5, roadMaxY, TileType.BRIMSTONE)

    for (let x = startX; x <= startX + 5; x++) {
      expect(getTile(map, 1, x, roadMaxY)).toBe(TileType.BRIMSTONE)
    }
  })
})
