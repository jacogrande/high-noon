/**
 * Coyote Jane Boss Module
 *
 * Stage 2 trapper boss — a cunning huntress with a bolt-action rifle,
 * bear traps, and caltrops. Three-phase escalation:
 * - Phase 1: Rifle shots + bear trap placement (FLEE behavior)
 * - Phase 2: Adds caltrop scatter + faster fire rate (FLEE behavior)
 * - Phase 3: Switches to hip shots, advances on player, caltrops while moving
 */

import { addEntity, addComponent, hasComponent, defineQuery } from 'bitecs'
import type { GameWorld, TrapZone } from '../../world'
import type { BossModule } from './registry'
import { registerBoss } from './registry'
import {
  Position, Velocity, Speed, Collider, Health,
  Enemy, EnemyType, EnemyTier, BossPhase,
  EnemyAI, AIState, Detection, AttackConfig, Steering,
  Player, Dead,
} from '../../components'
import { CollisionLayer, spawnBullet, spawnSwarmer } from '../../prefabs'
import { transition } from '../../systems/enemyAI'
import { ENEMY_BULLET_RANGE } from '../weapons'
import { addEnemyComponents, setEnemyDefaults } from './helpers'
import { isSolidAt } from '../../tilemap'

const playerQuery = defineQuery([Player, Position, Health])

// ============================================================================
// Constants
// ============================================================================

const HP = 250
const RADIUS = 16
const AGGRO_RANGE = 500
const ATTACK_RANGE = 380
const PREFERRED_RANGE = 280
const SEPARATION_RADIUS = 32
const DROP_CHANCE = 0.50

// Phase thresholds (HP ratio)
const P2_THRESHOLD = 0.70
const P3_THRESHOLD = 0.35

// Phase 1 tuning
const P1_SPEED = 100
const P1_COOLDOWN = 1.6
const P1_TELEGRAPH = 0.70   // rifle telegraph (long, telegraphed)
const P1_RECOVERY = 0.60

// Phase 2 tuning
const P2_SPEED = 110
const P2_COOLDOWN = 1.2
const P2_TELEGRAPH = 0.55
const P2_RECOVERY = 0.50

// Phase 3 tuning (hip shot mode)
const P3_SPEED = 130
const P3_COOLDOWN = 0.65
const P3_TELEGRAPH = 0.25   // hip shot (fast, short telegraph)
const P3_RECOVERY = 0.30

// Transition i-frames
const TRANSITION_IFRAMES = 0.45

// Rifle shot tuning
const RIFLE_DAMAGE = 14
const RIFLE_BULLET_SPEED = 650
const RIFLE_BULLET_ACCEL = 0
const RIFLE_BULLET_DRAG = 0
const RIFLE_AIM_JITTER = 0.06 // small jitter for human feel

// Hip shot tuning (Phase 3)
const HIP_DAMAGE = 7
const HIP_BULLET_SPEED = 500
const HIP_BULLET_COUNT = 2
const HIP_SPREAD = 0.18
const HIP_AIM_JITTER = 0.12

// Bear trap tuning
const BEAR_TRAP_DAMAGE = 10
const BEAR_TRAP_RADIUS = 18
const BEAR_TRAP_IMMOBILIZE = 1.0  // seconds
const BEAR_TRAP_HP = 3
const BEAR_TRAP_COOLDOWN = 4.5   // seconds between placements
const BEAR_TRAP_MAX = 4          // max active bear traps

// Caltrop tuning
const CALTROP_RADIUS = 40
const CALTROP_SLOW = 0.3        // 70% slow
const CALTROP_DURATION = 8.0    // seconds
const CALTROP_COOLDOWN = 3.5    // seconds between placements
const CALTROP_MAX = 3           // max active caltrops
const CALTROP_DAMAGE = 0

// Rifle telegraph line length for laser indicator
const RIFLE_TELEGRAPH_LENGTH = 400

// P3 spawns
const P3_SUMMON_SWARMERS = 2

// Summon placement
const SUMMON_MIN_RADIUS = 64
const SUMMON_MAX_RADIUS = 160
const SUMMON_MAX_ATTEMPTS = 12

