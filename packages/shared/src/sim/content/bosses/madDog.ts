/**
 * Mad Dog Maguire Boss Module
 *
 * Pure melee berserker boss for Stage 1. Wields a prison ball-and-chain.
 * Three-phase escalation: Chain Sweep/Slam → add Whirlwind/Lunge → add Ground Pound.
 */

import { addEntity, addComponent, hasComponent, defineQuery } from 'bitecs'
import type { GameWorld } from '../../world'
import type { BossModule } from './registry'
import { registerBoss } from './registry'
import {
  Position, Velocity, Speed, Collider, Health,
  Enemy, EnemyType, EnemyTier, BossPhase,
  EnemyAI, AIState, Detection, AttackConfig, Steering,
  Player, Invincible, Dead, Knockback,
} from '../../components'
import { NO_TARGET, spawnSwarmer } from '../../prefabs'
import { transition } from '../../systems/enemyAI'
import { applyDamage } from '../../systems/applyDamage'
import { isInArc } from '../../systems/melee'
import { isSolidAt } from '../../tilemap'
import { addEnemyComponents, setEnemyDefaults } from './helpers'

const playerQuery = defineQuery([Player, Position, Health])

// ============================================================================
// Constants
// ============================================================================

const HP = 200
const RADIUS = 20
const AGGRO_RANGE = 450
const ATTACK_RANGE = 70
const DROP_CHANCE = 0.50

// Phase thresholds (HP ratio)
const P2_THRESHOLD = 0.70
const P3_THRESHOLD = 0.35

// Phase 1 tuning
const P1_SPEED = 65
const P1_COOLDOWN = 1.6
const P1_SWEEP_TELEGRAPH = 0.50
const P1_SWEEP_RECOVERY = 0.70
const P1_SLAM_TELEGRAPH = 0.60
const P1_SLAM_RECOVERY = 0.90

// Phase 2 tuning
const P2_SPEED = 75
const P2_COOLDOWN = 1.2
const P2_SWEEP_TELEGRAPH = 0.45
const P2_SWEEP_RECOVERY = 0.70
const P2_SLAM_TELEGRAPH = 0.55
const P2_SLAM_RECOVERY = 0.80

// Phase 3 tuning
const P3_SPEED = 60
const P3_COOLDOWN = 0.8
const P3_SWEEP_TELEGRAPH = 0.40
const P3_SWEEP_RECOVERY = 0.70
const P3_SLAM_TELEGRAPH = 0.50
const P3_SLAM_RECOVERY = 0.70

// Transition i-frames
const TRANSITION_IFRAMES = 0.45
// Phase 3 spawns
const P3_SUMMON_SWARMERS = 2

// Attack constants
const SWEEP_RANGE = 70
const SWEEP_DAMAGE = 10
const SWEEP_ARC_P1P2 = Math.PI       // 180°
const SWEEP_ARC_P3 = Math.PI * 2     // 360°
const SWEEP_KB_SPEED = 200
const SWEEP_KB_DURATION = 0.12

const SLAM_RADIUS = 40
const SLAM_DAMAGE = 14

const WHIRLWIND_TELEGRAPH = 0.40
const WHIRLWIND_RECOVERY = 0.60
const WHIRLWIND_DURATION = 1.5
const WHIRLWIND_RADIUS = 60
const WHIRLWIND_DAMAGE = 8
const WHIRLWIND_HIT_COOLDOWN = 0.75
const WHIRLWIND_SPEED_MUL = 0.50

const LUNGE_TELEGRAPH = 0.40
const LUNGE_RECOVERY = 0.50
const LUNGE_DURATION = 0.3
const LUNGE_SPEED = 400
const LUNGE_DAMAGE = 10
const LUNGE_KB_SPEED = 250
const LUNGE_KB_DURATION = 0.15
const LUNGE_MIN_DIST = 80
const LUNGE_MAX_DIST = 140

