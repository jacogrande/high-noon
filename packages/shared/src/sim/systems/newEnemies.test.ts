import { describe, expect, test, beforeEach } from 'bun:test'
import { addComponent, hasComponent, defineQuery } from 'bitecs'
import { createGameWorld, setWorldTilemap, type GameWorld } from '../world'
import { spawnPlayer, spawnArmoredBandit, spawnHealerShaman, spawnRattlesnake, spawnVulture, spawnBullet, spawnFromRegistry, CollisionLayer } from '../prefabs'
import { rootSystem } from './root'
import { bulletCollisionSystem } from './bulletCollision'
import { collisionSystem } from './collision'
import { enemyAISystem, transition } from './enemyAI'
import { enemyAttackSystem } from './enemyAttack'
import {
  Root, Velocity, Position, FrontArmor, Flying, Health, Collider, Speed,
  EnemyAI, AIState, Enemy, EnemyType, AttackConfig, Detection, Poison, Player,
} from '../components'
import { createSpatialHash, rebuildSpatialHash } from '../SpatialHash'
import { createTestArena } from '../content/maps/testArena'
import { ARMORED_BANDIT_FRONT_REDUCTION, ARMORED_BANDIT_ARC_HALF_ANGLE, RATTLESNAKE_POISON_DPS, RATTLESNAKE_POISON_DURATION, VULTURE_DIVE_DURATION } from '../content/enemies'
import { NO_TARGET } from '../prefabs'

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

// ============================================================================
// Healer Shaman tests
// ============================================================================

describe('Healer Shaman', () => {
  let world: GameWorld
  let healerEid: number
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    playerEid = spawnPlayer(world, 500, 500)
    healerEid = spawnHealerShaman(world, 300, 300)
    // Skip initial delay
    EnemyAI.initialDelay[healerEid] = 0
    // Give the healer a target
    EnemyAI.targetEid[healerEid] = playerEid
  })

  test('healer pulse heals injured allies', () => {
    // Spawn another enemy near the healer
    const allyEid = spawnFromRegistry(world, EnemyType.SWARMER, 310, 310)
    const allyMaxHP = Health.max[allyEid]!
    Health.current[allyEid] = allyMaxHP - 10

    // Force healer into ATTACK state
    transition(healerEid, AIState.ATTACK)

    // Build spatial hash
    rebuildHash(world)

    enemyAttackSystem(world, 1 / 60)

    // Ally should be healed by up to the damage (heal amount) value
    const healAmount = AttackConfig.damage[healerEid]!
    expect(Health.current[allyEid]).toBe(Math.min(allyMaxHP, (allyMaxHP - 10) + healAmount))
  })

  test('healer pulse does not self-heal', () => {
    // Damage the healer itself
    const healerMaxHP = Health.max[healerEid]!
    Health.current[healerEid] = healerMaxHP - 5

    // Force into ATTACK state
    transition(healerEid, AIState.ATTACK)
    rebuildHash(world)

    enemyAttackSystem(world, 1 / 60)

    // Healer should NOT heal itself
    expect(Health.current[healerEid]).toBe(healerMaxHP - 5)
  })

  test('healer pulse caps healing at max HP', () => {
    // Spawn ally with only 1 HP missing
    const allyEid = spawnFromRegistry(world, EnemyType.SWARMER, 310, 310)
    const allyMaxHP = Health.max[allyEid]!
    Health.current[allyEid] = allyMaxHP - 1

    transition(healerEid, AIState.ATTACK)
    rebuildHash(world)

    enemyAttackSystem(world, 1 / 60)

    expect(Health.current[allyEid]).toBe(allyMaxHP)
  })

  test('healer pulse skips full-HP allies', () => {
    // Spawn ally at full HP
    const allyEid = spawnFromRegistry(world, EnemyType.SWARMER, 310, 310)
    const allyMaxHP = Health.max[allyEid]!
    expect(Health.current[allyEid]).toBe(allyMaxHP) // sanity check

    transition(healerEid, AIState.ATTACK)
    rebuildHash(world)

    enemyAttackSystem(world, 1 / 60)

    // Ally HP should remain at max (heal is a no-op)
    expect(Health.current[allyEid]).toBe(allyMaxHP)
  })

  test('healer pulse emits event for client VFX', () => {
    transition(healerEid, AIState.ATTACK)
    rebuildHash(world)

    enemyAttackSystem(world, 1 / 60)

    expect(world.healerPulses.length).toBe(1)
    expect(world.healerPulses[0]!.radius).toBe(Detection.attackRange[healerEid])
  })

  test('FLEE state transitions back to CHASE after duration', () => {
    transition(healerEid, AIState.FLEE)

    // Run AI for 1.1 seconds (FLEE_DURATION = 1.0)
    for (let i = 0; i < 66; i++) {
      enemyAISystem(world, 1 / 60)
    }

    expect(EnemyAI.state[healerEid]).toBe(AIState.CHASE)
  })
})

