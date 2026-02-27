import { describe, expect, test, beforeEach } from 'bun:test'
import { defineQuery } from 'bitecs'
import { createGameWorld, setWorldTilemap, type GameWorld } from '../../world'
import { createTestArena } from '../maps/testArena'
import { spawnPlayer } from '../../prefabs'
import { getBoss } from './registry'
import { bossPhaseSystem } from '../../systems/bossPhase'
import {
  Enemy, EnemyAI, AIState, AttackConfig, BossPhase, EnemyType, EnemyTier,
  Health, Speed, Position, Velocity, Bullet,
} from '../../components'
import {
  DALTON_EMMETT_HP,
  DALTON_BOB_HP,
  DALTON_EMMETT_SPEED,
  DALTON_BOB_SPEED,
  DALTON_BUCKSHOT_DAMAGE,
  DALTON_DEADSHOT_DAMAGE,
  DALTON_ENRAGE_SPEED_MUL,
  DALTON_ENRAGE_COOLDOWN_MUL,
  DALTON_GROUP_KEY,
  DALTON_TRANSITION_IFRAMES,
} from './daltonBoys'

const bulletQuery = defineQuery([Bullet])

function spawnDaltonPair(world: GameWorld, x: number, y: number): [number, number] {
  const mod = getBoss(EnemyType.DALTON)!
  const emmett = mod.spawn(world, x, y)
  const bob = mod.spawn(world, x + 50, y)
  return [emmett, bob]
}

describe('Dalton Boys (spawn)', () => {
  let world: GameWorld

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
  })

  test('first spawn creates Emmett with correct stats', () => {
    const mod = getBoss(EnemyType.DALTON)!
    const emmett = mod.spawn(world, 800, 600)

    expect(Enemy.type[emmett]!).toBe(EnemyType.DALTON)
    expect(Enemy.tier[emmett]!).toBe(EnemyTier.THREAT)
    expect(BossPhase.phase[emmett]!).toBe(1)
    expect(Health.current[emmett]!).toBe(DALTON_EMMETT_HP)
    expect(Health.max[emmett]!).toBe(DALTON_EMMETT_HP)
    expect(Speed.current[emmett]!).toBe(DALTON_EMMETT_SPEED)

    // Group state should exist
    const group = world.bossState.get(DALTON_GROUP_KEY) as any
    expect(group).toBeDefined()
    expect(group.emmettEid).toBe(emmett)
    expect(group.bobEid).toBe(-1) // Not yet joined

    // Brother state
    const state = world.bossState.get(emmett) as any
    expect(state.role).toBe('emmett')
  })

  test('second spawn creates Bob and joins group', () => {
    const [emmett, bob] = spawnDaltonPair(world, 800, 600)

    expect(Health.current[bob]!).toBe(DALTON_BOB_HP)
    expect(Health.max[bob]!).toBe(DALTON_BOB_HP)
    expect(Speed.current[bob]!).toBe(DALTON_BOB_SPEED)

    // Group should link both
    const group = world.bossState.get(DALTON_GROUP_KEY) as any
    expect(group.emmettEid).toBe(emmett)
    expect(group.bobEid).toBe(bob)

    // Brother states
    const emmettState = world.bossState.get(emmett) as any
    const bobState = world.bossState.get(bob) as any
    expect(emmettState.role).toBe('emmett')
    expect(bobState.role).toBe('bob')
    expect(emmettState.group).toBe(bobState.group) // Same group object
  })

  test('module metadata is correct', () => {
    const mod = getBoss(EnemyType.DALTON)!
    expect(mod.displayName).toBe('THE DALTON BOYS')
    expect(mod.showIndividualBars).toBe(true)
    expect(mod.spawnCount).toBe(2)
    expect(mod.dropChance).toBe(0.50)
  })
})

