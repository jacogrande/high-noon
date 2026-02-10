import { beforeEach, describe, expect, test } from 'bun:test'
import {
  AIState,
  EnemyAI,
  Position,
  Speed,
  Velocity,
  createGameWorld,
  createTilemap,
  addLayer,
  setTile,
  setWorldTilemap,
  spawnPlayer,
  spawnSwarmer,
  getFloorTileTypeAt,
  TileType,
  type GameWorld,
} from '../index'
import { enemySteeringSystem } from './enemySteering'

const TILE = 32

function createFloorMap(width: number, height: number) {
  const map = createTilemap(width, height, TILE)
  addLayer(map, true)
  addLayer(map, false)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      setTile(map, 1, x, y, TileType.FLOOR)
    }
  }
  return map
}

describe('enemySteeringSystem', () => {
  let world: GameWorld

  beforeEach(() => {
    world = createGameWorld(42)
  })

  test('reroutes to a non-lava direction when direct chase would step into lava', () => {
    const map = createFloorMap(5, 5)
    setTile(map, 1, 2, 2, TileType.LAVA)
    setWorldTilemap(world, map)

    const playerEid = spawnPlayer(world, 1 * TILE + TILE / 2, 2 * TILE + TILE / 2)
    const enemyEid = spawnSwarmer(world, 3 * TILE + TILE / 2, 2 * TILE + TILE / 2)

    EnemyAI.state[enemyEid] = AIState.CHASE
    EnemyAI.targetEid[enemyEid] = playerEid
    world.flowField = null

    enemySteeringSystem(world, 1 / 60)

    const speed = Speed.current[enemyEid]!
    const vx = Velocity.x[enemyEid]!
    const vy = Velocity.y[enemyEid]!
    const len = Math.sqrt(vx * vx + vy * vy)
    expect(len).toBeGreaterThan(0)

    const nx = vx / speed
    const ny = vy / speed
    const probeX = Position.x[enemyEid]! + nx * (TILE * 0.5)
    const probeY = Position.y[enemyEid]! + ny * (TILE * 0.5)

    expect(getFloorTileTypeAt(map, probeX, probeY)).not.toBe(TileType.LAVA)
  })

  test('still moves toward target when lava is the only traversable route', () => {
    const map = createFloorMap(3, 1)
    setTile(map, 1, 1, 0, TileType.LAVA)
    setWorldTilemap(world, map)

    const playerEid = spawnPlayer(world, TILE / 2, TILE / 2)
    const enemyEid = spawnSwarmer(world, 2 * TILE + TILE / 2, TILE / 2)

    EnemyAI.state[enemyEid] = AIState.CHASE
    EnemyAI.targetEid[enemyEid] = playerEid
    world.flowField = null

    enemySteeringSystem(world, 1 / 60)

    expect(Velocity.x[enemyEid]!).toBeLessThan(0)
    expect(Math.abs(Velocity.y[enemyEid]!)).toBeLessThan(1e-6)
  })
})
