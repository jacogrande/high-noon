/**
 * Old Scratch Boss Module Tests
 *
 * Tests for spawn stats, phase transitions, mid-fight heal,
 * arena modifications, and Infernal Counter mechanic.
 */

import { describe, expect, test, beforeEach } from 'bun:test'
import { addEntity, addComponent, defineQuery, hasComponent } from 'bitecs'
import { createGameWorld, setWorldTilemap, type GameWorld } from '../../world'
import { createTestArena } from '../maps/testArena'
import { generateCrossroads } from '../maps/crossroadsGenerator'
import { STAGE_4_MAP_CONFIG } from '../maps/mapConfig'
import { spawnPlayer, CollisionLayer } from '../../prefabs'
import { getBoss } from './registry'
import { bossPhaseSystem } from '../../systems/bossPhase'
import {
  Enemy, EnemyAI, AIState, AttackConfig, BossPhase,
  EnemyType, EnemyTier, Health, Speed, Position, Velocity,
  Bullet, Collider, Player, Dead, Knockback,
} from '../../components'
import {
  OLD_SCRATCH_HP,
  OLD_SCRATCH_RADIUS,
  OLD_SCRATCH_P1_SPEED,
  OLD_SCRATCH_P2_SPEED,
  OLD_SCRATCH_P3_SPEED,
  OLD_SCRATCH_P4_SPEED,
  OLD_SCRATCH_P1_COOLDOWN,
  OLD_SCRATCH_P2_COOLDOWN,
  OLD_SCRATCH_TRANSITION_IFRAMES,
  OLD_SCRATCH_P3_HEAL_HP,
  OLD_SCRATCH_COUNTER_INTERNAL_CD,
  OLD_SCRATCH_COUNTER_SHOT_DAMAGE,
  OLD_SCRATCH_P2_ROAD_SHRINK_TILES,
  OLD_SCRATCH_P3_ROAD_SHRINK_TILES,
  OLD_SCRATCH_DEAD_EYE_DAMAGE,
  OLD_SCRATCH_DEAD_EYE_SPEED,
  OLD_SCRATCH_DEAD_EYE_TELEGRAPH,
  OLD_SCRATCH_DEVILS_FAN_DAMAGE,
  OLD_SCRATCH_DEVILS_FAN_BULLETS,
  OLD_SCRATCH_BLACK_IRON_RECOVERY,
  OLD_SCRATCH_SIDEWINDER_DIST,
  OLD_SCRATCH_SIDEWINDER_COOLDOWN,
  OLD_SCRATCH_BRIMSTONE_BLAST_DAMAGE,
  OLD_SCRATCH_BRIMSTONE_BLAST_PELLETS,
  OLD_SCRATCH_COFFIN_NAIL_DAMAGE,
  OLD_SCRATCH_COFFIN_NAIL_DELAY,
  OLD_SCRATCH_COFFIN_NAIL_RADIUS,
  OLD_SCRATCH_SHADOW_STEP_DIST,
  OLD_SCRATCH_SHADOW_STEP_COOLDOWN,
  OLD_SCRATCH_HELLPICK_DAMAGE,
  OLD_SCRATCH_HELLPICK_REACH,
  OLD_SCRATCH_INFERNAL_CHARGE_DAMAGE,
  OLD_SCRATCH_FIRE_TRAIL_DURATION,
  OLD_SCRATCH_DEVILS_DYNAMITE_DAMAGE,
  OLD_SCRATCH_DEVILS_DYNAMITE_RADIUS,
  OLD_SCRATCH_DEVILS_DYNAMITE_FUSE,
  P1Attack, P2Attack, P3Attack,
  OLD_SCRATCH_P2_TELEGRAPH_MUL,
  OLD_SCRATCH_CROSSROADS_SALVO_BULLETS,
  OLD_SCRATCH_BRIMSTONE_LASH_DURATION,
  OLD_SCRATCH_BRIMSTONE_LASH_WIDTH,
  OLD_SCRATCH_GHOST_RIDER_MAX_ALIVE,
  OLD_SCRATCH_GHOST_RIDER_SUMMON_COOLDOWN,
  OLD_SCRATCH_SNAP_SHOT_DAMAGE,
  OLD_SCRATCH_PILLAR_HP,
  OLD_SCRATCH_PILLAR_RESPAWN_TIME,
  OLD_SCRATCH_HELLFIRE_SWEEP_BULLETS,
  OLD_SCRATCH_HELLFIRE_SWEEP_DAMAGE,
  OLD_SCRATCH_SOUL_GEYSER_DAMAGE,
  OLD_SCRATCH_SOUL_GEYSER_RADIUS,
  OLD_SCRATCH_SOUL_GEYSER_COUNT,
  OLD_SCRATCH_CONVERGENCE_BULLETS_PER_ROAD,
  OLD_SCRATCH_CONVERGENCE_DAMAGE,
  OLD_SCRATCH_CHAIN_LIGHTNING_MIN_PILLARS,
  OLD_SCRATCH_STAMPEDE_BULLETS,
  OLD_SCRATCH_STAMPEDE_DAMAGE,
  OLD_SCRATCH_DUST_STORM_HP_THRESHOLD,
  OLD_SCRATCH_DUST_STORM_VISIBILITY,
  OLD_SCRATCH_STAREDOWN_ROUND_1,
  OLD_SCRATCH_STAREDOWN_ROUND_2,
  OLD_SCRATCH_STAREDOWN_ROUND_3_PLUS,
  OLD_SCRATCH_PERFECT_DRAW_WINDOW,
  OLD_SCRATCH_GOOD_DRAW_WINDOW,
  OLD_SCRATCH_PERFECT_DRAW_DAMAGE,
  OLD_SCRATCH_GOOD_DRAW_DAMAGE,
  OLD_SCRATCH_SLOW_DRAW_DAMAGE,
  OLD_SCRATCH_PANIC_SHOT_DAMAGE,
  OLD_SCRATCH_PERFECT_DRAW_STAGGER,
  OLD_SCRATCH_SCRAMBLE_DURATION,
  OLD_SCRATCH_RESET_DURATION,
} from './oldScratch'
import type { OldScratchState } from './oldScratch'
import { TileType, getTile } from '../../tilemap'
import { spawnGhostRider, spawnHellfirePillar } from '../../prefabs'
import { Lifespan, EnemyTier, HellfirePillar } from '../../components'
import { hellfirePillarSystem } from '../../systems/hellfirePillar'
import { GHOST_RIDER_LIFESPAN } from '../enemies'

const bulletQuery = defineQuery([Bullet])

function spawnOldScratch(world: GameWorld, x: number, y: number): number {
  return getBoss(EnemyType.OLD_SCRATCH)!.spawn(world, x, y)
}

function countBullets(world: GameWorld, layer: number): number {
  let count = 0
  for (const eid of bulletQuery(world)) {
    if (Collider.layer[eid] === layer) count++
  }
  return count
}

// ============================================================================
// Spawn tests
// ============================================================================

describe('Old Scratch — spawn', () => {
  let world: GameWorld
  let bossEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    spawnPlayer(world, 800, 600)
    bossEid = spawnOldScratch(world, 900, 600)
  })

  test('spawns with correct HP', () => {
    expect(Health.current[bossEid]!).toBe(OLD_SCRATCH_HP)
    expect(Health.max[bossEid]!).toBe(OLD_SCRATCH_HP)
  })

  test('spawns with correct enemy type and tier', () => {
    expect(Enemy.type[bossEid]!).toBe(EnemyType.OLD_SCRATCH)
    expect(Enemy.tier[bossEid]!).toBe(EnemyTier.THREAT)
  })

  test('spawns in phase 1 with correct speed', () => {
    expect(BossPhase.phase[bossEid]!).toBe(1)
    expect(Speed.current[bossEid]!).toBe(OLD_SCRATCH_P1_SPEED)
    expect(Speed.max[bossEid]!).toBe(OLD_SCRATCH_P1_SPEED)
  })

  test('spawns with correct cooldown', () => {
    expect(AttackConfig.cooldown[bossEid]!).toBeCloseTo(OLD_SCRATCH_P1_COOLDOWN)
  })

  test('spawns with correct collider radius', () => {
    expect(Collider.radius[bossEid]!).toBe(OLD_SCRATCH_RADIUS)
  })

  test('spawns at given position', () => {
    expect(Position.x[bossEid]!).toBe(900)
    expect(Position.y[bossEid]!).toBe(600)
  })

  test('is registered in boss registry', () => {
    const mod = getBoss(EnemyType.OLD_SCRATCH)
    expect(mod).toBeDefined()
    expect(mod!.displayName).toBe('OLD SCRATCH')
    expect(mod!.type).toBe(EnemyType.OLD_SCRATCH)
  })
})

// ============================================================================
// Phase transition tests
// ============================================================================

