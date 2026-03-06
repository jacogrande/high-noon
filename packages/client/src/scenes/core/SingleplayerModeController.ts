/**
 * Singleplayer mode controller.
 *
 * Owns single-player simulation, progression, and rendering behavior for
 * CoreGameScene.
 */

import {
  createGameWorld,
  createSystemRegistry,
  spawnPlayer,
  setWorldTilemap,
  startRun,
  generateMap,
  getPlayableBoundsFromTilemap,
  getArenaCenterFromTilemap,
  DEFAULT_RUN_STAGES,
  registerAllSystems,
  writeStatsToECS,
  canTakeNode,
  takeNode,
  Player,
  Position,
  Velocity,
  PlayerState,
  PlayerStateType,
  Health,
  Dead,
  Enemy,
  EnemyAI,
  AIState,
  Cylinder,
  Showdown,
  NO_TARGET,
  Bullet,
  BossPhase,
  EnemyType,
  getBoss,
  CHARACTER_RECOIL,
  type GameWorld,
  type SystemRegistry,
  type Tilemap,
  LEVEL_THRESHOLDS,
  MAX_LEVEL,
  getShovelPrice,
  type InteractablesData,
  getCharacterDef,
  deriveAbilityHudState,
  getItemDef,
  getVisitorDef,
  getThread,
  tryVisitorPurchase,
  tryTinkererModSelect,
  getWeaponModDef,
  type CharacterId,
  HP_POTION_MAX_STACK,
  getBulletConfigForCharacter,
  FOOLS_ERRAND_ID,
  MapObstacleType,
  isWoodObstacle,
  type OldScratchState,
  OLD_SCRATCH_STAREDOWN_ROUND_1,
  OLD_SCRATCH_STAREDOWN_ROUND_2,
  OLD_SCRATCH_STAREDOWN_ROUND_3_PLUS,
  OLD_SCRATCH_PERFECT_DRAW_WINDOW,
  OLD_SCRATCH_GOOD_DRAW_WINDOW,
} from '@high-noon/shared'
import { defineQuery, hasComponent } from 'bitecs'
import { INTERNAL_WIDTH, INTERNAL_HEIGHT, WORLD_SCALE, type GameApp } from '../../engine/GameApp'
import { Input } from '../../engine/Input'
import { Camera } from '../../engine/Camera'
import { HitStop } from '../../engine/HitStop'
import { type DebugStats } from '../../render/DebugRenderer'
import { RendererBundle } from '../../render/RendererBundle'
import { DrawFlashOverlay } from '../../render/DrawFlashOverlay'
import { LetterboxOverlay } from '../../render/LetterboxOverlay'
import { LightingSystem, createMuzzleFlashLight } from '../../lighting'
import { SoundManager } from '../../audio/SoundManager'
import { SOUND_DEFS } from '../../audio/sounds'
import { AmbientManager } from '../../audio/AmbientManager'
import { ParticlePool, FloatingTextPool, ChatBubblePool, KillStreakTracker, emitMovementDust, emitRollDust, emitWoodSplinters, emitRockDebris, emitObstacleHit, emitHellfireSparks, emitGhostTrail, emitDustSwirl } from '../../fx'
import { TimeScale } from '../../engine/TimeScale'
import { GameplayEventBuffer } from './GameplayEvents'
import { GameplayEventProcessor } from './GameplayEventProcessor'
import { FullWorldSimulationDriver } from './SimulationDriver'
import {
  didFireRound,
  didTakeDamageFromIframes,
} from './feedbackSignals'
import { syncRenderersAndQueueEvents } from './syncRenderersAndQueueEvents'
import type { SceneModeController } from './SceneModeController'
import { DeathSequencePresentation } from './DeathSequencePresentation'
import { SINGLEPLAYER_PRESENTATION_POLICY } from './PresentationPolicy'
import { createSceneDebugHotkeyHandler } from './SceneDebugHotkeys'
import {
  emitBossIntroEvents,
  emitBossPhaseTransitionEvents,
  emitCylinderPresentationEvents,
  emitDynamiteCueEvents,
  emitLastRitesCueEvents,
  emitMeleeSwingEvents,
  emitPlayerHitEvent,
  emitShowdownCueEvents,
  emitTrapDetonationEvents,
} from './PlayerPresentationEvents'
import type { HUDState, SkillNodeState, SkillTreeUIData } from '../types'
import { seedHazardLights } from './SceneLighting'
import { refreshTilemap } from './refreshTilemap'
import { buildSingleplayerMinimapState } from './minimap'

const MAX_PENDING_VISUAL_SHOTS = 256

// Render-loop particle emission intervals (seconds)
const MOVEMENT_DUST_MIN_SPEED = 50
const MOVEMENT_DUST_INTERVAL = 0.06
const HELLFIRE_SPARK_INTERVAL = 0.08
const GHOST_TRAIL_INTERVAL = 0.1
const GHOST_TRAIL_MIN_SPEED_SQ = 100
const DUST_SWIRL_INTERVAL = 0.15
const FOOTSTEP_INTERVAL = 0.15

// Per-phase camera zoom targets
const BOSS_PHASE_ZOOM: Record<number, number> = { 1: 1.0, 2: 0.9, 3: 0.8 }
const BOSS_STAREDOWN_ZOOM_MAX = 1.3
const BOSS_FLASH_ZOOM = 1.5

const enemyAIQuery = defineQuery([Enemy, EnemyAI])
const bulletCountQuery = defineQuery([Bullet])
const bossQuery = defineQuery([Enemy, BossPhase, Health])

function getStaredownDuration(round: number): number {
  if (round <= 1) return OLD_SCRATCH_STAREDOWN_ROUND_1
  if (round === 2) return OLD_SCRATCH_STAREDOWN_ROUND_2
  return OLD_SCRATCH_STAREDOWN_ROUND_3_PLUS
}

const STATE_LABELS: Record<number, string> = {
  [AIState.IDLE]: 'IDL',
  [AIState.CHASE]: 'CHS',
  [AIState.TELEGRAPH]: 'TEL',
  [AIState.ATTACK]: 'ATK',
  [AIState.RECOVERY]: 'REC',
  [AIState.STUNNED]: 'STN',
  [AIState.FLEE]: 'FLE',
}

const PLAYER_STATE_NAMES: Record<number, string> = {
  [PlayerStateType.IDLE]: 'idle',
  [PlayerStateType.MOVING]: 'moving',
  [PlayerStateType.ROLLING]: 'rolling',
}

