/**
 * The Dalton Boys Boss Module
 *
 * Multi-entity duo boss: two outlaw brothers who fight as a coordinated pair.
 * Emmett "The Brute" is an aggressive close-range shotgunner.
 * Bob "The Deadeye" is an evasive long-range marksman.
 * They share a combined HUD HP bar but each has individual world-space bars.
 * When one brother dies, the survivor enrages.
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
import { CollisionLayer, NO_TARGET, spawnBullet } from '../../prefabs'
import { transition } from '../../systems/enemyAI'
import { applyDamage } from '../../systems/applyDamage'
import { addEnemyComponents, setEnemyDefaults } from './helpers'
import { ENEMY_BULLET_RANGE, BulletSpriteId, ENEMY_BULLET_SIZE_THREAT } from '../weapons'

const playerQuery = defineQuery([Player, Position, Health])

// ============================================================================
// Constants
// ============================================================================

// Sentinel key for the shared group state in world.bossState
export const DALTON_GROUP_KEY = -1

// Emmett "The Brute" — close-range shotgunner
export const DALTON_EMMETT_HP = 130
export const DALTON_EMMETT_SPEED = 110
const EMMETT_RADIUS = 14
const EMMETT_AGGRO_RANGE = 400
const EMMETT_ATTACK_RANGE = 120
const EMMETT_PREFERRED_RANGE = 0
const EMMETT_COOLDOWN = 1.2
const EMMETT_TELEGRAPH = 0.35
const EMMETT_RECOVERY = 0.45

// Bob "The Deadeye" — long-range marksman
export const DALTON_BOB_HP = 110
export const DALTON_BOB_SPEED = 70
const BOB_RADIUS = 12
const BOB_AGGRO_RANGE = 500
const BOB_ATTACK_RANGE = 300
const BOB_PREFERRED_RANGE = 200
const BOB_COOLDOWN = 1.4
const BOB_TELEGRAPH = 0.40
const BOB_RECOVERY = 0.50

// Combined
const DROP_CHANCE = 0.50

// Phase thresholds (combined HP ratio)
const P2_THRESHOLD = 0.70
const P3_THRESHOLD = 0.35

// Transition i-frames
export const DALTON_TRANSITION_IFRAMES = 0.40

// Enrage multipliers (when one brother dies)
export const DALTON_ENRAGE_SPEED_MUL = 1.4
export const DALTON_ENRAGE_COOLDOWN_MUL = 0.6

// Emmett attacks
export const DALTON_BUCKSHOT_DAMAGE = 6
const BUCKSHOT_COUNT = 3
const BUCKSHOT_SPREAD = 0.5 // radians total fan
const BUCKSHOT_SPEED = 350
const BUCKSHOT_RANGE = 150

// Emmett Bull Rush (P2+)
export const DALTON_BULL_RUSH_DAMAGE = 10
const BULL_RUSH_SPEED = 350
const BULL_RUSH_DURATION = 0.25
const BULL_RUSH_RADIUS = 20
const BULL_RUSH_KB_SPEED = 200
const BULL_RUSH_KB_DURATION = 0.12
const BULL_RUSH_CHANCE = 0.30

// Bob attacks
export const DALTON_DEADSHOT_DAMAGE = 12
const DEADSHOT_SPEED = 600

// Bob Covering Fire (P2+)
export const DALTON_COVERING_FIRE_DAMAGE = 8
const COVERING_FIRE_SPEED = 500
const COVERING_FIRE_SHOTS = 3
const COVERING_FIRE_SPREAD = 0.15 // radians per-shot random spread
const COVERING_FIRE_CHANCE = 0.30

// Phase 2 tuning
const P2_COOLDOWN_MUL = 0.85
const P2_TELEGRAPH_MUL = 0.90

// ============================================================================
// Group & Brother State
// ============================================================================

interface DaltonGroupState {
  emmettEid: number
  bobEid: number
  emmettDead: boolean
  bobDead: boolean
  enraged: boolean
  phaseTransitionDone: Set<number>
}

interface DaltonBrotherState {
  group: DaltonGroupState
  role: 'emmett' | 'bob'
  attackExecuted: boolean
  /** Bull Rush: locked direction */
  rushAimX: number
  rushAimY: number
  /** Covering Fire: remaining burst shots */
  burstShotsRemaining: number
  /** Covering Fire: locked aim angle for burst */
  burstAimAngle: number
  /** Whether this brother is performing a Bull Rush */
  isBullRush: boolean
}