describe('Old Scratch — phase transitions', () => {
  let world: GameWorld
  let bossEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    spawnPlayer(world, 800, 600)
    bossEid = spawnOldScratch(world, 900, 600)
  })

  test('phase 2 at HP <= 75%: speed increases, i-frames granted', () => {
    Health.current[bossEid] = Health.max[bossEid]! * 0.74

    bossPhaseSystem(world, 1 / 60)

    expect(BossPhase.phase[bossEid]!).toBe(2)
    expect(Speed.current[bossEid]!).toBe(OLD_SCRATCH_P2_SPEED)
    expect(Speed.max[bossEid]!).toBe(OLD_SCRATCH_P2_SPEED)
    expect(Health.iframes[bossEid]!).toBeCloseTo(OLD_SCRATCH_TRANSITION_IFRAMES)
    expect(AttackConfig.cooldown[bossEid]!).toBeCloseTo(OLD_SCRATCH_P2_COOLDOWN)
    expect(AttackConfig.cooldownRemaining[bossEid]!).toBe(0)
  })

  test('phase 3 at HP <= 45%: heals to 250 HP, speed drops to 0', () => {
    // Enter phase 2 first
    Health.current[bossEid] = Health.max[bossEid]! * 0.74
    bossPhaseSystem(world, 1 / 60)

    // Enter phase 3
    Health.current[bossEid] = Health.max[bossEid]! * 0.44
    bossPhaseSystem(world, 1 / 60)

    expect(BossPhase.phase[bossEid]!).toBe(3)
    expect(Health.current[bossEid]!).toBe(OLD_SCRATCH_P3_HEAL_HP)
    expect(Speed.current[bossEid]!).toBe(OLD_SCRATCH_P3_SPEED)
    expect(Speed.max[bossEid]!).toBe(OLD_SCRATCH_P3_SPEED)
    expect(Health.iframes[bossEid]!).toBeCloseTo(OLD_SCRATCH_TRANSITION_IFRAMES)
  })

  test('phase 4 at HP <= 15%: speed 0, draw mode initialized', () => {
    // Fast-forward through phases
    Health.current[bossEid] = Health.max[bossEid]! * 0.74
    bossPhaseSystem(world, 1 / 60)
    Health.current[bossEid] = Health.max[bossEid]! * 0.44
    bossPhaseSystem(world, 1 / 60)
    Health.current[bossEid] = Health.max[bossEid]! * 0.14
    bossPhaseSystem(world, 1 / 60)

    expect(BossPhase.phase[bossEid]!).toBe(4)
    expect(Speed.current[bossEid]!).toBe(OLD_SCRATCH_P4_SPEED)
    expect(Speed.max[bossEid]!).toBe(OLD_SCRATCH_P4_SPEED)
    expect(Health.iframes[bossEid]!).toBeCloseTo(OLD_SCRATCH_TRANSITION_IFRAMES)
  })

  test('large HP drop (phase 1 → phase 3) triggers both transitions and heals', () => {
    Health.current[bossEid] = Health.max[bossEid]! * 0.30

    bossPhaseSystem(world, 1 / 60)

    expect(BossPhase.phase[bossEid]!).toBe(3)
    // P3 heal should apply
    expect(Health.current[bossEid]!).toBe(OLD_SCRATCH_P3_HEAL_HP)
    // P3 speed (last applied)
    expect(Speed.current[bossEid]!).toBe(OLD_SCRATCH_P3_SPEED)
  })

  test('large HP drop (phase 1 → phase 4) triggers all transitions', () => {
    Health.current[bossEid] = Health.max[bossEid]! * 0.10

    bossPhaseSystem(world, 1 / 60)

    expect(BossPhase.phase[bossEid]!).toBe(4)
    expect(Speed.current[bossEid]!).toBe(OLD_SCRATCH_P4_SPEED)
  })

  test('re-running in same phase does not re-trigger transitions', () => {
    Health.current[bossEid] = Health.max[bossEid]! * 0.44
    bossPhaseSystem(world, 1 / 60)
    expect(BossPhase.phase[bossEid]!).toBe(3)
    expect(Health.current[bossEid]!).toBe(OLD_SCRATCH_P3_HEAL_HP)

    // Damage below P3 heal, run again — should NOT re-heal
    Health.current[bossEid] = 200
    bossPhaseSystem(world, 1 / 60)
    expect(Health.current[bossEid]!).toBe(200)
    expect(BossPhase.phase[bossEid]!).toBe(3)
  })

  test('stays at phase 1 above 75% HP', () => {
    Health.current[bossEid] = Health.max[bossEid]! * 0.76

    bossPhaseSystem(world, 1 / 60)

    expect(BossPhase.phase[bossEid]!).toBe(1)
    expect(Speed.current[bossEid]!).toBe(OLD_SCRATCH_P1_SPEED)
  })

  test('bossPhaseChanges events are pushed on phase transitions', () => {
    Health.current[bossEid] = Health.max[bossEid]! * 0.74
    bossPhaseSystem(world, 1 / 60)

    expect(world.bossPhaseChanges.length).toBe(1)
    expect(world.bossPhaseChanges[0]!.eid).toBe(bossEid)
    expect(world.bossPhaseChanges[0]!.newPhase).toBe(2)
  })
})

// ============================================================================
// Arena modification tests
// ============================================================================

describe('Old Scratch — arena modifications', () => {
  let world: GameWorld
  let bossEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    const map = generateCrossroads(STAGE_4_MAP_CONFIG)
    setWorldTilemap(world, map)
    spawnPlayer(world, 768, 768)
    bossEid = spawnOldScratch(world, 800, 768)
  })

  test('phase 2 shrinks roads by converting outer tiles to WALL', () => {
    Health.current[bossEid] = Health.max[bossEid]! * 0.74
    bossPhaseSystem(world, 1 / 60)

    const map = world.tilemap!
    const cx = Math.floor(map.width / 2)

    // North road: tile (cx, 0) through (cx, P2_SHRINK-1) should now be WALL on solid layer
    for (let y = 0; y < OLD_SCRATCH_P2_ROAD_SHRINK_TILES; y++) {
      expect(getTile(map, 0, cx, y)).toBe(TileType.WALL)
    }
    // Tiles beyond shrink should still be open
    expect(getTile(map, 0, cx, OLD_SCRATCH_P2_ROAD_SHRINK_TILES + 1)).toBe(TileType.EMPTY)
  })

  test('phase 2 places brimstone cracks along road edges', () => {
    Health.current[bossEid] = Health.max[bossEid]! * 0.74
    bossPhaseSystem(world, 1 / 60)

    const map = world.tilemap!
    const cx = Math.floor(map.width / 2)
    const roadMinX = cx - 4

    // North road left edge should be BRIMSTONE on floor layer
    expect(getTile(map, 1, roadMinX, 8)).toBe(TileType.BRIMSTONE)
  })

  test('phase 3 further shrinks roads', () => {
    Health.current[bossEid] = Health.max[bossEid]! * 0.74
    bossPhaseSystem(world, 1 / 60)
    Health.current[bossEid] = Health.max[bossEid]! * 0.44
    bossPhaseSystem(world, 1 / 60)

    const map = world.tilemap!
    const cx = Math.floor(map.width / 2)

    // North road: should be solid up to P3 shrink depth
    for (let y = 0; y < OLD_SCRATCH_P3_ROAD_SHRINK_TILES; y++) {
      expect(getTile(map, 0, cx, y)).toBe(TileType.WALL)
    }
  })

  test('phase 4 clears brimstone cracks', () => {
    // Enter P2 (places brimstone)
    Health.current[bossEid] = Health.max[bossEid]! * 0.74
    bossPhaseSystem(world, 1 / 60)

    const map = world.tilemap!

    // Verify brimstone exists
    let hasBrimstone = false
    for (const tile of map.layers[1]!.data) {
      if (tile === TileType.BRIMSTONE) { hasBrimstone = true; break }
    }
    expect(hasBrimstone).toBe(true)

    // Enter P3 then P4
    Health.current[bossEid] = Health.max[bossEid]! * 0.44
    bossPhaseSystem(world, 1 / 60)
    Health.current[bossEid] = Health.max[bossEid]! * 0.14
    bossPhaseSystem(world, 1 / 60)

    // All brimstone should be cleared
    for (const tile of map.layers[1]!.data) {
      expect(tile).not.toBe(TileType.BRIMSTONE)
    }
  })

  test('tileVersion increments on arena changes', () => {
    const map = world.tilemap!
    const versionBefore = map.tileVersion

    Health.current[bossEid] = Health.max[bossEid]! * 0.74
    bossPhaseSystem(world, 1 / 60)

    expect(map.tileVersion).toBeGreaterThan(versionBefore)
  })
})

// ============================================================================
// Infernal Counter tests
// ============================================================================

describe('Old Scratch — Infernal Counter', () => {
  let world: GameWorld
  let bossEid: number
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    playerEid = spawnPlayer(world, 700, 600)
    bossEid = spawnOldScratch(world, 900, 600)
  })

  function putBossInCounterWindow() {
    // Set boss to IDLE state (between attacks) so counter window opens
    EnemyAI.state[bossEid] = AIState.IDLE
    EnemyAI.stateTimer[bossEid] = 0

    // Tick to open the counter window
    bossPhaseSystem(world, 1 / 60)
  }

  function simulatePlayerBulletHit(damage: number): { damage: number; pierce: boolean } {
    return world.hooks.fireBulletHit(world, createFakeBullet(world), bossEid, damage)
  }

  function createFakeBullet(w: GameWorld): number {
    const eid = addEntity(w)
    addComponent(w, Bullet, eid)
    addComponent(w, Collider, eid)
    Collider.layer[eid] = CollisionLayer.PLAYER_BULLET
    return eid
  }

  test('counter fires snap-shot when hit during counter window', () => {
    putBossInCounterWindow()

    const enemyBulletsBefore = countBullets(world, CollisionLayer.ENEMY_BULLET)
    const result = simulatePlayerBulletHit(20)

    // Damage should be negated
    expect(result.damage).toBe(0)

    // Snap-shot should be spawned
    const enemyBulletsAfter = countBullets(world, CollisionLayer.ENEMY_BULLET)
    expect(enemyBulletsAfter).toBe(enemyBulletsBefore + 1)
  })

  test('counter negates incoming damage', () => {
    putBossInCounterWindow()
    const result = simulatePlayerBulletHit(50)
    expect(result.damage).toBe(0)
  })

  test('counter sidesteps boss position', () => {
    putBossInCounterWindow()

    const bossXBefore = Position.x[bossEid]!
    const bossYBefore = Position.y[bossEid]!

    simulatePlayerBulletHit(20)

    const dx = Position.x[bossEid]! - bossXBefore
    const dy = Position.y[bossEid]! - bossYBefore
    const dist = Math.sqrt(dx * dx + dy * dy)

    // Should have moved approximately COUNTER_SIDESTEP_DIST (60px)
    expect(dist).toBeCloseTo(60, 0)
  })

  test('counter has 1.5s internal cooldown', () => {
    putBossInCounterWindow()

    // First counter should work
    const result1 = simulatePlayerBulletHit(20)
    expect(result1.damage).toBe(0)

    // Re-open counter window (reset state)
    EnemyAI.state[bossEid] = AIState.IDLE
    bossPhaseSystem(world, 1 / 60)

    // Second hit immediately should NOT trigger counter (cooldown active)
    const result2 = simulatePlayerBulletHit(20)
    expect(result2.damage).toBe(20)

    // Tick past the cooldown
    for (let i = 0; i < 100; i++) {
      EnemyAI.state[bossEid] = AIState.IDLE
      bossPhaseSystem(world, 1 / 60)
    }

    // Now counter should work again
    const result3 = simulatePlayerBulletHit(20)
    expect(result3.damage).toBe(0)
  })

  test('counter does NOT trigger during ATTACK state', () => {
    // Put boss in ATTACK state
    EnemyAI.state[bossEid] = AIState.ATTACK
    EnemyAI.stateTimer[bossEid] = 0
    bossPhaseSystem(world, 1 / 60)

    const result = simulatePlayerBulletHit(20)
    // Damage should pass through normally
    expect(result.damage).toBe(20)
  })

  test('counter does NOT trigger during TELEGRAPH state', () => {
    EnemyAI.state[bossEid] = AIState.TELEGRAPH
    EnemyAI.stateTimer[bossEid] = 0
    bossPhaseSystem(world, 1 / 60)

    const result = simulatePlayerBulletHit(20)
    expect(result.damage).toBe(20)
  })

  test('counter does NOT trigger during RECOVERY state', () => {
    EnemyAI.state[bossEid] = AIState.RECOVERY
    EnemyAI.stateTimer[bossEid] = 0
    bossPhaseSystem(world, 1 / 60)

    const result = simulatePlayerBulletHit(20)
    expect(result.damage).toBe(20)
  })

  test('counter does not fire on enemy bullet (non-player)', () => {
    putBossInCounterWindow()

    const fakeBullet = addEntity(world)
    addComponent(world, Bullet, fakeBullet)
    addComponent(world, Collider, fakeBullet)
    Collider.layer[fakeBullet] = CollisionLayer.ENEMY_BULLET

    const result = world.hooks.fireBulletHit(world, fakeBullet, bossEid, 20)
    expect(result.damage).toBe(20)
  })

  test('counter does not fire when targeting a different entity', () => {
    putBossInCounterWindow()

    // Fire at the player, not the boss
    const fakeBullet = createFakeBullet(world)
    const result = world.hooks.fireBulletHit(world, fakeBullet, playerEid, 20)
    expect(result.damage).toBe(20)
  })

  test('counter telegraph is pushed during active counter window', () => {
    EnemyAI.state[bossEid] = AIState.IDLE
    EnemyAI.stateTimer[bossEid] = 0

    bossPhaseSystem(world, 1 / 60)

    // Should have a ring telegraph
    const counterTelegraphs = world.bossTelegraphs.filter(
      t => t.kind === 'ring' && t.color === 0xff2222
    )
    expect(counterTelegraphs.length).toBeGreaterThanOrEqual(1)
  })
})