export class SingleplayerModeController implements SceneModeController {
  private readonly gameApp: GameApp
  private readonly input: Input
  private readonly camera: Camera
  private readonly hitStop: HitStop
  private readonly world: GameWorld
  private readonly systems: SystemRegistry
  private readonly simulationDriver: FullWorldSimulationDriver
  private readonly tilemap: Tilemap
  private readonly renderers: RendererBundle
  private readonly lightingSystem: LightingSystem
  private currentTilemap: Tilemap | null = null
  private readonly sound: SoundManager
  private readonly ambient: AmbientManager
  private readonly particles: ParticlePool
  private readonly floatingText: FloatingTextPool
  private readonly chatBubblePool: ChatBubblePool
  private readonly gameplayEvents: GameplayEventBuffer
  private readonly gameplayEventProcessor: GameplayEventProcessor
  private readonly deathPresentation: DeathSequencePresentation
  private readonly pendingVisualShots: number[] = []
  private lastRenderTime: number
  private readonly handleKeyDown: (e: KeyboardEvent) => void
  private readonly timeScale: TimeScale
  private readonly killStreakTracker: KillStreakTracker
  private lastProcessedLevel = 0
  private dryFireCooldown = 0
  private paused = false
  private dustAccumulator = 0
  private footstepAccumulator = 0
  private wasRolling = false
  private readonly drawFlashOverlay: DrawFlashOverlay
  private readonly letterboxOverlay: LetterboxOverlay
  private lastDrawPhase: string | null = null
  private lastDrawResolved = false
  private lastBossAlive = false
  private lastBossX = 0
  private lastBossY = 0
  private lastBossPhase = 0
  private dustSwirlAccumulator = 0
  private hellfireSparkAccumulator = 0
  private ghostTrailAccumulator = 0
  private lastWaveActive = false
  private lastGold = 0
  private wasDead = false
  // HUD sub-object caches to reduce allocation in getHUDState()
  private cachedItems: HUDState['items'] = []
  private lastItemsHash = 0
  private cachedBoss: HUDState['boss'] = null
  private lastBossHP = -1
  private cachedCampVisitor: HUDState['campVisitor'] = null
  private lastCampVisitorId = -1
  private lastCampVisitorSoldMask = 0

  constructor(gameApp: GameApp, characterId: CharacterId = 'sheriff') {
    this.gameApp = gameApp

    // Input
    this.input = new Input()

    // ECS world + systems
    this.world = createGameWorld(undefined, getCharacterDef(characterId))
    this.world.playerFireMode = 'hitscan'

    // Generate first stage's tilemap from the run config
    const stage0Config = DEFAULT_RUN_STAGES[0]!.mapConfig
    this.tilemap = generateMap(stage0Config, this.world.initialSeed, 0)
    setWorldTilemap(this.world, this.tilemap)
    this.systems = createSystemRegistry()

    // Register simulation systems in canonical order
    registerAllSystems(this.systems)
    this.simulationDriver = new FullWorldSimulationDriver(this.world, this.systems)

    // Renderers (shared bundle + mode-specific overlays)
    this.renderers = new RendererBundle(this.gameApp.layers)
    this.renderers.tilemapRenderer.render(this.tilemap)
    // Insert building roof overlay above entities so roofs render over players
    const entitiesIdx = this.gameApp.world.getChildIndex(this.gameApp.layers.entities)
    this.gameApp.world.addChildAt(this.renderers.tilemapRenderer.getRoofContainer(), entitiesIdx + 1)
    this.lightingSystem = new LightingSystem(this.gameApp.app.renderer, INTERNAL_WIDTH, INTERNAL_HEIGHT)
    // Lightmap composites in RT space (overlay, above worldContainer)
    this.gameApp.overlay.addChild(this.lightingSystem.getLightmapSprite())
    seedHazardLights(this.lightingSystem, this.tilemap)
    this.currentTilemap = this.tilemap

    this.drawFlashOverlay = new DrawFlashOverlay(
      this.gameApp.layers.ui,
      () => this.gameApp.width,
      () => this.gameApp.height,
    )
    this.letterboxOverlay = new LetterboxOverlay(
      this.gameApp.layers.ui,
      () => this.gameApp.width,
      () => this.gameApp.height,
    )

    // Debug graphics in entity layer (world space)
    this.gameApp.layers.entities.addChild(this.renderers.debugRenderer.getContainer())

    // Spawn player at arena center
    const { x: centerX, y: centerY } = getArenaCenterFromTilemap(this.tilemap)
    spawnPlayer(this.world, centerX, centerY)

    // Start the multi-stage run
    startRun(this.world, DEFAULT_RUN_STAGES)

    this.renderers.playerRenderer.sync(this.world)

    // Camera — viewport in world units (RT size / world scale)
    this.camera = new Camera()
    this.camera.setViewport(INTERNAL_WIDTH / WORLD_SCALE, INTERNAL_HEIGHT / WORLD_SCALE)
    const bounds = getPlayableBoundsFromTilemap(this.tilemap)
    const pad = this.tilemap.tileSize
    this.camera.setBounds({
      minX: bounds.minX - pad,
      minY: bounds.minY - pad,
      maxX: bounds.maxX + pad,
      maxY: bounds.maxY + pad,
    })
    this.camera.snapTo(centerX, centerY)

    // Hit stop
    this.hitStop = new HitStop()

    // Audio
    this.sound = new SoundManager()
    this.sound.loadAll(SOUND_DEFS)
    this.ambient = new AmbientManager()

    // Particles
    this.particles = new ParticlePool(this.gameApp.layers.fx)
    this.floatingText = new FloatingTextPool(this.gameApp.layers.ui)
    this.chatBubblePool = new ChatBubblePool(this.gameApp.layers.ui)
    this.timeScale = new TimeScale()
    this.killStreakTracker = new KillStreakTracker()
    this.gameplayEvents = new GameplayEventBuffer()
    this.gameplayEventProcessor = new GameplayEventProcessor({
      camera: this.camera,
      sound: this.sound,
      particles: this.particles,
      floatingText: this.floatingText,
      playerRenderer: this.renderers.playerRenderer,
      hitStop: this.hitStop,
      spawnMuzzleLight: (x, y) => this.lightingSystem.addLight(createMuzzleFlashLight(x, y)),
      killStreakTracker: this.killStreakTracker,
      timeScale: this.timeScale,
      drawFlashOverlay: this.drawFlashOverlay,
    })

    this.lastRenderTime = performance.now()

    this.deathPresentation = new DeathSequencePresentation(
      this.gameApp.layers.ui,
      () => ({ width: this.gameApp.width, height: this.gameApp.height }),
      SINGLEPLAYER_PRESENTATION_POLICY.death,
    )

    this.handleKeyDown = createSceneDebugHotkeyHandler(
      SINGLEPLAYER_PRESENTATION_POLICY.debugHotkeys,
      {
        toggleDebugOverlay: () => this.renderers.debugRenderer.toggle(),
        toggleCollisionDebugOverlay: () => this.renderers.collisionDebugRenderer.toggle(),
        toggleSpawnPause: () => this.toggleSpawnPause(),
      },
    )
    window.addEventListener('keydown', this.handleKeyDown)
  }