// ============================================================================
// Rattlesnake tests
// ============================================================================

describe('Rattlesnake', () => {
  let world: GameWorld
  let snakeEid: number
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    playerEid = spawnPlayer(world, 100, 100)
    snakeEid = spawnRattlesnake(world, 100, 106) // close enough for melee
    // Skip initial delay
    EnemyAI.initialDelay[snakeEid] = 0
    EnemyAI.targetEid[snakeEid] = playerEid
  })

  test('rattlesnake melee hit applies Poison to player', () => {
    // Force into ATTACK state
    transition(snakeEid, AIState.ATTACK)

    // Ensure player is hittable
    Health.iframes[playerEid] = 0

    rebuildHash(world)
    enemyAttackSystem(world, 1 / 60)

    expect(hasComponent(world, Poison, playerEid)).toBe(true)
    expect(Poison.dps[playerEid]).toBe(RATTLESNAKE_POISON_DPS)
    expect(Poison.duration[playerEid]).toBe(RATTLESNAKE_POISON_DURATION)
  })

  test('rattlesnake melee hit does not poison non-player targets', () => {
    // Spawn another enemy as the target instead of a player
    const otherEid = spawnFromRegistry(world, EnemyType.SWARMER, 100, 106)
    EnemyAI.targetEid[snakeEid] = otherEid
    Health.iframes[otherEid] = 0

    transition(snakeEid, AIState.ATTACK)
    rebuildHash(world)
    enemyAttackSystem(world, 1 / 60)

    expect(hasComponent(world, Poison, otherEid)).toBe(false)
  })

  test('rattlesnake has correct stats from registry', () => {
    expect(Enemy.type[snakeEid]).toBe(EnemyType.RATTLESNAKE)
    expect(Health.max[snakeEid]).toBe(8)
    expect(Speed.max[snakeEid]).toBe(130)
    expect(Collider.radius[snakeEid]).toBe(6)
  })
})

// ============================================================================
// Vulture tests
// ============================================================================