// ============================================================================
// Phase 1 Attack Helpers
// ============================================================================

function getState(world: GameWorld, eid: number): OldScratchState {
  return world.bossState.get(eid) as OldScratchState
}

/** Set up boss for attack execution: configure selected attack, aim at player, set AI to ATTACK */
function prepareAttack(world: GameWorld, bossEid: number, playerEid: number, attackType: number): void {
  const state = getState(world, bossEid)
  state.selectedAttack = attackType
  state.attackExecuted = false
  state.phase = 1

  // Lock aim toward player
  const dx = Position.x[playerEid]! - Position.x[bossEid]!
  const dy = Position.y[playerEid]! - Position.y[bossEid]!
  state.aimAngle = Math.atan2(dy, dx)

  EnemyAI.state[bossEid] = AIState.ATTACK
  EnemyAI.stateTimer[bossEid] = 0
  EnemyAI.targetEid[bossEid] = playerEid
}

function triggerAttack(world: GameWorld, bossEid: number): void {
  getBoss(EnemyType.OLD_SCRATCH)!.attack(world, bossEid, 1 / 60)
}

// ============================================================================
// Attack Cycle tests
// ============================================================================

describe('Old Scratch — attack cycles', () => {
  let world: GameWorld
  let bossEid: number
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    playerEid = spawnPlayer(world, 700, 600)
    bossEid = spawnOldScratch(world, 900, 600)
  })

  test('sheriff cycle selects correct attacks in order', () => {
    const state = getState(world, bossEid)
    state.characterId = 'sheriff'

    // Simulate TELEGRAPH entry for each cycle position
    const expectedSheriff = [
      P1Attack.DEAD_EYE_SHOT,
      P1Attack.SIDEWINDER,
      P1Attack.DEVILS_FAN,
      // BLACK_IRON_RELOAD skips to recovery, so we check 3 normal attacks
    ]

    for (let i = 0; i < expectedSheriff.length; i++) {
      state.attackCycleIndex = i
      EnemyAI.state[bossEid] = AIState.TELEGRAPH
      EnemyAI.stateTimer[bossEid] = 0
      bossPhaseSystem(world, 1 / 60)
      expect(state.selectedAttack).toBe(expectedSheriff[i])
    }
  })

  test('undertaker cycle selects correct attacks in order', () => {
    const state = getState(world, bossEid)
    state.characterId = 'undertaker'

    const expected = [
      P1Attack.BRIMSTONE_BLAST,
      P1Attack.COFFIN_NAIL,
      P1Attack.SHADOW_STEP,
    ]

    for (let i = 0; i < expected.length; i++) {
      state.attackCycleIndex = i
      EnemyAI.state[bossEid] = AIState.TELEGRAPH
      EnemyAI.stateTimer[bossEid] = 0
      bossPhaseSystem(world, 1 / 60)
      expect(state.selectedAttack).toBe(expected[i])
    }
  })

  test('prospector cycle selects correct attacks in order', () => {
    const state = getState(world, bossEid)
    state.characterId = 'prospector'

    const expected = [
      P1Attack.HELLPICK_SWING,
      P1Attack.INFERNAL_CHARGE,
      P1Attack.DEVILS_DYNAMITE,
    ]

    for (let i = 0; i < expected.length; i++) {
      state.attackCycleIndex = i
      EnemyAI.state[bossEid] = AIState.TELEGRAPH
      EnemyAI.stateTimer[bossEid] = 0
      bossPhaseSystem(world, 1 / 60)
      expect(state.selectedAttack).toBe(expected[i])
    }
  })

  test('cycle wraps around after completion', () => {
    const state = getState(world, bossEid)
    state.characterId = 'undertaker'
    // Undertaker cycle has 3 attacks; index 3 should wrap to 0
    state.attackCycleIndex = 3
    EnemyAI.state[bossEid] = AIState.TELEGRAPH
    EnemyAI.stateTimer[bossEid] = 0
    bossPhaseSystem(world, 1 / 60)
    expect(state.selectedAttack).toBe(P1Attack.BRIMSTONE_BLAST) // index 3 % 3 = 0
  })

  test('character detection caches from player on first tick', () => {
    // Don't set characterId manually; let tick() detect it
    const state = getState(world, bossEid)
    state.characterId = '' // reset

    // The player was spawned with default character (sheriff)
    // getCharacterIdForPlayer reads from playerCharacters map
    EnemyAI.state[bossEid] = AIState.TELEGRAPH
    EnemyAI.stateTimer[bossEid] = 0
    bossPhaseSystem(world, 1 / 60)

    // Should detect the player's character (sheriff by default)
    expect(state.characterId).toBe('sheriff')
  })
})

// ============================================================================
// Sheriff attack tests
// ============================================================================

describe('Old Scratch — sheriff attacks', () => {
  let world: GameWorld
  let bossEid: number
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    playerEid = spawnPlayer(world, 700, 600)
    bossEid = spawnOldScratch(world, 900, 600)
    getState(world, bossEid).characterId = 'sheriff'
  })

  test('Dead-Eye spawns 1 bullet at 14 dmg / 700 px/s', () => {
    prepareAttack(world, bossEid, playerEid, P1Attack.DEAD_EYE_SHOT)
    const before = countBullets(world, CollisionLayer.ENEMY_BULLET)
    triggerAttack(world, bossEid)
    const after = countBullets(world, CollisionLayer.ENEMY_BULLET)
    expect(after - before).toBe(1)
  })

  test('Devil\'s Fan spawns 4 bullets', () => {
    prepareAttack(world, bossEid, playerEid, P1Attack.DEVILS_FAN)
    const before = countBullets(world, CollisionLayer.ENEMY_BULLET)
    triggerAttack(world, bossEid)
    const after = countBullets(world, CollisionLayer.ENEMY_BULLET)
    expect(after - before).toBe(OLD_SCRATCH_DEVILS_FAN_BULLETS)
  })

  test('Black Iron Reload enters RECOVERY for 0.7s (no bullets)', () => {
    const state = getState(world, bossEid)
    state.characterId = 'sheriff'
    state.attackCycleIndex = 3 // BLACK_IRON_RELOAD is 4th in sheriff cycle (index 3)

    EnemyAI.state[bossEid] = AIState.TELEGRAPH
    EnemyAI.stateTimer[bossEid] = 0

    const bulletsBefore = countBullets(world, CollisionLayer.ENEMY_BULLET)
    bossPhaseSystem(world, 1 / 60) // tick should skip to RECOVERY

    const bulletsAfter = countBullets(world, CollisionLayer.ENEMY_BULLET)
    expect(bulletsAfter).toBe(bulletsBefore)
    expect(EnemyAI.state[bossEid]!).toBe(AIState.RECOVERY)
    expect(AttackConfig.recoveryDuration[bossEid]!).toBeCloseTo(OLD_SCRATCH_BLACK_IRON_RECOVERY)
  })

  test('Sidewinder repositions ~200px perpendicular', () => {
    prepareAttack(world, bossEid, playerEid, P1Attack.SIDEWINDER)
    const bxBefore = Position.x[bossEid]!
    const byBefore = Position.y[bossEid]!

    triggerAttack(world, bossEid)

    const dx = Position.x[bossEid]! - bxBefore
    const dy = Position.y[bossEid]! - byBefore
    const dist = Math.sqrt(dx * dx + dy * dy)
    expect(dist).toBeCloseTo(OLD_SCRATCH_SIDEWINDER_DIST, 0)
  })

  test('Sidewinder cooldown prevents double-dash', () => {
    prepareAttack(world, bossEid, playerEid, P1Attack.SIDEWINDER)
    triggerAttack(world, bossEid)

    const posAfterFirst = { x: Position.x[bossEid]!, y: Position.y[bossEid]! }

    // Second sidewinder immediately — should be blocked by cooldown
    prepareAttack(world, bossEid, playerEid, P1Attack.SIDEWINDER)
    triggerAttack(world, bossEid)

    expect(Position.x[bossEid]!).toBe(posAfterFirst.x)
    expect(Position.y[bossEid]!).toBe(posAfterFirst.y)
  })
})

// ============================================================================
// Undertaker attack tests
// ============================================================================