function getState(world: GameWorld, eid: number): DaltonBrotherState {
  return world.bossState.get(eid) as DaltonBrotherState
}

function getGroup(world: GameWorld): DaltonGroupState | undefined {
  return world.bossState.get(DALTON_GROUP_KEY) as DaltonGroupState | undefined
}

// ============================================================================
// Helpers
// ============================================================================

function getCombinedHPRatio(group: DaltonGroupState): number {
  // Guard: if Bob hasn't spawned yet, only use Emmett's HP
  if (group.bobEid < 0) {
    const max = Health.max[group.emmettEid]!
    return max > 0 ? Health.current[group.emmettEid]! / max : 0
  }
  const totalMax = Health.max[group.emmettEid]! + Health.max[group.bobEid]!
  if (totalMax <= 0) return 0
  const emmettHP = group.emmettDead ? 0 : Math.max(0, Health.current[group.emmettEid]!)
  const bobHP = group.bobDead ? 0 : Math.max(0, Health.current[group.bobEid]!)
  return (emmettHP + bobHP) / totalMax
}

function getDesiredPhase(group: DaltonGroupState): number {
  if (group.emmettDead || group.bobDead) return 3
  const ratio = getCombinedHPRatio(group)
  if (ratio <= P3_THRESHOLD) return 3
  if (ratio <= P2_THRESHOLD) return 2
  return 1
}

// ============================================================================
// Spawn
// ============================================================================

