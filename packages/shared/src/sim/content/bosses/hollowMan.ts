/**
 * The Hollow Man Boss Module
 *
 * Stage 3 canyon phantom — a teleporting boss that tests player perception.
 * Three-phase escalation:
 * - Phase 1: Teleport + Phantom Shot / Grave Reach + Dust Veils
 * - Phase 2: Adds afterimage clones (1 per teleport) + Canyon Dust Storm
 * - Phase 3: 2 afterimages per teleport + Convergence (triple-copy attack) + longer storms
 */

import { addEntity, addComponent, removeEntity, defineQuery, hasComponent } from 'bitecs'
import type { GameWorld } from '../../world'
import type { BossModule } from './registry'
import { registerBoss } from './registry'
import {
  Position, Velocity, Speed, Collider, Health, Invincible,
  Enemy, EnemyType, EnemyTier, BossPhase,
  EnemyAI, AIState, Detection, AttackConfig, Steering,
  Player, Dead,
} from '../../components'
import { CollisionLayer, spawnBullet } from '../../prefabs'
import { transition } from '../../systems/enemyAI'
import { applyDamage } from '../../systems/applyDamage'
import { applySlow } from '../../systems/slowDebuff'
import { ENEMY_BULLET_RANGE, BulletSpriteId, ENEMY_BULLET_SIZE_THREAT } from '../weapons'
import { addEnemyComponents, setEnemyDefaults } from './helpers'
import { getPlayableBoundsFromTilemap } from '../../tilemap'

const playerQuery = defineQuery([Player, Position, Health])

// ============================================================================
// Constants
// ============================================================================

const HP = 280
const RADIUS = 16
const AGGRO_RANGE = 500
const ATTACK_RANGE = 400
const DROP_CHANCE = 0.50
const BASE_SPEED = 0 // Hollow Man doesn't walk — he teleports

// Phase thresholds (HP ratio)
const P2_THRESHOLD = 0.70
const P3_THRESHOLD = 0.35

// Transition i-frames
const TRANSITION_IFRAMES = 0.45

// Teleport intervals per phase
const P1_TELEPORT_INTERVAL = 3.5
const P2_TELEPORT_INTERVAL = 3.0
const P3_TELEPORT_INTERVAL = 2.5

// Teleport phase durations
const DISSOLVE_DURATION = 0.2
const WAIT_DURATION = 0.3
const ARRIVE_DURATION = 0.15

// Phantom Shot tuning per phase
const PHANTOM_SHOT_DAMAGE = 14
const PHANTOM_SHOT_SPEED = 700
const P1_PHANTOM_TELEGRAPH = 0.50
const P2_PHANTOM_TELEGRAPH = 0.45
const P3_PHANTOM_TELEGRAPH = 0.40
const P1_PHANTOM_RECOVERY = 0.80
const P2_PHANTOM_RECOVERY = 0.75
const P3_PHANTOM_RECOVERY = 0.70

// Grave Reach tuning per phase
const GRAVE_REACH_DAMAGE = 8
const GRAVE_REACH_RANGE = 60 // radius in px (attack selection + hitbox)
const GRAVE_REACH_SLOW_DURATION = 0.5
const GRAVE_REACH_SLOW_MULTIPLIER = 0.4
const P1_GRAVE_TELEGRAPH = 0.40
const P2_GRAVE_TELEGRAPH = 0.40
const P3_GRAVE_TELEGRAPH = 0.35
const P1_GRAVE_RECOVERY = 0.70
const P2_GRAVE_RECOVERY = 0.70
const P3_GRAVE_RECOVERY = 0.60

// Dust Veil tuning
const DUST_VEIL_RADIUS = 40
const DUST_VEIL_DURATION = 4.0
const DUST_VEIL_INTERVAL = 3 // every 3rd teleport

// Afterimage tuning
const AFTERIMAGE_HP = 1
const AFTERIMAGE_RADIUS = 14
const AFTERIMAGE_LIFETIME = 2.0

// Dust Storm tuning
const P2_STORM_DURATION = 8.0
const P3_STORM_DURATION = 10.0
const P2_STORM_VISIBILITY = 140
const P3_STORM_VISIBILITY = 120
const P2_STORM_COOLDOWN = 25.0
const P3_STORM_COOLDOWN = 20.0

// Convergence tuning
const CONVERGENCE_COPIES = 3
const CONVERGENCE_SHOT_DAMAGE = 10
const CONVERGENCE_SHOT_SPEED = 700
const CONVERGENCE_SHOT_SPACING = 0.4
const CONVERGENCE_RECOVERY = 1.2
const CONVERGENCE_CADENCE = 4 // every 4th teleport cycle in P3
const CONVERGENCE_SILENCE = 1.0 // 1s of silence before copies appear

