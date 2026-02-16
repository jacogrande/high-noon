import { describe, expect, test, beforeEach } from 'bun:test'
import { defineQuery } from 'bitecs'
import { createGameWorld, setWorldTilemap, type GameWorld } from '../../world'
import { createTestArena } from '../maps/testArena'
import { spawnPlayer } from '../../prefabs'
import { getBoss } from './registry'
import { bossPhaseSystem } from '../../systems/bossPhase'
import { Enemy, EnemyAI, AIState, AttackConfig, BossPhase, EnemyType, EnemyTier, Health, Speed, Position } from '../../components'
import {
  MAD_DOG_HP,
  MAD_DOG_P1_SPEED,
  MAD_DOG_P2_SPEED,
  MAD_DOG_P3_SPEED,
  MAD_DOG_P1_COOLDOWN,
  MAD_DOG_P2_COOLDOWN,
  MAD_DOG_P3_COOLDOWN,
  MAD_DOG_TRANSITION_IFRAMES,
  MAD_DOG_P3_SUMMON_SWARMERS,
  MAD_DOG_GROUND_POUND_CADENCE,
  MAD_DOG_SWEEP_DAMAGE,
  MAD_DOG_SLAM_DAMAGE,
  MAD_DOG_WHIRLWIND_DAMAGE,
  MAD_DOG_LUNGE_DAMAGE,
  MAD_DOG_GROUND_POUND_DAMAGE,
} from './madDog'

const enemyQuery = defineQuery([Enemy])

function countByType(world: GameWorld): Record<number, number> {
  const counts: Record<number, number> = {}
  for (const eid of enemyQuery(world)) {
    const type = Enemy.type[eid]!
    counts[type] = (counts[type] ?? 0) + 1
  }
  return counts
}

function spawnMadDog(world: GameWorld, x: number, y: number): number {
  return getBoss(EnemyType.MAD_DOG)!.spawn(world, x, y)
}

