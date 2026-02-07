/**
 * ECS World Management
 *
 * The world holds all entity state and is the main interface for the ECS.
 */

import { createWorld as bitCreateWorld, type IWorld } from 'bitecs'
import type { Tilemap } from './tilemap'
import type { SpatialHash } from './SpatialHash'
import type { StageEncounter } from './content/waves'
import { SeededRng } from '../math/rng'
import { type UpgradeState, initUpgradeState } from './upgrade'
import { SHERIFF } from './content/characters'
import { HookRegistry } from './hooks'

/**
 * Flow field for BFS pathfinding toward the player
 */
export interface FlowField {
  width: number
  height: number
  dirX: Float32Array
  dirY: Float32Array
  dist: Uint16Array
  playerCellX: number
  playerCellY: number
}

/**
 * Collision types for callback
 */
export type CollisionType = 'wall' | 'entity'

/**
 * Collision callback info
 */
export interface CollisionInfo {
  /** Type of collision */
  type: CollisionType
  /** Entity that was hit (for entity collisions) */
  hitEntity?: number
  /** World position of collision */
  x: number
  y: number
}

/**
 * Callback function for bullet collision
 */
export type BulletCollisionCallback = (
  world: GameWorld,
  bulletEid: number,
  info: CollisionInfo
) => void

/**
 * Director-Wave encounter runtime state
 */
export interface EncounterState {
  definition: StageEncounter
  currentWave: number
  waveTimer: number
  waveActive: boolean
  completed: boolean
  fodderBudgetRemaining: number
  fodderAliveCount: number
  threatAliveCount: number
  totalFodderSpawned: number
  fodderSpawnAccumulator: number
  /** Number of threats spawned at activation of current wave */
  threatSpawnedThisWave: number
  /** Threat kills accumulated during current wave */
  threatKilledThisWave: number
  /** Threat alive count from previous tick (for delta-based death detection) */
  prevThreatAlive: number
}

/**
 * Game world containing all ECS state
 */
export interface GameWorld extends IWorld {
  /** Current simulation tick number */
  tick: number
  /** Accumulated time for this tick (for debugging) */
  time: number
  /** Current tilemap for collision detection (optional) */
  tilemap: Tilemap | null
  /** Collision callbacks for bullets (entity ID -> callback) */
  bulletCollisionCallbacks: Map<number, BulletCollisionCallback>
  /** Flow field for enemy pathfinding toward the player */
  flowField: FlowField | null
  /** Spatial hash for broadphase collision queries */
  spatialHash: SpatialHash | null
  /** Previous tick's debug spawn button state (for edge detection) */
  debugSpawnWasDown: boolean
  /** Current encounter state (null = no encounter running) */
  encounter: EncounterState | null
  /** Maximum enemy projectiles before fodder stops firing */
  maxProjectiles: number
  /** Seeded PRNG for deterministic simulation randomness */
  rng: SeededRng
  /** Direction of last hit on player (unit vector X, for camera kick) */
  lastPlayerHitDirX: number
  /** Direction of last hit on player (unit vector Y, for camera kick) */
  lastPlayerHitDirY: number
  /** Player upgrade/progression state */
  upgradeState: UpgradeState
  /** Pierce hit tracking: bulletEid → set of already-hit entity EIDs */
  bulletPierceHits: Map<number, Set<number>>
  /** Roll dodge tracking: rollingEid → set of already-dodged bullet EIDs */
  rollDodgedBullets: Map<number, Set<number>>
  /** Hook pierce count tracking: bulletEid → number of hook-requested pierces */
  hookPierceCount: Map<number, number>
  /** Debug: pause enemy spawning */
  spawnsPaused: boolean
  /** Set to true when a Showdown marked target is killed this tick */
  showdownKillThisTick: boolean
  /** Set to true when Showdown is activated this tick */
  showdownActivatedThisTick: boolean
  /** Set to true when Showdown duration expires naturally this tick */
  showdownExpiredThisTick: boolean
  /** Hook registry for behavioral node effects */
  hooks: HookRegistry
}

/**
 * Create a new game world
 */
export function createGameWorld(seed?: number): GameWorld {
  const baseWorld = bitCreateWorld()

  return {
    ...baseWorld,
    tick: 0,
    time: 0,
    tilemap: null,
    bulletCollisionCallbacks: new Map(),
    flowField: null,
    spatialHash: null,
    debugSpawnWasDown: false,
    encounter: null,
    maxProjectiles: 80,
    rng: new SeededRng(seed ?? Date.now()),
    lastPlayerHitDirX: 0,
    lastPlayerHitDirY: 0,
    upgradeState: initUpgradeState(SHERIFF),
    spawnsPaused: false,
    bulletPierceHits: new Map(),
    rollDodgedBullets: new Map(),
    hookPierceCount: new Map(),
    showdownKillThisTick: false,
    showdownActivatedThisTick: false,
    showdownExpiredThisTick: false,
    hooks: new HookRegistry(),
  }
}

/**
 * Set the tilemap for this world
 */
export function setWorldTilemap(world: GameWorld, tilemap: Tilemap): void {
  world.tilemap = tilemap
}

/**
 * Reset world state (for new game or replay)
 */
export function resetWorld(world: GameWorld): void {
  world.tick = 0
  world.time = 0
  world.tilemap = null
  world.bulletCollisionCallbacks.clear()
  world.flowField = null
  world.spatialHash = null
  world.debugSpawnWasDown = false
  world.encounter = null
  world.maxProjectiles = 80
  world.lastPlayerHitDirX = 0
  world.lastPlayerHitDirY = 0
  world.upgradeState = initUpgradeState(SHERIFF)
  world.spawnsPaused = false
  world.bulletPierceHits.clear()
  world.rollDodgedBullets.clear()
  world.hookPierceCount.clear()
  world.showdownKillThisTick = false
  world.showdownActivatedThisTick = false
  world.showdownExpiredThisTick = false
  world.hooks.clear()
  // Note: rng is intentionally NOT reset — caller should create a new world
  // or explicitly re-seed if needed for replay
  // Note: bitECS entities persist - call removeEntity for each if needed
}

/**
 * Initialize an encounter on the world
 */
export function setEncounter(world: GameWorld, encounter: StageEncounter): void {
  world.encounter = {
    definition: encounter,
    currentWave: 0,
    waveTimer: encounter.waves[0]!.spawnDelay,
    waveActive: false,
    completed: false,
    fodderBudgetRemaining: 0,
    fodderAliveCount: 0,
    threatAliveCount: 0,
    totalFodderSpawned: 0,
    fodderSpawnAccumulator: 0,
    threatSpawnedThisWave: 0,
    threatKilledThisWave: 0,
    prevThreatAlive: 0,
  }
}
