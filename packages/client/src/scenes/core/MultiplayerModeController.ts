/**
 * Multiplayer mode controller.
 *
 * Runs client prediction, reconciliation, and interpolation while keeping
 * the server authoritative.
 */

import { hasComponent, removeEntity } from 'bitecs'
import {
  createGameWorld,
  generateMap,
  setWorldTilemap,
  getPlayableBoundsFromTilemap,
  getArenaCenterFromTilemap,
  Position,
  Velocity,
  Player,
  PlayerState,
  PlayerStateType,
  Health,
  Dead,
  Cylinder,
  Showdown,
  Button,
  NO_TARGET,
  TICK_S,
  PLAYER_HP,
  HP_POTION_MAX_STACK,
  createSystemRegistry,
  registerPredictionSystems,
  registerReplaySystems,
  spatialHashSystem,
  getCharacterDef,
  initUpgradeState,
  canTakeNode,
  deriveAbilityHudState,
  computeQuickHash,
  type UpgradeState,
  type SelectNodeResponse,
  type TinkererModResponse,
  type SystemRegistry,
  DEFAULT_RUN_STAGES,
  type Tilemap,
  type GameWorld,
  type InputState,
  type NetworkInput,
  type WorldSnapshot,
  type BulletSpawnMessage,
  type BulletDespawnMessage,
  type ShotResultMessage,
  type HudData,
  type InteractablesData,
  type CharacterId,
  type PlayerRosterEntry,
  getBulletConfigForCharacter,
  CHARACTER_RECOIL,
} from '@high-noon/shared'
import { SoundManager } from '../../audio/SoundManager'
import { SOUND_DEFS } from '../../audio/sounds'
import { AmbientManager } from '../../audio/AmbientManager'
import { INTERNAL_WIDTH, INTERNAL_HEIGHT, WORLD_SCALE, type GameApp } from '../../engine/GameApp'
import { Input } from '../../engine/Input'
import { Camera } from '../../engine/Camera'
import { HitStop } from '../../engine/HitStop'
import { DebugRenderer, type DebugStats } from '../../render/DebugRenderer'
import { SpriteRegistry } from '../../render/SpriteRegistry'
import { PlayerRenderer } from '../../render/PlayerRenderer'
import { BulletRenderer } from '../../render/BulletRenderer'
import { EnemyRenderer } from '../../render/EnemyRenderer'
import { ShowdownRenderer } from '../../render/ShowdownRenderer'
import { LastRitesRenderer } from '../../render/LastRitesRenderer'
import { DynamiteRenderer } from '../../render/DynamiteRenderer'
import { PingRenderer } from '../../render/PingRenderer'
import { GroundCrackRenderer } from '../../render/GroundCrackRenderer'
import { BossShockwaveRenderer } from '../../render/BossShockwaveRenderer'
import { BossAttackRenderer } from '../../render/BossAttackRenderer'
import { InteractableRenderer } from '../../render/InteractableRenderer'
import { TilemapRenderer, CollisionDebugRenderer } from '../../render/TilemapRenderer'
import { TrapZoneRenderer } from '../../render/TrapZoneRenderer'
import { MapObstacleRenderer } from '../../render/MapObstacleRenderer'
import { DustStormEffect } from '../../render/DustStormEffect'
import { TumbleweedRenderer } from '../../render/TumbleweedRenderer'
import { ParticlePool, FloatingTextPool, ChatBubblePool } from '../../fx'
import { NpcRenderer } from '../../render/NpcRenderer'
import { ObjectiveRenderer } from '../../render/ObjectiveRenderer'
import { LightingSystem, createMuzzleFlashLight } from '../../lighting'
import { ClockSync } from '../../net/ClockSync'
import { InputBuffer } from '../../net/InputBuffer'
import { NetworkClient, type GameConfig } from '../../net/NetworkClient'
import { SnapshotBuffer, type InterpolationState } from '../../net/SnapshotBuffer'
import type { HUDState, SkillTreeUIData, SkillNodeState } from '../types'
import { GameplayEventBuffer } from './GameplayEvents'
import { GameplayEventProcessor } from './GameplayEventProcessor'
import { LocalPlayerSimulationDriver } from './SimulationDriver'
import { SnapshotIngestor } from './SnapshotIngestor'
import { PredictedEntityTracker } from './PredictedEntityTracker'
import { RemoteInterpolationApplier } from './RemoteInterpolationApplier'
import { MultiplayerReconciler } from './MultiplayerReconciler'
import { MultiplayerTelemetry, type OverlayMode } from './MultiplayerTelemetry'
import { syncRenderersAndQueueEvents } from './syncRenderersAndQueueEvents'
import type { SceneModeController } from './SceneModeController'
import { DeathSequencePresentation } from './DeathSequencePresentation'
import { MULTIPLAYER_PRESENTATION_POLICY } from './PresentationPolicy'
import { createSceneDebugHotkeyHandler } from './SceneDebugHotkeys'
import {
  emitBossIntroEvents,
  emitBossPhaseTransitionEvents,
  emitCylinderPresentationEvents,
  emitDynamiteCueEvents,
  emitLastRitesCueEvents,
  emitMeleeSwingEvents,
  emitShowdownCueEvents,
  emitTrapDetonationEvents,
} from './PlayerPresentationEvents'
import { seedHazardLights } from './SceneLighting'
import { refreshTilemap } from './refreshTilemap'
import { buildMultiplayerMinimapState } from './minimap'
import { didFireRound } from './feedbackSignals'
import { ShotTraceBuffer } from '../../net/ShotTrace'
import { HitAgreementTracker } from '../../net/HitAgreementTracker'
import { SessionReplayRecorder, type LagReport } from '../../net/SessionReplay'
import { NetGraph } from '../../render/NetGraph'

/** Misprediction smoothing constants */
const EPSILON = 0.5           // pixels — ignore sub-pixel mispredictions

/** Tiered correction speed — small errors snap back fast, large errors
 *  smooth slowly to avoid visible lurching.
 *  Values are exponential decay rates; higher = faster visual correction. */
function getCorrectionSpeed(errorMag: number): number {
  if (errorMag < 2) return 25   // sub-pixel jitter: nearly instant
  if (errorMag < 8) return 18   // small drift
  if (errorMag < 32) return 10  // medium correction
  return 6                       // large correction: slow smooth
}

/** RTT-aware snap threshold — higher latency tolerates larger corrections. */
function getSnapThreshold(rtt: number): number {
  return 96 + Math.min(rtt * 0.96, 192)
}
const MAX_PENDING_SNAPSHOTS = 6
const MAX_SNAPSHOT_APPLIES_PER_UPDATE = 4
const MAX_PENDING_BULLET_EVENTS = 128
const MAX_PENDING_SHOT_RESULTS = 128
const REMOTE_BULLET_MAX_AGE_TICKS = 30
const MAX_PENDING_VISUAL_SHOTS = 256
const MOVEMENT_SPEED_THRESHOLD = 50
const FOOTSTEP_INTERVAL = 0.15

interface PendingVisualShot {
  shootSeq: number
  visualBulletId: number
}

interface MultiplayerInitializeOptions extends Record<string, unknown> {
  net?: NetworkClient
  preconnected?: boolean
}

export class MultiplayerModeController implements SceneModeController {
  private readonly gameApp: GameApp
  private readonly input: Input
  private readonly camera: Camera
  private readonly renderPause: HitStop
  private readonly world: GameWorld
  private readonly debugRenderer: DebugRenderer
  private readonly spriteRegistry: SpriteRegistry
  private readonly playerRenderer: PlayerRenderer
  private readonly bulletRenderer: BulletRenderer
  private readonly enemyRenderer: EnemyRenderer
  private readonly npcRenderer: NpcRenderer
  private readonly objectiveRenderer: ObjectiveRenderer
  private readonly showdownRenderer: ShowdownRenderer
  private readonly lastRitesRenderer: LastRitesRenderer
  private readonly dynamiteRenderer: DynamiteRenderer
  private readonly groundCrackRenderer: GroundCrackRenderer
  private readonly bossShockwaveRenderer: BossShockwaveRenderer
  private readonly bossAttackRenderer: BossAttackRenderer
  private readonly interactableRenderer: InteractableRenderer
  private readonly pingRenderer: PingRenderer
  private readonly trapZoneRenderer: TrapZoneRenderer
  private readonly mapObstacleRenderer: MapObstacleRenderer
  private readonly dustStormEffect: DustStormEffect
  private readonly tumbleweedRenderer: TumbleweedRenderer
  private readonly collisionDebugRenderer: CollisionDebugRenderer
  private readonly lightingSystem: LightingSystem
  private readonly tilemapRenderer: TilemapRenderer
  private currentTilemap: Tilemap | null = null
  private readonly particles: ParticlePool
  private readonly floatingText: FloatingTextPool
  private readonly chatBubblePool: ChatBubblePool
  private readonly sound: SoundManager
  private readonly ambient: AmbientManager
  private net: NetworkClient
  private readonly clockSync: ClockSync
  private readonly snapshotBuffer: SnapshotBuffer
  private readonly inputBuffer: InputBuffer
  private readonly predictionSystems: SystemRegistry
  private readonly replaySystems: SystemRegistry
  private readonly predictionDriver: LocalPlayerSimulationDriver
  private readonly replayDriver: LocalPlayerSimulationDriver
  private readonly gameplayEvents: GameplayEventBuffer
  private readonly gameplayEventProcessor: GameplayEventProcessor
  private readonly deathPresentation: DeathSequencePresentation
  private readonly handleKeyDown: (e: KeyboardEvent) => void
  private readonly snapshotIngestor: SnapshotIngestor
  private readonly predictedEntityTracker: PredictedEntityTracker
  private readonly interpolationApplier: RemoteInterpolationApplier
  private readonly reconciler: MultiplayerReconciler
  private readonly telemetry: MultiplayerTelemetry
  private readonly shotTraceBuffer: ShotTraceBuffer
  private readonly hitAgreement: HitAgreementTracker
  private readonly replayRecorder: SessionReplayRecorder
  private readonly netGraph: NetGraph
  private readonly stateHashHistory = new Map<number, number>()
  private readonly lagReports: LagReport[] = []
  private overlayMode: OverlayMode = 'off'