const GROUND_POUND_TELEGRAPH = 0.50
const GROUND_POUND_RECOVERY = 0.80
const GROUND_POUND_DAMAGE = 10
const GROUND_POUND_AOE_RADIUS = 30
const GROUND_POUND_CRACK_RADIUS = 30
/** Speed multiplier applied to players standing in a ground crack zone */
const GROUND_CRACK_SPEED_MUL = 0.8
const GROUND_POUND_SHOCKWAVE_MAX_RADIUS = 200
const GROUND_POUND_SHOCKWAVE_SPEED = 200
const GROUND_POUND_SHOCKWAVE_RING_WIDTH = 15
const GROUND_POUND_SHOCKWAVE_DAMAGE = 6
const GROUND_POUND_CADENCE = 3

// Spawn summon helpers
const SUMMON_MIN_RADIUS = 64
const SUMMON_MAX_RADIUS = 160
const SUMMON_MAX_ATTEMPTS = 12

// ============================================================================
// Attack type enum
// ============================================================================

const MadDogAttack = {
  CHAIN_SWEEP: 0,
  OVERHEAD_SLAM: 1,
  CHAIN_WHIRLWIND: 2,
  SHACKLE_LUNGE: 3,
  GROUND_POUND: 4,
} as const

// ============================================================================
// Per-boss state (stored in world.bossState)
// ============================================================================

interface MadDogState {
  selectedAttack: number
  /** Locked slam target position */
  slamTargetX: number
  slamTargetY: number
  /** Locked lunge direction (unit vector) */
  lungeAimX: number
  lungeAimY: number
  /** Per-entity whirlwind hit cooldowns */
  whirlwindHitTimers: Map<number, number>
  /** Attack counter for Ground Pound cadence */
  attackCounter: number
  /** Phases whose transitions have already fired */
  phaseTransitionDone: Set<number>
  /** Whether attack has executed its single-tick damage */
  attackExecuted: boolean
}

function createMadDogState(): MadDogState {
  return {
    selectedAttack: MadDogAttack.CHAIN_SWEEP,
    slamTargetX: 0,
    slamTargetY: 0,
    lungeAimX: 0,
    lungeAimY: 0,
    whirlwindHitTimers: new Map(),
    attackCounter: 0,
    phaseTransitionDone: new Set(),
    attackExecuted: false,
  }
}

function getState(world: GameWorld, eid: number): MadDogState {
  return world.bossState.get(eid) as MadDogState
}

// ============================================================================
// Helpers
// ============================================================================

function getDesiredPhase(hpRatio: number): number {
  if (hpRatio <= P3_THRESHOLD) return 3
  if (hpRatio <= P2_THRESHOLD) return 2
  return 1
}

function pickSummonPosition(
  world: GameWorld,
  centerX: number,
  centerY: number,
): { x: number; y: number } {
  const tilemap = world.tilemap
  for (let i = 0; i < SUMMON_MAX_ATTEMPTS; i++) {
    const angle = world.rng.next() * Math.PI * 2
    const dist = SUMMON_MIN_RADIUS + world.rng.next() * (SUMMON_MAX_RADIUS - SUMMON_MIN_RADIUS)
    const x = centerX + Math.cos(angle) * dist
    const y = centerY + Math.sin(angle) * dist
    if (tilemap && isSolidAt(tilemap, x, y)) continue
    return { x, y }
  }
  // Fallback: spawn adjacent to boss
  return { x: centerX + SUMMON_MIN_RADIUS, y: centerY }
}

// ============================================================================
// Attack selection
// ============================================================================

function selectAttack(world: GameWorld, eid: number, state: MadDogState): number {
  const phase = BossPhase.phase[eid]!
  const targetEid = EnemyAI.targetEid[eid]!

  // Phase 3: force Ground Pound every Nth attack
  if (phase >= 3 && state.attackCounter > 0 && state.attackCounter % GROUND_POUND_CADENCE === 0) {
    return MadDogAttack.GROUND_POUND
  }

  // Check lunge eligibility (player at 80-140px distance)
  let lungeEligible = false
  if (phase >= 2 && targetEid !== NO_TARGET && hasComponent(world, Position, targetEid)) {
    const dx = Position.x[targetEid]! - Position.x[eid]!
    const dy = Position.y[targetEid]! - Position.y[eid]!
    const dist = Math.sqrt(dx * dx + dy * dy)
    lungeEligible = dist >= LUNGE_MIN_DIST && dist <= LUNGE_MAX_DIST
  }

  // Build weighted pool
  const pool: Array<[number, number]> = []

  // Chain Sweep — high weight (bread-and-butter)
  pool.push([MadDogAttack.CHAIN_SWEEP, 3])
  // Overhead Slam
  pool.push([MadDogAttack.OVERHEAD_SLAM, 2])

  if (phase >= 2) {
    pool.push([MadDogAttack.CHAIN_WHIRLWIND, 2])
    if (lungeEligible) {
      pool.push([MadDogAttack.SHACKLE_LUNGE, 2])
    }
  }

  // Weighted random selection
  let totalWeight = 0
  for (const [, w] of pool) totalWeight += w
  let roll = world.rng.next() * totalWeight
  for (const [attack, w] of pool) {
    roll -= w
    if (roll <= 0) return attack
  }
  return pool[pool.length - 1]![0]
}