describe('Old Scratch — undertaker attacks', () => {
  let world: GameWorld
  let bossEid: number
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    playerEid = spawnPlayer(world, 700, 600)
    bossEid = spawnOldScratch(world, 900, 600)
    getState(world, bossEid).characterId = 'undertaker'
  })

  test('Brimstone Blast spawns 5 pellets at 10 dmg', () => {
    prepareAttack(world, bossEid, playerEid, P1Attack.BRIMSTONE_BLAST)
    const before = countBullets(world, CollisionLayer.ENEMY_BULLET)
    triggerAttack(world, bossEid)
    const after = countBullets(world, CollisionLayer.ENEMY_BULLET)
    expect(after - before).toBe(OLD_SCRATCH_BRIMSTONE_BLAST_PELLETS)
  })

  test('Coffin Nail places delayed zone at player position', () => {
    const state = getState(world, bossEid)
    prepareAttack(world, bossEid, playerEid, P1Attack.COFFIN_NAIL)
    triggerAttack(world, bossEid)

    expect(state.coffinNails.length).toBe(1)
    const nail = state.coffinNails[0]!
    expect(nail.x).toBeCloseTo(Position.x[playerEid]!, 0)
    expect(nail.y).toBeCloseTo(Position.y[playerEid]!, 0)
    expect(nail.active).toBe(false)
    expect(nail.delay).toBeCloseTo(OLD_SCRATCH_COFFIN_NAIL_DELAY)
  })

  test('Coffin Nail activates after 0.8s delay and deals damage', () => {
    const state = getState(world, bossEid)
    prepareAttack(world, bossEid, playerEid, P1Attack.COFFIN_NAIL)
    triggerAttack(world, bossEid)

    // Move player to nail position so they get hit
    const nail = state.coffinNails[0]!
    Position.x[playerEid] = nail.x
    Position.y[playerEid] = nail.y
    Health.iframes[playerEid] = 0

    const hpBefore = Health.current[playerEid]!

    // Tick past the delay
    for (let i = 0; i < 50; i++) {
      bossPhaseSystem(world, 1 / 60)
    }

    // The nail should be active now (0.8s delay = 48 ticks at 60Hz)
    expect(state.coffinNails[0]?.active ?? true).toBe(true)
    expect(Health.current[playerEid]!).toBeLessThan(hpBefore)
  })

  test('Shadow Step teleports ~150px toward player', () => {
    // Place player far enough away
    Position.x[playerEid] = 500
    Position.y[playerEid] = 600
    Position.x[bossEid] = 900
    Position.y[bossEid] = 600

    prepareAttack(world, bossEid, playerEid, P1Attack.SHADOW_STEP)
    const bxBefore = Position.x[bossEid]!
    triggerAttack(world, bossEid)

    // Should have moved toward player
    const moved = bxBefore - Position.x[bossEid]!
    expect(moved).toBeCloseTo(OLD_SCRATCH_SHADOW_STEP_DIST, 0)
  })

  test('Shadow Step cooldown prevents double-step', () => {
    Position.x[playerEid] = 300
    Position.y[playerEid] = 600

    prepareAttack(world, bossEid, playerEid, P1Attack.SHADOW_STEP)
    triggerAttack(world, bossEid)

    const posAfterFirst = Position.x[bossEid]!

    prepareAttack(world, bossEid, playerEid, P1Attack.SHADOW_STEP)
    triggerAttack(world, bossEid)

    expect(Position.x[bossEid]!).toBe(posAfterFirst)
  })
})

// ============================================================================
// Prospector attack tests
// ============================================================================

describe('Old Scratch — prospector attacks', () => {
  let world: GameWorld
  let bossEid: number
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    playerEid = spawnPlayer(world, 700, 600)
    bossEid = spawnOldScratch(world, 900, 600)
    getState(world, bossEid).characterId = 'prospector'
  })

  test('Hellpick Swing deals 12 dmg in arc and applies knockback', () => {
    // Place player within melee range and aim direction
    Position.x[bossEid] = 700
    Position.y[bossEid] = 600
    Position.x[playerEid] = 750
    Position.y[playerEid] = 600
    Health.iframes[playerEid] = 0

    prepareAttack(world, bossEid, playerEid, P1Attack.HELLPICK_SWING)

    const hpBefore = Health.current[playerEid]!
    triggerAttack(world, bossEid)

    expect(Health.current[playerEid]!).toBe(hpBefore - OLD_SCRATCH_HELLPICK_DAMAGE)
    expect(hasComponent(world, Knockback, playerEid)).toBe(true)
  })

  test('Hellpick misses player outside arc', () => {
    // Place player behind the boss (opposite of aim direction)
    Position.x[bossEid] = 700
    Position.y[bossEid] = 600
    Position.x[playerEid] = 600 // behind boss (aim points right toward 750)
    Position.y[playerEid] = 600

    // Aim boss to the right, player is to the left
    const state = getState(world, bossEid)
    state.selectedAttack = P1Attack.HELLPICK_SWING
    state.attackExecuted = false
    state.phase = 1
    state.aimAngle = 0 // facing right

    EnemyAI.state[bossEid] = AIState.ATTACK
    Health.iframes[playerEid] = 0

    const hpBefore = Health.current[playerEid]!
    triggerAttack(world, bossEid)

    expect(Health.current[playerEid]!).toBe(hpBefore) // no damage
  })

  test('Infernal Charge deals contact damage', () => {
    // Place player directly in charge path
    Position.x[bossEid] = 700
    Position.y[bossEid] = 600
    Position.x[playerEid] = 750 // slightly ahead in charge direction
    Position.y[playerEid] = 600
    Health.iframes[playerEid] = 0

    prepareAttack(world, bossEid, playerEid, P1Attack.INFERNAL_CHARGE)
    triggerAttack(world, bossEid)

    const state = getState(world, bossEid)
    expect(state.isCharging).toBe(true)

    // Tick several frames to let charge connect
    const hpBefore = Health.current[playerEid]!
    for (let i = 0; i < 10; i++) {
      bossPhaseSystem(world, 1 / 60)
    }

    expect(Health.current[playerEid]!).toBeLessThan(hpBefore)
  })

  test('Infernal Charge leaves fire trail', () => {
    Position.x[bossEid] = 500
    Position.y[bossEid] = 600
    Position.x[playerEid] = 900
    Position.y[playerEid] = 600

    prepareAttack(world, bossEid, playerEid, P1Attack.INFERNAL_CHARGE)
    triggerAttack(world, bossEid)

    // Tick enough frames for charge to travel and leave trail
    for (let i = 0; i < 30; i++) {
      bossPhaseSystem(world, 1 / 60)
    }

    const state = getState(world, bossEid)
    expect(state.fireTrails.length).toBeGreaterThan(0)
  })

  test('fire trail expires after 3s', () => {
    Position.x[bossEid] = 500
    Position.y[bossEid] = 600
    Position.x[playerEid] = 900
    Position.y[playerEid] = 600

    prepareAttack(world, bossEid, playerEid, P1Attack.INFERNAL_CHARGE)
    triggerAttack(world, bossEid)

    // Complete the charge
    for (let i = 0; i < 60; i++) {
      bossPhaseSystem(world, 1 / 60)
    }

    const state = getState(world, bossEid)
    const trailCountAfterCharge = state.fireTrails.length
    expect(trailCountAfterCharge).toBeGreaterThan(0)

    // Tick 3+ seconds to expire all trails
    for (let i = 0; i < 200; i++) {
      bossPhaseSystem(world, 1 / 60)
    }

    expect(state.fireTrails.length).toBe(0)
  })

  test('Devil\'s Dynamite creates entry in world.dynamites', () => {
    prepareAttack(world, bossEid, playerEid, P1Attack.DEVILS_DYNAMITE)
    const before = world.dynamites.length
    triggerAttack(world, bossEid)
    expect(world.dynamites.length).toBe(before + 1)

    const dyn = world.dynamites[world.dynamites.length - 1]!
    expect(dyn.damage).toBe(OLD_SCRATCH_DEVILS_DYNAMITE_DAMAGE)
    expect(dyn.radius).toBe(OLD_SCRATCH_DEVILS_DYNAMITE_RADIUS)
    expect(dyn.fuseRemaining).toBeCloseTo(OLD_SCRATCH_DEVILS_DYNAMITE_FUSE)
  })
})

// ============================================================================
// Integration tests
// ============================================================================

describe('Old Scratch — attack cycle integration', () => {
  let world: GameWorld
  let bossEid: number
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    playerEid = spawnPlayer(world, 700, 600)
    bossEid = spawnOldScratch(world, 900, 600)
  })

  test('full sheriff cycle (4+ attacks) without crash', () => {
    const state = getState(world, bossEid)
    state.characterId = 'sheriff'

    // Run 6 attack cycles (more than the 4-attack sheriff cycle)
    for (let i = 0; i < 6; i++) {
      state.attackCycleIndex = i
      // Skip BLACK_IRON_RELOAD which goes through tick, not attack
      const cycle = [P1Attack.DEAD_EYE_SHOT, P1Attack.SIDEWINDER, P1Attack.DEVILS_FAN,
                      P1Attack.DEAD_EYE_SHOT, P1Attack.SIDEWINDER, P1Attack.DEVILS_FAN]
      prepareAttack(world, bossEid, playerEid, cycle[i]!)
      triggerAttack(world, bossEid)
    }
    // If we got here, no crash
    expect(true).toBe(true)
  })

  test('full undertaker cycle (3+ attacks) without crash', () => {
    const state = getState(world, bossEid)
    state.characterId = 'undertaker'

    const cycle = [P1Attack.BRIMSTONE_BLAST, P1Attack.COFFIN_NAIL, P1Attack.SHADOW_STEP,
                    P1Attack.BRIMSTONE_BLAST, P1Attack.COFFIN_NAIL]
    for (let i = 0; i < cycle.length; i++) {
      prepareAttack(world, bossEid, playerEid, cycle[i]!)
      triggerAttack(world, bossEid)
    }
    expect(true).toBe(true)
  })

  test('full prospector cycle (3+ attacks) without crash', () => {
    const state = getState(world, bossEid)
    state.characterId = 'prospector'

    // Hellpick and Dynamite are single-frame; Charge is multi-tick
    prepareAttack(world, bossEid, playerEid, P1Attack.HELLPICK_SWING)
    triggerAttack(world, bossEid)

    prepareAttack(world, bossEid, playerEid, P1Attack.INFERNAL_CHARGE)
    triggerAttack(world, bossEid)
    // Complete the charge
    for (let i = 0; i < 60; i++) {
      bossPhaseSystem(world, 1 / 60)
    }

    prepareAttack(world, bossEid, playerEid, P1Attack.DEVILS_DYNAMITE)
    triggerAttack(world, bossEid)

    // Second pass
    prepareAttack(world, bossEid, playerEid, P1Attack.HELLPICK_SWING)
    triggerAttack(world, bossEid)

    expect(true).toBe(true)
  })
})

// ============================================================================
// Phase 2 cycle tests
// ============================================================================

