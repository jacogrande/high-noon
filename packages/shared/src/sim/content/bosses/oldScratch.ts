/**
 * Old Scratch Boss Module (Stage 4 Final Boss)
 *
 * The Devil at the Crossroads. A 4-phase boss fight:
 *  Phase 1 — The Wager: gentleman duel, character-adaptive attacks
 *  Phase 2 — The Cheat: arena shrinks, Ghost Rider adds, brimstone cracks
 *  Phase 3 — The Devil Unleashed: Hellfire Pillars, stationary true form
 *  Phase 4 — The Final Draw: quick-draw reaction duel
 *
 * This file implements spawn, state machine, phase transitions,
 * Infernal Counter passive, and Phase 1 character-adaptive attacks.
 */

import { addEntity, addComponent, hasComponent, defineQuery } from 'bitecs'
import type { GameWorld } from '../../world'
import type { BossModule } from './registry'
import { registerBoss } from './registry'
import {
  Position, Velocity, Speed, Collider, Health, Knockback,
  Enemy, EnemyType, EnemyTier, BossPhase,
  EnemyAI, AIState, Detection, AttackConfig, Steering,
  Player, Bullet, Dead,
} from '../../components'
import { CollisionLayer, spawnBullet, spawnGhostRider } from '../../prefabs'
import { transition } from '../../systems/enemyAI'
import { applyDamage } from '../../systems/applyDamage'
import { isInArc } from '../../systems/melee'
import { getCharacterIdForPlayer } from '../../upgrade'
import { addEnemyComponents, setEnemyDefaults } from './helpers'
import {
  TileType,
  collapseTileRange,
  type Tilemap,
  type TileTypeValue,
} from '../../tilemap'
import { ENEMY_BULLET_RANGE, ENEMY_BULLET_SIZE_THREAT, BulletSpriteId } from '../weapons'
import { PLAYER_RADIUS } from '../player'

const playerQuery = defineQuery([Player, Position, Health])
const enemyQuery = defineQuery([Enemy])

// ============================================================================
// Constants
// ============================================================================

const HP = 400
const RADIUS = 18
const AGGRO_RANGE = 600
const ATTACK_RANGE = 300
const DROP_CHANCE = 1.0

// Phase thresholds (HP ratio)
const P2_THRESHOLD = 0.75
const P3_THRESHOLD = 0.45
const P4_THRESHOLD = 0.15

// Phase speeds (px/s)
const P1_SPEED = 150
const P2_SPEED = 180
const P3_SPEED = 0     // stationary true form
const P4_SPEED = 0     // stationary for draw

// Transition i-frames
const TRANSITION_IFRAMES = 0.45

// Mid-fight heal (Phase 3 entry)
const P3_HEAL_HP = 250

// Phase cooldowns (absolute values in seconds)
const P1_COOLDOWN = 1.0
const P2_COOLDOWN = 0.85    // = P1_COOLDOWN × 0.85

// Infernal Counter
const COUNTER_WINDOW_DURATION = 0.4
const COUNTER_INTERNAL_CD = 1.5
const COUNTER_SIDESTEP_DIST = 60
const COUNTER_SHOT_DAMAGE = 12
const COUNTER_SHOT_SPEED = 800

// Arena shrink constants (tiles inset from road ends per phase)
const P2_ROAD_SHRINK_TILES = 6
const P3_ROAD_SHRINK_TILES = 10

// Hook ID for the counter hook
const COUNTER_HOOK_ID_PREFIX = 'old-scratch-counter-'

// ============================================================================
// Phase 1 Attack Enum, Constants & Cycles
// ============================================================================

export const enum P1Attack {
  // Sheriff
  DEAD_EYE_SHOT = 0,
  DEVILS_FAN = 1,
  BLACK_IRON_RELOAD = 2,
  SIDEWINDER = 3,
  // Undertaker
  BRIMSTONE_BLAST = 4,
  COFFIN_NAIL = 5,
  SHADOW_STEP = 6,
  // Prospector
  HELLPICK_SWING = 7,
  INFERNAL_CHARGE = 8,
  DEVILS_DYNAMITE = 9,
}

const SHERIFF_CYCLE: P1Attack[] = [
  P1Attack.DEAD_EYE_SHOT,
  P1Attack.SIDEWINDER,
  P1Attack.DEVILS_FAN,
  P1Attack.BLACK_IRON_RELOAD,
]
const UNDERTAKER_CYCLE: P1Attack[] = [
  P1Attack.BRIMSTONE_BLAST,
  P1Attack.COFFIN_NAIL,
  P1Attack.SHADOW_STEP,
]
const PROSPECTOR_CYCLE: P1Attack[] = [
  P1Attack.HELLPICK_SWING,
  P1Attack.INFERNAL_CHARGE,
  P1Attack.DEVILS_DYNAMITE,
]

// --- Sheriff attack constants ---
const DEAD_EYE_TELEGRAPH = 0.4
const DEAD_EYE_DAMAGE = 14
const DEAD_EYE_SPEED = 700

const DEVILS_FAN_TELEGRAPH = 0.3
const DEVILS_FAN_DAMAGE = 8
const DEVILS_FAN_BULLETS = 4
const DEVILS_FAN_SPEED = 500
const DEVILS_FAN_SPREAD = 0.5
const DEVILS_FAN_RANGE = 250

const BLACK_IRON_RECOVERY = 0.7

const SIDEWINDER_TELEGRAPH = 0.2
const SIDEWINDER_DIST = 200
const SIDEWINDER_COOLDOWN = 2.0

// --- Undertaker attack constants ---
const BRIMSTONE_BLAST_TELEGRAPH = 0.3
const BRIMSTONE_BLAST_DAMAGE = 10
const BRIMSTONE_BLAST_PELLETS = 5
const BRIMSTONE_BLAST_SPEED = 400
const BRIMSTONE_BLAST_SPREAD = 0.4
const BRIMSTONE_BLAST_RANGE = 150

const COFFIN_NAIL_TELEGRAPH = 0.5
const COFFIN_NAIL_DAMAGE = 6
const COFFIN_NAIL_DPS = 4
const COFFIN_NAIL_RADIUS = 100
const COFFIN_NAIL_DELAY = 0.8
const COFFIN_NAIL_DURATION = 2.0

const SHADOW_STEP_TELEGRAPH = 0.15
const SHADOW_STEP_DIST = 150
const SHADOW_STEP_COOLDOWN = 3.0

// --- Prospector attack constants ---
const HELLPICK_TELEGRAPH = 0.25
const HELLPICK_DAMAGE = 12
const HELLPICK_ARC = (100 * Math.PI) / 180  // 100° in radians
const HELLPICK_REACH = 70
const HELLPICK_KNOCKBACK_SPEED = 300
const HELLPICK_KNOCKBACK_DURATION = 0.2

const INFERNAL_CHARGE_TELEGRAPH = 0.4
const INFERNAL_CHARGE_DAMAGE = 15
const INFERNAL_CHARGE_SPEED = 350
const INFERNAL_CHARGE_DIST = 200
const FIRE_TRAIL_DPS = 4
const FIRE_TRAIL_DURATION = 3.0
const FIRE_TRAIL_RADIUS = 20
const FIRE_TRAIL_SPACING = 30

const DEVILS_DYNAMITE_TELEGRAPH = 0.3
const DEVILS_DYNAMITE_DAMAGE = 18
const DEVILS_DYNAMITE_RADIUS = 80
const DEVILS_DYNAMITE_FUSE = 1.2
const DEVILS_DYNAMITE_KNOCKBACK = 200

// Default recovery for most attacks
const DEFAULT_P1_RECOVERY = 0.3

// ============================================================================
// Phase 2 Attack Enum, Constants & Cycles
// ============================================================================

export const enum P2Attack {
  // New P2-only attacks (P1 attacks reuse P1Attack values 0-9)
  CROSSROADS_SALVO = 10,
  BRIMSTONE_LASH = 11,
  SUMMON_GHOST_RIDER = 12,
}

// Phase 2 timing multipliers (applied to P1 attack durations)
const P2_TELEGRAPH_MUL = 0.8    // 20% faster telegraphs
const P2_COOLDOWN_MUL = 0.85    // 15% shorter cooldowns (distinct from P2_COOLDOWN absolute value)

// Snap-shot after reposition (Sidewinder/Shadow Step landing shot)
const SNAP_SHOT_DAMAGE = 8
const SNAP_SHOT_SPEED = 600

// Crossroads Salvo
const CROSSROADS_SALVO_TELEGRAPH = 0.35
const CROSSROADS_SALVO_BULLETS = 6
const CROSSROADS_SALVO_DAMAGE = 10
const CROSSROADS_SALVO_SPEED = 300

