/**
 * Tests for procedural map generator.
 *
 * Validates determinism, map constraints, connectivity, and hazard placement.
 */

import { describe, expect, test } from 'bun:test'
import { generateArena } from './mapGenerator'
import { STAGE_1_MAP_CONFIG, STAGE_2_MAP_CONFIG, STAGE_3_MAP_CONFIG } from './mapConfig'
import {
  BASE_TILE_VARIANTS_PER_STYLE,
  TileType,
  isSolidAt,
  getFloorTileTypeAt,
  getArenaCenterFromTilemap,
  tileToWorld,
} from '../../tilemap'
import type { Tilemap } from '../../tilemap'

describe('mapGenerator', () => {
  describe('determinism', () => {
    test('same seed and stage produces identical maps', () => {
      const seed = 12345
      const stageIndex = 0

      const map1 = generateArena(STAGE_1_MAP_CONFIG, seed, stageIndex)
      const map2 = generateArena(STAGE_1_MAP_CONFIG, seed, stageIndex)

      expect(map1.width).toBe(map2.width)
      expect(map1.height).toBe(map2.height)
      expect(map1.layers.length).toBe(map2.layers.length)

      // Compare all layer data
      for (let i = 0; i < map1.layers.length; i++) {
        const layer1 = map1.layers[i]!
        const layer2 = map2.layers[i]!
        expect(layer1.solid).toBe(layer2.solid)
        expect(layer1.data.length).toBe(layer2.data.length)
        for (let j = 0; j < layer1.data.length; j++) {
          expect(layer1.data[j]).toBe(layer2.data[j])
        }
      }
    })

    test('different seeds produce different maps', () => {
      const stageIndex = 0
      const map1 = generateArena(STAGE_1_MAP_CONFIG, 12345, stageIndex)
      const map2 = generateArena(STAGE_1_MAP_CONFIG, 99999, stageIndex)

      // Maps should have same dimensions
      expect(map1.width).toBe(map2.width)
      expect(map1.height).toBe(map2.height)

      // But different tile data (at least somewhere)
      let foundDifference = false
      const layer1 = map1.layers[0]!
      const layer2 = map2.layers[0]!
      for (let i = 0; i < layer1.data.length; i++) {
        if (layer1.data[i] !== layer2.data[i]) {
          foundDifference = true
          break
        }
      }
      expect(foundDifference).toBe(true)
    })

    test('different stage indices produce different maps', () => {
      const seed = 12345
      const map1 = generateArena(STAGE_1_MAP_CONFIG, seed, 0)
      const map2 = generateArena(STAGE_1_MAP_CONFIG, seed, 1)

      // Different stage indices should produce different maps
      let foundDifference = false
      const layer1 = map1.layers[0]!
      const layer2 = map2.layers[0]!
      for (let i = 0; i < layer1.data.length; i++) {
        if (layer1.data[i] !== layer2.data[i]) {
          foundDifference = true
          break
        }
      }
      expect(foundDifference).toBe(true)
    })
  })

  describe('map structure', () => {
    test('has correct layer structure', () => {
      const map = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)

      expect(map.layers.length).toBe(2)
      expect(map.layers[0]?.solid).toBe(true) // solid layer
      expect(map.layers[1]?.solid).toBe(false) // floor layer
    })

    test('has correct dimensions from config', () => {
      const map = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)
      expect(map.width).toBe(STAGE_1_MAP_CONFIG.width)
      expect(map.height).toBe(STAGE_1_MAP_CONFIG.height)
      expect(map.tileSize).toBe(STAGE_1_MAP_CONFIG.tileSize)
    })
  })

  describe('base tile metadata', () => {
    test('includes base tile style and variant count', () => {
      const stage1 = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)
      const stage2 = generateArena(STAGE_2_MAP_CONFIG, 12345, 1)
      const stage3 = generateArena(STAGE_3_MAP_CONFIG, 12345, 2)

      expect(stage1.baseTiles?.style).toBe('red_dirt')
      expect(stage2.baseTiles?.style).toBe('grass')
      expect(stage3.baseTiles?.style).toBe('stone')

      expect(stage1.baseTiles?.variantCount).toBe(BASE_TILE_VARIANTS_PER_STYLE)
      expect(stage2.baseTiles?.variantCount).toBe(BASE_TILE_VARIANTS_PER_STYLE)
      expect(stage3.baseTiles?.variantCount).toBe(BASE_TILE_VARIANTS_PER_STYLE)
    })

    test('uses deterministic base tile seed per seed + stage', () => {
      const map1 = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)
      const map2 = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)
      const map3 = generateArena(STAGE_1_MAP_CONFIG, 99999, 0)

      expect(map1.baseTiles?.seed).toBe(map2.baseTiles?.seed)
      expect(map1.baseTiles?.seed).not.toBe(map3.baseTiles?.seed)
    })
  })

  describe('border walls', () => {
    test('all edges have wall tiles', () => {
      const map = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)
      const solidLayer = map.layers[0]!

      // Top edge
      for (let x = 0; x < map.width; x++) {
        expect(solidLayer.data[0 * map.width + x]).toBe(TileType.WALL)
      }

      // Bottom edge
      for (let x = 0; x < map.width; x++) {
        expect(solidLayer.data[(map.height - 1) * map.width + x]).toBe(TileType.WALL)
      }

      // Left edge
      for (let y = 0; y < map.height; y++) {
        expect(solidLayer.data[y * map.width + 0]).toBe(TileType.WALL)
      }

      // Right edge
      for (let y = 0; y < map.height; y++) {
        expect(solidLayer.data[y * map.width + (map.width - 1)]).toBe(TileType.WALL)
      }
    })
  })

  describe('center spawn area', () => {
    test('center tile is always walkable', () => {
      const map = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)
      const center = getArenaCenterFromTilemap(map)

      expect(isSolidAt(map, center.x, center.y)).toBe(false)
    })

    test('center exclusion zone is clear of solid tiles', () => {
      const map = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)
      const centerTileX = Math.floor(map.width / 2)
      const centerTileY = Math.floor(map.height / 2)
      const clearR = STAGE_1_MAP_CONFIG.centerClearRadius

      for (let dy = -clearR; dy <= clearR; dy++) {
        for (let dx = -clearR; dx <= clearR; dx++) {
          const tileX = centerTileX + dx
          const tileY = centerTileY + dy
          const { worldX, worldY } = tileToWorld(map, tileX, tileY)

          // Add tileSize/2 to get center of tile
          expect(isSolidAt(map, worldX + map.tileSize / 2, worldY + map.tileSize / 2)).toBe(false)
        }
      }
    })

    test('center exclusion zone is clear of hazards', () => {
      const map = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)
      const centerTileX = Math.floor(map.width / 2)
      const centerTileY = Math.floor(map.height / 2)
      const clearR = STAGE_1_MAP_CONFIG.centerClearRadius

      for (let dy = -clearR; dy <= clearR; dy++) {
        for (let dx = -clearR; dx <= clearR; dx++) {
          const tileX = centerTileX + dx
          const tileY = centerTileY + dy
          const { worldX, worldY } = tileToWorld(map, tileX, tileY)

          // Check floor tile is not a hazard
          const floorTile = getFloorTileTypeAt(map, worldX + map.tileSize / 2, worldY + map.tileSize / 2)
          expect(floorTile).toBe(TileType.FLOOR)
        }
      }
    })
  })

  describe('connectivity', () => {
    test('all open tiles are reachable from center', () => {
      const map = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)
      const centerTileX = Math.floor(map.width / 2)
      const centerTileY = Math.floor(map.height / 2)

      // Flood fill from center
      const visited = new Set<number>()
      const queue: Array<{ x: number; y: number }> = [{ x: centerTileX, y: centerTileY }]
      visited.add(centerTileY * map.width + centerTileX)

      while (queue.length > 0) {
        const { x, y } = queue.shift()!

        // Check 4-connected neighbors
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
          if (isSolidAt(map, worldX + map.tileSize / 2, worldY + map.tileSize / 2)) continue

          visited.add(idx)
          queue.push(n)
        }
      }

      // Verify all open tiles were visited
      const solidLayer = map.layers[0]!
      for (let y = 1; y < map.height - 1; y++) {
        for (let x = 1; x < map.width - 1; x++) {
          const idx = y * map.width + x
          const isBlocked = solidLayer.data[idx] !== TileType.EMPTY

          if (!isBlocked) {
            expect(visited.has(idx)).toBe(true)
          }
        }
      }
    })
  })

  describe('hazard placement', () => {
    test('hazards only placed on floor layer', () => {
      const map = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)
      const solidLayer = map.layers[0]!
      const floorLayer = map.layers[1]!

      for (let i = 0; i < floorLayer.data.length; i++) {
        const floorTile = floorLayer.data[i]!
        const solidTile = solidLayer.data[i]!

        // If floor has a hazard, solid layer must be empty
        if (floorTile === TileType.LAVA || floorTile === TileType.MUD || floorTile === TileType.BRAMBLE) {
          expect(solidTile).toBe(TileType.EMPTY)
        }
      }
    })

    test('hazard coverage does not exceed maxCoverage', () => {
      const map = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)
      const solidLayer = map.layers[0]!
      const floorLayer = map.layers[1]!

      // Count floor tiles (non-solid, non-border tiles)
      let floorCount = 0
      for (let y = 1; y < map.height - 1; y++) {
        for (let x = 1; x < map.width - 1; x++) {
          const idx = y * map.width + x
          if (solidLayer.data[idx] === TileType.EMPTY) {
            floorCount++
          }
        }
      }

      // Count hazard tiles
      let hazardCount = 0
      for (let i = 0; i < floorLayer.data.length; i++) {
        const tile = floorLayer.data[i]!
        if (tile === TileType.LAVA || tile === TileType.MUD || tile === TileType.BRAMBLE) {
          hazardCount++
        }
      }

      const coverage = hazardCount / floorCount
      const maxCoverage = STAGE_1_MAP_CONFIG.hazards[0]!.maxCoverage
      expect(coverage).toBeLessThanOrEqual(maxCoverage)
    })

    test('stage 1 has lava hazards', () => {
      const map = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)
      const floorLayer = map.layers[1]!

      let lavaCount = 0
      for (const tile of floorLayer.data) {
        if (tile === TileType.LAVA) lavaCount++
      }

      // Should have some lava tiles (not exact count due to RNG)
      expect(lavaCount).toBeGreaterThan(0)
    })

    test('stage 2 has mud and bramble hazards', () => {
      const map = generateArena(STAGE_2_MAP_CONFIG, 12345, 0)
      const floorLayer = map.layers[1]!

      let mudCount = 0
      let brambleCount = 0
      for (const tile of floorLayer.data) {
        if (tile === TileType.MUD) mudCount++
        if (tile === TileType.BRAMBLE) brambleCount++
      }

      // Should have both hazard types
      expect(mudCount).toBeGreaterThan(0)
      expect(brambleCount).toBeGreaterThan(0)
    })

    test('stage 3 has lava hazards', () => {
      const map = generateArena(STAGE_3_MAP_CONFIG, 12345, 0)
      const floorLayer = map.layers[1]!

      let lavaCount = 0
      for (const tile of floorLayer.data) {
        if (tile === TileType.LAVA) lavaCount++
      }

      expect(lavaCount).toBeGreaterThan(0)
    })
  })

  describe('obstacle placement', () => {
    test('obstacles are placed', () => {
      const map = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)
      const solidLayer = map.layers[0]!

      // Count interior wall/half-wall tiles (excluding borders)
      let obstacleCount = 0
      for (let y = 1; y < map.height - 1; y++) {
        for (let x = 1; x < map.width - 1; x++) {
          const tile = solidLayer.data[y * map.width + x]!
          if (tile === TileType.WALL || tile === TileType.HALF_WALL) {
            obstacleCount++
          }
        }
      }

      // Should have some obstacles (templates have 1+ tiles each)
      expect(obstacleCount).toBeGreaterThan(0)
    })

    test('obstacles not placed in center exclusion zone', () => {
      const map = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)
      const centerTileX = Math.floor(map.width / 2)
      const centerTileY = Math.floor(map.height / 2)
      const clearR = STAGE_1_MAP_CONFIG.centerClearRadius
      const solidLayer = map.layers[0]!

      for (let dy = -clearR; dy <= clearR; dy++) {
        for (let dx = -clearR; dx <= clearR; dx++) {
          const tileX = centerTileX + dx
          const tileY = centerTileY + dy
          const idx = tileY * map.width + tileX
          expect(solidLayer.data[idx]).toBe(TileType.EMPTY)
        }
      }
    })

    test('obstacles not placed on borders', () => {
      const map = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)
      const solidLayer = map.layers[0]!

      // Borders should only have walls, not half-walls
      // (half-walls are only from obstacle templates, which are inset)
      for (let x = 0; x < map.width; x++) {
        expect(solidLayer.data[0 * map.width + x]).toBe(TileType.WALL)
        expect(solidLayer.data[(map.height - 1) * map.width + x]).toBe(TileType.WALL)
      }
      for (let y = 0; y < map.height; y++) {
        expect(solidLayer.data[y * map.width + 0]).toBe(TileType.WALL)
        expect(solidLayer.data[y * map.width + (map.width - 1)]).toBe(TileType.WALL)
      }
    })
  })

  describe('stage configurations', () => {
    test('stage 1 generates 50x38 map', () => {
      const map = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)
      expect(map.width).toBe(50)
      expect(map.height).toBe(38)
    })

    test('stage 2 generates 54x42 map', () => {
      const map = generateArena(STAGE_2_MAP_CONFIG, 12345, 0)
      expect(map.width).toBe(54)
      expect(map.height).toBe(42)
    })

    test('stage 3 generates 46x36 map', () => {
      const map = generateArena(STAGE_3_MAP_CONFIG, 12345, 0)
      expect(map.width).toBe(46)
      expect(map.height).toBe(36)
    })

    test('all stages use 32px tile size', () => {
      const map1 = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)
      const map2 = generateArena(STAGE_2_MAP_CONFIG, 12345, 0)
      const map3 = generateArena(STAGE_3_MAP_CONFIG, 12345, 0)

      expect(map1.tileSize).toBe(32)
      expect(map2.tileSize).toBe(32)
      expect(map3.tileSize).toBe(32)
    })
  })
})