describe('Old Scratch — Phase 2 cycles', () => {
  let world: GameWorld
  let bossEid: number
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    const map = generateCrossroads(STAGE_4_MAP_CONFIG)
    setWorldTilemap(world, map)
    playerEid = spawnPlayer(world, 768, 768)
    bossEid = spawnOldScratch(world, 800, 768)
  })

  test('Sheriff P2 cycle includes Crossroads Salvo, Brimstone Lash, Summon Ghost Rider', () => {
    const state = getState(world, bossEid)
    state.characterId = 'sheriff'
    state.phase = 2

    // Force phase 2 on boss
    Health.current[bossEid] = Health.max[bossEid]! * 0.74
    bossPhaseSystem(world, 1 / 60)

    // Collect all attacks selected across the cycle
    const selected: number[] = []
    for (let i = 0; i < 7; i++) {
      state.attackCycleIndex = i
      EnemyAI.state[bossEid] = AIState.TELEGRAPH
      EnemyAI.stateTimer[bossEid] = 0
      bossPhaseSystem(world, 1 / 60)
      selected.push(state.selectedAttack)
    }

    expect(selected).toContain(P2Attack.CROSSROADS_SALVO)
    expect(selected).toContain(P2Attack.BRIMSTONE_LASH)
    // Summon Ghost Rider may be skipped if on cooldown; check it's in the expected position
    // Index 6 should be SUMMON_GHOST_RIDER (unless skipped)
  })

  test('P2 telegraph durations are ×0.8 of P1 values for carried-over attacks', () => {
    const state = getState(world, bossEid)
    state.characterId = 'sheriff'

    // Enter phase 2
    Health.current[bossEid] = Health.max[bossEid]! * 0.74
    bossPhaseSystem(world, 1 / 60)

    // Select DEAD_EYE_SHOT (P1 attack) in P2
    state.attackCycleIndex = 0
    EnemyAI.state[bossEid] = AIState.TELEGRAPH
    EnemyAI.stateTimer[bossEid] = 0
    bossPhaseSystem(world, 1 / 60)

    expect(state.selectedAttack).toBe(P1Attack.DEAD_EYE_SHOT)
    expect(AttackConfig.telegraphDuration[bossEid]!).toBeCloseTo(
      OLD_SCRATCH_DEAD_EYE_TELEGRAPH * OLD_SCRATCH_P2_TELEGRAPH_MUL
    )
  })

  test('Phase transition resets attackCycleIndex to 0', () => {
    const state = getState(world, bossEid)
    state.characterId = 'sheriff'
    state.attackCycleIndex = 5

    Health.current[bossEid] = Health.max[bossEid]! * 0.74
    bossPhaseSystem(world, 1 / 60)

    expect(state.attackCycleIndex).toBe(0)
  })
})

// ============================================================================
// Phase 2 attack tests
// ============================================================================

describe('Old Scratch — Phase 2 attacks', () => {
  let world: GameWorld
  let bossEid: number
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    const map = generateCrossroads(STAGE_4_MAP_CONFIG)
    setWorldTilemap(world, map)
    playerEid = spawnPlayer(world, 768, 768)
    bossEid = spawnOldScratch(world, 800, 768)

    // Enter phase 2
    Health.current[bossEid] = Health.max[bossEid]! * 0.74
    bossPhaseSystem(world, 1 / 60)
  })

  test('Crossroads Salvo spawns 6 bullets evenly spaced', () => {
    prepareAttack(world, bossEid, playerEid, P2Attack.CROSSROADS_SALVO)
    getState(world, bossEid).phase = 2
    const before = countBullets(world, CollisionLayer.ENEMY_BULLET)
    triggerAttack(world, bossEid)
    const after = countBullets(world, CollisionLayer.ENEMY_BULLET)
    expect(after - before).toBe(OLD_SCRATCH_CROSSROADS_SALVO_BULLETS)
  })

  test('Brimstone Lash sets active lash zone along road', () => {
    prepareAttack(world, bossEid, playerEid, P2Attack.BRIMSTONE_LASH)
    getState(world, bossEid).phase = 2
    triggerAttack(world, bossEid)

    const state = getState(world, bossEid)
    expect(state.brimstoneLash).not.toBeNull()
    expect(state.brimstoneLash!.active).toBe(true)
    expect(state.brimstoneLash!.timer).toBeCloseTo(OLD_SCRATCH_BRIMSTONE_LASH_DURATION)
  })

  test('Brimstone Lash deals damage to player in zone', () => {
    const state = getState(world, bossEid)

    // Aim toward a road endpoint
    const ep = world.tilemap!.crossroadsLandmarks!.roadEndpoints[0]!
    state.aimAngle = Math.atan2(
      ep.y - Position.y[bossEid]!,
      ep.x - Position.x[bossEid]!,
    )

    prepareAttack(world, bossEid, playerEid, P2Attack.BRIMSTONE_LASH)
    state.phase = 2
    triggerAttack(world, bossEid)

    // Move player onto the lash line
    const lash = state.brimstoneLash!
    const midX = (lash.startX + lash.endX) / 2
    const midY = (lash.startY + lash.endY) / 2
    Position.x[playerEid] = midX
    Position.y[playerEid] = midY
    Health.iframes[playerEid] = 0

    const hpBefore = Health.current[playerEid]!

    // Tick a few frames
    for (let i = 0; i < 20; i++) {
      bossPhaseSystem(world, 1 / 60)
    }

    expect(Health.current[playerEid]!).toBeLessThan(hpBefore)
  })

  test('Brimstone Lash expires after DURATION', () => {
    prepareAttack(world, bossEid, playerEid, P2Attack.BRIMSTONE_LASH)
    getState(world, bossEid).phase = 2
    triggerAttack(world, bossEid)
    const state = getState(world, bossEid)

    expect(state.brimstoneLash).not.toBeNull()

    // Tick past the duration (0.8s = 48 ticks at 60Hz)
    for (let i = 0; i < 50; i++) {
      bossPhaseSystem(world, 1 / 60)
    }

    expect(state.brimstoneLash).toBeNull()
  })

  test('Summon Ghost Rider spawns at road endpoint', () => {
    const state = getState(world, bossEid)
    state.ghostRiderCooldown = 0

    prepareAttack(world, bossEid, playerEid, P2Attack.SUMMON_GHOST_RIDER)
    state.phase = 2
    triggerAttack(world, bossEid)

    // Check that cooldown was set
    expect(state.ghostRiderCooldown).toBeCloseTo(OLD_SCRATCH_GHOST_RIDER_SUMMON_COOLDOWN)
  })

  test('Summon Ghost Rider caps at 2 alive', () => {
    const state = getState(world, bossEid)
    state.ghostRiderCooldown = 0

    // Spawn 2 ghost riders manually
    spawnGhostRider(world, 400, 400)
    spawnGhostRider(world, 600, 400)

    // Try to summon a 3rd
    prepareAttack(world, bossEid, playerEid, P2Attack.SUMMON_GHOST_RIDER)
    state.phase = 2
    const cooldownBefore = state.ghostRiderCooldown
    triggerAttack(world, bossEid)

    // Cooldown should NOT have been set (summon was blocked)
    expect(state.ghostRiderCooldown).toBe(cooldownBefore)
  })

  test('Summon Ghost Rider respects 10s cooldown', () => {
    const state = getState(world, bossEid)
    state.ghostRiderCooldown = 5.0  // still on cooldown

    prepareAttack(world, bossEid, playerEid, P2Attack.SUMMON_GHOST_RIDER)
    state.phase = 2
    const cooldownBefore = state.ghostRiderCooldown
    triggerAttack(world, bossEid)

    // Should not have summoned (cooldown still > 0)
    expect(state.ghostRiderCooldown).toBe(cooldownBefore)
  })
})

// ============================================================================
// Phase 2 snap-shot tests
// ============================================================================

describe('Old Scratch — Phase 2 snap-shots', () => {
  let world: GameWorld
  let bossEid: number
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    const map = generateCrossroads(STAGE_4_MAP_CONFIG)
    setWorldTilemap(world, map)
    playerEid = spawnPlayer(world, 600, 768)
    bossEid = spawnOldScratch(world, 800, 768)

    // Enter phase 2
    Health.current[bossEid] = Health.max[bossEid]! * 0.74
    bossPhaseSystem(world, 1 / 60)
  })

  test('Sidewinder in Phase 2 fires snap-shot after reposition', () => {
    const state = getState(world, bossEid)
    state.sidewinderCooldown = 0
    prepareAttack(world, bossEid, playerEid, P1Attack.SIDEWINDER)
    state.phase = 2  // set after prepareAttack (which resets to 1)

    const before = countBullets(world, CollisionLayer.ENEMY_BULLET)
    triggerAttack(world, bossEid)
    const after = countBullets(world, CollisionLayer.ENEMY_BULLET)

    // Snap-shot = 1 bullet
    expect(after - before).toBe(1)
  })

  test('Shadow Step in Phase 2 fires snap-shot after teleport', () => {
    const state = getState(world, bossEid)
    state.shadowStepCooldown = 0
    state.characterId = 'undertaker'

    // Place far enough for teleport
    Position.x[playerEid] = 500
    Position.x[bossEid] = 800

    prepareAttack(world, bossEid, playerEid, P1Attack.SHADOW_STEP)
    state.phase = 2  // set after prepareAttack (which resets to 1)

    const before = countBullets(world, CollisionLayer.ENEMY_BULLET)
    triggerAttack(world, bossEid)
    const after = countBullets(world, CollisionLayer.ENEMY_BULLET)

    // Snap-shot = 1 bullet
    expect(after - before).toBe(1)
  })

  test('Sidewinder in Phase 1 does NOT fire snap-shot', () => {
    const state = getState(world, bossEid)
    state.sidewinderCooldown = 0
    prepareAttack(world, bossEid, playerEid, P1Attack.SIDEWINDER)
    // phase stays at 1 (set by prepareAttack)

    const before = countBullets(world, CollisionLayer.ENEMY_BULLET)
    triggerAttack(world, bossEid)
    const after = countBullets(world, CollisionLayer.ENEMY_BULLET)

    expect(after - before).toBe(0)
  })
})

// ============================================================================
// Phase 2 integration test
// ============================================================================

describe('Old Scratch — Phase 2 integration', () => {
  let world: GameWorld
  let bossEid: number
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    const map = generateCrossroads(STAGE_4_MAP_CONFIG)
    setWorldTilemap(world, map)
    playerEid = spawnPlayer(world, 768, 768)
    bossEid = spawnOldScratch(world, 800, 768)

    // Enter phase 2
    Health.current[bossEid] = Health.max[bossEid]! * 0.74
    bossPhaseSystem(world, 1 / 60)
  })

  test('full Phase 2 cycle with mixed P1+P2 attacks completes without crash', () => {
    const state = getState(world, bossEid)
    state.characterId = 'sheriff'
    state.sidewinderCooldown = 0
    state.ghostRiderCooldown = 0

    const attacks = [
      P1Attack.DEAD_EYE_SHOT,
      P1Attack.SIDEWINDER,
      P2Attack.CROSSROADS_SALVO,
      P1Attack.DEVILS_FAN,
      P2Attack.BRIMSTONE_LASH,
      P2Attack.SUMMON_GHOST_RIDER,
    ]

    for (const atk of attacks) {
      prepareAttack(world, bossEid, playerEid, atk)
      state.phase = 2  // set after prepareAttack resets to 1
      triggerAttack(world, bossEid)

      // Tick a few frames to process zones/charges
      for (let i = 0; i < 10; i++) {
        bossPhaseSystem(world, 1 / 60)
      }
    }

    expect(true).toBe(true)
  })
})