// Brimstone Lash
const BRIMSTONE_LASH_TELEGRAPH = 0.5
const BRIMSTONE_LASH_DAMAGE = 12
const BRIMSTONE_LASH_DURATION = 0.8
const BRIMSTONE_LASH_WIDTH = 40       // half-width of the lash damage zone

// Summon Ghost Rider
const SUMMON_GHOST_RIDER_TELEGRAPH = 0.4
const GHOST_RIDER_MAX_ALIVE = 2
const GHOST_RIDER_SUMMON_COOLDOWN = 10.0

// Phase 2 cycles — P1 attacks + new P2 attacks
const SHERIFF_P2_CYCLE: number[] = [
  P1Attack.DEAD_EYE_SHOT,
  P1Attack.SIDEWINDER,
  P2Attack.CROSSROADS_SALVO,
  P1Attack.DEVILS_FAN,
  P1Attack.BLACK_IRON_RELOAD,
  P2Attack.BRIMSTONE_LASH,
  P2Attack.SUMMON_GHOST_RIDER,
]
const UNDERTAKER_P2_CYCLE: number[] = [
  P1Attack.BRIMSTONE_BLAST,
  P2Attack.CROSSROADS_SALVO,
  P1Attack.COFFIN_NAIL,
  P1Attack.SHADOW_STEP,
  P2Attack.BRIMSTONE_LASH,
  P2Attack.SUMMON_GHOST_RIDER,
]
const PROSPECTOR_P2_CYCLE: number[] = [
  P1Attack.HELLPICK_SWING,
  P2Attack.CROSSROADS_SALVO,
  P1Attack.INFERNAL_CHARGE,
  P1Attack.DEVILS_DYNAMITE,
  P2Attack.BRIMSTONE_LASH,
  P2Attack.SUMMON_GHOST_RIDER,
]

// ============================================================================
// Per-boss state (stored in world.bossState)
// ============================================================================

export interface CoffinNailZone {
  x: number
  y: number
  delay: number       // countdown before activation
  active: boolean
  duration: number    // time remaining after activation
  hitEntities: Set<number>  // track initial hit per entity
}

export interface FireTrailSegment {
  x: number
  y: number
  timer: number       // time remaining
}

export interface OldScratchState {
  phase: number                    // 1-4
  phaseTimer: number               // time in current phase
  attackCycleIndex: number         // position in attack sequence
  attackCooldown: number           // time until next attack
  counterCooldown: number          // infernal counter internal CD
  counterWindowActive: boolean     // true during idle stance counter window
  counterWindowTimer: number       // time remaining in current counter window

  // Phase 1 attack state
  selectedAttack: number           // current P1Attack value
  attackExecuted: boolean          // guards against double-execution
  aimAngle: number                 // locked aim direction at telegraph entry
  characterId: string              // cached player character id ('' = undetected)
  sidewinderCooldown: number       // per-move cooldown for Sidewinder
  sidewinderSign: number           // pre-picked perpendicular direction (+1 or -1)
  shadowStepCooldown: number       // per-move cooldown for Shadow Step

  // Undertaker: delayed damage zones
  coffinNails: CoffinNailZone[]

  // Prospector: fire trail from Infernal Charge
  fireTrails: FireTrailSegment[]
  isCharging: boolean
  chargeTimer: number
  chargeAimX: number
  chargeAimY: number
  chargeStartX: number
  chargeStartY: number
  lastTrailDist: number            // distance traveled since last trail segment

  // Phase 2
  ghostRiderCooldown: number
  ghostRiderCount: number
  brimstoneLash: {
    active: boolean
    roadIndex: number       // 0=N, 1=S, 2=W, 3=E
    timer: number           // time remaining for damage
    startX: number          // lash line start
    startY: number
    endX: number            // lash line end
    endY: number
  } | null

  // Phase 3
  pillarEids: number[]
  pillarRespawnTimers: number[]
  dustStormActive: boolean
  stampedeTimer: number

  // Phase 4
  drawRound: number
  drawPhase: 'staredown' | 'flash' | 'scramble' | 'reset'
  staredownTimer: number
  flashFired: boolean
  playerShotDuringWindow: boolean

  // Phase transition guard
  phaseTransitionDone: Set<number>
}

function createOldScratchState(): OldScratchState {
  return {
    phase: 1,
    phaseTimer: 0,
    attackCycleIndex: 0,
    attackCooldown: 0,
    counterCooldown: 0,
    counterWindowActive: false,
    counterWindowTimer: 0,

    // Phase 1 attack state
    selectedAttack: P1Attack.DEAD_EYE_SHOT,
    attackExecuted: false,
    aimAngle: 0,
    characterId: '',
    sidewinderCooldown: 0,
    sidewinderSign: 1,
    shadowStepCooldown: 0,
    coffinNails: [],
    fireTrails: [],
    isCharging: false,
    chargeTimer: 0,
    chargeAimX: 0,
    chargeAimY: 0,
    chargeStartX: 0,
    chargeStartY: 0,
    lastTrailDist: 0,

    ghostRiderCooldown: 0,
    ghostRiderCount: 0,
    brimstoneLash: null,

    pillarEids: [],
    pillarRespawnTimers: [],
    dustStormActive: false,
    stampedeTimer: 0,

    drawRound: 0,
    drawPhase: 'staredown',
    staredownTimer: 0,
    flashFired: false,
    playerShotDuringWindow: false,

    phaseTransitionDone: new Set(),
  }
}

function getState(world: GameWorld, eid: number): OldScratchState {
  return world.bossState.get(eid) as OldScratchState
}

// ============================================================================
// Helpers
// ============================================================================

function getDesiredPhase(hpRatio: number): number {
  if (hpRatio <= P4_THRESHOLD) return 4
  if (hpRatio <= P3_THRESHOLD) return 3
  if (hpRatio <= P2_THRESHOLD) return 2
  return 1
}

/**
 * Find first alive player entity for targeting/counter.
 */
function findPlayerEid(world: GameWorld): number {
  const players = playerQuery(world)
  for (const peid of players) {
    if (!hasComponent(world, Dead, peid)) return peid
  }
  return -1
}

/**
 * Shrink roads by converting outer road tiles to WALL on the solid layer.
 * Shrinks inward from each road endpoint by `insetTiles` tiles.
 */
function shrinkRoads(tilemap: Tilemap, insetTiles: number): void {
  const cx = Math.floor(tilemap.width / 2)
  const cy = Math.floor(tilemap.height / 2)
  const halfRoad = 4 // ROAD_WIDTH / 2
  const halfCenter = 8 // CENTER_SIZE / 2
  const centerMinX = cx - halfCenter
  const centerMaxX = cx + halfCenter - 1
  const centerMinY = cy - halfCenter
  const centerMaxY = cy + halfCenter - 1
  const roadMinX = cx - halfRoad
  const roadMaxX = cx + halfRoad - 1
  const roadMinY = cy - halfRoad
  const roadMaxY = cy + halfRoad - 1

  // North road: rows 0..(insetTiles-1)
  collapseTileRange(tilemap, 0, roadMinX, 0, roadMaxX, insetTiles - 1, TileType.WALL as TileTypeValue)
  // South road: rows (height-insetTiles)..(height-1)
  collapseTileRange(tilemap, 0, roadMinX, tilemap.height - insetTiles, roadMaxX, tilemap.height - 1, TileType.WALL as TileTypeValue)
  // West road: cols 0..(insetTiles-1)
  collapseTileRange(tilemap, 0, 0, roadMinY, insetTiles - 1, roadMaxY, TileType.WALL as TileTypeValue)
  // East road: cols (width-insetTiles)..(width-1)
  collapseTileRange(tilemap, 0, tilemap.width - insetTiles, roadMinY, tilemap.width - 1, roadMaxY, TileType.WALL as TileTypeValue)
}

/**
 * Place brimstone cracks along the edges of all four roads on the floor layer.
 */
