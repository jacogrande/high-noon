/**
 * ECS World Management
 *
 * The world holds all entity state and is the main interface for the ECS.
 */

import { createWorld as bitCreateWorld, defineQuery, type IWorld } from 'bitecs'
import type { Tilemap } from './tilemap'
import { getArenaCenterFromTilemap } from './tilemap'
import type { SpatialHash } from './SpatialHash'
import type { StageEncounter } from './content/waves'
import { getBoss } from './content/bosses'
import { type NarrativeState } from './content/narrative'
import type { InputState } from '../net/input'
import { SeededRng } from '../math/rng'
import { type UpgradeState, initUpgradeState } from './upgrade'
import { SHERIFF, type CharacterDef, type CharacterId } from './content/characters'
import { HookRegistry } from './hooks'
import type { CampVisitorState } from './systems/campVisitor'
import {
  cloneRunStages,
  createRunNarrativeSetup,
  selectBossFromEncounterPool,
} from './runLifecycle'
import { Player, Position, Velocity } from './components'

export type ObjectiveType = 'protect' | 'intercept' | 'duel'

/**
 * Runtime state for a stage objective (protect or intercept)
 */
export interface ObjectiveState {
  type: ObjectiveType
  status: 'active' | 'success' | 'soft_failure'
  description: string
  /** For protect: protected entity EIDs. For intercept: destination marker EID. */
  targetEids: number[]
  /** Intercept-only: how many runners have reached the destination */
  escapedCount: number
  /** Intercept-only: max escapes before soft failure */
  escapeThreshold: number
  /** Spawn timer accumulator (seconds since last objective spawn) */
  spawnTimer: number
  /** How many objective enemies have been spawned total */
  totalSpawned: number
  /** Max total to spawn (intercept totalRunners, protect unlimited=Infinity) */
  maxSpawns: number
  /** Spawn interval in seconds */
  spawnInterval: number
  /** Max alive at once (protect only) */
  maxAlive: number
  /** Runner speed (intercept only) */
  runnerSpeed: number
  /** Runner HP (intercept only) */
  runnerHP: number
  /** Duel-only: ring center X */
  ringCenterX: number
  /** Duel-only: ring center Y */
  ringCenterY: number
  /** Duel-only: ring boundary radius */
  ringRadius: number
  /** Duel-only: the challenger entity ID */
  duelistEid: number
  /** Duel-only: time player has been outside ring */
  forfeitTimer: number
  /** Duel-only: grace seconds before forfeit */
  forfeitGrace: number
}

const playerQuery = defineQuery([Player, Position])

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
  startX: number
  startY: number
  fuseRemaining: number
  maxFuse: number
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
  /** Pre-generated tilemap for the next stage (built on camp entry to avoid frame hitch) */
  pendingTilemap: Tilemap | null
  /** Whether NPCs have been spawned for the current stage */
  npcsSpawned: boolean
  /** IDs of visitors seen in previous camp phases (for deprioritization) */
  previousVisitorIds: number[]
  /** Index of last greeting shown (for dedup across consecutive visits) */
  lastGreetingIndex: number
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
  /** EIDs of threat entities spawned for the active wave (used for wave-clear accounting) */
  activeWaveThreatEids: Set<number>
}

/**
 * Info about a connected player in the registry
 */
export interface PlayerInfo {
  eid: number
  slot: number
}

/**
 * Last damage attribution metadata per entity.
 */
export interface DamageAttribution {
  /** Most recent player responsible for damage, if any */
  ownerPlayerEid: number | null
  /** Whether the most recent damaging hit was melee */
  wasMelee: boolean
}

export interface PendingGoldReward {
  enemyType: number
  killerPlayerEid: number | null
  wasMelee: boolean
}

export interface SalesmanState {
  x: number
  y: number
  stageIndex: number
  camp: boolean
  active: boolean
}

export interface StashState {
  id: number
  x: number
  y: number
  stageIndex: number
  opened: boolean
}

export interface InteractionFeedback {
  text: string
  description?: string
  timeLeft: number
}

export interface PendingStashReward {
  playerEid: number
  stageIndex: number
  stashId: number
}