  /** Input sequence counter for network messages */
  private inputSeq = 0
  /** Monotonic local shoot press-edge sequence for input metadata */
  private shootSeq = 0
  private shootWasDown = false

  /** Server EID → client EID maps */
  private readonly playerEntities = new Map<number, number>()
  private readonly bulletEntities = new Map<number, number>()
  private readonly enemyEntities = new Map<number, number>()
  private readonly serverCharacterIds = new Map<number, CharacterId>()

  /** Local player identification */
  private myServerEid = -1
  private myClientEid = -1
  private readonly selectedCharacterId: CharacterId
  private authoritativeCharacterId: CharacterId
  private connected = false

  /** HUD data from server */
  private latestHud: HudData | null = null
  /** Interactable state from server */
  private latestInteractables: InteractablesData | null = null
  /** Last known stage number for detecting stage transitions */
  private lastStageNumber = 1

  /** Authoritative snapshots waiting to be applied on fixed ticks */
  private readonly pendingSnapshots: WorldSnapshot[] = []
  private readonly pendingBulletSpawns: BulletSpawnMessage[] = []
  private readonly pendingBulletDespawns: BulletDespawnMessage[] = []
  private readonly pendingShotResults: ShotResultMessage[] = []
  private readonly pendingVisualShots: PendingVisualShot[] = []
  private readonly remoteBulletSpawnTickByClientEid = new Map<number, number>()

  /** Dry fire debounce cooldown (seconds) */
  private dryFireCooldown = 0

  /** Disconnect flag for UX overlay */
  private disconnected = false

  /** When true, the next snapshot is treated as a full position reset (no replay). */
  private awaitingReconnectSnapshot = false

  /** Timestamp of the last received snapshot (for timeout detection). */
  private lastSnapshotTime = 0
  /** True when no snapshot has been received for > 3 seconds. */
  private snapshotTimedOut = false

  /** Pause/settings overlay flag (does NOT gate simulation in multiplayer) */
  private paused = false

  /** Monotonic tick for local player animation (decoupled from snapshot tick) */
  private predictionTick = 0

  /** Local upgrade state cache for skill tree UI */
  private upgradeStateCache: UpgradeState | null = null

  /** True while a select-node RPC is in-flight (prevents rapid clicks and HUD overwrite) */
  private pendingNodeSelection = false

  /** Track level for level-up event detection */
  private lastProcessedLevel = 0

  /** Audio state tracking */
  private footstepAccumulator = 0
  private wasRolling = false
  private lastWaveActive = false
  private lastGold = 0
  private wasDead = false

  private lastRenderTime: number

  constructor(gameApp: GameApp, selectedCharacterId: CharacterId = 'sheriff') {
    this.gameApp = gameApp
    this.selectedCharacterId = selectedCharacterId
    this.authoritativeCharacterId = selectedCharacterId
    this.input = new Input()

    // Shadow world — local player is predicted, remote entities populated from snapshots
    this.world = createGameWorld(0, getCharacterDef(selectedCharacterId))
    this.world.playerFireMode = 'hitscan'
    const stage0Config = DEFAULT_RUN_STAGES[0]!.mapConfig
    const tilemap = generateMap(stage0Config, this.world.initialSeed, 0)
    setWorldTilemap(this.world, tilemap)

    // Renderers
    this.tilemapRenderer = new TilemapRenderer(this.gameApp.layers.background)
    this.tilemapRenderer.render(tilemap)
    // Insert building roof overlay above entities so roofs render over players
    const entitiesIdx = this.gameApp.world.getChildIndex(this.gameApp.layers.entities)
    this.gameApp.world.addChildAt(this.tilemapRenderer.getRoofContainer(), entitiesIdx + 1)
    this.lightingSystem = new LightingSystem(this.gameApp.app.renderer, INTERNAL_WIDTH, INTERNAL_HEIGHT)
    // Lightmap composites in RT space (overlay, above worldContainer)
    this.gameApp.overlay.addChild(this.lightingSystem.getLightmapSprite())
    seedHazardLights(this.lightingSystem, tilemap)
    this.currentTilemap = tilemap

    this.debugRenderer = new DebugRenderer(this.gameApp.layers.ui)
    this.interactableRenderer = new InteractableRenderer(this.gameApp.layers.entities)
    this.spriteRegistry = new SpriteRegistry(this.gameApp.layers.entities)
    this.lastRitesRenderer = new LastRitesRenderer(this.gameApp.layers.entities)
    this.dynamiteRenderer = new DynamiteRenderer(this.gameApp.layers.entities)
    this.groundCrackRenderer = new GroundCrackRenderer(this.gameApp.layers.entities)
    this.bossShockwaveRenderer = new BossShockwaveRenderer(this.gameApp.layers.entities)
    this.bossAttackRenderer = new BossAttackRenderer(this.gameApp.layers.entities)
    this.playerRenderer = new PlayerRenderer(this.gameApp.layers.entities)
    this.bulletRenderer = new BulletRenderer(this.spriteRegistry)
    this.enemyRenderer = new EnemyRenderer(this.spriteRegistry, this.debugRenderer, this.gameApp.layers.entities)
    this.npcRenderer = new NpcRenderer(this.spriteRegistry)
    this.objectiveRenderer = new ObjectiveRenderer(this.spriteRegistry, this.gameApp.layers.entities)
    this.showdownRenderer = new ShowdownRenderer(this.gameApp.layers.entities)
    this.pingRenderer = new PingRenderer(this.gameApp.layers.fx)
    this.trapZoneRenderer = new TrapZoneRenderer(this.gameApp.layers.entities)
    this.mapObstacleRenderer = new MapObstacleRenderer(this.gameApp.layers.entities)
    this.dustStormEffect = new DustStormEffect(this.gameApp.layers.entities)
    this.tumbleweedRenderer = new TumbleweedRenderer(this.gameApp.layers.entities)
    this.collisionDebugRenderer = new CollisionDebugRenderer(this.gameApp.layers.ui)

    // Debug graphics in entity layer (world space)
    this.gameApp.layers.entities.addChild(this.debugRenderer.getContainer())

    // Camera — viewport in world units (RT size / world scale)
    this.camera = new Camera()
    this.camera.setViewport(INTERNAL_WIDTH / WORLD_SCALE, INTERNAL_HEIGHT / WORLD_SCALE)
    const bounds = getPlayableBoundsFromTilemap(tilemap)
    this.camera.setBounds(bounds)
    const { x: centerX, y: centerY } = getArenaCenterFromTilemap(tilemap)
    this.camera.snapTo(centerX, centerY)
    this.renderPause = new HitStop()

    // Particles
    this.particles = new ParticlePool(this.gameApp.layers.fx)
    this.floatingText = new FloatingTextPool(this.gameApp.layers.ui)
    this.chatBubblePool = new ChatBubblePool(this.gameApp.layers.ui)

    // Sound
    this.sound = new SoundManager()
    this.sound.loadAll(SOUND_DEFS)
    this.ambient = new AmbientManager()

    // Network
    this.net = new NetworkClient()
    this.clockSync = new ClockSync()
    this.snapshotBuffer = new SnapshotBuffer()
    this.inputBuffer = new InputBuffer()

    // Prediction systems (full pipeline for forward ticks)
    this.predictionSystems = createSystemRegistry()
    registerPredictionSystems(this.predictionSystems)
    this.predictionDriver = new LocalPlayerSimulationDriver(this.world, this.predictionSystems)

    // Replay systems (movement-only for reconciliation — no cylinder/weapon)
    this.replaySystems = createSystemRegistry()
    registerReplaySystems(this.replaySystems)
    this.replayDriver = new LocalPlayerSimulationDriver(this.world, this.replaySystems)

    this.gameplayEvents = new GameplayEventBuffer()
    this.snapshotIngestor = new SnapshotIngestor()
    this.predictedEntityTracker = new PredictedEntityTracker()
    this.interpolationApplier = new RemoteInterpolationApplier()
    this.reconciler = new MultiplayerReconciler()
    this.telemetry = new MultiplayerTelemetry()
    this.shotTraceBuffer = new ShotTraceBuffer()
    this.hitAgreement = new HitAgreementTracker()
    this.replayRecorder = new SessionReplayRecorder()
    this.netGraph = new NetGraph(this.gameApp.layers.ui)
    this.netGraph.addSeries('rtt', 0x44cc44, 200)
    this.netGraph.setThresholds('rtt', 40, 80, 120)
    this.netGraph.addSeries('correction', 0xcccc44, 100)
    this.netGraph.setThresholds('correction', 4, 20, 50)
    this.netGraph.addSeries('bufferDepth', 0x4488cc, 8)
    this.netGraph.setThresholds('bufferDepth', 3, 2, 1)
    this.gameplayEventProcessor = new GameplayEventProcessor({
      camera: this.camera,
      sound: this.sound,
      particles: this.particles,
      floatingText: this.floatingText,
      playerRenderer: this.playerRenderer,
      renderPause: this.renderPause,
      spawnMuzzleLight: (x, y) => this.lightingSystem.addLight(createMuzzleFlashLight(x, y)),
    })

    this.deathPresentation = new DeathSequencePresentation(
      this.gameApp.layers.ui,
      () => ({ width: this.gameApp.width, height: this.gameApp.height }),
      MULTIPLAYER_PRESENTATION_POLICY.death,
    )

    this.handleKeyDown = createSceneDebugHotkeyHandler(
      MULTIPLAYER_PRESENTATION_POLICY.debugHotkeys,
      {
        toggleDebugOverlay: () => this.debugRenderer.toggle(),
        toggleCollisionDebugOverlay: () => this.collisionDebugRenderer.toggle(),
        toggleSpawnPause: () => this.net.sendDebugSpawnPause(),
        cycleNetOverlay: () => this.cycleNetOverlay(),
        recordLagReport: () => this.recordLagReport(),
        exportReplay: () => this.exportReplay(),
      },
    )
    window.addEventListener('keydown', this.handleKeyDown)

    this.lastRenderTime = performance.now()
  }