function placeBrimstoneCracks(tilemap: Tilemap): void {
  const cx = Math.floor(tilemap.width / 2)
  const cy = Math.floor(tilemap.height / 2)
  const halfRoad = 4
  const halfCenter = 8
  const centerMinY = cy - halfCenter
  const centerMaxY = cy + halfCenter - 1
  const centerMinX = cx - halfCenter
  const centerMaxX = cx + halfCenter - 1
  const roadMinX = cx - halfRoad
  const roadMaxX = cx + halfRoad - 1
  const roadMinY = cy - halfRoad
  const roadMaxY = cy + halfRoad - 1

  // North road edges (left and right columns of road)
  for (let y = 0; y < centerMinY; y++) {
    tilemap.layers[1]!.data[y * tilemap.width + roadMinX] = TileType.BRIMSTONE
    tilemap.layers[1]!.data[y * tilemap.width + roadMaxX] = TileType.BRIMSTONE
  }
  // South road edges
  for (let y = centerMaxY + 1; y < tilemap.height; y++) {
    tilemap.layers[1]!.data[y * tilemap.width + roadMinX] = TileType.BRIMSTONE
    tilemap.layers[1]!.data[y * tilemap.width + roadMaxX] = TileType.BRIMSTONE
  }
  // West road edges (top and bottom rows of road)
  for (let x = 0; x < centerMinX; x++) {
    tilemap.layers[1]!.data[roadMinY * tilemap.width + x] = TileType.BRIMSTONE
    tilemap.layers[1]!.data[roadMaxY * tilemap.width + x] = TileType.BRIMSTONE
  }
  // East road edges
  for (let x = centerMaxX + 1; x < tilemap.width; x++) {
    tilemap.layers[1]!.data[roadMinY * tilemap.width + x] = TileType.BRIMSTONE
    tilemap.layers[1]!.data[roadMaxY * tilemap.width + x] = TileType.BRIMSTONE
  }

  tilemap.tileVersion++
}

/**
 * Clear all brimstone cracks from the floor layer, restoring to FLOOR.
 */
function clearBrimstoneCracks(tilemap: Tilemap): void {
  const floorLayer = tilemap.layers[1]
  if (!floorLayer) return
  for (let i = 0; i < floorLayer.data.length; i++) {
    if (floorLayer.data[i] === TileType.BRIMSTONE) {
      floorLayer.data[i] = TileType.FLOOR
    }
  }
  tilemap.tileVersion++
}

// ============================================================================
// Spawn
// ============================================================================

function spawn(world: GameWorld, x: number, y: number): number {
  const eid = addEntity(world)
  addEnemyComponents(world, eid)
  addComponent(world, BossPhase, eid)
  setEnemyDefaults(world, eid, x, y)

  Enemy.type[eid] = EnemyType.OLD_SCRATCH
  Enemy.tier[eid] = EnemyTier.THREAT

  Speed.current[eid] = P1_SPEED
  Speed.max[eid] = P1_SPEED
  Collider.radius[eid] = RADIUS
  Health.current[eid] = HP
  Health.max[eid] = HP

  Detection.aggroRange[eid] = AGGRO_RANGE
  Detection.attackRange[eid] = ATTACK_RANGE
  Steering.preferredRange[eid] = 120
  Steering.separationRadius[eid] = 32

  BossPhase.phase[eid] = 1

  AttackConfig.cooldown[eid] = P1_COOLDOWN
  AttackConfig.cooldownRemaining[eid] = 0
  AttackConfig.telegraphDuration[eid] = 0.4
  AttackConfig.recoveryDuration[eid] = 0.5
  AttackConfig.damage[eid] = 0
  AttackConfig.projectileCount[eid] = 0
  AttackConfig.projectileSpeed[eid] = 0
  AttackConfig.spreadAngle[eid] = 0

  const state = createOldScratchState()
  world.bossState.set(eid, state)

  // Register Infernal Counter hook
  const hookId = COUNTER_HOOK_ID_PREFIX + eid
  world.hooks.register('onBulletHit', hookId, (w, bulletEid, targetEid, damage) => {
    return handleCounterHook(w, eid, bulletEid, targetEid, damage)
  })

  return eid
}

// ============================================================================
// Phase transitions
// ============================================================================

function enterPhase2(world: GameWorld, eid: number, state: OldScratchState): void {
  Health.iframes[eid] = TRANSITION_IFRAMES
  Speed.current[eid] = P2_SPEED
  Speed.max[eid] = P2_SPEED
  AttackConfig.cooldown[eid] = P2_COOLDOWN
  AttackConfig.cooldownRemaining[eid] = 0
  EnemyAI.state[eid] = AIState.TELEGRAPH
  EnemyAI.stateTimer[eid] = 0
  state.attackCycleIndex = 0
  state.ghostRiderCooldown = 0    // allow immediate first summon
  state.brimstoneLash = null

  // Arena changes
  const tilemap = world.tilemap
  if (tilemap) {
    shrinkRoads(tilemap, P2_ROAD_SHRINK_TILES)
    placeBrimstoneCracks(tilemap)
  }
}

function enterPhase3(world: GameWorld, eid: number, state: OldScratchState): void {
  Health.iframes[eid] = TRANSITION_IFRAMES

  // Mid-fight heal
  Health.current[eid] = P3_HEAL_HP

  Speed.current[eid] = P3_SPEED
  Speed.max[eid] = P3_SPEED
  AttackConfig.cooldownRemaining[eid] = 0
  EnemyAI.state[eid] = AIState.TELEGRAPH
  EnemyAI.stateTimer[eid] = 0

  // Further arena shrink
  const tilemap = world.tilemap
  if (tilemap) {
    shrinkRoads(tilemap, P3_ROAD_SHRINK_TILES)
  }

  // Hellfire Pillar spawning will be handled in Phase 5 (Sprint 19 Phase 5)
  // For now, just record lantern positions as pillar slots
}

function enterPhase4(world: GameWorld, eid: number, state: OldScratchState): void {
  Health.iframes[eid] = TRANSITION_IFRAMES
  Speed.current[eid] = P4_SPEED
  Speed.max[eid] = P4_SPEED
  EnemyAI.state[eid] = AIState.IDLE
  EnemyAI.stateTimer[eid] = 0

  state.drawRound = 1
  state.drawPhase = 'staredown'
  state.dustStormActive = false

  // Clear arena hazards
  const tilemap = world.tilemap
  if (tilemap) {
    clearBrimstoneCracks(tilemap)
  }
}

// ============================================================================
// Helpers: get cycle for character
// ============================================================================

function getCycleForCharacter(charId: string, phase: number): number[] {
  if (phase >= 2) {
    if (charId === 'undertaker') return UNDERTAKER_P2_CYCLE
    if (charId === 'prospector') return PROSPECTOR_P2_CYCLE
    return SHERIFF_P2_CYCLE
  }
  if (charId === 'undertaker') return UNDERTAKER_CYCLE
  if (charId === 'prospector') return PROSPECTOR_CYCLE
  return SHERIFF_CYCLE  // default
}

// ============================================================================
// Tick helpers — zone damage, charge movement, telegraph rendering
// ============================================================================

function tickCoffinNails(
  world: GameWorld, bossEid: number, state: OldScratchState,
  playerEid: number, dt: number,
): void {
  for (let i = state.coffinNails.length - 1; i >= 0; i--) {
    const nail = state.coffinNails[i]!
    if (!nail.active) {
      nail.delay -= dt
      if (nail.delay <= 0) {
        nail.active = true
        if (playerEid >= 0) {
          const dx = Position.x[playerEid]! - nail.x
          const dy = Position.y[playerEid]! - nail.y
          if (dx * dx + dy * dy <= COFFIN_NAIL_RADIUS * COFFIN_NAIL_RADIUS) {
            if (!nail.hitEntities.has(playerEid)) {
              nail.hitEntities.add(playerEid)
              applyDamage(world, playerEid, {
                amount: COFFIN_NAIL_DAMAGE,
                attackerEid: bossEid,
                setIframes: true,
              })
            }
          }
        }
      }
    } else {
      nail.duration -= dt
      if (playerEid >= 0) {
        const dx = Position.x[playerEid]! - nail.x
        const dy = Position.y[playerEid]! - nail.y
        if (dx * dx + dy * dy <= COFFIN_NAIL_RADIUS * COFFIN_NAIL_RADIUS) {
          applyDamage(world, playerEid, {
            amount: COFFIN_NAIL_DPS * dt,
            attackerEid: bossEid,
          })
        }
      }
      if (nail.duration <= 0) {
        state.coffinNails.splice(i, 1)
        continue
      }
    }
    world.bossTelegraphs.push({
      kind: 'circle',
      x: nail.x, y: nail.y,
      radius: COFFIN_NAIL_RADIUS,
      color: nail.active ? 0xff4400 : 0xaa4400,
      alpha: nail.active ? 0.35 : 0.2,
      progress: nail.active ? 1 : 1 - (nail.delay / COFFIN_NAIL_DELAY),
    })
  }
}

function tickFireTrails(
  world: GameWorld, bossEid: number, state: OldScratchState,
  playerEid: number, dt: number,
): void {
  for (let i = state.fireTrails.length - 1; i >= 0; i--) {
    const seg = state.fireTrails[i]!
    seg.timer -= dt
    if (seg.timer <= 0) {
      state.fireTrails.splice(i, 1)
      continue
    }
    if (playerEid >= 0) {
      const dx = Position.x[playerEid]! - seg.x
      const dy = Position.y[playerEid]! - seg.y
      if (dx * dx + dy * dy <= FIRE_TRAIL_RADIUS * FIRE_TRAIL_RADIUS) {
        applyDamage(world, playerEid, {
          amount: FIRE_TRAIL_DPS * dt,
          attackerEid: bossEid,
        })
      }
    }
    world.bossTelegraphs.push({
      kind: 'circle',
      x: seg.x, y: seg.y,
      radius: FIRE_TRAIL_RADIUS,
      color: 0xff6600,
      alpha: 0.25 * (seg.timer / FIRE_TRAIL_DURATION),
      progress: 1,
    })
  }
}