export interface ItemPickupState {
  id: number
  itemId: number
  x: number
  y: number
  lifetime: number
  collected: boolean
}

export interface RewindPlayerState {
  x: number
  y: number
}

export interface RewindEnemyState {
  x: number
  y: number
  radius: number
  alive: boolean
}

export type PlayerFireMode = 'projectile' | 'hitscan'

export interface PendingShotResult {
  shooterEid: number
  shootSeq: number
  tick: number
  hit: boolean
  hitX: number
  hitY: number
  targetEid: number
  damageApplied: number
}

/**
 * Generic trap zone placed by bosses or characters.
 * Type-discriminated: each `kind` carries its own relevant fields.
 */
export interface TrapZone {
  kind: 'bearTrap' | 'caltrop' | 'tripwire'
  x: number
  y: number
  /** Trigger/effect radius */
  radius: number
  damage: number
  /** Lifetime remaining (caltrops) */
  duration?: number
  /** Speed multiplier (caltrops: 0.3 = 70% slow) */
  slowMultiplier?: number
  /** Bear trap freeze time */
  immobilizeDuration?: number
  /** Destructible trap HP (undefined = indestructible) */
  hp?: number
  /** Boss or entity that placed it */
  ownerEid: number
  /** Tripwire endpoint X */
  x2?: number
  /** Tripwire endpoint Y */
  y2?: number
  /** Tripwire explosion radius */
  explosionRadius?: number
  /** Tripwire collision half-thickness (default: 6) */
  wireThickness?: number
}

/**
 * Per-tick trap detonation event for client VFX
 */
export interface TrapDetonation {
  kind: 'bearTrap' | 'tripwire'
  x: number
  y: number
  radius: number
}

/**
 * Ground crack zone left by boss Ground Pound attacks
 */
export interface GroundCrack {
  x: number
  y: number
  radius: number
}

/**
 * Generic boss telegraph shape descriptor.
 * Boss modules populate these each tick; client renderers read them.
 */
export interface BossTelegraph {
  kind: 'arc' | 'circle' | 'line' | 'ring'
  x: number
  y: number
  radius: number
  angle?: number       // aim direction (arcs)
  arcHalf?: number     // half-width of arc
  endX?: number        // line endpoint
  endY?: number
  color: number
  alpha: number
  progress: number     // 0-1 for pulsing
}

/**
 * Expanding shockwave ring from boss Ground Pound
 */
