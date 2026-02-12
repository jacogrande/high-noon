import { describe, expect, test, beforeEach } from 'bun:test'
import { hasComponent, addComponent, defineQuery } from 'bitecs'
import { createGameWorld, setWorldTilemap, type GameWorld } from '../world'
import {
  spawnPlayer, spawnSwarmer, spawnShooter, spawnCharger, spawnBoomstick,
  spawnGoblinBarbarian, spawnGoblinRogue,
} from '../prefabs'
import { createTestArena } from '../content/maps/testArena'
import { enemyAttackSystem } from './enemyAttack'
import {
  EnemyAI, AIState, AttackConfig, Position, Velocity, Collider,
  Health, Dead, Bullet, Enemy, EnemyType, EnemyTier, Invincible, Knockback, BossPhase,
} from '../components'
import {
  CHARGER_CHARGE_DURATION, CHARGER_CHARGE_SPEED,
  BOOMSTICK_BULLET_COUNT, BOOMSTICK_RING_BULLET_COUNT,
  BOOMSTICK_PHASE_3_FAN_BULLETS, BOOMSTICK_PHASE_3_RING_BULLETS,
  BOOMSTICK_BOOM_DAMAGE, BOOMSTICK_BOOM_RADIUS, BOOMSTICK_BOOM_FUSE,
  GOBLIN_BARBARIAN_ATTACK_DURATION, GOBLIN_BARBARIAN_MELEE_REACH, GOBLIN_BARBARIAN_DAMAGE,
  GOBLIN_ROGUE_ATTACK_DURATION, GOBLIN_ROGUE_MELEE_REACH, GOBLIN_ROGUE_DAMAGE,
  GOBLIN_MELEE_KB_SPEED, GOBLIN_MELEE_KB_DURATION,
  GOBLIN_BARBARIAN_RADIUS, GOBLIN_ROGUE_RADIUS,
} from '../content/enemies'
import { PLAYER_RADIUS } from '../content/player'
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
      EnemyAI.targetEid[eid] = playerEid
      transition(eid, AIState.ATTACK)

      enemyAttackSystem(world, 1 / 60)

      expect(countBullets()).toBe(1)
    })

    test('shooter in ATTACK spawns 3 bullets with spread', () => {
      const eid = spawnShooter(world, 100, 100)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      transition(eid, AIState.ATTACK)

      enemyAttackSystem(world, 1 / 60)

      expect(countBullets()).toBe(3)
    })

    test('transitions to RECOVERY after attack', () => {
      const eid = spawnSwarmer(world, 100, 100)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      transition(eid, AIState.ATTACK)

      enemyAttackSystem(world, 1 / 60)

      expect(EnemyAI.state[eid]!).toBe(AIState.RECOVERY)
    })

    test('boomstick fan volley and halo are offset across attacks', () => {
      const eid = spawnBoomstick(world, 100, 100)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      AttackConfig.aimX[eid] = 1
      transition(eid, AIState.ATTACK)

      enemyAttackSystem(world, 1 / 60)
      expect(countBullets()).toBe(BOOMSTICK_BULLET_COUNT)
      expect(EnemyAI.state[eid]!).toBe(AIState.RECOVERY)

      transition(eid, AIState.ATTACK)
      enemyAttackSystem(world, 1 / 60)

      expect(countBullets()).toBe(BOOMSTICK_BULLET_COUNT + BOOMSTICK_RING_BULLET_COUNT)
      expect(EnemyAI.state[eid]!).toBe(AIState.RECOVERY)
    })

    test('boomstick phase 3 uses denser halo pattern', () => {
      const eid = spawnBoomstick(world, 100, 100)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      BossPhase.phase[eid] = 3
      AttackConfig.projectileCount[eid] = BOOMSTICK_PHASE_3_FAN_BULLETS
      AttackConfig.aimX[eid] = 0
      transition(eid, AIState.ATTACK)

      enemyAttackSystem(world, 1 / 60)

      expect(countBullets()).toBe(BOOMSTICK_PHASE_3_RING_BULLETS)
    })

    test('boomstick phase 1 does not throw booms', () => {
      const eid = spawnBoomstick(world, 100, 100)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      BossPhase.phase[eid] = 1
      AttackConfig.aimY[eid] = 0
      transition(eid, AIState.ATTACK)

      enemyAttackSystem(world, 1 / 60)

      expect(world.dynamites).toHaveLength(0)
    })

    test('boomstick phase 2 throws a boom with expected payload', () => {
      const eid = spawnBoomstick(world, 100, 100)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      BossPhase.phase[eid] = 2
      AttackConfig.aimY[eid] = 0
      transition(eid, AIState.ATTACK)

      enemyAttackSystem(world, 1 / 60)

      expect(world.dynamites).toHaveLength(1)
      const dyn = world.dynamites[0]!
      expect(dyn.ownerId).toBe(eid)
      expect(dyn.damage).toBe(BOOMSTICK_BOOM_DAMAGE)
      expect(dyn.radius).toBe(BOOMSTICK_BOOM_RADIUS)
      expect(dyn.fuseRemaining).toBeCloseTo(BOOMSTICK_BOOM_FUSE)
    })
  })

  describe('fodder projectile cap', () => {
    test('skips attack when at maxProjectiles', () => {
      const eid = spawnSwarmer(world, 100, 100)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
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
      EnemyAI.targetEid[eid] = playerEid

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
      EnemyAI.targetEid[eid] = playerEid
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

    test('fires onHealthChanged hook when damaging player', () => {
      const eid = spawnCharger(world, 200, 200)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      AttackConfig.aimX[eid] = 1
      AttackConfig.aimY[eid] = 0
      transition(eid, AIState.ATTACK)

      Position.x[eid] = Position.x[playerEid]!
      Position.y[eid] = Position.y[playerEid]!

      let hookFired = false
      let oldHP = 0
      let newHP = 0
      world.hooks.register('onHealthChanged', 'test_enemy_attack', (_world, _pid, prev, next) => {
        hookFired = true
        oldHP = prev
        newHP = next
      })

      enemyAttackSystem(world, 1 / 60)

      expect(hookFired).toBe(true)
      expect(newHP).toBe(oldHP - AttackConfig.damage[eid]!)
    })

    test('stores hit direction for camera kick on player hit', () => {
      const eid = spawnCharger(world, 200, 200)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      AttackConfig.aimX[eid] = 0.707
      AttackConfig.aimY[eid] = 0.707
      transition(eid, AIState.ATTACK)

      Position.x[eid] = Position.x[playerEid]!
      Position.y[eid] = Position.y[playerEid]!

      enemyAttackSystem(world, 1 / 60)

      const hitDir = world.lastPlayerHitDir.get(playerEid)!
      expect(hitDir.x).toBeCloseTo(0.707)
      expect(hitDir.y).toBeCloseTo(0.707)
    })

    test('transitions to RECOVERY after CHARGER_CHARGE_DURATION', () => {
      const eid = spawnCharger(world, 100, 100)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
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
      EnemyAI.targetEid[eid] = playerEid
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

  describe('goblin melee', () => {
    function placeInMeleeRange(goblinEid: number, meleeReach: number): void {
      // Place goblin just within melee reach of the player
      const goblinR = Collider.radius[goblinEid]!
      const hitDist = goblinR + PLAYER_RADIUS + meleeReach
      Position.x[goblinEid] = Position.x[playerEid]! + hitDist - 1
      Position.y[goblinEid] = Position.y[playerEid]!
    }

    function placeOutOfRange(goblinEid: number, meleeReach: number): void {
      // Place goblin well outside melee reach
      const goblinR = Collider.radius[goblinEid]!
      const hitDist = goblinR + PLAYER_RADIUS + meleeReach
      Position.x[goblinEid] = Position.x[playerEid]! + hitDist + 50
      Position.y[goblinEid] = Position.y[playerEid]!
    }

    test('barbarian deals damage when within melee reach', () => {
      const eid = spawnGoblinBarbarian(world, 100, 100)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      transition(eid, AIState.ATTACK)
      placeInMeleeRange(eid, GOBLIN_BARBARIAN_MELEE_REACH)

      const prevHP = Health.current[playerEid]!
      enemyAttackSystem(world, 1 / 60)

      expect(Health.current[playerEid]!).toBe(prevHP - GOBLIN_BARBARIAN_DAMAGE)
    })

    test('rogue deals damage when within melee reach', () => {
      const eid = spawnGoblinRogue(world, 100, 100)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      transition(eid, AIState.ATTACK)
      placeInMeleeRange(eid, GOBLIN_ROGUE_MELEE_REACH)

      const prevHP = Health.current[playerEid]!
      enemyAttackSystem(world, 1 / 60)

      expect(Health.current[playerEid]!).toBe(prevHP - GOBLIN_ROGUE_DAMAGE)
    })

    test('transitions to RECOVERY on hit', () => {
      const eid = spawnGoblinBarbarian(world, 100, 100)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      transition(eid, AIState.ATTACK)
      placeInMeleeRange(eid, GOBLIN_BARBARIAN_MELEE_REACH)

      enemyAttackSystem(world, 1 / 60)

      expect(EnemyAI.state[eid]!).toBe(AIState.RECOVERY)
    })

    test('sets i-frames on player after hit', () => {
      const eid = spawnGoblinBarbarian(world, 100, 100)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      transition(eid, AIState.ATTACK)
      placeInMeleeRange(eid, GOBLIN_BARBARIAN_MELEE_REACH)

      enemyAttackSystem(world, 1 / 60)

      expect(Health.iframes[playerEid]!).toBeGreaterThan(0)
    })

    test('applies knockback to player on hit', () => {
      const eid = spawnGoblinBarbarian(world, 100, 100)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      transition(eid, AIState.ATTACK)
      placeInMeleeRange(eid, GOBLIN_BARBARIAN_MELEE_REACH)

      enemyAttackSystem(world, 1 / 60)

      expect(hasComponent(world, Knockback, playerEid)).toBe(true)
      expect(Knockback.vx[playerEid]!).not.toBe(0)
      expect(Knockback.duration[playerEid]!).toBeCloseTo(GOBLIN_MELEE_KB_DURATION)
    })

    test('stores hit direction for camera kick', () => {
      const eid = spawnGoblinBarbarian(world, 100, 100)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      transition(eid, AIState.ATTACK)

      // Place goblin to the left of the player
      Position.x[eid] = Position.x[playerEid]! - 15
      Position.y[eid] = Position.y[playerEid]!

      enemyAttackSystem(world, 1 / 60)

      const hitDir = world.lastPlayerHitDir.get(playerEid)
      expect(hitDir).toBeDefined()
      // Hit direction should point from goblin toward player (positive X)
      expect(hitDir!.x).toBeGreaterThan(0)
      expect(hitDir!.y).toBeCloseTo(0)
    })

    test('does not deal damage when player has i-frames', () => {
      const eid = spawnGoblinBarbarian(world, 100, 100)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      transition(eid, AIState.ATTACK)
      placeInMeleeRange(eid, GOBLIN_BARBARIAN_MELEE_REACH)

      Health.iframes[playerEid] = 1.0
      const prevHP = Health.current[playerEid]!

      enemyAttackSystem(world, 1 / 60)

      expect(Health.current[playerEid]!).toBe(prevHP)
    })

    test('does not deal damage when player is Invincible', () => {
      const eid = spawnGoblinRogue(world, 100, 100)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      transition(eid, AIState.ATTACK)
      placeInMeleeRange(eid, GOBLIN_ROGUE_MELEE_REACH)

      addComponent(world, Invincible, playerEid)
      const prevHP = Health.current[playerEid]!

      enemyAttackSystem(world, 1 / 60)

      expect(Health.current[playerEid]!).toBe(prevHP)
    })

    test('does not deal damage when out of melee reach', () => {
      const eid = spawnGoblinBarbarian(world, 100, 100)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      transition(eid, AIState.ATTACK)
      placeOutOfRange(eid, GOBLIN_BARBARIAN_MELEE_REACH)

      const prevHP = Health.current[playerEid]!

      enemyAttackSystem(world, 1 / 60)

      expect(Health.current[playerEid]!).toBe(prevHP)
      // Should still be in ATTACK (hasn't whiffed yet, timer is 0)
      expect(EnemyAI.state[eid]!).toBe(AIState.ATTACK)
    })

    test('whiff: transitions to RECOVERY after attackDuration expires', () => {
      const eid = spawnGoblinBarbarian(world, 100, 100)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      transition(eid, AIState.ATTACK)
      placeOutOfRange(eid, GOBLIN_BARBARIAN_MELEE_REACH)

      // Set timer past attack duration
      EnemyAI.stateTimer[eid] = GOBLIN_BARBARIAN_ATTACK_DURATION

      enemyAttackSystem(world, 1 / 60)

      expect(EnemyAI.state[eid]!).toBe(AIState.RECOVERY)
    })

    test('rogue whiff uses rogue-specific attack duration', () => {
      const eid = spawnGoblinRogue(world, 100, 100)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      transition(eid, AIState.ATTACK)
      placeOutOfRange(eid, GOBLIN_ROGUE_MELEE_REACH)

      EnemyAI.stateTimer[eid] = GOBLIN_ROGUE_ATTACK_DURATION

      enemyAttackSystem(world, 1 / 60)

      expect(EnemyAI.state[eid]!).toBe(AIState.RECOVERY)
    })

    test('does not spawn bullets', () => {
      const eid = spawnGoblinBarbarian(world, 100, 100)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      transition(eid, AIState.ATTACK)
      placeInMeleeRange(eid, GOBLIN_BARBARIAN_MELEE_REACH)

      enemyAttackSystem(world, 1 / 60)

      expect(countBullets()).toBe(0)
    })

    test('zeroes velocity during attack', () => {
      const eid = spawnGoblinRogue(world, 100, 100)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      transition(eid, AIState.ATTACK)
      placeOutOfRange(eid, GOBLIN_ROGUE_MELEE_REACH)

      Velocity.x[eid] = 100
      Velocity.y[eid] = 50

      enemyAttackSystem(world, 1 / 60)

      expect(Velocity.x[eid]!).toBe(0)
      expect(Velocity.y[eid]!).toBe(0)
    })

    test('zero-distance hit uses fallback direction', () => {
      const eid = spawnGoblinBarbarian(world, 100, 100)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      transition(eid, AIState.ATTACK)

      // Place directly on top of player (dist = 0)
      Position.x[eid] = Position.x[playerEid]!
      Position.y[eid] = Position.y[playerEid]!

      enemyAttackSystem(world, 1 / 60)

      const hitDir = world.lastPlayerHitDir.get(playerEid)
      expect(hitDir).toBeDefined()
      // Fallback direction: nx=0, ny=1
      expect(hitDir!.x).toBe(0)
      expect(hitDir!.y).toBe(1)
      // Knockback should use fallback direction
      expect(Knockback.vx[playerEid]!).toBe(0)
      expect(Knockback.vy[playerEid]!).toBe(GOBLIN_MELEE_KB_SPEED)
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
