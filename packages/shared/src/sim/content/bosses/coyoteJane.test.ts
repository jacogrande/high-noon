import { describe, expect, test, beforeEach } from 'bun:test'
import { defineQuery } from 'bitecs'
import { createGameWorld, setWorldTilemap, type GameWorld } from '../../world'
import { createTestArena } from '../maps/testArena'
import { spawnPlayer } from '../../prefabs'
import { getBoss } from './registry'
import { bossPhaseSystem } from '../../systems/bossPhase'
import {
  Enemy, EnemyAI, AIState, AttackConfig, BossPhase, EnemyType, EnemyTier,
  Health, Speed, Position, Collider, Bullet,
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
  COYOTE_JANE_P3_SUMMON_SWARMERS,
  COYOTE_JANE_RIFLE_DAMAGE,
  COYOTE_JANE_HIP_DAMAGE,
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

  test('phase 3 transition at HP <= 35%: spawns swarmers, i-frames granted', () => {
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
    expect(counts[EnemyType.SWARMER] ?? 0).toBe(COYOTE_JANE_P3_SUMMON_SWARMERS)
  })

  test('large HP drop (phase 1 → phase 3) triggers both transitions', () => {
    Health.current[janeEid] = Health.max[janeEid]! * 0.20

    bossPhaseSystem(world, 1 / 60)

    expect(BossPhase.phase[janeEid]!).toBe(3)
    expect(Speed.current[janeEid]!).toBe(COYOTE_JANE_P3_SPEED)
    const counts = countByType(world)
    expect(counts[EnemyType.SWARMER] ?? 0).toBe(COYOTE_JANE_P3_SUMMON_SWARMERS)
  })

  test('re-running in same phase does not re-trigger transitions', () => {
    Health.current[janeEid] = Health.max[janeEid]! * 0.34
    bossPhaseSystem(world, 1 / 60)

    const countsAfterFirst = countByType(world)
    const swarmersFirst = countsAfterFirst[EnemyType.SWARMER] ?? 0

    bossPhaseSystem(world, 1 / 60)

    const countsAfterSecond = countByType(world)
    expect(countsAfterSecond[EnemyType.SWARMER] ?? 0).toBe(swarmersFirst)
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
    }
    state.selectedAttack = selectedAttack
    state.attackExecuted = false
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
})