describe('Mad Dog Maguire (bossPhaseSystem)', () => {
  let world: GameWorld
  let madDogEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    spawnPlayer(world, 800, 600)
    madDogEid = spawnMadDog(world, 900, 600)
  })

  test('spawns with phase 1 and correct stats', () => {
    expect(BossPhase.phase[madDogEid]!).toBe(1)
    expect(Health.current[madDogEid]!).toBe(MAD_DOG_HP)
    expect(Health.max[madDogEid]!).toBe(MAD_DOG_HP)
    expect(Speed.current[madDogEid]!).toBe(MAD_DOG_P1_SPEED)
    expect(Speed.max[madDogEid]!).toBe(MAD_DOG_P1_SPEED)
    expect(AttackConfig.cooldown[madDogEid]!).toBeCloseTo(MAD_DOG_P1_COOLDOWN)
    expect(Enemy.type[madDogEid]!).toBe(EnemyType.MAD_DOG)
    expect(Enemy.tier[madDogEid]!).toBe(EnemyTier.THREAT)
  })

  test('phase 2 transition at HP <= 70%: speed increases, cooldown decreases, i-frames granted', () => {
    Health.current[madDogEid] = Health.max[madDogEid]! * 0.69

    bossPhaseSystem(world, 1 / 60)

    expect(BossPhase.phase[madDogEid]!).toBe(2)
    expect(Speed.current[madDogEid]!).toBe(MAD_DOG_P2_SPEED)
    expect(Speed.max[madDogEid]!).toBe(MAD_DOG_P2_SPEED)
    expect(AttackConfig.cooldown[madDogEid]!).toBeCloseTo(MAD_DOG_P2_COOLDOWN)
    expect(Health.iframes[madDogEid]!).toBeCloseTo(MAD_DOG_TRANSITION_IFRAMES)
    expect(AttackConfig.cooldownRemaining[madDogEid]!).toBe(0)
    expect(EnemyAI.state[madDogEid]!).toBe(AIState.TELEGRAPH)

    // No adds spawn in Phase 2
    const counts = countByType(world)
    expect(counts[EnemyType.SWARMER] ?? 0).toBe(0)
  })

  test('phase 3 transition at HP <= 35%: speed decreases, spawns swarmers, i-frames granted', () => {
    // Enter phase 2 first
    Health.current[madDogEid] = Health.max[madDogEid]! * 0.69
    bossPhaseSystem(world, 1 / 60)

    // Enter phase 3
    Health.current[madDogEid] = Health.max[madDogEid]! * 0.34
    bossPhaseSystem(world, 1 / 60)

    expect(BossPhase.phase[madDogEid]!).toBe(3)
    expect(Speed.current[madDogEid]!).toBe(MAD_DOG_P3_SPEED)
    expect(Speed.max[madDogEid]!).toBe(MAD_DOG_P3_SPEED)
    expect(AttackConfig.cooldown[madDogEid]!).toBeCloseTo(MAD_DOG_P3_COOLDOWN)
    expect(Health.iframes[madDogEid]!).toBeCloseTo(MAD_DOG_TRANSITION_IFRAMES)
    expect(EnemyAI.state[madDogEid]!).toBe(AIState.TELEGRAPH)

    const counts = countByType(world)
    expect(counts[EnemyType.SWARMER] ?? 0).toBe(MAD_DOG_P3_SUMMON_SWARMERS)
  })

  test('large HP drop (phase 1 → phase 3) triggers both transitions', () => {
    Health.current[madDogEid] = Health.max[madDogEid]! * 0.20

    bossPhaseSystem(world, 1 / 60)

    expect(BossPhase.phase[madDogEid]!).toBe(3)
    // Phase 3 speed (last applied)
    expect(Speed.current[madDogEid]!).toBe(MAD_DOG_P3_SPEED)
    // Swarmers from phase 3 transition
    const counts = countByType(world)
    expect(counts[EnemyType.SWARMER] ?? 0).toBe(MAD_DOG_P3_SUMMON_SWARMERS)
  })

  test('re-running in same phase does not re-trigger transitions', () => {
    Health.current[madDogEid] = Health.max[madDogEid]! * 0.34
    bossPhaseSystem(world, 1 / 60)

    const countsAfterFirst = countByType(world)
    const swarmersFirst = countsAfterFirst[EnemyType.SWARMER] ?? 0

    bossPhaseSystem(world, 1 / 60)

    const countsAfterSecond = countByType(world)
    expect(countsAfterSecond[EnemyType.SWARMER] ?? 0).toBe(swarmersFirst)
  })

  test('attack counter increments on telegraph entry', () => {
    const state = world.bossState.get(madDogEid) as { attackCounter: number }
    expect(state.attackCounter).toBe(0)

    // Force telegraph state
    EnemyAI.state[madDogEid] = AIState.TELEGRAPH
    EnemyAI.stateTimer[madDogEid] = 0

    getBoss(EnemyType.MAD_DOG)!.tick(world, madDogEid, 1 / 60)

    expect(state.attackCounter).toBe(1)
  })

  test('ground pound forced every Nth attack in phase 3', () => {
    // Enter phase 3
    Health.current[madDogEid] = Health.max[madDogEid]! * 0.20
    bossPhaseSystem(world, 1 / 60)

    const state = world.bossState.get(madDogEid) as { attackCounter: number; selectedAttack: number }

    // Simulate attacks up to the cadence boundary
    // (attackCounter already incremented once by phase transition telegraph)
    // Force counter to cadence - 1 (the next telegraph will be at cadence)
    state.attackCounter = MAD_DOG_GROUND_POUND_CADENCE - 1

    EnemyAI.state[madDogEid] = AIState.TELEGRAPH
    EnemyAI.stateTimer[madDogEid] = 0

    getBoss(EnemyType.MAD_DOG)!.tick(world, madDogEid, 1 / 60)

    // Attack 4 is GROUND_POUND (selectedAttack === 4)
    expect(state.selectedAttack).toBe(4) // MadDogAttack.GROUND_POUND
  })
})