  isDisconnected(): boolean { return this.disconnected }

  setPaused(paused: boolean): void {
    this.paused = paused
  }

  isPaused(): boolean {
    return this.paused
  }

  getSoundManager(): SoundManager {
    return this.sound
  }

  /** Connect to server — resolves once game-config is received */
  async initialize(options?: Record<string, unknown>): Promise<void> {
    const initOptions = (options ?? {}) as MultiplayerInitializeOptions
    if (initOptions.net) {
      this.net = initOptions.net
    }

    this.net.on('server-shutdown', () => {
      this.net.setSuppressReconnect(true)
    })

    this.net.on('input-warning', (data) => {
      console.warn(`[MP] Server input warning — dropped ${data.dropped} inputs (queue depth: ${data.queueDepth})`)
    })

    this.net.on('disconnect', () => {
      this.connected = false
      this.disconnected = true
      this.latestHud = null
      this.latestInteractables = null
      this.pendingSnapshots.length = 0
      this.pendingBulletSpawns.length = 0
      this.pendingBulletDespawns.length = 0
      this.pendingShotResults.length = 0
      this.pendingVisualShots.length = 0
      this.clockSync.stop()
      this.snapshotBuffer.clear()
      this.inputBuffer.clear()
      this.predictedEntityTracker.clearLocalTimelineBullets()
      this.remoteBulletSpawnTickByClientEid.clear()
      this.snapshotIngestor.resetSessionState()
      this.shootWasDown = false
      console.log('[MP] Disconnected from server')
    })

    this.net.on('hud', (data: HudData) => {
      this.latestHud = data

      // Detect stage transition — regenerate tilemap from seed
      if (data.stageNumber > 0 && data.stageNumber !== this.lastStageNumber) {
        this.lastStageNumber = data.stageNumber
        const stageIndex = data.stageNumber - 1
        const stageConfig = DEFAULT_RUN_STAGES[stageIndex]
        if (stageConfig) {
          const newMap = generateMap(stageConfig.mapConfig, this.world.initialSeed, stageIndex)
          this.world.tilemap = newMap
          this.world.flowField = null
          this.world.spatialHash = null
          this.world.floorSpeedMul.clear()
          this.currentTilemap = newMap
          refreshTilemap(newMap, this.tilemapRenderer, this.camera, this.lightingSystem)
          this.pingRenderer.clear()
        }
      }

      // Sync local upgrade state cache for skill tree UI.
      // Skip during in-flight node selection to avoid overwriting optimistic update.
      if (this.upgradeStateCache && !this.pendingNodeSelection) {
        this.upgradeStateCache.level = data.level
        this.upgradeStateCache.pendingPoints = data.pendingPoints
        this.upgradeStateCache.xp = data.xp
      }
    })

    this.net.on('interactables', (data: InteractablesData) => {
      this.latestInteractables = data
    })

    this.net.on('select-node-result', (result: SelectNodeResponse) => {
      this.pendingNodeSelection = false
      if (this.upgradeStateCache) {
        if (result.success) {
          // Confirmed — ensure cache reflects server (optimistic update already applied)
          this.upgradeStateCache.nodesTaken.add(result.nodeId)
        } else {
          // Server rejected — rollback optimistic update
          this.upgradeStateCache.nodesTaken.delete(result.nodeId)
          this.upgradeStateCache.pendingPoints++
        }
      }
    })

    this.net.on('tinkerer-mod-result', (_result: TinkererModResponse) => {
      // Server ACK for tinkerer mod selection.
      // HUD broadcast already updates the client's modOffers taken state,
      // so this is primarily for future rollback if needed.
    })

    this.net.on('pong', (clientTime, serverTime) => {
      this.clockSync.onPong(clientTime, serverTime)
      if (this.clockSync.isConverged()) {
        this.telemetry.onRTTSample(this.clockSync.getRTT())
      }
    })

    this.net.on('state-hash', (data) => {
      this.onStateHash(data.tick, data.hash)
    })

    this.net.on('game-config', (config: GameConfig) => {
      this.applyGameConfig(config)
    })

    this.net.on('player-roster', (roster: PlayerRosterEntry[]) => {
      this.applyPlayerRoster(roster)
      this.syncPlayerCharacterMapToWorld()
    })

    this.net.on('snapshot', (snapshot: WorldSnapshot) => {
      // Defer heavy decode/apply/reconcile work to fixed update, so socket
      // callbacks stay lightweight and don't preempt rendering.
      this.lastSnapshotTime = performance.now()
      this.snapshotTimedOut = false
      this.telemetry.onSnapshotReceived(this.pendingSnapshots.length > 0)
      this.telemetry.onSnapshotReceivedTimed()
      if (this.pendingSnapshots.length >= MAX_PENDING_SNAPSHOTS) {
        this.pendingSnapshots.shift()
        this.telemetry.onSnapshotDropped()
      }
      this.pendingSnapshots.push(snapshot)
    })

    this.net.on('bullet-spawn', (event: BulletSpawnMessage) => {
      if (this.pendingBulletSpawns.length >= MAX_PENDING_BULLET_EVENTS) {
        // Overflow guard: we drop the oldest pending spawn. If that bullet's
        // despawn later arrives without its spawn ever being ingested, despawn
        // processing is a safe no-op because bulletId will not be mapped.
        this.pendingBulletSpawns.shift()
      }
      this.pendingBulletSpawns.push(event)
    })

    this.net.on('bullet-despawn', (event: BulletDespawnMessage) => {
      if (this.pendingBulletDespawns.length >= MAX_PENDING_BULLET_EVENTS) {
        this.pendingBulletDespawns.shift()
      }
      this.pendingBulletDespawns.push(event)
    })

    this.net.on('shot-result', (event: ShotResultMessage) => {
      if (this.pendingShotResults.length >= MAX_PENDING_SHOT_RESULTS) {
        this.pendingShotResults.shift()
      }
      this.pendingShotResults.push(event)
    })

    this.net.on('player-ping', (event) => {
      this.pingRenderer.addPing(event)
    })

    if (initOptions.preconnected) {
      const config = this.net.getLatestGameConfig()
      if (!config) {
        throw new Error('Missing game-config for preconnected multiplayer client')
      }
      this.applyGameConfig(config)
      this.net.requestGameConfig()
      return
    }

    const { net: _ignoredNet, preconnected: _ignoredPreconnected, ...joinOptions } = initOptions

    // join() resolves after game-config is received (with timeout)
    await this.net.join({
      ...joinOptions,
      characterId: this.selectedCharacterId,
    })
  }

  private applyGameConfig(config: GameConfig): void {
    this.myServerEid = config.playerEid
    this.authoritativeCharacterId = config.characterId

    // Update world seed for map generation (server sends authoritative seed)
    if (config.seed !== this.world.initialSeed) {
      this.world.initialSeed = config.seed
      // Regenerate stage 0 tilemap with correct seed
      const stage0Config = DEFAULT_RUN_STAGES[0]!.mapConfig
      const newMap = generateMap(stage0Config, config.seed, 0)
      this.world.tilemap = newMap
      this.world.flowField = null
      this.world.spatialHash = null
      this.world.floorSpeedMul.clear()
      this.currentTilemap = newMap
      refreshTilemap(newMap, this.tilemapRenderer, this.camera, this.lightingSystem)
      this.pingRenderer.clear()
    }
    this.serverCharacterIds.set(config.playerEid, config.characterId)
    if (config.roster) {
      this.applyPlayerRoster(config.roster)
    }
    const charDef = getCharacterDef(config.characterId)
    this.upgradeStateCache = initUpgradeState(charDef)
    if (config.nodesTaken) {
      for (const id of config.nodesTaken) {
        this.upgradeStateCache.nodesTaken.add(id)
      }
    }
    if (config.weaponMods) {
      for (const modId of config.weaponMods) {
        this.upgradeStateCache.weaponMods.add(modId)
      }
    }
    this.world.characterId = config.characterId
    this.world.upgradeState = initUpgradeState(charDef)
    if (this.myClientEid >= 0) {
      this.world.playerUpgradeStates.set(this.myClientEid, this.world.upgradeState)
      this.world.playerCharacters.set(this.myClientEid, config.characterId)
    }
    this.syncPlayerCharacterMapToWorld()
    this.connected = true
    this.disconnected = false
    this.shootWasDown = false
    this.inputSeq = 0
    this.shootSeq = 0
    this.reconciler.reset()
    this.awaitingReconnectSnapshot = true
    this.replayRecorder.start(config.seed, config.characterId)
    console.log(`[MP] Connected — server playerEid=${config.playerEid}, character=${config.characterId}`)
    this.clockSync.reset()
    this.snapshotBuffer.clear()
    this.inputBuffer.clear()
    this.pendingSnapshots.length = 0
    this.pendingBulletSpawns.length = 0
    this.pendingBulletDespawns.length = 0
    this.pendingShotResults.length = 0
    this.pendingVisualShots.length = 0
    this.remoteBulletSpawnTickByClientEid.clear()
    this.snapshotIngestor.resetSessionState()
    this.clockSync.start((clientTime) => this.net.sendPing(clientTime))
  }