// ============================================================================
// Attack type enum
// ============================================================================

const CoyoteJaneAttack = {
  RIFLE_SHOT: 0,
  HIP_SHOT: 1,
} as const

// ============================================================================
// Per-boss state (stored in world.bossState)
// ============================================================================

interface CoyoteJaneState {
  selectedAttack: number
  /** Locked aim direction for rifle shot */
  aimAngle: number
  /** Timer for bear trap placement cooldown */
  trapCooldown: number
  /** Timer for caltrop placement cooldown */
  caltropCooldown: number
  /** Phases whose transitions have already fired */
  phaseTransitionDone: Set<number>
  /** Whether attack has executed its single-tick damage */
  attackExecuted: boolean
}

function createState(): CoyoteJaneState {
  return {
    selectedAttack: CoyoteJaneAttack.RIFLE_SHOT,
    aimAngle: 0,
    trapCooldown: 2.0, // slight initial delay before first trap
    caltropCooldown: 3.0,
    phaseTransitionDone: new Set(),
    attackExecuted: false,
  }
}

function getState(world: GameWorld, eid: number): CoyoteJaneState {
  return world.bossState.get(eid) as CoyoteJaneState
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
  return { x: centerX + SUMMON_MIN_RADIUS, y: centerY }
}

/** Count active traps of a specific kind owned by this boss */
function countTraps(world: GameWorld, ownerEid: number, kind: TrapZone['kind']): number {
  let count = 0
  for (const trap of world.trapZones) {
    if (trap.ownerEid === ownerEid && trap.kind === kind) count++
  }
  return count
}

/** Try to place a bear trap at the given position */
function placeBearTrap(world: GameWorld, ownerEid: number, x: number, y: number): void {
  if (countTraps(world, ownerEid, 'bearTrap') >= BEAR_TRAP_MAX) return
  if (world.tilemap && isSolidAt(world.tilemap, x, y)) return

  world.trapZones.push({
    kind: 'bearTrap',
    x,
    y,
    radius: BEAR_TRAP_RADIUS,
    damage: BEAR_TRAP_DAMAGE,
    immobilizeDuration: BEAR_TRAP_IMMOBILIZE,
    hp: BEAR_TRAP_HP,
    ownerEid,
  })
}

/** Place caltrops at the given position */
function placeCaltrops(world: GameWorld, ownerEid: number, x: number, y: number): void {
  if (countTraps(world, ownerEid, 'caltrop') >= CALTROP_MAX) return
  if (world.tilemap && isSolidAt(world.tilemap, x, y)) return

  world.trapZones.push({
    kind: 'caltrop',
    x,
    y,
    radius: CALTROP_RADIUS,
    damage: CALTROP_DAMAGE,
    duration: CALTROP_DURATION,
    slowMultiplier: CALTROP_SLOW,
    ownerEid,
  })
}

// ============================================================================
// Spawn
// ============================================================================

function spawn(world: GameWorld, x: number, y: number): number {
  const eid = addEntity(world)
  addEnemyComponents(world, eid)
  addComponent(world, BossPhase, eid)
  setEnemyDefaults(world, eid, x, y)

  Enemy.type[eid] = EnemyType.COYOTE_JANE
  Enemy.tier[eid] = EnemyTier.THREAT

  Speed.current[eid] = P1_SPEED
  Speed.max[eid] = P1_SPEED
  Collider.radius[eid] = RADIUS
  Health.current[eid] = HP
  Health.max[eid] = HP

  Detection.aggroRange[eid] = AGGRO_RANGE
  Detection.attackRange[eid] = ATTACK_RANGE
  Detection.losRequired[eid] = 0
  Steering.preferredRange[eid] = PREFERRED_RANGE
  Steering.separationRadius[eid] = SEPARATION_RADIUS

  BossPhase.phase[eid] = 1

  AttackConfig.telegraphDuration[eid] = P1_TELEGRAPH
  AttackConfig.recoveryDuration[eid] = P1_RECOVERY
  AttackConfig.cooldown[eid] = P1_COOLDOWN
  AttackConfig.damage[eid] = RIFLE_DAMAGE
  AttackConfig.projectileSpeed[eid] = RIFLE_BULLET_SPEED
  AttackConfig.projectileAccel[eid] = RIFLE_BULLET_ACCEL
  AttackConfig.projectileDrag[eid] = RIFLE_BULLET_DRAG
  AttackConfig.projectileCount[eid] = 1
  AttackConfig.spreadAngle[eid] = 0

  EnemyAI.initialDelay[eid] = world.rng.nextRange(0.8, 1.2)

  world.bossState.set(eid, createState())
  return eid
}