function spawn(world: GameWorld, x: number, y: number): number {
  const eid = addEntity(world)
  addEnemyComponents(world, eid)
  addComponent(world, BossPhase, eid)
  setEnemyDefaults(world, eid, x, y)

  Enemy.type[eid] = EnemyType.DALTON
  Enemy.tier[eid] = EnemyTier.THREAT
  BossPhase.phase[eid] = 1

  let existingGroup = getGroup(world)

  if (!existingGroup) {
    // First spawn → Emmett
    Speed.current[eid] = DALTON_EMMETT_SPEED
    Speed.max[eid] = DALTON_EMMETT_SPEED
    Collider.radius[eid] = EMMETT_RADIUS
    Health.current[eid] = DALTON_EMMETT_HP
    Health.max[eid] = DALTON_EMMETT_HP
    Detection.aggroRange[eid] = EMMETT_AGGRO_RANGE
    Detection.attackRange[eid] = EMMETT_ATTACK_RANGE
    Steering.preferredRange[eid] = EMMETT_PREFERRED_RANGE
    Steering.separationRadius[eid] = 32
    AttackConfig.telegraphDuration[eid] = EMMETT_TELEGRAPH
    AttackConfig.recoveryDuration[eid] = EMMETT_RECOVERY
    AttackConfig.cooldown[eid] = EMMETT_COOLDOWN
    AttackConfig.damage[eid] = DALTON_BUCKSHOT_DAMAGE
    AttackConfig.projectileCount[eid] = BUCKSHOT_COUNT
    AttackConfig.projectileSpeed[eid] = BUCKSHOT_SPEED
    AttackConfig.spreadAngle[eid] = BUCKSHOT_SPREAD

    const group: DaltonGroupState = {
      emmettEid: eid,
      bobEid: -1,
      emmettDead: false,
      bobDead: false,
      enraged: false,
      phaseTransitionDone: new Set(),
    }

    const brotherState: DaltonBrotherState = {
      group,
      role: 'emmett',
      attackExecuted: false,
      rushAimX: 0,
      rushAimY: 0,
      burstShotsRemaining: 0,
      burstAimAngle: 0,
      isBullRush: false,
    }

    world.bossState.set(DALTON_GROUP_KEY, group)
    world.bossState.set(eid, brotherState)
  } else {
    // Second spawn → Bob
    Speed.current[eid] = DALTON_BOB_SPEED
    Speed.max[eid] = DALTON_BOB_SPEED
    Collider.radius[eid] = BOB_RADIUS
    Health.current[eid] = DALTON_BOB_HP
    Health.max[eid] = DALTON_BOB_HP
    Detection.aggroRange[eid] = BOB_AGGRO_RANGE
    Detection.attackRange[eid] = BOB_ATTACK_RANGE
    Steering.preferredRange[eid] = BOB_PREFERRED_RANGE
    Steering.separationRadius[eid] = 32
    AttackConfig.telegraphDuration[eid] = BOB_TELEGRAPH
    AttackConfig.recoveryDuration[eid] = BOB_RECOVERY
    AttackConfig.cooldown[eid] = BOB_COOLDOWN
    AttackConfig.damage[eid] = DALTON_DEADSHOT_DAMAGE
    AttackConfig.projectileCount[eid] = 1
    AttackConfig.projectileSpeed[eid] = DEADSHOT_SPEED
    AttackConfig.spreadAngle[eid] = 0

    existingGroup.bobEid = eid

    const brotherState: DaltonBrotherState = {
      group: existingGroup,
      role: 'bob',
      attackExecuted: false,
      rushAimX: 0,
      rushAimY: 0,
      burstShotsRemaining: 0,
      burstAimAngle: 0,
      isBullRush: false,
    }

    world.bossState.set(eid, brotherState)
  }

  return eid
}

// ============================================================================
// Phase transitions (tick)
// ============================================================================

