import { describe, expect, test, beforeEach } from 'bun:test'
import { defineQuery, hasComponent } from 'bitecs'
import { createGameWorld, setWorldTilemap, type GameWorld } from '../../world'
import { createTestArena } from '../maps/testArena'
import { spawnPlayer } from '../../prefabs'
import { getBoss } from './registry'
import { bossPhaseSystem } from '../../systems/bossPhase'
import {
  Enemy, EnemyAI, AIState, AttackConfig, BossPhase, EnemyType, EnemyTier,
  Health, Speed, Position, Collider, Bullet, Velocity, Dead,
} from '../../components'
import {
  COYOTE_JANE_HP,
  COYOTE_JANE_P1_SPEED,
  COYOTE_JANE_P2_SPEED,
  COYOTE_JANE_P3_SPEED,
  COYOTE_JANE_P1_COOLDOWN,
  COYOTE_JANE_P2_COOLDOWN,
  COYOTE_JANE_P3_COOLDOWN,
  COYOTE_JANE_TRANSITION_IFRAMES,
  COYOTE_JANE_BEAR_TRAP_COOLDOWN,
  COYOTE_JANE_P3_SUMMON_COYOTES,
  COYOTE_JANE_RIFLE_DAMAGE,
  COYOTE_JANE_HIP_DAMAGE,
  COYOTE_JANE_P3_TELEGRAPH,
  COYOTE_JANE_P3_RECOVERY,
  COYOTE_JANE_DASH_SPEED,
  COYOTE_JANE_P1_REPOSITION_COOLDOWN,
  COYOTE_JANE_P2_REPOSITION_COOLDOWN,
  COYOTE_JANE_WHISTLE_INITIAL_COOLDOWN,
  COYOTE_JANE_WHISTLE_SUMMON_COUNT,
  COYOTE_JANE_CALTROP_COOLDOWN,
} from './coyoteJane'

const enemyQuery = defineQuery([Enemy])
const bulletQuery = defineQuery([Bullet])

function countByType(world: GameWorld): Record<number, number> {
  const counts: Record<number, number> = {}
  for (const eid of enemyQuery(world)) {
    const type = Enemy.type[eid]!
    counts[type] = (counts[type] ?? 0) + 1
  }
  return counts
}

function spawnJane(world: GameWorld, x: number, y: number): number {
  return getBoss(EnemyType.COYOTE_JANE)!.spawn(world, x, y)
}

