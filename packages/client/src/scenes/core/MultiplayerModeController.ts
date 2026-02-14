/**
 * Multiplayer mode controller.
 *
 * Runs client prediction, reconciliation, and interpolation while keeping
 * the server authoritative.
 */

import { hasComponent } from 'bitecs'
import {
  createGameWorld,
  generateArena,
  setWorldTilemap,
  getPlayableBoundsFromTilemap,
  getArenaCenterFromTilemap,
  Position,
  Velocity,
  Player,
  Health,
  Dead,
  Cylinder,
  Showdown,
  Button,
  NO_TARGET,
  TICK_S,
  PLAYER_HP,
  createSystemRegistry,
  registerPredictionSystems,
  registerReplaySystems,
  spatialHashSystem,
  getCharacterDef,
  initUpgradeState,
  canTakeNode,
  deriveAbilityHudState,
  type UpgradeState,
  type SelectNodeResponse,
  type SystemRegistry,
  DEFAULT_RUN_STAGES,
  type Tilemap,
  type GameWorld,
  type InputState,
  type NetworkInput,
  type WorldSnapshot,
  type HudData,
  type CharacterId,
  type PlayerRosterEntry,
} from '@high-noon/shared'
import { SoundManager } from '../../audio/SoundManager'
import { SOUND_DEFS } from '../../audio/sounds'
import type { GameApp } from '../../engine/GameApp'
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
import { TilemapRenderer } from '../../render/TilemapRenderer'
import { ParticlePool, FloatingTextPool, ChatBubblePool } from '../../fx'
import { NpcRenderer } from '../../render/NpcRenderer'
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
import { MultiplayerTelemetry } from './MultiplayerTelemetry'
import { syncRenderersAndQueueEvents } from './syncRenderersAndQueueEvents'
import type { SceneModeController } from './SceneModeController'
import { DeathSequencePresentation } from './DeathSequencePresentation'
import { MULTIPLAYER_PRESENTATION_POLICY } from './PresentationPolicy'
import { createSceneDebugHotkeyHandler } from './SceneDebugHotkeys'
import {
  emitCylinderPresentationEvents,
  emitDynamiteCueEvents,
  emitLastRitesCueEvents,
  emitMeleeSwingEvents,
  emitShowdownCueEvents,
} from './PlayerPresentationEvents'
import { seedHazardLights } from './SceneLighting'
import { refreshTilemap } from './refreshTilemap'

const GAME_ZOOM = 2

