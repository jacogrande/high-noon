import { describe, expect, test, beforeEach } from 'bun:test'
import { createGameWorld, type GameWorld } from '../world'
import { spawnPlayer, spawnSwarmer, spawnShooter, spawnCharger, NO_TARGET } from '../prefabs'
import { enemyAISystem } from './enemyAI'
import { EnemyAI, AIState, Detection, AttackConfig, Position } from '../components'

/** STUN_DURATION from enemyAI.ts (not exported) */
const STUN_DURATION = 0.2

describe('enemyAISystem', () => {
  let world: GameWorld
  let playerEid: number
  let enemyEid: number

  beforeEach(() => {
    world = createGameWorld()
    playerEid = spawnPlayer(world, 200, 200)
  })

  function spawnEnemy(x = 100, y = 100): number {
    enemyEid = spawnSwarmer(world, x, y)
    // Clear initial delay for simpler testing
    EnemyAI.initialDelay[enemyEid] = 0
    return enemyEid
  }

  describe('IDLE state', () => {
    test('transitions to CHASE when target acquired', () => {
      spawnEnemy()
      EnemyAI.targetEid[enemyEid] = playerEid

      enemyAISystem(world, 1 / 60)

      expect(EnemyAI.state[enemyEid]!).toBe(AIState.CHASE)
    })

    test('stays IDLE when no target', () => {
      spawnEnemy()
      EnemyAI.targetEid[enemyEid] = NO_TARGET

      enemyAISystem(world, 1 / 60)

      expect(EnemyAI.state[enemyEid]!).toBe(AIState.IDLE)
    })

    test('stays IDLE during initialDelay even with target', () => {
      spawnEnemy()
      EnemyAI.initialDelay[enemyEid] = 0.5
      EnemyAI.targetEid[enemyEid] = playerEid

      enemyAISystem(world, 1 / 60)

      expect(EnemyAI.state[enemyEid]!).toBe(AIState.IDLE)
    })
  })

  describe('CHASE state', () => {
    test('transitions to TELEGRAPH when in range and off cooldown', () => {
      spawnEnemy()
      EnemyAI.state[enemyEid] = AIState.CHASE
      EnemyAI.targetEid[enemyEid] = playerEid
      AttackConfig.cooldownRemaining[enemyEid] = 0

      // Place enemy within attack range of player
      const attackRange = Detection.attackRange[enemyEid]!
      Position.x[enemyEid] = Position.x[playerEid]! + attackRange - 1
      Position.y[enemyEid] = Position.y[playerEid]!

      enemyAISystem(world, 1 / 60)

      expect(EnemyAI.state[enemyEid]!).toBe(AIState.TELEGRAPH)
    })

    test('stays CHASE when in range but on cooldown', () => {
      spawnEnemy()
      EnemyAI.state[enemyEid] = AIState.CHASE
      EnemyAI.targetEid[enemyEid] = playerEid
      AttackConfig.cooldownRemaining[enemyEid] = 1.0

      // Place within attack range
      Position.x[enemyEid] = Position.x[playerEid]!
      Position.y[enemyEid] = Position.y[playerEid]!

      enemyAISystem(world, 1 / 60)

      expect(EnemyAI.state[enemyEid]!).toBe(AIState.CHASE)
    })

    test('transitions to IDLE when target lost', () => {
      spawnEnemy()
      EnemyAI.state[enemyEid] = AIState.CHASE
      EnemyAI.targetEid[enemyEid] = NO_TARGET

      enemyAISystem(world, 1 / 60)

      expect(EnemyAI.state[enemyEid]!).toBe(AIState.IDLE)
    })
  })

  describe('TELEGRAPH state', () => {
    test('transitions to ATTACK after telegraphDuration', () => {
      spawnEnemy()
      EnemyAI.state[enemyEid] = AIState.TELEGRAPH
      EnemyAI.targetEid[enemyEid] = playerEid
      const duration = AttackConfig.telegraphDuration[enemyEid]!

      // Set timer just below duration, step to go past it
      EnemyAI.stateTimer[enemyEid] = duration - 0.01

      enemyAISystem(world, 0.02)

      expect(EnemyAI.state[enemyEid]!).toBe(AIState.ATTACK)
    })

    test('stays in TELEGRAPH before duration expires', () => {
      spawnEnemy()
      EnemyAI.state[enemyEid] = AIState.TELEGRAPH
      EnemyAI.targetEid[enemyEid] = playerEid
      EnemyAI.stateTimer[enemyEid] = 0

      enemyAISystem(world, 0.01)

      expect(EnemyAI.state[enemyEid]!).toBe(AIState.TELEGRAPH)
    })
  })

  describe('RECOVERY state', () => {
    test('transitions to CHASE after recoveryDuration and resets cooldown', () => {
      spawnEnemy()
      EnemyAI.state[enemyEid] = AIState.RECOVERY
      EnemyAI.targetEid[enemyEid] = playerEid
      const recoveryDuration = AttackConfig.recoveryDuration[enemyEid]!

      EnemyAI.stateTimer[enemyEid] = recoveryDuration - 0.01

      enemyAISystem(world, 0.02)

      expect(EnemyAI.state[enemyEid]!).toBe(AIState.CHASE)
      expect(AttackConfig.cooldownRemaining[enemyEid]!).toBe(AttackConfig.cooldown[enemyEid]!)
    })
  })

  describe('STUNNED state', () => {
    test('transitions to CHASE after STUN_DURATION', () => {
      spawnEnemy()
      EnemyAI.state[enemyEid] = AIState.STUNNED
      EnemyAI.targetEid[enemyEid] = playerEid
      EnemyAI.stateTimer[enemyEid] = STUN_DURATION - 0.01

      enemyAISystem(world, 0.02)

      expect(EnemyAI.state[enemyEid]!).toBe(AIState.CHASE)
    })

    test('stays STUNNED before STUN_DURATION', () => {
      spawnEnemy()
      EnemyAI.state[enemyEid] = AIState.STUNNED
      EnemyAI.targetEid[enemyEid] = playerEid
      EnemyAI.stateTimer[enemyEid] = 0

      enemyAISystem(world, 0.05)

      expect(EnemyAI.state[enemyEid]!).toBe(AIState.STUNNED)
    })
  })

  describe('timers', () => {
    test('initialDelay decrements each tick', () => {
      spawnEnemy()
      EnemyAI.initialDelay[enemyEid] = 0.5

      enemyAISystem(world, 0.1)

      expect(EnemyAI.initialDelay[enemyEid]!).toBeCloseTo(0.4)
    })

    test('initialDelay does not go below 0', () => {
      spawnEnemy()
      EnemyAI.initialDelay[enemyEid] = 0.05

      enemyAISystem(world, 0.1)

      expect(EnemyAI.initialDelay[enemyEid]!).toBe(0)
    })

    test('cooldownRemaining decrements each tick', () => {
      spawnEnemy()
      AttackConfig.cooldownRemaining[enemyEid] = 1.0

      enemyAISystem(world, 0.1)

      expect(AttackConfig.cooldownRemaining[enemyEid]!).toBeCloseTo(0.9)
    })

    test('cooldownRemaining does not go below 0', () => {
      spawnEnemy()
      AttackConfig.cooldownRemaining[enemyEid] = 0.05

      enemyAISystem(world, 0.1)

      expect(AttackConfig.cooldownRemaining[enemyEid]!).toBe(0)
    })

    test('stateTimer increments each tick', () => {
      spawnEnemy()
      // Use CHASE with target far out of attack range — no transition triggered
      EnemyAI.state[enemyEid] = AIState.CHASE
      EnemyAI.targetEid[enemyEid] = playerEid
      EnemyAI.stateTimer[enemyEid] = 0
      Position.x[enemyEid] = 0
      Position.y[enemyEid] = 0
      Position.x[playerEid] = 9999
      Position.y[playerEid] = 9999

      enemyAISystem(world, 0.1)

      expect(EnemyAI.stateTimer[enemyEid]!).toBeCloseTo(0.1)
    })
  })
})