  async initialize(_options?: Record<string, unknown>): Promise<void> {}

  private toggleSpawnPause(): void {
    this.world.spawnsPaused = !this.world.spawnsPaused
    if (this.world.spawnsPaused) {
      const enemies = enemyAIQuery(this.world)
      for (const eid of enemies) {
        Health.current[eid] = 0
      }
      console.log(`Enemy spawns PAUSED — killed ${enemies.length} enemies`)
    } else {
      console.log('Enemy spawns RESUMED')
    }
  }

  private isPlayerDead(): boolean {
    const eid = this.renderers.playerRenderer.getPlayerEntity()
    return eid !== null && hasComponent(this.world, Dead, eid)
  }

  /** Returns current HUD display state */
  getHUDState(): HUDState {
    const playerEid = this.renderers.playerRenderer.getPlayerEntity()
    const enc = this.world.encounter
    const state = this.world.upgradeState
    const { xp, level } = state
    const characterId = state.characterDef.id
    const xpForCurrentLevel = LEVEL_THRESHOLDS[level] ?? 0
    const xpForNextLevel = level < MAX_LEVEL ? LEVEL_THRESHOLDS[level + 1]! : xpForCurrentLevel
    const hasCylinder = playerEid !== null && hasComponent(this.world, Cylinder, playerEid)
    const showdownState = playerEid !== null && hasComponent(this.world, Showdown, playerEid)
      ? {
          showdownActive: Showdown.active[playerEid]! === 1,
          showdownCooldown: Showdown.cooldown[playerEid]!,
          showdownDuration: Showdown.duration[playerEid]!,
        }
      : undefined
    const abilityHud = deriveAbilityHudState(
      characterId,
      {
        showdownCooldown: state.showdownCooldown,
        showdownDuration: state.showdownDuration,
        dynamiteCooldown: state.dynamiteCooldown,
        dynamiteFuse: state.dynamiteFuse,
        dynamiteCooking: state.dynamiteCooking,
        dynamiteCookTimer: state.dynamiteCookTimer,
      },
      showdownState,
    )

    const run = this.world.run
    const narrativeThread = this.world.narrative
      ? getThread(this.world.narrative.threadId)
      : undefined
    const shovelCount = this.world.shovelCount
    const interactionPrompt = playerEid !== null
      ? (this.world.interactionPromptByPlayer.get(playerEid) ?? null)
      : null
    return {
      characterId,
      hp: playerEid !== null ? Health.current[playerEid]! : state.maxHP,
      maxHP: playerEid !== null ? Health.max[playerEid]! : state.maxHP,
      hpPotions: state.hpPotionCount,
      hpPotionsMax: HP_POTION_MAX_STACK,
      xp,
      goldCollected: this.world.goldCollected,
      killCount: this.world.killCount,
      shovelCount,
      interactionPrompt,
      xpForCurrentLevel,
      xpForNextLevel,
      level,
      waveNumber: enc ? enc.currentWave + 1 : 0,
      totalWaves: enc ? enc.definition.waves.length : 0,
      waveStatus: enc ? (enc.completed ? 'completed' : enc.waveActive ? 'active' : 'delay') : 'none',
      stageNumber: run ? run.currentStage + 1 : 0,
      totalStages: run ? run.totalStages : 0,
      stageStatus: run
        ? (run.completed ? 'completed' : run.transition === 'camp' ? 'camp' : run.transition === 'looting' ? 'looting' : run.transition !== 'none' ? 'clearing' : 'active')
        : 'none',
      narrativeThreadId: this.world.narrative?.threadId ?? null,
      narrativeThreadName: narrativeThread?.name ?? null,
      campNarrativeLine: this.world.campNarrativeLine,
      resolutionText: this.world.resolutionText,
      runIntroTitle: this.world.runIntroTitle,
      runIntroText: this.world.runIntroText,
      runIntroSequence: this.world.runIntroSequence,
      cylinderRounds: hasCylinder ? Cylinder.rounds[playerEid!]! : 0,
      cylinderMax: hasCylinder ? Cylinder.maxRounds[playerEid!]! : 0,
      isReloading: hasCylinder ? Cylinder.reloading[playerEid!]! === 1 : false,
      reloadProgress: hasCylinder
        ? (Cylinder.reloading[playerEid]! === 1 && Cylinder.reloadTime[playerEid]! > 0
            ? Math.min(1, Cylinder.reloadTimer[playerEid]! / Cylinder.reloadTime[playerEid]!)
            : 0)
        : 0,
      showCylinder: hasCylinder,
      ...abilityHud,
      pendingPoints: state.pendingPoints,
      isDead: this.isPlayerDead(),
      interactionFeedbackDescription: playerEid !== null
        ? (this.world.interactionFeedbackByPlayer.get(playerEid)?.description ?? null)
        : null,
      items: this.getCachedItems(state),
      hasFoolsErrand: (state.items.get(FOOLS_ERRAND_ID) ?? 0) > 0,
      minimap: buildSingleplayerMinimapState(this.world, playerEid),
      objective: this.world.objective
        ? (() => {
            const o = this.world.objective!
            const base = {
              type: o.type,
              description: o.description,
              status: o.status,
              progress: o.type === 'protect'
                ? (o.targetEids.length > 0
                    ? Health.current[o.targetEids[0]!]! / (Health.max[o.targetEids[0]!]! || 1)
                    : 1)
                : o.type === 'duel'
                  ? (o.duelistEid && Health.max[o.duelistEid]! > 0
                      ? Health.current[o.duelistEid]! / Health.max[o.duelistEid]!
                      : 0)
                  : o.escapedCount / (o.escapeThreshold || 1),
            }
            if (o.type === 'duel') return { ...base, forfeitTimer: o.forfeitTimer }
            return base
          })()
        : null,
      boss: this.getCachedBoss(),
      drawDuel: (() => {
        const bosses = bossQuery(this.world)
        for (const beid of bosses) {
          if (Enemy.type[beid] !== EnemyType.OLD_SCRATCH) continue
          const state = this.world.bossState.get(beid) as OldScratchState | undefined
          if (!state || state.phase !== 4) continue
          const duration = getStaredownDuration(state.drawRound)
          return {
            phase: state.drawPhase,
            round: state.drawRound,
            staredownProgress: state.drawPhase === 'staredown'
              ? Math.min(1, 1 - state.staredownTimer / duration)
              : state.drawPhase === 'flash' ? 1 : 0,
          }
        }
        return null
      })(),
      draft: null,
      campVisitor: this.getCachedCampVisitor(),
    }
  }

