/**
 * Tests for procedural map generator.
 *
 * Validates determinism, map constraints, connectivity, and hazard placement.
 */

import { describe, expect, test } from 'bun:test'
import { generateArena, generateMap } from './mapGenerator'
import { STAGE_1_MAP_CONFIG, STAGE_2_MAP_CONFIG, STAGE_3_MAP_CONFIG, STAGE_4_MAP_CONFIG } from './mapConfig'
import { TOWN_BUILDINGS } from './buildingProfiles'
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

          // Check floor tile is not a hazard (ROAD is allowed — purely visual)
          const floorTile = getFloorTileTypeAt(map, worldX + map.tileSize / 2, worldY + map.tileSize / 2)
          expect(floorTile === TileType.FLOOR || floorTile === TileType.ROAD).toBe(true)
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
      const map = generateArena(STAGE_2_MAP_CONFIG, 12345, 0)
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
      const map = generateArena(STAGE_2_MAP_CONFIG, 12345, 0)
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
      // Each hazard type is capped independently; total can be the sum of all caps
      const totalMaxCoverage = STAGE_2_MAP_CONFIG.hazards.reduce((sum, h) => sum + h.maxCoverage, 0)
      expect(coverage).toBeLessThanOrEqual(totalMaxCoverage)
    })

    test('stage 1 has no hazards', () => {
      const map = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)
      const floorLayer = map.layers[1]!

      for (const tile of floorLayer.data) {
        expect(tile === TileType.LAVA || tile === TileType.MUD || tile === TileType.BRAMBLE).toBe(false)
      }
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

  describe('building placement', () => {
    test('stage 1 maps have placedBuildings', () => {
      const map = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)
      expect(map.placedBuildings).toBeDefined()
      // 3-tier dense town: frontage + back row + far lots with reusable filler
      expect(map.placedBuildings!.length).toBeGreaterThanOrEqual(20)
      expect(map.placedBuildings!.length).toBeLessThanOrEqual(40)
    })

    test('all 5 unique building IDs are placed', () => {
      const map = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)
      const ids = new Set(map.placedBuildings!.map(b => b.profileId))
      expect(ids.has('general_store')).toBe(true)
      expect(ids.has('saloon')).toBe(true)
      expect(ids.has('barber')).toBe(true)
      expect(ids.has('sheriff')).toBe(true)
      expect(ids.has('bank')).toBe(true)
    })

    test('unique buildings appear exactly once each', () => {
      const map = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)
      const uniqueIds = ['general_store', 'saloon', 'barber', 'sheriff', 'bank']
      for (const id of uniqueIds) {
        const count = map.placedBuildings!.filter(b => b.profileId === id).length
        expect(count).toBe(1)
      }
    })

    test('all 5 unique buildings placed across multiple seeds', () => {
      const uniqueIds = ['general_store', 'saloon', 'barber', 'sheriff', 'bank']
      for (const seed of [1, 42, 9999, 77777, 123456]) {
        const map = generateArena(STAGE_1_MAP_CONFIG, seed, 0)
        const ids = new Set(map.placedBuildings!.map(b => b.profileId))
        for (const id of uniqueIds) {
          expect(ids.has(id)).toBe(true)
        }
      }
    })

    test('building collision tiles exist in solid layer', () => {
      const map = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)
      const solidLayer = map.layers[0]!

      for (const building of map.placedBuildings!) {
        // At least the origin tile should be WALL
        const idx = building.tileY * map.width + building.tileX
        expect(solidLayer.data[idx]).toBe(TileType.WALL)
      }
    })

    test('no building tile overlaps center exclusion zone', () => {
      const map = generateArena(STAGE_1_MAP_CONFIG, 42, 0)
      const centerTileX = Math.floor(map.width / 2)
      const centerTileY = Math.floor(map.height / 2)
      const clearR = STAGE_1_MAP_CONFIG.centerClearRadius

      for (const building of map.placedBuildings!) {
        const profile = TOWN_BUILDINGS.find(p => p.id === building.profileId)!
        // Check every tile in the building footprint
        for (let dy = 0; dy < profile.heightTiles; dy++) {
          for (let dx = 0; dx < profile.widthTiles; dx++) {
            const tileX = building.tileX + dx
            const tileY = building.tileY + dy
            const inZone =
              Math.abs(tileX - centerTileX) <= clearR &&
              Math.abs(tileY - centerTileY) <= clearR
            expect(inZone).toBe(false)
          }
        }
      }
    })

    test('stage 2 maps have no placedBuildings', () => {
      const map = generateArena(STAGE_2_MAP_CONFIG, 12345, 1)
      expect(map.placedBuildings).toBeUndefined()
    })

    test('stage 3 maps have no placedBuildings', () => {
      const map = generateArena(STAGE_3_MAP_CONFIG, 12345, 2)
      expect(map.placedBuildings).toBeUndefined()
    })

    test('building placements are deterministic', () => {
      const map1 = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)
      const map2 = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)

      expect(map1.placedBuildings!.length).toBe(map2.placedBuildings!.length)
      for (let i = 0; i < map1.placedBuildings!.length; i++) {
        expect(map1.placedBuildings![i]!.profileId).toBe(map2.placedBuildings![i]!.profileId)
        expect(map1.placedBuildings![i]!.tileX).toBe(map2.placedBuildings![i]!.tileX)
        expect(map1.placedBuildings![i]!.tileY).toBe(map2.placedBuildings![i]!.tileY)
      }
    })

    test('building wall tiles survive connectivity repair', () => {
      const map = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)
      const solidLayer = map.layers[0]!

      for (const building of map.placedBuildings!) {
        const profile = TOWN_BUILDINGS.find(p => p.id === building.profileId)!
        for (const offset of profile.walls) {
          const idx = (building.tileY + offset.dy) * map.width + (building.tileX + offset.dx)
          expect(solidLayer.data[idx]).toBe(TileType.WALL)
        }
      }
    })

    test('different seeds produce different building arrangements', () => {
      const map1 = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)
      const map2 = generateArena(STAGE_1_MAP_CONFIG, 99999, 0)

      // At least one building should differ in position or ordering
      const ids1 = map1.placedBuildings!.map(b => b.profileId).join(',')
      const ids2 = map2.placedBuildings!.map(b => b.profileId).join(',')
      const pos1 = map1.placedBuildings!.map(b => `${b.tileX},${b.tileY}`).join(';')
      const pos2 = map2.placedBuildings!.map(b => `${b.tileX},${b.tileY}`).join(';')
      expect(ids1 !== ids2 || pos1 !== pos2).toBe(true)
    })

    test('cross alley corridors are clear of solid tiles', () => {
      // Test multiple seeds to cover 0/1/2 alley cases
      // Check per-column using the bent profile (not the bounding box)
      for (const seed of [1, 42, 9999, 77777, 123456, 55555, 31337]) {
        const map = generateArena(STAGE_1_MAP_CONFIG, seed, 0)
        const roadNetwork = map.roadNetwork
        if (!roadNetwork) continue
        const solidLayer = map.layers[0]!

        for (const alley of roadNetwork.alleys) {
          const halfW = Math.floor(alley.width / 2)
          for (let x = 1; x < map.width - 1; x++) {
            const cy = alley.profile[x]!
            const minY = cy - halfW
            const maxY = minY + alley.width
            for (let y = minY; y < maxY; y++) {
              if (y < 1 || y >= map.height - 1) continue
              const tile = solidLayer.data[y * map.width + x]!
              expect(tile).toBe(TileType.EMPTY)
            }
          }
        }
      }
    })

    test('road network is deterministic', () => {
      const map1 = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)
      const map2 = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)

      const rn1 = map1.roadNetwork!
      const rn2 = map2.roadNetwork!

      // Street profile must match
      expect(rn1.streetProfile.length).toBe(rn2.streetProfile.length)
      for (let i = 0; i < rn1.streetProfile.length; i++) {
        expect(rn1.streetProfile[i]).toBe(rn2.streetProfile[i])
      }

      // Alley profiles must match
      expect(rn1.alleys.length).toBe(rn2.alleys.length)
      for (let i = 0; i < rn1.alleys.length; i++) {
        expect(rn1.alleys[i]!.bounds.minY).toBe(rn2.alleys[i]!.bounds.minY)
        expect(rn1.alleys[i]!.bounds.maxY).toBe(rn2.alleys[i]!.bounds.maxY)
        for (let x = 0; x < rn1.alleys[i]!.profile.length; x++) {
          expect(rn1.alleys[i]!.profile[x]).toBe(rn2.alleys[i]!.profile[x])
        }
      }

      // Spur roads must match
      expect(rn1.spurs.length).toBe(rn2.spurs.length)
      for (let i = 0; i < rn1.spurs.length; i++) {
        expect(rn1.spurs[i]!.y).toBe(rn2.spurs[i]!.y)
        expect(rn1.spurs[i]!.startX).toBe(rn2.spurs[i]!.startX)
        expect(rn1.spurs[i]!.length).toBe(rn2.spurs[i]!.length)
        expect(rn1.spurs[i]!.direction).toBe(rn2.spurs[i]!.direction)
      }
    })

    test('main street and cross alleys have road tiles on floor layer', () => {
      const map = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)
      const floorLayer = map.layers[1]!

      // Count road tiles
      let roadCount = 0
      for (let i = 0; i < floorLayer.data.length; i++) {
        if (floorLayer.data[i] === TileType.ROAD) roadCount++
      }

      // Main street is 4 tiles wide × (height - 2 border) interior rows.
      // Conservatively expect at least 30% unobstructed by buildings/obstacles.
      const interiorRows = STAGE_1_MAP_CONFIG.height - 2
      const minRoadTiles = Math.floor(4 * interiorRows * 0.3)
      expect(roadCount).toBeGreaterThan(minRoadTiles)

      // Verify road tiles exist in cross alley ranges (if any alleys exist)
      const alleys = map.crossAlleys ?? []
      for (const alley of alleys) {
        let alleyRoadCount = 0
        for (let y = alley.minY; y < alley.maxY; y++) {
          for (let x = 1; x < map.width - 1; x++) {
            if (floorLayer.data[y * map.width + x] === TileType.ROAD) {
              alleyRoadCount++
            }
          }
        }
        // Each alley should have road tiles (full width minus solid tiles)
        expect(alleyRoadCount).toBeGreaterThan(0)
      }
    })

    test('cross alley count varies across seeds', () => {
      const counts = new Set<number>()
      for (let seed = 0; seed < 60; seed++) {
        const map = generateArena(STAGE_1_MAP_CONFIG, seed, 0)
        counts.add((map.crossAlleys ?? []).length)
      }
      // With 60 seeds and distribution 25%/50%/25%, we expect all of 0, 1, 2
      expect(counts.has(0)).toBe(true)
      expect(counts.has(1)).toBe(true)
      expect(counts.has(2)).toBe(true)
    })

    test('main street profile meanders within drift limits', () => {
      for (const seed of [1, 42, 9999, 77777, 123456]) {
        const map = generateArena(STAGE_1_MAP_CONFIG, seed, 0)
        const rn = map.roadNetwork!
        for (let y = 0; y < rn.streetProfile.length; y++) {
          const drift = Math.abs(rn.streetProfile[y]! - rn.streetCenterX)
          expect(drift).toBeLessThanOrEqual(3)
        }
      }
    })

    test('main street profile has no gaps (adjacent rows differ by at most 1)', () => {
      for (const seed of [1, 42, 9999, 77777, 123456]) {
        const map = generateArena(STAGE_1_MAP_CONFIG, seed, 0)
        const profile = map.roadNetwork!.streetProfile
        for (let y = 1; y < profile.length; y++) {
          const diff = Math.abs(profile[y]! - profile[y - 1]!)
          expect(diff).toBeLessThanOrEqual(1)
        }
      }
    })

    test('cross alley profiles bend within drift limits', () => {
      for (const seed of [1, 42, 9999, 77777, 123456]) {
        const map = generateArena(STAGE_1_MAP_CONFIG, seed, 0)
        const rn = map.roadNetwork
        if (!rn) continue
        for (const alley of rn.alleys) {
          const halfW = Math.floor(alley.width / 2)
          for (let x = 0; x < alley.profile.length; x++) {
            const cy = alley.profile[x]!
            // Every profile point must be within bounds envelope
            expect(cy - halfW).toBeGreaterThanOrEqual(alley.bounds.minY)
            expect(cy - halfW + alley.width).toBeLessThanOrEqual(alley.bounds.maxY)
          }
        }
      }
    })

    test('spur roads produce road tiles between buildings', () => {
      const map = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)
      const rn = map.roadNetwork!
      const floorLayer = map.layers[1]!

      // Count road tiles that are not on the main street or alleys
      // Spurs should contribute some road tiles
      if (rn.spurs.length === 0) return

      let spurRoadCount = 0
      for (const spur of rn.spurs) {
        for (let i = 0; i < spur.length; i++) {
          const x = spur.startX + spur.direction * i
          for (let dy = 0; dy < spur.height; dy++) {
            const y = spur.y + dy
            if (x < 1 || x >= map.width - 1 || y < 1 || y >= map.height - 1) continue
            if (floorLayer.data[y * map.width + x] === TileType.ROAD) {
              spurRoadCount++
            }
          }
        }
      }
      expect(spurRoadCount).toBeGreaterThan(0)
    })

    test('street profile varies across seeds', () => {
      const map1 = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)
      const map2 = generateArena(STAGE_1_MAP_CONFIG, 99999, 0)
      const p1 = map1.roadNetwork!.streetProfile
      const p2 = map2.roadNetwork!.streetProfile

      let differs = false
      for (let y = 0; y < p1.length; y++) {
        if (p1[y] !== p2[y]) { differs = true; break }
      }
      expect(differs).toBe(true)
    })
  })

  describe('map obstacle placement', () => {
    test('stage 1 generates map obstacles', () => {
      const map = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)
      expect(map.mapObstacles).toBeDefined()
      expect(map.mapObstacles!.length).toBeGreaterThan(0)
      expect(map.mapObstacles!.length).toBeLessThanOrEqual(STAGE_1_MAP_CONFIG.mapObstacles!.count)
    })

    test('stage 2 generates map obstacles', () => {
      const map = generateArena(STAGE_2_MAP_CONFIG, 12345, 1)
      expect(map.mapObstacles).toBeDefined()
      expect(map.mapObstacles!.length).toBeGreaterThan(0)
    })

    test('stage 3 generates map obstacles', () => {
      const map = generateArena(STAGE_3_MAP_CONFIG, 12345, 2)
      expect(map.mapObstacles).toBeDefined()
      expect(map.mapObstacles!.length).toBeGreaterThan(0)
    })

    test('obstacle tiles are stamped as WALL or HALF_WALL', () => {
      const map = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)
      const solidLayer = map.layers[0]!
      for (const obs of map.mapObstacles!) {
        for (const tile of obs.tiles) {
          const tileVal = solidLayer.data[tile.tileY * map.width + tile.tileX]!
          expect(tileVal === TileType.WALL || tileVal === TileType.HALF_WALL).toBe(true)
        }
      }
    })

    test('obstacles not placed in center exclusion zone', () => {
      const map = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)
      const centerTileX = Math.floor(map.width / 2)
      const centerTileY = Math.floor(map.height / 2)
      const clearR = STAGE_1_MAP_CONFIG.centerClearRadius
      for (const obs of map.mapObstacles!) {
        for (const tile of obs.tiles) {
          const inZone =
            Math.abs(tile.tileX - centerTileX) <= clearR &&
            Math.abs(tile.tileY - centerTileY) <= clearR
          expect(inZone).toBe(false)
        }
      }
    })

    test('obstacle IDs are unique', () => {
      const map = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)
      const ids = new Set(map.mapObstacles!.map(o => o.id))
      expect(ids.size).toBe(map.mapObstacles!.length)
    })

    test('obstacles have valid world-space positions', () => {
      const map = generateArena(STAGE_2_MAP_CONFIG, 42, 1)
      for (const obs of map.mapObstacles!) {
        expect(obs.x).toBeGreaterThan(0)
        expect(obs.y).toBeGreaterThan(0)
        expect(obs.x).toBeLessThan(map.width * map.tileSize)
        expect(obs.y).toBeLessThan(map.height * map.tileSize)
      }
    })

    test('map obstacles are deterministic', () => {
      const map1 = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)
      const map2 = generateArena(STAGE_1_MAP_CONFIG, 12345, 0)
      expect(map1.mapObstacles!.length).toBe(map2.mapObstacles!.length)
      for (let i = 0; i < map1.mapObstacles!.length; i++) {
        expect(map1.mapObstacles![i]!.type).toBe(map2.mapObstacles![i]!.type)
        expect(map1.mapObstacles![i]!.x).toBe(map2.mapObstacles![i]!.x)
        expect(map1.mapObstacles![i]!.y).toBe(map2.mapObstacles![i]!.y)
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

  describe('generateMap dispatcher', () => {
    test('routes STAGE_1_MAP_CONFIG to procedural arena', () => {
      const map = generateMap(STAGE_1_MAP_CONFIG, 12345, 0)
      expect(map.width).toBe(STAGE_1_MAP_CONFIG.width)
      expect(map.height).toBe(STAGE_1_MAP_CONFIG.height)
      // Procedural maps have road networks (town layout)
      expect(map.roadNetwork).toBeDefined()
      expect(map.crossroadsLandmarks).toBeUndefined()
    })

    test('routes STAGE_4_MAP_CONFIG to crossroads generator', () => {
      const map = generateMap(STAGE_4_MAP_CONFIG, 12345, 3)
      expect(map.width).toBe(STAGE_4_MAP_CONFIG.width)
      expect(map.height).toBe(STAGE_4_MAP_CONFIG.height)
      // Crossroads maps have landmarks, no road network
      expect(map.crossroadsLandmarks).toBeDefined()
      expect(map.crossroadsLandmarks!.signpost).toBeDefined()
      expect(map.crossroadsLandmarks!.lanterns).toHaveLength(4)
    })

    test('crossroads ignores seed (always deterministic)', () => {
      const map1 = generateMap(STAGE_4_MAP_CONFIG, 111, 3)
      const map2 = generateMap(STAGE_4_MAP_CONFIG, 999, 3)
      // Same layout regardless of seed
      expect(map1.crossroadsLandmarks!.signpost).toEqual(map2.crossroadsLandmarks!.signpost)
    })
  })
})
