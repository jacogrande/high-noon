/**
 * Boomstick Boss Module
 *
 * Reverend Boomstick — Stage 1 ranged boss with fan/ring bullet patterns
 * and dynamite throws. Three-phase escalation with add spawns on transitions.
 */

import { addEntity, addComponent, hasComponent } from 'bitecs'
import type { GameWorld } from '../../world'
import type { BossModule } from './registry'
import { registerBoss } from './registry'
import {
  Position, Velocity, Speed, Collider, Health,
  Enemy, EnemyType, EnemyTier, BossPhase,
  EnemyAI, AIState, Detection, AttackConfig, Steering,
  Bullet,
} from '../../components'
import { CollisionLayer, spawnBullet, spawnSwarmer, spawnGoblinRogue } from '../../prefabs'
import { transition } from '../../systems/enemyAI'
import { isSolidAt } from '../../tilemap'
import { ENEMY_BULLET_RANGE, DYNAMITE_KNOCKBACK, BulletSpriteId, ENEMY_BULLET_SIZE_THREAT } from '../weapons'
import { addEnemyComponents, setEnemyDefaults } from './helpers'

// ============================================================================
// Constants
// ============================================================================

const SPEED = 55
const RADIUS = 18
const HP = 220
const AGGRO_RANGE = 450
const ATTACK_RANGE = 340
const PREFERRED_RANGE = 250
const SEPARATION_RADIUS = 36

// Phase 1 tuning
const P1_TELEGRAPH = 0.65
const P1_RECOVERY = 0.85
const P1_COOLDOWN = 1.8
const P1_FAN_BULLETS = 5
const P1_RING_BULLETS = 8

// Phase 2 tuning
const P2_THRESHOLD = 0.70
const P2_TELEGRAPH = 0.55
const P2_RECOVERY = 0.70
const P2_COOLDOWN = 1.35
const P2_FAN_BULLETS = 6
const P2_RING_BULLETS = 8
const P2_SUMMON_SWARMERS = 3
const P2_SUMMON_ROGUES = 1

// Phase 3 tuning
const P3_THRESHOLD = 0.35
const P3_TELEGRAPH = 0.45
const P3_RECOVERY = 0.55
const P3_COOLDOWN = 1.00
const P3_FAN_BULLETS = 7
const P3_RING_BULLETS = 10
const P3_SUMMON_SWARMERS = 4
const P3_SUMMON_ROGUES = 2

const TRANSITION_IFRAMES = 0.45

// Bullet tuning
const BULLET_SPEED = 520
const BULLET_ACCEL = 140
const BULLET_DRAG = 0.10
const SPREAD_ANGLE = 1.0
const DAMAGE = 8

// Boom throw tuning
const BOOM_DAMAGE = 12
const BOOM_RADIUS = 88
const BOOM_FUSE = 1.05
const BOOM_THROW_RANGE = 320
const BOOM_AIM_JITTER = 40
const BOOM_DELAY_P2_MIN = 1
const BOOM_DELAY_P2_MAX = 2
const BOOM_DELAY_P3_MIN = 0
const BOOM_DELAY_P3_MAX = 1

// Ring/fan cadence
const RING_DELAY_P1_MIN = 1
const RING_DELAY_P1_MAX = 2
const RING_DELAY_P2_MIN = 0
const RING_DELAY_P2_MAX = 2
const RING_DELAY_P3_MIN = 0
const RING_DELAY_P3_MAX = 1
const FAN_AIM_JITTER = 0.14
const FAN_SPREAD_SCALE_MIN = 0.9
const FAN_SPREAD_SCALE_MAX = 1.15
const FAN_SPEED_SCALE_MIN = 0.96
const FAN_SPEED_SCALE_MAX = 1.12
const RING_SPEED_SCALE_MIN = 0.72
const RING_SPEED_SCALE_MAX = 0.9

// Summon placement
const SUMMON_MIN_RADIUS = 80
const SUMMON_MAX_RADIUS = 160
const SUMMON_FALLBACK_RADIUS = 96
const SUMMON_MAX_ATTEMPTS = 12

// ============================================================================
// Per-boss state (stored in world.bossState)
// ============================================================================

interface BoomstickState {
  /** Attacks until next ring shot */
  ringDelay: number
  /** Attacks until next boom throw (phase 2+) */
  boomDelay: number
}

// ============================================================================
// Helpers
// ============================================================================

function getDesiredPhase(hpRatio: number): number {
  if (hpRatio <= P3_THRESHOLD) return 3
  if (hpRatio <= P2_THRESHOLD) return 2
  return 1
}