function getTelegraphDuration(attack: number, phase: number): number {
  switch (attack) {
    case MadDogAttack.CHAIN_SWEEP:
      return phase === 1 ? P1_SWEEP_TELEGRAPH : phase === 2 ? P2_SWEEP_TELEGRAPH : P3_SWEEP_TELEGRAPH
    case MadDogAttack.OVERHEAD_SLAM:
      return phase === 1 ? P1_SLAM_TELEGRAPH : phase === 2 ? P2_SLAM_TELEGRAPH : P3_SLAM_TELEGRAPH
    case MadDogAttack.CHAIN_WHIRLWIND:
      return WHIRLWIND_TELEGRAPH
    case MadDogAttack.SHACKLE_LUNGE:
      return LUNGE_TELEGRAPH
    case MadDogAttack.GROUND_POUND:
      return GROUND_POUND_TELEGRAPH
    default:
      return P1_SWEEP_TELEGRAPH
  }
}

function getRecoveryDuration(attack: number, phase: number): number {
  switch (attack) {
    case MadDogAttack.CHAIN_SWEEP:
      return phase === 1 ? P1_SWEEP_RECOVERY : phase === 2 ? P2_SWEEP_RECOVERY : P3_SWEEP_RECOVERY
    case MadDogAttack.OVERHEAD_SLAM:
      return phase === 1 ? P1_SLAM_RECOVERY : phase === 2 ? P2_SLAM_RECOVERY : P3_SLAM_RECOVERY
    case MadDogAttack.CHAIN_WHIRLWIND:
      return WHIRLWIND_RECOVERY
    case MadDogAttack.SHACKLE_LUNGE:
      return LUNGE_RECOVERY
    case MadDogAttack.GROUND_POUND:
      return GROUND_POUND_RECOVERY
    default:
      return P1_SWEEP_RECOVERY
  }
}

// ============================================================================
// Spawn
// ============================================================================

function spawn(world: GameWorld, x: number, y: number): number {
  const eid = addEntity(world)
  addEnemyComponents(world, eid)
  addComponent(world, BossPhase, eid)
  setEnemyDefaults(world, eid, x, y)

  Enemy.type[eid] = EnemyType.MAD_DOG
  Enemy.tier[eid] = EnemyTier.THREAT

  Speed.current[eid] = P1_SPEED
  Speed.max[eid] = P1_SPEED
  Collider.radius[eid] = RADIUS
  Health.current[eid] = HP
  Health.max[eid] = HP

  Detection.aggroRange[eid] = AGGRO_RANGE
  Detection.attackRange[eid] = ATTACK_RANGE
  Steering.preferredRange[eid] = 0
  Steering.separationRadius[eid] = 32

  BossPhase.phase[eid] = 1

  // Phase 1 attack tuning (defaults; overridden per-attack in tick)
  AttackConfig.telegraphDuration[eid] = P1_SWEEP_TELEGRAPH
  AttackConfig.recoveryDuration[eid] = P1_SWEEP_RECOVERY
  AttackConfig.cooldown[eid] = P1_COOLDOWN
  AttackConfig.damage[eid] = SWEEP_DAMAGE
  AttackConfig.projectileCount[eid] = 0 // melee boss
  AttackConfig.projectileSpeed[eid] = 0
  AttackConfig.spreadAngle[eid] = 0

  world.bossState.set(eid, createMadDogState())
  return eid
}

// ============================================================================
// Phase transitions (tick)
// ============================================================================