  /** Cache items array — only rebuild when items Map content changes. */
  private getCachedItems(state: { items: Map<number, number> }): HUDState['items'] {
    let hash = state.items.size
    for (const [id, count] of state.items) {
      hash = ((hash << 5) - hash + id * 997 + count) | 0
    }
    if (hash !== this.lastItemsHash) {
      this.lastItemsHash = hash
      this.cachedItems = Array.from(state.items.entries()).map(([itemId, stacks]) => {
        const def = getItemDef(itemId)
        return {
          itemId,
          key: def?.key ?? '',
          name: def?.name ?? '???',
          description: def?.description ?? '',
          rarity: def?.rarity ?? 'brass',
          stacks,
          downside: def?.downside,
        }
      })
    }
    return this.cachedItems
  }

  /** Cache boss bar — only rebuild when boss HP total changes. */
  private getCachedBoss(): HUDState['boss'] {
    const bosses = bossQuery(this.world)
    if (bosses.length === 0) {
      if (this.lastBossHP !== 0) {
        this.lastBossHP = 0
        this.cachedBoss = null
      }
      return this.cachedBoss
    }
    let totalHP = 0
    for (const beid of bosses) totalHP += Health.current[beid]!
    if (totalHP !== this.lastBossHP) {
      this.lastBossHP = totalHP
      let totalMaxHP = 0, name = 'BOSS', anyAlive = false
      for (const beid of bosses) {
        totalMaxHP += Health.max[beid]!
        const hp = Health.current[beid]!
        if (hp > 0) { anyAlive = true }
        name = getBoss(Enemy.type[beid]!)?.displayName ?? name
      }
      this.cachedBoss = anyAlive ? { name, hp: totalHP, maxHP: totalMaxHP } : null
    }
    return this.cachedBoss
  }

  /** Cache camp visitor — only rebuild when visitor spawns or offer state changes. */
  private getCachedCampVisitor(): HUDState['campVisitor'] {
    const cv = this.world.campVisitor
    if (!cv) {
      if (this.lastCampVisitorId !== -1) {
        this.lastCampVisitorId = -1
        this.lastCampVisitorSoldMask = 0
        this.cachedCampVisitor = null
      }
      return this.cachedCampVisitor
    }
    let soldMask = 0
    for (let i = 0; i < cv.offers.length; i++) {
      if (cv.offers[i]!.sold) soldMask |= (1 << i)
    }
    for (let i = 0; i < cv.modOffers.length; i++) {
      if (cv.modOffers[i]!.taken) soldMask |= (1 << (i + 16))
    }
    if (cv.visitorId !== this.lastCampVisitorId || soldMask !== this.lastCampVisitorSoldMask) {
      this.lastCampVisitorId = cv.visitorId
      this.lastCampVisitorSoldMask = soldMask
      const vDef = getVisitorDef(cv.visitorId)
      this.cachedCampVisitor = {
        visitorId: cv.visitorId,
        visitorName: vDef?.name ?? 'Visitor',
        greeting: cv.greeting,
        offers: cv.offers.map(o => {
          const def = getItemDef(o.itemId)
          return {
            itemId: o.itemId,
            itemName: def?.name ?? '???',
            itemDescription: def?.description ?? '',
            rarity: def?.rarity ?? 'brass',
            price: o.price,
            sold: o.sold,
            downside: def?.downside,
          }
        }),
        modOffers: cv.modOffers.map(mo => {
          const mDef = getWeaponModDef(mo.modId)
          return {
            modId: mo.modId,
            modName: mDef?.name ?? '???',
            modDescription: mDef?.description ?? '',
            taken: mo.taken,
            flavor: mDef?.flavor,
          }
        }),
      }
    }
    return this.cachedCampVisitor
  }

  consumePendingBossIntro(): { bossName: string; taunt: string } | null {
    return this.gameplayEventProcessor.consumePendingBossIntro()
  }

  hasPendingPoints(): boolean {
    return this.world.upgradeState.pendingPoints > 0
  }

  isDisconnected(): boolean {
    return false
  }

  setPaused(paused: boolean): void {
    this.paused = paused
  }

  isPaused(): boolean {
    return this.paused
  }

  getSoundManager(): SoundManager {
    return this.sound
  }

  getSkillTreeData(): SkillTreeUIData {
    const state = this.world.upgradeState
    return {
      branches: state.characterDef.branches.map(branch => ({
        id: branch.id,
        name: branch.name,
        description: branch.description,
        nodes: branch.nodes.map(node => {
          let nodeState: SkillNodeState
          if (state.nodesTaken.has(node.id)) {
            nodeState = 'taken'
          } else if (!node.implemented) {
            nodeState = 'unimplemented'
          } else if (canTakeNode(state, node.id)) {
            nodeState = 'available'
          } else {
            nodeState = 'locked'
          }
          return {
            id: node.id,
            name: node.name,
            description: node.description,
            tier: node.tier,
            state: nodeState,
          }
        }),
      })),
      pendingPoints: state.pendingPoints,
      level: state.level,
    }
  }

  selectNode(nodeId: string): boolean {
    const playerEid = this.renderers.playerRenderer.getPlayerEntity()
    if (playerEid === null) return false
    const success = takeNode(this.world.upgradeState, nodeId, this.world)
    if (success) {
      writeStatsToECS(this.world, playerEid)
      this.sound.play('upgrade_select')
    }
    return success
  }

  handleVisitorPurchase(offerIndex: number): boolean {
    const playerEid = this.renderers.playerRenderer.getPlayerEntity()
    if (playerEid === null) return false
    return tryVisitorPurchase(this.world, playerEid, offerIndex)
  }

  handleTinkererModSelect(offerIndex: number): boolean {
    const playerEid = this.renderers.playerRenderer.getPlayerEntity()
    if (playerEid === null) return false
    return tryTinkererModSelect(this.world, playerEid, offerIndex)
  }

  completeCamp(): void {
    this.world.campComplete = true
  }

  setWorldVisible(visible: boolean): void {
    this.gameApp.world.visible = visible
  }

  private queuePendingVisualShot(visualBulletId: number): void {
    if (this.pendingVisualShots.length >= MAX_PENDING_VISUAL_SHOTS) {
      this.pendingVisualShots.shift()
    }
    this.pendingVisualShots.push(visualBulletId)
  }