function tick(world: GameWorld, eid: number, _dt: number): void {
  const state = getState(world, eid)
  if (!state) return
  const group = state.group

  // --- Proactive death tracking for BOTH brothers ---
  // Check both brothers' HP regardless of which one is ticking,
  // so death detection doesn't depend on iteration order.
  if (group.emmettEid >= 0 && !group.emmettDead && Health.current[group.emmettEid]! <= 0) {
    group.emmettDead = true
  }
  if (group.bobEid >= 0 && !group.bobDead && Health.current[group.bobEid]! <= 0) {
    group.bobDead = true
  }

  // If both dead, clean up group key
  if (group.emmettDead && group.bobDead) {
    world.bossState.delete(DALTON_GROUP_KEY)
    return
  }

  // Dead brothers don't tick further
  if (Health.current[eid]! <= 0) return

  // --- Phase check ---
  const currentPhase = BossPhase.phase[eid]!
  const desired = getDesiredPhase(group)

  // Process phase transitions for all alive brothers
  for (let p = currentPhase + 1; p <= desired; p++) {
    if (group.phaseTransitionDone.has(p)) {
      // Phase already transitioned globally — just update this brother's phase number
      BossPhase.phase[eid] = desired
      continue
    }
    group.phaseTransitionDone.add(p)

    // Apply phase tuning to THIS brother
    if (p === 2) {
      AttackConfig.cooldown[eid] = AttackConfig.cooldown[eid]! * P2_COOLDOWN_MUL
      AttackConfig.telegraphDuration[eid] = AttackConfig.telegraphDuration[eid]! * P2_TELEGRAPH_MUL
      Health.iframes[eid] = DALTON_TRANSITION_IFRAMES
      AttackConfig.cooldownRemaining[eid] = 0
      EnemyAI.state[eid] = AIState.TELEGRAPH
      EnemyAI.stateTimer[eid] = 0
    }

    if (p === 3) {
      Health.iframes[eid] = DALTON_TRANSITION_IFRAMES
      AttackConfig.cooldownRemaining[eid] = 0
      EnemyAI.state[eid] = AIState.TELEGRAPH
      EnemyAI.stateTimer[eid] = 0
    }

    // Also apply to the OTHER alive brother on this same phase transition
    const otherEid = state.role === 'emmett' ? group.bobEid : group.emmettEid
    const otherDead = state.role === 'emmett' ? group.bobDead : group.emmettDead
    if (otherEid >= 0 && !otherDead && Health.current[otherEid]! > 0) {
      BossPhase.phase[otherEid] = desired
      if (p === 2) {
        AttackConfig.cooldown[otherEid] = AttackConfig.cooldown[otherEid]! * P2_COOLDOWN_MUL
        AttackConfig.telegraphDuration[otherEid] = AttackConfig.telegraphDuration[otherEid]! * P2_TELEGRAPH_MUL
        Health.iframes[otherEid] = DALTON_TRANSITION_IFRAMES
        AttackConfig.cooldownRemaining[otherEid] = 0
        EnemyAI.state[otherEid] = AIState.TELEGRAPH
        EnemyAI.stateTimer[otherEid] = 0
      }
      if (p === 3) {
        Health.iframes[otherEid] = DALTON_TRANSITION_IFRAMES
        AttackConfig.cooldownRemaining[otherEid] = 0
        EnemyAI.state[otherEid] = AIState.TELEGRAPH
        EnemyAI.stateTimer[otherEid] = 0
      }
    }
  }

  BossPhase.phase[eid] = desired

  // --- Enrage (once, when one brother dies) ---
  if (!group.enraged && (group.emmettDead || group.bobDead)) {
    group.enraged = true

    // Find the survivor and buff them
    const survivorEid = group.emmettDead ? group.bobEid : group.emmettEid
    if (survivorEid === eid) {
      Speed.current[eid] = Speed.current[eid]! * DALTON_ENRAGE_SPEED_MUL
      Speed.max[eid] = Speed.max[eid]! * DALTON_ENRAGE_SPEED_MUL
      AttackConfig.cooldown[eid] = AttackConfig.cooldown[eid]! * DALTON_ENRAGE_COOLDOWN_MUL
    }
  }

  // --- Telegraph movement ---
  if (EnemyAI.state[eid] === AIState.TELEGRAPH) {
    if (state.role === 'emmett') {
      // Emmett advances toward target at 40% speed during telegraph
      const targetEid = EnemyAI.targetEid[eid]!
      if (targetEid !== NO_TARGET && hasComponent(world, Position, targetEid)) {
        const dx = Position.x[targetEid]! - Position.x[eid]!
        const dy = Position.y[targetEid]! - Position.y[eid]!
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > 0) {
          const spd = Speed.current[eid]! * 0.4
          Velocity.x[eid] = (dx / dist) * spd
          Velocity.y[eid] = (dy / dist) * spd
        }
      }
    } else {
      // Bob stands still during telegraph (ranged)
      Velocity.x[eid] = 0
      Velocity.y[eid] = 0
    }
  }

  // --- Reset attack state at TELEGRAPH start ---
  if (EnemyAI.state[eid] === AIState.TELEGRAPH && EnemyAI.stateTimer[eid]! === 0) {
    state.attackExecuted = false
    state.isBullRush = false
    state.burstShotsRemaining = 0

    // Emmett: decide if Bull Rush (P2+)
    if (state.role === 'emmett' && BossPhase.phase[eid]! >= 2) {
      if (world.rng.next() < BULL_RUSH_CHANCE) {
        state.isBullRush = true
        // Lock rush direction
        const targetEid = EnemyAI.targetEid[eid]!
        if (targetEid !== NO_TARGET && hasComponent(world, Position, targetEid)) {
          const dx = Position.x[targetEid]! - Position.x[eid]!
          const dy = Position.y[targetEid]! - Position.y[eid]!
          const len = Math.sqrt(dx * dx + dy * dy)
          if (len > 0) {
            state.rushAimX = dx / len
            state.rushAimY = dy / len
          }
        }
      }
    }

    // Bob: decide if Covering Fire (P2+)
    if (state.role === 'bob' && BossPhase.phase[eid]! >= 2) {
      if (world.rng.next() < COVERING_FIRE_CHANCE) {
        state.burstShotsRemaining = COVERING_FIRE_SHOTS
        // Lock aim angle for burst
        const targetEid = EnemyAI.targetEid[eid]!
        if (targetEid !== NO_TARGET && hasComponent(world, Position, targetEid)) {
          state.burstAimAngle = Math.atan2(
            Position.y[targetEid]! - Position.y[eid]!,
            Position.x[targetEid]! - Position.x[eid]!,
          )
        }
      }
    }
  }
}