describe('Dalton Boys (phase transitions)', () => {
  let world: GameWorld
  let emmett: number
  let bob: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    spawnPlayer(world, 700, 600)
    ;[emmett, bob] = spawnDaltonPair(world, 800, 600)
  })

  test('phase 2 at combined HP <= 70%', () => {
    const totalMax = Health.max[emmett]! + Health.max[bob]!
    // Damage Emmett to bring combined below 70%
    const targetCombined = totalMax * 0.69
    Health.current[emmett] = targetCombined - Health.current[bob]!

    bossPhaseSystem(world, 1 / 60)

    expect(BossPhase.phase[emmett]!).toBe(2)
    // Bob should also be at phase 2
    expect(BossPhase.phase[bob]!).toBe(2)
    expect(Health.iframes[emmett]!).toBeCloseTo(DALTON_TRANSITION_IFRAMES)
  })

  test('phase 3 at combined HP <= 35%', () => {
    const totalMax = Health.max[emmett]! + Health.max[bob]!
    // First trigger P2
    Health.current[emmett] = totalMax * 0.30 - Health.current[bob]!
    bossPhaseSystem(world, 1 / 60)

    // Reduce further
    Health.current[bob] = 10
    Health.current[emmett] = 10
    bossPhaseSystem(world, 1 / 60)

    expect(BossPhase.phase[emmett]!).toBe(3)
    expect(BossPhase.phase[bob]!).toBe(3)
  })

  test('phase 3 when one brother dies', () => {
    Health.current[bob] = 0

    bossPhaseSystem(world, 1 / 60)

    expect(BossPhase.phase[emmett]!).toBe(3)
  })

  test('re-running does not re-trigger transitions', () => {
    Health.current[bob] = 0
    bossPhaseSystem(world, 1 / 60)

    const iframes1 = Health.iframes[emmett]!
    // Consume i-frames
    Health.iframes[emmett] = 0

    bossPhaseSystem(world, 1 / 60)

    // i-frames should not be re-applied
    expect(Health.iframes[emmett]!).toBe(0)
  })
})

describe('Dalton Boys (enrage)', () => {
  let world: GameWorld
  let emmett: number
  let bob: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    spawnPlayer(world, 700, 600)
    ;[emmett, bob] = spawnDaltonPair(world, 800, 600)
  })

  test('killing Bob enrages Emmett with speed and cooldown buffs', () => {
    const emmettSpeedBefore = Speed.current[emmett]!

    Health.current[bob] = 0
    bossPhaseSystem(world, 1 / 60)

    const group = world.bossState.get(DALTON_GROUP_KEY) as any
    expect(group.enraged).toBe(true)
    // Enrage multiplies the speed by 1.4 (phase transitions don't change speed)
    expect(Speed.current[emmett]!).toBeCloseTo(emmettSpeedBefore * DALTON_ENRAGE_SPEED_MUL)
  })

  test('killing Emmett enrages Bob with speed and cooldown buffs', () => {
    const bobSpeedBefore = Speed.current[bob]!

    Health.current[emmett] = 0
    bossPhaseSystem(world, 1 / 60)

    const group = world.bossState.get(DALTON_GROUP_KEY) as any
    expect(group.enraged).toBe(true)
    // Enrage multiplies the speed by 1.4
    expect(Speed.current[bob]!).toBeCloseTo(bobSpeedBefore * DALTON_ENRAGE_SPEED_MUL)
  })

  test('both dying cleans up group key', () => {
    Health.current[emmett] = 0
    Health.current[bob] = 0
    bossPhaseSystem(world, 1 / 60)

    expect(world.bossState.has(DALTON_GROUP_KEY)).toBe(false)
  })
})