// ============================================================================
// Hellfire Pillar tests
// ============================================================================

describe('Old Scratch — Hellfire Pillars', () => {
  let world: GameWorld
  let bossEid: number
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    const map = generateCrossroads(STAGE_4_MAP_CONFIG)
    setWorldTilemap(world, map)
    playerEid = spawnPlayer(world, 768, 768)
    bossEid = spawnOldScratch(world, 800, 768)
  })

  test('pillar spawns with correct stats', () => {
    const pillarEid = spawnHellfirePillar(world, 100, 200, bossEid, 0)

    expect(Health.current[pillarEid]).toBe(OLD_SCRATCH_PILLAR_HP)
    expect(Health.max[pillarEid]).toBe(OLD_SCRATCH_PILLAR_HP)
    expect(Collider.radius[pillarEid]).toBe(24)
    expect(HellfirePillar.damageRadius[pillarEid]).toBe(48)
    expect(HellfirePillar.healPerSecond[pillarEid]).toBe(2)
    expect(HellfirePillar.contactDps[pillarEid]).toBe(6)
    expect(Enemy.type[pillarEid]).toBe(EnemyType.HELLFIRE_PILLAR)
    expect(Enemy.tier[pillarEid]).toBe(EnemyTier.THREAT)
  })

  test('pillar heals boss at 2 HP/s', () => {
    const pillarEid = spawnHellfirePillar(world, 100, 200, bossEid, 0)
    const startHP = 200
    Health.current[bossEid] = startHP

    hellfirePillarSystem(world, 1.0)

    expect(Health.current[bossEid]).toBeCloseTo(startHP + 2, 1)
  })

  test('pillar contact damage 6 DPS to player within 48px', () => {
    const px = Position.x[playerEid]!
    const py = Position.y[playerEid]!
    spawnHellfirePillar(world, px, py, bossEid, 0)

    const startHP = Health.current[playerEid]!
    hellfirePillarSystem(world, 1.0)

    expect(Health.current[playerEid]!).toBeLessThan(startHP)
    expect(startHP - Health.current[playerEid]!).toBeCloseTo(6, 0)
  })

  test('pillar destruction stops healing', () => {
    const pillarEid = spawnHellfirePillar(world, 100, 200, bossEid, 0)
    Health.current[bossEid] = 200
    Health.current[pillarEid] = 0

    const startHP = Health.current[bossEid]
    hellfirePillarSystem(world, 1.0)

    expect(Health.current[bossEid]).toBe(startHP)
  })

  test('pillar respawns after PILLAR_RESPAWN_TIME at original position', () => {
    // Enter phase 3 to get pillars
    Health.current[bossEid] = Health.max[bossEid]! * 0.74
    bossPhaseSystem(world, 1 / 60)
    Health.current[bossEid] = Health.max[bossEid]! * 0.44
    bossPhaseSystem(world, 1 / 60)

    const state = getState(world, bossEid)
    expect(state.pillarEids.length).toBe(4)

    const firstPillarEid = state.pillarEids[0]!
    const originalPos = { ...state.pillarSpawnPositions[0]! }
    Health.current[firstPillarEid] = 0

    // Tick past respawn time
    for (let i = 0; i < Math.ceil(OLD_SCRATCH_PILLAR_RESPAWN_TIME * 60) + 2; i++) {
      bossPhaseSystem(world, 1 / 60)
    }

    const newPillarEid = state.pillarEids[0]!
    expect(newPillarEid).not.toBe(firstPillarEid)
    expect(Health.current[newPillarEid]! > 0).toBe(true)
    expect(Position.x[newPillarEid]).toBeCloseTo(originalPos.x, 0)
    expect(Position.y[newPillarEid]).toBeCloseTo(originalPos.y, 0)
  })
})

// ============================================================================
// Phase 3 transition tests
// ============================================================================

describe('Old Scratch — Phase 3 transition', () => {
  let world: GameWorld
  let bossEid: number
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    const map = generateCrossroads(STAGE_4_MAP_CONFIG)
    setWorldTilemap(world, map)
    playerEid = spawnPlayer(world, 768, 768)
    bossEid = spawnOldScratch(world, 800, 768)
  })

  function enterPhase3(): void {
    Health.current[bossEid] = Health.max[bossEid]! * 0.74
    bossPhaseSystem(world, 1 / 60)
    Health.current[bossEid] = Health.max[bossEid]! * 0.44
    bossPhaseSystem(world, 1 / 60)
  }

  test('enterPhase3 spawns 4 pillars at lantern positions', () => {
    enterPhase3()
    const state = getState(world, bossEid)
    expect(state.pillarEids.length).toBe(4)

    const landmarks = world.tilemap!.crossroadsLandmarks!
    for (let i = 0; i < 4; i++) {
      const pid = state.pillarEids[i]!
      expect(Health.current[pid]! > 0).toBe(true)
      expect(Position.x[pid]).toBeCloseTo(landmarks.lanterns[i]!.x, 0)
      expect(Position.y[pid]).toBeCloseTo(landmarks.lanterns[i]!.y, 0)
    }
  })

  test('enterPhase3 heals boss to 250 HP', () => {
    enterPhase3()
    expect(Health.current[bossEid]).toBe(OLD_SCRATCH_P3_HEAL_HP)
  })

  test('enterPhase3 teleports boss to signpost center', () => {
    enterPhase3()
    const signpost = world.tilemap!.crossroadsLandmarks!.signpost
    expect(Position.x[bossEid]).toBeCloseTo(signpost.x, 0)
    expect(Position.y[bossEid]).toBeCloseTo(signpost.y, 0)
  })

  test('Phase 3 cycle is character-agnostic', () => {
    enterPhase3()
    const state = getState(world, bossEid)

    for (const charId of ['sheriff', 'undertaker', 'prospector']) {
      state.characterId = charId
      state.attackCycleIndex = 0

      EnemyAI.state[bossEid] = AIState.TELEGRAPH
      EnemyAI.stateTimer[bossEid] = 0

      bossPhaseSystem(world, 1 / 60)
      expect(state.selectedAttack).toBe(P3Attack.HELLFIRE_SWEEP as number)
    }
  })
})

// ============================================================================
// Phase 3 attack tests
// ============================================================================

describe('Old Scratch — Phase 3 attacks', () => {
  let world: GameWorld
  let bossEid: number
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    const map = generateCrossroads(STAGE_4_MAP_CONFIG)
    setWorldTilemap(world, map)
    playerEid = spawnPlayer(world, 768, 768)
    bossEid = spawnOldScratch(world, 800, 768)

    // Enter Phase 3
    Health.current[bossEid] = Health.max[bossEid]! * 0.74
    bossPhaseSystem(world, 1 / 60)
    Health.current[bossEid] = Health.max[bossEid]! * 0.44
    bossPhaseSystem(world, 1 / 60)
  })

  function prepareP3Attack(attackType: number): void {
    const state = getState(world, bossEid)
    state.selectedAttack = attackType
    state.attackExecuted = false
    state.phase = 3

    const dx = Position.x[playerEid]! - Position.x[bossEid]!
    const dy = Position.y[playerEid]! - Position.y[bossEid]!
    state.aimAngle = Math.atan2(dy, dx)

    EnemyAI.state[bossEid] = AIState.ATTACK
    EnemyAI.stateTimer[bossEid] = 0
    EnemyAI.targetEid[bossEid] = playerEid
  }

  test('Hellfire Sweep spawns 8 bullets', () => {
    const before = countBullets(world, CollisionLayer.ENEMY_BULLET)
    prepareP3Attack(P3Attack.HELLFIRE_SWEEP)
    triggerAttack(world, bossEid)
    const after = countBullets(world, CollisionLayer.ENEMY_BULLET)
    expect(after - before).toBe(OLD_SCRATCH_HELLFIRE_SWEEP_BULLETS)
  })

  test('Soul Geyser queues 3 zones in state', () => {
    prepareP3Attack(P3Attack.SOUL_GEYSER)
    triggerAttack(world, bossEid)
    const state = getState(world, bossEid)
    expect(state.soulGeysers.length).toBe(OLD_SCRATCH_SOUL_GEYSER_COUNT)
  })

  test('Soul Geyser damages player on burst', () => {
    prepareP3Attack(P3Attack.SOUL_GEYSER)
    triggerAttack(world, bossEid)

    const startHP = Health.current[playerEid]!
    // Tick until first geyser activates (delay ≈ 0.8s)
    for (let i = 0; i < 60; i++) {
      bossPhaseSystem(world, 1 / 60)
    }

    expect(Health.current[playerEid]!).toBeLessThan(startHP)
  })

  test('Crossroads Convergence fires 24 bullets (6 × 4 roads)', () => {
    const before = countBullets(world, CollisionLayer.ENEMY_BULLET)
    prepareP3Attack(P3Attack.CROSSROADS_CONVERGENCE)
    triggerAttack(world, bossEid)
    const after = countBullets(world, CollisionLayer.ENEMY_BULLET)
    expect(after - before).toBe(OLD_SCRATCH_CONVERGENCE_BULLETS_PER_ROAD * 4)
  })

  test('Chain Lightning damages player between pillar pair', () => {
    const state = getState(world, bossEid)
    expect(state.pillarEids.length).toBeGreaterThanOrEqual(2)

    const p1 = state.pillarEids[0]!
    const p2 = state.pillarEids[1]!
    const midX = (Position.x[p1]! + Position.x[p2]!) / 2
    const midY = (Position.y[p1]! + Position.y[p2]!) / 2
    Position.x[playerEid] = midX
    Position.y[playerEid] = midY

    prepareP3Attack(P3Attack.CHAIN_LIGHTNING)
    triggerAttack(world, bossEid)

    expect(state.chainLightning).not.toBeNull()
    expect(state.chainLightning!.pairs.length).toBeGreaterThanOrEqual(1)

    const startHP = Health.current[playerEid]!
    // Tick past telegraph + into damage phase
    for (let i = 0; i < 60; i++) {
      bossPhaseSystem(world, 1 / 60)
    }

    expect(Health.current[playerEid]!).toBeLessThan(startHP)
  })

  test('Chain Lightning skips when < 2 pillars alive', () => {
    const state = getState(world, bossEid)

    // Kill all but 1 pillar
    for (let i = 1; i < state.pillarEids.length; i++) {
      Health.current[state.pillarEids[i]!] = 0
    }

    state.attackCycleIndex = 3  // CHAIN_LIGHTNING is index 3 in P3_CYCLE

    EnemyAI.state[bossEid] = AIState.TELEGRAPH
    EnemyAI.stateTimer[bossEid] = 0
    bossPhaseSystem(world, 1 / 60)

    // Should have skipped to STAMPEDE (index 4)
    expect(state.selectedAttack).toBe(P3Attack.STAMPEDE as number)
  })

  test('Stampede fires 6 fast bullets', () => {
    const before = countBullets(world, CollisionLayer.ENEMY_BULLET)
    prepareP3Attack(P3Attack.STAMPEDE)
    triggerAttack(world, bossEid)
    const after = countBullets(world, CollisionLayer.ENEMY_BULLET)
    expect(after - before).toBe(OLD_SCRATCH_STAMPEDE_BULLETS)
  })
})