export interface BossShockwave {
  x: number
  y: number
  currentRadius: number
  maxRadius: number
  speed: number
  ringWidth: number
  damage: number
  hitEntities: Set<number>
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
  /** Story metadata for the active run (null = default non-narrative behavior) */
  narrative: NarrativeState | null
  /** Narrative line shown in camp (null when no line is selected) */
  campNarrativeLine: string | null
  /** Run-complete resolution text derived from outcomes */
  resolutionText: string | null
  /** Run intro title shown by the crawl overlay */
  runIntroTitle: string | null
  /** Run intro crawl text */
  runIntroText: string | null
  /** Monotonic sequence incremented each time a new run starts */
  runIntroSequence: number
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
  /** Owner lookup for virtual hitscan shot ids used by onBulletHit hooks. */
  hitscanVirtualBulletOwners: Map<number, number>
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
  /** Player firearm resolution mode. */
  playerFireMode: PlayerFireMode
  /** Per-tick authoritative shot outcomes generated by weaponSystem. */
  pendingShotResults: PendingShotResult[]
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
  /** Total enemies killed this run */
  killCount: number
  /** Shared shovel inventory for stash interactions */
  shovelCount: number
  /** Set to true when last kill was via melee (for Gold Rush 2x) */
  lastKillWasMelee: boolean
  /** Last authoritative damage attribution keyed by target eid */
  lastDamageByEntity: Map<number, DamageAttribution>
  /** Enemy kill rewards queued by healthSystem for goldRewardSystem */
  pendingGoldRewards: PendingGoldReward[]
  /** Stash rewards queued by interactionSystem for stashRewardSystem */
  pendingStashRewards: PendingStashReward[]
  /** Active shovel salesman (camp/stage) */
  salesman: SalesmanState | null
  /** Active stage stash states */
  stashes: StashState[]
  /** Internal key for active interactable layout generation */
  interactionLayoutKey: string
  /** Per-player hold-progress for interact confirmations */
  interactionHoldTicksByPlayer: Map<number, number>
  /** Per-player active interaction target key */
  interactionTargetByPlayer: Map<number, string>
  /** Per-player latest fresh network input seq observed by interaction system */
  interactionLastInputSeqByPlayer: Map<number, number>
  /** Per-player contextual interaction prompt text */
  interactionPromptByPlayer: Map<number, string>
  /** Per-player transient interaction feedback text + ttl */
  interactionFeedbackByPlayer: Map<number, InteractionFeedback>
  /** Set to true when Tremor ground slam fires this tick */
  tremorThisTick: boolean
  /** Rockslide shockwaves from roll */
  rockslideShockwaves: RockslideShockwave[]
  /** Per-entity floor speed multiplier (e.g., mud/bramble). Reset each tick by hazardTileSystem. */
  floorSpeedMul: Map<number, number>
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
  /** Enables server-side lag-compensated shot rewind in shared systems */
  lagCompEnabled: boolean
  /** Max rewind distance in ticks for lag compensation */
  lagCompMaxRewindTicks: number
  /** Per-player shot command tick for current simulation step */
  lagCompShotTickByPlayer: Map<number, number>
  /** Per-bullet originating shot tick for early historical hit checks */
  lagCompBulletShotTick: Map<number, number>
  /** Per-bullet authoritative server spawn tick (for first-tick historical checks) */
  lagCompBulletSpawnTick: Map<number, number>
  /** Per-bullet first-tick rewind sweep start point (lag-comp catch-up segment) */
  lagCompBulletSweepStart: Map<number, { x: number; y: number }>
  /** Radius padding applied only during historical lag-comp overlap checks */
  lagCompHistoricalRadiusPadding: number
  /** Camp visitor state (non-null during camp phase) */
  campVisitor: CampVisitorState | null
  /** Item pickups on the ground */
  itemPickups: ItemPickupState[]
  /** ID counter for item pickups */
  nextItemPickupId: number
  /** Active discovery NPC entity IDs (for cleanup between stages) */
  npcEntities: Set<number>
  /** Current stage objective state (null = no side objective) */
  objective: ObjectiveState | null
  /** Per-boss typed state (boss eid → module-specific state object) */
  bossState: Map<number, unknown>
  /** Ground crack zones from boss Ground Pound attacks */
  groundCracks: GroundCrack[]
  /** Active expanding shockwave rings */
  bossShockwaves: BossShockwave[]
  /** Per-tick boss telegraph shapes (cleared each tick by bossPhaseSystem) */
  bossTelegraphs: BossTelegraph[]
  /** Active trap zones (bear traps, caltrops) from bosses */
  trapZones: TrapZone[]
  /** Per-tick trap detonation events for client VFX */
  trapDetonations: TrapDetonation[]
  /** Per-tick boss phase change events for client VFX */
  bossPhaseChanges: Array<{ eid: number; newPhase: number; x: number; y: number }>
  /** Resolve historical player position for a rewind tick */
  lagCompGetPlayerPosAtTick?: (eid: number, tick: number) => RewindPlayerState | null
  /** Resolve historical enemy state for a rewind tick */
  lagCompGetEnemyStateAtTick?: (eid: number, tick: number) => RewindEnemyState | null
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
    narrative: null,
    campNarrativeLine: null,
    resolutionText: null,
    runIntroTitle: null,
    runIntroText: null,
    runIntroSequence: 0,
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
    hitscanVirtualBulletOwners: new Map(),
    showdownKillThisTick: false,
    showdownActivatedThisTick: false,
    showdownExpiredThisTick: false,
    jumpStompThisTick: false,
    hooks: new HookRegistry(),
    playerInputs: new Map(),
    players: new Map(),
    playerUpgradeStates: new Map(),
    playerCharacters: new Map(),
    playerFireMode: 'projectile',
    pendingShotResults: [],
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
    killCount: 0,
    shovelCount: 0,
    lastKillWasMelee: false,
    lastDamageByEntity: new Map(),
    pendingGoldRewards: [],
    pendingStashRewards: [],
    salesman: null,
    stashes: [],
    interactionLayoutKey: '',
    interactionHoldTicksByPlayer: new Map(),
    interactionTargetByPlayer: new Map(),
    interactionLastInputSeqByPlayer: new Map(),
    interactionPromptByPlayer: new Map(),
    interactionFeedbackByPlayer: new Map(),
    tremorThisTick: false,
    rockslideShockwaves: [],
    floorSpeedMul: new Map(),
    campComplete: false,
    simulationScope: 'all',
    localPlayerEid: -1,
    lagCompEnabled: false,
    lagCompMaxRewindTicks: 0,
    lagCompShotTickByPlayer: new Map(),
    lagCompBulletShotTick: new Map(),
    lagCompBulletSpawnTick: new Map(),
    lagCompBulletSweepStart: new Map(),
    lagCompHistoricalRadiusPadding: 0,
    campVisitor: null,
    itemPickups: [],
    nextItemPickupId: 1,
    npcEntities: new Set(),
    objective: null,
    bossState: new Map(),
    groundCracks: [],
    bossShockwaves: [],
    bossTelegraphs: [],
    trapZones: [],
    trapDetonations: [],
    bossPhaseChanges: [],
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
  world.narrative = null
  world.campNarrativeLine = null
  world.resolutionText = null
  world.runIntroTitle = null
  world.runIntroText = null
  world.runIntroSequence = 0
  world.stageCleared = false
  world.maxProjectiles = 80
  world.lastPlayerHitDir.clear()
  world.upgradeState = initUpgradeState(charDef)
  world.spawnsPaused = false
  world.bulletPierceHits.clear()
  world.rollDodgedBullets.clear()
  world.hookPierceCount.clear()
  world.hitscanVirtualBulletOwners.clear()
  world.showdownKillThisTick = false
  world.showdownActivatedThisTick = false
  world.showdownExpiredThisTick = false
  world.jumpStompThisTick = false
  world.hooks.clear()
  world.playerInputs.clear()
  world.players.clear()
  world.playerUpgradeStates.clear()
  world.playerCharacters.clear()
  world.playerFireMode = 'projectile'
  world.pendingShotResults.length = 0
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
  world.killCount = 0
  world.shovelCount = 0
  world.lastKillWasMelee = false
  world.lastDamageByEntity.clear()
  world.pendingGoldRewards = []
  world.pendingStashRewards = []
  world.salesman = null
  world.stashes = []
  world.interactionLayoutKey = ''
  world.interactionHoldTicksByPlayer.clear()
  world.interactionTargetByPlayer.clear()
  world.interactionLastInputSeqByPlayer.clear()
  world.interactionPromptByPlayer.clear()
  world.interactionFeedbackByPlayer.clear()
  world.tremorThisTick = false
  world.rockslideShockwaves = []
  world.floorSpeedMul.clear()
  world.campComplete = false
  world.simulationScope = 'all'
  world.localPlayerEid = -1
  world.lagCompEnabled = false
  world.lagCompMaxRewindTicks = 0
  world.lagCompShotTickByPlayer.clear()
  world.lagCompBulletShotTick.clear()
  world.lagCompBulletSpawnTick.clear()
  world.lagCompBulletSweepStart.clear()
  world.lagCompHistoricalRadiusPadding = 0
  delete world.lagCompGetPlayerPosAtTick
  delete world.lagCompGetEnemyStateAtTick
  world.campVisitor = null
  world.itemPickups = []
  world.nextItemPickupId = 1
  world.npcEntities.clear()
  world.objective = null
  world.bossState.clear()
  world.groundCracks = []
  world.bossShockwaves = []
  world.bossTelegraphs = []
  world.trapZones = []
  world.trapDetonations = []
  // Note: bitECS entities persist - call removeEntity for each if needed
}

