import { describe, expect, test, beforeEach } from 'bun:test'
import { hasComponent, addComponent, defineQuery } from 'bitecs'
import { createGameWorld, setWorldTilemap, type GameWorld } from '../world'
import {
  spawnPlayer, spawnSwarmer, spawnShooter, spawnCharger,
  spawnGoblinBarbarian, spawnGoblinRogue,
  spawnDustdevil, spawnSpitter, spawnDeadeye,
} from '../prefabs'
import { getBoss } from '../content/bosses'
import { createTestArena } from '../content/maps/testArena'
import { enemyAttackSystem } from './enemyAttack'
import {
  EnemyAI, AIState, AttackConfig, Position, Velocity, Collider, Detection,
  Health, Dead, Bullet, Enemy, EnemyType, EnemyTier, Invincible, Knockback, BossPhase,
} from '../components'
import {
  CHARGER_CHARGE_DURATION, CHARGER_CHARGE_SPEED,
  GOBLIN_BARBARIAN_ATTACK_DURATION, GOBLIN_BARBARIAN_MELEE_REACH, GOBLIN_BARBARIAN_DAMAGE,
  GOBLIN_ROGUE_ATTACK_DURATION, GOBLIN_ROGUE_MELEE_REACH, GOBLIN_ROGUE_DAMAGE,
  GOBLIN_MELEE_KB_SPEED, GOBLIN_MELEE_KB_DURATION,
  GOBLIN_BARBARIAN_RADIUS, GOBLIN_ROGUE_RADIUS,
  DUSTDEVIL_ZONE_RADIUS, DUSTDEVIL_ZONE_DURATION, DUSTDEVIL_ZONE_DPS,
  DEADEYE_TELEGRAPH_DURATION,
} from '../content/enemies'
import {
  BOOMSTICK_BULLET_COUNT, BOOMSTICK_RING_BULLET_COUNT,
  BOOMSTICK_PHASE_3_FAN_BULLETS, BOOMSTICK_PHASE_3_RING_BULLETS,
  BOOMSTICK_BOOM_DAMAGE, BOOMSTICK_BOOM_RADIUS, BOOMSTICK_BOOM_FUSE,
} from '../content/bosses/boomstick'
import { PLAYER_RADIUS } from '../content/player'
import { transition } from './enemyAI'