function tickBrimstoneLash(
  world: GameWorld, bossEid: number, state: OldScratchState,
  playerEid: number, dt: number,
): void {
  const lash = state.brimstoneLash
  if (!lash || !lash.active) return

  lash.timer -= dt

  if (lash.timer <= 0) {
    state.brimstoneLash = null
    return
  }

  // Damage player if within BRIMSTONE_LASH_WIDTH of the line segment
  if (playerEid >= 0) {
    const px = Position.x[playerEid]!
    const py = Position.y[playerEid]!
    const dist = pointToSegmentDist(px, py, lash.startX, lash.startY, lash.endX, lash.endY)
    if (dist <= BRIMSTONE_LASH_WIDTH) {
      applyDamage(world, playerEid, {
        amount: BRIMSTONE_LASH_DAMAGE * dt / BRIMSTONE_LASH_DURATION,
        attackerEid: bossEid,
      })
    }
  }

  // Push line telegraph while active
  world.bossTelegraphs.push({
    kind: 'line',
    x: lash.startX, y: lash.startY, radius: BRIMSTONE_LASH_WIDTH,
    endX: lash.endX, endY: lash.endY,
    color: 0xff4400, alpha: 0.4,
    progress: lash.timer / BRIMSTONE_LASH_DURATION,
  })
}

/** Distance from point (px,py) to line segment (ax,ay)-(bx,by) */
function pointToSegmentDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax
  const aby = by - ay
  const apx = px - ax
  const apy = py - ay
  const ab2 = abx * abx + aby * aby
  if (ab2 === 0) return Math.sqrt(apx * apx + apy * apy)
  let t = (apx * abx + apy * aby) / ab2
  if (t < 0) t = 0
  if (t > 1) t = 1
  const cx = ax + t * abx
  const cy = ay + t * aby
  const dx = px - cx
  const dy = py - cy
  return Math.sqrt(dx * dx + dy * dy)
}

/** Pick road endpoint closest to the given angle from (bx, by). Returns index or -1. */
function pickRoadByAngle(
  endpoints: readonly { x: number; y: number }[],
  bx: number, by: number, angle: number,
): number {
  let bestIdx = -1
  let bestDot = -Infinity
  for (let i = 0; i < endpoints.length; i++) {
    const dx = endpoints[i]!.x - bx
    const dy = endpoints[i]!.y - by
    const dot = dx * Math.cos(angle) + dy * Math.sin(angle)
    if (dot > bestDot) { bestDot = dot; bestIdx = i }
  }
  return bestIdx
}

function countAliveGhostRiders(world: GameWorld): number {
  let count = 0
  for (const eid of enemyQuery(world)) {
    if (Enemy.type[eid] === EnemyType.GHOST_RIDER && !hasComponent(world, Dead, eid)) count++
  }
  return count
}

function tickInfernalCharge(
  world: GameWorld, eid: number, state: OldScratchState,
  playerEid: number, dt: number,
): void {
  const dirX = state.chargeAimX
  const dirY = state.chargeAimY
  Position.x[eid] = Position.x[eid]! + dirX * INFERNAL_CHARGE_SPEED * dt
  Position.y[eid] = Position.y[eid]! + dirY * INFERNAL_CHARGE_SPEED * dt

  const traveledX = Position.x[eid]! - state.chargeStartX
  const traveledY = Position.y[eid]! - state.chargeStartY
  const totalDist = Math.sqrt(traveledX * traveledX + traveledY * traveledY)
  while (totalDist - state.lastTrailDist >= FIRE_TRAIL_SPACING) {
    state.lastTrailDist += FIRE_TRAIL_SPACING
    state.fireTrails.push({
      x: state.chargeStartX + dirX * state.lastTrailDist,
      y: state.chargeStartY + dirY * state.lastTrailDist,
      timer: FIRE_TRAIL_DURATION,
    })
  }

  if (playerEid >= 0) {
    const cdx = Position.x[playerEid]! - Position.x[eid]!
    const cdy = Position.y[playerEid]! - Position.y[eid]!
    const contactDist = RADIUS + PLAYER_RADIUS
    if (cdx * cdx + cdy * cdy <= contactDist * contactDist) {
      applyDamage(world, playerEid, {
        amount: INFERNAL_CHARGE_DAMAGE,
        attackerEid: eid,
        setIframes: true,
      })
    }
  }

  state.chargeTimer -= dt
  if (state.chargeTimer <= 0 || totalDist >= INFERNAL_CHARGE_DIST) {
    state.isCharging = false
    Velocity.x[eid] = 0
    Velocity.y[eid] = 0
    state.attackCycleIndex++
    transition(eid, AIState.RECOVERY)
  }
}

function pushAttackTelegraph(
  world: GameWorld, eid: number, state: OldScratchState,
  playerEid: number, stateTimer: number,
): void {
  const telegraphDur = AttackConfig.telegraphDuration[eid]!
  const progress = telegraphDur > 0 ? Math.min(1, stateTimer / telegraphDur) : 1
  const ex = Position.x[eid]!
  const ey = Position.y[eid]!

  switch (state.selectedAttack) {
    case P1Attack.DEAD_EYE_SHOT: {
      const endX = ex + Math.cos(state.aimAngle) * 350
      const endY = ey + Math.sin(state.aimAngle) * 350
      world.bossTelegraphs.push({
        kind: 'line', x: ex, y: ey, radius: 0,
        endX, endY, color: 0xff2222, alpha: 0.3, progress,
      })
      break
    }
    case P1Attack.SIDEWINDER: {
      const perpAngle = state.aimAngle + (Math.PI / 2) * state.sidewinderSign
      const endX = ex + Math.cos(perpAngle) * SIDEWINDER_DIST
      const endY = ey + Math.sin(perpAngle) * SIDEWINDER_DIST
      world.bossTelegraphs.push({
        kind: 'line', x: ex, y: ey, radius: 0,
        endX, endY, color: 0xffaa00, alpha: 0.25, progress,
      })
      break
    }
    case P1Attack.DEVILS_FAN: {
      world.bossTelegraphs.push({
        kind: 'arc', x: ex, y: ey,
        radius: DEVILS_FAN_RANGE,
        angle: state.aimAngle, arcHalf: DEVILS_FAN_SPREAD / 2,
        color: 0xff4400, alpha: 0.25, progress,
      })
      break
    }
    case P1Attack.BRIMSTONE_BLAST: {
      world.bossTelegraphs.push({
        kind: 'arc', x: ex, y: ey,
        radius: BRIMSTONE_BLAST_RANGE,
        angle: state.aimAngle, arcHalf: BRIMSTONE_BLAST_SPREAD / 2,
        color: 0xff6600, alpha: 0.25, progress,
      })
      break
    }
    case P1Attack.COFFIN_NAIL: {
      if (playerEid >= 0) {
        world.bossTelegraphs.push({
          kind: 'circle',
          x: Position.x[playerEid]!, y: Position.y[playerEid]!,
          radius: COFFIN_NAIL_RADIUS,
          color: 0x884400, alpha: 0.25, progress,
        })
      }
      break
    }
    case P1Attack.SHADOW_STEP: {
      if (playerEid >= 0) {
        const dx = Position.x[playerEid]! - ex
        const dy = Position.y[playerEid]! - ey
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > 0) {
          const endX = ex + (dx / dist) * SHADOW_STEP_DIST
          const endY = ey + (dy / dist) * SHADOW_STEP_DIST
          world.bossTelegraphs.push({
            kind: 'line', x: ex, y: ey, radius: 0,
            endX, endY, color: 0x660088, alpha: 0.25, progress,
          })
        }
      }
      break
    }
    case P1Attack.HELLPICK_SWING: {
      world.bossTelegraphs.push({
        kind: 'arc', x: ex, y: ey,
        radius: HELLPICK_REACH,
        angle: state.aimAngle, arcHalf: HELLPICK_ARC / 2,
        color: 0xcc6600, alpha: 0.3, progress,
      })
      break
    }
    case P1Attack.INFERNAL_CHARGE: {
      const endX = ex + Math.cos(state.aimAngle) * INFERNAL_CHARGE_DIST
      const endY = ey + Math.sin(state.aimAngle) * INFERNAL_CHARGE_DIST
      world.bossTelegraphs.push({
        kind: 'line', x: ex, y: ey, radius: 0,
        endX, endY, color: 0xff4400, alpha: 0.3, progress,
      })
      break
    }
    case P1Attack.DEVILS_DYNAMITE: {
      if (playerEid >= 0) {
        const predX = Position.x[playerEid]! + Velocity.x[playerEid]! * DEVILS_DYNAMITE_FUSE
        const predY = Position.y[playerEid]! + Velocity.y[playerEid]! * DEVILS_DYNAMITE_FUSE
        world.bossTelegraphs.push({
          kind: 'circle', x: predX, y: predY,
          radius: DEVILS_DYNAMITE_RADIUS,
          color: 0xff8800, alpha: 0.25, progress,
        })
      }
      break
    }
    case P2Attack.CROSSROADS_SALVO: {
      world.bossTelegraphs.push({
        kind: 'ring', x: ex, y: ey,
        radius: 200,
        color: 0xff4400, alpha: 0.25, progress,
      })
      break
    }
    case P2Attack.BRIMSTONE_LASH: {
      const endpoints = world.tilemap?.crossroadsLandmarks?.roadEndpoints
      if (endpoints && endpoints.length > 0) {
        const bestIdx = pickRoadByAngle(endpoints, ex, ey, state.aimAngle)
        const ep = endpoints[bestIdx]!
        world.bossTelegraphs.push({
          kind: 'line', x: ex, y: ey, radius: BRIMSTONE_LASH_WIDTH,
          endX: ep.x, endY: ep.y,
          color: 0xff6600, alpha: 0.3, progress,
        })
      }
      break
    }
    case P2Attack.SUMMON_GHOST_RIDER: {
      world.bossTelegraphs.push({
        kind: 'ring', x: ex, y: ey,
        radius: 60,
        color: 0x6688cc, alpha: 0.3, progress,
      })
      break
    }
  }
}

