/**
 * Map obstacle system integration tests.
 *
 * Verifies the full lifecycle: system clears per-tick events,
 * obstacles track state correctly across ticks.
 */

import { describe, expect, test, beforeEach } from 'bun:test'
import { createGameWorld, setWorldTilemap, type GameWorld } from '../world'
import { mapObstacleSystem } from './mapObstacle'
import { createTestArena } from '../content/maps/testArena'
import { MapObstacleType, type MapObstacle } from '../content/maps/mapObstacleDefs'
import { TileType, setTile } from '../tilemap'

describe('mapObstacleSystem', () => {
  let world: GameWorld

  beforeEach(() => {
    world = createGameWorld(42)
    const tilemap = createTestArena()
    setWorldTilemap(world, tilemap)
  })

  test('clears obstacleDestructions each tick', () => {
    world.obstacleDestructions.push({
      id: 1,
      type: MapObstacleType.CRATE,
      x: 100,
      y: 100,
    })

    mapObstacleSystem(world, 1 / 60)

    expect(world.obstacleDestructions.length).toBe(0)
  })

  test('clears obstacleHits each tick', () => {
    world.obstacleHits.push({
      id: 1,
      x: 100,
      y: 100,
      isWood: true,
    })

    mapObstacleSystem(world, 1 / 60)

    expect(world.obstacleHits.length).toBe(0)
  })

  test('does not affect mapObstacles array', () => {
    const ts = world.tilemap!.tileSize
    const obs: MapObstacle = {
      id: 1,
      type: MapObstacleType.CRATE,
      x: (5 + 0.5) * ts,
      y: (5 + 0.5) * ts,
      tiles: [{ tileX: 5, tileY: 5, tileType: TileType.WALL }],
      hp: 3,
      maxHp: 3,
      jumpable: false,
      widthTiles: 1,
      heightTiles: 1,
    }
    world.mapObstacles.push(obs)

    mapObstacleSystem(world, 1 / 60)

    expect(world.mapObstacles.length).toBe(1)
    expect(world.mapObstacles[0]!.hp).toBe(3)
  })
})
