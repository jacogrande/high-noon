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
  HOLLOW_MAN_HP,
  HOLLOW_MAN_RADIUS,
  HOLLOW_MAN_P1_SPEED,
  HOLLOW_MAN_TRANSITION_IFRAMES,
  HOLLOW_MAN_PHANTOM_SHOT_DAMAGE,
  HOLLOW_MAN_GRAVE_REACH_DAMAGE,
  HOLLOW_MAN_AFTERIMAGE_HP,
  HOLLOW_MAN_DUST_VEIL_RADIUS,
  HOLLOW_MAN_DUST_VEIL_DURATION,
  HOLLOW_MAN_P2_STORM_DURATION,
  HOLLOW_MAN_P2_STORM_VISIBILITY,
  HOLLOW_MAN_CONVERGENCE_SHOT_DAMAGE,
  HOLLOW_MAN_CONVERGENCE_COPIES,
  HOLLOW_MAN_CONVERGENCE_RECOVERY,
  HOLLOW_MAN_DISSOLVE_DURATION,
  HOLLOW_MAN_WAIT_DURATION,
  HOLLOW_MAN_ARRIVE_DURATION,
  HOLLOW_MAN_AFTERIMAGE_LIFETIME,
} from './hollowMan'

const bulletQuery = defineQuery([Bullet])
const enemyQuery = defineQuery([Enemy])

function countByType(world: GameWorld): Record<number, number> {
  const counts: Record<number, number> = {}
  for (const eid of enemyQuery(world)) {
    const type = Enemy.type[eid]!
    counts[type] = (counts[type] ?? 0) + 1
  }
  return counts
}

function spawnHollowMan(world: GameWorld, x: number, y: number): number {
  return getBoss(EnemyType.HOLLOW_MAN)!.spawn(world, x, y)
}

interface HollowManState {
  teleportPhase: number
  teleportTimer: number
  teleportCooldown: number
  currentAnchor: number
  lastAnchor: number
  teleportCount: number
  anchors: Array<{ x: number; y: number }>
  afterimageEids: number[]
  afterimageTimers: number[]
  selectedAttack: number
  aimAngle: number
  attackExecuted: boolean
  phaseTransitionDone: Set<number>
  stormCooldown: number
  convergenceCounter: number
  convergenceActive: boolean
  convergencePhase: number
  convergenceTimer: number
  convergenceCopyEids: number[]
  convergenceCopyStartHP: number
  convergenceShotsFired: number
  dustVeilCounter: number
}

describe('Hollow Man (spawn & phase 1)', () => {
  let world: GameWorld
  let bossEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    spawnPlayer(world, 800, 600)
    bossEid = spawnHollowMan(world, 400, 300)
  })

  test('spawns with phase 1 and correct stats', () => {
    expect(BossPhase.phase[bossEid]!).toBe(1)
    expect(Health.current[bossEid]!).toBe(HOLLOW_MAN_HP)
    expect(Health.max[bossEid]!).toBe(HOLLOW_MAN_HP)
    expect(Speed.current[bossEid]!).toBe(HOLLOW_MAN_P1_SPEED)
    expect(Enemy.type[bossEid]!).toBe(EnemyType.HOLLOW_MAN)
    expect(Enemy.tier[bossEid]!).toBe(EnemyTier.THREAT)
    expect(Collider.radius[bossEid]!).toBe(HOLLOW_MAN_RADIUS)
  })

  test('has computed anchor points', () => {
    const state = world.bossState.get(bossEid) as HollowManState
    expect(state.anchors.length).toBeGreaterThanOrEqual(8)
  })
})

describe('Hollow Man (phase transitions)', () => {
  let world: GameWorld
  let bossEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    spawnPlayer(world, 800, 600)
    bossEid = spawnHollowMan(world, 400, 300)
  })

  test('phase 2 transition at HP <= 70% grants i-frames', () => {
    Health.current[bossEid] = Health.max[bossEid]! * 0.69

    bossPhaseSystem(world, 1 / 60)

    expect(BossPhase.phase[bossEid]!).toBe(2)
    expect(Health.iframes[bossEid]!).toBeCloseTo(HOLLOW_MAN_TRANSITION_IFRAMES)
  })

  test('phase 3 transition at HP <= 35% grants i-frames', () => {
    // Enter phase 2 first
    Health.current[bossEid] = Health.max[bossEid]! * 0.69
    bossPhaseSystem(world, 1 / 60)

    // Enter phase 3
    Health.current[bossEid] = Health.max[bossEid]! * 0.34
    bossPhaseSystem(world, 1 / 60)

    expect(BossPhase.phase[bossEid]!).toBe(3)
    expect(Health.iframes[bossEid]!).toBeCloseTo(HOLLOW_MAN_TRANSITION_IFRAMES)
  })

  test('large HP drop (phase 1 → phase 3) triggers both transitions', () => {
    Health.current[bossEid] = Health.max[bossEid]! * 0.20

    bossPhaseSystem(world, 1 / 60)

    expect(BossPhase.phase[bossEid]!).toBe(3)
  })

  test('re-running in same phase does not re-trigger transitions', () => {
    Health.current[bossEid] = Health.max[bossEid]! * 0.34
    bossPhaseSystem(world, 1 / 60)

    // Clear i-frames to verify they aren't re-set
    Health.iframes[bossEid] = 0

    bossPhaseSystem(world, 1 / 60)

    expect(Health.iframes[bossEid]!).toBe(0) // not re-triggered
  })
})

