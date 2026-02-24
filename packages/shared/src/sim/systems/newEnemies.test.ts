import { describe, expect, test, beforeEach } from 'bun:test'
import { addComponent, hasComponent, defineQuery } from 'bitecs'
import { createGameWorld, setWorldTilemap, type GameWorld } from '../world'
import { spawnPlayer, spawnArmoredBandit, spawnBullet, CollisionLayer } from '../prefabs'
import { rootSystem } from './root'
import { bulletCollisionSystem } from './bulletCollision'
import {
  Root, Velocity, Position, FrontArmor, Health, Collider,
} from '../components'
import { createSpatialHash, rebuildSpatialHash } from '../SpatialHash'
import { createTestArena } from '../content/maps/testArena'
import { ARMORED_BANDIT_FRONT_REDUCTION, ARMORED_BANDIT_ARC_HALF_ANGLE } from '../content/enemies'

const positionQuery = defineQuery([Position])

function rebuildHash(world: GameWorld): void {
  if (!world.spatialHash) {
    world.spatialHash = createSpatialHash(2000, 2000, 64)
  }
  const eids = Array.from(positionQuery(world))
  rebuildSpatialHash(world.spatialHash, eids, Position.x, Position.y)
}

describe('rootSystem', () => {
  let world: GameWorld
  let eid: number

  beforeEach(() => {
    world = createGameWorld(42)
    eid = spawnPlayer(world, 100, 100)
  })

  test('decrements duration each tick', () => {
    addComponent(world, Root, eid)
    Root.duration[eid] = 1.5

    rootSystem(world, 0.1)

    expect(Root.duration[eid]).toBeCloseTo(1.4)
  })

  test('zeros velocity while active', () => {
    addComponent(world, Root, eid)
    Root.duration[eid] = 1.0
    Velocity.x[eid] = 100
    Velocity.y[eid] = 50

    rootSystem(world, 0.1)

    expect(Velocity.x[eid]).toBe(0)
    expect(Velocity.y[eid]).toBe(0)
  })

  test('removes Root component when duration expires', () => {
    addComponent(world, Root, eid)
    Root.duration[eid] = 0.05

    rootSystem(world, 0.1)

    expect(hasComponent(world, Root, eid)).toBe(false)
  })

  test('does not zero velocity after removal', () => {
    addComponent(world, Root, eid)
    Root.duration[eid] = 0.05
    Velocity.x[eid] = 100
    Velocity.y[eid] = 50

    rootSystem(world, 0.1)

    // Root removes component and continues — velocity untouched after removal
    expect(Velocity.x[eid]).toBe(100)
    expect(Velocity.y[eid]).toBe(50)
  })
})

describe('FrontArmor bullet collision', () => {
  let world: GameWorld
  let armoredEid: number
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    playerEid = spawnPlayer(world, 100, 100)
    armoredEid = spawnArmoredBandit(world, 300, 100)
    // Face left (toward player)
    FrontArmor.facingAngle[armoredEid] = Math.PI
  })

  test('frontal shot deals reduced damage', () => {
    rebuildHash(world)
    const startHP = Health.current[armoredEid]!

    // Shoot from left → right (into the front, since facing = PI = left)
    // Bullet direction (0 rad) is opposite to facing (PI rad) → frontal hit
    spawnBullet(world, {
      x: 290, y: 100,
      vx: 300, vy: 0,
      damage: 10,
      range: 500,
      ownerId: playerEid,
      layer: CollisionLayer.PLAYER_BULLET,
    })
    rebuildHash(world)

    bulletCollisionSystem(world, 1 / 60)

    const reducedDamage = Math.ceil(10 * ARMORED_BANDIT_FRONT_REDUCTION)
    expect(Health.current[armoredEid]).toBe(startHP - reducedDamage)
  })

  test('rear shot deals full damage', () => {
    rebuildHash(world)
    const startHP = Health.current[armoredEid]!

    // Shoot from right → left (into the back, since facing = PI = left)
    // Bullet direction (PI rad) ≈ facing (PI rad) → rear hit, no armor
    spawnBullet(world, {
      x: 310, y: 100,
      vx: -300, vy: 0,
      damage: 10,
      range: 500,
      ownerId: playerEid,
      layer: CollisionLayer.PLAYER_BULLET,
    })
    rebuildHash(world)

    bulletCollisionSystem(world, 1 / 60)

    expect(Health.current[armoredEid]).toBe(startHP - 10)
  })

  test('enemy bullets ignore FrontArmor (layer filtering)', () => {
    rebuildHash(world)
    const startHP = Health.current[armoredEid]!

    // Enemy bullet — won't hit an enemy by layer check, so HP unchanged
    spawnBullet(world, {
      x: 290, y: 100,
      vx: 300, vy: 0,
      damage: 10,
      range: 500,
      ownerId: playerEid,
      layer: CollisionLayer.ENEMY_BULLET,
    })
    rebuildHash(world)

    bulletCollisionSystem(world, 1 / 60)

    expect(Health.current[armoredEid]).toBe(startHP)
  })
})

describe('spawnArmoredBandit', () => {
  let world: GameWorld
  let eid: number

  beforeEach(() => {
    world = createGameWorld(42)
    eid = spawnArmoredBandit(world, 200, 200)
  })

  test('has FrontArmor component', () => {
    expect(hasComponent(world, FrontArmor, eid)).toBe(true)
  })

  test('FrontArmor has correct reduction multiplier', () => {
    expect(FrontArmor.reductionMultiplier[eid]).toBeCloseTo(ARMORED_BANDIT_FRONT_REDUCTION)
  })

  test('FrontArmor has correct arc half angle', () => {
    expect(FrontArmor.arcHalfAngle[eid]).toBeCloseTo(ARMORED_BANDIT_ARC_HALF_ANGLE)
  })

  test('FrontArmor facing defaults to 0', () => {
    expect(FrontArmor.facingAngle[eid]).toBe(0)
  })
})