// Anchor point generation
const MIN_PLAYER_DISTANCE = 80

// Attack type enum
const HollowManAttack = {
  PHANTOM_SHOT: 0,
  GRAVE_REACH: 1,
} as const

// Teleport phase enum
const TeleportPhase = {
  MATERIALIZED: 0,
  DISSOLVING: 1,
  WAITING: 2,
  ARRIVING: 3,
} as const

// ============================================================================
// Per-boss state (stored in world.bossState)
// ============================================================================

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
  convergencePhase: number // 0 = silence, 1 = firing
  convergenceTimer: number
  convergenceCopyEids: number[]
  convergenceCopyStartHP: number // boss HP at convergence start, for damage propagation
  convergenceShotsFired: number
  dustVeilCounter: number
}

function createState(): HollowManState {
  return {
    teleportPhase: TeleportPhase.MATERIALIZED,
    teleportTimer: 0,
    teleportCooldown: P1_TELEPORT_INTERVAL,
    currentAnchor: -1,
    lastAnchor: -1,
    teleportCount: 0,
    anchors: [],
    afterimageEids: [],
    afterimageTimers: [],
    selectedAttack: HollowManAttack.PHANTOM_SHOT,
    aimAngle: 0,
    attackExecuted: false,
    phaseTransitionDone: new Set(),
    stormCooldown: P2_STORM_COOLDOWN,
    convergenceCounter: 0,
    convergenceActive: false,
    convergencePhase: 0,
    convergenceTimer: 0,
    convergenceCopyEids: [],
    convergenceCopyStartHP: 0,
    convergenceShotsFired: 0,
    dustVeilCounter: 0,
  }
}

function getState(world: GameWorld, eid: number): HollowManState {
  return world.bossState.get(eid) as HollowManState
}

// ============================================================================
// Helpers
// ============================================================================

function getDesiredPhase(hpRatio: number): number {
  if (hpRatio <= P3_THRESHOLD) return 3
  if (hpRatio <= P2_THRESHOLD) return 2
  return 1
}

function getTeleportInterval(phase: number): number {
  if (phase >= 3) return P3_TELEPORT_INTERVAL
  if (phase >= 2) return P2_TELEPORT_INTERVAL
  return P1_TELEPORT_INTERVAL
}

function getPhantomTelegraph(phase: number): number {
  if (phase >= 3) return P3_PHANTOM_TELEGRAPH
  if (phase >= 2) return P2_PHANTOM_TELEGRAPH
  return P1_PHANTOM_TELEGRAPH
}

function getPhantomRecovery(phase: number): number {
  if (phase >= 3) return P3_PHANTOM_RECOVERY
  if (phase >= 2) return P2_PHANTOM_RECOVERY
  return P1_PHANTOM_RECOVERY
}

function getGraveTelegraph(phase: number): number {
  if (phase >= 3) return P3_GRAVE_TELEGRAPH
  if (phase >= 2) return P2_GRAVE_TELEGRAPH
  return P1_GRAVE_TELEGRAPH
}

function getGraveRecovery(phase: number): number {
  if (phase >= 3) return P3_GRAVE_RECOVERY
  if (phase >= 2) return P2_GRAVE_RECOVERY
  return P1_GRAVE_RECOVERY
}

function getAfterimageCount(phase: number): number {
  if (phase >= 3) return 2
  if (phase >= 2) return 1
  return 0
}

/**
 * Compute anchor points from arena bounds.
 * 8 perimeter points (evenly spaced along edges) + 2 interior points.
 */
function computeAnchors(world: GameWorld): Array<{ x: number; y: number }> {
  const tilemap = world.tilemap
  if (!tilemap) return [{ x: 400, y: 300 }]

  const bounds = getPlayableBoundsFromTilemap(tilemap)
  const margin = 48
  const minX = bounds.minX + margin
  const maxX = bounds.maxX - margin
  const minY = bounds.minY + margin
  const maxY = bounds.maxY - margin
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  const anchors: Array<{ x: number; y: number }> = []

  // 8 perimeter points: 2 per edge, evenly spaced
  const thirdW = (maxX - minX) / 3
  const thirdH = (maxY - minY) / 3

  // Top edge
  anchors.push({ x: minX + thirdW, y: minY })
  anchors.push({ x: minX + thirdW * 2, y: minY })
  // Bottom edge
  anchors.push({ x: minX + thirdW, y: maxY })
  anchors.push({ x: minX + thirdW * 2, y: maxY })
  // Left edge
  anchors.push({ x: minX, y: minY + thirdH })
  anchors.push({ x: minX, y: minY + thirdH * 2 })
  // Right edge
  anchors.push({ x: maxX, y: minY + thirdH })
  anchors.push({ x: maxX, y: minY + thirdH * 2 })

  // 2 interior points
  anchors.push({ x: centerX - thirdW * 0.5, y: centerY - thirdH * 0.3 })
  anchors.push({ x: centerX + thirdW * 0.5, y: centerY + thirdH * 0.3 })

  return anchors
}