function tick(world: GameWorld, eid: number, _dt: number): void {
  const currentPhase = BossPhase.phase[eid]!
  const hpRatio = Health.current[eid]! / Math.max(1, Health.max[eid]!)
  const desired = getDesiredPhase(hpRatio)
  const state = getState(world, eid)

  // Process each skipped phase (handles large HP drops)
  for (let p = currentPhase + 1; p <= desired; p++) {
    if (state.phaseTransitionDone.has(p)) continue
    state.phaseTransitionDone.add(p)

    if (p === 2) {
      // Phase 2: faster, more attacks
      Speed.current[eid] = P2_SPEED
      Speed.max[eid] = P2_SPEED
      AttackConfig.cooldown[eid] = P2_COOLDOWN
      Health.iframes[eid] = TRANSITION_IFRAMES
      AttackConfig.cooldownRemaining[eid] = 0
      EnemyAI.state[eid] = AIState.TELEGRAPH
      EnemyAI.stateTimer[eid] = 0
    }

    if (p === 3) {
      // Phase 3: slower but relentless, spawns swarmers
      Speed.current[eid] = P3_SPEED
      Speed.max[eid] = P3_SPEED
      AttackConfig.cooldown[eid] = P3_COOLDOWN
      Health.iframes[eid] = TRANSITION_IFRAMES
      AttackConfig.cooldownRemaining[eid] = 0
      EnemyAI.state[eid] = AIState.TELEGRAPH
      EnemyAI.stateTimer[eid] = 0

      // Spawn swarmers
      const cx = Position.x[eid]!
      const cy = Position.y[eid]!
      for (let i = 0; i < P3_SUMMON_SWARMERS; i++) {
        const pos = pickSummonPosition(world, cx, cy)
        spawnSwarmer(world, pos.x, pos.y)
      }
    }
  }

  BossPhase.phase[eid] = desired

  // Select attack on first tick of TELEGRAPH
  if (EnemyAI.state[eid] === AIState.TELEGRAPH && EnemyAI.stateTimer[eid]! === 0) {
    state.attackCounter++
    const attack = selectAttack(world, eid, state)
    state.selectedAttack = attack
    state.attackExecuted = false

    // Set per-attack telegraph/recovery durations
    const phase = BossPhase.phase[eid]!
    AttackConfig.telegraphDuration[eid] = getTelegraphDuration(attack, phase)
    AttackConfig.recoveryDuration[eid] = getRecoveryDuration(attack, phase)

    // Lock target data for positional attacks
    const targetEid = EnemyAI.targetEid[eid]!
    if (targetEid !== NO_TARGET && hasComponent(world, Position, targetEid)) {
      if (attack === MadDogAttack.OVERHEAD_SLAM || attack === MadDogAttack.GROUND_POUND) {
        state.slamTargetX = Position.x[targetEid]!
        state.slamTargetY = Position.y[targetEid]!
      }
      if (attack === MadDogAttack.SHACKLE_LUNGE) {
        const dx = Position.x[targetEid]! - Position.x[eid]!
        const dy = Position.y[targetEid]! - Position.y[eid]!
        const len = Math.sqrt(dx * dx + dy * dy)
        if (len > 0) {
          state.lungeAimX = dx / len
          state.lungeAimY = dy / len
        }
      }
    }

    // Clear whirlwind hit timers at start of any new attack
    state.whirlwindHitTimers.clear()
  }
}

// ============================================================================
// Attack execution
// ============================================================================

function attack(world: GameWorld, eid: number, dt: number): void {
  const state = getState(world, eid)
  const selected = state.selectedAttack
  const phase = BossPhase.phase[eid]!

  switch (selected) {
    case MadDogAttack.CHAIN_SWEEP:
      executeChainSweep(world, eid, state, phase)
      break
    case MadDogAttack.OVERHEAD_SLAM:
      executeOverheadSlam(world, eid, state)
      break
    case MadDogAttack.CHAIN_WHIRLWIND:
      executeWhirlwind(world, eid, state, dt)
      break
    case MadDogAttack.SHACKLE_LUNGE:
      executeLunge(world, eid, state, dt)
      break
    case MadDogAttack.GROUND_POUND:
      executeGroundPound(world, eid, state)
      break
  }
}