  // ===========================================================================
  // Network Snapshot Processing
  // ===========================================================================

  private processPendingSnapshots(): void {
    let processed = 0
    while (this.pendingSnapshots.length > 0 && processed < MAX_SNAPSHOT_APPLIES_PER_UPDATE) {
      const snapshot = this.pendingSnapshots.shift()!
      this.world.tick = snapshot.tick
      this.applyEntityLifecycle(snapshot)
      this.telemetry.onSnapshotApplied()

      // Rebuild broadphase once per authoritative snapshot, then reuse during
      // prediction/replay ticks (local-player scope skips per-tick rebuilds).
      spatialHashSystem(this.world, TICK_S)

      if (this.awaitingReconnectSnapshot) {
        // First snapshot after reconnect: snap player to server position, skip replay
        this.awaitingReconnectSnapshot = false
        if (this.myClientEid >= 0) {
          const serverPlayer = snapshot.players.find(p => p.eid === this.myServerEid)
          if (serverPlayer) {
            Position.x[this.myClientEid] = serverPlayer.x
            Position.y[this.myClientEid] = serverPlayer.y
            Position.prevX[this.myClientEid] = serverPlayer.x
            Position.prevY[this.myClientEid] = serverPlayer.y
            Velocity.x[this.myClientEid] = 0
            Velocity.y[this.myClientEid] = 0
          }
          this.reconciler.reset()
          this.inputBuffer.clear()
        }
      } else if (this.myClientEid >= 0) {
        // Normal reconciliation
        this.reconcileLocalPlayer(snapshot)
      }

      this.snapshotBuffer.push(snapshot)
      processed++
    }
  }

  // ===========================================================================
  // Entity Lifecycle — sync ECS shadow world with snapshot data
  // ===========================================================================

  private buildSnapshotIngestContext() {
    return {
      world: this.world,
      tracker: this.predictedEntityTracker,
      playerEntities: this.playerEntities,
      bulletEntities: this.bulletEntities,
      enemyEntities: this.enemyEntities,
      myServerEid: this.myServerEid,
      myClientEid: this.myClientEid,
      localCharacterId: this.authoritativeCharacterId,
      resolveCharacterIdForServerEid: (serverEid: number) => this.serverCharacterIds.get(serverEid),
      setMyClientEid: (eid: number) => { this.myClientEid = eid },
      setLocalPlayerRenderEid: (eid: number | null) => { this.playerRenderer.localPlayerEid = eid },
      resolveRttMs: () => this.clockSync.isConverged() ? this.clockSync.getRTT() : 0,
    }
  }

  private applyEntityLifecycle(snapshot: WorldSnapshot): void {
    const ingestStats = this.snapshotIngestor.applyEntityLifecycle(
      snapshot,
      this.buildSnapshotIngestContext(),
      this.predictionTick,
    )
    this.telemetry.onPredictedBulletsTimedOut(ingestStats.timedOutPredictedBullets)
  }

  private processPendingBulletEvents(): void {
    if (this.pendingBulletSpawns.length === 0 && this.pendingBulletDespawns.length === 0) return
    const ingestCtx = this.buildSnapshotIngestContext()
    while (this.pendingBulletSpawns.length > 0) {
      const event = this.pendingBulletSpawns.shift()!
      if (this.snapshotIngestor.applyBulletSpawn(event, ingestCtx)) {
        this.telemetry.onPredictedBulletsMatched(1)
      }
      const clientEid = this.bulletEntities.get(event.bulletId)
      if (clientEid === undefined) continue
      if (this.predictedEntityTracker.isLocalTimelineBullet(clientEid)) {
        this.remoteBulletSpawnTickByClientEid.delete(clientEid)
      } else if (!this.remoteBulletSpawnTickByClientEid.has(clientEid)) {
        this.remoteBulletSpawnTickByClientEid.set(clientEid, this.predictionTick)
      }
    }
    while (this.pendingBulletDespawns.length > 0) {
      const event = this.pendingBulletDespawns.shift()!
      const clientEid = this.bulletEntities.get(event.bulletId)
      this.snapshotIngestor.applyBulletDespawn(event, ingestCtx)
      if (clientEid !== undefined) {
        this.remoteBulletSpawnTickByClientEid.delete(clientEid)
      }
    }
  }

  private processPendingShotResults(): void {
    if (this.pendingShotResults.length === 0) return
    const fallbackEvents: Array<{ type: 'shot-confirmed'; x: number; y: number; hit: boolean }> = []
    while (this.pendingShotResults.length > 0) {
      const result = this.pendingShotResults.shift()!
      // Remote player shot — spawn visual bullet toward impact point
      if (result.shooterServerEid !== this.myServerEid) {
        const remoteClientEid = this.playerEntities.get(result.shooterServerEid)
        if (remoteClientEid !== undefined) {
          const barrelTip = this.playerRenderer.getBarrelTipPosition(remoteClientEid)
          const startX = barrelTip?.x ?? Position.x[remoteClientEid]!
          const startY = barrelTip?.y ?? Position.y[remoteClientEid]!
          const angle = Math.atan2(result.hitY - startY, result.hitX - startX)
          const remoteCharId = this.serverCharacterIds.get(result.shooterServerEid) ?? 'sheriff'
          const remoteBulletCfg = getBulletConfigForCharacter(remoteCharId)
          const visualId = this.bulletRenderer.spawnVisualBullet(
            startX, startY, angle,
            remoteBulletCfg.visualSpeed, remoteBulletCfg.visualMaxLifetime,
            remoteBulletCfg.spriteId, remoteBulletCfg.size,
          )
          this.bulletRenderer.resolveVisualBulletImpact(
            visualId, result.hitX, result.hitY,
            result.hit ? 'entity' : 'wall',
          )
          this.lightingSystem.addLight(createMuzzleFlashLight(startX, startY))
        }
        fallbackEvents.push({
          type: 'shot-confirmed',
          x: result.hitX,
          y: result.hitY,
          hit: result.hit,
        })
        continue
      }

      // Attach to shot trace and feed hit agreement.
      // NOTE: Client prediction attachment is deferred — passing null means
      // all outcomes classify as TRUE_MISS or FALSE_MISS until we track
      // per-bullet predicted targets. Agreement rate reflects miss-only stats.
      const trace = this.shotTraceBuffer.attachServerResult(result.shootSeq, result)
      if (trace) {
        this.hitAgreement.record(
          null,
          result.hit ? (result.targetServerEid ?? null) : null,
        )
      }

      // Feed server frame time telemetry
      if (result.serverFrameTimeMs !== undefined) {
        this.telemetry.onServerFrameTime(result.serverFrameTimeMs)
      }

      const visualBulletId = this.takePendingVisualShot(result.shootSeq)
      if (
        visualBulletId !== null &&
        this.bulletRenderer.resolveVisualBulletImpact(
          visualBulletId,
          result.hitX,
          result.hitY,
          result.hit ? 'entity' : 'wall',
        )
      ) {
        continue
      }

      fallbackEvents.push({
        type: 'shot-confirmed',
        x: result.hitX,
        y: result.hitY,
        hit: result.hit,
      })
    }

    if (fallbackEvents.length > 0) {
      this.gameplayEventProcessor.processAll(fallbackEvents)
    }
  }

  private queuePendingVisualShot(shootSeq: number, visualBulletId: number): void {
    if (this.pendingVisualShots.length >= MAX_PENDING_VISUAL_SHOTS) {
      this.pendingVisualShots.shift()
    }
    this.pendingVisualShots.push({ shootSeq, visualBulletId })
  }

  private takePendingVisualShot(shootSeq: number): number | null {
    const index = this.pendingVisualShots.findIndex((shot) => shot.shootSeq === shootSeq)
    if (index < 0) return null
    const [shot] = this.pendingVisualShots.splice(index, 1)
    return shot?.visualBulletId ?? null
  }

  private processVisualBulletImpacts(): void {
    const impacts = this.bulletRenderer.consumeVisualImpacts()
    if (impacts.length === 0) return

    this.gameplayEventProcessor.processAll(
      impacts.map((impact) => ({
        type: 'shot-confirmed' as const,
        x: impact.x,
        y: impact.y,
        hit: impact.kind === 'entity',
      })),
    )
  }

  private advanceRemoteBullets(): void {
    if (this.bulletEntities.size <= 0) return
    for (const [bulletId, clientEid] of this.bulletEntities) {
      if (this.predictedEntityTracker.isLocalTimelineBullet(clientEid)) continue

      const spawnTick = this.remoteBulletSpawnTickByClientEid.get(clientEid)
      if (spawnTick === undefined) {
        this.remoteBulletSpawnTickByClientEid.set(clientEid, this.predictionTick)
      } else if (this.predictionTick - spawnTick > REMOTE_BULLET_MAX_AGE_TICKS) {
        removeEntity(this.world, clientEid)
        this.predictedEntityTracker.unmarkServerBullet(clientEid)
        this.bulletEntities.delete(bulletId)
        this.remoteBulletSpawnTickByClientEid.delete(clientEid)
        continue
      }

      Position.prevX[clientEid] = Position.x[clientEid]!
      Position.prevY[clientEid] = Position.y[clientEid]!
      Position.x[clientEid] = Position.x[clientEid]! + Velocity.x[clientEid]! * TICK_S
      Position.y[clientEid] = Position.y[clientEid]! + Velocity.y[clientEid]! * TICK_S
    }
  }