function applyPhaseTuning(eid: number, phase: number): void {
  if (phase === 2) {
    AttackConfig.telegraphDuration[eid] = P2_TELEGRAPH
    AttackConfig.recoveryDuration[eid] = P2_RECOVERY
    AttackConfig.cooldown[eid] = P2_COOLDOWN
    AttackConfig.projectileCount[eid] = P2_FAN_BULLETS
  } else if (phase === 3) {
    AttackConfig.telegraphDuration[eid] = P3_TELEGRAPH
    AttackConfig.recoveryDuration[eid] = P3_RECOVERY
    AttackConfig.cooldown[eid] = P3_COOLDOWN
    AttackConfig.projectileCount[eid] = P3_FAN_BULLETS
  }
}

function pickSummonPosition(
  world: GameWorld,
  centerX: number,
  centerY: number,
  baseAngle: number,
): { x: number; y: number } {
  const tilemap = world.tilemap
  for (let attempt = 0; attempt < SUMMON_MAX_ATTEMPTS; attempt++) {
    const angleJitter = world.rng.nextRange(-0.6, 0.6)
    const angle = baseAngle + angleJitter
    const dist = world.rng.nextRange(SUMMON_MIN_RADIUS, SUMMON_MAX_RADIUS)
    const x = centerX + Math.cos(angle) * dist
    const y = centerY + Math.sin(angle) * dist
    if (tilemap && isSolidAt(tilemap, x, y)) continue
    return { x, y }
  }
  const fallbackX = centerX + Math.cos(baseAngle) * SUMMON_FALLBACK_RADIUS
  const fallbackY = centerY + Math.sin(baseAngle) * SUMMON_FALLBACK_RADIUS
  if (tilemap && isSolidAt(tilemap, fallbackX, fallbackY)) {
    return { x: centerX, y: centerY }
  }
  return { x: fallbackX, y: fallbackY }
}

function spawnBurst(world: GameWorld, bossEid: number, swarmers: number, rogues: number): void {
  const centerX = Position.x[bossEid]!
  const centerY = Position.y[bossEid]!
  const total = swarmers + rogues
  if (total <= 0) return

  let slot = 0
  const spawnAtSlot = (fn: (w: GameWorld, x: number, y: number) => number) => {
    const angle = (slot / total) * Math.PI * 2
    slot++
    const pos = pickSummonPosition(world, centerX, centerY, angle)
    fn(world, pos.x, pos.y)
  }

  for (let i = 0; i < swarmers; i++) spawnAtSlot(spawnSwarmer)
  for (let i = 0; i < rogues; i++) spawnAtSlot(spawnGoblinRogue)
}

function enterPhase(world: GameWorld, eid: number, phase: number): void {
  BossPhase.phase[eid] = phase
  applyPhaseTuning(eid, phase)
  Health.iframes[eid] = Math.max(Health.iframes[eid]!, TRANSITION_IFRAMES)
  AttackConfig.cooldownRemaining[eid] = 0

  if (EnemyAI.state[eid] !== AIState.TELEGRAPH) {
    transition(eid, AIState.TELEGRAPH)
  } else {
    EnemyAI.stateTimer[eid] = 0
  }

  if (phase === 2) {
    spawnBurst(world, eid, P2_SUMMON_SWARMERS, P2_SUMMON_ROGUES)
  } else if (phase === 3) {
    spawnBurst(world, eid, P3_SUMMON_SWARMERS, P3_SUMMON_ROGUES)
  }
}

function getRingCount(phase: number): number {
  if (phase >= 3) return P3_RING_BULLETS
  if (phase === 2) return P2_RING_BULLETS
  return P1_RING_BULLETS
}

function rollRingDelay(world: GameWorld, phase: number): number {
  let min = RING_DELAY_P1_MIN
  let max = RING_DELAY_P1_MAX
  if (phase >= 3) { min = RING_DELAY_P3_MIN; max = RING_DELAY_P3_MAX }
  else if (phase === 2) { min = RING_DELAY_P2_MIN; max = RING_DELAY_P2_MAX }
  return min + world.rng.nextInt(max - min + 1)
}

function rollBoomDelay(world: GameWorld, phase: number): number {
  let min = BOOM_DELAY_P2_MIN
  let max = BOOM_DELAY_P2_MAX
  if (phase >= 3) { min = BOOM_DELAY_P3_MIN; max = BOOM_DELAY_P3_MAX }
  return min + world.rng.nextInt(max - min + 1)
}

// ============================================================================
// BossModule implementation
// ============================================================================