function executeChainSweep(world: GameWorld, eid: number, state: MadDogState, phase: number): void {
  if (state.attackExecuted) {
    transition(eid, AIState.RECOVERY)
    return
  }
  state.attackExecuted = true

  const ex = Position.x[eid]!
  const ey = Position.y[eid]!
  const targetEid = EnemyAI.targetEid[eid]!

  // Determine aim angle toward target
  let aimAngle = 0
  if (targetEid !== NO_TARGET && hasComponent(world, Position, targetEid)) {
    aimAngle = Math.atan2(Position.y[targetEid]! - ey, Position.x[targetEid]! - ex)
  }

  const arcHalf = phase >= 3 ? SWEEP_ARC_P3 / 2 : SWEEP_ARC_P1P2 / 2

  // Check all player entities in range
  hitPlayersInArc(world, eid, ex, ey, aimAngle, arcHalf, SWEEP_RANGE, SWEEP_DAMAGE, SWEEP_KB_SPEED, SWEEP_KB_DURATION)

  world.tremorThisTick = true
  transition(eid, AIState.RECOVERY)
}

function executeOverheadSlam(world: GameWorld, eid: number, state: MadDogState): void {
  if (state.attackExecuted) {
    transition(eid, AIState.RECOVERY)
    return
  }
  state.attackExecuted = true

  // AoE at locked target position
  hitPlayersInRadius(world, eid, state.slamTargetX, state.slamTargetY, SLAM_RADIUS, SLAM_DAMAGE)

  world.tremorThisTick = true
  transition(eid, AIState.RECOVERY)
}

function executeWhirlwind(world: GameWorld, eid: number, state: MadDogState, dt: number): void {
  const timer = EnemyAI.stateTimer[eid]!

  // Advance toward target at reduced speed
  const targetEid = EnemyAI.targetEid[eid]!
  if (targetEid !== NO_TARGET && hasComponent(world, Position, targetEid)) {
    const dx = Position.x[targetEid]! - Position.x[eid]!
    const dy = Position.y[targetEid]! - Position.y[eid]!
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist > 0) {
      const spd = Speed.current[eid]! * WHIRLWIND_SPEED_MUL
      Velocity.x[eid] = (dx / dist) * spd
      Velocity.y[eid] = (dy / dist) * spd
    }
  }

  // Tick down whirlwind hit cooldowns
  for (const [hitEid, remaining] of state.whirlwindHitTimers) {
    const newVal = remaining - dt
    if (newVal <= 0) {
      state.whirlwindHitTimers.delete(hitEid)
    } else {
      state.whirlwindHitTimers.set(hitEid, newVal)
    }
  }

  // Contact damage check against all players
  const ex = Position.x[eid]!
  const ey = Position.y[eid]!
  hitPlayersInRadiusWhirlwind(world, eid, ex, ey, WHIRLWIND_RADIUS, WHIRLWIND_DAMAGE, state)

  // Check duration
  if (timer >= WHIRLWIND_DURATION) {
    Velocity.x[eid] = 0
    Velocity.y[eid] = 0
    transition(eid, AIState.RECOVERY)
  }
}