/** Misprediction smoothing constants */
const SNAP_THRESHOLD = 96    // pixels — teleport if error exceeds this
const EPSILON = 0.5           // pixels — ignore sub-pixel mispredictions
const CORRECTION_SPEED = 15   // exponential decay rate for visual smoothing
const MAX_PENDING_SNAPSHOTS = 6
const MAX_SNAPSHOT_APPLIES_PER_UPDATE = 4

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
  private readonly showdownRenderer: ShowdownRenderer
  private readonly lastRitesRenderer: LastRitesRenderer
  private readonly dynamiteRenderer: DynamiteRenderer
  private readonly lightingSystem: LightingSystem
  private readonly tilemapRenderer: TilemapRenderer
  private currentTilemap: Tilemap | null = null
  private readonly particles: ParticlePool
  private readonly floatingText: FloatingTextPool
  private readonly chatBubblePool: ChatBubblePool
  private readonly sound: SoundManager
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
  /** Last known stage number for detecting stage transitions */
  private lastStageNumber = 1

  /** Authoritative snapshots waiting to be applied on fixed ticks */
  private readonly pendingSnapshots: WorldSnapshot[] = []

  /** Dry fire debounce cooldown (seconds) */
  private dryFireCooldown = 0

  /** Disconnect flag for UX overlay */
  private disconnected = false

  /** Monotonic tick for local player animation (decoupled from snapshot tick) */
  private predictionTick = 0

  /** Local upgrade state cache for skill tree UI */
  private upgradeStateCache: UpgradeState | null = null

  /** True while a select-node RPC is in-flight (prevents rapid clicks and HUD overwrite) */
  private pendingNodeSelection = false

  /** Track level for level-up event detection */
  private lastProcessedLevel = 0

  private lastRenderTime: number

  constructor(gameApp: GameApp, selectedCharacterId: CharacterId = 'sheriff') {
    this.gameApp = gameApp
    this.selectedCharacterId = selectedCharacterId
    this.authoritativeCharacterId = selectedCharacterId
    this.input = new Input()

    // Shadow world — local player is predicted, remote entities populated from snapshots
    this.world = createGameWorld(0, getCharacterDef(selectedCharacterId))
    const stage0Config = DEFAULT_RUN_STAGES[0]!.mapConfig
    const tilemap = generateArena(stage0Config, this.world.initialSeed, 0)
    setWorldTilemap(this.world, tilemap)

    // Renderers
    this.tilemapRenderer = new TilemapRenderer(this.gameApp.layers.background)
    this.tilemapRenderer.render(tilemap)
    this.lightingSystem = new LightingSystem(this.gameApp.app.renderer, this.gameApp.width, this.gameApp.height)
    const uiIndex = this.gameApp.stage.getChildIndex(this.gameApp.layers.ui)
    this.gameApp.stage.addChildAt(this.lightingSystem.getLightmapSprite(), uiIndex)
    seedHazardLights(this.lightingSystem, tilemap)
    this.currentTilemap = tilemap

    this.debugRenderer = new DebugRenderer(this.gameApp.layers.ui)
    this.spriteRegistry = new SpriteRegistry(this.gameApp.layers.entities)
    this.lastRitesRenderer = new LastRitesRenderer(this.gameApp.layers.entities)
    this.dynamiteRenderer = new DynamiteRenderer(this.gameApp.layers.entities)
    this.playerRenderer = new PlayerRenderer(this.gameApp.layers.entities)
    this.bulletRenderer = new BulletRenderer(this.spriteRegistry)
    this.enemyRenderer = new EnemyRenderer(this.spriteRegistry, this.debugRenderer)
    this.npcRenderer = new NpcRenderer(this.spriteRegistry)
    this.showdownRenderer = new ShowdownRenderer(this.gameApp.layers.entities)

    // Debug graphics in entity layer (world space)
    this.gameApp.layers.entities.addChild(this.debugRenderer.getContainer())

    // Zoom
    this.gameApp.world.scale.set(GAME_ZOOM)

    // Camera
    this.camera = new Camera()
    this.camera.setViewport(this.gameApp.width / GAME_ZOOM, this.gameApp.height / GAME_ZOOM)
    const bounds = getPlayableBoundsFromTilemap(tilemap)
    this.camera.setBounds(bounds)
    const { x: centerX, y: centerY } = getArenaCenterFromTilemap(tilemap)
    this.camera.snapTo(centerX, centerY)
    this.renderPause = new HitStop()

    // Particles
    this.particles = new ParticlePool(this.gameApp.layers.fx)
    this.floatingText = new FloatingTextPool(this.gameApp.layers.fx)
    this.chatBubblePool = new ChatBubblePool(this.gameApp.layers.entities)

    // Sound
    this.sound = new SoundManager()
    this.sound.loadAll(SOUND_DEFS)

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
      },
    )
    window.addEventListener('keydown', this.handleKeyDown)

    this.lastRenderTime = performance.now()
  }

  isDisconnected(): boolean { return this.disconnected }

  /** Connect to server — resolves once game-config is received */
  async initialize(options?: Record<string, unknown>): Promise<void> {
    const initOptions = (options ?? {}) as MultiplayerInitializeOptions
    if (initOptions.net) {
      this.net = initOptions.net
    }

    this.net.on('disconnect', () => {
      this.connected = false
      this.disconnected = true
      this.latestHud = null
      this.pendingSnapshots.length = 0
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
          const newMap = generateArena(stageConfig.mapConfig, this.world.initialSeed, stageIndex)
          this.world.tilemap = newMap
          this.world.flowField = null
          this.world.spatialHash = null
          this.world.floorSpeedMul.clear()
          this.currentTilemap = newMap
          refreshTilemap(newMap, this.tilemapRenderer, this.camera, this.lightingSystem)
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

    this.net.on('pong', (clientTime, serverTime) => {
      this.clockSync.onPong(clientTime, serverTime)
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
      this.telemetry.onSnapshotReceived(this.pendingSnapshots.length > 0)
      if (this.pendingSnapshots.length >= MAX_PENDING_SNAPSHOTS) {
        this.pendingSnapshots.shift()
        this.telemetry.onSnapshotDropped()
      }
      this.pendingSnapshots.push(snapshot)
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
      const newMap = generateArena(stage0Config, config.seed, 0)
      this.world.tilemap = newMap
      this.world.flowField = null
      this.world.spatialHash = null
      this.world.floorSpeedMul.clear()
      this.currentTilemap = newMap
      refreshTilemap(newMap, this.tilemapRenderer, this.camera, this.lightingSystem)
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
    console.log(`[MP] Connected — server playerEid=${config.playerEid}, character=${config.characterId}`)
    this.clockSync.stop()
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

      // Reconcile local player prediction against server authority
      if (this.myClientEid >= 0) {
        this.reconcileLocalPlayer(snapshot)
      }

      this.snapshotBuffer.push(snapshot)
      processed++
    }
  }

  // ===========================================================================
  // Entity Lifecycle — sync ECS shadow world with snapshot data
  // ===========================================================================

  private applyEntityLifecycle(snapshot: WorldSnapshot): void {
    const ingestStats = this.snapshotIngestor.applyEntityLifecycle(
      snapshot,
      {
        world: this.world,
        tracker: this.predictedEntityTracker,
        playerEntities: this.playerEntities,
        bulletEntities: this.bulletEntities,
        enemyEntities: this.enemyEntities,
        myServerEid: this.myServerEid,
        myClientEid: this.myClientEid,
        localCharacterId: this.authoritativeCharacterId,
        resolveCharacterIdForServerEid: (serverEid) => this.serverCharacterIds.get(serverEid),
        setMyClientEid: (eid) => { this.myClientEid = eid },
        setLocalPlayerRenderEid: (eid) => { this.playerRenderer.localPlayerEid = eid },
        resolveRttMs: () => this.clockSync.isConverged() ? this.clockSync.getRTT() : 0,
      },
      this.predictionTick,
    )
    this.telemetry.onPredictedBulletsMatched(ingestStats.matchedPredictedBullets)
    this.telemetry.onPredictedBulletsTimedOut(ingestStats.timedOutPredictedBullets)
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
      SNAP_THRESHOLD,
    )
    if (sample.hadCorrection) {
      this.telemetry.onReconciliationCorrection(sample.snapped)
    }
  }

  // ===========================================================================
  // Update (60Hz) — capture + send input
  // ===========================================================================

  update(_dt: number): void {
    if (!this.connected) return

    // Apply pending authoritative snapshots on the fixed tick (bounded catch-up).
    this.processPendingSnapshots()
    this.prepareSimulationStateFromLatestSnapshot()
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

    if (this.myClientEid < 0) return
    const error = this.reconciler.getError()

    // Set input reference position from predicted position (immediate)
    this.input.setReferencePosition(
      Position.x[this.myClientEid]!,
      Position.y[this.myClientEid]!,
    )

    // Set camera for screen→world conversion
    const camPos = this.camera.getPosition()
    this.input.setCamera(camPos.x, camPos.y, this.gameApp.width, this.gameApp.height, GAME_ZOOM)

    // Collect and tag input
    const inputState: InputState = this.input.getInputState()
    const wantsShoot = (inputState.buttons & Button.SHOOT) !== 0
    if (wantsShoot && !this.shootWasDown) {
      this.shootSeq++
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
        fireTrauma: 0.15,
        fireKickStrength: 5,
      })
    }
    emitMeleeSwingEvents(this.gameplayEvents, this.world, this.myClientEid)

    emitShowdownCueEvents(this.gameplayEvents, this.world)
    emitLastRitesCueEvents(this.gameplayEvents, this.world)
    emitDynamiteCueEvents(this.gameplayEvents, this.world, this.myClientEid >= 0 ? this.myClientEid : null)

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
  }

  // ===========================================================================
  // Render (variable Hz) — interpolate snapshots + draw
  // ===========================================================================

  render(_loopAlpha: number, fps: number): void {
    const now = performance.now()
    const rawDt = (now - this.lastRenderTime) / 1000
    const realDt = Math.min(rawDt, 0.25)
    this.lastRenderTime = now
    if (this.renderPause.update(realDt) === 0) return

    // Interpolate snapshot data into ECS arrays
    const interpState = this.snapshotBuffer.getInterpolationState(
      this.clockSync.isConverged() ? this.clockSync.getServerTime() : undefined
    )
    const alpha = interpState ? this.interpolateFromBuffer(interpState) : 0.5

    // Decay misprediction error (frame-rate independent).
    this.reconciler.decayError(rawDt, CORRECTION_SPEED)
    const error = this.reconciler.getError()

    // Feed monotonic prediction tick to player renderer for local player animation
    this.playerRenderer.localPlayerTick = this.predictionTick

    syncRenderersAndQueueEvents({
      world: this.world,
      playerRenderer: this.playerRenderer,
      enemyRenderer: this.enemyRenderer,
      bulletRenderer: this.bulletRenderer,
      events: this.gameplayEvents,
      npcRenderer: this.npcRenderer,
      chatBubblePool: this.chatBubblePool,
    })
    this.gameplayEventProcessor.processAll(this.gameplayEvents.drain())

    // Update camera viewport (handles resize)
    this.camera.setViewport(this.gameApp.width / GAME_ZOOM, this.gameApp.height / GAME_ZOOM)

    // Get camera render state using game loop alpha (matches single-player pattern —
    // camera.update() runs at 60Hz in update(), getRenderState interpolates for sub-frame smoothness)
    const camState = this.camera.getRenderState(_loopAlpha, realDt)

    // Apply camera transform to world container
    const halfW = this.gameApp.width / 2
    const halfH = this.gameApp.height / 2
    this.gameApp.world.pivot.set(camState.x, camState.y)
    this.gameApp.world.position.set(halfW, halfH)
    this.gameApp.world.rotation = camState.angle

    this.lightingSystem.updateLights(realDt)
    this.lightingSystem.resize(this.gameApp.width, this.gameApp.height)
    this.lightingSystem.render(camState.x, camState.y, GAME_ZOOM)

    // Clear debug
    this.debugRenderer.clear()

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

    if (this.myClientEid >= 0 && (error.x !== 0 || error.y !== 0)) {
      this.bulletRenderer.renderWithLocalOffset(
        this.world,
        alpha,
        this.predictedEntityTracker.getLocalTimelineBullets(),
        error.x,
        error.y,
      )
    } else {
      this.bulletRenderer.render(this.world, alpha)
    }
    this.enemyRenderer.render(this.world, alpha, realDt)
    this.npcRenderer.render(this.world, alpha)
    this.dynamiteRenderer.render(this.world, realDt, this.particles)
    this.showdownRenderer.render(this.world, this.playerEntities.values(), alpha, realDt)
    this.lastRitesRenderer.render(this.world, alpha, realDt)

    // Update particles
    this.particles.update(realDt)
    this.floatingText.update(realDt)
    this.chatBubblePool.update(realDt, this.world)

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
      netTelemetry: this.telemetry.getOverlayText(),
    }
    this.debugRenderer.updateStats(stats)
    this.telemetry.maybeLog(now)
  }

  /**
   * Write interpolated snapshot data into ECS arrays.
   * Returns the computed interpolation alpha for renderers.
   */
  private interpolateFromBuffer(interp: InterpolationState): number {
    return this.interpolationApplier.apply(interp, {
      world: this.world,
      playerEntities: this.playerEntities,
      bulletEntities: this.bulletEntities,
      enemyEntities: this.enemyEntities,
      myClientEid: this.myClientEid,
      localTimelineBullets: this.predictedEntityTracker.getLocalTimelineBullets(),
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

    return {
      characterId,
      // Prefer authoritative snapshot-applied ECS HP for responsive damage feedback.
      hp: localHp ?? (hud?.hp ?? 0),
      maxHP: localMaxHp ?? (hud?.maxHp ?? PLAYER_HP),
      xp: hud?.xp ?? 0,
      xpForCurrentLevel: hud?.xpForCurrentLevel ?? 0,
      xpForNextLevel: hud?.xpForNextLevel ?? 0,
      level: hud?.level ?? 0,
      waveNumber: hud?.waveNumber ?? 0,
      totalWaves: hud?.totalWaves ?? 0,
      waveStatus: hud?.waveStatus ?? 'none',
      stageNumber: hud?.stageNumber ?? 0,
      totalStages: hud?.totalStages ?? 0,
      stageStatus: hud?.stageStatus ?? 'none',
      cylinderRounds,
      cylinderMax,
      isReloading,
      reloadProgress,
      showCylinder: hasCylinder || (hud?.showCylinder ?? false),
      ...abilityHud,
      pendingPoints: hud?.pendingPoints ?? 0,
      isDead: this.myClientEid >= 0 && hasComponent(this.world, Dead, this.myClientEid),
    }
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

  setWorldVisible(visible: boolean): void {
    this.gameApp.world.visible = visible
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  destroy(): void {
    this.predictedEntityTracker.clear(this.world)

    this.pendingSnapshots.length = 0
    this.gameplayEvents.clear()
    this.inputBuffer.clear()
    this.clockSync.stop()
    this.net.disconnect()
    this.sound.destroy()
    this.particles.destroy()
    this.floatingText.destroy()
    this.deathPresentation.destroy()
    this.lightingSystem.destroy()
    this.input.destroy()
    window.removeEventListener('keydown', this.handleKeyDown)
    this.debugRenderer.destroy()
    this.tilemapRenderer.destroy()
    this.playerRenderer.destroy()
    this.npcRenderer.destroy()
    this.chatBubblePool.destroy()
    this.enemyRenderer.destroy()
    this.lastRitesRenderer.destroy()
    this.dynamiteRenderer.destroy()
    this.showdownRenderer.destroy()
    this.bulletRenderer.destroy()
    this.spriteRegistry.destroy()
  }
}