/**
 * Initialize an encounter on the world
 */
export function setEncounter(world: GameWorld, encounter: StageEncounter): void {
  // If the encounter has a boss pool, pick a random boss and substitute it
  // into any wave threat entries that reference a pool member.
  let resolved = encounter
  if (encounter.bossPool && encounter.bossPool.length >= 1) {
    const pool = encounter.bossPool
    const poolSet = new Set(pool)
    const selected = selectBossFromEncounterPool({
      rng: world.rng,
      encounterPool: pool,
      narrative: world.narrative,
      currentStage: world.run?.currentStage ?? null,
    })
    resolved = {
      ...encounter,
      waves: encounter.waves.map(wave => {
        const hasPoolBoss = wave.threats.some(t => poolSet.has(t.type))
        if (!hasPoolBoss) return wave
        const mod = getBoss(selected)
        return {
          ...wave,
          threats: wave.threats.map(t =>
            poolSet.has(t.type) ? { ...t, type: selected, count: mod?.spawnCount ?? t.count } : t,
          ),
        }
      }),
    }
  }

  world.encounter = {
    definition: resolved,
    currentWave: 0,
    waveTimer: resolved.waves[0]!.spawnDelay,
    waveActive: false,
    completed: false,
    fodderBudgetRemaining: 0,
    fodderAliveCount: 0,
    threatAliveCount: 0,
    totalFodderSpawned: 0,
    fodderSpawnAccumulator: 0,
    threatSpawnedThisWave: 0,
    threatKilledThisWave: 0,
    activeWaveThreatEids: new Set(),
  }
  // Clear ground cracks and traps from previous encounter
  world.groundCracks = []
  world.bossShockwaves = []
  world.trapZones = []
  world.trapDetonations = []
}

