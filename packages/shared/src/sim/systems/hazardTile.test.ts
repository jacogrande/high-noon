import { beforeEach, describe, expect, test } from 'bun:test'
import { addComponent } from 'bitecs'
import { createGameWorld, setWorldTilemap, type GameWorld } from '../world'
import { spawnPlayer } from '../prefabs'
import { hazardTileSystem } from './hazardTile'
import { Health, Dead, ZPosition } from '../components'
import { createTilemap, addLayer, setTile, TileType } from '../tilemap'
import { LAVA_DPS } from '../content/hazards'
import { JUMP_AIRBORNE_THRESHOLD } from '../content/jump'
import { TICK_S } from '../step'

function createLavaMap() {
  const map = createTilemap(4, 4, 32)
  addLayer(map, true)
  addLayer(map, false)

  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      setTile(map, 1, x, y, TileType.FLOOR)
    }
  }

  setTile(map, 1, 1, 1, TileType.LAVA)
  return map
}

describe('hazardTileSystem', () => {
  let world: GameWorld

  const lavaX = 1 * 32 + 16
  const lavaY = 1 * 32 + 16
  const floorX = 2 * 32 + 16
  const floorY = 2 * 32 + 16

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createLavaMap())
  })

  test('grounded entity on lava takes DPS-scaled damage', () => {
    const eid = spawnPlayer(world, lavaX, lavaY)
    const startHp = Health.current[eid]!

    hazardTileSystem(world, TICK_S)

    expect(Health.current[eid]).toBeCloseTo(startHp - LAVA_DPS * TICK_S, 5)
  })

  test('airborne entity on lava takes no damage', () => {
    const eid = spawnPlayer(world, lavaX, lavaY)
    ZPosition.z[eid] = JUMP_AIRBORNE_THRESHOLD + 1
    const startHp = Health.current[eid]!

    hazardTileSystem(world, TICK_S)

    expect(Health.current[eid]).toBe(startHp)
  })

  test('entity off lava takes no hazard damage', () => {
    const eid = spawnPlayer(world, floorX, floorY)
    const startHp = Health.current[eid]!

    hazardTileSystem(world, TICK_S)

    expect(Health.current[eid]).toBe(startHp)
  })

  test('dead entity on lava is skipped', () => {
    const eid = spawnPlayer(world, lavaX, lavaY)
    const startHp = Health.current[eid]!
    addComponent(world, Dead, eid)

    hazardTileSystem(world, TICK_S)

    expect(Health.current[eid]).toBe(startHp)
  })
})