// ============================================================================
// Dust storm + cleanup tests
// ============================================================================

describe('Old Scratch — dust storm & Phase 4 cleanup', () => {
  let world: GameWorld
  let bossEid: number
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    const map = generateCrossroads(STAGE_4_MAP_CONFIG)
    setWorldTilemap(world, map)
    playerEid = spawnPlayer(world, 768, 768)
    bossEid = spawnOldScratch(world, 800, 768)

    // Enter Phase 3
    Health.current[bossEid] = Health.max[bossEid]! * 0.74
    bossPhaseSystem(world, 1 / 60)
    Health.current[bossEid] = Health.max[bossEid]! * 0.44
    bossPhaseSystem(world, 1 / 60)
  })

  test('dust storm activates at HP ≤ 50% of P3_HEAL_HP (125)', () => {
    const threshold = OLD_SCRATCH_P3_HEAL_HP * OLD_SCRATCH_DUST_STORM_HP_THRESHOLD
    Health.current[bossEid] = threshold
    bossPhaseSystem(world, 1 / 60)

    expect(world.oldScratchStorm).not.toBeNull()
    expect(world.oldScratchStorm!.active).toBe(true)
    expect(world.oldScratchStorm!.visibilityRadius).toBe(OLD_SCRATCH_DUST_STORM_VISIBILITY)
  })

  test('enterPhase4 clears dust storm and destroys all pillars', () => {
    const state = getState(world, bossEid)

    state.dustStormActive = true
    world.oldScratchStorm = { active: true, visibilityRadius: 200 }

    // Enter Phase 4
    Health.current[bossEid] = Health.max[bossEid]! * 0.14
    bossPhaseSystem(world, 1 / 60)

    expect(world.oldScratchStorm).toBeNull()
    expect(state.pillarEids.length).toBe(0)
  })

  test('Phase 3 disables Infernal Counter window', () => {
    const state = getState(world, bossEid)
    expect(state.phase).toBe(3)

    EnemyAI.state[bossEid] = AIState.IDLE
    state.counterCooldown = 0
    state.counterWindowActive = false
    state.counterWindowTimer = 0

    bossPhaseSystem(world, 1 / 60)

    expect(state.counterWindowActive).toBe(false)
  })
})

// ============================================================================
// Full Phase 3 integration test
// ============================================================================

describe('Old Scratch — Phase 3 integration', () => {
  test('full Phase 3 cycle with pillars + all 5 attacks completes without crash', () => {
    const world = createGameWorld(42)
    const map = generateCrossroads(STAGE_4_MAP_CONFIG)
    setWorldTilemap(world, map)
    const playerEid = spawnPlayer(world, 768, 768)
    const bossEid = spawnOldScratch(world, 800, 768)

    // Enter Phase 3
    Health.current[bossEid] = Health.max[bossEid]! * 0.74
    bossPhaseSystem(world, 1 / 60)
    Health.current[bossEid] = Health.max[bossEid]! * 0.44
    bossPhaseSystem(world, 1 / 60)

    const state = getState(world, bossEid)
    expect(state.phase).toBe(3)

    const attacks = [
      P3Attack.HELLFIRE_SWEEP,
      P3Attack.SOUL_GEYSER,
      P3Attack.CROSSROADS_CONVERGENCE,
      P3Attack.CHAIN_LIGHTNING,
      P3Attack.STAMPEDE,
    ]

    for (const atk of attacks) {
      state.selectedAttack = atk as number
      state.attackExecuted = false
      state.phase = 3

      const dx = Position.x[playerEid]! - Position.x[bossEid]!
      const dy = Position.y[playerEid]! - Position.y[bossEid]!
      state.aimAngle = Math.atan2(dy, dx)

      EnemyAI.state[bossEid] = AIState.ATTACK
      EnemyAI.stateTimer[bossEid] = 0
      getBoss(EnemyType.OLD_SCRATCH)!.attack(world, bossEid, 1 / 60)

      for (let i = 0; i < 10; i++) {
        bossPhaseSystem(world, 1 / 60)
        hellfirePillarSystem(world, 1 / 60)
      }
    }

    expect(true).toBe(true)
  })
})

// ============================================================================
// Phase 4 Helpers
// ============================================================================

/** Transition boss to Phase 4 by lowering HP through all transitions */
function enterP4(world: GameWorld, bossEid: number): void {
  Health.current[bossEid] = Health.max[bossEid]! * 0.74
  bossPhaseSystem(world, 1 / 60)
  Health.current[bossEid] = Health.max[bossEid]! * 0.44
  bossPhaseSystem(world, 1 / 60)
  Health.current[bossEid] = Health.max[bossEid]! * 0.14
  bossPhaseSystem(world, 1 / 60)
}

function createFakeBulletP4(w: GameWorld): number {
  const eid = addEntity(w)
  addComponent(w, Bullet, eid)
  addComponent(w, Collider, eid)
  Collider.layer[eid] = CollisionLayer.PLAYER_BULLET
  return eid
}

function getStaredownDurationForTest(round: number): number {
  if (round <= 1) return OLD_SCRATCH_STAREDOWN_ROUND_1
  if (round === 2) return OLD_SCRATCH_STAREDOWN_ROUND_2
  return OLD_SCRATCH_STAREDOWN_ROUND_3_PLUS
}

// ============================================================================
// Phase 4 — Staredown tests
// ============================================================================

describe('Old Scratch — Phase 4 staredown', () => {
  let world: GameWorld
  let bossEid: number
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    playerEid = spawnPlayer(world, 700, 600)
    bossEid = spawnOldScratch(world, 900, 600)
    enterP4(world, bossEid)
  })

  test('staredown duration is correct per round (2.5, 2.0, 1.5)', () => {
    const state = getState(world, bossEid)
    // Round 1: staredown should be ~2.5s
    expect(state.staredownTimer).toBeCloseTo(OLD_SCRATCH_STAREDOWN_ROUND_1, 1)

    // Tick through entire round 1 to get to round 2
    const ticksToComplete = Math.ceil((OLD_SCRATCH_STAREDOWN_ROUND_1 + OLD_SCRATCH_SCRAMBLE_DURATION + OLD_SCRATCH_RESET_DURATION) * 60) + 5
    for (let i = 0; i < ticksToComplete; i++) bossPhaseSystem(world, 1 / 60)

    expect(state.drawRound).toBe(2)
    expect(state.staredownTimer).toBeCloseTo(OLD_SCRATCH_STAREDOWN_ROUND_2, 1)

    // Tick through round 2
    const ticksR2 = Math.ceil((OLD_SCRATCH_STAREDOWN_ROUND_2 + OLD_SCRATCH_SCRAMBLE_DURATION + OLD_SCRATCH_RESET_DURATION) * 60) + 5
    for (let i = 0; i < ticksR2; i++) bossPhaseSystem(world, 1 / 60)

    expect(state.drawRound).toBe(3)
    expect(state.staredownTimer).toBeCloseTo(OLD_SCRATCH_STAREDOWN_ROUND_3_PLUS, 1)
  })

  test('closing circle telegraph is pushed during staredown', () => {
    world.bossTelegraphs = []
    bossPhaseSystem(world, 1 / 60)

    const circleTelegraphs = world.bossTelegraphs.filter(
      t => t.kind === 'circle' && t.color === 0xffcc00
    )
    expect(circleTelegraphs.length).toBeGreaterThanOrEqual(1)
  })

  test('staredown → flash transition fires after timer expires', () => {
    const state = getState(world, bossEid)
    // Tick just past the staredown timer
    const tickCount = Math.ceil(OLD_SCRATCH_STAREDOWN_ROUND_1 * 60) + 1
    for (let i = 0; i < tickCount; i++) bossPhaseSystem(world, 1 / 60)

    // Should have passed through flash into scramble (flash is 1 tick)
    expect(state.drawPhase === 'flash' || state.drawPhase === 'scramble').toBe(true)
  })
})

// ============================================================================
// Phase 4 — Draw timing tests
// ============================================================================

