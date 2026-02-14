import { describe, expect, test } from 'bun:test'
import { getTile, TileType } from '../../tilemap'
import { STAGE_1_MAP_CONFIG } from './mapConfig'
import { generateArena } from './mapGenerator'
import { generateCampSalesmanSpawn, generateStagePoiLayout } from './poiGenerator'

function worldToTile(map: ReturnType<typeof generateArena>, x: number, y: number): { tileX: number; tileY: number } {
  return {
    tileX: Math.floor(x / map.tileSize),
    tileY: Math.floor(y / map.tileSize),
  }
}

describe('poiGenerator', () => {
  test('stage poi layout is deterministic for same seed and stage', () => {
    const seed = 424242
    const stageIndex = 1
    const map = generateArena(STAGE_1_MAP_CONFIG, seed, stageIndex)
    const a = generateStagePoiLayout(map, seed, stageIndex)
    const b = generateStagePoiLayout(map, seed, stageIndex)
    expect(a).toEqual(b)
  })

  test('returns stash points on walkable floor tiles', () => {
    const seed = 9901
    const stageIndex = 0
    const map = generateArena(STAGE_1_MAP_CONFIG, seed, stageIndex)
    const layout = generateStagePoiLayout(map, seed, stageIndex)

    expect(layout.stashes.length).toBeGreaterThan(0)
    for (const stash of layout.stashes) {
      const tile = worldToTile(map, stash.x, stash.y)
      expect(getTile(map, 0, tile.tileX, tile.tileY)).toBe(TileType.EMPTY)
      expect(getTile(map, 1, tile.tileX, tile.tileY)).toBe(TileType.FLOOR)
    }
  })

  test('camp salesman spawn resolves to walkable tile', () => {
    const map = generateArena(STAGE_1_MAP_CONFIG, 1234, 0)
    const spawn = generateCampSalesmanSpawn(map)
    const tile = worldToTile(map, spawn.x, spawn.y)
    expect(getTile(map, 0, tile.tileX, tile.tileY)).toBe(TileType.EMPTY)
    expect(getTile(map, 1, tile.tileX, tile.tileY)).toBe(TileType.FLOOR)
  })
})
