/**
 * Tests for map obstacle content definitions.
 */

import { describe, expect, test } from 'bun:test'
import { TileType } from '../../tilemap'
import {
  MapObstacleType,
  CRATE_DEF,
  BARREL_DEF,
  BOULDER_DEF,
  FALLEN_TREE_DEF,
  LOW_WALL_DEF,
  FENCE_RAIL_DEF,
  CACTUS_DEF,
  HITCHING_POST_DEF,
  STAGE_1_OBSTACLE_POOL,
  STAGE_2_OBSTACLE_POOL,
  STAGE_3_OBSTACLE_POOL,
  isWoodObstacle,
  type MapObstacleDef,
} from './mapObstacleDefs'

const ALL_DEFS: MapObstacleDef[] = [
  CRATE_DEF,
  BARREL_DEF,
  BOULDER_DEF,
  FALLEN_TREE_DEF,
  LOW_WALL_DEF,
  FENCE_RAIL_DEF,
  CACTUS_DEF,
  HITCHING_POST_DEF,
]

describe('mapObstacleDefs', () => {
  describe('tile offsets match dimensions', () => {
    for (const def of ALL_DEFS) {
      test(`${def.name} tile offsets fit within ${def.widthTiles}x${def.heightTiles}`, () => {
        const allOffsets = [
          ...def.walls.map(o => o),
          ...(def.halfWalls ?? []).map(o => o),
          ...(def.floorTiles ?? []).map(o => o),
        ]
        expect(allOffsets.length).toBeGreaterThan(0)

        for (const offset of allOffsets) {
          expect(offset.dx).toBeGreaterThanOrEqual(0)
          expect(offset.dx).toBeLessThan(def.widthTiles)
          expect(offset.dy).toBeGreaterThanOrEqual(0)
          expect(offset.dy).toBeLessThan(def.heightTiles)
        }
      })
    }
  })

  describe('jumpable defs use HALF_WALL, non-jumpable use WALL', () => {
    test('jumpable obstacles have halfWalls or floorTiles and no walls', () => {
      const jumpable = ALL_DEFS.filter(d => d.jumpable)
      expect(jumpable.length).toBeGreaterThan(0)
      for (const def of jumpable) {
        const hasHalfWalls = (def.halfWalls ?? []).length > 0
        const hasFloorTiles = (def.floorTiles ?? []).length > 0
        expect(hasHalfWalls || hasFloorTiles).toBe(true)
        expect(def.walls.length).toBe(0)
      }
    })

    test('non-jumpable obstacles have walls', () => {
      const nonJumpable = ALL_DEFS.filter(d => !d.jumpable)
      expect(nonJumpable.length).toBeGreaterThan(0)
      for (const def of nonJumpable) {
        expect(def.walls.length).toBeGreaterThan(0)
      }
    })
  })

  describe('all MapObstacleType values have definitions', () => {
    const typeValues = Object.values(MapObstacleType)
    const definedTypes = new Set(ALL_DEFS.map(d => d.type))

    test('every enum value has a corresponding def', () => {
      for (const val of typeValues) {
        expect(definedTypes.has(val)).toBe(true)
      }
    })
  })

  describe('per-stage obstacle pools', () => {
    test('stage 1 pool has entries', () => {
      expect(STAGE_1_OBSTACLE_POOL.length).toBeGreaterThan(0)
      for (const entry of STAGE_1_OBSTACLE_POOL) {
        expect(entry.weight).toBeGreaterThan(0)
      }
    })

    test('stage 2 pool has entries', () => {
      expect(STAGE_2_OBSTACLE_POOL.length).toBeGreaterThan(0)
    })

    test('stage 3 pool has entries', () => {
      expect(STAGE_3_OBSTACLE_POOL.length).toBeGreaterThan(0)
    })
  })

  describe('isWoodObstacle', () => {
    test('crate is wood', () => expect(isWoodObstacle(MapObstacleType.CRATE)).toBe(true))
    test('barrel is wood', () => expect(isWoodObstacle(MapObstacleType.BARREL)).toBe(true))
    test('low wall is wood', () => expect(isWoodObstacle(MapObstacleType.LOW_WALL)).toBe(true))
    test('fallen tree is wood', () => expect(isWoodObstacle(MapObstacleType.FALLEN_TREE)).toBe(true))
    test('fence rail is wood', () => expect(isWoodObstacle(MapObstacleType.FENCE_RAIL)).toBe(true))
    test('boulder is not wood', () => expect(isWoodObstacle(MapObstacleType.BOULDER)).toBe(false))
    test('hitching post is not wood', () => expect(isWoodObstacle(MapObstacleType.HITCHING_POST)).toBe(false))
  })

  describe('destructibility', () => {
    test('crate has hp=3', () => expect(CRATE_DEF.hp).toBe(3))
    test('barrel has hp=2', () => expect(BARREL_DEF.hp).toBe(2))
    test('boulder has hp=5', () => expect(BOULDER_DEF.hp).toBe(5))
    test('low wall has hp=4', () => expect(LOW_WALL_DEF.hp).toBe(4))
    test('fence rail has hp=3', () => expect(FENCE_RAIL_DEF.hp).toBe(3))
    test('fallen tree is indestructible', () => expect(FALLEN_TREE_DEF.hp).toBeUndefined())
  })
})