/**
 * Pick an anchor point for teleportation.
 * Weighted random: favors anchors far from player, never same as current, min 80px from player.
 */
function pickAnchor(
  state: HollowManState,
  world: GameWorld,
  playerX: number,
  playerY: number,
): number {
  const anchors = state.anchors
  if (anchors.length === 0) return 0

  // Build weighted candidates
  let totalWeight = 0
  const weights: number[] = []

  for (let i = 0; i < anchors.length; i++) {
    if (i === state.currentAnchor) {
      weights.push(0)
      continue
    }
    const a = anchors[i]!
    const dx = a.x - playerX
    const dy = a.y - playerY
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < MIN_PLAYER_DISTANCE) {
      weights.push(0)
      continue
    }
    // Weight proportional to distance from player
    const w = dist
    weights.push(w)
    totalWeight += w
  }

  // Fallback: if no valid anchor, pick any non-current
  if (totalWeight <= 0) {
    for (let i = 0; i < anchors.length; i++) {
      if (i !== state.currentAnchor) return i
    }
    return 0
  }

  // Weighted random selection
  let roll = world.rng.next() * totalWeight
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i]!
    if (roll <= 0) return i
  }
  return 0
}

/** Find first alive player */
function findPlayer(world: GameWorld): number | null {
  const players = playerQuery(world)
  for (const eid of players) {
    if (!hasComponent(world, Dead, eid)) return eid
  }
  return null
}

/** Spawn an afterimage entity at a given anchor point */
function spawnAfterimage(world: GameWorld, x: number, y: number): number {
  const eid = addEntity(world)

  // Only add the minimum components for collision + rendering
  addComponent(world, Position, eid)
  addComponent(world, Velocity, eid)
  addComponent(world, Collider, eid)
  addComponent(world, Health, eid)
  addComponent(world, Enemy, eid)

  Position.x[eid] = x
  Position.y[eid] = y
  Position.prevX[eid] = x
  Position.prevY[eid] = y
  Velocity.x[eid] = 0
  Velocity.y[eid] = 0
  Collider.radius[eid] = AFTERIMAGE_RADIUS
  Collider.layer[eid] = CollisionLayer.ENEMY
  Health.current[eid] = AFTERIMAGE_HP
  Health.max[eid] = AFTERIMAGE_HP
  Health.iframes[eid] = 0
  Health.iframeDuration[eid] = 0
  Enemy.type[eid] = EnemyType.AFTERIMAGE
  Enemy.tier[eid] = EnemyTier.FODDER

  return eid
}

/** Remove an afterimage entity */
function removeAfterimage(world: GameWorld, eid: number): void {
  if (hasComponent(world, Enemy, eid)) {
    removeEntity(world, eid)
  }
}

/** Clean up all afterimages, storm, veils, and convergence copies */
function cleanupAll(world: GameWorld, state: HollowManState): void {
  // Remove afterimages
  for (const eid of state.afterimageEids) {
    removeAfterimage(world, eid)
  }
  state.afterimageEids.length = 0
  state.afterimageTimers.length = 0

  // Remove convergence copies
  for (const eid of state.convergenceCopyEids) {
    if (hasComponent(world, Enemy, eid)) {
      removeEntity(world, eid)
    }
  }
  state.convergenceCopyEids.length = 0

  // Clear world state
  world.hollowManVeils.length = 0
  world.hollowManStorm = null
}

// ============================================================================
// Spawn
// ============================================================================

