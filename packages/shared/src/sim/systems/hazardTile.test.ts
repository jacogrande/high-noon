import { beforeEach, describe, expect, test } from 'bun:test'
import { addComponent } from 'bitecs'
import { createGameWorld, setWorldTilemap, type GameWorld } from '../world'
import { spawnPlayer } from '../prefabs'
import { hazardTileSystem } from './hazardTile'
import { Health, Dead, ZPosition } from '../components'
import { createTilemap, addLayer, setTile, TileType } from '../tilemap'
import { LAVA_DPS, BRIMSTONE_DPS, DARKNESS_DPS, DARKNESS_SPEED_MUL, ROAD_SPEED_MUL } from '../content/hazards'
import { getFloorPathfindCost } from '../content/hazards'
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

// ── Brimstone and Darkness hazard tests ──────────────────────────────

function createBrimstoneMap() {
  const map = createTilemap(4, 4, 32)
  addLayer(map, true)
  addLayer(map, false)
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      setTile(map, 1, x, y, TileType.FLOOR)
    }
  }
  setTile(map, 1, 1, 1, TileType.BRIMSTONE)
  return map
}

function createDarknessMap() {
  const map = createTilemap(4, 4, 32)
  addLayer(map, true)
  addLayer(map, false)
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      setTile(map, 1, x, y, TileType.FLOOR)
    }
  }
  setTile(map, 1, 1, 1, TileType.DARKNESS)
  return map
}

describe('hazardTileSystem — brimstone', () => {
  let world: GameWorld

  const brimX = 1 * 32 + 16
  const brimY = 1 * 32 + 16
  const safeX = 2 * 32 + 16
  const safeY = 2 * 32 + 16

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createBrimstoneMap())
  })

  test('entity on brimstone takes DPS-scaled damage', () => {
    const eid = spawnPlayer(world, brimX, brimY)
    const startHp = Health.current[eid]!

    hazardTileSystem(world, TICK_S)

    expect(Health.current[eid]).toBeCloseTo(startHp - BRIMSTONE_DPS * TICK_S, 5)
  })

  test('brimstone does not apply speed debuff', () => {
    const eid = spawnPlayer(world, brimX, brimY)

    hazardTileSystem(world, TICK_S)

    expect(world.floorSpeedMul.has(eid)).toBe(false)
  })

  test('airborne entity on brimstone takes no damage', () => {
    const eid = spawnPlayer(world, brimX, brimY)
    ZPosition.z[eid] = JUMP_AIRBORNE_THRESHOLD + 1
    const startHp = Health.current[eid]!

    hazardTileSystem(world, TICK_S)

    expect(Health.current[eid]).toBe(startHp)
  })

  test('dead entity on brimstone is skipped', () => {
    const eid = spawnPlayer(world, brimX, brimY)
    const startHp = Health.current[eid]!
    addComponent(world, Dead, eid)

    hazardTileSystem(world, TICK_S)

    expect(Health.current[eid]).toBe(startHp)
  })
})

describe('hazardTileSystem — darkness', () => {
  let world: GameWorld

  const darkX = 1 * 32 + 16
  const darkY = 1 * 32 + 16

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createDarknessMap())
  })

  test('entity on darkness takes DPS-scaled damage', () => {
    const eid = spawnPlayer(world, darkX, darkY)
    const startHp = Health.current[eid]!

    hazardTileSystem(world, TICK_S)

    expect(Health.current[eid]).toBeCloseTo(startHp - DARKNESS_DPS * TICK_S, 5)
  })

  test('entity on darkness gets speed debuff', () => {
    const eid = spawnPlayer(world, darkX, darkY)

    hazardTileSystem(world, TICK_S)

    expect(world.floorSpeedMul.get(eid)).toBe(DARKNESS_SPEED_MUL)
  })

  test('airborne entity on darkness takes no damage', () => {
    const eid = spawnPlayer(world, darkX, darkY)
    ZPosition.z[eid] = JUMP_AIRBORNE_THRESHOLD + 1
    const startHp = Health.current[eid]!

    hazardTileSystem(world, TICK_S)

    expect(Health.current[eid]).toBe(startHp)
  })

  test('dead entity on darkness is skipped', () => {
    const eid = spawnPlayer(world, darkX, darkY)
    const startHp = Health.current[eid]!
    addComponent(world, Dead, eid)

    hazardTileSystem(world, TICK_S)

    expect(Health.current[eid]).toBe(startHp)
  })
})

// ── Road speed bonus tests ──────────────────────────────────────────

function createRoadMap() {
  const map = createTilemap(4, 4, 32)
  addLayer(map, true)
  addLayer(map, false)
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      setTile(map, 1, x, y, TileType.FLOOR)
    }
  }
  setTile(map, 1, 1, 1, TileType.ROAD)
  return map
}

describe('hazardTileSystem — road', () => {
  let world: GameWorld

  const roadX = 1 * 32 + 16
  const roadY = 1 * 32 + 16
  const floorX = 2 * 32 + 16
  const floorY = 2 * 32 + 16

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createRoadMap())
  })

  test('entity on road gets ROAD_SPEED_MUL', () => {
    const eid = spawnPlayer(world, roadX, roadY)

    hazardTileSystem(world, TICK_S)

    expect(world.floorSpeedMul.get(eid)).toBe(ROAD_SPEED_MUL)
  })

  test('entity on road takes no damage', () => {
    const eid = spawnPlayer(world, roadX, roadY)
    const startHp = Health.current[eid]!

    hazardTileSystem(world, TICK_S)

    expect(Health.current[eid]).toBe(startHp)
  })

  test('entity off road has no speed multiplier', () => {
    const eid = spawnPlayer(world, floorX, floorY)

    hazardTileSystem(world, TICK_S)

    expect(world.floorSpeedMul.has(eid)).toBe(false)
  })

  test('road pathfind cost is less than floor cost', () => {
    const roadCost = getFloorPathfindCost(TileType.ROAD)
    const floorCost = getFloorPathfindCost(TileType.FLOOR)
    expect(roadCost).toBeLessThan(floorCost)
  })
})
