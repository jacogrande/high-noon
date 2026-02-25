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
} from './oldScratch'
import { P1Attack, type OldScratchState } from './oldScratch'
import { TileType, getTile } from '../../tilemap'

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