function spawn(world: GameWorld, x: number, y: number): number {
  const eid = addEntity(world)
  addEnemyComponents(world, eid)
  addComponent(world, BossPhase, eid)
  setEnemyDefaults(world, eid, x, y)

  Enemy.type[eid] = EnemyType.HOLLOW_MAN
  Enemy.tier[eid] = EnemyTier.THREAT

  Speed.current[eid] = BASE_SPEED
  Speed.max[eid] = BASE_SPEED
  Collider.radius[eid] = RADIUS
  Health.current[eid] = HP
  Health.max[eid] = HP

  Detection.aggroRange[eid] = AGGRO_RANGE
  Detection.attackRange[eid] = ATTACK_RANGE
  Detection.losRequired[eid] = 0
  Steering.preferredRange[eid] = 0
  Steering.separationRadius[eid] = 0

  BossPhase.phase[eid] = 1

  AttackConfig.telegraphDuration[eid] = P1_PHANTOM_TELEGRAPH
  AttackConfig.recoveryDuration[eid] = P1_PHANTOM_RECOVERY
  AttackConfig.cooldown[eid] = P1_TELEPORT_INTERVAL
  AttackConfig.damage[eid] = PHANTOM_SHOT_DAMAGE
  AttackConfig.projectileSpeed[eid] = PHANTOM_SHOT_SPEED
  AttackConfig.projectileAccel[eid] = 0
  AttackConfig.projectileDrag[eid] = 0
  AttackConfig.projectileCount[eid] = 1
  AttackConfig.spreadAngle[eid] = 0

  EnemyAI.initialDelay[eid] = 1.0

  const state = createState()
  state.anchors = computeAnchors(world)

  // Start at a random anchor
  if (state.anchors.length > 0) {
    const idx = Math.floor(world.rng.next() * state.anchors.length)
    state.currentAnchor = idx
    const anchor = state.anchors[idx]!
    Position.x[eid] = anchor.x
    Position.y[eid] = anchor.y
    Position.prevX[eid] = anchor.x
    Position.prevY[eid] = anchor.y
  }

  world.bossState.set(eid, state)
  return eid
}

// ============================================================================
// Phase transitions + tick behavior
// ============================================================================