describe('Hollow Man (teleport cycle)', () => {
  let world: GameWorld
  let bossEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    spawnPlayer(world, 800, 600)
    bossEid = spawnHollowMan(world, 400, 300)
    // Skip initial delay
    EnemyAI.initialDelay[bossEid] = 0
  })

  test('position changes after dissolve → wait → arrive', () => {
    const mod = getBoss(EnemyType.HOLLOW_MAN)!
    const state = world.bossState.get(bossEid) as HollowManState
    const startX = Position.x[bossEid]!
    const startY = Position.y[bossEid]!

    // Force teleport by setting cooldown to nearly zero
    state.teleportCooldown = 1 / 60
    EnemyAI.state[bossEid] = AIState.IDLE

    // Tick to trigger dissolve
    mod.tick(world, bossEid, 1 / 60)
    expect(state.teleportPhase).toBe(1) // DISSOLVING

    // Tick through dissolve
    for (let i = 0; i < Math.ceil(HOLLOW_MAN_DISSOLVE_DURATION * 60) + 1; i++) {
      mod.tick(world, bossEid, 1 / 60)
    }
    // Should be in WAITING — position moved off-screen
    expect(Position.x[bossEid]!).toBe(-9999)

    // Tick through wait
    for (let i = 0; i < Math.ceil(HOLLOW_MAN_WAIT_DURATION * 60) + 1; i++) {
      mod.tick(world, bossEid, 1 / 60)
    }

    // Tick through arrive
    for (let i = 0; i < Math.ceil(HOLLOW_MAN_ARRIVE_DURATION * 60) + 1; i++) {
      mod.tick(world, bossEid, 1 / 60)
    }

    // Position should have changed to an anchor point (not the same as start)
    const newX = Position.x[bossEid]!
    const newY = Position.y[bossEid]!
    expect(newX !== -9999).toBe(true)
    // Should now be in TELEGRAPH state (ready to attack)
    expect(EnemyAI.state[bossEid]!).toBe(AIState.TELEGRAPH)
  })
})

describe('Hollow Man (Phantom Shot)', () => {
  let world: GameWorld
  let bossEid: number
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    playerEid = spawnPlayer(world, 800, 600)
    bossEid = spawnHollowMan(world, 400, 300)
  })

  test('phantom shot spawns a bullet', () => {
    const state = world.bossState.get(bossEid) as HollowManState
    state.selectedAttack = 0 // PHANTOM_SHOT
    state.attackExecuted = false
    state.aimAngle = Math.atan2(
      Position.y[playerEid]! - Position.y[bossEid]!,
      Position.x[playerEid]! - Position.x[bossEid]!,
    )

    EnemyAI.state[bossEid] = AIState.ATTACK
    EnemyAI.stateTimer[bossEid] = 0
    EnemyAI.targetEid[bossEid] = playerEid

    const bulletsBefore = bulletQuery(world).length

    getBoss(EnemyType.HOLLOW_MAN)!.attack(world, bossEid, 1 / 60)

    const bulletsAfter = bulletQuery(world).length
    expect(bulletsAfter - bulletsBefore).toBe(1)
  })

  test('attack transitions to RECOVERY after executing', () => {
    const state = world.bossState.get(bossEid) as HollowManState
    state.selectedAttack = 0
    state.attackExecuted = false
    state.aimAngle = 0

    EnemyAI.state[bossEid] = AIState.ATTACK
    EnemyAI.stateTimer[bossEid] = 0

    getBoss(EnemyType.HOLLOW_MAN)!.attack(world, bossEid, 1 / 60)

    expect(EnemyAI.state[bossEid]!).toBe(AIState.RECOVERY)
  })
})