describe('Coyote Jane (bossPhaseSystem)', () => {
  let world: GameWorld
  let janeEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    spawnPlayer(world, 800, 600)
    janeEid = spawnJane(world, 900, 600)
  })

  test('spawns with phase 1 and correct stats', () => {
    expect(BossPhase.phase[janeEid]!).toBe(1)
    expect(Health.current[janeEid]!).toBe(COYOTE_JANE_HP)
    expect(Health.max[janeEid]!).toBe(COYOTE_JANE_HP)
    expect(Speed.current[janeEid]!).toBe(COYOTE_JANE_P1_SPEED)
    expect(Speed.max[janeEid]!).toBe(COYOTE_JANE_P1_SPEED)
    expect(AttackConfig.cooldown[janeEid]!).toBeCloseTo(COYOTE_JANE_P1_COOLDOWN)
    expect(Enemy.type[janeEid]!).toBe(EnemyType.COYOTE_JANE)
    expect(Enemy.tier[janeEid]!).toBe(EnemyTier.THREAT)
  })

  test('phase 2 transition at HP <= 70%: speed increases, cooldown decreases, i-frames granted', () => {
    Health.current[janeEid] = Health.max[janeEid]! * 0.69

    bossPhaseSystem(world, 1 / 60)

    expect(BossPhase.phase[janeEid]!).toBe(2)
    expect(Speed.current[janeEid]!).toBe(COYOTE_JANE_P2_SPEED)
    expect(Speed.max[janeEid]!).toBe(COYOTE_JANE_P2_SPEED)
    expect(AttackConfig.cooldown[janeEid]!).toBeCloseTo(COYOTE_JANE_P2_COOLDOWN)
    expect(Health.iframes[janeEid]!).toBeCloseTo(COYOTE_JANE_TRANSITION_IFRAMES)
    expect(AttackConfig.cooldownRemaining[janeEid]!).toBe(0)
    expect(EnemyAI.state[janeEid]!).toBe(AIState.TELEGRAPH)
  })

  test('phase 3 transition at HP <= 35%: spawns coyotes, i-frames granted', () => {
    // Enter phase 2 first
    Health.current[janeEid] = Health.max[janeEid]! * 0.69
    bossPhaseSystem(world, 1 / 60)

    // Enter phase 3
    Health.current[janeEid] = Health.max[janeEid]! * 0.34
    bossPhaseSystem(world, 1 / 60)

    expect(BossPhase.phase[janeEid]!).toBe(3)
    expect(Speed.current[janeEid]!).toBe(COYOTE_JANE_P3_SPEED)
    expect(Speed.max[janeEid]!).toBe(COYOTE_JANE_P3_SPEED)
    expect(AttackConfig.cooldown[janeEid]!).toBeCloseTo(COYOTE_JANE_P3_COOLDOWN)
    expect(Health.iframes[janeEid]!).toBeCloseTo(COYOTE_JANE_TRANSITION_IFRAMES)
    expect(EnemyAI.state[janeEid]!).toBe(AIState.TELEGRAPH)

    const counts = countByType(world)
    // P3 spawns coyotes, not swarmers
    expect(counts[EnemyType.COYOTE] ?? 0).toBe(COYOTE_JANE_P3_SUMMON_COYOTES)
    expect(counts[EnemyType.SWARMER] ?? 0).toBe(0)
  })

  test('large HP drop (phase 1 → phase 3) triggers both transitions', () => {
    Health.current[janeEid] = Health.max[janeEid]! * 0.20

    bossPhaseSystem(world, 1 / 60)

    expect(BossPhase.phase[janeEid]!).toBe(3)
    expect(Speed.current[janeEid]!).toBe(COYOTE_JANE_P3_SPEED)
    const counts = countByType(world)
    expect(counts[EnemyType.COYOTE] ?? 0).toBe(COYOTE_JANE_P3_SUMMON_COYOTES)
  })

  test('re-running in same phase does not re-trigger transitions', () => {
    Health.current[janeEid] = Health.max[janeEid]! * 0.34
    bossPhaseSystem(world, 1 / 60)

    const countsAfterFirst = countByType(world)
    const coyotesFirst = countsAfterFirst[EnemyType.COYOTE] ?? 0

    bossPhaseSystem(world, 1 / 60)

    const countsAfterSecond = countByType(world)
    expect(countsAfterSecond[EnemyType.COYOTE] ?? 0).toBe(coyotesFirst)
  })

  test('bear trap placed during CHASE state after cooldown', () => {
    // Force into CHASE state
    EnemyAI.state[janeEid] = AIState.CHASE
    EnemyAI.stateTimer[janeEid] = 0

    expect(world.trapZones.length).toBe(0)

    // Tick enough to pass the initial trap cooldown (2.0s default)
    const mod = getBoss(EnemyType.COYOTE_JANE)!
    for (let i = 0; i < 130; i++) {
      mod.tick(world, janeEid, 1 / 60)
    }

    // Should have placed at least one bear trap
    const bearTraps = world.trapZones.filter(t => t.kind === 'bearTrap')
    expect(bearTraps.length).toBeGreaterThanOrEqual(1)
  })

  test('bear traps NOT placed in Phase 3', () => {
    // Enter P3
    Health.current[janeEid] = Health.max[janeEid]! * 0.20
    bossPhaseSystem(world, 1 / 60)

    // Clear any traps from earlier
    world.trapZones.length = 0

    EnemyAI.state[janeEid] = AIState.CHASE
    EnemyAI.stateTimer[janeEid] = 0

    const mod = getBoss(EnemyType.COYOTE_JANE)!
    for (let i = 0; i < 300; i++) {
      mod.tick(world, janeEid, 1 / 60)
    }

    const bearTraps = world.trapZones.filter(t => t.kind === 'bearTrap')
    expect(bearTraps.length).toBe(0)
  })

  test('rifle shot telegraph produces line telegraph', () => {
    // Force telegraph state
    EnemyAI.state[janeEid] = AIState.TELEGRAPH
    EnemyAI.stateTimer[janeEid] = 0
    EnemyAI.targetEid[janeEid] = spawnPlayer(world, 800, 600)

    const mod = getBoss(EnemyType.COYOTE_JANE)!
    mod.tick(world, janeEid, 1 / 60)

    const lineTelegraphs = world.bossTelegraphs.filter(t => t.kind === 'line')
    expect(lineTelegraphs.length).toBe(1)
  })

  test('P3 telegraph and recovery match design doc values', () => {
    expect(COYOTE_JANE_P3_TELEGRAPH).toBe(0.30)
    expect(COYOTE_JANE_P3_RECOVERY).toBe(0.50)
  })
})