  /**
   * Keep simulation-side remote transforms aligned to the freshest authoritative
   * snapshot so local prediction does not collide against render-delayed state.
   */
  private prepareSimulationStateFromLatestSnapshot(): void {
    const latest = this.snapshotBuffer.latest
    if (!latest) return

    this.interpolateFromBuffer({
      from: latest,
      to: latest,
      alpha: 1,
    })

    // Collision simulation runs in present time. Extrapolate remote enemies
    // from latest authoritative snapshot toward estimated server-now.
    const rawAgeMs = this.clockSync.isConverged()
      ? this.clockSync.getServerTime() - latest.serverTime
      : 25
    const ageS = Math.max(0, Math.min(0.12, rawAgeMs / 1000))
    if (ageS <= 0) return

    for (const enemyEid of this.enemyEntities.values()) {
      Position.prevX[enemyEid] = Position.x[enemyEid]!
      Position.prevY[enemyEid] = Position.y[enemyEid]!
      Position.x[enemyEid] = Position.x[enemyEid]! + Velocity.x[enemyEid]! * ageS
      Position.y[enemyEid] = Position.y[enemyEid]! + Velocity.y[enemyEid]! * ageS
    }
  }

  private applyPlayerRoster(entries: PlayerRosterEntry[]): void {
    this.serverCharacterIds.clear()
    for (const entry of entries) {
      this.serverCharacterIds.set(entry.eid, entry.characterId)
    }
  }

  private syncPlayerCharacterMapToWorld(): void {
    for (const [serverEid, clientEid] of this.playerEntities) {
      const characterId = this.serverCharacterIds.get(serverEid)
      if (characterId) {
        this.world.playerCharacters.set(clientEid, characterId)
      }
    }
  }

  private tickPlayerHitIframes(dt: number): void {
    for (const clientEid of this.playerEntities.values()) {
      const current = Health.iframes[clientEid]!
      if (current > 0) {
        Health.iframes[clientEid] = Math.max(0, current - dt)
      }
    }
  }

  // ===========================================================================
  // Server Reconciliation
  // ===========================================================================

  /**
   * Rewind local player to server authority, replay unacknowledged inputs,
   * and compute visual error offset for smooth misprediction correction.
   */
  private reconcileLocalPlayer(snapshot: WorldSnapshot): void {
    const rtt = this.clockSync.isConverged() ? this.clockSync.getRTT() : 0
    const sample = this.reconciler.reconcile(
      snapshot,
      {
        world: this.world,
        myServerEid: this.myServerEid,
        myClientEid: this.myClientEid,
        inputBuffer: this.inputBuffer,
        replayDriver: this.replayDriver,
        gameplayEventSink: {
          pushGameplayEvent: (event) => this.gameplayEvents.push(event),
        },
        hitPolicy: MULTIPLAYER_PRESENTATION_POLICY.playerHit,
      },
      EPSILON,
      getSnapThreshold(rtt),
    )
    if (sample.hadCorrection) {
      this.telemetry.onReconciliationCorrectionDetailed(
        sample.correctionErrorMagnitude,
        sample.snapped,
        this.reconciler.getError().x,
        this.reconciler.getError().y,
      )
    }

    // Store client state hash for desync detection
    const clientHash = computeQuickHash(this.world)
    this.stateHashHistory.set(snapshot.tick, clientHash)
    // Prune old entries
    for (const [tick] of this.stateHashHistory) {
      if (tick < snapshot.tick - 120) this.stateHashHistory.delete(tick)
    }
  }

  // ===========================================================================
  // Update (60Hz) — capture + send input
  // ===========================================================================

  update(_dt: number): void {
    if (!this.connected) return

    // Snapshot timeout detection
    if (this.lastSnapshotTime > 0 && performance.now() - this.lastSnapshotTime > 3000) {
      if (!this.snapshotTimedOut) {
        this.snapshotTimedOut = true
        console.warn('[MP] Snapshot timeout — no snapshot received for 3+ seconds')
      }
    }

    // Apply pending authoritative snapshots on the fixed tick (bounded catch-up).
    this.processPendingSnapshots()
    this.processPendingBulletEvents()
    this.processPendingShotResults()
    this.prepareSimulationStateFromLatestSnapshot()
    this.advanceRemoteBullets()
    this.tickPlayerHitIframes(TICK_S)

    // Level-up detection from server HUD data (emit one event per level gained)
    const currentLevel = this.latestHud?.level ?? 0
    while (currentLevel > this.lastProcessedLevel) {
      this.lastProcessedLevel++
      if (this.myClientEid >= 0) {
        this.gameplayEvents.push({
          type: 'level-up',
          x: Position.x[this.myClientEid]!,
          y: Position.y[this.myClientEid]!,
        })
      }
    }

    // Wave-start detection
    {
      const waveActive = this.latestHud?.waveStatus === 'active'
      if (waveActive && !this.lastWaveActive) {
        this.gameplayEvents.push({ type: 'wave-start' })
      }
      this.lastWaveActive = waveActive
    }

    // Stage-complete detection — trigger cosmetic tumbleweeds
    if (this.latestHud?.stageStatus === 'completed' && this.currentTilemap) {
      const tmBounds = getPlayableBoundsFromTilemap(this.currentTilemap)
      this.tumbleweedRenderer.trigger(tmBounds.minX, tmBounds.maxX, tmBounds.minY, tmBounds.maxY)
    }

    // Gold pickup detection
    {
      const gold = this.latestHud?.goldCollected ?? 0
      if (gold > this.lastGold) {
        this.gameplayEvents.push({ type: 'gold-pickup' })
      }
      this.lastGold = gold
    }

    // Player death detection
    {
      const dead = this.myClientEid >= 0 && hasComponent(this.world, Dead, this.myClientEid)
      if (dead && !this.wasDead) {
        this.gameplayEvents.push({ type: 'player-death' })
      }
      this.wasDead = dead
    }

    // Update ambient track
    {
      const stageIndex = (this.latestHud?.stageNumber ?? 1) - 1
      this.ambient.setStage(stageIndex)
    }

    if (this.myClientEid < 0) return
    const error = this.reconciler.getError()

    // Set input reference position from predicted position (immediate)
    this.input.setReferencePosition(
      Position.x[this.myClientEid]!,
      Position.y[this.myClientEid]!,
    )

    // Set camera for screen→world conversion
    const camPos = this.camera.getPosition()
    const zoom = this.gameApp.width * WORLD_SCALE / INTERNAL_WIDTH
    this.input.setCamera(camPos.x, camPos.y, this.gameApp.width, this.gameApp.height, zoom)

    // Collect and tag input
    const inputState: InputState = this.input.getInputState()

    // Check for ping request (G key — separate from simulation input)
    const pingType = this.input.consumePingRequest()
    if (pingType) {
      const cursorWorld = this.input.getWorldMousePosition()
      this.net.sendPlayerPing({
        type: pingType,
        worldX: cursorWorld.x,
        worldY: cursorWorld.y,
      })
    }

    const wantsShoot = (inputState.buttons & Button.SHOOT) !== 0
    if (wantsShoot && !this.shootWasDown) {
      this.shootSeq++
      this.shotTraceBuffer.open(
        this.shootSeq,
        this.inputSeq + 1,
        performance.now(),
        this.predictionTick,
        Player.aimAngle[this.myClientEid]!,
        Position.x[this.myClientEid]!,
        Position.y[this.myClientEid]!,
        this.clockSync.isConverged() ? this.clockSync.getRTT() : 0,
      )
    }
    this.shootWasDown = wantsShoot
    this.inputSeq++
    const sampleClientTimeMs = performance.now()
    const estimatedServerTimeMs = this.clockSync.isConverged() ? this.clockSync.getServerTime() : 0
    const networkInput: NetworkInput = {
      ...inputState,
      seq: this.inputSeq,
      clientTick: this.predictionTick,
      clientTimeMs: sampleClientTimeMs,
      estimatedServerTimeMs,
      viewInterpDelayMs: this.snapshotBuffer.getInterpolationDelayMs(),
      shootSeq: this.shootSeq,
    }
    this.inputBuffer.push(networkInput)
    this.net.sendInput(networkInput)

    // --- PREDICTION ---
    // Snapshot cylinder state before stepping (for fire + reload detection)
    const hasCylinder = hasComponent(this.world, Cylinder, this.myClientEid)
    const prevRounds = hasCylinder ? Cylinder.rounds[this.myClientEid]! : -1
    const prevReloading = hasCylinder ? Cylinder.reloading[this.myClientEid]! : 0

    // Save pre-step position so prevX/prevY stay meaningful between snapshots
    Position.prevX[this.myClientEid] = Position.x[this.myClientEid]!
    Position.prevY[this.myClientEid] = Position.y[this.myClientEid]!
    this.predictionDriver.step(this.myClientEid, inputState)

    const newRounds = hasCylinder ? Cylinder.rounds[this.myClientEid]! : -1
    const nowReloading = hasCylinder ? Cylinder.reloading[this.myClientEid]! : 0

    const spawnedPredictedBullets = this.predictedEntityTracker.detectNewPredictedBullets(
      this.world,
      this.myClientEid,
      this.predictionTick,
    )
    this.telemetry.onPredictedBulletsSpawned(spawnedPredictedBullets)

    const angle = Player.aimAngle[this.myClientEid]!
    const barrelTip = this.playerRenderer.getBarrelTipFromState(
      this.world,
      this.myClientEid,
      Position.x[this.myClientEid]! + error.x,
      Position.y[this.myClientEid]! + error.y,
    )

    this.dryFireCooldown = Math.max(0, this.dryFireCooldown - TICK_S)
    if (hasCylinder) {
      const firedRound = this.world.playerFireMode === 'hitscan' && didFireRound(prevRounds, newRounds)
      if (firedRound) {
        const muzzleX = barrelTip?.x ?? Position.x[this.myClientEid]!
        const muzzleY = barrelTip?.y ?? Position.y[this.myClientEid]!
        const localBulletCfg = getBulletConfigForCharacter(this.authoritativeCharacterId)
        const pelletCount = Math.max(1, Math.round(this.world.upgradeState.pelletCount))
        const spreadAngle = this.world.upgradeState.spreadAngle
        for (let i = 0; i < pelletCount; i++) {
          const angleOffset = pelletCount > 1
            ? spreadAngle * (i / (pelletCount - 1) - 0.5)
            : 0
          const visualBulletId = this.bulletRenderer.spawnVisualBullet(
            muzzleX,
            muzzleY,
            angle + angleOffset,
            localBulletCfg.visualSpeed,
            localBulletCfg.visualMaxLifetime,
            localBulletCfg.spriteId,
            localBulletCfg.size,
          )
          this.queuePendingVisualShot(this.shootSeq, visualBulletId)
        }
      }

      const recoil = CHARACTER_RECOIL[this.authoritativeCharacterId]
      this.dryFireCooldown = emitCylinderPresentationEvents({
        events: this.gameplayEvents,
        actorEid: this.myClientEid,
        prevRounds,
        newRounds,
        prevReloading,
        nowReloading,
        inputState,
        dryFireCooldown: this.dryFireCooldown,
        dryFireCooldownSeconds: 0.3,
        aimAngle: angle,
        muzzleX: barrelTip?.x ?? Position.x[this.myClientEid]!,
        muzzleY: barrelTip?.y ?? Position.y[this.myClientEid]!,
        fireTrauma: recoil.fireTrauma,
        fireKickStrength: recoil.cameraKickStrength,
        fireSlowdownMs: recoil.fireSlowdownMs,
      })
    }
    emitMeleeSwingEvents(this.gameplayEvents, this.world, this.myClientEid)

    emitShowdownCueEvents(this.gameplayEvents, this.world)
    emitLastRitesCueEvents(this.gameplayEvents, this.world)
    emitDynamiteCueEvents(this.gameplayEvents, this.world, this.myClientEid >= 0 ? this.myClientEid : null)
    emitTrapDetonationEvents(this.gameplayEvents, this.world)
    emitBossPhaseTransitionEvents(this.gameplayEvents, this.world)

    // Showdown target tinting for enemies
    this.enemyRenderer.showdownTargetEid =
      hasComponent(this.world, Showdown, this.myClientEid) && Showdown.active[this.myClientEid]! === 1
        ? Showdown.targetEid[this.myClientEid]!
        : NO_TARGET
    this.enemyRenderer.lastRitesZone = this.world.lastRites?.active ? this.world.lastRites : null

    // Advance local animation tick (monotonic, decoupled from snapshot tick)
    this.predictionTick++

    this.gameplayEventProcessor.processAll(this.gameplayEvents.drain())

    // Update camera at 60Hz (matches single-player pattern — sub-frame interpolation
    // via game loop alpha in getRenderState gives smooth camera at display refresh rate)
    const worldMouse = this.input.getWorldMousePosition()
    this.camera.update(
      Position.x[this.myClientEid]! + error.x,
      Position.y[this.myClientEid]! + error.y,
      worldMouse.x,
      worldMouse.y,
      TICK_S,
    )

    // Re-sync camera for screen→world conversion after camera update,
    // so the next render frame's mouse position uses the corrected camera.
    const updatedCamPos = this.camera.getPosition()
    const updatedZoom = this.gameApp.width * WORLD_SCALE / INTERNAL_WIDTH
    this.input.setCamera(updatedCamPos.x, updatedCamPos.y, this.gameApp.width, this.gameApp.height, updatedZoom)
  }

