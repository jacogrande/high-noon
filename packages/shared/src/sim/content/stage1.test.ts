/**
 * Stage 1 Rework Tests
 *
 * Tests for the five new Stage 1 enemy types, the dustdevil zone system,
 * the cactus hazard tile, and the STAGE_1_ENCOUNTER structure.
 */

import { describe, expect, test, beforeEach } from 'bun:test'
import { addComponent } from 'bitecs'
import { EnemyType, EnemyTier, Health, Dead, ZPosition } from '../components'
import { getEnemyDef } from './enemyRegistry'
import { STAGE_1_ENCOUNTER } from './waves'
import { createGameWorld, setWorldTilemap, type GameWorld } from '../world'
import { spawnPlayer } from '../prefabs'
import { dustdevilZoneSystem } from '../systems/dustdevilZone'
import { hazardTileSystem } from '../systems/hazardTile'
import { createTilemap, addLayer, setTile, TileType } from '../tilemap'
import { CACTUS_DPS } from './hazards'
import { JUMP_AIRBORNE_THRESHOLD } from './jump'
import { TICK_S } from '../step'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Side-effect import: registers all enemy definitions into the registry
import './enemies'

// ---------------------------------------------------------------------------
// Enemy Registry Tests
// ---------------------------------------------------------------------------

describe('Enemy Registry — Stage 1 enemies', () => {
  describe('DRIFTER', () => {
    test('is registered in the enemy registry', () => {
      expect(getEnemyDef(EnemyType.DRIFTER)).toBeDefined()
    })

    test('has tier FODDER', () => {
      const def = getEnemyDef(EnemyType.DRIFTER)!
      expect(def.tier).toBe(EnemyTier.FODDER)
    })

    test('has hp 10', () => {
      const def = getEnemyDef(EnemyType.DRIFTER)!
      expect(def.hp).toBe(10)
    })

    test('has speed 70', () => {
      const def = getEnemyDef(EnemyType.DRIFTER)!
      expect(def.speed).toBe(70)
    })

    test('has attackStyle projectile', () => {
      const def = getEnemyDef(EnemyType.DRIFTER)!
      expect(def.attackStyle).toBe('projectile')
    })

    test('has projectileCount 1', () => {
      const def = getEnemyDef(EnemyType.DRIFTER)!
      expect(def.projectileCount).toBe(1)
    })
  })

  describe('KNIFE_DRIFTER', () => {
    test('is registered in the enemy registry', () => {
      expect(getEnemyDef(EnemyType.KNIFE_DRIFTER)).toBeDefined()
    })

    test('has tier FODDER', () => {
      const def = getEnemyDef(EnemyType.KNIFE_DRIFTER)!
      expect(def.tier).toBe(EnemyTier.FODDER)
    })

    test('has hp 12', () => {
      const def = getEnemyDef(EnemyType.KNIFE_DRIFTER)!
      expect(def.hp).toBe(12)
    })

    test('has speed 85', () => {
      const def = getEnemyDef(EnemyType.KNIFE_DRIFTER)!
      expect(def.speed).toBe(85)
    })

    test('has attackStyle melee', () => {
      const def = getEnemyDef(EnemyType.KNIFE_DRIFTER)!
      expect(def.attackStyle).toBe('melee')
    })
  })

  describe('DEADEYE', () => {
    test('is registered in the enemy registry', () => {
      expect(getEnemyDef(EnemyType.DEADEYE)).toBeDefined()
    })

    test('has tier THREAT', () => {
      const def = getEnemyDef(EnemyType.DEADEYE)!
      expect(def.tier).toBe(EnemyTier.THREAT)
    })

    test('has hp 15', () => {
      const def = getEnemyDef(EnemyType.DEADEYE)!
      expect(def.hp).toBe(15)
    })

    test('has speed 40', () => {
      const def = getEnemyDef(EnemyType.DEADEYE)!
      expect(def.speed).toBe(40)
    })

    test('has attackStyle projectile', () => {
      const def = getEnemyDef(EnemyType.DEADEYE)!
      expect(def.attackStyle).toBe('projectile')
    })

    test('has projectileSpeed 650', () => {
      const def = getEnemyDef(EnemyType.DEADEYE)!
      expect(def.projectileSpeed).toBe(650)
    })
  })

  describe('SPITTER', () => {
    test('is registered in the enemy registry', () => {
      expect(getEnemyDef(EnemyType.SPITTER)).toBeDefined()
    })

    test('has tier FODDER', () => {
      const def = getEnemyDef(EnemyType.SPITTER)!
      expect(def.tier).toBe(EnemyTier.FODDER)
    })

    test('has hp 22', () => {
      const def = getEnemyDef(EnemyType.SPITTER)!
      expect(def.hp).toBe(22)
    })

    test('has attackStyle projectile', () => {
      const def = getEnemyDef(EnemyType.SPITTER)!
      expect(def.attackStyle).toBe('projectile')
    })

    test('has projectileCount 6', () => {
      const def = getEnemyDef(EnemyType.SPITTER)!
      expect(def.projectileCount).toBe(6)
    })
  })

  describe('DUSTDEVIL', () => {
    test('is registered in the enemy registry', () => {
      expect(getEnemyDef(EnemyType.DUSTDEVIL)).toBeDefined()
    })

    test('has tier FODDER', () => {
      const def = getEnemyDef(EnemyType.DUSTDEVIL)!
      expect(def.tier).toBe(EnemyTier.FODDER)
    })

    test('has hp 13', () => {
      const def = getEnemyDef(EnemyType.DUSTDEVIL)!
      expect(def.hp).toBe(13)
    })

    test('has attackStyle custom', () => {
      const def = getEnemyDef(EnemyType.DUSTDEVIL)!
      expect(def.attackStyle).toBe('custom')
    })
  })
})