describe('Coyote Jane (attack execution)', () => {
  let world: GameWorld
  let janeEid: number
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    playerEid = spawnPlayer(world, 800, 600)
    janeEid = spawnJane(world, 900, 600)
  })

  function setupAttackState(selectedAttack: number): void {
    EnemyAI.state[janeEid] = AIState.ATTACK
    EnemyAI.stateTimer[janeEid] = 0
    EnemyAI.targetEid[janeEid] = playerEid

    const state = world.bossState.get(janeEid) as {
      selectedAttack: number
      attackExecuted: boolean
      aimAngle: number
      isDashing: boolean
    }
    state.selectedAttack = selectedAttack
    state.attackExecuted = false
    state.isDashing = false
    // Aim toward player
    state.aimAngle = Math.atan2(
      Position.y[playerEid]! - Position.y[janeEid]!,
      Position.x[playerEid]! - Position.x[janeEid]!,
    )
  }

  test('rifle shot spawns a single bullet', () => {
    const bulletsBefore = bulletQuery(world).length

    setupAttackState(0) // RIFLE_SHOT

    getBoss(EnemyType.COYOTE_JANE)!.attack(world, janeEid, 1 / 60)

    const bulletsAfter = bulletQuery(world).length
    expect(bulletsAfter - bulletsBefore).toBe(1)
  })

  test('hip shot spawns multiple bullets (Phase 3)', () => {
    // Enter phase 3 for hip shot
    Health.current[janeEid] = Health.max[janeEid]! * 0.20
    bossPhaseSystem(world, 1 / 60)

    const bulletsBefore = bulletQuery(world).length

    setupAttackState(1) // HIP_SHOT

    getBoss(EnemyType.COYOTE_JANE)!.attack(world, janeEid, 1 / 60)

    const bulletsAfter = bulletQuery(world).length
    expect(bulletsAfter - bulletsBefore).toBe(2) // HIP_BULLET_COUNT = 2
  })

  test('attack transitions to RECOVERY after executing', () => {
    setupAttackState(0) // RIFLE_SHOT

    getBoss(EnemyType.COYOTE_JANE)!.attack(world, janeEid, 1 / 60)

    expect(EnemyAI.state[janeEid]!).toBe(AIState.RECOVERY)
  })

  test('attack early-returns when isDashing is true', () => {
    setupAttackState(0)
    const state = world.bossState.get(janeEid) as { isDashing: boolean }
    state.isDashing = true

    const bulletsBefore = bulletQuery(world).length
    getBoss(EnemyType.COYOTE_JANE)!.attack(world, janeEid, 1 / 60)

    // No bullets fired, state unchanged
    expect(bulletQuery(world).length).toBe(bulletsBefore)
    expect(EnemyAI.state[janeEid]!).toBe(AIState.ATTACK)
  })
})