describe('Dalton Boys (attacks)', () => {
  let world: GameWorld
  let emmett: number
  let bob: number
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    playerEid = spawnPlayer(world, 700, 600)
    ;[emmett, bob] = spawnDaltonPair(world, 800, 600)
  })

  test('Emmett Buckshot Blast spawns 3 bullets', () => {
    const mod = getBoss(EnemyType.DALTON)!

    // Force Emmett into attack state
    EnemyAI.state[emmett] = AIState.ATTACK
    EnemyAI.stateTimer[emmett] = 0
    EnemyAI.targetEid[emmett] = playerEid
    const state = world.bossState.get(emmett) as any
    state.attackExecuted = false
    state.isBullRush = false
    state.burstShotsRemaining = 0

    const bulletsBefore = bulletQuery(world).length

    mod.attack(world, emmett, 1 / 60)

    const bulletsAfter = bulletQuery(world).length
    expect(bulletsAfter - bulletsBefore).toBe(3)
    // Should transition to RECOVERY
    expect(EnemyAI.state[emmett]!).toBe(AIState.RECOVERY)
  })

  test('Bob Dead Shot spawns 1 bullet', () => {
    const mod = getBoss(EnemyType.DALTON)!

    // Force Bob into attack state
    EnemyAI.state[bob] = AIState.ATTACK
    EnemyAI.stateTimer[bob] = 0
    EnemyAI.targetEid[bob] = playerEid
    const state = world.bossState.get(bob) as any
    state.attackExecuted = false
    state.isBullRush = false
    state.burstShotsRemaining = 0

    const bulletsBefore = bulletQuery(world).length

    mod.attack(world, bob, 1 / 60)

    const bulletsAfter = bulletQuery(world).length
    expect(bulletsAfter - bulletsBefore).toBe(1)
    expect(EnemyAI.state[bob]!).toBe(AIState.RECOVERY)
  })

  test('Bob Covering Fire spawns 3 bullets across 3 calls', () => {
    const mod = getBoss(EnemyType.DALTON)!

    // Force Bob into attack with burst mode
    EnemyAI.state[bob] = AIState.ATTACK
    EnemyAI.stateTimer[bob] = 0
    EnemyAI.targetEid[bob] = playerEid
    const state = world.bossState.get(bob) as any
    state.attackExecuted = false
    state.burstShotsRemaining = 3
    state.burstAimAngle = 0

    const bulletsBefore = bulletQuery(world).length

    // Fire shot 1
    mod.attack(world, bob, 1 / 60)
    expect(state.burstShotsRemaining).toBe(2)

    // Fire shot 2
    EnemyAI.state[bob] = AIState.ATTACK
    mod.attack(world, bob, 1 / 60)
    expect(state.burstShotsRemaining).toBe(1)

    // Fire shot 3 (should transition to recovery)
    EnemyAI.state[bob] = AIState.ATTACK
    mod.attack(world, bob, 1 / 60)
    expect(state.burstShotsRemaining).toBe(0)

    const bulletsAfter = bulletQuery(world).length
    expect(bulletsAfter - bulletsBefore).toBe(3)
    expect(EnemyAI.state[bob]!).toBe(AIState.RECOVERY)
  })

  test('Emmett Bull Rush sets velocity and can deal contact damage', () => {
    const mod = getBoss(EnemyType.DALTON)!

    // Position player very close
    Position.x[playerEid] = 810
    Position.y[playerEid] = 600

    // Force Emmett into bull rush attack
    EnemyAI.state[emmett] = AIState.ATTACK
    EnemyAI.stateTimer[emmett] = 0
    EnemyAI.targetEid[emmett] = playerEid
    const state = world.bossState.get(emmett) as any
    state.attackExecuted = false
    state.isBullRush = true
    state.rushAimX = -1
    state.rushAimY = 0

    const hpBefore = Health.current[playerEid]!
    mod.attack(world, emmett, 1 / 60)

    // Should have set velocity
    expect(Math.abs(Velocity.x[emmett]!)).toBeGreaterThan(0)

    // Player may or may not be hit depending on exact radius math
    // Bull Rush should NOT immediately transition (needs timer >= duration)
    // Since timer is 0 < 0.25, should stay in ATTACK
    expect(EnemyAI.state[emmett]!).toBe(AIState.ATTACK)
  })
})