  // ===========================================================================
  // Render (variable Hz) — interpolate snapshots + draw
  // ===========================================================================

  render(_loopAlpha: number, fps: number): void {
    const now = performance.now()
    const rawDt = (now - this.lastRenderTime) / 1000
    const realDt = Math.min(rawDt, 0.25)
    this.lastRenderTime = now
    this.ambient.update(realDt)
    if (this.renderPause.update(realDt) === 0) return

    // Interpolate snapshot data into ECS arrays
    const interpState = this.snapshotBuffer.getInterpolationState(
      this.clockSync.isConverged() ? this.clockSync.getServerTime() : undefined
    )
    const alpha = interpState ? this.interpolateFromBuffer(interpState) : 0.5

    // Feed interpolation delay telemetry
    this.telemetry.onInterpolationDelayUpdate(this.snapshotBuffer.getInterpolationDelayMs())

    // Decay misprediction error (frame-rate independent, tiered by magnitude).
    const error = this.reconciler.getError()
    const errorMag = Math.sqrt(error.x * error.x + error.y * error.y)
    this.reconciler.decayError(rawDt, getCorrectionSpeed(errorMag))

    // Feed monotonic prediction tick to player renderer for local player animation
    this.playerRenderer.localPlayerTick = this.predictionTick

    syncRenderersAndQueueEvents({
      world: this.world,
      playerRenderer: this.playerRenderer,
      enemyRenderer: this.enemyRenderer,
      bulletRenderer: this.bulletRenderer,
      events: this.gameplayEvents,
      npcRenderer: this.npcRenderer,
      objectiveRenderer: this.objectiveRenderer,
      chatBubblePool: this.chatBubblePool,
    })
    emitBossIntroEvents({
      events: this.gameplayEvents,
      enemyRenderer: this.enemyRenderer,
      narrativeThreadId: this.latestHud?.narrativeThreadId ?? null,
    })
    this.gameplayEventProcessor.processAll(this.gameplayEvents.drain())

    // Get camera render state using game loop alpha (matches single-player pattern —
    // camera.update() runs at 60Hz in update(), getRenderState interpolates for sub-frame smoothness)
    const camState = this.camera.getRenderState(_loopAlpha, realDt)

    // Snap camera in RT space so world pixels align to RT pixel grid.
    const rtCamX = camState.x * WORLD_SCALE
    const rtCamY = camState.y * WORLD_SCALE
    const rtSnappedX = Math.floor(rtCamX)
    const rtSnappedY = Math.floor(rtCamY)
    const fracX = rtCamX - rtSnappedX  // fractional RT pixels (0..1)
    const fracY = rtCamY - rtSnappedY

    // Apply camera transform to world container (pivot in world space)
    this.gameApp.world.pivot.set(rtSnappedX / WORLD_SCALE, rtSnappedY / WORLD_SCALE)
    this.gameApp.world.position.set(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2)
    this.gameApp.world.rotation = camState.angle

    this.lightingSystem.updateLights(realDt)
    this.lightingSystem.resize(INTERNAL_WIDTH, INTERNAL_HEIGHT)
    this.lightingSystem.render(camState.x, camState.y, WORLD_SCALE)

    // Scale low-res sprite to fill canvas (handles window resize)
    this.gameApp.resize()

    // Update per-building dither visibility
    if (this.myClientEid >= 0) {
      const px = Position.x[this.myClientEid]!
      const py = Position.y[this.myClientEid]!
      const screenZoom = this.gameApp.width * WORLD_SCALE / INTERNAL_WIDTH
      const dx = px - camState.x
      const dy = py - camState.y
      const cos = Math.cos(camState.angle)
      const sin = Math.sin(camState.angle)
      const screenX = (dx * cos - dy * sin) * screenZoom + this.gameApp.width / 2
      const screenY = (dx * sin + dy * cos) * screenZoom + this.gameApp.height / 2
      this.tilemapRenderer.updateBuildingVisibility(px, py, screenX, screenY)
    }

    // Clear debug
    this.debugRenderer.clear()
    this.collisionDebugRenderer.clear()
    this.interactableRenderer.render(this.latestInteractables, realDt)

    // Local player presentation is decoupled from simulation ECS state:
    // provide a render-only override instead of mutating Position arrays.
    if (this.myClientEid >= 0) {
      const prevX = Position.prevX[this.myClientEid]!
      const prevY = Position.prevY[this.myClientEid]!
      const currX = Position.x[this.myClientEid]!
      const currY = Position.y[this.myClientEid]!
      const renderX = prevX + (currX - prevX) * _loopAlpha + error.x
      const renderY = prevY + (currY - prevY) * _loopAlpha + error.y
      this.playerRenderer.setRenderPositionOverride(this.myClientEid, renderX, renderY)
    }

    // Render entities
    this.playerRenderer.render(this.world, alpha, realDt)

    if (this.myClientEid >= 0) {
      this.playerRenderer.clearRenderPositionOverride(this.myClientEid)
    }

    // Footstep + roll sounds for local player
    if (this.myClientEid >= 0 && hasComponent(this.world, PlayerState, this.myClientEid)) {
      const isRolling = PlayerState.state[this.myClientEid] === PlayerStateType.ROLLING
      if (isRolling && !this.wasRolling) {
        this.gameplayEvents.push({ type: 'roll' })
      }
      this.wasRolling = isRolling

      const vx = Velocity.x[this.myClientEid]!
      const vy = Velocity.y[this.myClientEid]!
      const speed = Math.sqrt(vx * vx + vy * vy)
      if (speed > MOVEMENT_SPEED_THRESHOLD && !isRolling) {
        this.footstepAccumulator += realDt
        if (this.footstepAccumulator >= FOOTSTEP_INTERVAL) {
          this.footstepAccumulator = 0
          this.sound.play('footstep')
        }
      } else {
        this.footstepAccumulator = 0
      }
    }

    this.bulletRenderer.updateVisualBullets(realDt)
    this.processVisualBulletImpacts()
    if (this.myClientEid >= 0 && (error.x !== 0 || error.y !== 0)) {
      this.bulletRenderer.renderWithLocalOffset(
        this.world,
        alpha,
        this.predictedEntityTracker.getLocalTimelineBullets(),
        error.x,
        error.y,
        realDt,
      )
    } else {
      this.bulletRenderer.render(this.world, alpha, realDt)
    }
    this.enemyRenderer.render(this.world, alpha, realDt)
    this.npcRenderer.render(this.world, alpha)
    this.objectiveRenderer.render(this.world, alpha)
    this.bossAttackRenderer.render(this.world)
    this.groundCrackRenderer.render(this.world)
    this.bossShockwaveRenderer.render(this.world)
    this.dynamiteRenderer.render(this.world, realDt, this.particles)
    this.showdownRenderer.render(this.world, this.playerEntities.values(), alpha, realDt)
    this.lastRitesRenderer.render(this.world, alpha, realDt)
    this.pingRenderer.update(this.world)
    this.trapZoneRenderer.render(this.world)
    this.mapObstacleRenderer.render(this.world)

    // Update dust storm fog-of-war
    if (this.myClientEid >= 0) {
      this.dustStormEffect.update(this.world, Position.x[this.myClientEid]!, Position.y[this.myClientEid]!)
    }

    // Update tumbleweeds
    this.tumbleweedRenderer.update(realDt)

    // Update particles
    this.particles.update(realDt)
    {
      const screenZoom = this.gameApp.width * WORLD_SCALE / INTERNAL_WIDTH
      this.floatingText.update(realDt, {
        x: camState.x,
        y: camState.y,
        zoom: screenZoom,
        halfW: this.gameApp.width / 2,
        halfH: this.gameApp.height / 2,
      })
    }
    {
      const screenZoom = this.gameApp.width * WORLD_SCALE / INTERNAL_WIDTH
      this.chatBubblePool.update(realDt, this.world, {
        x: camState.x,
        y: camState.y,
        zoom: screenZoom,
        halfW: this.gameApp.width / 2,
        halfH: this.gameApp.height / 2,
      })
    }

    // Flush world container into the low-res RenderTexture
    this.gameApp.renderWorld()

    // Smooth sub-pixel camera scrolling (frac is in RT pixels)
    this.gameApp.applyCameraSubPixelOffset(fracX, fracY)

    const isDead = this.myClientEid >= 0 && hasComponent(this.world, Dead, this.myClientEid)
    this.deathPresentation.update(isDead)

    // Debug stats
    const camPos = this.camera.getPosition()
    const stats: DebugStats = {
      fps,
      tick: this.world.tick,
      entityCount: this.spriteRegistry.count,
      playerState: 'mp',
      enemyCount: this.enemyRenderer.count,
      enemyStates: '',
      playerHP: this.myClientEid >= 0 ? Health.current[this.myClientEid]! : 0,
      playerMaxHP: this.myClientEid >= 0 ? Health.max[this.myClientEid]! : 0,
      activeProjectiles: this.bulletEntities.size,
      playerX: this.myClientEid >= 0 ? Position.x[this.myClientEid]! : 0,
      playerY: this.myClientEid >= 0 ? Position.y[this.myClientEid]! : 0,
      playerVx: this.myClientEid >= 0 ? Velocity.x[this.myClientEid]! : 0,
      playerVy: this.myClientEid >= 0 ? Velocity.y[this.myClientEid]! : 0,
      cameraX: camPos.x,
      cameraY: camPos.y,
      cameraTrauma: this.camera.shake.currentTrauma,
      stageNumber: this.latestHud?.stageNumber ?? 0,
      stageStatus: this.latestHud?.stageStatus ?? 'none',
      waveNumber: this.latestHud?.waveNumber ?? 0,
      waveStatus: this.latestHud?.waveStatus ?? 'none',
      fodderAlive: 0,
      threatAlive: 0,
      fodderBudgetLeft: 0,
      xp: this.latestHud?.xp ?? 0,
      level: this.latestHud?.level ?? 0,
      pendingPts: this.latestHud?.pendingPoints ?? 0,
      pingMs: this.clockSync.isConverged() ? this.clockSync.getRTT() : undefined,
      netTelemetry: this.telemetry.getOverlayText(this.overlayMode),
    }
    this.debugRenderer.updateStats(stats)
    this.telemetry.maybeLog(now)

    // Feed NetGraph when in graphs mode
    if (this.overlayMode === 'graphs') {
      this.netGraph.pushSample('rtt', this.telemetry.rttHistory.count > 0 ? this.telemetry.rttHistory.percentile(0.5) : 0)
      this.netGraph.pushSample('correction', this.telemetry.correctionMagnitudeHistory.count > 0 ? this.telemetry.correctionMagnitudeHistory.percentile(0.5) : 0)
      this.netGraph.pushSample('bufferDepth', this.snapshotBuffer.getBufferDepth())
      this.netGraph.reposition(this.gameApp.width, this.gameApp.height)
      this.netGraph.render()
    }

    // Feed replay recorder
    if (this.replayRecorder.isRecording && this.myClientEid >= 0) {
      this.replayRecorder.recordFrame({
        tick: this.world.tick,
        time: now,
        playerX: Position.x[this.myClientEid]!,
        playerY: Position.y[this.myClientEid]!,
        aimAngle: Player.aimAngle[this.myClientEid]!,
        buttons: 0,
        rtt: this.clockSync.isConverged() ? this.clockSync.getRTT() : 0,
        interpDelay: this.snapshotBuffer.getInterpolationDelayMs(),
        correctionMag: this.reconciler.getError().x !== 0 || this.reconciler.getError().y !== 0
          ? Math.sqrt(this.reconciler.getError().x ** 2 + this.reconciler.getError().y ** 2) : 0,
        bufferDepth: this.snapshotBuffer.getBufferDepth(),
      })
    }
  }