describe('Coyote Jane (reposition dash)', () => {
  let world: GameWorld
  let janeEid: number
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    playerEid = spawnPlayer(world, 800, 600)
    janeEid = spawnJane(world, 500, 400)
  })

  test('dash triggers during CHASE after cooldown expires', () => {
    EnemyAI.state[janeEid] = AIState.CHASE
    EnemyAI.stateTimer[janeEid] = 0
    EnemyAI.targetEid[janeEid] = playerEid

    const mod = getBoss(EnemyType.COYOTE_JANE)!
    const state = world.bossState.get(janeEid) as { isDashing: boolean; repositionCooldown: number }

    // Tick until cooldown expires (P1_REPOSITION_COOLDOWN = 8.0s)
    const ticksNeeded = Math.ceil(COYOTE_JANE_P1_REPOSITION_COOLDOWN * 60) + 5
    for (let i = 0; i < ticksNeeded; i++) {
      mod.tick(world, janeEid, 1 / 60)
      // Re-force CHASE since dash transitions to ATTACK
      if (EnemyAI.state[janeEid] === AIState.ATTACK && state.isDashing) break
      EnemyAI.state[janeEid] = AIState.CHASE
    }

    expect(state.isDashing).toBe(true)
    // Should be in ATTACK state (prevents steering override)
    expect(EnemyAI.state[janeEid]!).toBe(AIState.ATTACK)
    // Velocity should be non-zero
    const vx = Velocity.x[janeEid]!
    const vy = Velocity.y[janeEid]!
    const speed = Math.sqrt(vx * vx + vy * vy)
    expect(speed).toBeCloseTo(COYOTE_JANE_DASH_SPEED, 0)
  })

  test('dash places bear trap at starting position', () => {
    EnemyAI.state[janeEid] = AIState.CHASE
    EnemyAI.stateTimer[janeEid] = 0
    EnemyAI.targetEid[janeEid] = playerEid

    const mod = getBoss(EnemyType.COYOTE_JANE)!
    const state = world.bossState.get(janeEid) as { repositionCooldown: number }

    // Fast-forward cooldown
    state.repositionCooldown = 1 / 60

    const trapsBefore = world.trapZones.filter(t => t.kind === 'bearTrap').length
    mod.tick(world, janeEid, 1 / 60)

    const trapsAfter = world.trapZones.filter(t => t.kind === 'bearTrap').length
    expect(trapsAfter).toBeGreaterThan(trapsBefore)
  })

  test('Phase 3 does not dash', () => {
    // Enter P3
    Health.current[janeEid] = Health.max[janeEid]! * 0.20
    bossPhaseSystem(world, 1 / 60)

    EnemyAI.state[janeEid] = AIState.CHASE
    EnemyAI.stateTimer[janeEid] = 0
    EnemyAI.targetEid[janeEid] = playerEid

    const mod = getBoss(EnemyType.COYOTE_JANE)!
    const state = world.bossState.get(janeEid) as { isDashing: boolean; repositionCooldown: number }
    state.repositionCooldown = 0

    for (let i = 0; i < 60; i++) {
      mod.tick(world, janeEid, 1 / 60)
    }

    expect(state.isDashing).toBe(false)
  })
})

describe('Coyote Jane (coyote whistle)', () => {
  let world: GameWorld
  let janeEid: number
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    playerEid = spawnPlayer(world, 800, 600)
    janeEid = spawnJane(world, 500, 400)
  })

  test('whistle summons 2 coyotes in Phase 2 when none alive', () => {
    // Enter P2
    Health.current[janeEid] = Health.max[janeEid]! * 0.69
    bossPhaseSystem(world, 1 / 60)

    EnemyAI.state[janeEid] = AIState.CHASE
    EnemyAI.stateTimer[janeEid] = 0
    EnemyAI.targetEid[janeEid] = playerEid

    const mod = getBoss(EnemyType.COYOTE_JANE)!
    const state = world.bossState.get(janeEid) as { whistleCooldown: number }

    // Fast-forward whistle cooldown
    state.whistleCooldown = 1 / 60

    const countsBefore = countByType(world)
    const coyotesBefore = countsBefore[EnemyType.COYOTE] ?? 0

    mod.tick(world, janeEid, 1 / 60)

    const countsAfter = countByType(world)
    expect((countsAfter[EnemyType.COYOTE] ?? 0) - coyotesBefore).toBe(COYOTE_JANE_WHISTLE_SUMMON_COUNT)
  })

  test('whistle respects cooldown', () => {
    // Enter P2
    Health.current[janeEid] = Health.max[janeEid]! * 0.69
    bossPhaseSystem(world, 1 / 60)

    EnemyAI.state[janeEid] = AIState.CHASE
    EnemyAI.stateTimer[janeEid] = 0
    EnemyAI.targetEid[janeEid] = playerEid

    const mod = getBoss(EnemyType.COYOTE_JANE)!

    // Tick once (whistle cooldown should still be positive after P2 transition)
    mod.tick(world, janeEid, 1 / 60)

    // No coyotes should have been summoned yet (cooldown ~3s)
    const counts = countByType(world)
    expect(counts[EnemyType.COYOTE] ?? 0).toBe(0)
  })

  test('whistle does not summon when coyotes alive', () => {
    // Enter P2
    Health.current[janeEid] = Health.max[janeEid]! * 0.69
    bossPhaseSystem(world, 1 / 60)

    // Manually spawn a coyote
    const { spawnCoyote } = require('../../prefabs')
    spawnCoyote(world, 600, 400)

    EnemyAI.state[janeEid] = AIState.CHASE
    EnemyAI.stateTimer[janeEid] = 0
    EnemyAI.targetEid[janeEid] = playerEid

    const mod = getBoss(EnemyType.COYOTE_JANE)!
    const state = world.bossState.get(janeEid) as { whistleCooldown: number }
    state.whistleCooldown = 1 / 60

    const countsBefore = countByType(world)
    const coyotesBefore = countsBefore[EnemyType.COYOTE] ?? 0

    mod.tick(world, janeEid, 1 / 60)

    const countsAfter = countByType(world)
    // No additional coyotes (one was already alive)
    expect(countsAfter[EnemyType.COYOTE] ?? 0).toBe(coyotesBefore)
  })
})