// ============================================================================
// Attack execution
// ============================================================================

function attack(world: GameWorld, eid: number, _dt: number): void {
  const state = getState(world, eid)
  if (!state) return

  if (state.role === 'emmett') {
    attackEmmett(world, eid, state)
  } else {
    attackBob(world, eid, state)
  }
}

function attackEmmett(world: GameWorld, eid: number, state: DaltonBrotherState): void {
  if (state.isBullRush) {
    executeBullRush(world, eid, state)
  } else {
    executeBuckshotBlast(world, eid, state)
  }
}

function executeBuckshotBlast(world: GameWorld, eid: number, state: DaltonBrotherState): void {
  if (state.attackExecuted) {
    transition(eid, AIState.RECOVERY)
    return
  }
  state.attackExecuted = true

  const ex = Position.x[eid]!
  const ey = Position.y[eid]!
  const targetEid = EnemyAI.targetEid[eid]!

  let baseAngle = 0
  if (targetEid !== NO_TARGET && hasComponent(world, Position, targetEid)) {
    baseAngle = Math.atan2(Position.y[targetEid]! - ey, Position.x[targetEid]! - ex)
  }

  // 3-bullet fan
  for (let i = 0; i < BUCKSHOT_COUNT; i++) {
    const angle = baseAngle + BUCKSHOT_SPREAD * (i / (BUCKSHOT_COUNT - 1) - 0.5)
    spawnBullet(world, {
      x: ex,
      y: ey,
      vx: Math.cos(angle) * BUCKSHOT_SPEED,
      vy: Math.sin(angle) * BUCKSHOT_SPEED,
      damage: DALTON_BUCKSHOT_DAMAGE,
      range: BUCKSHOT_RANGE,
      ownerId: eid,
      layer: CollisionLayer.ENEMY_BULLET,
      spriteId: BulletSpriteId.SLUG,
      size: ENEMY_BULLET_SIZE_THREAT,
    })
  }

  transition(eid, AIState.RECOVERY)
}

function executeBullRush(world: GameWorld, eid: number, state: DaltonBrotherState): void {
  const timer = EnemyAI.stateTimer[eid]!

  // Set velocity on first tick
  if (timer === 0) {
    Velocity.x[eid] = state.rushAimX * BULL_RUSH_SPEED
    Velocity.y[eid] = state.rushAimY * BULL_RUSH_SPEED
  }

  // Contact damage check each frame (i-frames prevent multi-hit per player)
  if (!state.attackExecuted) {
    const ex = Position.x[eid]!
    const ey = Position.y[eid]!
    hitPlayersInRadius(world, eid, ex, ey, BULL_RUSH_RADIUS, DALTON_BULL_RUSH_DAMAGE, BULL_RUSH_KB_SPEED, BULL_RUSH_KB_DURATION)
  }

  if (timer >= BULL_RUSH_DURATION) {
    state.attackExecuted = true
    Velocity.x[eid] = 0
    Velocity.y[eid] = 0
    transition(eid, AIState.RECOVERY)
  }
}