// ============================================================================
// Tick (phase transitions + counter window + P1 attack state)
// ============================================================================

function tick(world: GameWorld, eid: number, dt: number): void {
  const state = getState(world, eid)
  const currentPhase = BossPhase.phase[eid]!
  const hpRatio = Health.current[eid]! / Math.max(1, Health.max[eid]!)
  const desired = getDesiredPhase(hpRatio)

  // Process phase transitions (handles large HP drops)
  for (let p = currentPhase + 1; p <= desired; p++) {
    if (state.phaseTransitionDone.has(p)) continue
    state.phaseTransitionDone.add(p)

    if (p === 2) enterPhase2(world, eid, state)
    if (p === 3) enterPhase3(world, eid, state)
    if (p === 4) enterPhase4(world, eid, state)
  }

  // Phases are monotonically increasing — never regress. After P3 heal (250/400 = 62.5%),
  // getDesiredPhase would return 2, but phaseTransitionDone guards prevent re-entering P2/P3.
  const finalPhase = Math.max(BossPhase.phase[eid]!, desired)
  BossPhase.phase[eid] = finalPhase
  state.phase = finalPhase
  state.phaseTimer += dt

  // 3a. Cache character ID on first tick with a player present
  if (state.characterId === '') {
    const peid = findPlayerEid(world)
    if (peid >= 0) {
      state.characterId = getCharacterIdForPlayer(world, peid)
    }
  }

  // Tick counter cooldown
  if (state.counterCooldown > 0) {
    state.counterCooldown -= dt
  }

  // Tick per-move cooldowns
  if (state.sidewinderCooldown > 0) state.sidewinderCooldown -= dt
  if (state.shadowStepCooldown > 0) state.shadowStepCooldown -= dt
  if (state.ghostRiderCooldown > 0) state.ghostRiderCooldown -= dt

  const aiState = EnemyAI.state[eid]!
  const stateTimer = EnemyAI.stateTimer[eid]!

  // 3b. Attack selection at TELEGRAPH entry (stateTimer === 0, first tick)
  if (aiState === AIState.TELEGRAPH && stateTimer === 0 && state.phase < 4) {
    const cycle = getCycleForCharacter(state.characterId, state.phase)
    let idx = state.attackCycleIndex % cycle.length
    let selected = cycle[idx]!

    // Skip unavailable attacks (e.g. Ghost Rider on cooldown or capped)
    const maxSkips = cycle.length
    for (let skip = 0; skip < maxSkips; skip++) {
      if (selected !== P2Attack.SUMMON_GHOST_RIDER) break
      if (state.ghostRiderCooldown <= 0 && countAliveGhostRiders(world) < GHOST_RIDER_MAX_ALIVE) break
      state.attackCycleIndex++
      idx = state.attackCycleIndex % cycle.length
      selected = cycle[idx]!
    }

    state.selectedAttack = selected
    state.attackExecuted = false

    // Lock aim toward player
    const peid = findPlayerEid(world)
    if (peid >= 0) {
      const dx = Position.x[peid]! - Position.x[eid]!
      const dy = Position.y[peid]! - Position.y[eid]!
      state.aimAngle = Math.atan2(dy, dx)
    }

    // Set telegraph/recovery durations per attack
    switch (state.selectedAttack) {
      case P1Attack.DEAD_EYE_SHOT:
        AttackConfig.telegraphDuration[eid] = DEAD_EYE_TELEGRAPH
        AttackConfig.recoveryDuration[eid] = DEFAULT_P1_RECOVERY
        break
      case P1Attack.DEVILS_FAN:
        AttackConfig.telegraphDuration[eid] = DEVILS_FAN_TELEGRAPH
        AttackConfig.recoveryDuration[eid] = DEFAULT_P1_RECOVERY
        break
      case P1Attack.BLACK_IRON_RELOAD:
        // Vulnerability window: skip straight to RECOVERY (no telegraph/attack)
        AttackConfig.recoveryDuration[eid] = BLACK_IRON_RECOVERY
        state.attackCycleIndex++
        transition(eid, AIState.RECOVERY)
        return
      case P1Attack.SIDEWINDER:
        AttackConfig.telegraphDuration[eid] = SIDEWINDER_TELEGRAPH
        AttackConfig.recoveryDuration[eid] = DEFAULT_P1_RECOVERY
        state.sidewinderSign = world.rng.next() < 0.5 ? 1 : -1
        break
      case P1Attack.BRIMSTONE_BLAST:
        AttackConfig.telegraphDuration[eid] = BRIMSTONE_BLAST_TELEGRAPH
        AttackConfig.recoveryDuration[eid] = DEFAULT_P1_RECOVERY
        break
      case P1Attack.COFFIN_NAIL:
        AttackConfig.telegraphDuration[eid] = COFFIN_NAIL_TELEGRAPH
        AttackConfig.recoveryDuration[eid] = DEFAULT_P1_RECOVERY
        break
      case P1Attack.SHADOW_STEP:
        AttackConfig.telegraphDuration[eid] = SHADOW_STEP_TELEGRAPH
        AttackConfig.recoveryDuration[eid] = DEFAULT_P1_RECOVERY
        break
      case P1Attack.HELLPICK_SWING:
        AttackConfig.telegraphDuration[eid] = HELLPICK_TELEGRAPH
        AttackConfig.recoveryDuration[eid] = DEFAULT_P1_RECOVERY
        break
      case P1Attack.INFERNAL_CHARGE:
        AttackConfig.telegraphDuration[eid] = INFERNAL_CHARGE_TELEGRAPH
        AttackConfig.recoveryDuration[eid] = DEFAULT_P1_RECOVERY
        break
      case P1Attack.DEVILS_DYNAMITE:
        AttackConfig.telegraphDuration[eid] = DEVILS_DYNAMITE_TELEGRAPH
        AttackConfig.recoveryDuration[eid] = DEFAULT_P1_RECOVERY
        break
      // Phase 2 new attacks
      case P2Attack.CROSSROADS_SALVO:
        AttackConfig.telegraphDuration[eid] = CROSSROADS_SALVO_TELEGRAPH
        AttackConfig.recoveryDuration[eid] = DEFAULT_P1_RECOVERY
        break
      case P2Attack.BRIMSTONE_LASH:
        AttackConfig.telegraphDuration[eid] = BRIMSTONE_LASH_TELEGRAPH
        AttackConfig.recoveryDuration[eid] = DEFAULT_P1_RECOVERY
        break
      case P2Attack.SUMMON_GHOST_RIDER:
        AttackConfig.telegraphDuration[eid] = SUMMON_GHOST_RIDER_TELEGRAPH
        AttackConfig.recoveryDuration[eid] = DEFAULT_P1_RECOVERY
        break
    }

    // Phase 2: faster telegraphs for carried-over P1 attacks
    if (state.phase >= 2 && state.selectedAttack <= P1Attack.DEVILS_DYNAMITE) {
      AttackConfig.telegraphDuration[eid]! *= P2_TELEGRAPH_MUL
    }

    // Adjust attack range per character
    if (state.characterId === 'undertaker') {
      Detection.attackRange[eid] = 120
    } else if (state.characterId === 'prospector') {
      Detection.attackRange[eid] = HELLPICK_REACH + RADIUS
    } else {
      Detection.attackRange[eid] = ATTACK_RANGE
    }
  }

  const playerEid = findPlayerEid(world)

  tickCoffinNails(world, eid, state, playerEid, dt)
  tickFireTrails(world, eid, state, playerEid, dt)
  tickBrimstoneLash(world, eid, state, playerEid, dt)

  // Tick Infernal Charge movement
  if (state.isCharging) {
    tickInfernalCharge(world, eid, state, playerEid, dt)
    return  // skip normal AI while charging
  }

  // Telegraph rendering during TELEGRAPH state
  if (aiState === AIState.TELEGRAPH && state.phase < 4) {
    Velocity.x[eid] = 0
    Velocity.y[eid] = 0
    pushAttackTelegraph(world, eid, state, playerEid, stateTimer)
  }

  // Manage counter window
  const inAttackState = aiState === AIState.ATTACK || aiState === AIState.TELEGRAPH || aiState === AIState.RECOVERY
  if (!inAttackState && state.phase < 4) {
    if (!state.counterWindowActive && state.counterWindowTimer <= 0) {
      state.counterWindowActive = true
      state.counterWindowTimer = COUNTER_WINDOW_DURATION
    }
    if (state.counterWindowActive) {
      state.counterWindowTimer -= dt
      if (state.counterWindowTimer <= 0) {
        state.counterWindowActive = false
      }
    }
  } else {
    state.counterWindowActive = false
    state.counterWindowTimer = 0
  }

  // Push counter telegraph during active window
  if (state.counterWindowActive && state.counterCooldown <= 0) {
    world.bossTelegraphs.push({
      kind: 'ring',
      x: Position.x[eid]!,
      y: Position.y[eid]!,
      radius: RADIUS + 8,
      color: 0xff2222,
      alpha: 0.2,
      progress: 1 - (state.counterWindowTimer / COUNTER_WINDOW_DURATION),
    })
  }
}