// Side-effect import: registers Stage 1 enemy definitions
import '../content/enemies'

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
      const eid = getBoss(EnemyType.BOOMSTICK)!.spawn(world, 100, 100)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      // Set ringDelay to 1 so first attack fires fan, second fires ring
      const st = world.bossState.get(eid) as { ringDelay: number; boomDelay: number }
      st.ringDelay = 1
      transition(eid, AIState.ATTACK)

      enemyAttackSystem(world, 1 / 60)
      expect(countBullets()).toBe(BOOMSTICK_BULLET_COUNT)
      expect(EnemyAI.state[eid]!).toBe(AIState.RECOVERY)

      st.ringDelay = 0
      transition(eid, AIState.ATTACK)
      enemyAttackSystem(world, 1 / 60)

      expect(countBullets()).toBe(BOOMSTICK_BULLET_COUNT + BOOMSTICK_RING_BULLET_COUNT)
      expect(EnemyAI.state[eid]!).toBe(AIState.RECOVERY)
    })

    test('boomstick phase 3 uses denser halo pattern', () => {
      const eid = getBoss(EnemyType.BOOMSTICK)!.spawn(world, 100, 100)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      BossPhase.phase[eid] = 3
      AttackConfig.projectileCount[eid] = BOOMSTICK_PHASE_3_FAN_BULLETS
      const st = world.bossState.get(eid) as { ringDelay: number; boomDelay: number }
      st.ringDelay = 0
      transition(eid, AIState.ATTACK)

      enemyAttackSystem(world, 1 / 60)

      expect(countBullets()).toBe(BOOMSTICK_PHASE_3_RING_BULLETS)
    })

    test('boomstick phase 1 does not throw booms', () => {
      const eid = getBoss(EnemyType.BOOMSTICK)!.spawn(world, 100, 100)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      BossPhase.phase[eid] = 1
      const st = world.bossState.get(eid) as { ringDelay: number; boomDelay: number }
      st.boomDelay = 0
      transition(eid, AIState.ATTACK)

      enemyAttackSystem(world, 1 / 60)

      expect(world.dynamites).toHaveLength(0)
    })

    test('boomstick phase 2 throws a boom with expected payload', () => {
      const eid = getBoss(EnemyType.BOOMSTICK)!.spawn(world, 100, 100)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      BossPhase.phase[eid] = 2
      const st = world.bossState.get(eid) as { ringDelay: number; boomDelay: number }
      st.boomDelay = 0
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

  // ── Stage 1 enemy integration tests ────────────────────────────────

  describe('dustdevil attack → zone creation', () => {
    test('attack spawns exactly one zone at enemy position', () => {
      const eid = spawnDustdevil(world, 300, 400)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      transition(eid, AIState.ATTACK)

      enemyAttackSystem(world, 1 / 60)

      expect(world.dustZones).toHaveLength(1)
      expect(world.dustZones[0]!.x).toBe(300)
      expect(world.dustZones[0]!.y).toBe(400)
    })

    test('zone has correct radius, duration, and dps', () => {
      const eid = spawnDustdevil(world, 300, 400)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      transition(eid, AIState.ATTACK)

      enemyAttackSystem(world, 1 / 60)

      const zone = world.dustZones[0]!
      expect(zone.radius).toBe(DUSTDEVIL_ZONE_RADIUS)
      expect(zone.remaining).toBe(DUSTDEVIL_ZONE_DURATION)
      expect(zone.dps).toBe(DUSTDEVIL_ZONE_DPS)
    })

    test('populates dustZonesSpawnedThisTick on attack tick', () => {
      const eid = spawnDustdevil(world, 300, 400)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      transition(eid, AIState.ATTACK)

      enemyAttackSystem(world, 1 / 60)

      expect(world.dustZonesSpawnedThisTick).toHaveLength(1)
      expect(world.dustZonesSpawnedThisTick[0]!.x).toBe(300)
      expect(world.dustZonesSpawnedThisTick[0]!.y).toBe(400)
      expect(world.dustZonesSpawnedThisTick[0]!.radius).toBe(DUSTDEVIL_ZONE_RADIUS)
    })

    test('dustZonesSpawnedThisTick is cleared on next tick', () => {
      const eid = spawnDustdevil(world, 300, 400)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      transition(eid, AIState.ATTACK)

      enemyAttackSystem(world, 1 / 60)
      expect(world.dustZonesSpawnedThisTick).toHaveLength(1)

      // Next tick clears the per-tick array
      enemyAttackSystem(world, 1 / 60)
      expect(world.dustZonesSpawnedThisTick).toHaveLength(0)
    })

    test('transitions to RECOVERY after attack', () => {
      const eid = spawnDustdevil(world, 300, 400)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      transition(eid, AIState.ATTACK)

      enemyAttackSystem(world, 1 / 60)

      expect(EnemyAI.state[eid]!).toBe(AIState.RECOVERY)
    })

    test('does not spawn any bullets', () => {
      const eid = spawnDustdevil(world, 300, 400)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      transition(eid, AIState.ATTACK)

      enemyAttackSystem(world, 1 / 60)

      expect(countBullets()).toBe(0)
    })
  })

  describe('spitter multi-projectile spread', () => {
    test('attack spawns exactly 6 bullets', () => {
      const eid = spawnSpitter(world, 100, 100)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      transition(eid, AIState.ATTACK)

      enemyAttackSystem(world, 1 / 60)

      expect(countBullets()).toBe(6)
    })

    test('bullets have correct speed and damage', () => {
      const eid = spawnSpitter(world, 100, 100)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      transition(eid, AIState.ATTACK)

      enemyAttackSystem(world, 1 / 60)

      const bullets = bulletQuery(world)
      for (const bid of bullets) {
        const vx = Velocity.x[bid]!
        const vy = Velocity.y[bid]!
        const speed = Math.sqrt(vx * vx + vy * vy)
        expect(speed).toBeCloseTo(130, 0)
        expect(Bullet.damage[bid]!).toBe(3)
      }
    })

    test('bullets fan out across ~1.8 radian spread', () => {
      // Place spitter east of player for clean angle calculation
      const eid = spawnSpitter(world, 100, 200)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      transition(eid, AIState.ATTACK)

      enemyAttackSystem(world, 1 / 60)

      const bullets = bulletQuery(world)
      const angles = bullets.map(bid => Math.atan2(Velocity.y[bid]!, Velocity.x[bid]!))
      angles.sort((a, b) => a - b)

      // Total spread should be approximately 1.8 radians
      const totalSpread = angles[angles.length - 1]! - angles[0]!
      expect(totalSpread).toBeCloseTo(1.8, 1)

      // Bullets should be evenly spaced
      for (let i = 1; i < angles.length; i++) {
        const gap = angles[i]! - angles[i - 1]!
        expect(gap).toBeCloseTo(1.8 / 5, 1) // spread / (count - 1)
      }
    })

    test('fodder projectile cap gates spitter firing', () => {
      const eid = spawnSpitter(world, 100, 100)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      transition(eid, AIState.ATTACK)

      world.maxProjectiles = 0

      enemyAttackSystem(world, 1 / 60)

      expect(countBullets()).toBe(0)
      expect(EnemyAI.state[eid]!).toBe(AIState.RECOVERY)
    })

    test('transitions to RECOVERY after attack', () => {
      const eid = spawnSpitter(world, 100, 100)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      transition(eid, AIState.ATTACK)

      enemyAttackSystem(world, 1 / 60)

      expect(EnemyAI.state[eid]!).toBe(AIState.RECOVERY)
    })
  })

  describe('deadeye snipe attack', () => {
    test('fires a single fast bullet in locked aim direction', () => {
      const eid = spawnDeadeye(world, 100, 200)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid

      // Simulate aim lock during TELEGRAPH
      AttackConfig.aimX[eid] = 1
      AttackConfig.aimY[eid] = 0

      transition(eid, AIState.ATTACK)
      enemyAttackSystem(world, 1 / 60)

      expect(countBullets()).toBe(1)
      const bid = bulletQuery(world)[0]!
      const speed = Math.sqrt(Velocity.x[bid]! ** 2 + Velocity.y[bid]! ** 2)
      expect(speed).toBeCloseTo(650, 0)
    })

    test('bullet fires at locked aim direction, not current player position', () => {
      const eid = spawnDeadeye(world, 100, 200)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid

      // Lock aim east (1, 0) — even though player is northeast
      AttackConfig.aimX[eid] = 1
      AttackConfig.aimY[eid] = 0

      transition(eid, AIState.ATTACK)
      enemyAttackSystem(world, 1 / 60)

      const bid = bulletQuery(world)[0]!
      // Bullet should go east, not toward the player
      expect(Velocity.x[bid]!).toBeCloseTo(650, 0)
      expect(Velocity.y[bid]!).toBeCloseTo(0, 0)
    })

    test('bullet has correct damage', () => {
      const eid = spawnDeadeye(world, 100, 200)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      AttackConfig.aimX[eid] = 1
      AttackConfig.aimY[eid] = 0
      transition(eid, AIState.ATTACK)

      enemyAttackSystem(world, 1 / 60)

      const bid = bulletQuery(world)[0]!
      expect(Bullet.damage[bid]!).toBe(9)
    })

    test('aim locks on first tick of TELEGRAPH', () => {
      const eid = spawnDeadeye(world, 100, 200)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid

      // Enter TELEGRAPH — stateTimer is 0 on first tick
      transition(eid, AIState.TELEGRAPH)
      EnemyAI.stateTimer[eid] = 0

      enemyAttackSystem(world, 1 / 60)

      // Aim should be locked toward the player
      const dx = Position.x[playerEid]! - Position.x[eid]!
      const dy = Position.y[playerEid]! - Position.y[eid]!
      const len = Math.sqrt(dx * dx + dy * dy)
      expect(AttackConfig.aimX[eid]!).toBeCloseTo(dx / len, 5)
      expect(AttackConfig.aimY[eid]!).toBeCloseTo(dy / len, 5)
    })

    test('laser telegraph data populated during TELEGRAPH', () => {
      const eid = spawnDeadeye(world, 100, 200)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      AttackConfig.aimX[eid] = 1
      AttackConfig.aimY[eid] = 0
      AttackConfig.telegraphDuration[eid] = DEADEYE_TELEGRAPH_DURATION
      transition(eid, AIState.TELEGRAPH)

      enemyAttackSystem(world, 1 / 60)

      expect(world.laserTelegraphs).toHaveLength(1)
      const laser = world.laserTelegraphs[0]!
      expect(laser.eid).toBe(eid)
      expect(laser.x).toBe(Position.x[eid]!)
      expect(laser.y).toBe(Position.y[eid]!)
      expect(laser.aimX).toBe(1)
      expect(laser.aimY).toBe(0)
      expect(laser.progress).toBeGreaterThanOrEqual(0)
      expect(laser.progress).toBeLessThanOrEqual(1)
    })

    test('telegraph duration matches constant', () => {
      const eid = spawnDeadeye(world, 100, 200)
      // Float32Array truncates 1.1 — use toBeCloseTo for float comparison
      expect(AttackConfig.telegraphDuration[eid]!).toBeCloseTo(DEADEYE_TELEGRAPH_DURATION, 2)
      expect(DEADEYE_TELEGRAPH_DURATION).toBe(1.1)
    })

    test('transitions to RECOVERY after attack', () => {
      const eid = spawnDeadeye(world, 100, 200)
      EnemyAI.initialDelay[eid] = 0
      EnemyAI.targetEid[eid] = playerEid
      AttackConfig.aimX[eid] = 1
      AttackConfig.aimY[eid] = 0
      transition(eid, AIState.ATTACK)

      enemyAttackSystem(world, 1 / 60)

      expect(EnemyAI.state[eid]!).toBe(AIState.RECOVERY)
    })

    test('deadeye has losRequired set', () => {
      const eid = spawnDeadeye(world, 100, 200)
      // Detection.losRequired is set to 1 for Deadeye (from enemies.ts definition)
      expect(Detection.losRequired[eid]).toBe(1)
    })
  })
})