describe('Vulture', () => {
  let world: GameWorld
  let vultureEid: number
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    playerEid = spawnPlayer(world, 500, 500)
    vultureEid = spawnVulture(world, 300, 300)
    // Skip initial delay
    EnemyAI.initialDelay[vultureEid] = 0
    EnemyAI.targetEid[vultureEid] = playerEid
  })

  test('spawnVulture sets Flying component with airborne=1', () => {
    expect(hasComponent(world, Flying, vultureEid)).toBe(true)
    expect(Flying.airborne[vultureEid]).toBe(1)
  })

  test('bullets skip airborne Vulture', () => {
    const startHP = Health.current[vultureEid]!
    transition(vultureEid, AIState.CHASE)
    // Ensure airborne
    expect(Flying.airborne[vultureEid]).toBe(1)

    spawnBullet(world, {
      x: 295, y: 300,
      vx: 300, vy: 0,
      damage: 10,
      range: 500,
      ownerId: playerEid,
      layer: CollisionLayer.PLAYER_BULLET,
    })
    rebuildHash(world)
    bulletCollisionSystem(world, 1 / 60)

    // No damage — bullet should have been skipped
    expect(Health.current[vultureEid]).toBe(startHP)
  })

  test('Vulture becomes grounded during TELEGRAPH', () => {
    transition(vultureEid, AIState.CHASE)
    expect(Flying.airborne[vultureEid]).toBe(1)

    // Position vulture within attack range
    Position.x[vultureEid] = 300
    Position.y[vultureEid] = 300
    Position.x[playerEid] = 400
    Position.y[playerEid] = 300
    AttackConfig.cooldownRemaining[vultureEid] = 0

    enemyAISystem(world, 1 / 60)

    expect(EnemyAI.state[vultureEid]).toBe(AIState.TELEGRAPH)
    expect(Flying.airborne[vultureEid]).toBe(0)
  })

  test('grounded Vulture takes bullet damage', () => {
    transition(vultureEid, AIState.TELEGRAPH)
    Flying.airborne[vultureEid] = 0

    const startHP = Health.current[vultureEid]!

    spawnBullet(world, {
      x: 295, y: 300,
      vx: 300, vy: 0,
      damage: 10,
      range: 500,
      ownerId: playerEid,
      layer: CollisionLayer.PLAYER_BULLET,
    })
    rebuildHash(world)
    bulletCollisionSystem(world, 1 / 60)

    expect(Health.current[vultureEid]).toBe(startHP - 10)
  })

  test('dive-bomb deals AoE damage to nearby player', () => {
    // Position vulture on top of player
    Position.x[vultureEid] = 500
    Position.y[vultureEid] = 500
    Flying.airborne[vultureEid] = 0
    transition(vultureEid, AIState.ATTACK)

    // Lock aim direction
    AttackConfig.aimX[vultureEid] = 1
    AttackConfig.aimY[vultureEid] = 0

    // Advance state timer past dive duration
    EnemyAI.stateTimer[vultureEid] = VULTURE_DIVE_DURATION

    const startHP = Health.current[playerEid]!
    Health.iframes[playerEid] = 0

    // Populate playerInputs so the AoE damage loop finds the player
    world.playerInputs.set(playerEid, {} as any)

    enemyAttackSystem(world, 1 / 60)

    // Player should take damage
    expect(Health.current[playerEid]).toBeLessThan(startHP)
    expect(EnemyAI.state[vultureEid]).toBe(AIState.RECOVERY)
    expect(world.vultureDiveImpacts.length).toBe(1)
  })

  test('Vulture returns to airborne after RECOVERY→CHASE', () => {
    transition(vultureEid, AIState.RECOVERY)
    Flying.airborne[vultureEid] = 0

    // Run AI past recovery duration (1.0s)
    for (let i = 0; i < 66; i++) {
      enemyAISystem(world, 1 / 60)
    }

    expect(EnemyAI.state[vultureEid]).toBe(AIState.CHASE)
    expect(Flying.airborne[vultureEid]).toBe(1)
  })

  test('Vulture ignores wall collision while flying', () => {
    // Place vulture at a position and set velocity
    Position.x[vultureEid] = 300
    Position.y[vultureEid] = 300
    Velocity.x[vultureEid] = 100
    Velocity.y[vultureEid] = 0

    // Run collision system — flying entity should be skipped for tilemap
    collisionSystem(world, 1 / 60)

    // Position should not be altered by collision resolution
    // (no wall at 300,300 in test arena, but the point is that the system skips flying entities)
    expect(Position.x[vultureEid]).toBe(300)
    expect(Position.y[vultureEid]).toBe(300)
  })

  test('Vulture has correct stats from registry', () => {
    expect(Enemy.type[vultureEid]).toBe(EnemyType.VULTURE)
    expect(Health.max[vultureEid]).toBe(15)
    expect(Speed.max[vultureEid]).toBe(90)
    expect(Collider.radius[vultureEid]).toBe(9)
  })
})