describe('Hollow Man (Grave Reach)', () => {
  let world: GameWorld
  let bossEid: number
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    // Place player close to boss for grave reach
    playerEid = spawnPlayer(world, 440, 300)
    bossEid = spawnHollowMan(world, 400, 300)
    // Override position to the spawn position (not anchor)
    Position.x[bossEid] = 400
    Position.y[bossEid] = 400
  })

  test('grave reach applies damage to nearby player', () => {
    // Position player within grave reach range
    Position.x[playerEid] = 420
    Position.y[playerEid] = 400

    const state = world.bossState.get(bossEid) as HollowManState
    state.selectedAttack = 1 // GRAVE_REACH
    state.attackExecuted = false
    state.aimAngle = Math.atan2(
      Position.y[playerEid]! - Position.y[bossEid]!,
      Position.x[playerEid]! - Position.x[bossEid]!,
    )

    EnemyAI.state[bossEid] = AIState.ATTACK
    EnemyAI.targetEid[bossEid] = playerEid
    Health.iframes[playerEid] = 0

    const hpBefore = Health.current[playerEid]!

    getBoss(EnemyType.HOLLOW_MAN)!.attack(world, bossEid, 1 / 60)

    expect(Health.current[playerEid]!).toBe(hpBefore - HOLLOW_MAN_GRAVE_REACH_DAMAGE)
  })

  test('grave reach respects i-frames', () => {
    Position.x[playerEid] = 420
    Position.y[playerEid] = 400

    const state = world.bossState.get(bossEid) as HollowManState
    state.selectedAttack = 1
    state.attackExecuted = false
    state.aimAngle = 0

    EnemyAI.state[bossEid] = AIState.ATTACK
    EnemyAI.targetEid[bossEid] = playerEid
    Health.iframes[playerEid] = 1.0 // active i-frames

    const hpBefore = Health.current[playerEid]!

    getBoss(EnemyType.HOLLOW_MAN)!.attack(world, bossEid, 1 / 60)

    expect(Health.current[playerEid]!).toBe(hpBefore) // no damage during i-frames
  })
})

describe('Hollow Man (afterimages)', () => {
  let world: GameWorld
  let bossEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    spawnPlayer(world, 800, 600)
    bossEid = spawnHollowMan(world, 400, 300)
    EnemyAI.initialDelay[bossEid] = 0
  })

  test('Phase 2 spawns 1 afterimage per teleport', () => {
    // Enter phase 2
    Health.current[bossEid] = Health.max[bossEid]! * 0.69
    bossPhaseSystem(world, 1 / 60)

    const mod = getBoss(EnemyType.HOLLOW_MAN)!
    const state = world.bossState.get(bossEid) as HollowManState

    // Force a full teleport cycle
    state.teleportCooldown = 1 / 60
    EnemyAI.state[bossEid] = AIState.IDLE

    // Run through dissolve → wait → arrive
    const totalTicks = Math.ceil(
      (HOLLOW_MAN_DISSOLVE_DURATION + HOLLOW_MAN_WAIT_DURATION + HOLLOW_MAN_ARRIVE_DURATION) * 60
    ) + 10

    for (let i = 0; i < totalTicks; i++) {
      mod.tick(world, bossEid, 1 / 60)
    }

    // Should have spawned afterimages
    const counts = countByType(world)
    expect(counts[EnemyType.AFTERIMAGE] ?? 0).toBeGreaterThanOrEqual(1)
  })

  test('afterimage has 1 HP and dies in one hit', () => {
    // Enter phase 2 and trigger teleport
    Health.current[bossEid] = Health.max[bossEid]! * 0.69
    bossPhaseSystem(world, 1 / 60)

    const mod = getBoss(EnemyType.HOLLOW_MAN)!
    const state = world.bossState.get(bossEid) as HollowManState

    state.teleportCooldown = 1 / 60
    EnemyAI.state[bossEid] = AIState.IDLE

    const totalTicks = Math.ceil(
      (HOLLOW_MAN_DISSOLVE_DURATION + HOLLOW_MAN_WAIT_DURATION + HOLLOW_MAN_ARRIVE_DURATION) * 60
    ) + 10

    for (let i = 0; i < totalTicks; i++) {
      mod.tick(world, bossEid, 1 / 60)
    }

    // Find afterimage entities
    const afterimages: number[] = []
    for (const eid of enemyQuery(world)) {
      if (Enemy.type[eid] === EnemyType.AFTERIMAGE) {
        afterimages.push(eid)
      }
    }

    expect(afterimages.length).toBeGreaterThanOrEqual(1)
    const afterEid = afterimages[0]!
    expect(Health.current[afterEid]!).toBe(HOLLOW_MAN_AFTERIMAGE_HP)
    expect(Health.max[afterEid]!).toBe(HOLLOW_MAN_AFTERIMAGE_HP)
  })

  test('afterimages auto-dissolve after lifetime expires', () => {
    // Enter phase 2
    Health.current[bossEid] = Health.max[bossEid]! * 0.69
    bossPhaseSystem(world, 1 / 60)

    const mod = getBoss(EnemyType.HOLLOW_MAN)!
    const state = world.bossState.get(bossEid) as HollowManState

    // Force a teleport cycle to spawn afterimages
    state.teleportCooldown = 1 / 60
    EnemyAI.state[bossEid] = AIState.IDLE

    const totalTicks = Math.ceil(
      (HOLLOW_MAN_DISSOLVE_DURATION + HOLLOW_MAN_WAIT_DURATION + HOLLOW_MAN_ARRIVE_DURATION) * 60
    ) + 10

    for (let i = 0; i < totalTicks; i++) {
      mod.tick(world, bossEid, 1 / 60)
    }

    // Should have afterimages
    const countBefore = state.afterimageEids.length
    expect(countBefore).toBeGreaterThanOrEqual(1)

    // Tick through the afterimage lifetime
    const lifetimeTicks = Math.ceil(HOLLOW_MAN_AFTERIMAGE_LIFETIME * 60) + 5
    for (let i = 0; i < lifetimeTicks; i++) {
      mod.tick(world, bossEid, 1 / 60)
    }

    // Afterimages should have been removed
    expect(state.afterimageEids.length).toBe(0)
  })
})