function executeLunge(world: GameWorld, eid: number, state: MadDogState, _dt: number): void {
  const timer = EnemyAI.stateTimer[eid]!

  // Set velocity on first tick
  if (timer === 0) {
    Velocity.x[eid] = state.lungeAimX * LUNGE_SPEED
    Velocity.y[eid] = state.lungeAimY * LUNGE_SPEED
  }

  // Contact check each tick
  const ex = Position.x[eid]!
  const ey = Position.y[eid]!
  const bossR = Collider.radius[eid]!

  const targetEid = EnemyAI.targetEid[eid]!
  if (
    !state.attackExecuted &&
    targetEid !== NO_TARGET &&
    hasComponent(world, Position, targetEid) &&
    hasComponent(world, Health, targetEid) &&
    !hasComponent(world, Dead, targetEid)
  ) {
    const dx = Position.x[targetEid]! - ex
    const dy = Position.y[targetEid]! - ey
    const targetR = Collider.radius[targetEid]!
    const hitDist = bossR + targetR
    if (dx * dx + dy * dy <= hitDist * hitDist) {
      if (Health.iframes[targetEid]! <= 0 && !hasComponent(world, Invincible, targetEid)) {
        applyDamage(world, targetEid, {
          amount: LUNGE_DAMAGE,
          attackerEid: eid,
          setIframes: true,
        })
        const len = Math.sqrt(dx * dx + dy * dy)
        const nx = len > 0 ? dx / len : state.lungeAimX
        const ny = len > 0 ? dy / len : state.lungeAimY
        addComponent(world, Knockback, targetEid)
        Knockback.vx[targetEid] = nx * LUNGE_KB_SPEED
        Knockback.vy[targetEid] = ny * LUNGE_KB_SPEED
        Knockback.duration[targetEid] = LUNGE_KB_DURATION

        world.lastPlayerHitDir.set(targetEid, { x: nx, y: ny })
        state.attackExecuted = true
      }
    }
  }

  // Check lunge duration
  if (timer >= LUNGE_DURATION) {
    Velocity.x[eid] = 0
    Velocity.y[eid] = 0
    transition(eid, AIState.RECOVERY)
  }
}

function executeGroundPound(world: GameWorld, eid: number, state: MadDogState): void {
  if (state.attackExecuted) {
    transition(eid, AIState.RECOVERY)
    return
  }
  state.attackExecuted = true

  const ex = Position.x[eid]!
  const ey = Position.y[eid]!

  // Direct hit AoE at boss position
  hitPlayersInRadius(world, eid, ex, ey, GROUND_POUND_AOE_RADIUS, GROUND_POUND_DAMAGE)

  // Spawn expanding shockwave
  world.bossShockwaves.push({
    x: ex,
    y: ey,
    currentRadius: 0,
    maxRadius: GROUND_POUND_SHOCKWAVE_MAX_RADIUS,
    speed: GROUND_POUND_SHOCKWAVE_SPEED,
    ringWidth: GROUND_POUND_SHOCKWAVE_RING_WIDTH,
    damage: GROUND_POUND_SHOCKWAVE_DAMAGE,
    hitEntities: new Set(),
  })

  // Spawn permanent ground crack
  world.groundCracks.push({
    x: ex,
    y: ey,
    radius: GROUND_POUND_CRACK_RADIUS,
  })

  world.tremorThisTick = true
  transition(eid, AIState.RECOVERY)
}

// ============================================================================
// Damage helpers
// ============================================================================

function hitPlayersInArc(
  world: GameWorld,
  attackerEid: number,
  cx: number,
  cy: number,
  aimAngle: number,
  arcHalf: number,
  reach: number,
  damage: number,
  kbSpeed: number,
  kbDuration: number,
): void {
  const players = playerQuery(world)
  for (const peid of players) {
    if (hasComponent(world, Dead, peid)) continue
    if (Health.iframes[peid]! > 0) continue
    if (hasComponent(world, Invincible, peid)) continue

    const px = Position.x[peid]!
    const py = Position.y[peid]!

    if (!isInArc(cx, cy, aimAngle, arcHalf, reach + Collider.radius[peid]!, px, py)) continue

    applyDamage(world, peid, {
      amount: damage,
      attackerEid,
      setIframes: true,
    })

    // Knockback
    const dx = px - cx
    const dy = py - cy
    const dist = Math.sqrt(dx * dx + dy * dy)
    const nx = dist > 0 ? dx / dist : Math.cos(aimAngle)
    const ny = dist > 0 ? dy / dist : Math.sin(aimAngle)
    addComponent(world, Knockback, peid)
    Knockback.vx[peid] = nx * kbSpeed
    Knockback.vy[peid] = ny * kbSpeed
    Knockback.duration[peid] = kbDuration

    world.lastPlayerHitDir.set(peid, { x: nx, y: ny })
  }
}