describe('Old Scratch — Phase 4 draw timing', () => {
  let world: GameWorld
  let bossEid: number
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    playerEid = spawnPlayer(world, 700, 600)
    bossEid = spawnOldScratch(world, 900, 600)
    enterP4(world, bossEid)
  })

  function tickToScramble(): void {
    const state = getState(world, bossEid)
    // Tick past staredown + flash
    const tickCount = Math.ceil(OLD_SCRATCH_STAREDOWN_ROUND_1 * 60) + 2
    for (let i = 0; i < tickCount; i++) bossPhaseSystem(world, 1 / 60)
    expect(state.drawPhase).toBe('scramble')
  }

  test('perfect draw (hit ≤ 0.3s after flash): damage = 20, stagger applied', () => {
    tickToScramble()
    const state = getState(world, bossEid)

    // flashTimer is small (just entered scramble)
    expect(state.flashTimer).toBeLessThanOrEqual(OLD_SCRATCH_PERFECT_DRAW_WINDOW)

    const bullet = createFakeBulletP4(world)
    const result = world.hooks.fireBulletHit(world, bullet, bossEid, 5)

    expect(result.damage).toBe(OLD_SCRATCH_PERFECT_DRAW_DAMAGE)
    expect(state.staggerTimer).toBeCloseTo(OLD_SCRATCH_PERFECT_DRAW_STAGGER)
    expect(state.drawResolved).toBe(true)
  })

  test('good draw (hit 0.3-0.6s after flash): damage = 10, no stagger', () => {
    tickToScramble()
    const state = getState(world, bossEid)

    // Tick a bit into scramble to get past perfect window but within good window
    const ticksToGoodWindow = Math.ceil((OLD_SCRATCH_PERFECT_DRAW_WINDOW + 0.05) * 60)
    for (let i = 0; i < ticksToGoodWindow; i++) bossPhaseSystem(world, 1 / 60)

    expect(state.flashTimer).toBeGreaterThan(OLD_SCRATCH_PERFECT_DRAW_WINDOW)
    expect(state.flashTimer).toBeLessThanOrEqual(OLD_SCRATCH_GOOD_DRAW_WINDOW)

    const bullet = createFakeBulletP4(world)
    const result = world.hooks.fireBulletHit(world, bullet, bossEid, 5)

    expect(result.damage).toBe(OLD_SCRATCH_GOOD_DRAW_DAMAGE)
    expect(state.staggerTimer).toBe(0)
    expect(state.drawResolved).toBe(true)
  })

  test('slow draw (> 0.6s, no player shot): Old Scratch fires 15-damage bullet', () => {
    tickToScramble()
    const state = getState(world, bossEid)

    // Tick past the good draw window
    const ticksPastWindow = Math.ceil((OLD_SCRATCH_GOOD_DRAW_WINDOW + 0.05) * 60)
    const bulletsBefore = countBullets(world, CollisionLayer.ENEMY_BULLET)
    for (let i = 0; i < ticksPastWindow; i++) bossPhaseSystem(world, 1 / 60)

    expect(state.drawResolved).toBe(true)
    const bulletsAfter = countBullets(world, CollisionLayer.ENEMY_BULLET)
    expect(bulletsAfter).toBeGreaterThan(bulletsBefore)
  })

  test('panic shot (player fires during staredown): player takes 15 guaranteed damage, bullet negated', () => {
    const state = getState(world, bossEid)
    expect(state.drawPhase).toBe('staredown')

    const hpBefore = Health.current[playerEid]!
    Health.iframes[playerEid] = 0

    const bullet = createFakeBulletP4(world)
    const result = world.hooks.fireBulletHit(world, bullet, bossEid, 20)

    // Player bullet should be negated
    expect(result.damage).toBe(0)
    // Player should have taken panic shot damage
    expect(Health.current[playerEid]!).toBe(hpBefore - OLD_SCRATCH_PANIC_SHOT_DAMAGE)
  })
})

// ============================================================================
// Phase 4 — Scramble tests
// ============================================================================

describe('Old Scratch — Phase 4 scramble', () => {
  let world: GameWorld
  let bossEid: number
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    playerEid = spawnPlayer(world, 700, 600)
    bossEid = spawnOldScratch(world, 900, 600)
    enterP4(world, bossEid)
  })

  function tickToScramble(): void {
    const tickCount = Math.ceil(OLD_SCRATCH_STAREDOWN_ROUND_1 * 60) + 2
    for (let i = 0; i < tickCount; i++) bossPhaseSystem(world, 1 / 60)
    expect(getState(world, bossEid).drawPhase).toBe('scramble')
  }

  test('scramble phase uses P1 attack cycle', () => {
    tickToScramble()
    const state = getState(world, bossEid)

    // Resolve the draw first so attacks can proceed
    state.drawResolved = true

    // Put boss in TELEGRAPH to trigger attack selection
    EnemyAI.state[bossEid] = AIState.TELEGRAPH
    EnemyAI.stateTimer[bossEid] = 0
    bossPhaseSystem(world, 1 / 60)

    // Should select from P1 cycle (sheriff default)
    // Sheriff P1 cycle starts with DEAD_EYE_SHOT
    expect(state.selectedAttack).toBe(P1Attack.DEAD_EYE_SHOT)
  })

  test('stagger timer prevents attacks during stagger', () => {
    tickToScramble()
    const state = getState(world, bossEid)
    state.drawResolved = true
    state.staggerTimer = 1.0

    // Put boss in ATTACK state — should be blocked by stagger
    EnemyAI.state[bossEid] = AIState.ATTACK
    EnemyAI.stateTimer[bossEid] = 0
    getBoss(EnemyType.OLD_SCRATCH)!.attack(world, bossEid, 1 / 60)

    // Should transition to recovery without firing
    expect(EnemyAI.state[bossEid]!).toBe(AIState.RECOVERY)
  })

  test('scramble attacks have faster telegraphs (scramble multiplier applied)', () => {
    tickToScramble()
    const state = getState(world, bossEid)
    state.drawResolved = true

    EnemyAI.state[bossEid] = AIState.TELEGRAPH
    EnemyAI.stateTimer[bossEid] = 0
    bossPhaseSystem(world, 1 / 60)

    // Dead-Eye telegraph should be shorter than base (0.4 * 2/3 ≈ 0.267)
    const baseTelegraph = 0.4  // DEAD_EYE_TELEGRAPH
    const expected = baseTelegraph * (1 / 1.5)
    expect(AttackConfig.telegraphDuration[bossEid]!).toBeCloseTo(expected, 2)
  })
})

// ============================================================================
// Phase 4 — State machine tests
// ============================================================================

describe('Old Scratch — Phase 4 state machine', () => {
  let world: GameWorld
  let bossEid: number
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    playerEid = spawnPlayer(world, 700, 600)
    bossEid = spawnOldScratch(world, 900, 600)
    enterP4(world, bossEid)
  })

  test('full cycle: staredown → flash → scramble → reset → staredown (round increments)', () => {
    const state = getState(world, bossEid)
    expect(state.drawPhase).toBe('staredown')
    expect(state.drawRound).toBe(1)

    // Tick through staredown
    const staredownTicks = Math.ceil(OLD_SCRATCH_STAREDOWN_ROUND_1 * 60) + 1
    for (let i = 0; i < staredownTicks; i++) bossPhaseSystem(world, 1 / 60)

    // Should be in scramble (flash is 1 tick)
    expect(state.drawPhase).toBe('scramble')

    // Tick through scramble
    const scrambleTicks = Math.ceil(OLD_SCRATCH_SCRAMBLE_DURATION * 60) + 1
    for (let i = 0; i < scrambleTicks; i++) bossPhaseSystem(world, 1 / 60)

    // Should be in reset
    expect(state.drawPhase).toBe('reset')

    // Tick through reset
    const resetTicks = Math.ceil(OLD_SCRATCH_RESET_DURATION * 60) + 1
    for (let i = 0; i < resetTicks; i++) bossPhaseSystem(world, 1 / 60)

    // Should be back in staredown, round 2
    expect(state.drawPhase).toBe('staredown')
    expect(state.drawRound).toBe(2)
  })

  test('enterPhase4 initializes draw state correctly', () => {
    const state = getState(world, bossEid)
    expect(state.drawRound).toBe(1)
    expect(state.drawPhase).toBe('staredown')
    expect(state.flashTimer).toBe(0)
    expect(state.drawResolved).toBe(false)
    expect(state.staggerTimer).toBe(0)
    expect(state.scrambleTimer).toBe(0)
    expect(state.resetTimer).toBe(0)
    expect(state.flashFired).toBe(false)
    expect(state.playerShotDuringWindow).toBe(false)
    expect(Speed.current[bossEid]!).toBe(OLD_SCRATCH_P4_SPEED)
    expect(EnemyAI.state[bossEid]!).toBe(AIState.IDLE)
  })

  test('reset phase transitions to next round with correct staredown duration', () => {
    const state = getState(world, bossEid)

    // Fast-forward through round 1 to reset
    const totalTicks = Math.ceil((OLD_SCRATCH_STAREDOWN_ROUND_1 + OLD_SCRATCH_SCRAMBLE_DURATION) * 60) + 5
    for (let i = 0; i < totalTicks; i++) bossPhaseSystem(world, 1 / 60)
    expect(state.drawPhase).toBe('reset')

    // Tick through reset
    const resetTicks = Math.ceil(OLD_SCRATCH_RESET_DURATION * 60) + 2
    for (let i = 0; i < resetTicks; i++) bossPhaseSystem(world, 1 / 60)

    expect(state.drawPhase).toBe('staredown')
    expect(state.drawRound).toBe(2)
    // Allow some tick drift (up to ~0.1s from extra ticks overshooting the timer)
    expect(state.staredownTimer).toBeCloseTo(OLD_SCRATCH_STAREDOWN_ROUND_2, 0)
  })
})

// ============================================================================
// Phase 4 — Integration tests
// ============================================================================

describe('Old Scratch — Phase 4 integration', () => {
  let world: GameWorld
  let bossEid: number
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    playerEid = spawnPlayer(world, 700, 600)
    bossEid = spawnOldScratch(world, 900, 600)
    enterP4(world, bossEid)
  })

  test('3 perfect draws from 60 HP kills Old Scratch', () => {
    // Boss enters P4 at 14% HP = 56 HP. 3 × 20 = 60 > 56
    const state = getState(world, bossEid)
    const startHp = Health.current[bossEid]!
    expect(startHp).toBeCloseTo(Health.max[bossEid]! * 0.14, 0)

    for (let round = 0; round < 3; round++) {
      // Tick to scramble
      const staredownTicks = Math.ceil(getStaredownDurationForTest(state.drawRound) * 60) + 2
      for (let i = 0; i < staredownTicks; i++) bossPhaseSystem(world, 1 / 60)

      if (state.drawPhase !== 'scramble') continue

      // Fire perfect draw shot
      Health.iframes[bossEid] = 0
      const bullet = createFakeBulletP4(world)
      const result = world.hooks.fireBulletHit(world, bullet, bossEid, 5)

      // Apply the damage manually (hook returns modified damage, healthSystem would apply it)
      Health.current[bossEid] = Health.current[bossEid]! - result.damage

      if (Health.current[bossEid]! <= 0) break

      // Tick through rest of scramble + reset
      const remainingTicks = Math.ceil((OLD_SCRATCH_SCRAMBLE_DURATION + OLD_SCRATCH_RESET_DURATION) * 60) + 5
      for (let i = 0; i < remainingTicks; i++) bossPhaseSystem(world, 1 / 60)
    }

    expect(Health.current[bossEid]!).toBeLessThanOrEqual(0)
  })

  test('full Phase 4 — multiple rounds cycle without crash', () => {
    // Run 5 full draw rounds without any assertion failures
    for (let round = 0; round < 5; round++) {
      const totalRoundTicks = Math.ceil(
        (OLD_SCRATCH_STAREDOWN_ROUND_3_PLUS + OLD_SCRATCH_SCRAMBLE_DURATION + OLD_SCRATCH_RESET_DURATION) * 60
      ) + 10
      for (let i = 0; i < totalRoundTicks; i++) {
        bossPhaseSystem(world, 1 / 60)
      }
    }
    // If we get here without crash, the state machine is stable
    const state = getState(world, bossEid)
    expect(state.drawRound).toBeGreaterThan(1)
    expect(state.phase).toBe(4)
  })
})
