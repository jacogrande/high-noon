import { describe, expect, test, beforeEach } from 'bun:test'
import { defineQuery, hasComponent, removeEntity } from 'bitecs'
import { createGameWorld, setWorldTilemap, setEncounter, type GameWorld } from '../world'
import { createTestArena } from '../content/maps/testArena'
import {
  Enemy, Position, Health, Dead, ObjectiveTarget, ObjTargetType,
  ObjectiveRole, ObjRole, EnemyType, Bullet,
} from '../components'
import { objectiveSystem, initObjective, cleanupObjective } from './objectiveSystem'
import { spawnPlayer, spawnBullet, CollisionLayer } from '../prefabs'
import type { ObjectiveConfig } from '../content/waves'
import { STAGE_1_MAP_CONFIG } from '../content/maps/mapConfig'
import { Collider, EnemyAI, AIState, Velocity } from '../components'
import { enemyDetectionSystem } from './enemyDetection'
import { enemyAISystem } from './enemyAI'
import { enemySteeringSystem } from './enemySteering'
import { enemyAttackSystem } from './enemyAttack'
import { bulletSystem } from './bullet'
import { movementSystem } from './movement'
import { bulletCollisionSystem } from './bulletCollision'
import { spatialHashSystem } from './spatialHash'
import { healthSystem } from './health'
import { spawnSwarmer, spawnDuelist, spawnGoblinBarbarian } from '../prefabs'
import { AttackConfig } from '../components'

const TEST_SEED = 54321

const enemyQuery = defineQuery([Enemy, Position])
const objectiveRoleQuery = defineQuery([ObjectiveRole, Enemy])

function makeWorld(): GameWorld {
  const world = createGameWorld(TEST_SEED)
  const tilemap = createTestArena()
  setWorldTilemap(world, tilemap)
  spawnPlayer(world, 400, 400)
  return world
}