  /**
   * Write interpolated snapshot data into ECS arrays.
   * Returns the computed interpolation alpha for renderers.
   */
  private interpolateFromBuffer(interp: InterpolationState): number {
    return this.interpolationApplier.apply(interp, {
      world: this.world,
      playerEntities: this.playerEntities,
      enemyEntities: this.enemyEntities,
      myClientEid: this.myClientEid,
    })
  }

  // ===========================================================================
  // HUD
  // ===========================================================================

  getHUDState(): HUDState {
    const hud = this.latestHud
    const characterId = this.authoritativeCharacterId
    const localState = this.myClientEid >= 0
      ? (this.world.playerUpgradeStates.get(this.myClientEid) ?? this.world.upgradeState)
      : this.world.upgradeState

    // Prefer local cylinder data for instant feedback (prediction), fall back to server HUD
    const hasCylinder = this.myClientEid >= 0 && hasComponent(this.world, Cylinder, this.myClientEid)
    const cylinderRounds = hasCylinder
      ? Cylinder.rounds[this.myClientEid]!
      : (hud?.cylinderRounds ?? 0)
    const cylinderMax = hasCylinder
      ? Cylinder.maxRounds[this.myClientEid]!
      : (hud?.cylinderMax ?? 0)
    const isReloading = hasCylinder
      ? Cylinder.reloading[this.myClientEid]! !== 0
      : (hud?.isReloading ?? false)
    const reloadProgress = hasCylinder && Cylinder.reloadTime[this.myClientEid]! > 0
      ? Cylinder.reloadTimer[this.myClientEid]! / Cylinder.reloadTime[this.myClientEid]!
      : (hud?.reloadProgress ?? 0)

    const hasShowdown = this.myClientEid >= 0 && hasComponent(this.world, Showdown, this.myClientEid)
    const localAbilityHud = deriveAbilityHudState(
      characterId,
      {
        showdownCooldown: localState.showdownCooldown,
        showdownDuration: localState.showdownDuration,
        dynamiteCooldown: localState.dynamiteCooldown,
        dynamiteFuse: localState.dynamiteFuse,
        dynamiteCooking: localState.dynamiteCooking,
        dynamiteCookTimer: localState.dynamiteCookTimer,
      },
      hasShowdown
        ? {
            showdownActive: Showdown.active[this.myClientEid]! === 1,
            showdownCooldown: Showdown.cooldown[this.myClientEid]!,
            showdownDuration: Showdown.duration[this.myClientEid]!,
          }
        : undefined,
    )
    const abilityHud = hud
      ? {
          abilityName: hud.abilityName,
          abilityActive: hud.abilityActive,
          abilityCooldown: hud.abilityCooldown,
          abilityCooldownMax: hud.abilityCooldownMax,
          abilityTimeLeft: hud.abilityTimeLeft,
          abilityDurationMax: hud.abilityDurationMax,
          showdownActive: hud.showdownActive,
          showdownCooldown: hud.showdownCooldown,
          showdownCooldownMax: hud.showdownCooldownMax,
          showdownTimeLeft: hud.showdownTimeLeft,
          showdownDurationMax: hud.showdownDurationMax,
        }
      : localAbilityHud

    const localHp = this.myClientEid >= 0 ? Health.current[this.myClientEid]! : null
    const localMaxHp = this.myClientEid >= 0 ? Health.max[this.myClientEid]! : null
    const minimap = buildMultiplayerMinimapState(
      this.world,
      this.myClientEid >= 0 ? this.myClientEid : null,
      this.playerEntities.values(),
      this.enemyEntities.values(),
      this.latestInteractables,
    )

    return {
      characterId,
      // Prefer authoritative snapshot-applied ECS HP for responsive damage feedback.
      hp: localHp ?? (hud?.hp ?? 0),
      maxHP: localMaxHp ?? (hud?.maxHp ?? PLAYER_HP),
      hpPotions: hud?.hpPotions ?? localState.hpPotionCount,
      hpPotionsMax: hud?.hpPotionsMax ?? HP_POTION_MAX_STACK,
      xp: hud?.xp ?? 0,
      goldCollected: hud?.goldCollected ?? 0,
      killCount: hud?.killCount ?? 0,
      shovelCount: hud?.shovelCount ?? 0,
      interactionPrompt: hud?.interactionPrompt ?? null,
      xpForCurrentLevel: hud?.xpForCurrentLevel ?? 0,
      xpForNextLevel: hud?.xpForNextLevel ?? 0,
      level: hud?.level ?? 0,
      waveNumber: hud?.waveNumber ?? 0,
      totalWaves: hud?.totalWaves ?? 0,
      waveStatus: hud?.waveStatus ?? 'none',
      stageNumber: hud?.stageNumber ?? 0,
      totalStages: hud?.totalStages ?? 0,
      stageStatus: hud?.stageStatus ?? 'none',
      narrativeThreadId: hud?.narrativeThreadId ?? null,
      narrativeThreadName: hud?.narrativeThreadName ?? null,
      campNarrativeLine: hud?.campNarrativeLine ?? null,
      resolutionText: hud?.resolutionText ?? null,
      runIntroTitle: hud?.runIntroTitle ?? null,
      runIntroText: hud?.runIntroText ?? null,
      runIntroSequence: hud?.runIntroSequence ?? 0,
      cylinderRounds,
      cylinderMax,
      isReloading,
      reloadProgress,
      showCylinder: hasCylinder || (hud?.showCylinder ?? false),
      ...abilityHud,
      pendingPoints: hud?.pendingPoints ?? 0,
      isDead: this.myClientEid >= 0 && hasComponent(this.world, Dead, this.myClientEid),
      interactionFeedbackDescription: hud?.interactionFeedbackDescription ?? null,
      items: hud?.items ?? [],
      hasFoolsErrand: hud?.hasFoolsErrand ?? false,
      minimap,
      objective: hud?.objective ?? null,
      campVisitor: hud?.campVisitor ?? null,
      draft: hud?.draft ?? null,
      boss: hud?.boss ?? null,
      drawDuel: null, // Draw duel not yet supported in multiplayer
    }
  }