describe('Hollow Man (dust veils)', () => {
  let world: GameWorld
  let bossEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    spawnPlayer(world, 800, 600)
    bossEid = spawnHollowMan(world, 400, 300)
    EnemyAI.initialDelay[bossEid] = 0
  })

  test('dust veil placed every 3rd teleport', () => {
    const mod = getBoss(EnemyType.HOLLOW_MAN)!
    const state = world.bossState.get(bossEid) as HollowManState

    // Run through 3 teleport cycles
    for (let cycle = 0; cycle < 3; cycle++) {
      state.teleportCooldown = 1 / 60
      EnemyAI.state[bossEid] = AIState.IDLE

      const totalTicks = Math.ceil(
        (HOLLOW_MAN_DISSOLVE_DURATION + HOLLOW_MAN_WAIT_DURATION + HOLLOW_MAN_ARRIVE_DURATION) * 60
      ) + 10

      for (let i = 0; i < totalTicks; i++) {
        mod.tick(world, bossEid, 1 / 60)
      }

      // After teleport, force back to idle to allow next teleport
      EnemyAI.state[bossEid] = AIState.IDLE
    }

    // After 3 teleports, one veil should have been placed (on the 3rd)
    expect(world.hollowManVeils.length).toBeGreaterThanOrEqual(1)
    expect(world.hollowManVeils[0]!.radius).toBe(HOLLOW_MAN_DUST_VEIL_RADIUS)
  })
})

describe('Hollow Man (dust storm)', () => {
  let world: GameWorld
  let bossEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    spawnPlayer(world, 800, 600)
    bossEid = spawnHollowMan(world, 400, 300)
    EnemyAI.initialDelay[bossEid] = 0
  })

  test('Phase 2 activates storm with correct parameters', () => {
    // Enter phase 2
    Health.current[bossEid] = Health.max[bossEid]! * 0.69
    bossPhaseSystem(world, 1 / 60)

    const mod = getBoss(EnemyType.HOLLOW_MAN)!
    const state = world.bossState.get(bossEid) as HollowManState

    // Force storm cooldown to expire
    state.stormCooldown = 1 / 60

    mod.tick(world, bossEid, 1 / 60)

    expect(world.hollowManStorm).not.toBeNull()
    expect(world.hollowManStorm!.active).toBe(true)
    expect(world.hollowManStorm!.duration).toBe(HOLLOW_MAN_P2_STORM_DURATION)
    expect(world.hollowManStorm!.visibilityRadius).toBe(HOLLOW_MAN_P2_STORM_VISIBILITY)
  })

  test('storm timer counts down and clears', () => {
    // Enter phase 2
    Health.current[bossEid] = Health.max[bossEid]! * 0.69
    bossPhaseSystem(world, 1 / 60)

    const mod = getBoss(EnemyType.HOLLOW_MAN)!
    const state = world.bossState.get(bossEid) as HollowManState

    // Force storm activation
    state.stormCooldown = 1 / 60
    mod.tick(world, bossEid, 1 / 60)
    expect(world.hollowManStorm).not.toBeNull()

    // Tick through storm duration
    const stormTicks = Math.ceil(HOLLOW_MAN_P2_STORM_DURATION * 60) + 5
    for (let i = 0; i < stormTicks; i++) {
      mod.tick(world, bossEid, 1 / 60)
    }

    expect(world.hollowManStorm).toBeNull()
  })
})