  private resolvePendingLocalShotResults(playerEid: number | null): void {
    if (playerEid === null || this.world.pendingShotResults.length === 0) return

    const fallbackEvents: Array<{ type: 'shot-confirmed'; x: number; y: number; hit: boolean }> = []
    for (const result of this.world.pendingShotResults) {
      if (result.shooterEid !== playerEid) continue

      const visualBulletId = this.pendingVisualShots.shift()
      if (
        visualBulletId !== undefined &&
        this.renderers.bulletRenderer.resolveVisualBulletImpact(
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

  private processVisualBulletImpacts(): void {
    const impacts = this.renderers.bulletRenderer.consumeVisualImpacts()
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

  update(dt: number): void {
    // Stop simulation when local player is dead
    if (this.isPlayerDead()) return

    // Stop simulation when paused
    if (this.paused) return

    // Skip sim tick if hit-stopped
    if (this.hitStop.isFrozen) return

    // Get player entity for position lookups
    const playerEid = this.renderers.playerRenderer.getPlayerEntity()

    // Set player world position as aim reference
    if (playerEid !== null) {
      this.input.setReferencePosition(Position.x[playerEid]!, Position.y[playerEid]!)
    }

    // Set camera state for screen→world conversion (account for camera zoom)
    const camPos = this.camera.getPosition()
    const baseZoom = this.gameApp.width * WORLD_SCALE / INTERNAL_WIDTH
    this.input.setCamera(camPos.x, camPos.y, this.gameApp.width, this.gameApp.height, baseZoom * this.camera.getCurrentZoom())

    // Get input state (now with correct world-space aim)
    const inputState = this.input.getInputState()

    // Snapshot i-frames and cylinder state before sim step for change detection
    const prevIframes = playerEid !== null ? Health.iframes[playerEid]! : 0
    const prevRounds = playerEid !== null && hasComponent(this.world, Cylinder, playerEid)
      ? Cylinder.rounds[playerEid]!
      : -1
    const prevReloading = playerEid !== null && hasComponent(this.world, Cylinder, playerEid)
      ? Cylinder.reloading[playerEid]!
      : 0

    // Step the simulation
    this.simulationDriver.step(inputState)

    // Detect tilemap change (stage transition)
    if (this.world.tilemap !== this.currentTilemap && this.world.tilemap) {
      this.currentTilemap = this.world.tilemap
      refreshTilemap(this.world.tilemap, this.renderers.tilemapRenderer, this.camera, this.lightingSystem)
    }

    // Map obstacle destruction VFX
    if (this.world.obstacleDestructions.length > 0) {
      // Invalidate tilemap render so cleared tiles are updated visually
      this.renderers.tilemapRenderer.invalidate()
      if (this.world.tilemap) {
        this.renderers.tilemapRenderer.render(this.world.tilemap)
      }
      for (const dest of this.world.obstacleDestructions) {
        if (isWoodObstacle(dest.type)) {
          emitWoodSplinters(this.particles, dest.x, dest.y)
        } else {
          emitRockDebris(this.particles, dest.x, dest.y)
        }
        const trauma = dest.type === MapObstacleType.BOULDER ? 0.3 : 0.15
        this.camera.shake.addTrauma(trauma)
      }
    }

    // Map obstacle hit VFX
    for (const hit of this.world.obstacleHits) {
      emitObstacleHit(this.particles, hit.x, hit.y, hit.isWood)
    }

    emitShowdownCueEvents(this.gameplayEvents, this.world)
    emitLastRitesCueEvents(this.gameplayEvents, this.world)
    emitDynamiteCueEvents(this.gameplayEvents, this.world, playerEid)
    emitTrapDetonationEvents(this.gameplayEvents, this.world)
    emitBossPhaseTransitionEvents(this.gameplayEvents, this.world)

    // Set showdown target for enemy tinting
    this.renderers.enemyRenderer.showdownTargetEid =
      playerEid !== null && hasComponent(this.world, Showdown, playerEid) && Showdown.active[playerEid]! === 1
        ? Showdown.targetEid[playerEid]!
        : NO_TARGET
    this.renderers.enemyRenderer.lastRitesZone = this.world.lastRites?.active ? this.world.lastRites : null

    // Detect player damage (i-frames went from 0 to >0)
    if (playerEid !== null) {
      const newIframes = Health.iframes[playerEid]!
      if (didTakeDamageFromIframes(prevIframes, newIframes)) {
        // Directional camera kick toward damage source (per-player)
        const hitDir = this.world.lastPlayerHitDir.get(playerEid)
        const kickX = hitDir?.x ?? 0
        const kickY = hitDir?.y ?? 0
        emitPlayerHitEvent(this.gameplayEvents, SINGLEPLAYER_PRESENTATION_POLICY.playerHit, kickX, kickY)
      }
    }

    syncRenderersAndQueueEvents({
      world: this.world,
      playerRenderer: this.renderers.playerRenderer,
      enemyRenderer: this.renderers.enemyRenderer,
      bulletRenderer: this.renderers.bulletRenderer,
      events: this.gameplayEvents,
      npcRenderer: this.renderers.npcRenderer,
      objectiveRenderer: this.renderers.objectiveRenderer,
      chatBubblePool: this.chatBubblePool,
    })
    emitBossIntroEvents({
      events: this.gameplayEvents,
      enemyRenderer: this.renderers.enemyRenderer,
      narrativeThreadId: this.world.narrative?.threadId ?? null,
    })

    this.dryFireCooldown = Math.max(0, this.dryFireCooldown - dt)
    if (playerEid !== null && prevRounds >= 0 && hasComponent(this.world, Cylinder, playerEid)) {
      const newRounds = Cylinder.rounds[playerEid]!
      const nowReloading = Cylinder.reloading[playerEid]!
      const angle = Player.aimAngle[playerEid]!
      const barrelTip = this.renderers.playerRenderer.getBarrelTipFromState(this.world, playerEid)
      const muzzleX = barrelTip?.x ?? Position.x[playerEid]!
      const muzzleY = barrelTip?.y ?? Position.y[playerEid]!
      if (this.world.playerFireMode === 'hitscan' && didFireRound(prevRounds, newRounds)) {
        const bulletCfg = getBulletConfigForCharacter(this.world.characterId)
        const pelletCount = Math.max(1, Math.round(this.world.upgradeState.pelletCount))
        const spreadAngle = this.world.upgradeState.spreadAngle
        for (let i = 0; i < pelletCount; i++) {
          const angleOffset = pelletCount > 1
            ? spreadAngle * (i / (pelletCount - 1) - 0.5)
            : 0
          const visualBulletId = this.renderers.bulletRenderer.spawnVisualBullet(
            muzzleX,
            muzzleY,
            angle + angleOffset,
            bulletCfg.visualSpeed,
            bulletCfg.visualMaxLifetime,
            bulletCfg.spriteId,
            bulletCfg.size,
          )
          this.queuePendingVisualShot(visualBulletId)
        }
      }
      const recoil = CHARACTER_RECOIL[this.world.characterId]
      this.dryFireCooldown = emitCylinderPresentationEvents({
        events: this.gameplayEvents,
        actorEid: playerEid,
        prevRounds,
        newRounds,
        prevReloading,
        nowReloading,
        inputState,
        dryFireCooldown: this.dryFireCooldown,
        dryFireCooldownSeconds: 0.3,
        aimAngle: angle,
        muzzleX,
        muzzleY,
        fireTrauma: recoil.fireTrauma,
        fireKickStrength: recoil.cameraKickStrength,
        fireSlowdownMs: recoil.fireSlowdownMs,
      })
    }
    this.resolvePendingLocalShotResults(playerEid)
    emitMeleeSwingEvents(this.gameplayEvents, this.world, playerEid)

    // Level-up detection
    if (this.world.upgradeState.level > this.lastProcessedLevel) {
      this.lastProcessedLevel = this.world.upgradeState.level
      if (playerEid !== null) {
        this.gameplayEvents.push({
          type: 'level-up',
          x: Position.x[playerEid]!,
          y: Position.y[playerEid]!,
        })
      }
    }

    // Detect draw duel phase transitions → emit events
    {
      const bosses = bossQuery(this.world)
      for (const beid of bosses) {
        if (Enemy.type[beid] !== EnemyType.OLD_SCRATCH) continue
        const state = this.world.bossState.get(beid) as OldScratchState | undefined
        if (!state || state.phase !== 4) {
          this.lastDrawPhase = null
          this.lastDrawResolved = false
          break
        }
        if (state.drawPhase === 'flash' && this.lastDrawPhase !== 'flash') {
          this.gameplayEvents.push({ type: 'draw-flash' })
        }
        // Panic shot detection
        if (state.panicShotThisTick) {
          this.gameplayEvents.push({ type: 'draw-result', text: 'TOO EARLY', color: 0xFF4444, timing: 'panic' })
        }
        if (state.drawResolved && !this.lastDrawResolved) {
          const elapsed = state.flashTimer
          let text: string
          let color: number
          let timing: 'perfect' | 'good' | 'slow'
          if (elapsed <= OLD_SCRATCH_PERFECT_DRAW_WINDOW) {
            text = 'PERFECT'
            color = 0xFFD700
            timing = 'perfect'
          } else if (elapsed <= OLD_SCRATCH_GOOD_DRAW_WINDOW) {
            text = 'GOOD'
            color = 0x44FF44
            timing = 'good'
          } else {
            text = 'SLOW'
            color = 0xFF4444
            timing = 'slow'
          }
          this.gameplayEvents.push({ type: 'draw-result', text, color, timing })
        }
        this.lastDrawPhase = state.drawPhase
        this.lastDrawResolved = state.drawResolved
        break
      }
    }

    // Detect boss death
    {
      const bosses = bossQuery(this.world)
      let bossAlive = false
      for (const beid of bosses) {
        if (Health.current[beid]! > 0) {
          bossAlive = true
          this.lastBossX = Position.x[beid]!
          this.lastBossY = Position.y[beid]!
        }
      }
      if (this.lastBossAlive && !bossAlive && bosses.length > 0) {
        this.gameplayEvents.push({ type: 'boss-death', x: this.lastBossX, y: this.lastBossY })
      }
      this.lastBossAlive = bossAlive
    }

    // Update boss camera zoom and letterbox
    this.updateBossCameraZoom()

    // Wave-start detection
    {
      const enc = this.world.encounter
      const waveActive = enc ? enc.waveActive : false
      if (waveActive && !this.lastWaveActive) {
        this.gameplayEvents.push({ type: 'wave-start' })
      }
      this.lastWaveActive = waveActive
    }

    // Wave-clear slow-mo
    if (this.world.waveClearedThisTick) {
      this.timeScale.slowMo(0.3, 0.3)
      this.gameplayEvents.push({ type: 'wave-clear' })
    }

    // Stage-clear tumbleweeds
    if (this.world.stageCleared) {
      const tmBounds = getPlayableBoundsFromTilemap(this.tilemap)
      this.renderers.tumbleweedRenderer.trigger(tmBounds.minX, tmBounds.maxX, tmBounds.minY, tmBounds.maxY)
      this.gameplayEvents.push({ type: 'stage-complete' })
    }

    // Gold pickup detection
    if (this.world.goldCollected > this.lastGold) {
      this.gameplayEvents.push({ type: 'gold-pickup' })
    }
    this.lastGold = this.world.goldCollected

    // Player death detection
    {
      const dead = this.isPlayerDead()
      if (dead && !this.wasDead) {
        this.gameplayEvents.push({ type: 'player-death' })
      }
      this.wasDead = dead
    }

    // Update ambient track for current stage
    if (this.world.run) {
      this.ambient.setStage(this.world.run.currentStage)
    }

    // Apply queued feedback events in one place (shared with multiplayer).
    this.gameplayEventProcessor.processAll(this.gameplayEvents.drain())

    // Update camera target
    if (playerEid !== null) {
      const worldMouse = this.input.getWorldMousePosition()
      this.camera.update(
        Position.x[playerEid]!,
        Position.y[playerEid]!,
        worldMouse.x,
        worldMouse.y,
        dt
      )
    }
  }

  private updateBossCameraZoom(): void {
    const bosses = bossQuery(this.world)
    let foundBoss = false
    for (const beid of bosses) {
      if (Enemy.type[beid] !== EnemyType.OLD_SCRATCH) continue
      const state = this.world.bossState.get(beid) as OldScratchState | undefined
      if (!state) continue
      foundBoss = true

      const phase = state.phase
      const prevPhase = this.lastBossPhase
      this.lastBossPhase = phase

      if (phase in BOSS_PHASE_ZOOM) {
        this.camera.setZoom(BOSS_PHASE_ZOOM[phase]!)
      } else if (phase === 4) {
        if (state.drawPhase === 'staredown') {
          // Progressive zoom in during staredown
          const duration = getStaredownDuration(state.drawRound)
          const progress = Math.min(1, 1 - state.staredownTimer / duration)
          this.camera.setZoom(1.0 + progress * (BOSS_STAREDOWN_ZOOM_MAX - 1.0))
        } else if (state.drawPhase === 'flash') {
          this.camera.setZoom(BOSS_FLASH_ZOOM)
        } else {
          // scramble / reset
          this.camera.setZoom(1.0)
        }
      }

      // Letterbox on Phase 4 entry/exit
      if (phase === 4 && prevPhase !== 4 && prevPhase > 0) {
        this.letterboxOverlay.show()
      } else if (phase !== 4 && prevPhase === 4) {
        this.letterboxOverlay.hide()
      }
      break
    }
    if (!foundBoss) {
      this.camera.setZoom(1.0)
      if (this.lastBossPhase === 4) {
        this.letterboxOverlay.hide()
      }
      this.lastBossPhase = 0
    }
  }

  render(alpha: number, fps: number): void {
    // Compute real delta time for effects
    const now = performance.now()
    const realDt = Math.min((now - this.lastRenderTime) / 1000, 0.25)
    this.lastRenderTime = now

    // Update ambient crossfade
    this.ambient.update(realDt)

    // Update hit stop
    this.hitStop.update(realDt)

    // Get interpolated camera state with shake + kick (raw float world position)
    const camState = this.camera.getRenderState(alpha, realDt)

    // Snap camera in RT space so world pixels align to RT pixel grid.
    // 1 world unit = WORLD_SCALE RT pixels, so snap (world * WORLD_SCALE) to integer.
    const rtCamX = camState.x * WORLD_SCALE
    const rtCamY = camState.y * WORLD_SCALE
    const rtSnappedX = Math.floor(rtCamX)
    const rtSnappedY = Math.floor(rtCamY)
    const fracX = rtCamX - rtSnappedX  // fractional RT pixels (0..1)
    const fracY = rtCamY - rtSnappedY

    // Apply camera transform to world container (pivot in world space, scaled by zoom)
    this.gameApp.world.pivot.set(rtSnappedX / WORLD_SCALE, rtSnappedY / WORLD_SCALE)
    this.gameApp.world.position.set(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2)
    this.gameApp.world.scale.set(WORLD_SCALE * camState.zoom)
    this.gameApp.world.rotation = camState.angle

    this.lightingSystem.updateLights(realDt)
    this.lightingSystem.resize(INTERNAL_WIDTH, INTERNAL_HEIGHT)
    this.lightingSystem.render(camState.x, camState.y, WORLD_SCALE * camState.zoom)

    // Scale low-res sprite to fill canvas (handles window resize)
    this.gameApp.resize()

    // Update per-building dither visibility
    {
      const eid = this.renderers.playerRenderer.getPlayerEntity()
      if (eid !== null) {
        const px = Position.x[eid]!
        const py = Position.y[eid]!
        const screenZoom = this.gameApp.width * WORLD_SCALE / INTERNAL_WIDTH
        const dx = px - camState.x
        const dy = py - camState.y
        const cos = Math.cos(camState.angle)
        const sin = Math.sin(camState.angle)
        const screenX = (dx * cos - dy * sin) * screenZoom + this.gameApp.width / 2
        const screenY = (dx * sin + dy * cos) * screenZoom + this.gameApp.height / 2
        this.renderers.tilemapRenderer.updateBuildingVisibility(px, py, screenX, screenY)
      }
    }

    // Clear debug graphics
    this.renderers.debugRenderer.clear()
    this.renderers.collisionDebugRenderer.clear()

    const interactables: InteractablesData = {
      salesman: this.world.salesman
        ? {
            x: this.world.salesman.x,
            y: this.world.salesman.y,
            stageIndex: this.world.salesman.stageIndex,
            camp: this.world.salesman.camp,
            active: this.world.salesman.active,
            shovelPrice: getShovelPrice(this.world.salesman.stageIndex),
          }
        : null,
      stashes: this.world.stashes.map((stash) => ({
        id: stash.id,
        x: stash.x,
        y: stash.y,
        stageIndex: stash.stageIndex,
        opened: stash.opened,
      })),
      itemPickups: this.world.itemPickups
        .filter(p => !p.collected)
        .map(p => {
          const def = getItemDef(p.itemId)
          return {
            id: p.id,
            itemId: p.itemId,
            x: p.x,
            y: p.y,
            rarity: def?.rarity ?? 'brass',
          }
        }),
      hpPotionPickups: this.world.hpPotionPickups
        .filter(p => !p.collected)
        .map(p => ({
          id: p.id,
          x: p.x,
          y: p.y,
        })),
      horse: this.world.horse?.active ? { x: this.world.horse.x, y: this.world.horse.y } : null,
    }
    this.renderers.interactableRenderer.render(interactables, realDt)

    // Apply render time scale for slow-mo effects
    const scaledDt = this.timeScale.update(realDt)

    // Render player with interpolation
    this.renderers.playerRenderer.render(this.world, alpha, realDt)

    // Dust clouds from player movement
    {
      const eid = this.renderers.playerRenderer.getPlayerEntity()
      if (eid !== null) {
        const isRolling = PlayerState.state[eid] === PlayerStateType.ROLLING
        if (isRolling && !this.wasRolling) {
          emitRollDust(this.particles, Position.x[eid]!, Position.y[eid]!)
          this.gameplayEvents.push({ type: 'roll' })
        }
        this.wasRolling = isRolling

        const vx = Velocity.x[eid]!
        const vy = Velocity.y[eid]!
        const speed = Math.sqrt(vx * vx + vy * vy)
        if (speed > MOVEMENT_DUST_MIN_SPEED && !isRolling) {
          this.dustAccumulator += realDt
          if (this.dustAccumulator >= MOVEMENT_DUST_INTERVAL) {
            this.dustAccumulator = 0
            emitMovementDust(this.particles, Position.x[eid]!, Position.y[eid]!)
          }
          this.footstepAccumulator += realDt
          if (this.footstepAccumulator >= FOOTSTEP_INTERVAL) {
            this.footstepAccumulator = 0
            this.sound.play('footstep')
          }
        } else {
          this.dustAccumulator = 0
          this.footstepAccumulator = 0
        }
      }
    }

    // Advance and render local-only cosmetic player bullets.
    this.renderers.bulletRenderer.updateVisualBullets(realDt)
    this.processVisualBulletImpacts()

    // Render bullets with interpolation
    this.renderers.bulletRenderer.render(this.world, alpha, realDt)

    // Render enemies with interpolation
    this.renderers.enemyRenderer.render(this.world, alpha, realDt)

    // Render NPCs with interpolation
    this.renderers.npcRenderer.render(this.world, alpha)

    // Render objective targets
    this.renderers.objectiveRenderer.render(this.world, alpha)

    // Render boss attack telegraphs (below entities)
    this.renderers.bossAttackRenderer.render(this.world, this.particles, realDt)

    // Render ground cracks (below entities)
    this.renderers.groundCrackRenderer.render(this.world)

    // Render boss shockwave rings
    this.renderers.bossShockwaveRenderer.render(this.world)

    // Render trap zones (bear traps, caltrops)
    this.renderers.trapZoneRenderer.render(this.world)

    // Render Deadeye laser sight telegraphs
    this.renderers.laserSightRenderer.render(this.world)

    // Render Dustdevil lingering damage zones
    this.renderers.dustZoneRenderer.render(this.world)

    // Render map obstacles (crates, barrels, boulders, etc.)
    this.renderers.mapObstacleRenderer.render(this.world)

    // Render dynamite pixel-fuse telegraphs + throw arcs.
    this.renderers.dynamiteRenderer.render(this.world, realDt, this.particles)

    // Render showdown mark + line
    const playerEid = this.renderers.playerRenderer.getPlayerEntity()
    this.renderers.showdownRenderer.render(this.world, playerEid !== null ? [playerEid] : [], alpha, realDt)
    this.renderers.lastRitesRenderer.render(this.world, alpha, realDt)

    // Update animated tile tinting
    this.renderers.tilemapRenderer.update(realDt)

    // Update dust storm fog-of-war
    {
      const eid = this.renderers.playerRenderer.getPlayerEntity()
      if (eid !== null) {
        this.renderers.dustStormEffect.update(this.world, Position.x[eid]!, Position.y[eid]!)
      }
    }

    // Update draw flash overlay and letterbox bars
    this.drawFlashOverlay.update(realDt)
    this.letterboxOverlay.update(realDt)

    // Hellfire Pillar sparks (read pillar EIDs from boss state)
    this.hellfireSparkAccumulator += realDt
    if (this.hellfireSparkAccumulator >= HELLFIRE_SPARK_INTERVAL) {
      this.hellfireSparkAccumulator = 0
      for (const beid of bossQuery(this.world)) {
        if (Enemy.type[beid] !== EnemyType.OLD_SCRATCH) continue
        const state = this.world.bossState.get(beid) as OldScratchState | undefined
        if (!state) continue
        for (const pillarEid of state.pillarEids) {
          if (Health.current[pillarEid]! > 0) {
            emitHellfireSparks(this.particles, Position.x[pillarEid]!, Position.y[pillarEid]!)
          }
        }
      }
    }

    // Ghost Rider trail particles
    this.ghostTrailAccumulator += realDt
    if (this.ghostTrailAccumulator >= GHOST_TRAIL_INTERVAL) {
      this.ghostTrailAccumulator = 0
      for (const eid of enemyAIQuery(this.world)) {
        if (Enemy.type[eid] !== EnemyType.GHOST_RIDER) continue
        const vx = Velocity.x[eid]!
        const vy = Velocity.y[eid]!
        if (vx * vx + vy * vy > GHOST_TRAIL_MIN_SPEED_SQ) {
          emitGhostTrail(this.particles, Position.x[eid]!, Position.y[eid]!)
        }
      }
    }

    // Dust swirl particles during storm
    if (this.renderers.dustStormEffect.isActive) {
      this.dustSwirlAccumulator += realDt
      if (this.dustSwirlAccumulator >= DUST_SWIRL_INTERVAL) {
        this.dustSwirlAccumulator = 0
        const eid = this.renderers.playerRenderer.getPlayerEntity()
        if (eid !== null) {
          const px = Position.x[eid]!
          const py = Position.y[eid]!
          emitDustSwirl(this.particles, px + (Math.random() - 0.5) * 300, py + (Math.random() - 0.5) * 300)
        }
      }
    }

    // Update tumbleweeds
    this.renderers.tumbleweedRenderer.update(scaledDt)

    // Update particles (visual-only, uses scaled dt for slow-mo)
    this.particles.update(scaledDt)
    {
      const screenZoom = this.gameApp.width * WORLD_SCALE / INTERNAL_WIDTH
      this.floatingText.update(scaledDt, {
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

    this.deathPresentation.update(this.isPlayerDead())

    // Build expanded debug stats (playerEid already declared above)
    const camPos = this.camera.getPosition()

    // Enemy AI state distribution
    const aiEnemies = enemyAIQuery(this.world)
    const stateCounts = new Map<number, number>()
    for (const eid of aiEnemies) {
      const s = EnemyAI.state[eid]!
      stateCounts.set(s, (stateCounts.get(s) ?? 0) + 1)
    }
    const enemyStates = Object.entries(STATE_LABELS)
      .map(([key, label]) => {
        const count = stateCounts.get(Number(key)) ?? 0
        return count > 0 ? `${label}:${count}` : null
      })
      .filter(Boolean)
      .join(' ')

    const enc = this.world.encounter

    const runState = this.world.run
    const stats: DebugStats = {
      fps,
      tick: this.world.tick,
      entityCount: this.renderers.spriteRegistry.count,
      playerState: playerEid !== null
        ? (PLAYER_STATE_NAMES[PlayerState.state[playerEid]!] ?? 'unknown')
        : '(none)',
      enemyCount: this.renderers.enemyRenderer.count,
      enemyStates,
      playerHP: playerEid !== null ? Health.current[playerEid]! : 0,
      playerMaxHP: playerEid !== null ? Health.max[playerEid]! : 0,
      activeProjectiles: bulletCountQuery(this.world).length,
      playerX: playerEid !== null ? Position.x[playerEid]! : 0,
      playerY: playerEid !== null ? Position.y[playerEid]! : 0,
      playerVx: playerEid !== null ? Velocity.x[playerEid]! : 0,
      playerVy: playerEid !== null ? Velocity.y[playerEid]! : 0,
      cameraX: camPos.x,
      cameraY: camPos.y,
      cameraTrauma: this.camera.shake.currentTrauma,
      stageNumber: runState ? runState.currentStage + 1 : 0,
      stageStatus: runState
        ? (runState.completed ? 'completed' : runState.transition === 'camp' ? 'camp' : runState.transition === 'looting' ? 'looting' : runState.transition !== 'none' ? 'clearing' : 'active')
        : 'none',
      waveNumber: enc ? enc.currentWave + 1 : 0,
      waveStatus: enc ? (enc.completed ? 'completed' : enc.waveActive ? 'active' : 'delay') : 'none',
      fodderAlive: enc ? enc.fodderAliveCount : 0,
      threatAlive: enc ? enc.threatAliveCount : 0,
      fodderBudgetLeft: enc ? enc.fodderBudgetRemaining : 0,
      xp: this.world.upgradeState.xp,
      level: this.world.upgradeState.level,
      pendingPts: this.world.upgradeState.pendingPoints,
    }

    this.renderers.debugRenderer.updateStats(stats)
  }

  destroy(): void {
    this.gameplayEvents.clear()
    this.pendingVisualShots.length = 0
    this.particles.destroy()
    this.floatingText.destroy()
    this.sound.destroy()
    this.ambient.destroy()
    window.removeEventListener('keydown', this.handleKeyDown)
    this.input.destroy()
    this.deathPresentation.destroy()
    this.lightingSystem.destroy()
    this.chatBubblePool.destroy()
    this.drawFlashOverlay.destroy()
    this.letterboxOverlay.destroy()
    this.renderers.destroy()
  }
}