function attackBob(world: GameWorld, eid: number, state: DaltonBrotherState): void {
  if (state.burstShotsRemaining > 0) {
    executeCoveringFire(world, eid, state)
  } else {
    executeDeadShot(world, eid, state)
  }
}

function executeDeadShot(world: GameWorld, eid: number, state: DaltonBrotherState): void {
  if (state.attackExecuted) {
    transition(eid, AIState.RECOVERY)
    return
  }
  state.attackExecuted = true

  const ex = Position.x[eid]!
  const ey = Position.y[eid]!
  const targetEid = EnemyAI.targetEid[eid]!

  let angle = 0
  if (targetEid !== NO_TARGET && hasComponent(world, Position, targetEid)) {
    angle = Math.atan2(Position.y[targetEid]! - ey, Position.x[targetEid]! - ex)
  }

  spawnBullet(world, {
    x: ex,
    y: ey,
    vx: Math.cos(angle) * DEADSHOT_SPEED,
    vy: Math.sin(angle) * DEADSHOT_SPEED,
    damage: DALTON_DEADSHOT_DAMAGE,
    range: ENEMY_BULLET_RANGE,
    ownerId: eid,
    layer: CollisionLayer.ENEMY_BULLET,
    spriteId: BulletSpriteId.SLUG,
    size: ENEMY_BULLET_SIZE_THREAT,
  })

  transition(eid, AIState.RECOVERY)
}

function executeCoveringFire(world: GameWorld, eid: number, state: DaltonBrotherState): void {
  // Fire one shot per tick
  const ex = Position.x[eid]!
  const ey = Position.y[eid]!

  const spread = (world.rng.next() - 0.5) * 2 * COVERING_FIRE_SPREAD
  const angle = state.burstAimAngle + spread

  spawnBullet(world, {
    x: ex,
    y: ey,
    vx: Math.cos(angle) * COVERING_FIRE_SPEED,
    vy: Math.sin(angle) * COVERING_FIRE_SPEED,
    damage: DALTON_COVERING_FIRE_DAMAGE,
    range: ENEMY_BULLET_RANGE,
    ownerId: eid,
    layer: CollisionLayer.ENEMY_BULLET,
    spriteId: BulletSpriteId.SLUG,
    size: ENEMY_BULLET_SIZE_THREAT,
  })

  state.burstShotsRemaining--
  if (state.burstShotsRemaining <= 0) {
    state.attackExecuted = true
    transition(eid, AIState.RECOVERY)
  }
}

// ============================================================================
// Damage helpers
// ============================================================================

function hitPlayersInRadius(
  world: GameWorld,
  attackerEid: number,
  cx: number,
  cy: number,
  radius: number,
  damage: number,
  kbSpeed: number,
  kbDuration: number,
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
    const fallbackAngle = world.rng.next() * Math.PI * 2
    const nx = dist > 0 ? dx / dist : Math.cos(fallbackAngle)
    const ny = dist > 0 ? dy / dist : Math.sin(fallbackAngle)
    addComponent(world, Knockback, peid)
    Knockback.vx[peid] = nx * kbSpeed
    Knockback.vy[peid] = ny * kbSpeed
    Knockback.duration[peid] = kbDuration

    world.lastPlayerHitDir.set(peid, { x: nx, y: ny })
  }
}

// ============================================================================
// Module registration
// ============================================================================

const daltonModule: BossModule = {
  type: EnemyType.DALTON,
  displayName: 'THE DALTON BOYS',
  color: 0xcc7733,
  radius: 14,
  dropChance: DROP_CHANCE,
  showIndividualBars: true,
  spawnCount: 2,
  spawn,
  tick,
  attack,
}

registerBoss(daltonModule)
