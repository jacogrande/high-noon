/**
 * Old Scratch Boss Module (Stage 4 Final Boss)
 *
 * The Devil at the Crossroads. A 4-phase boss fight:
 *  Phase 1 — The Wager: gentleman duel, character-adaptive attacks
 *  Phase 2 — The Cheat: arena shrinks, Ghost Rider adds, brimstone cracks
 *  Phase 3 — The Devil Unleashed: Hellfire Pillars, stationary true form
 *  Phase 4 — The Final Draw: quick-draw reaction duel
 *
 * This file implements the core spawn, state machine, phase transitions,
 * and Infernal Counter passive. Attack logic is added in later phases.
 */

import { addEntity, addComponent, hasComponent, defineQuery } from 'bitecs'
import type { GameWorld } from '../../world'
import type { BossModule } from './registry'
import { registerBoss } from './registry'
import {
  Position, Velocity, Speed, Collider, Health,
  Enemy, EnemyType, EnemyTier, BossPhase,
  EnemyAI, AIState, Detection, AttackConfig, Steering,
  Player, Bullet, Dead,
} from '../../components'
import { CollisionLayer, spawnBullet } from '../../prefabs'
import { addEnemyComponents, setEnemyDefaults } from './helpers'
import {
  TileType,
  collapseTileRange,
  type Tilemap,
  type TileTypeValue,
} from '../../tilemap'
import { ENEMY_BULLET_RANGE, ENEMY_BULLET_SIZE_THREAT, BulletSpriteId } from '../weapons'

const playerQuery = defineQuery([Player, Position, Health])

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

// Phase cooldowns
const P1_COOLDOWN = 1.0
const P2_COOLDOWN = 0.8

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
// Per-boss state (stored in world.bossState)
// ============================================================================

export interface OldScratchState {
  phase: number                    // 1-4
  phaseTimer: number               // time in current phase
  attackCycleIndex: number         // position in attack sequence
  attackCooldown: number           // time until next attack
  counterCooldown: number          // infernal counter internal CD
  counterWindowActive: boolean     // true during idle stance counter window
  counterWindowTimer: number       // time remaining in current counter window

  // Phase 2
  ghostRiderCooldown: number
  ghostRiderCount: number

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

    ghostRiderCooldown: 0,
    ghostRiderCount: 0,

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
// Tick (phase transitions + counter window management)
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

  // Tick counter cooldown
  if (state.counterCooldown > 0) {
    state.counterCooldown -= dt
  }

  // Manage counter window: opens once when entering idle stance, closes after 0.4s.
  // Does NOT reopen until the boss completes another attack cycle (leaves and re-enters idle).
  // While attack() is a stub, the boss stays in IDLE so the window reopens each time it expires
  // — this will self-correct once attacks cycle through TELEGRAPH→ATTACK→RECOVERY→IDLE.
  const aiState = EnemyAI.state[eid]!
  const inAttackState = aiState === AIState.ATTACK || aiState === AIState.TELEGRAPH || aiState === AIState.RECOVERY
  if (!inAttackState && state.phase < 4) {
    // Open counter window once per idle period
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
    // Reset timer so window reopens on next idle entry
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
// Attack execution (stub — attack logic added in Phase 3+)
// ============================================================================

function attack(_world: GameWorld, _eid: number, _dt: number): void {
  // Attack implementations are added in Sprint 19 Phases 3-6.
  // For now, the boss transitions through phases via tick() but has no attacks.
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