// ============================================================================
// Phase transitions + tick behavior
// ============================================================================

function tick(world: GameWorld, eid: number, dt: number): void {
  const state = getState(world, eid)
  const currentPhase = BossPhase.phase[eid]!
  const hpRatio = Health.current[eid]! / Math.max(1, Health.max[eid]!)
  const desired = getDesiredPhase(hpRatio)

  // Process phase transitions
  for (let p = currentPhase + 1; p <= desired; p++) {
    if (state.phaseTransitionDone.has(p)) continue
    state.phaseTransitionDone.add(p)

    if (p === 2) {
      Speed.current[eid] = P2_SPEED
      Speed.max[eid] = P2_SPEED
      AttackConfig.telegraphDuration[eid] = P2_TELEGRAPH
      AttackConfig.recoveryDuration[eid] = P2_RECOVERY
      AttackConfig.cooldown[eid] = P2_COOLDOWN
      Health.iframes[eid] = TRANSITION_IFRAMES
      AttackConfig.cooldownRemaining[eid] = 0
      EnemyAI.state[eid] = AIState.TELEGRAPH
      EnemyAI.stateTimer[eid] = 0
    }

    if (p === 3) {
      // Switch to hip shot mode: faster, aggressive
      Speed.current[eid] = P3_SPEED
      Speed.max[eid] = P3_SPEED
      AttackConfig.telegraphDuration[eid] = P3_TELEGRAPH
      AttackConfig.recoveryDuration[eid] = P3_RECOVERY
      AttackConfig.cooldown[eid] = P3_COOLDOWN
      AttackConfig.damage[eid] = HIP_DAMAGE
      AttackConfig.projectileSpeed[eid] = HIP_BULLET_SPEED
      AttackConfig.projectileCount[eid] = HIP_BULLET_COUNT
      AttackConfig.spreadAngle[eid] = HIP_SPREAD
      Health.iframes[eid] = TRANSITION_IFRAMES
      AttackConfig.cooldownRemaining[eid] = 0
      EnemyAI.state[eid] = AIState.TELEGRAPH
      EnemyAI.stateTimer[eid] = 0

      // Change preferred range: advance instead of flee
      Steering.preferredRange[eid] = 80

      // Spawn swarmers on P3
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
    const phase = BossPhase.phase[eid]!
    if (phase >= 3) {
      state.selectedAttack = CoyoteJaneAttack.HIP_SHOT
      AttackConfig.telegraphDuration[eid] = P3_TELEGRAPH
      AttackConfig.recoveryDuration[eid] = P3_RECOVERY
    } else {
      state.selectedAttack = CoyoteJaneAttack.RIFLE_SHOT
      AttackConfig.telegraphDuration[eid] = phase === 2 ? P2_TELEGRAPH : P1_TELEGRAPH
      AttackConfig.recoveryDuration[eid] = phase === 2 ? P2_RECOVERY : P1_RECOVERY
    }
    state.attackExecuted = false

    // Lock aim direction toward target
    const targetEid = EnemyAI.targetEid[eid]!
    if (targetEid !== 0xFFFF && hasComponent(world, Position, targetEid)) {
      state.aimAngle = Math.atan2(
        Position.y[targetEid]! - Position.y[eid]!,
        Position.x[targetEid]! - Position.x[eid]!,
      )
    }
  }

  // --- Telegraph behavior: stand still and aim ---
  if (EnemyAI.state[eid] === AIState.TELEGRAPH) {
    Velocity.x[eid] = 0
    Velocity.y[eid] = 0
  }

  // --- Trap placement during CHASE / FLEE / RECOVERY ---
  const aiState = EnemyAI.state[eid]!
  if (aiState === AIState.CHASE || aiState === AIState.FLEE || aiState === AIState.RECOVERY || aiState === AIState.IDLE) {
    const phase = BossPhase.phase[eid]!
    const bx = Position.x[eid]!
    const by = Position.y[eid]!

    // Bear trap placement
    state.trapCooldown -= dt
    if (state.trapCooldown <= 0) {
      // Place trap at current position (leave behind while repositioning)
      placeBearTrap(world, eid, bx, by)
      state.trapCooldown = BEAR_TRAP_COOLDOWN
    }

    // Caltrop placement (Phase 2+)
    if (phase >= 2) {
      state.caltropCooldown -= dt
      if (state.caltropCooldown <= 0) {
        // Scatter caltrops ahead toward player
        const targetEid = EnemyAI.targetEid[eid]!
        let cx = bx
        let cy = by
        if (targetEid !== 0xFFFF && hasComponent(world, Position, targetEid)) {
          const dx = Position.x[targetEid]! - bx
          const dy = Position.y[targetEid]! - by
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist > 0) {
            // Place caltrops partway between boss and player
            const placeDist = Math.min(dist * 0.5, 120)
            cx = bx + (dx / dist) * placeDist
            cy = by + (dy / dist) * placeDist
          }
        }
        placeCaltrops(world, eid, cx, cy)
        state.caltropCooldown = CALTROP_COOLDOWN
      }
    }
  }

  // --- Boss telegraph shapes ---
  if (EnemyAI.state[eid] === AIState.TELEGRAPH) {
    const attack = state.selectedAttack
    const ex = Position.x[eid]!
    const ey = Position.y[eid]!
    const telegraphDur = AttackConfig.telegraphDuration[eid]!
    const progress = telegraphDur > 0 ? Math.min(1, EnemyAI.stateTimer[eid]! / telegraphDur) : 1

    if (attack === CoyoteJaneAttack.RIFLE_SHOT) {
      // Line telegraph (laser sight)
      const endX = ex + Math.cos(state.aimAngle) * RIFLE_TELEGRAPH_LENGTH
      const endY = ey + Math.sin(state.aimAngle) * RIFLE_TELEGRAPH_LENGTH
      world.bossTelegraphs.push({
        kind: 'line',
        x: ex, y: ey,
        radius: 0,
        endX, endY,
        color: 0xff2222,
        alpha: 0.35,
        progress,
      })
    } else if (attack === CoyoteJaneAttack.HIP_SHOT) {
      // Short arc telegraph for hip shot
      const targetEid = EnemyAI.targetEid[eid]!
      let aimAngle = state.aimAngle
      if (targetEid !== 0xFFFF && hasComponent(world, Position, targetEid)) {
        aimAngle = Math.atan2(
          Position.y[targetEid]! - ey,
          Position.x[targetEid]! - ex,
        )
      }
      world.bossTelegraphs.push({
        kind: 'arc',
        x: ex, y: ey,
        radius: 120,
        angle: aimAngle,
        arcHalf: HIP_SPREAD * 2,
        color: 0xff6622,
        alpha: 0.25,
        progress,
      })
    }
  }
}