  consumePendingBossIntro(): { bossName: string; taunt: string } | null {
    return this.gameplayEventProcessor.consumePendingBossIntro()
  }

  hasPendingPoints(): boolean {
    return (this.latestHud?.pendingPoints ?? 0) > 0
  }

  getSkillTreeData(): SkillTreeUIData | null {
    if (!this.upgradeStateCache) return null
    const state = this.upgradeStateCache
    return {
      branches: state.characterDef.branches.map(branch => ({
        id: branch.id,
        name: branch.name,
        description: branch.description,
        nodes: branch.nodes.map(node => {
          let nodeState: SkillNodeState
          if (state.nodesTaken.has(node.id)) nodeState = 'taken'
          else if (!node.implemented) nodeState = 'unimplemented'
          else if (canTakeNode(state, node.id)) nodeState = 'available'
          else nodeState = 'locked'
          return { id: node.id, name: node.name, description: node.description, tier: node.tier, state: nodeState }
        }),
      })),
      pendingPoints: state.pendingPoints,
      level: state.level,
    }
  }

  selectNode(nodeId: string): boolean {
    if (this.pendingNodeSelection) return false
    if (!this.upgradeStateCache || !canTakeNode(this.upgradeStateCache, nodeId)) return false
    this.pendingNodeSelection = true
    this.net.sendSelectNode(nodeId)
    // Optimistic update for responsive UI (rolled back if server rejects)
    this.upgradeStateCache.nodesTaken.add(nodeId)
    this.upgradeStateCache.pendingPoints = Math.max(0, this.upgradeStateCache.pendingPoints - 1)
    this.sound.play('upgrade_select')
    return true
  }

  completeCamp(): void {
    this.net.sendCampReady(true)
  }

  handleVisitorPurchase(offerIndex: number): boolean {
    this.net.sendCampPurchase(offerIndex)
    return true // optimistic; server will confirm via HUD update
  }

  handleTinkererModSelect(offerIndex: number): boolean {
    this.net.sendTinkererModSelect(offerIndex)
    return true // optimistic; server will confirm via HUD update
  }

  handleDraftPick(poolIndex: number): boolean {
    this.net.sendDraftPick(poolIndex)
    return true
  }

  setWorldVisible(visible: boolean): void {
    this.gameApp.world.visible = visible
  }

  // ===========================================================================
  // Netcode Observability
  // ===========================================================================

  private cycleNetOverlay(): void {
    const modes: OverlayMode[] = ['off', 'summary', 'detailed', 'graphs']
    const idx = modes.indexOf(this.overlayMode)
    this.overlayMode = modes[(idx + 1) % modes.length]!
    if (this.overlayMode === 'graphs') {
      this.netGraph.show()
    } else {
      this.netGraph.hide()
    }
    console.log(`[MP] Net overlay: ${this.overlayMode}`)
  }

  private recordLagReport(): void {
    const report: LagReport = {
      tick: this.world.tick,
      time: performance.now(),
      rttMs: this.clockSync.isConverged() ? this.clockSync.getRTT() : 0,
      correctionMagnitude: this.telemetry.correctionMagnitudeHistory.count > 0
        ? this.telemetry.correctionMagnitudeHistory.percentile(0.5) : 0,
      bufferDepth: this.snapshotBuffer.getBufferDepth(),
      interpAlpha: this.snapshotBuffer.getLastAlpha(),
      recentCorrections: [],
    }
    this.lagReports.push(report)
    if (this.replayRecorder.isRecording) {
      this.replayRecorder.addLagReport(report)
    }
    console.log('[MP] Lag report captured:', report)
  }

  private exportReplay(): void {
    if (!this.replayRecorder.isRecording) {
      console.log('[MP] No replay recording active')
      return
    }
    const summary = this.shotTraceBuffer.getSummary()
    const data = this.replayRecorder.stop({
      shotTraces: this.shotTraceBuffer.getCompletedTraces(),
      hitAgreement: this.hitAgreement.getStats(),
      shotSummary: summary,
      rttP50: this.telemetry.rttHistory.percentile(0.5),
      rttP95: this.telemetry.rttHistory.percentile(0.95),
      correctionP50: this.telemetry.correctionMagnitudeHistory.percentile(0.5),
      correctionP95: this.telemetry.correctionMagnitudeHistory.percentile(0.95),
    })
    const json = JSON.stringify(data, (_key, val) =>
      typeof val === 'number' ? +val.toFixed(2) : val,
    )
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `replay-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    console.log(`[MP] Replay exported (${data.frames.length} frames)`)

    // Start a new recording
    this.replayRecorder.start(this.world.initialSeed, this.authoritativeCharacterId)
  }

  private onStateHash(serverTick: number, serverHash: number): void {
    const clientHash = this.stateHashHistory.get(serverTick)
    if (clientHash === undefined) return // No client hash for that tick yet
    if (clientHash !== serverHash) {
      this.telemetry.recordDesync()
      if (this.replayRecorder.isRecording) {
        this.replayRecorder.addDesyncEvent(serverTick, clientHash, serverHash)
      }
      console.error(
        `[MP][DESYNC] tick=${serverTick} client=0x${clientHash.toString(16)} server=0x${serverHash.toString(16)}`,
      )
    }
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  destroy(): void {
    this.predictedEntityTracker.clear(this.world)

    this.pendingSnapshots.length = 0
    this.pendingBulletSpawns.length = 0
    this.pendingBulletDespawns.length = 0
    this.pendingShotResults.length = 0
    this.pendingVisualShots.length = 0
    this.remoteBulletSpawnTickByClientEid.clear()
    this.gameplayEvents.clear()
    this.inputBuffer.clear()
    this.snapshotIngestor.resetSessionState()
    this.clockSync.stop()
    this.net.disconnect()
    this.sound.destroy()
    this.ambient.destroy()
    this.particles.destroy()
    this.floatingText.destroy()
    this.deathPresentation.destroy()
    this.lightingSystem.destroy()
    this.input.destroy()
    window.removeEventListener('keydown', this.handleKeyDown)
    this.netGraph.destroy()
    this.debugRenderer.destroy()
    this.tilemapRenderer.destroy()
    this.interactableRenderer.destroy()
    this.playerRenderer.destroy()
    this.npcRenderer.destroy()
    this.objectiveRenderer.destroy()
    this.chatBubblePool.destroy()
    this.enemyRenderer.destroy()
    this.lastRitesRenderer.destroy()
    this.dynamiteRenderer.destroy()
    this.groundCrackRenderer.destroy()
    this.bossShockwaveRenderer.destroy()
    this.bossAttackRenderer.destroy()
    this.showdownRenderer.destroy()
    this.pingRenderer.destroy()
    this.trapZoneRenderer.destroy()
    this.mapObstacleRenderer.destroy()
    this.dustStormEffect.destroy()
    this.tumbleweedRenderer.destroy()
    this.collisionDebugRenderer.destroy()
    this.bulletRenderer.destroy()
    this.spriteRegistry.destroy()
  }
}