describe('objectiveSystem', () => {
  let world: GameWorld

  beforeEach(() => {
    world = makeWorld()
  })

  describe('protect', () => {
    const protectConfig: ObjectiveConfig = {
      type: 'protect',
      description: 'Protect the Town Hall',
      protectHP: 10,
      protectPosition: 'center',
      attackerSpawnInterval: 1,
      maxAttackersAlive: 2,
    }

    test('initializes protect objective with target entity', () => {
      initObjective(world, protectConfig)

      expect(world.objective).not.toBeNull()
      expect(world.objective!.type).toBe('protect')
      expect(world.objective!.status).toBe('active')
      expect(world.objective!.description).toBe('Protect the Town Hall')
      expect(world.objective!.targetEids.length).toBe(1)

      const targetEid = world.objective!.targetEids[0]!
      expect(ObjectiveTarget.type[targetEid]).toBe(ObjTargetType.PROTECT_ENTITY)
      expect(Health.current[targetEid]).toBe(10)
      expect(Health.max[targetEid]).toBe(10)
    })

    test('target dies → soft_failure', () => {
      initObjective(world, protectConfig)
      const targetEid = world.objective!.targetEids[0]!

      // Kill the target
      Health.current[targetEid] = 0

      objectiveSystem(world, 1 / 60)

      expect(world.objective!.status).toBe('soft_failure')
    })

    test('target removed by healthSystem → soft_failure', () => {
      initObjective(world, protectConfig)
      const targetEid = world.objective!.targetEids[0]!

      // Simulate healthSystem removing the entity (non-Player entities get removeEntity'd)
      removeEntity(world, targetEid)

      objectiveSystem(world, 1 / 60)

      expect(world.objective!.status).toBe('soft_failure')
    })

    test('target survives while active → stays active', () => {
      initObjective(world, protectConfig)
      const targetEid = world.objective!.targetEids[0]!

      Health.current[targetEid] = 5

      objectiveSystem(world, 1 / 60)

      expect(world.objective!.status).toBe('active')
    })

    test('spawns attackers on timer', () => {
      initObjective(world, protectConfig)

      // Tick for enough time to spawn an attacker (1 second interval)
      objectiveSystem(world, 1.1)

      // Should have spawned an attacker
      let attackerCount = 0
      for (const eid of objectiveRoleQuery(world)) {
        if (ObjectiveRole.role[eid] === ObjRole.ATTACKER) {
          attackerCount++
        }
      }
      expect(attackerCount).toBe(1)
      expect(world.objective!.totalSpawned).toBe(1)
    })

    test('caps alive attackers at maxAttackersAlive', () => {
      initObjective(world, protectConfig)

      // Tick enough times to spawn multiple attackers
      for (let i = 0; i < 10; i++) {
        objectiveSystem(world, 1.1)
      }

      let attackerCount = 0
      for (const eid of objectiveRoleQuery(world)) {
        if (ObjectiveRole.role[eid] === ObjRole.ATTACKER) {
          attackerCount++
        }
      }
      expect(attackerCount).toBeLessThanOrEqual(2)
    })

    test('attackers have ObjectiveRole targeting the protect entity', () => {
      initObjective(world, protectConfig)
      const targetEid = world.objective!.targetEids[0]!

      objectiveSystem(world, 1.1)

      for (const eid of objectiveRoleQuery(world)) {
        if (ObjectiveRole.role[eid] === ObjRole.ATTACKER) {
          expect(ObjectiveRole.targetEid[eid]).toBe(targetEid)
        }
      }
    })

    test('does not tick when status is not active', () => {
      initObjective(world, protectConfig)
      world.objective!.status = 'soft_failure'

      const prevSpawned = world.objective!.totalSpawned
      objectiveSystem(world, 10)
      expect(world.objective!.totalSpawned).toBe(prevSpawned)
    })

    test('protect target has OBJECTIVE collision layer', () => {
      initObjective(world, protectConfig)
      const targetEid = world.objective!.targetEids[0]!
      expect(Collider.layer[targetEid]).toBe(CollisionLayer.OBJECTIVE)
    })

    test('attackers steer toward protect target, not player', () => {
      initObjective(world, protectConfig)
      const targetEid = world.objective!.targetEids[0]!
      const targetX = Position.x[targetEid]!
      const targetY = Position.y[targetEid]!

      // Spawn an attacker
      objectiveSystem(world, 1.1)

      // Find the attacker
      let attackerEid = -1
      for (const eid of objectiveRoleQuery(world)) {
        if (ObjectiveRole.role[eid] === ObjRole.ATTACKER) {
          attackerEid = eid
          break
        }
      }
      expect(attackerEid).not.toBe(-1)

      // Clear initial delay so AI can transition
      EnemyAI.initialDelay[attackerEid] = 0

      // Run the AI pipeline: detection → AI → steering
      enemyDetectionSystem(world, 1 / 60)
      enemyAISystem(world, 1 / 60)
      enemySteeringSystem(world, 1 / 60)

      // Attacker should be in CHASE state targeting the protect entity
      expect(EnemyAI.state[attackerEid]).toBe(AIState.CHASE)
      expect(EnemyAI.targetEid[attackerEid]).toBe(targetEid)

      // Velocity should point toward the protect target, not the player
      const ax = Position.x[attackerEid]!
      const ay = Position.y[attackerEid]!
      const toTargetX = targetX - ax
      const toTargetY = targetY - ay
      const vx = Velocity.x[attackerEid]!
      const vy = Velocity.y[attackerEid]!

      // Dot product should be positive (moving toward target)
      const dot = toTargetX * vx + toTargetY * vy
      expect(dot).toBeGreaterThan(0)
    })

    test('attacker bullets damage the protect target (end-to-end)', () => {
      initObjective(world, protectConfig)
      const targetEid = world.objective!.targetEids[0]!
      const initialHP = Health.current[targetEid]!

      // Spawn an attacker
      objectiveSystem(world, 1.1)

      // Find the attacker and place it in attack range of the target
      let attackerEid = -1
      for (const eid of objectiveRoleQuery(world)) {
        if (ObjectiveRole.role[eid] === ObjRole.ATTACKER) {
          attackerEid = eid
          break
        }
      }
      expect(attackerEid).not.toBe(-1)

      // Position attacker close to target, clear initial delay
      Position.x[attackerEid] = Position.x[targetEid]! + 30
      Position.y[attackerEid] = Position.y[targetEid]!
      Position.prevX[attackerEid] = Position.x[attackerEid]!
      Position.prevY[attackerEid] = Position.y[attackerEid]!
      EnemyAI.initialDelay[attackerEid] = 0

      // Run the full system pipeline for several seconds
      const dt = 1 / 60
      for (let i = 0; i < 180; i++) {
        world.tick++
        enemyDetectionSystem(world, dt)
        enemyAISystem(world, dt)
        spatialHashSystem(world, dt)
        enemySteeringSystem(world, dt)
        enemyAttackSystem(world, dt)
        bulletSystem(world, dt)
        movementSystem(world, dt)
        bulletCollisionSystem(world, dt)
        healthSystem(world, dt)
      }

      expect(Health.current[targetEid]!).toBeLessThan(initialHP)
    })
  })

  describe('intercept', () => {
    const interceptConfig: ObjectiveConfig = {
      type: 'intercept',
      description: 'Stop the Signal Runners',
      runnerSpawnInterval: 1,
      runnerSpeed: 140,
      runnerHP: 2,
      escapeThreshold: 2,
      totalRunners: 3,
    }

    test('initializes intercept objective with destination marker', () => {
      initObjective(world, interceptConfig)

      expect(world.objective).not.toBeNull()
      expect(world.objective!.type).toBe('intercept')
      expect(world.objective!.status).toBe('active')
      expect(world.objective!.escapeThreshold).toBe(2)
      expect(world.objective!.maxSpawns).toBe(3)

      const destEid = world.objective!.targetEids[0]!
      expect(ObjectiveTarget.type[destEid]).toBe(ObjTargetType.INTERCEPT_DEST)
    })

    test('spawns runners on timer', () => {
      initObjective(world, interceptConfig)

      objectiveSystem(world, 1.1)

      let runnerCount = 0
      for (const eid of objectiveRoleQuery(world)) {
        if (ObjectiveRole.role[eid] === ObjRole.RUNNER) {
          runnerCount++
        }
      }
      expect(runnerCount).toBe(1)
      expect(world.objective!.totalSpawned).toBe(1)
    })

    test('runner reaching destination increments escapedCount and removes runner', () => {
      initObjective(world, interceptConfig)
      const destEid = world.objective!.targetEids[0]!
      const destX = Position.x[destEid]!
      const destY = Position.y[destEid]!

      // Spawn a runner
      objectiveSystem(world, 1.1)

      // Find the runner and move it to the destination
      for (const eid of objectiveRoleQuery(world)) {
        if (ObjectiveRole.role[eid] === ObjRole.RUNNER) {
          Position.x[eid] = destX
          Position.y[eid] = destY
        }
      }

      objectiveSystem(world, 0.1)

      expect(world.objective!.escapedCount).toBe(1)
    })

    test('too many escapes → soft_failure', () => {
      initObjective(world, interceptConfig)
      const destEid = world.objective!.targetEids[0]!
      const destX = Position.x[destEid]!
      const destY = Position.y[destEid]!

      // Spawn and escape multiple runners
      for (let i = 0; i < 3; i++) {
        objectiveSystem(world, 1.1)

        for (const eid of objectiveRoleQuery(world)) {
          if (ObjectiveRole.role[eid] === ObjRole.RUNNER) {
            Position.x[eid] = destX
            Position.y[eid] = destY
          }
        }

        objectiveSystem(world, 0.1)
      }

      expect(world.objective!.escapedCount).toBeGreaterThanOrEqual(2)
      expect(world.objective!.status).toBe('soft_failure')
    })

    test('killing all runners → success', () => {
      initObjective(world, interceptConfig)

      // Spawn all runners
      for (let i = 0; i < 3; i++) {
        objectiveSystem(world, 1.1)
      }

      expect(world.objective!.totalSpawned).toBe(3)

      // Kill all runners by removing them from the world
      for (const eid of objectiveRoleQuery(world)) {
        if (ObjectiveRole.role[eid] === ObjRole.RUNNER) {
          removeEntity(world, eid)
        }
      }

      // Tick to check completion
      objectiveSystem(world, 0.1)

      expect(world.objective!.status).toBe('success')
    })

    test('does not spawn more than totalRunners', () => {
      initObjective(world, interceptConfig)

      // Tick many times
      for (let i = 0; i < 10; i++) {
        objectiveSystem(world, 1.1)
      }

      expect(world.objective!.totalSpawned).toBe(3)
    })

    test('runners have RUNNER type and ObjectiveRole', () => {
      initObjective(world, interceptConfig)
      objectiveSystem(world, 1.1)

      for (const eid of objectiveRoleQuery(world)) {
        if (ObjectiveRole.role[eid] === ObjRole.RUNNER) {
          expect(Enemy.type[eid]).toBe(EnemyType.RUNNER)
          expect(ObjectiveRole.targetEid[eid]).toBe(world.objective!.targetEids[0]!)
        }
      }
    })
  })

  describe('no objective', () => {
    test('world.objective stays null when no config', () => {
      expect(world.objective).toBeNull()
      objectiveSystem(world, 1 / 60)
      expect(world.objective).toBeNull()
    })
  })

  describe('duel', () => {
    const duelConfig: ObjectiveConfig = {
      type: 'duel',
      description: 'The Stranger Draws',
      duelistHP: 20,
      duelistDamage: 5,
      ringRadius: 120,
    }

    test('initializes duel with ring + duelist', () => {
      initObjective(world, duelConfig)

      expect(world.objective).not.toBeNull()
      expect(world.objective!.type).toBe('duel')
      expect(world.objective!.status).toBe('active')
      expect(world.objective!.description).toBe('The Stranger Draws')
      expect(world.objective!.ringRadius).toBe(120)
      expect(world.objective!.duelistEid).toBeGreaterThan(0)
      expect(world.objective!.forfeitTimer).toBe(0)

      const dEid = world.objective!.duelistEid
      expect(hasComponent(world, Enemy, dEid)).toBe(true)
      expect(Enemy.type[dEid]).toBe(EnemyType.DUELIST)
      expect(Health.current[dEid]).toBe(20)
    })

    test('duelist killed → success', () => {
      initObjective(world, duelConfig)
      const dEid = world.objective!.duelistEid

      // Kill the duelist
      Health.current[dEid] = 0
      objectiveSystem(world, 1 / 60)

      expect(world.objective!.status).toBe('success')
    })

    test('duelist removed → success', () => {
      initObjective(world, duelConfig)
      const dEid = world.objective!.duelistEid

      removeEntity(world, dEid)
      objectiveSystem(world, 1 / 60)

      expect(world.objective!.status).toBe('success')
    })

    test('player outside ring increments forfeit timer', () => {
      initObjective(world, duelConfig)
      const obj = world.objective!

      // Move player far outside ring
      const playerEids = defineQuery([Position, Health])(world).filter(e => !hasComponent(world, Enemy, e))
      const playerEid = playerEids[0]!
      Position.x[playerEid] = obj.ringCenterX + obj.ringRadius + 50
      Position.y[playerEid] = obj.ringCenterY

      objectiveSystem(world, 0.5)

      expect(obj.forfeitTimer).toBeGreaterThan(0)
      expect(obj.status).toBe('active') // grace period not exceeded
    })

    test('player outside ring too long → soft_failure', () => {
      initObjective(world, duelConfig)
      const obj = world.objective!

      // Move player far outside ring
      const playerEids = defineQuery([Position, Health])(world).filter(e => !hasComponent(world, Enemy, e))
      const playerEid = playerEids[0]!
      Position.x[playerEid] = obj.ringCenterX + obj.ringRadius + 50
      Position.y[playerEid] = obj.ringCenterY

      // Tick past grace period
      objectiveSystem(world, 1.5)

      expect(obj.status).toBe('soft_failure')
    })

    test('player returns inside ring → timer resets', () => {
      initObjective(world, duelConfig)
      const obj = world.objective!

      const playerEids = defineQuery([Position, Health])(world).filter(e => !hasComponent(world, Enemy, e))
      const playerEid = playerEids[0]!

      // Move outside
      Position.x[playerEid] = obj.ringCenterX + obj.ringRadius + 50
      Position.y[playerEid] = obj.ringCenterY
      objectiveSystem(world, 0.5)
      expect(obj.forfeitTimer).toBeGreaterThan(0)

      // Move back inside
      Position.x[playerEid] = obj.ringCenterX
      Position.y[playerEid] = obj.ringCenterY
      objectiveSystem(world, 1 / 60)
      expect(obj.forfeitTimer).toBe(0)
    })

    test('player bullet does NOT damage non-duelist enemy during duel', () => {
      initObjective(world, duelConfig)

      // Spawn a regular enemy near player
      const enemyEid = spawnSwarmer(world, 410, 400)
      EnemyAI.initialDelay[enemyEid] = 0
      const initialHP = Health.current[enemyEid]!

      // Fire a player bullet at the swarmer
      const playerEids = defineQuery([Position, Health])(world).filter(e => !hasComponent(world, Enemy, e))
      const playerEid = playerEids[0]!
      spawnBullet(world, {
        x: Position.x[playerEid]!,
        y: Position.y[playerEid]!,
        vx: 500,
        vy: 0,
        damage: 10,
        range: 500,
        ownerId: playerEid,
        layer: CollisionLayer.PLAYER_BULLET,
      })

      // Run collision
      spatialHashSystem(world, 1 / 60)
      bulletSystem(world, 1 / 60)
      movementSystem(world, 1 / 60)
      bulletCollisionSystem(world, 1 / 60)

      expect(Health.current[enemyEid]).toBe(initialHP)
    })

    test('player bullet DOES damage the duelist during duel', () => {
      initObjective(world, duelConfig)
      const dEid = world.objective!.duelistEid
      const initialHP = Health.current[dEid]!

      const playerEids = defineQuery([Position, Health])(world).filter(e => !hasComponent(world, Enemy, e))
      const playerEid = playerEids[0]!

      // Place bullet right on duelist
      spawnBullet(world, {
        x: Position.x[dEid]!,
        y: Position.y[dEid]!,
        vx: 0,
        vy: 0,
        damage: 10,
        range: 500,
        ownerId: playerEid,
        layer: CollisionLayer.PLAYER_BULLET,
      })

      spatialHashSystem(world, 1 / 60)
      bulletCollisionSystem(world, 1 / 60)

      expect(Health.current[dEid]).toBeLessThan(initialHP)
    })

    test('non-duelist enemy bullet does NOT damage player during duel', () => {
      initObjective(world, duelConfig)

      const playerEids = defineQuery([Position, Health])(world).filter(e => !hasComponent(world, Enemy, e))
      const playerEid = playerEids[0]!
      const initialHP = Health.current[playerEid]!

      // Spawn an enemy bullet from a swarmer (not the duelist)
      const enemyEid = spawnSwarmer(world, 300, 300)
      spawnBullet(world, {
        x: Position.x[playerEid]!,
        y: Position.y[playerEid]!,
        vx: 0,
        vy: 0,
        damage: 5,
        range: 500,
        ownerId: enemyEid,
        layer: CollisionLayer.ENEMY_BULLET,
      })

      spatialHashSystem(world, 1 / 60)
      bulletCollisionSystem(world, 1 / 60)

      expect(Health.current[playerEid]).toBe(initialHP)
    })

    test('non-duelist melee enemy does NOT damage player during duel', () => {
      initObjective(world, duelConfig)

      const playerEids = defineQuery([Position, Health])(world).filter(e => !hasComponent(world, Enemy, e))
      const playerEid = playerEids[0]!
      const initialHP = Health.current[playerEid]!

      // Spawn a goblin barbarian right on top of the player
      const goblinEid = spawnGoblinBarbarian(world, Position.x[playerEid]!, Position.y[playerEid]!)
      EnemyAI.initialDelay[goblinEid] = 0
      EnemyAI.targetEid[goblinEid] = playerEid
      EnemyAI.state[goblinEid] = AIState.ATTACK
      EnemyAI.stateTimer[goblinEid] = 0

      // Run attack system — goblin is in range but duel guard should block damage
      enemyAttackSystem(world, 1 / 60)

      expect(Health.current[playerEid]).toBe(initialHP)
    })

    test('cleanup removes duelist', () => {
      initObjective(world, duelConfig)
      const dEid = world.objective!.duelistEid
      expect(hasComponent(world, Position, dEid)).toBe(true)

      cleanupObjective(world)

      expect(world.objective).toBeNull()
      expect(hasComponent(world, Position, dEid)).toBe(false)
    })
  })

  describe('cleanup', () => {
    test('cleanupObjective removes entities and resets state', () => {
      const config: ObjectiveConfig = {
        type: 'protect',
        description: 'Test',
        protectHP: 10,
        protectPosition: 'center',
        attackerSpawnInterval: 1,
        maxAttackersAlive: 2,
      }

      initObjective(world, config)
      objectiveSystem(world, 1.1) // spawn an attacker

      expect(world.objective).not.toBeNull()

      cleanupObjective(world)

      expect(world.objective).toBeNull()
    })
  })
})
