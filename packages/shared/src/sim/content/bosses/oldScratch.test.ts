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
  EnemyType, EnemyTier, Health, Speed, Position,
  Bullet, Collider, Player, Dead,
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
} from './oldScratch'
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