describe('Coyote Jane (caltrops)', () => {
  let world: GameWorld
  let janeEid: number
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    playerEid = spawnPlayer(world, 600, 600)
    janeEid = spawnJane(world, 400, 600)
  })

  test('caltrops appear sooner with reduced cooldown', () => {
    // Enter P2
    Health.current[janeEid] = Health.max[janeEid]! * 0.69
    bossPhaseSystem(world, 1 / 60)

    EnemyAI.state[janeEid] = AIState.CHASE
    EnemyAI.stateTimer[janeEid] = 0
    EnemyAI.targetEid[janeEid] = playerEid

    const mod = getBoss(EnemyType.COYOTE_JANE)!

    // Tick for 1.5s (initial caltrop cooldown)
    for (let i = 0; i < 95; i++) {
      mod.tick(world, janeEid, 1 / 60)
      // Keep in CHASE
      if (EnemyAI.state[janeEid] !== AIState.CHASE) {
        EnemyAI.state[janeEid] = AIState.CHASE
      }
    }

    const caltrops = world.trapZones.filter(t => t.kind === 'caltrop')
    expect(caltrops.length).toBeGreaterThanOrEqual(1)
  })

  test('caltrop cooldown is 2.5s', () => {
    expect(COYOTE_JANE_CALTROP_COOLDOWN).toBe(2.5)
  })
})

describe('Coyote Jane (tripwire)', () => {
  let world: GameWorld
  let janeEid: number
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    playerEid = spawnPlayer(world, 800, 600)
    janeEid = spawnJane(world, 500, 400)
  })

  test('tripwire placed during Phase 2 repositioning (every 2nd)', () => {
    // Enter P2
    Health.current[janeEid] = Health.max[janeEid]! * 0.69
    bossPhaseSystem(world, 1 / 60)

    EnemyAI.state[janeEid] = AIState.CHASE
    EnemyAI.stateTimer[janeEid] = 0
    EnemyAI.targetEid[janeEid] = playerEid

    const mod = getBoss(EnemyType.COYOTE_JANE)!
    const state = world.bossState.get(janeEid) as {
      repositionCooldown: number
      isDashing: boolean
      tripwirePlacementCounter: number
    }

    // First reposition: counter goes to 1, no tripwire yet
    state.repositionCooldown = 1 / 60
    mod.tick(world, janeEid, 1 / 60)
    expect(state.isDashing).toBe(true)

    let tripwires = world.trapZones.filter(t => t.kind === 'tripwire')
    expect(tripwires.length).toBe(0)

    // Complete dash
    state.isDashing = false
    Velocity.x[janeEid] = 0
    Velocity.y[janeEid] = 0
    EnemyAI.state[janeEid] = AIState.CHASE

    // Second reposition: counter reaches 2, tripwire placed
    state.repositionCooldown = 1 / 60
    mod.tick(world, janeEid, 1 / 60)

    tripwires = world.trapZones.filter(t => t.kind === 'tripwire')
    expect(tripwires.length).toBe(1)
    expect(tripwires[0]!.x2).toBeDefined()
    expect(tripwires[0]!.y2).toBeDefined()
  })
})