// ---------------------------------------------------------------------------
// Dustdevil Zone System Tests
// ---------------------------------------------------------------------------

describe('dustdevilZoneSystem', () => {
  let world: GameWorld
  let playerEid: number

  const zoneX = 100
  const zoneY = 100
  const zoneRadius = 50

  beforeEach(() => {
    world = createGameWorld(42)
    // Place the player inside the zone by default
    playerEid = spawnPlayer(world, zoneX, zoneY)
  })

  test('player inside zone takes dps * dt damage', () => {
    world.dustZones.push({ x: zoneX, y: zoneY, radius: zoneRadius, remaining: 2.0, dps: 10 })
    const startHp = Health.current[playerEid]!

    dustdevilZoneSystem(world, TICK_S)

    expect(Health.current[playerEid]).toBeCloseTo(startHp - 10 * TICK_S, 5)
  })

  test('player outside zone takes no damage', () => {
    // Place zone far away from the player
    world.dustZones.push({ x: 500, y: 500, radius: zoneRadius, remaining: 2.0, dps: 10 })
    const startHp = Health.current[playerEid]!

    dustdevilZoneSystem(world, TICK_S)

    expect(Health.current[playerEid]).toBe(startHp)
  })

  test('airborne player inside zone takes no damage', () => {
    world.dustZones.push({ x: zoneX, y: zoneY, radius: zoneRadius, remaining: 2.0, dps: 10 })
    ZPosition.z[playerEid] = JUMP_AIRBORNE_THRESHOLD + 1
    const startHp = Health.current[playerEid]!

    dustdevilZoneSystem(world, TICK_S)

    expect(Health.current[playerEid]).toBe(startHp)
  })

  test('dead player inside zone takes no damage', () => {
    world.dustZones.push({ x: zoneX, y: zoneY, radius: zoneRadius, remaining: 2.0, dps: 10 })
    addComponent(world, Dead, playerEid)
    const startHp = Health.current[playerEid]!

    dustdevilZoneSystem(world, TICK_S)

    expect(Health.current[playerEid]).toBe(startHp)
  })

  test('zone is removed when remaining reaches zero', () => {
    world.dustZones.push({ x: zoneX, y: zoneY, radius: zoneRadius, remaining: TICK_S * 0.5, dps: 10 })
    expect(world.dustZones).toHaveLength(1)

    dustdevilZoneSystem(world, TICK_S)

    expect(world.dustZones).toHaveLength(0)
  })

  test('zone persists when remaining is still positive after tick', () => {
    world.dustZones.push({ x: zoneX, y: zoneY, radius: zoneRadius, remaining: 2.0, dps: 10 })

    dustdevilZoneSystem(world, TICK_S)

    expect(world.dustZones).toHaveLength(1)
  })

  test('zone remaining is decremented by dt each tick', () => {
    world.dustZones.push({ x: zoneX, y: zoneY, radius: zoneRadius, remaining: 2.0, dps: 10 })

    dustdevilZoneSystem(world, TICK_S)

    expect(world.dustZones[0]!.remaining).toBeCloseTo(2.0 - TICK_S, 5)
  })

  test('dustZonesSpawnedThisTick is cleared each tick', () => {
    // Pre-populate with a stale entry from a previous tick
    world.dustZonesSpawnedThisTick.push({ x: 0, y: 0, radius: 10 })
    expect(world.dustZonesSpawnedThisTick).toHaveLength(1)

    dustdevilZoneSystem(world, TICK_S)

    expect(world.dustZonesSpawnedThisTick).toHaveLength(0)
  })

  test('multiple expired zones are all removed in one tick', () => {
    world.dustZones.push({ x: zoneX, y: zoneY, radius: zoneRadius, remaining: 0.001, dps: 10 })
    world.dustZones.push({ x: zoneX + 200, y: zoneY, radius: zoneRadius, remaining: 0.001, dps: 5 })
    expect(world.dustZones).toHaveLength(2)

    dustdevilZoneSystem(world, TICK_S)

    expect(world.dustZones).toHaveLength(0)
  })

  test('only expired zones are removed when mix of active and expired', () => {
    world.dustZones.push({ x: 500, y: 500, radius: zoneRadius, remaining: 0.001, dps: 5 })
    world.dustZones.push({ x: 200, y: 200, radius: zoneRadius, remaining: 5.0, dps: 5 })
    expect(world.dustZones).toHaveLength(2)

    dustdevilZoneSystem(world, TICK_S)

    expect(world.dustZones).toHaveLength(1)
    expect(world.dustZones[0]!.remaining).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Cactus Hazard Tile Tests
// ---------------------------------------------------------------------------

function createCactusMap() {
  const map = createTilemap(4, 4, 32)
  addLayer(map, true)  // layer 0 = solid
  addLayer(map, false) // layer 1 = floor
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      setTile(map, 1, x, y, TileType.FLOOR)
    }
  }
  setTile(map, 1, 1, 1, TileType.CACTUS)
  return map
}

describe('hazardTileSystem — cactus', () => {
  let world: GameWorld

  // Cactus tile is at grid position (1, 1); world center = tileX * 32 + 16
  const cactusX = 1 * 32 + 16
  const cactusY = 1 * 32 + 16
  const safeX = 2 * 32 + 16
  const safeY = 2 * 32 + 16

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createCactusMap())
  })

  test('player on cactus tile takes CACTUS_DPS * TICK_S damage', () => {
    const eid = spawnPlayer(world, cactusX, cactusY)
    const startHp = Health.current[eid]!

    hazardTileSystem(world, TICK_S)

    expect(Health.current[eid]).toBeCloseTo(startHp - CACTUS_DPS * TICK_S, 5)
  })

  test('player off cactus tile takes no damage', () => {
    const eid = spawnPlayer(world, safeX, safeY)
    const startHp = Health.current[eid]!

    hazardTileSystem(world, TICK_S)

    expect(Health.current[eid]).toBe(startHp)
  })

  test('airborne player on cactus tile takes no damage', () => {
    const eid = spawnPlayer(world, cactusX, cactusY)
    ZPosition.z[eid] = JUMP_AIRBORNE_THRESHOLD + 1
    const startHp = Health.current[eid]!

    hazardTileSystem(world, TICK_S)

    expect(Health.current[eid]).toBe(startHp)
  })

  test('dead player on cactus tile is skipped', () => {
    const eid = spawnPlayer(world, cactusX, cactusY)
    const startHp = Health.current[eid]!
    addComponent(world, Dead, eid)

    hazardTileSystem(world, TICK_S)

    expect(Health.current[eid]).toBe(startHp)
  })

  test('cactus does not apply a speed debuff', () => {
    const eid = spawnPlayer(world, cactusX, cactusY)

    hazardTileSystem(world, TICK_S)

    expect(world.floorSpeedMul.has(eid)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Stage 1 Encounter Structure Tests
// ---------------------------------------------------------------------------

describe('STAGE_1_ENCOUNTER structure', () => {
  test('has exactly 3 waves', () => {
    expect(STAGE_1_ENCOUNTER.waves).toHaveLength(3)
  })

  describe('Wave 1', () => {
    const wave1 = STAGE_1_ENCOUNTER.waves[0]!

    test('fodder pool contains only DRIFTER and KNIFE_DRIFTER', () => {
      const types = wave1.fodderPool.map(fp => fp.type)
      expect(types).toContain(EnemyType.DRIFTER)
      expect(types).toContain(EnemyType.KNIFE_DRIFTER)
      expect(types).toHaveLength(2)
    })

    test('has no threats', () => {
      expect(wave1.threats).toHaveLength(0)
    })

    test('has threatClearRatio of 1.0', () => {
      expect(wave1.threatClearRatio).toBe(1.0)
    })
  })

  describe('Wave 2', () => {
    const wave2 = STAGE_1_ENCOUNTER.waves[1]!

    test('threats include DEADEYE', () => {
      const threatTypes = wave2.threats.map(t => t.type)
      expect(threatTypes).toContain(EnemyType.DEADEYE)
    })

    test('has threatClearRatio of 1.0', () => {
      expect(wave2.threatClearRatio).toBe(1.0)
    })
  })

  describe('Wave 3', () => {
    const wave3 = STAGE_1_ENCOUNTER.waves[2]!

    test('fodder pool includes DUSTDEVIL', () => {
      const types = wave3.fodderPool.map(fp => fp.type)
      expect(types).toContain(EnemyType.DUSTDEVIL)
    })

    test('has threatClearRatio of 1.0', () => {
      expect(wave3.threatClearRatio).toBe(1.0)
    })
  })

  test('all waves have threatClearRatio of 1.0', () => {
    for (const wave of STAGE_1_ENCOUNTER.waves) {
      expect(wave.threatClearRatio).toBe(1.0)
    }
  })
})