// ============================================================================
// Infernal Counter (onBulletHit hook)
// ============================================================================

function handleCounterHook(
  world: GameWorld,
  bossEid: number,
  bulletEid: number,
  targetEid: number,
  damage: number,
): { damage: number; pierce: boolean } {
  // Only intercept bullets aimed at this boss
  if (targetEid !== bossEid) {
    return { damage, pierce: false }
  }

  const state = world.bossState.get(bossEid) as OldScratchState | undefined
  if (!state) return { damage, pierce: false }

  // Counter only triggers during active counter window with cooldown ready
  if (!state.counterWindowActive || state.counterCooldown > 0) {
    return { damage, pierce: false }
  }

  // Check bullet is a player bullet
  if (!hasComponent(world, Bullet, bulletEid)) {
    return { damage, pierce: false }
  }
  const bulletLayer = Collider.layer[bulletEid]
  if (bulletLayer !== CollisionLayer.PLAYER_BULLET) {
    return { damage, pierce: false }
  }

  // === Counter activates ===
  state.counterCooldown = COUNTER_INTERNAL_CD
  state.counterWindowActive = false
  state.counterWindowTimer = 0

  // Sidestep: reposition perpendicular to player direction
  const playerEid = findPlayerEid(world)
  if (playerEid >= 0) {
    const bx = Position.x[bossEid]!
    const by = Position.y[bossEid]!
    const px = Position.x[playerEid]!
    const py = Position.y[playerEid]!
    const dx = px - bx
    const dy = py - by
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist > 0) {
      // Perpendicular direction (pick side using RNG for unpredictability)
      const sign = world.rng.next() < 0.5 ? 1 : -1
      const perpX = (-dy / dist) * sign
      const perpY = (dx / dist) * sign
      Position.x[bossEid] = bx + perpX * COUNTER_SIDESTEP_DIST
      Position.y[bossEid] = by + perpY * COUNTER_SIDESTEP_DIST

      // Fire snap-shot at player
      const aimDx = px - Position.x[bossEid]!
      const aimDy = py - Position.y[bossEid]!
      const aimDist = Math.sqrt(aimDx * aimDx + aimDy * aimDy)
      if (aimDist > 0) {
        spawnBullet(world, {
          x: Position.x[bossEid]!,
          y: Position.y[bossEid]!,
          vx: (aimDx / aimDist) * COUNTER_SHOT_SPEED,
          vy: (aimDy / aimDist) * COUNTER_SHOT_SPEED,
          damage: COUNTER_SHOT_DAMAGE,
          range: ENEMY_BULLET_RANGE,
          ownerId: bossEid,
          layer: CollisionLayer.ENEMY_BULLET,
          spriteId: BulletSpriteId.FIRE_ANIM,
          size: ENEMY_BULLET_SIZE_THREAT,
        })
      }
    }
  }

  // Negate incoming damage
  return { damage: 0, pierce: false }
}

// ============================================================================
// Attack execution — Phase 1 & Phase 2
// ============================================================================

function attack(world: GameWorld, eid: number, _dt: number): void {
  const state = getState(world, eid)
  if (!state) return

  // P3-P4 handled in later sprints
  if (state.phase > 2) {
    transition(eid, AIState.RECOVERY)
    return
  }

  if (state.attackExecuted) {
    transition(eid, AIState.RECOVERY)
    return
  }
  state.attackExecuted = true

  // Dispatch P1 attacks (used in both Phase 1 and Phase 2)
  switch (state.selectedAttack) {
    case P1Attack.DEAD_EYE_SHOT:
      attackDeadEye(world, eid, state)
      break
    case P1Attack.DEVILS_FAN:
      attackDevilsFan(world, eid, state)
      break
    case P1Attack.SIDEWINDER:
      attackSidewinder(world, eid, state)
      break
    case P1Attack.BRIMSTONE_BLAST:
      attackBrimstoneBlast(world, eid, state)
      break
    case P1Attack.COFFIN_NAIL:
      attackCoffinNail(world, eid, state)
      break
    case P1Attack.SHADOW_STEP:
      attackShadowStep(world, eid, state)
      break
    case P1Attack.HELLPICK_SWING:
      attackHellpickSwing(world, eid, state)
      break
    case P1Attack.INFERNAL_CHARGE:
      attackInfernalCharge(world, eid, state)
      return  // multi-tick — don't transition to RECOVERY here
    case P1Attack.DEVILS_DYNAMITE:
      attackDevilsDynamite(world, eid, state)
      break
    // Phase 2 new attacks
    case P2Attack.CROSSROADS_SALVO:
      attackCrossroadsSalvo(world, eid, state)
      break
    case P2Attack.BRIMSTONE_LASH:
      attackBrimstoneLash(world, eid, state)
      break
    case P2Attack.SUMMON_GHOST_RIDER:
      attackSummonGhostRider(world, eid, state)
      break
    default:
      break
  }

  state.attackCycleIndex++
  transition(eid, AIState.RECOVERY)
}

// --- Individual attack implementations ---

function attackDeadEye(world: GameWorld, eid: number, state: OldScratchState): void {
  const ex = Position.x[eid]!
  const ey = Position.y[eid]!
  spawnBullet(world, {
    x: ex, y: ey,
    vx: Math.cos(state.aimAngle) * DEAD_EYE_SPEED,
    vy: Math.sin(state.aimAngle) * DEAD_EYE_SPEED,
    damage: DEAD_EYE_DAMAGE,
    range: ENEMY_BULLET_RANGE,
    ownerId: eid,
    layer: CollisionLayer.ENEMY_BULLET,
    spriteId: BulletSpriteId.FIRE_ANIM,
    size: ENEMY_BULLET_SIZE_THREAT,
  })
}

function attackDevilsFan(world: GameWorld, eid: number, state: OldScratchState): void {
  const ex = Position.x[eid]!
  const ey = Position.y[eid]!
  for (let i = 0; i < DEVILS_FAN_BULLETS; i++) {
    const offset = DEVILS_FAN_SPREAD * (i / (DEVILS_FAN_BULLETS - 1) - 0.5)
    const angle = state.aimAngle + offset
    spawnBullet(world, {
      x: ex, y: ey,
      vx: Math.cos(angle) * DEVILS_FAN_SPEED,
      vy: Math.sin(angle) * DEVILS_FAN_SPEED,
      damage: DEVILS_FAN_DAMAGE,
      range: DEVILS_FAN_RANGE,
      ownerId: eid,
      layer: CollisionLayer.ENEMY_BULLET,
      spriteId: BulletSpriteId.FIRE_ANIM,
      size: ENEMY_BULLET_SIZE_THREAT,
    })
  }
}