// ============================================================================
// Attack execution
// ============================================================================

function attack(world: GameWorld, eid: number, _dt: number): void {
  const state = getState(world, eid)

  if (state.attackExecuted) {
    transition(eid, AIState.RECOVERY)
    return
  }
  state.attackExecuted = true

  const ex = Position.x[eid]!
  const ey = Position.y[eid]!
  const phase = BossPhase.phase[eid]!

  if (state.selectedAttack === CoyoteJaneAttack.RIFLE_SHOT) {
    // Single high-damage rifle bullet along locked aim direction
    const jitter = (world.rng.next() - 0.5) * RIFLE_AIM_JITTER * 2
    const angle = state.aimAngle + jitter
    spawnBullet(world, {
      x: ex, y: ey,
      vx: Math.cos(angle) * RIFLE_BULLET_SPEED,
      vy: Math.sin(angle) * RIFLE_BULLET_SPEED,
      damage: RIFLE_DAMAGE,
      accel: RIFLE_BULLET_ACCEL,
      drag: RIFLE_BULLET_DRAG,
      range: ENEMY_BULLET_RANGE,
      ownerId: eid,
      layer: CollisionLayer.ENEMY_BULLET,
    })
  } else if (state.selectedAttack === CoyoteJaneAttack.HIP_SHOT) {
    // Fast multi-bullet hip shot (Phase 3)
    const targetEid = EnemyAI.targetEid[eid]!
    let baseAngle = state.aimAngle
    if (targetEid !== 0xFFFF && hasComponent(world, Position, targetEid)) {
      baseAngle = Math.atan2(
        Position.y[targetEid]! - ey,
        Position.x[targetEid]! - ex,
      )
    }
    const jitter = (world.rng.next() - 0.5) * HIP_AIM_JITTER * 2
    baseAngle += jitter

    for (let i = 0; i < HIP_BULLET_COUNT; i++) {
      const spreadOffset = HIP_BULLET_COUNT > 1
        ? HIP_SPREAD * (i / (HIP_BULLET_COUNT - 1) - 0.5)
        : 0
      const angle = baseAngle + spreadOffset
      spawnBullet(world, {
        x: ex, y: ey,
        vx: Math.cos(angle) * HIP_BULLET_SPEED,
        vy: Math.sin(angle) * HIP_BULLET_SPEED,
        damage: HIP_DAMAGE,
        accel: 0,
        drag: 0.05,
        range: ENEMY_BULLET_RANGE,
        ownerId: eid,
        layer: CollisionLayer.ENEMY_BULLET,
      })
    }
  }

  transition(eid, AIState.RECOVERY)
}