function hitPlayersInRadius(
  world: GameWorld,
  attackerEid: number,
  cx: number,
  cy: number,
  radius: number,
  damage: number,
): void {
  const rSq = radius * radius
  const players = playerQuery(world)
  for (const peid of players) {
    if (hasComponent(world, Dead, peid)) continue
    if (Health.iframes[peid]! > 0) continue
    if (hasComponent(world, Invincible, peid)) continue

    const dx = Position.x[peid]! - cx
    const dy = Position.y[peid]! - cy
    if (dx * dx + dy * dy > rSq) continue

    applyDamage(world, peid, {
      amount: damage,
      attackerEid,
      setIframes: true,
    })

    const dist = Math.sqrt(dx * dx + dy * dy)
    // If player exactly at center, push in random direction
    const fallbackAngle = world.rng.next() * Math.PI * 2
    const nx = dist > 0 ? dx / dist : Math.cos(fallbackAngle)
    const ny = dist > 0 ? dy / dist : Math.sin(fallbackAngle)
    world.lastPlayerHitDir.set(peid, { x: nx, y: ny })
  }
}

function hitPlayersInRadiusWhirlwind(
  world: GameWorld,
  attackerEid: number,
  cx: number,
  cy: number,
  radius: number,
  damage: number,
  state: MadDogState,
): void {
  const rSq = radius * radius
  const players = playerQuery(world)
  for (const peid of players) {
    if (hasComponent(world, Dead, peid)) continue
    if (Health.iframes[peid]! > 0) continue
    if (hasComponent(world, Invincible, peid)) continue

    // Per-entity hit cooldown
    if (state.whirlwindHitTimers.has(peid)) continue

    const dx = Position.x[peid]! - cx
    const dy = Position.y[peid]! - cy
    if (dx * dx + dy * dy > rSq) continue

    applyDamage(world, peid, {
      amount: damage,
      attackerEid,
      setIframes: true,
    })

    state.whirlwindHitTimers.set(peid, WHIRLWIND_HIT_COOLDOWN)

    const dist = Math.sqrt(dx * dx + dy * dy)
    const fallbackAngle = world.rng.next() * Math.PI * 2
    const nx = dist > 0 ? dx / dist : Math.cos(fallbackAngle)
    const ny = dist > 0 ? dy / dist : Math.sin(fallbackAngle)
    world.lastPlayerHitDir.set(peid, { x: nx, y: ny })
  }
}

// ============================================================================
// Module registration
// ============================================================================

const madDogModule: BossModule = {
  type: EnemyType.MAD_DOG,
  displayName: 'MAD DOG MAGUIRE',
  color: 0x993311,
  radius: RADIUS,
  dropChance: DROP_CHANCE,
  spawn,
  tick,
  attack,
}

registerBoss(madDogModule)

// ============================================================================
// Test-facing constant exports
// ============================================================================

export const MAD_DOG_HP = HP
export const MAD_DOG_RADIUS = RADIUS
export const MAD_DOG_P1_SPEED = P1_SPEED
export const MAD_DOG_P2_SPEED = P2_SPEED
export const MAD_DOG_P3_SPEED = P3_SPEED
export const MAD_DOG_P1_COOLDOWN = P1_COOLDOWN
export const MAD_DOG_P2_COOLDOWN = P2_COOLDOWN
export const MAD_DOG_P3_COOLDOWN = P3_COOLDOWN
export const MAD_DOG_TRANSITION_IFRAMES = TRANSITION_IFRAMES
export const MAD_DOG_P3_SUMMON_SWARMERS = P3_SUMMON_SWARMERS
export const MAD_DOG_SWEEP_DAMAGE = SWEEP_DAMAGE
export const MAD_DOG_SLAM_DAMAGE = SLAM_DAMAGE
export const MAD_DOG_WHIRLWIND_DAMAGE = WHIRLWIND_DAMAGE
export const MAD_DOG_LUNGE_DAMAGE = LUNGE_DAMAGE
export const MAD_DOG_GROUND_POUND_DAMAGE = GROUND_POUND_DAMAGE
export const MAD_DOG_GROUND_POUND_SHOCKWAVE_DAMAGE = GROUND_POUND_SHOCKWAVE_DAMAGE
export const MAD_DOG_GROUND_POUND_CADENCE = GROUND_POUND_CADENCE
export const MAD_DOG_SWEEP_ARC_P1P2 = SWEEP_ARC_P1P2
export const MAD_DOG_SWEEP_ARC_P3 = SWEEP_ARC_P3
export const MAD_DOG_GROUND_CRACK_SPEED_MUL = GROUND_CRACK_SPEED_MUL