function attackSidewinder(world: GameWorld, eid: number, state: OldScratchState): void {
  if (state.sidewinderCooldown > 0) return  // cooldown active, skip

  const playerEid = findPlayerEid(world)
  if (playerEid < 0) return

  const bx = Position.x[eid]!
  const by = Position.y[eid]!
  const px = Position.x[playerEid]!
  const py = Position.y[playerEid]!
  const dx = px - bx
  const dy = py - by
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist <= 0) return

  // Perpendicular direction (side pre-picked at telegraph entry)
  const perpX = (-dy / dist) * state.sidewinderSign
  const perpY = (dx / dist) * state.sidewinderSign
  Position.x[eid] = bx + perpX * SIDEWINDER_DIST
  Position.y[eid] = by + perpY * SIDEWINDER_DIST

  state.sidewinderCooldown = SIDEWINDER_COOLDOWN

  // Phase 2: snap-shot at player after reposition
  if (state.phase >= 2) {
    fireSnapShot(world, eid, playerEid)
  }
}

function attackBrimstoneBlast(world: GameWorld, eid: number, state: OldScratchState): void {
  const ex = Position.x[eid]!
  const ey = Position.y[eid]!

  // Re-aim at player (shotgun tracks)
  const playerEid = findPlayerEid(world)
  let angle = state.aimAngle
  if (playerEid >= 0) {
    const dx = Position.x[playerEid]! - ex
    const dy = Position.y[playerEid]! - ey
    angle = Math.atan2(dy, dx)
  }

  for (let i = 0; i < BRIMSTONE_BLAST_PELLETS; i++) {
    const offset = BRIMSTONE_BLAST_SPREAD * (i / (BRIMSTONE_BLAST_PELLETS - 1) - 0.5)
    const a = angle + offset
    spawnBullet(world, {
      x: ex, y: ey,
      vx: Math.cos(a) * BRIMSTONE_BLAST_SPEED,
      vy: Math.sin(a) * BRIMSTONE_BLAST_SPEED,
      damage: BRIMSTONE_BLAST_DAMAGE,
      range: BRIMSTONE_BLAST_RANGE,
      ownerId: eid,
      layer: CollisionLayer.ENEMY_BULLET,
      spriteId: BulletSpriteId.FIRE_ANIM,
      size: ENEMY_BULLET_SIZE_THREAT,
    })
  }
}

function attackCoffinNail(world: GameWorld, _eid: number, state: OldScratchState): void {
  const playerEid = findPlayerEid(world)
  if (playerEid < 0) return

  state.coffinNails.push({
    x: Position.x[playerEid]!,
    y: Position.y[playerEid]!,
    delay: COFFIN_NAIL_DELAY,
    active: false,
    duration: COFFIN_NAIL_DURATION,
    hitEntities: new Set(),
  })
}

function attackShadowStep(world: GameWorld, eid: number, state: OldScratchState): void {
  if (state.shadowStepCooldown > 0) return  // cooldown active, skip

  const playerEid = findPlayerEid(world)
  if (playerEid < 0) return

  const bx = Position.x[eid]!
  const by = Position.y[eid]!
  const px = Position.x[playerEid]!
  const py = Position.y[playerEid]!
  const dx = px - bx
  const dy = py - by
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist <= 0) return

  const teleportDist = Math.min(SHADOW_STEP_DIST, dist)
  Position.x[eid] = bx + (dx / dist) * teleportDist
  Position.y[eid] = by + (dy / dist) * teleportDist

  state.shadowStepCooldown = SHADOW_STEP_COOLDOWN

  // Phase 2: snap-shot at player after teleport
  if (state.phase >= 2) {
    fireSnapShot(world, eid, playerEid)
  }
}

function attackHellpickSwing(world: GameWorld, eid: number, state: OldScratchState): void {
  const playerEid = findPlayerEid(world)
  if (playerEid < 0) return

  const ex = Position.x[eid]!
  const ey = Position.y[eid]!
  const px = Position.x[playerEid]!
  const py = Position.y[playerEid]!

  if (isInArc(ex, ey, state.aimAngle, HELLPICK_ARC / 2, HELLPICK_REACH, px, py)) {
    applyDamage(world, playerEid, {
      amount: HELLPICK_DAMAGE,
      attackerEid: eid,
      setIframes: true,
    })
    // Apply knockback away from boss
    const dx = px - ex
    const dy = py - ey
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist > 0) {
      addComponent(world, Knockback, playerEid)
      Knockback.vx[playerEid] = (dx / dist) * HELLPICK_KNOCKBACK_SPEED
      Knockback.vy[playerEid] = (dy / dist) * HELLPICK_KNOCKBACK_SPEED
      Knockback.duration[playerEid] = HELLPICK_KNOCKBACK_DURATION
    }
  }
}

function attackInfernalCharge(world: GameWorld, eid: number, state: OldScratchState): void {
  // Set up multi-tick charge; movement handled in tick()
  const ex = Position.x[eid]!
  const ey = Position.y[eid]!
  const cos = Math.cos(state.aimAngle)
  const sin = Math.sin(state.aimAngle)
  state.isCharging = true
  state.chargeTimer = INFERNAL_CHARGE_DIST / INFERNAL_CHARGE_SPEED
  state.chargeAimX = cos
  state.chargeAimY = sin
  state.chargeStartX = ex
  state.chargeStartY = ey
  state.lastTrailDist = 0
  state.attackExecuted = true
}

function attackDevilsDynamite(world: GameWorld, eid: number, _state: OldScratchState): void {
  const playerEid = findPlayerEid(world)
  if (playerEid < 0) return

  const ex = Position.x[eid]!
  const ey = Position.y[eid]!

  // Predicted position: player pos + velocity * fuse time
  const predX = Position.x[playerEid]! + Velocity.x[playerEid]! * DEVILS_DYNAMITE_FUSE
  const predY = Position.y[playerEid]! + Velocity.y[playerEid]! * DEVILS_DYNAMITE_FUSE

  world.dynamites.push({
    x: predX, y: predY,
    startX: ex, startY: ey,
    fuseRemaining: DEVILS_DYNAMITE_FUSE,
    maxFuse: DEVILS_DYNAMITE_FUSE,
    damage: DEVILS_DYNAMITE_DAMAGE,
    radius: DEVILS_DYNAMITE_RADIUS,
    knockback: DEVILS_DYNAMITE_KNOCKBACK,
    ownerId: eid,
  })
}

// --- Phase 2 snap-shot helper ---

function fireSnapShot(world: GameWorld, eid: number, playerEid: number): void {
  if (playerEid < 0) return
  const dx = Position.x[playerEid]! - Position.x[eid]!
  const dy = Position.y[playerEid]! - Position.y[eid]!
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist <= 0) return

  spawnBullet(world, {
    x: Position.x[eid]!, y: Position.y[eid]!,
    vx: (dx / dist) * SNAP_SHOT_SPEED,
    vy: (dy / dist) * SNAP_SHOT_SPEED,
    damage: SNAP_SHOT_DAMAGE,
    range: ENEMY_BULLET_RANGE,
    ownerId: eid,
    layer: CollisionLayer.ENEMY_BULLET,
    spriteId: BulletSpriteId.FIRE_ANIM,
    size: ENEMY_BULLET_SIZE_THREAT,
  })
}

// --- Phase 2 new attack implementations ---

function attackCrossroadsSalvo(world: GameWorld, eid: number, _state: OldScratchState): void {
  const ex = Position.x[eid]!
  const ey = Position.y[eid]!
  for (let i = 0; i < CROSSROADS_SALVO_BULLETS; i++) {
    const angle = (2 * Math.PI * i) / CROSSROADS_SALVO_BULLETS
    spawnBullet(world, {
      x: ex, y: ey,
      vx: Math.cos(angle) * CROSSROADS_SALVO_SPEED,
      vy: Math.sin(angle) * CROSSROADS_SALVO_SPEED,
      damage: CROSSROADS_SALVO_DAMAGE,
      range: ENEMY_BULLET_RANGE,
      ownerId: eid,
      layer: CollisionLayer.ENEMY_BULLET,
      spriteId: BulletSpriteId.FIRE_ANIM,
      size: ENEMY_BULLET_SIZE_THREAT,
    })
  }
}

function attackBrimstoneLash(world: GameWorld, eid: number, state: OldScratchState): void {
  const ex = Position.x[eid]!
  const ey = Position.y[eid]!

  const endpoints = world.tilemap?.crossroadsLandmarks?.roadEndpoints
  if (!endpoints || endpoints.length === 0) return

  const bestIdx = pickRoadByAngle(endpoints, ex, ey, state.aimAngle)
  const ep = endpoints[bestIdx]!

  state.brimstoneLash = {
    active: true,
    roadIndex: bestIdx,
    timer: BRIMSTONE_LASH_DURATION,
    startX: ex, startY: ey,
    endX: ep.x, endY: ep.y,
  }
}