const boomstickModule: BossModule = {
  type: EnemyType.BOOMSTICK,
  displayName: 'REVEREND BOOMSTICK',
  color: 0xffcc33,
  radius: RADIUS,
  dropChance: 0.50,

  spawn(world: GameWorld, x: number, y: number): number {
    const eid = addEntity(world)
    addEnemyComponents(world, eid)
    addComponent(world, BossPhase, eid)
    setEnemyDefaults(world, eid, x, y)

    Enemy.type[eid] = EnemyType.BOOMSTICK
    Enemy.tier[eid] = EnemyTier.THREAT
    BossPhase.phase[eid] = 1
    Speed.current[eid] = SPEED
    Speed.max[eid] = SPEED
    Collider.radius[eid] = RADIUS
    Health.current[eid] = HP
    Health.max[eid] = HP
    Detection.aggroRange[eid] = AGGRO_RANGE
    Detection.attackRange[eid] = ATTACK_RANGE
    Detection.losRequired[eid] = 0
    AttackConfig.telegraphDuration[eid] = P1_TELEGRAPH
    AttackConfig.recoveryDuration[eid] = P1_RECOVERY
    AttackConfig.cooldown[eid] = P1_COOLDOWN
    AttackConfig.damage[eid] = DAMAGE
    AttackConfig.projectileSpeed[eid] = BULLET_SPEED
    AttackConfig.projectileAccel[eid] = BULLET_ACCEL
    AttackConfig.projectileDrag[eid] = BULLET_DRAG
    AttackConfig.projectileCount[eid] = P1_FAN_BULLETS
    AttackConfig.spreadAngle[eid] = SPREAD_ANGLE
    Steering.preferredRange[eid] = PREFERRED_RANGE
    Steering.separationRadius[eid] = SEPARATION_RADIUS
    EnemyAI.initialDelay[eid] = world.rng.nextRange(0.8, 1.2)

    const state: BoomstickState = {
      ringDelay: world.rng.nextInt(2) + 1,
      boomDelay: 0,
    }
    world.bossState.set(eid, state)

    return eid
  },

  tick(world: GameWorld, eid: number, _dt: number): void {
    if (Health.current[eid]! <= 0 || Health.max[eid]! <= 0) return

    // Ranged boss: stand still during telegraph
    if (EnemyAI.state[eid] === AIState.TELEGRAPH) {
      Velocity.x[eid] = 0
      Velocity.y[eid] = 0
    }

    const currentPhase = Math.max(1, BossPhase.phase[eid]!)
    const hpRatio = Health.current[eid]! / Health.max[eid]!
    const desiredPhase = getDesiredPhase(hpRatio)

    if (desiredPhase <= currentPhase) return

    for (let phase = currentPhase + 1; phase <= desiredPhase; phase++) {
      enterPhase(world, eid, phase)
    }
  },

  attack(world: GameWorld, eid: number, _dt: number): void {
    const targetEid = EnemyAI.targetEid[eid]!
    const ex = Position.x[eid]!
    const ey = Position.y[eid]!
    const targetX = Position.x[targetEid]!
    const targetY = Position.y[targetEid]!

    const speed = AttackConfig.projectileSpeed[eid]!
    const accel = AttackConfig.projectileAccel[eid]!
    const drag = AttackConfig.projectileDrag[eid]!
    const damage = AttackConfig.damage[eid]!
    const baseAngle = Math.atan2(targetY - ey, targetX - ex)
    const phase = Math.max(1, BossPhase.phase[eid]!)

    const st = world.bossState.get(eid) as BoomstickState | undefined
    let ringDelay = st?.ringDelay ?? 0
    let boomDelay = st?.boomDelay ?? 0

    const fireRing = ringDelay <= 0
    const fireFan = !fireRing

    if (fireFan) {
      const fanCount = AttackConfig.projectileCount[eid]!
      const fanSpread = AttackConfig.spreadAngle[eid]! * world.rng.nextRange(
        FAN_SPREAD_SCALE_MIN, FAN_SPREAD_SCALE_MAX,
      )
      const fanBaseAngle = baseAngle + world.rng.nextRange(-FAN_AIM_JITTER, FAN_AIM_JITTER)

      for (let i = 0; i < fanCount; i++) {
        const fanAngle = fanCount === 1
          ? fanBaseAngle
          : fanBaseAngle + fanSpread * (i / (fanCount - 1) - 0.5)
        const fanBulletSpeed = speed * world.rng.nextRange(FAN_SPEED_SCALE_MIN, FAN_SPEED_SCALE_MAX)
        spawnBullet(world, {
          x: ex, y: ey,
          vx: Math.cos(fanAngle) * fanBulletSpeed,
          vy: Math.sin(fanAngle) * fanBulletSpeed,
          damage, accel, drag,
          range: ENEMY_BULLET_RANGE,
          ownerId: eid,
          layer: CollisionLayer.ENEMY_BULLET,
          spriteId: BulletSpriteId.SLUG,
          size: ENEMY_BULLET_SIZE_THREAT,
        })
      }
    }

    if (fireRing) {
      const ringCount = getRingCount(phase)
      const ringStep = (Math.PI * 2) / ringCount
      const ringOffset = world.rng.nextRange(0, Math.PI * 2)
      const ringBulletSpeed = speed * world.rng.nextRange(RING_SPEED_SCALE_MIN, RING_SPEED_SCALE_MAX)
      for (let i = 0; i < ringCount; i++) {
        const ringAngle = ringOffset + i * ringStep
        spawnBullet(world, {
          x: ex, y: ey,
          vx: Math.cos(ringAngle) * ringBulletSpeed,
          vy: Math.sin(ringAngle) * ringBulletSpeed,
          damage, accel, drag,
          range: ENEMY_BULLET_RANGE,
          ownerId: eid,
          layer: CollisionLayer.ENEMY_BULLET,
          spriteId: BulletSpriteId.SLUG,
          size: ENEMY_BULLET_SIZE_THREAT,
        })
      }
      ringDelay = rollRingDelay(world, phase)
    } else {
      ringDelay -= 1
    }

    // Phase 2+ boom throws
    if (phase >= 2) {
      if (boomDelay <= 0) {
        let boomX = targetX + world.rng.nextRange(-BOOM_AIM_JITTER, BOOM_AIM_JITTER)
        let boomY = targetY + world.rng.nextRange(-BOOM_AIM_JITTER, BOOM_AIM_JITTER)
        const bdx = boomX - ex
        const bdy = boomY - ey
        const distSq = bdx * bdx + bdy * bdy
        const maxRangeSq = BOOM_THROW_RANGE * BOOM_THROW_RANGE
        if (distSq > maxRangeSq) {
          const dist = Math.sqrt(distSq)
          boomX = ex + (bdx / dist) * BOOM_THROW_RANGE
          boomY = ey + (bdy / dist) * BOOM_THROW_RANGE
        }
        world.dynamites.push({
          x: boomX, y: boomY,
          startX: ex, startY: ey,
          fuseRemaining: BOOM_FUSE,
          maxFuse: BOOM_FUSE,
          damage: BOOM_DAMAGE,
          radius: BOOM_RADIUS,
          knockback: DYNAMITE_KNOCKBACK,
          ownerId: eid,
        })
        boomDelay = rollBoomDelay(world, phase)
      } else {
        boomDelay -= 1
      }
    }

    // Update persisted state
    if (st) {
      st.ringDelay = ringDelay
      st.boomDelay = boomDelay
    }

    transition(eid, AIState.RECOVERY)
  },
}