/**
 * Start a multi-stage run with the given stage encounters.
 */
export function startRun(world: GameWorld, stages: StageEncounter[]): void {
  const runStages = cloneRunStages(stages)
  const narrativeSetup = createRunNarrativeSetup(world.rng)
  world.narrative = narrativeSetup.narrative
  world.campNarrativeLine = null
  world.resolutionText = null
  world.runIntroTitle = narrativeSetup.runIntroTitle
  world.runIntroText = narrativeSetup.runIntroText
  world.runIntroSequence += 1

  world.run = {
    currentStage: 0,
    totalStages: runStages.length,
    stages: runStages,
    completed: false,
    transition: 'none',
    transitionTimer: 0,
    pendingTilemap: null,
    npcsSpawned: false,
    previousVisitorIds: [],
    lastGreetingIndex: -1,
  }
  world.interactionLayoutKey = ''
  world.salesman = null
  world.stashes = []
  world.pendingStashRewards = []
  world.shovelCount = 0
  world.itemPickups = []
  world.interactionHoldTicksByPlayer.clear()
  world.interactionTargetByPlayer.clear()
  world.interactionLastInputSeqByPlayer.clear()
  world.interactionPromptByPlayer.clear()
  world.interactionFeedbackByPlayer.clear()
  setEncounter(world, runStages[0]!)
}

/**
 * Swap the active tilemap (e.g., between stages).
 * Resets spatial caches and teleports alive players to the new arena center.
 */
export function swapTilemap(world: GameWorld, tilemap: Tilemap): void {
  world.tilemap = tilemap
  world.flowField = null
  world.spatialHash = null
  world.floorSpeedMul.clear()
  world.interactionLayoutKey = ''
  world.salesman = null
  world.stashes = []
  world.itemPickups = []
  world.interactionHoldTicksByPlayer.clear()
  world.interactionTargetByPlayer.clear()
  world.interactionLastInputSeqByPlayer.clear()
  world.interactionPromptByPlayer.clear()
  world.interactionFeedbackByPlayer.clear()

  const center = getArenaCenterFromTilemap(tilemap)
  for (const eid of playerQuery(world)) {
    Position.x[eid] = center.x
    Position.y[eid] = center.y
    Position.prevX[eid] = center.x
    Position.prevY[eid] = center.y
    Velocity.x[eid] = 0
    Velocity.y[eid] = 0
  }
}