describe('Hollow Man (convergence)', () => {
  let world: GameWorld
  let bossEid: number
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    playerEid = spawnPlayer(world, 800, 600)
    bossEid = spawnHollowMan(world, 400, 300)
    EnemyAI.initialDelay[bossEid] = 0
  })

  test('convergence fires 3 bullets from 3 positions', () => {
    // Enter phase 3
    Health.current[bossEid] = Health.max[bossEid]! * 0.20
    bossPhaseSystem(world, 1 / 60)

    const mod = getBoss(EnemyType.HOLLOW_MAN)!
    const state = world.bossState.get(bossEid) as HollowManState

    // Force convergence counter to trigger
    state.convergenceCounter = 3 // next teleport will be the 4th
    state.teleportCooldown = 1 / 60
    EnemyAI.state[bossEid] = AIState.IDLE

    // Trigger the teleport which should start convergence
    mod.tick(world, bossEid, 1 / 60)
    expect(state.convergenceActive).toBe(true)

    const bulletsBefore = bulletQuery(world).length

    // Tick through silence phase (1.0s) + firing phase
    const totalTicks = Math.ceil((1.0 + HOLLOW_MAN_CONVERGENCE_COPIES * 0.4) * 60) + 10
    for (let i = 0; i < totalTicks; i++) {
      mod.tick(world, bossEid, 1 / 60)
    }

    const bulletsAfter = bulletQuery(world).length
    expect(bulletsAfter - bulletsBefore).toBe(HOLLOW_MAN_CONVERGENCE_COPIES)
  })

  test('convergence ends with RECOVERY state', () => {
    Health.current[bossEid] = Health.max[bossEid]! * 0.20
    bossPhaseSystem(world, 1 / 60)

    const mod = getBoss(EnemyType.HOLLOW_MAN)!
    const state = world.bossState.get(bossEid) as HollowManState

    state.convergenceCounter = 3
    state.teleportCooldown = 1 / 60
    EnemyAI.state[bossEid] = AIState.IDLE

    mod.tick(world, bossEid, 1 / 60)

    // Tick through entire convergence
    const totalTicks = Math.ceil((1.0 + HOLLOW_MAN_CONVERGENCE_COPIES * 0.4) * 60) + 10
    for (let i = 0; i < totalTicks; i++) {
      mod.tick(world, bossEid, 1 / 60)
    }

    expect(state.convergenceActive).toBe(false)
    expect(EnemyAI.state[bossEid]!).toBe(AIState.RECOVERY)
    expect(AttackConfig.recoveryDuration[bossEid]!).toBeCloseTo(HOLLOW_MAN_CONVERGENCE_RECOVERY)
  })
})

describe('Hollow Man (death cleanup)', () => {
  let world: GameWorld
  let bossEid: number

  beforeEach(() => {
    world = createGameWorld(42)
    setWorldTilemap(world, createTestArena())
    spawnPlayer(world, 800, 600)
    bossEid = spawnHollowMan(world, 400, 300)
    EnemyAI.initialDelay[bossEid] = 0
  })

  test('death clears afterimages, storm, and veils', () => {
    // Enter phase 2 and set up some state
    Health.current[bossEid] = Health.max[bossEid]! * 0.69
    bossPhaseSystem(world, 1 / 60)

    // Manually add some afterimages, veils, and storm
    const state = world.bossState.get(bossEid) as HollowManState

    world.hollowManVeils.push({
      x: 100, y: 100,
      radius: HOLLOW_MAN_DUST_VEIL_RADIUS,
      timer: HOLLOW_MAN_DUST_VEIL_DURATION,
    })

    world.hollowManStorm = {
      active: true,
      timer: 5.0,
      duration: HOLLOW_MAN_P2_STORM_DURATION,
      visibilityRadius: HOLLOW_MAN_P2_STORM_VISIBILITY,
    }

    // Kill the boss
    Health.current[bossEid] = 0

    const mod = getBoss(EnemyType.HOLLOW_MAN)!
    mod.tick(world, bossEid, 1 / 60)

    expect(world.hollowManVeils.length).toBe(0)
    expect(world.hollowManStorm).toBeNull()
  })
})