// Export constants needed by tests
export const BOOMSTICK_TRANSITION_IFRAMES = TRANSITION_IFRAMES
export const BOOMSTICK_PHASE_2_TELEGRAPH = P2_TELEGRAPH
export const BOOMSTICK_PHASE_2_RECOVERY = P2_RECOVERY
export const BOOMSTICK_PHASE_2_COOLDOWN = P2_COOLDOWN
export const BOOMSTICK_PHASE_2_FAN_BULLETS = P2_FAN_BULLETS
export const BOOMSTICK_PHASE_2_SUMMON_SWARMERS = P2_SUMMON_SWARMERS
export const BOOMSTICK_PHASE_2_SUMMON_ROGUES = P2_SUMMON_ROGUES
export const BOOMSTICK_PHASE_3_TELEGRAPH = P3_TELEGRAPH
export const BOOMSTICK_PHASE_3_RECOVERY = P3_RECOVERY
export const BOOMSTICK_PHASE_3_COOLDOWN = P3_COOLDOWN
export const BOOMSTICK_PHASE_3_FAN_BULLETS = P3_FAN_BULLETS
export const BOOMSTICK_PHASE_3_SUMMON_SWARMERS = P3_SUMMON_SWARMERS
export const BOOMSTICK_PHASE_3_SUMMON_ROGUES = P3_SUMMON_ROGUES
export const BOOMSTICK_HP = HP
export const BOOMSTICK_RADIUS = RADIUS
export const BOOMSTICK_BUDGET_COST = 8
export const BOOMSTICK_DAMAGE = DAMAGE
export const BOOMSTICK_BULLET_COUNT = P1_FAN_BULLETS
export const BOOMSTICK_RING_BULLET_COUNT = P1_RING_BULLETS
export const BOOMSTICK_PHASE_3_RING_BULLETS = P3_RING_BULLETS
export const BOOMSTICK_BOOM_DAMAGE = BOOM_DAMAGE
export const BOOMSTICK_BOOM_RADIUS = BOOM_RADIUS
export const BOOMSTICK_BOOM_FUSE = BOOM_FUSE

registerBoss(boomstickModule)