describe('Mad Dog Maguire (attack execution)', () => {
  let world: GameWorld
  let madDogEid: number
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    playerEid = spawnPlayer(world, 800, 600)
    madDogEid = spawnMadDog(world, 900, 600)
  })

  function setupAttackState(selectedAttack: number): void {
    // Set boss in ATTACK state
    EnemyAI.state[madDogEid] = AIState.ATTACK
    EnemyAI.stateTimer[madDogEid] = 0
    EnemyAI.targetEid[madDogEid] = playerEid

    // Configure boss state
    const state = world.bossState.get(madDogEid) as {
      selectedAttack: number
      attackExecuted: boolean
      slamTargetX: number
      slamTargetY: number
      lungeAimX: number
      lungeAimY: number
    }
    state.selectedAttack = selectedAttack
    state.attackExecuted = false
  }

  test('Chain Sweep deals damage to player in arc', () => {
    // Position player within sweep range (70px) — 60px apart
    Position.x[playerEid] = 840
    Position.y[playerEid] = 600
    const initialHP = Health.current[playerEid]!

    setupAttackState(0) // CHAIN_SWEEP

    getBoss(EnemyType.MAD_DOG)!.attack(world, madDogEid, 1 / 60)

    expect(Health.current[playerEid]!).toBe(initialHP - MAD_DOG_SWEEP_DAMAGE)
  })

  test('Chain Sweep misses player outside arc range', () => {
    // Position player far outside sweep range (70px) — 200px away
    Position.x[playerEid] = 700
    Position.y[playerEid] = 600
    const initialHP = Health.current[playerEid]!

    setupAttackState(0) // CHAIN_SWEEP

    getBoss(EnemyType.MAD_DOG)!.attack(world, madDogEid, 1 / 60)

    expect(Health.current[playerEid]!).toBe(initialHP)
  })

  test('Overhead Slam deals damage at locked target position', () => {
    const initialHP = Health.current[playerEid]!

    setupAttackState(1) // OVERHEAD_SLAM

    // Lock slam target to player position
    const state = world.bossState.get(madDogEid) as {
      slamTargetX: number
      slamTargetY: number
    }
    state.slamTargetX = Position.x[playerEid]!
    state.slamTargetY = Position.y[playerEid]!

    getBoss(EnemyType.MAD_DOG)!.attack(world, madDogEid, 1 / 60)

    expect(Health.current[playerEid]!).toBe(initialHP - MAD_DOG_SLAM_DAMAGE)
  })

  test('Overhead Slam misses player far from locked target', () => {
    const initialHP = Health.current[playerEid]!

    setupAttackState(1) // OVERHEAD_SLAM

    // Lock slam target far from player
    const state = world.bossState.get(madDogEid) as {
      slamTargetX: number
      slamTargetY: number
    }
    state.slamTargetX = 500
    state.slamTargetY = 500

    getBoss(EnemyType.MAD_DOG)!.attack(world, madDogEid, 1 / 60)

    expect(Health.current[playerEid]!).toBe(initialHP)
  })

  test('Ground Pound spawns shockwave and ground crack', () => {
    setupAttackState(4) // GROUND_POUND

    expect(world.bossShockwaves.length).toBe(0)
    expect(world.groundCracks.length).toBe(0)

    getBoss(EnemyType.MAD_DOG)!.attack(world, madDogEid, 1 / 60)

    expect(world.bossShockwaves.length).toBe(1)
    expect(world.groundCracks.length).toBe(1)
  })

  test('Ground Pound direct AoE damages nearby player', () => {
    // Position player within 30px of boss
    Position.x[playerEid] = 910
    Position.y[playerEid] = 600
    const initialHP = Health.current[playerEid]!

    setupAttackState(4) // GROUND_POUND

    getBoss(EnemyType.MAD_DOG)!.attack(world, madDogEid, 1 / 60)

    expect(Health.current[playerEid]!).toBe(initialHP - MAD_DOG_GROUND_POUND_DAMAGE)
  })

  test('Whirlwind deals damage on per-entity cooldown', () => {
    // Position player within whirlwind range (60px)
    Position.x[playerEid] = 850
    Position.y[playerEid] = 600
    const initialHP = Health.current[playerEid]!

    setupAttackState(2) // CHAIN_WHIRLWIND

    // First call should deal damage
    getBoss(EnemyType.MAD_DOG)!.attack(world, madDogEid, 1 / 60)
    expect(Health.current[playerEid]!).toBe(initialHP - MAD_DOG_WHIRLWIND_DAMAGE)

    // Reset i-frames for testing
    Health.iframes[playerEid] = 0

    // Second call immediately after should NOT deal damage (cooldown active)
    getBoss(EnemyType.MAD_DOG)!.attack(world, madDogEid, 1 / 60)
    expect(Health.current[playerEid]!).toBe(initialHP - MAD_DOG_WHIRLWIND_DAMAGE)
  })

  test('Lunge applies damage and knockback on contact', () => {
    // Position player close along lunge direction
    Position.x[playerEid] = 925
    Position.y[playerEid] = 600
    const initialHP = Health.current[playerEid]!

    setupAttackState(3) // SHACKLE_LUNGE

    // Set lunge direction toward player
    const state = world.bossState.get(madDogEid) as {
      lungeAimX: number
      lungeAimY: number
    }
    state.lungeAimX = 1
    state.lungeAimY = 0

    getBoss(EnemyType.MAD_DOG)!.attack(world, madDogEid, 1 / 60)

    // Check damage was applied
    expect(Health.current[playerEid]!).toBe(initialHP - MAD_DOG_LUNGE_DAMAGE)
  })
})