function attackSummonGhostRider(world: GameWorld, eid: number, state: OldScratchState): void {
  // Check cooldown and cap
  if (state.ghostRiderCooldown > 0) return
  if (countAliveGhostRiders(world) >= GHOST_RIDER_MAX_ALIVE) return

  const endpoints = world.tilemap?.crossroadsLandmarks?.roadEndpoints
  if (!endpoints || endpoints.length === 0) return

  // Pick random road endpoint
  const idx = Math.floor(world.rng.next() * endpoints.length)
  const ep = endpoints[idx]!

  spawnGhostRider(world, ep.x, ep.y)
  state.ghostRiderCooldown = GHOST_RIDER_SUMMON_COOLDOWN
}

// ============================================================================
// Module registration
// ============================================================================

const oldScratchModule: BossModule = {
  type: EnemyType.OLD_SCRATCH,
  displayName: 'OLD SCRATCH',
  color: 0x991111,
  radius: RADIUS,
  dropChance: DROP_CHANCE,
  spawn,
  tick,
  attack,
}

registerBoss(oldScratchModule)

// ============================================================================
// Test-facing constant exports
// ============================================================================

export const OLD_SCRATCH_HP = HP
export const OLD_SCRATCH_RADIUS = RADIUS
export const OLD_SCRATCH_P1_SPEED = P1_SPEED
export const OLD_SCRATCH_P2_SPEED = P2_SPEED
export const OLD_SCRATCH_P3_SPEED = P3_SPEED
export const OLD_SCRATCH_P4_SPEED = P4_SPEED
export const OLD_SCRATCH_P1_COOLDOWN = P1_COOLDOWN
export const OLD_SCRATCH_P2_COOLDOWN = P2_COOLDOWN
export const OLD_SCRATCH_TRANSITION_IFRAMES = TRANSITION_IFRAMES
export const OLD_SCRATCH_P3_HEAL_HP = P3_HEAL_HP
export const OLD_SCRATCH_P2_THRESHOLD = P2_THRESHOLD
export const OLD_SCRATCH_P3_THRESHOLD = P3_THRESHOLD
export const OLD_SCRATCH_P4_THRESHOLD = P4_THRESHOLD
export const OLD_SCRATCH_COUNTER_WINDOW_DURATION = COUNTER_WINDOW_DURATION
export const OLD_SCRATCH_COUNTER_INTERNAL_CD = COUNTER_INTERNAL_CD
export const OLD_SCRATCH_COUNTER_SIDESTEP_DIST = COUNTER_SIDESTEP_DIST
export const OLD_SCRATCH_COUNTER_SHOT_DAMAGE = COUNTER_SHOT_DAMAGE
export const OLD_SCRATCH_COUNTER_SHOT_SPEED = COUNTER_SHOT_SPEED
export const OLD_SCRATCH_P2_ROAD_SHRINK_TILES = P2_ROAD_SHRINK_TILES
export const OLD_SCRATCH_P3_ROAD_SHRINK_TILES = P3_ROAD_SHRINK_TILES

// Phase 1 attack constants
export const OLD_SCRATCH_DEAD_EYE_DAMAGE = DEAD_EYE_DAMAGE
export const OLD_SCRATCH_DEAD_EYE_SPEED = DEAD_EYE_SPEED
export const OLD_SCRATCH_DEAD_EYE_TELEGRAPH = DEAD_EYE_TELEGRAPH
export const OLD_SCRATCH_DEVILS_FAN_DAMAGE = DEVILS_FAN_DAMAGE
export const OLD_SCRATCH_DEVILS_FAN_BULLETS = DEVILS_FAN_BULLETS
export const OLD_SCRATCH_DEVILS_FAN_SPEED = DEVILS_FAN_SPEED
export const OLD_SCRATCH_DEVILS_FAN_SPREAD = DEVILS_FAN_SPREAD
export const OLD_SCRATCH_BLACK_IRON_RECOVERY = BLACK_IRON_RECOVERY
export const OLD_SCRATCH_SIDEWINDER_DIST = SIDEWINDER_DIST
export const OLD_SCRATCH_SIDEWINDER_COOLDOWN = SIDEWINDER_COOLDOWN
export const OLD_SCRATCH_BRIMSTONE_BLAST_DAMAGE = BRIMSTONE_BLAST_DAMAGE
export const OLD_SCRATCH_BRIMSTONE_BLAST_PELLETS = BRIMSTONE_BLAST_PELLETS
export const OLD_SCRATCH_BRIMSTONE_BLAST_SPEED = BRIMSTONE_BLAST_SPEED
export const OLD_SCRATCH_COFFIN_NAIL_DAMAGE = COFFIN_NAIL_DAMAGE
export const OLD_SCRATCH_COFFIN_NAIL_DPS = COFFIN_NAIL_DPS
export const OLD_SCRATCH_COFFIN_NAIL_RADIUS = COFFIN_NAIL_RADIUS
export const OLD_SCRATCH_COFFIN_NAIL_DELAY = COFFIN_NAIL_DELAY
export const OLD_SCRATCH_COFFIN_NAIL_DURATION = COFFIN_NAIL_DURATION
export const OLD_SCRATCH_SHADOW_STEP_DIST = SHADOW_STEP_DIST
export const OLD_SCRATCH_SHADOW_STEP_COOLDOWN = SHADOW_STEP_COOLDOWN
export const OLD_SCRATCH_HELLPICK_DAMAGE = HELLPICK_DAMAGE
export const OLD_SCRATCH_HELLPICK_ARC = HELLPICK_ARC
export const OLD_SCRATCH_HELLPICK_REACH = HELLPICK_REACH
export const OLD_SCRATCH_INFERNAL_CHARGE_DAMAGE = INFERNAL_CHARGE_DAMAGE
export const OLD_SCRATCH_INFERNAL_CHARGE_SPEED = INFERNAL_CHARGE_SPEED
export const OLD_SCRATCH_FIRE_TRAIL_DPS = FIRE_TRAIL_DPS
export const OLD_SCRATCH_FIRE_TRAIL_DURATION = FIRE_TRAIL_DURATION
export const OLD_SCRATCH_DEVILS_DYNAMITE_DAMAGE = DEVILS_DYNAMITE_DAMAGE
export const OLD_SCRATCH_DEVILS_DYNAMITE_RADIUS = DEVILS_DYNAMITE_RADIUS
export const OLD_SCRATCH_DEVILS_DYNAMITE_FUSE = DEVILS_DYNAMITE_FUSE

// Phase 2 attack constants
export const OLD_SCRATCH_P2_TELEGRAPH_MUL = P2_TELEGRAPH_MUL
export const OLD_SCRATCH_P2_COOLDOWN_MUL = P2_COOLDOWN_MUL
export const OLD_SCRATCH_SNAP_SHOT_DAMAGE = SNAP_SHOT_DAMAGE
export const OLD_SCRATCH_SNAP_SHOT_SPEED = SNAP_SHOT_SPEED
export const OLD_SCRATCH_CROSSROADS_SALVO_TELEGRAPH = CROSSROADS_SALVO_TELEGRAPH
export const OLD_SCRATCH_CROSSROADS_SALVO_BULLETS = CROSSROADS_SALVO_BULLETS
export const OLD_SCRATCH_CROSSROADS_SALVO_DAMAGE = CROSSROADS_SALVO_DAMAGE
export const OLD_SCRATCH_CROSSROADS_SALVO_SPEED = CROSSROADS_SALVO_SPEED
export const OLD_SCRATCH_BRIMSTONE_LASH_TELEGRAPH = BRIMSTONE_LASH_TELEGRAPH
export const OLD_SCRATCH_BRIMSTONE_LASH_DAMAGE = BRIMSTONE_LASH_DAMAGE
export const OLD_SCRATCH_BRIMSTONE_LASH_DURATION = BRIMSTONE_LASH_DURATION
export const OLD_SCRATCH_BRIMSTONE_LASH_WIDTH = BRIMSTONE_LASH_WIDTH
export const OLD_SCRATCH_SUMMON_GHOST_RIDER_TELEGRAPH = SUMMON_GHOST_RIDER_TELEGRAPH
export const OLD_SCRATCH_GHOST_RIDER_MAX_ALIVE = GHOST_RIDER_MAX_ALIVE
export const OLD_SCRATCH_GHOST_RIDER_SUMMON_COOLDOWN = GHOST_RIDER_SUMMON_COOLDOWN