function tick(world: GameWorld, eid: number, dt: number): void {
  const state = getState(world, eid)
  if (!state) return

  // Early return if dead — clean up everything
  if (Health.current[eid]! <= 0 || hasComponent(world, Dead, eid)) {
    cleanupAll(world, state)
    return
  }

  const currentPhase = BossPhase.phase[eid]!
  const hpRatio = Health.current[eid]! / Math.max(1, Health.max[eid]!)
  const desired = getDesiredPhase(hpRatio)

  // Process phase transitions
  for (let p = currentPhase + 1; p <= desired; p++) {
    if (state.phaseTransitionDone.has(p)) continue
    state.phaseTransitionDone.add(p)

    Health.iframes[eid] = TRANSITION_IFRAMES

    if (p === 2) {
      state.stormCooldown = P2_STORM_COOLDOWN
    }

    if (p === 3) {
      state.stormCooldown = P3_STORM_COOLDOWN
      state.convergenceCounter = 0
    }
  }

  BossPhase.phase[eid] = desired
  const phase = desired

  // Suppress standard AI detection during teleport phases
  if (state.teleportPhase !== TeleportPhase.MATERIALIZED) {
    Detection.aggroRange[eid] = 0
    EnemyAI.state[eid] = AIState.IDLE
    EnemyAI.stateTimer[eid] = 0
  } else {
    Detection.aggroRange[eid] = AGGRO_RANGE
  }

  // --- Manage afterimage timers (remove expired/dead) ---
  for (let i = state.afterimageEids.length - 1; i >= 0; i--) {
    const aEid = state.afterimageEids[i]!
    // Check if already removed by healthSystem (shot by player)
    if (!hasComponent(world, Enemy, aEid) || Health.current[aEid]! <= 0) {
      state.afterimageEids.splice(i, 1)
      state.afterimageTimers.splice(i, 1)
      continue
    }
    // Tick lifetime timer
    state.afterimageTimers[i] = state.afterimageTimers[i]! - dt
    if (state.afterimageTimers[i]! <= 0) {
      removeAfterimage(world, aEid)
      state.afterimageEids.splice(i, 1)
      state.afterimageTimers.splice(i, 1)
    }
  }

  // --- Manage dust veil timers ---
  for (let i = world.hollowManVeils.length - 1; i >= 0; i--) {
    const veil = world.hollowManVeils[i]!
    veil.timer -= dt
    if (veil.timer <= 0) {
      world.hollowManVeils.splice(i, 1)
    }
  }

  // --- Manage dust storm timer ---
  if (world.hollowManStorm) {
    world.hollowManStorm.timer -= dt
    if (world.hollowManStorm.timer <= 0) {
      world.hollowManStorm = null
    }
  }

  // --- Storm activation ---
  if (phase >= 2 && !world.hollowManStorm && !state.convergenceActive) {
    state.stormCooldown -= dt
    if (state.stormCooldown <= 0) {
      const duration = phase >= 3 ? P3_STORM_DURATION : P2_STORM_DURATION
      const visibility = phase >= 3 ? P3_STORM_VISIBILITY : P2_STORM_VISIBILITY
      world.hollowManStorm = {
        active: true,
        timer: duration,
        duration,
        visibilityRadius: visibility,
      }
      state.stormCooldown = phase >= 3 ? P3_STORM_COOLDOWN : P2_STORM_COOLDOWN
    }
  }

  // --- Manage convergence sequence ---
  if (state.convergenceActive) {
    tickConvergence(world, eid, state, dt)
    return // Convergence takes over the tick
  }

  // --- Teleport state machine ---
  const playerEid = findPlayer(world)
  const playerX = playerEid !== null ? Position.x[playerEid]! : Position.x[eid]!
  const playerY = playerEid !== null ? Position.y[playerEid]! : Position.y[eid]!

  switch (state.teleportPhase) {
    case TeleportPhase.MATERIALIZED: {
      // During MATERIALIZED, let the standard AI handle telegraph/attack/recovery
      // Only start teleport cycle when in IDLE or CHASE (attack cooldown expired)
      const aiState = EnemyAI.state[eid]!
      if (aiState === AIState.IDLE || aiState === AIState.CHASE) {
        state.teleportCooldown -= dt
        if (state.teleportCooldown <= 0) {
          // Check for convergence trigger in P3
          if (phase >= 3) {
            state.convergenceCounter++
            if (state.convergenceCounter >= CONVERGENCE_CADENCE) {
              state.convergenceCounter = 0
              triggerConvergence(world, eid, state)
              return
            }
          }

          state.teleportPhase = TeleportPhase.DISSOLVING
          state.teleportTimer = 0
          Velocity.x[eid] = 0
          Velocity.y[eid] = 0
        }
      }
      break
    }

    case TeleportPhase.DISSOLVING: {
      state.teleportTimer += dt
      if (state.teleportTimer >= DISSOLVE_DURATION) {
        // Dust veil at departure point
        state.dustVeilCounter++
        if (state.dustVeilCounter % DUST_VEIL_INTERVAL === 0 && phase <= 2) {
          world.hollowManVeils.push({
            x: Position.x[eid]!,
            y: Position.y[eid]!,
            radius: DUST_VEIL_RADIUS,
            timer: DUST_VEIL_DURATION,
          })
        }

        // Pick destination
        state.lastAnchor = state.currentAnchor
        const destIdx = pickAnchor(state, world, playerX, playerY)
        state.currentAnchor = destIdx

        // Move entity off-screen during wait
        Position.x[eid] = -9999
        Position.y[eid] = -9999
        Position.prevX[eid] = -9999
        Position.prevY[eid] = -9999

        state.teleportPhase = TeleportPhase.WAITING
        state.teleportTimer = 0
      }
      break
    }

    case TeleportPhase.WAITING: {
      state.teleportTimer += dt
      if (state.teleportTimer >= WAIT_DURATION) {
        state.teleportPhase = TeleportPhase.ARRIVING
        state.teleportTimer = 0
      }
      break
    }

    case TeleportPhase.ARRIVING: {
      state.teleportTimer += dt
      if (state.teleportTimer >= ARRIVE_DURATION) {
        // Materialize at destination
        const dest = state.anchors[state.currentAnchor]
        if (dest) {
          Position.x[eid] = dest.x
          Position.y[eid] = dest.y
          Position.prevX[eid] = dest.x
          Position.prevY[eid] = dest.y
        }

        state.teleportCount++

        // Spawn afterimages at other anchor points
        const afterimageCount = getAfterimageCount(phase)
        if (afterimageCount > 0) {
          const usedAnchors = new Set([state.currentAnchor])
          for (let i = 0; i < afterimageCount; i++) {
            // Pick a random unused anchor
            let aiIdx = -1
            for (let attempt = 0; attempt < 20; attempt++) {
              const idx = Math.floor(world.rng.next() * state.anchors.length)
              if (!usedAnchors.has(idx)) {
                aiIdx = idx
                break
              }
            }
            if (aiIdx >= 0) {
              usedAnchors.add(aiIdx)
              const anchorPos = state.anchors[aiIdx]!
              const afterEid = spawnAfterimage(world, anchorPos.x, anchorPos.y)
              state.afterimageEids.push(afterEid)
              state.afterimageTimers.push(AFTERIMAGE_LIFETIME)
            }
          }
        }

        // Transition to MATERIALIZED and start attack
        state.teleportPhase = TeleportPhase.MATERIALIZED
        state.teleportCooldown = getTeleportInterval(phase)

        // Select attack based on distance to player
        const dx = playerX - Position.x[eid]!
        const dy = playerY - Position.y[eid]!
        const distToPlayer = Math.sqrt(dx * dx + dy * dy)

        if (distToPlayer <= GRAVE_REACH_RANGE) {
          state.selectedAttack = HollowManAttack.GRAVE_REACH
          AttackConfig.telegraphDuration[eid] = getGraveTelegraph(phase)
          AttackConfig.recoveryDuration[eid] = getGraveRecovery(phase)
          AttackConfig.damage[eid] = GRAVE_REACH_DAMAGE
        } else {
          state.selectedAttack = HollowManAttack.PHANTOM_SHOT
          AttackConfig.telegraphDuration[eid] = getPhantomTelegraph(phase)
          AttackConfig.recoveryDuration[eid] = getPhantomRecovery(phase)
          AttackConfig.damage[eid] = PHANTOM_SHOT_DAMAGE
        }

        // Lock aim at player
        if (playerEid !== null) {
          state.aimAngle = Math.atan2(
            Position.y[playerEid]! - Position.y[eid]!,
            Position.x[playerEid]! - Position.x[eid]!,
          )
        }
        state.attackExecuted = false

        // Set target and enter TELEGRAPH
        if (playerEid !== null) {
          EnemyAI.targetEid[eid] = playerEid
        }
        transition(eid, AIState.TELEGRAPH)
      }
      break
    }
  }

  // --- Telegraph behavior: stand still ---
  if (EnemyAI.state[eid] === AIState.TELEGRAPH) {
    Velocity.x[eid] = 0
    Velocity.y[eid] = 0
  }

  // --- Boss telegraph shapes ---
  if (EnemyAI.state[eid] === AIState.TELEGRAPH) {
    const ex = Position.x[eid]!
    const ey = Position.y[eid]!
    const telegraphDur = AttackConfig.telegraphDuration[eid]!
    const progress = telegraphDur > 0 ? Math.min(1, EnemyAI.stateTimer[eid]! / telegraphDur) : 1

    if (state.selectedAttack === HollowManAttack.PHANTOM_SHOT) {
      // Line telegraph
      const endX = ex + Math.cos(state.aimAngle) * 300
      const endY = ey + Math.sin(state.aimAngle) * 300
      world.bossTelegraphs.push({
        kind: 'line',
        x: ex, y: ey,
        radius: 0,
        endX, endY,
        color: 0xcc8844,
        alpha: 0.3,
        progress,
      })
    } else if (state.selectedAttack === HollowManAttack.GRAVE_REACH) {
      // Arc telegraph for cone
      world.bossTelegraphs.push({
        kind: 'arc',
        x: ex, y: ey,
        radius: GRAVE_REACH_RANGE,
        angle: state.aimAngle,
        arcHalf: 0.5,
        color: 0x886644,
        alpha: 0.3,
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
  if (!state) return

  if (state.attackExecuted) {
    transition(eid, AIState.RECOVERY)
    return
  }
  state.attackExecuted = true

  const ex = Position.x[eid]!
  const ey = Position.y[eid]!

  if (state.selectedAttack === HollowManAttack.PHANTOM_SHOT) {
    const jitter = (world.rng.next() - 0.5) * 0.06
    const angle = state.aimAngle + jitter
    spawnBullet(world, {
      x: ex, y: ey,
      vx: Math.cos(angle) * PHANTOM_SHOT_SPEED,
      vy: Math.sin(angle) * PHANTOM_SHOT_SPEED,
      damage: PHANTOM_SHOT_DAMAGE,
      accel: 0,
      drag: 0,
      range: ENEMY_BULLET_RANGE,
      ownerId: eid,
      layer: CollisionLayer.ENEMY_BULLET,
      spriteId: BulletSpriteId.SPIRIT_ANIM,
      size: ENEMY_BULLET_SIZE_THREAT,
    })
  } else if (state.selectedAttack === HollowManAttack.GRAVE_REACH) {
    // Cone damage: hit player if within range
    const playerEid = findPlayer(world)
    if (playerEid !== null) {
      const px = Position.x[playerEid]!
      const py = Position.y[playerEid]!
      const dx = px - ex
      const dy = py - ey
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist <= GRAVE_REACH_RANGE) {
        // Respect i-frames and invincibility
        if (Health.iframes[playerEid]! <= 0 && !hasComponent(world, Invincible, playerEid)) {
          applyDamage(world, playerEid, {
            amount: GRAVE_REACH_DAMAGE,
            attackerEid: eid,
            setIframes: true,
          })
          applySlow(world, playerEid, GRAVE_REACH_SLOW_MULTIPLIER, GRAVE_REACH_SLOW_DURATION)
        }
      }
    }
  }

  transition(eid, AIState.RECOVERY)
}

// ============================================================================
// Convergence
// ============================================================================

function triggerConvergence(world: GameWorld, eid: number, state: HollowManState): void {
  state.convergenceActive = true
  state.convergencePhase = 0 // silence phase
  state.convergenceTimer = 0
  state.convergenceShotsFired = 0
  state.convergenceCopyEids = []
  state.convergenceCopyStartHP = Health.current[eid]!

  // Dissolve the boss (move off screen)
  Position.x[eid] = -9999
  Position.y[eid] = -9999
  Position.prevX[eid] = -9999
  Position.prevY[eid] = -9999
  Velocity.x[eid] = 0
  Velocity.y[eid] = 0
  Detection.aggroRange[eid] = 0
  EnemyAI.state[eid] = AIState.IDLE
  EnemyAI.stateTimer[eid] = 0
}

function tickConvergence(world: GameWorld, eid: number, state: HollowManState, dt: number): void {
  state.convergenceTimer += dt

  if (state.convergencePhase === 0) {
    // Silence phase
    if (state.convergenceTimer >= CONVERGENCE_SILENCE) {
      state.convergencePhase = 1
      state.convergenceTimer = 0

      // Spawn copies at 3 different anchor points
      const usedAnchors = new Set<number>()
      for (let i = 0; i < CONVERGENCE_COPIES; i++) {
        let idx = -1
        for (let attempt = 0; attempt < 20; attempt++) {
          const candidate = Math.floor(world.rng.next() * state.anchors.length)
          if (!usedAnchors.has(candidate)) {
            idx = candidate
            break
          }
        }
        if (idx < 0) idx = i % state.anchors.length

        usedAnchors.add(idx)
        const anchor = state.anchors[idx]!

        if (i === 0) {
          // First copy is the real boss
          Position.x[eid] = anchor.x
          Position.y[eid] = anchor.y
          Position.prevX[eid] = anchor.x
          Position.prevY[eid] = anchor.y
          state.currentAnchor = idx
        } else {
          // Spawn temporary copy entity
          const copyEid = addEntity(world)
          addEnemyComponents(world, copyEid)
          setEnemyDefaults(world, copyEid, anchor.x, anchor.y)
          Enemy.type[copyEid] = EnemyType.HOLLOW_MAN
          Enemy.tier[copyEid] = EnemyTier.THREAT
          Collider.radius[copyEid] = RADIUS
          Health.current[copyEid] = Health.current[eid]!
          Health.max[copyEid] = Health.max[eid]!
          Speed.current[copyEid] = 0
          Speed.max[copyEid] = 0
          Detection.aggroRange[copyEid] = 0
          EnemyAI.state[copyEid] = AIState.IDLE
          state.convergenceCopyEids.push(copyEid)
        }
      }
    }
    return
  }

  // Firing phase: fire shots from copies sequentially
  const shotIndex = Math.floor(state.convergenceTimer / CONVERGENCE_SHOT_SPACING)
  if (shotIndex > state.convergenceShotsFired && state.convergenceShotsFired < CONVERGENCE_COPIES) {
    const playerEid = findPlayer(world)
    if (playerEid !== null) {
      // Determine which entity fires this shot
      let shooterEid: number
      if (state.convergenceShotsFired === 0) {
        shooterEid = eid // real boss fires first
      } else {
        const copyIdx = state.convergenceShotsFired - 1
        shooterEid = state.convergenceCopyEids[copyIdx] ?? eid
      }

      const sx = Position.x[shooterEid]!
      const sy = Position.y[shooterEid]!
      const angle = Math.atan2(
        Position.y[playerEid]! - sy,
        Position.x[playerEid]! - sx,
      )

      spawnBullet(world, {
        x: sx, y: sy,
        vx: Math.cos(angle) * CONVERGENCE_SHOT_SPEED,
        vy: Math.sin(angle) * CONVERGENCE_SHOT_SPEED,
        damage: CONVERGENCE_SHOT_DAMAGE,
        accel: 0,
        drag: 0,
        range: ENEMY_BULLET_RANGE,
        ownerId: shooterEid,
        layer: CollisionLayer.ENEMY_BULLET,
        spriteId: BulletSpriteId.SPIRIT_ANIM,
        size: ENEMY_BULLET_SIZE_THREAT,
      })
    }
    state.convergenceShotsFired++
  }

  // End convergence after all shots + brief wait
  const totalFiringTime = CONVERGENCE_COPIES * CONVERGENCE_SHOT_SPACING
  if (state.convergenceTimer >= totalFiringTime) {
    // Propagate damage from copies to real boss.
    // Compute total damage dealt to copies (including ones already killed by healthSystem).
    let totalCopyDamage = 0
    for (const copyEid of state.convergenceCopyEids) {
      if (hasComponent(world, Enemy, copyEid)) {
        const copyDamage = state.convergenceCopyStartHP - Health.current[copyEid]!
        totalCopyDamage += Math.max(0, copyDamage)
        removeEntity(world, copyEid)
      } else {
        // Copy was already removed by healthSystem (killed) — all its HP was damage
        totalCopyDamage += Math.max(0, state.convergenceCopyStartHP)
      }
    }
    if (totalCopyDamage > 0) {
      Health.current[eid] = Math.max(0, Health.current[eid]! - totalCopyDamage)
    }
    state.convergenceCopyEids = []

    // End convergence, enter recovery
    state.convergenceActive = false
    state.teleportPhase = TeleportPhase.MATERIALIZED
    state.teleportCooldown = getTeleportInterval(BossPhase.phase[eid]!)
    Detection.aggroRange[eid] = AGGRO_RANGE
    AttackConfig.recoveryDuration[eid] = CONVERGENCE_RECOVERY
    transition(eid, AIState.RECOVERY)
  }
}

// ============================================================================
// Module registration
// ============================================================================

const hollowManModule: BossModule = {
  type: EnemyType.HOLLOW_MAN,
  displayName: 'THE HOLLOW MAN',
  radius: RADIUS,
  dropChance: DROP_CHANCE,
  spawn,
  tick,
  attack,
}

registerBoss(hollowManModule)

// ============================================================================
// Test-facing constant exports
// ============================================================================

export const HOLLOW_MAN_HP = HP
export const HOLLOW_MAN_RADIUS = RADIUS
export const HOLLOW_MAN_P1_SPEED = BASE_SPEED
export const HOLLOW_MAN_TRANSITION_IFRAMES = TRANSITION_IFRAMES
export const HOLLOW_MAN_P1_TELEPORT_INTERVAL = P1_TELEPORT_INTERVAL
export const HOLLOW_MAN_P2_TELEPORT_INTERVAL = P2_TELEPORT_INTERVAL
export const HOLLOW_MAN_P3_TELEPORT_INTERVAL = P3_TELEPORT_INTERVAL
export const HOLLOW_MAN_PHANTOM_SHOT_DAMAGE = PHANTOM_SHOT_DAMAGE
export const HOLLOW_MAN_PHANTOM_SHOT_SPEED = PHANTOM_SHOT_SPEED
export const HOLLOW_MAN_GRAVE_REACH_DAMAGE = GRAVE_REACH_DAMAGE
export const HOLLOW_MAN_GRAVE_REACH_RANGE = GRAVE_REACH_RANGE
export const HOLLOW_MAN_AFTERIMAGE_HP = AFTERIMAGE_HP
export const HOLLOW_MAN_AFTERIMAGE_LIFETIME = AFTERIMAGE_LIFETIME
export const HOLLOW_MAN_DUST_VEIL_RADIUS = DUST_VEIL_RADIUS
export const HOLLOW_MAN_DUST_VEIL_DURATION = DUST_VEIL_DURATION
export const HOLLOW_MAN_P2_STORM_DURATION = P2_STORM_DURATION
export const HOLLOW_MAN_P3_STORM_DURATION = P3_STORM_DURATION
export const HOLLOW_MAN_P2_STORM_VISIBILITY = P2_STORM_VISIBILITY
export const HOLLOW_MAN_P3_STORM_VISIBILITY = P3_STORM_VISIBILITY
export const HOLLOW_MAN_CONVERGENCE_SHOT_DAMAGE = CONVERGENCE_SHOT_DAMAGE
export const HOLLOW_MAN_CONVERGENCE_COPIES = CONVERGENCE_COPIES
export const HOLLOW_MAN_CONVERGENCE_RECOVERY = CONVERGENCE_RECOVERY
export const HOLLOW_MAN_DISSOLVE_DURATION = DISSOLVE_DURATION
export const HOLLOW_MAN_WAIT_DURATION = WAIT_DURATION
export const HOLLOW_MAN_ARRIVE_DURATION = ARRIVE_DURATION
export const HOLLOW_MAN_P1_PHANTOM_TELEGRAPH = P1_PHANTOM_TELEGRAPH
export const HOLLOW_MAN_P2_PHANTOM_TELEGRAPH = P2_PHANTOM_TELEGRAPH
export const HOLLOW_MAN_P3_PHANTOM_TELEGRAPH = P3_PHANTOM_TELEGRAPH