// ============================================================================
// Module registration
// ============================================================================

const coyoteJaneModule: BossModule = {
  type: EnemyType.COYOTE_JANE,
  displayName: 'COYOTE JANE',
  color: 0x8b6914,
  radius: RADIUS,
  dropChance: DROP_CHANCE,
  spawn,
  tick,
  attack,
}

registerBoss(coyoteJaneModule)

// ============================================================================
// Test-facing constant exports
// ============================================================================

export const COYOTE_JANE_HP = HP
export const COYOTE_JANE_RADIUS = RADIUS
export const COYOTE_JANE_P1_SPEED = P1_SPEED
export const COYOTE_JANE_P2_SPEED = P2_SPEED
export const COYOTE_JANE_P3_SPEED = P3_SPEED
export const COYOTE_JANE_P1_COOLDOWN = P1_COOLDOWN
export const COYOTE_JANE_P2_COOLDOWN = P2_COOLDOWN
export const COYOTE_JANE_P3_COOLDOWN = P3_COOLDOWN
export const COYOTE_JANE_P1_TELEGRAPH = P1_TELEGRAPH
export const COYOTE_JANE_P2_TELEGRAPH = P2_TELEGRAPH
export const COYOTE_JANE_P3_TELEGRAPH = P3_TELEGRAPH
export const COYOTE_JANE_TRANSITION_IFRAMES = TRANSITION_IFRAMES
export const COYOTE_JANE_RIFLE_DAMAGE = RIFLE_DAMAGE
export const COYOTE_JANE_HIP_DAMAGE = HIP_DAMAGE
export const COYOTE_JANE_BEAR_TRAP_DAMAGE = BEAR_TRAP_DAMAGE
export const COYOTE_JANE_BEAR_TRAP_RADIUS = BEAR_TRAP_RADIUS
export const COYOTE_JANE_BEAR_TRAP_IMMOBILIZE = BEAR_TRAP_IMMOBILIZE
export const COYOTE_JANE_BEAR_TRAP_HP = BEAR_TRAP_HP
export const COYOTE_JANE_BEAR_TRAP_COOLDOWN = BEAR_TRAP_COOLDOWN
export const COYOTE_JANE_BEAR_TRAP_MAX = BEAR_TRAP_MAX
export const COYOTE_JANE_CALTROP_RADIUS = CALTROP_RADIUS
export const COYOTE_JANE_CALTROP_SLOW = CALTROP_SLOW
export const COYOTE_JANE_CALTROP_DURATION = CALTROP_DURATION
export const COYOTE_JANE_P3_SUMMON_SWARMERS = P3_SUMMON_SWARMERS
