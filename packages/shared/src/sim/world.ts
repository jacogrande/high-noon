/**
 * ECS World Management
 *
 * The world holds all entity state and is the main interface for the ECS.
 */

import { createWorld as bitCreateWorld, type IWorld } from 'bitecs'
import type { Tilemap } from './tilemap'
import type { SpatialHash } from './SpatialHash'
import type { StageEncounter } from './content/waves'
import type { InputState } from '../net/input'
import { SeededRng } from '../math/rng'
import { type UpgradeState, initUpgradeState } from './upgrade'
import { SHERIFF, type CharacterDef, type CharacterId } from './content/characters'
import { HookRegistry } from './hooks'

/**
 * Last Rites zone state (Undertaker ability)
 */
export interface LastRitesState {
  ownerEid: number
  active: boolean
  x: number
  y: number
  radius: number
  timeRemaining: number
  chainCount: number
  chainDamageBonus: number
  pendingPulses: Array<{ x: number; y: number; damage: number }>
  /** Consecrated Ground: fractional damage accumulator per enemy */
  consecratedAccum: Map<number, number>
}

/**
 * Dust cloud left behind by Grave Dust node
 */
export interface DustCloud {
  ownerEid: number
  x: number
  y: number
  radius: number
  duration: number
  slow: number
}

/**
 * Active dynamite state (Prospector ability)
 */
export interface DynamiteState {
  x: number
  y: number
  fuseRemaining: number
  damage: number
  radius: number
  knockback: number
  ownerId: number
}

/**
 * Gold nugget on the ground
 */
export interface GoldNugget {
  x: number
  y: number
  value: number
  lifetime: number
}

/**
 * Rockslide shockwave from roll
 */
export interface RockslideShockwave {
  ownerEid: number
  x: number
  y: number
  radius: number
  damage: number
  slow: number
  slowDuration: number
  processed: boolean
}

/**
 * Flow field for BFS pathfinding toward the player
 */
