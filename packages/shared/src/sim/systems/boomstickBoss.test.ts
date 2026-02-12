import { describe, expect, test, beforeEach } from 'bun:test'
import { defineQuery } from 'bitecs'
import { createGameWorld, setWorldTilemap, type GameWorld } from '../world'
import { createTestArena } from '../content/maps/testArena'
import { spawnPlayer, spawnBoomstick } from '../prefabs'
import { boomstickBossSystem } from './boomstickBoss'
import { Enemy, EnemyAI, AIState, AttackConfig, BossPhase, EnemyType, EnemyTier, Health } from '../components'
import {
  BOOMSTICK_TRANSITION_IFRAMES,
  BOOMSTICK_PHASE_2_TELEGRAPH,
  BOOMSTICK_PHASE_2_RECOVERY,
  BOOMSTICK_PHASE_2_COOLDOWN,
  BOOMSTICK_PHASE_2_FAN_BULLETS,
  BOOMSTICK_PHASE_2_SUMMON_SWARMERS,
  BOOMSTICK_PHASE_2_SUMMON_ROGUES,
  BOOMSTICK_PHASE_3_TELEGRAPH,
  BOOMSTICK_PHASE_3_RECOVERY,
  BOOMSTICK_PHASE_3_COOLDOWN,
  BOOMSTICK_PHASE_3_FAN_BULLETS,
  BOOMSTICK_PHASE_3_SUMMON_SWARMERS,
  BOOMSTICK_PHASE_3_SUMMON_ROGUES,
} from '../content/enemies'

const enemyQuery = defineQuery([Enemy])

function countByType(world: GameWorld): Record<number, number> {
  const counts: Record<number, number> = {}
  for (const eid of enemyQuery(world)) {
    const type = Enemy.type[eid]!
    counts[type] = (counts[type] ?? 0) + 1
  }
  return counts
}

describe('boomstickBossSystem', () => {
  let world: GameWorld
  let boomstickEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    spawnPlayer(world, 800, 600)
    boomstickEid = spawnBoomstick(world, 900, 600)
  })

  test('spawns with phase 1', () => {
    expect(BossPhase.phase[boomstickEid]!).toBe(1)
  })

  test('phase 2 transition updates tuning, telegraphs, and spawns burst once', () => {
    Health.current[boomstickEid] = Health.max[boomstickEid]! * 0.69

    boomstickBossSystem(world, 1 / 60)

    expect(BossPhase.phase[boomstickEid]!).toBe(2)
    expect(AttackConfig.telegraphDuration[boomstickEid]!).toBeCloseTo(BOOMSTICK_PHASE_2_TELEGRAPH)
    expect(AttackConfig.recoveryDuration[boomstickEid]!).toBeCloseTo(BOOMSTICK_PHASE_2_RECOVERY)
    expect(AttackConfig.cooldown[boomstickEid]!).toBeCloseTo(BOOMSTICK_PHASE_2_COOLDOWN)
    expect(AttackConfig.projectileCount[boomstickEid]!).toBe(BOOMSTICK_PHASE_2_FAN_BULLETS)
    expect(AttackConfig.cooldownRemaining[boomstickEid]!).toBe(0)
    expect(Health.iframes[boomstickEid]!).toBeCloseTo(BOOMSTICK_TRANSITION_IFRAMES)
    expect(EnemyAI.state[boomstickEid]!).toBe(AIState.TELEGRAPH)

    const afterFirst = countByType(world)
    expect(afterFirst[EnemyType.SWARMER] ?? 0).toBe(BOOMSTICK_PHASE_2_SUMMON_SWARMERS)
    expect(afterFirst[EnemyType.GOBLIN_ROGUE] ?? 0).toBe(BOOMSTICK_PHASE_2_SUMMON_ROGUES)

    // Re-running in the same phase should not respawn adds.
    boomstickBossSystem(world, 1 / 60)
    const afterSecond = countByType(world)
    expect(afterSecond[EnemyType.SWARMER] ?? 0).toBe(BOOMSTICK_PHASE_2_SUMMON_SWARMERS)
    expect(afterSecond[EnemyType.GOBLIN_ROGUE] ?? 0).toBe(BOOMSTICK_PHASE_2_SUMMON_ROGUES)

    for (const eid of enemyQuery(world)) {
      const type = Enemy.type[eid]!
      if (type === EnemyType.SWARMER || type === EnemyType.GOBLIN_ROGUE) {
        expect(Enemy.tier[eid]!).toBe(EnemyTier.FODDER)
      }
    }
  })

  test('phase 3 transition from phase 2 applies phase 3 tuning and burst delta', () => {
    // Enter phase 2 first
    Health.current[boomstickEid] = Health.max[boomstickEid]! * 0.69
    boomstickBossSystem(world, 1 / 60)
    const beforePhase3 = countByType(world)

    Health.current[boomstickEid] = Health.max[boomstickEid]! * 0.34
    boomstickBossSystem(world, 1 / 60)

    expect(BossPhase.phase[boomstickEid]!).toBe(3)
    expect(AttackConfig.telegraphDuration[boomstickEid]!).toBeCloseTo(BOOMSTICK_PHASE_3_TELEGRAPH)
    expect(AttackConfig.recoveryDuration[boomstickEid]!).toBeCloseTo(BOOMSTICK_PHASE_3_RECOVERY)
    expect(AttackConfig.cooldown[boomstickEid]!).toBeCloseTo(BOOMSTICK_PHASE_3_COOLDOWN)
    expect(AttackConfig.projectileCount[boomstickEid]!).toBe(BOOMSTICK_PHASE_3_FAN_BULLETS)
    expect(EnemyAI.state[boomstickEid]!).toBe(AIState.TELEGRAPH)
    expect(Health.iframes[boomstickEid]!).toBeCloseTo(BOOMSTICK_TRANSITION_IFRAMES)

    const afterPhase3 = countByType(world)
    expect((afterPhase3[EnemyType.SWARMER] ?? 0) - (beforePhase3[EnemyType.SWARMER] ?? 0)).toBe(BOOMSTICK_PHASE_3_SUMMON_SWARMERS)
    expect((afterPhase3[EnemyType.GOBLIN_ROGUE] ?? 0) - (beforePhase3[EnemyType.GOBLIN_ROGUE] ?? 0)).toBe(BOOMSTICK_PHASE_3_SUMMON_ROGUES)
  })

  test('large HP drop to phase 3 in one tick triggers both phase bursts', () => {
    Health.current[boomstickEid] = Health.max[boomstickEid]! * 0.20

    boomstickBossSystem(world, 1 / 60)

    expect(BossPhase.phase[boomstickEid]!).toBe(3)
    const counts = countByType(world)
    expect(counts[EnemyType.SWARMER] ?? 0).toBe(BOOMSTICK_PHASE_2_SUMMON_SWARMERS + BOOMSTICK_PHASE_3_SUMMON_SWARMERS)
    expect(counts[EnemyType.GOBLIN_ROGUE] ?? 0).toBe(BOOMSTICK_PHASE_2_SUMMON_ROGUES + BOOMSTICK_PHASE_3_SUMMON_ROGUES)
  })
})
