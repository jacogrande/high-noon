import { describe, expect, test, beforeEach } from 'bun:test'
import { hasComponent, addComponent, defineQuery } from 'bitecs'
import { createGameWorld, setWorldTilemap, type GameWorld } from '../world'
import {
  spawnPlayer, spawnSwarmer, spawnShooter, spawnCharger,
} from '../prefabs'
import { createTestArena } from '../content/maps/testArena'
import { enemyAttackSystem } from './enemyAttack'
import {
  EnemyAI, AIState, AttackConfig, Position, Velocity, Collider,
  Health, Dead, Bullet, Enemy, EnemyType, EnemyTier,
} from '../components'
import { CHARGER_CHARGE_DURATION, CHARGER_CHARGE_SPEED } from '../content/enemies'
import { transition } from './enemyAI'

describe('enemyAttackSystem', () => {
  let world: GameWorld
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    const tilemap = createTestArena()
    setWorldTilemap(world, tilemap)
    playerEid = spawnPlayer(world, 200, 200)
  })

  const bulletQuery = defineQuery([Bullet])
  function countBullets(): number {
    return bulletQuery(world).length
  }

  describe('projectile enemies', () => {
    test('swarmer in ATTACK spawns 1 bullet', () => {
      const eid = spawnSwarmer(world, 100, 100)
      EnemyAI.initialDelay[eid] = 0
      transition(eid, AIState.ATTACK)

      enemyAttackSystem(world, 1 / 60)

      expect(countBullets()).toBe(1)
    })

    test('shooter in ATTACK spawns 3 bullets with spread', () => {
      const eid = spawnShooter(world, 100, 100)
      EnemyAI.initialDelay[eid] = 0
      transition(eid, AIState.ATTACK)

      enemyAttackSystem(world, 1 / 60)

      expect(countBullets()).toBe(3)
    })

    test('transitions to RECOVERY after attack', () => {
      const eid = spawnSwarmer(world, 100, 100)
      EnemyAI.initialDelay[eid] = 0
      transition(eid, AIState.ATTACK)

      enemyAttackSystem(world, 1 / 60)

      expect(EnemyAI.state[eid]!).toBe(AIState.RECOVERY)
    })
  })

  describe('fodder projectile cap', () => {
    test('skips attack when at maxProjectiles', () => {
      const eid = spawnSwarmer(world, 100, 100)
      EnemyAI.initialDelay[eid] = 0
      transition(eid, AIState.ATTACK)

      // Set max projectiles to 0 to trigger cap
      world.maxProjectiles = 0

      enemyAttackSystem(world, 1 / 60)

      expect(countBullets()).toBe(0)
      expect(EnemyAI.state[eid]!).toBe(AIState.RECOVERY)
    })
  })

  describe('charger', () => {
    test('sets velocity on ATTACK entry', () => {
      const eid = spawnCharger(world, 100, 100)
      EnemyAI.initialDelay[eid] = 0

      // Set locked aim direction (normally set during TELEGRAPH)
      AttackConfig.aimX[eid] = 1
      AttackConfig.aimY[eid] = 0

      transition(eid, AIState.ATTACK)

      enemyAttackSystem(world, 1 / 60)

      expect(Velocity.x[eid]!).toBeCloseTo(CHARGER_CHARGE_SPEED)
      expect(Velocity.y[eid]!).toBeCloseTo(0)
    })

    test('deals contact damage when overlapping player', () => {
      const eid = spawnCharger(world, 200, 200)
      EnemyAI.initialDelay[eid] = 0
      AttackConfig.aimX[eid] = 1
      AttackConfig.aimY[eid] = 0
      transition(eid, AIState.ATTACK)

      // Place charger right on top of player
      Position.x[eid] = Position.x[playerEid]!
      Position.y[eid] = Position.y[playerEid]!

      const prevHP = Health.current[playerEid]!

      enemyAttackSystem(world, 1 / 60)

      expect(Health.current[playerEid]!).toBe(prevHP - AttackConfig.damage[eid]!)
    })

    test('stores hit direction for camera kick on player hit', () => {
      const eid = spawnCharger(world, 200, 200)
      EnemyAI.initialDelay[eid] = 0
      AttackConfig.aimX[eid] = 0.707
      AttackConfig.aimY[eid] = 0.707
      transition(eid, AIState.ATTACK)

      Position.x[eid] = Position.x[playerEid]!
      Position.y[eid] = Position.y[playerEid]!

      enemyAttackSystem(world, 1 / 60)

      expect(world.lastPlayerHitDirX).toBeCloseTo(0.707)
      expect(world.lastPlayerHitDirY).toBeCloseTo(0.707)
    })

    test('transitions to RECOVERY after CHARGER_CHARGE_DURATION', () => {
      const eid = spawnCharger(world, 100, 100)
      EnemyAI.initialDelay[eid] = 0
      AttackConfig.aimX[eid] = 1
      AttackConfig.aimY[eid] = 0
      transition(eid, AIState.ATTACK)

      // Set timer past charge duration
      EnemyAI.stateTimer[eid] = CHARGER_CHARGE_DURATION

      enemyAttackSystem(world, 1 / 60)

      expect(EnemyAI.state[eid]!).toBe(AIState.RECOVERY)
    })

    test('does not deal damage when player has iframes', () => {
      const eid = spawnCharger(world, 200, 200)
      EnemyAI.initialDelay[eid] = 0
      AttackConfig.aimX[eid] = 1
      AttackConfig.aimY[eid] = 0
      transition(eid, AIState.ATTACK)

      Position.x[eid] = Position.x[playerEid]!
      Position.y[eid] = Position.y[playerEid]!

      // Give player iframes
      Health.iframes[playerEid] = 1.0

      const prevHP = Health.current[playerEid]!

      enemyAttackSystem(world, 1 / 60)

      expect(Health.current[playerEid]!).toBe(prevHP)
    })
  })

  describe('no player', () => {
    test('transitions to RECOVERY when player is dead', () => {
      addComponent(world, Dead, playerEid)

      const eid = spawnSwarmer(world, 100, 100)
      EnemyAI.initialDelay[eid] = 0
      transition(eid, AIState.ATTACK)

      enemyAttackSystem(world, 1 / 60)

      expect(EnemyAI.state[eid]!).toBe(AIState.RECOVERY)
      expect(countBullets()).toBe(0)
    })
  })
})