export interface FlowField {
  width: number
  height: number
  dirX: Float32Array
  dirY: Float32Array
  dist: Uint16Array
  /** Sorted alive-player tile positions key for cache invalidation */
  seedKey: string
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
 * Multi-stage run state
 */
export interface RunState {
  /** Current stage index (0-indexed) */
  currentStage: number
  totalStages: number
  stages: StageEncounter[]
  completed: boolean
  /** 'clearing' = delay while enemies despawn, 'camp' = rest between stages */
  transition: 'none' | 'clearing' | 'camp'
  /** Seconds remaining in the current transition */
  transitionTimer: number
}

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
 * Info about a connected player in the registry
 */
export interface PlayerInfo {
  eid: number
  slot: number
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
  /** Multi-stage run state (null = no run active) */
  run: RunState | null
  /** Per-tick flag: true on the tick a stage is cleared */
  stageCleared: boolean
  /** Maximum enemy projectiles before fodder stops firing */
  maxProjectiles: number
  /** Initial seed used to create the RNG (stored for replay reset) */
  initialSeed: number
  /** Seeded PRNG for deterministic simulation randomness */
  rng: SeededRng
  /** Per-player last hit direction (unit vector, for camera kick). Key = player entity ID */
  lastPlayerHitDir: Map<number, { x: number; y: number }>
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
  /** Set to true when a jump stomp lands this tick */
  jumpStompThisTick: boolean
  /** Hook registry for behavioral node effects */
  hooks: HookRegistry
  /** Per-entity input map (entity ID → InputState). Populated each tick. */
  playerInputs: Map<number, InputState>
  /** Player registry: session ID → PlayerInfo (for multiplayer) */
  players: Map<string, PlayerInfo>
  /** Per-player upgrade/progression state (player eid -> state) */
  playerUpgradeStates: Map<number, UpgradeState>
  /** Per-player character id (player eid -> character) */
  playerCharacters: Map<number, CharacterId>
  /** Which character is being played */
  characterId: CharacterId
  /** Active Last Rites zones keyed by owning player eid */
  lastRitesZones: Map<number, LastRitesState>
  /** Last Rites zone state (Undertaker only, null for Sheriff) */
  lastRites: LastRitesState | null
  /** Set to true when a Last Rites death pulse fires this tick */
  lastRitesPulseThisTick: boolean
  /** Set to true when Last Rites is activated this tick */
  lastRitesActivatedThisTick: boolean
  /** Set to true when Last Rites zone expires this tick */
  lastRitesExpiredThisTick: boolean
  /** Dust clouds from Grave Dust node */
  dustClouds: DustCloud[]
  /** Per-tick overkill tracking to prevent self-chaining */
  overkillProcessed: Set<number>
  /** Active dynamite entities */
  dynamites: DynamiteState[]
  /** Set to true when a dynamite detonates this tick */
  dynamiteDetonatedThisTick: boolean
  /** Detonation positions this tick (for client VFX) */
  dynamiteDetonations: Array<{ x: number; y: number; radius: number }>
  /** Gold nuggets on the ground */
  goldNuggets: GoldNugget[]
  /** Total gold collected this encounter */
  goldCollected: number
  /** Set to true when last kill was via melee (for Gold Rush 2x) */
  lastKillWasMelee: boolean
  /** Set to true when Tremor ground slam fires this tick */
  tremorThisTick: boolean
  /** Rockslide shockwaves from roll */
  rockslideShockwaves: RockslideShockwave[]
  /** Set to true by the client/UI when the player is ready to leave camp */
  campComplete: boolean
  /**
   * Simulation scope hint for systems.
   * - 'all': full-world simulation (server and canonical single-player)
   * - 'local-player': local-only prediction/replay path (client multiplayer)
   */
  simulationScope: 'all' | 'local-player'
  /** Local player entity used when simulationScope is 'local-player' */
  localPlayerEid: number
}

/**
 * Create a new game world
 */
export function createGameWorld(seed?: number, characterDef?: CharacterDef): GameWorld {
  const baseWorld = bitCreateWorld()
  const resolvedSeed = seed ?? Date.now()
  const charDef = characterDef ?? SHERIFF

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
    run: null,
    stageCleared: false,
    maxProjectiles: 80,
    initialSeed: resolvedSeed,
    rng: new SeededRng(resolvedSeed),
    lastPlayerHitDir: new Map(),
    upgradeState: initUpgradeState(charDef),
    spawnsPaused: false,
    bulletPierceHits: new Map(),
    rollDodgedBullets: new Map(),
    hookPierceCount: new Map(),
    showdownKillThisTick: false,
    showdownActivatedThisTick: false,
    showdownExpiredThisTick: false,
    jumpStompThisTick: false,
    hooks: new HookRegistry(),
    playerInputs: new Map(),
    players: new Map(),
    playerUpgradeStates: new Map(),
    playerCharacters: new Map(),
    characterId: charDef.id,
    lastRitesZones: new Map(),
    lastRites: null,
    lastRitesPulseThisTick: false,
    lastRitesActivatedThisTick: false,
    lastRitesExpiredThisTick: false,
    dustClouds: [],
    overkillProcessed: new Set(),
    dynamites: [],
    dynamiteDetonatedThisTick: false,
    dynamiteDetonations: [],
    goldNuggets: [],
    goldCollected: 0,
    lastKillWasMelee: false,
    tremorThisTick: false,
    rockslideShockwaves: [],
    campComplete: false,
    simulationScope: 'all',
    localPlayerEid: -1,
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
  const charDef = world.upgradeState.characterDef
  world.tick = 0
  world.time = 0
  world.tilemap = null
  world.bulletCollisionCallbacks.clear()
  world.flowField = null
  world.spatialHash = null
  world.debugSpawnWasDown = false
  world.encounter = null
  world.run = null
  world.stageCleared = false
  world.maxProjectiles = 80
  world.lastPlayerHitDir.clear()
  world.upgradeState = initUpgradeState(charDef)
  world.spawnsPaused = false
  world.bulletPierceHits.clear()
  world.rollDodgedBullets.clear()
  world.hookPierceCount.clear()
  world.showdownKillThisTick = false
  world.showdownActivatedThisTick = false
  world.showdownExpiredThisTick = false
  world.jumpStompThisTick = false
  world.hooks.clear()
  world.playerInputs.clear()
  world.players.clear()
  world.playerUpgradeStates.clear()
  world.playerCharacters.clear()
  world.rng.reset(world.initialSeed)
  world.lastRitesZones.clear()
  world.lastRites = null
  world.lastRitesPulseThisTick = false
  world.lastRitesActivatedThisTick = false
  world.lastRitesExpiredThisTick = false
  world.dustClouds = []
  world.overkillProcessed.clear()
  world.dynamites = []
  world.dynamiteDetonatedThisTick = false
  world.dynamiteDetonations = []
  world.goldNuggets = []
  world.goldCollected = 0
  world.lastKillWasMelee = false
  world.tremorThisTick = false
  world.rockslideShockwaves = []
  world.campComplete = false
  world.simulationScope = 'all'
  world.localPlayerEid = -1
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

/**
 * Start a multi-stage run with the given stage encounters.
 */
export function startRun(world: GameWorld, stages: StageEncounter[]): void {
  world.run = {
    currentStage: 0,
    totalStages: stages.length,
    stages,
    completed: false,
    transition: 'none',
    transitionTimer: 0,
  }
  setEncounter(world, stages[0]!)
}
