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
  generateArena,
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
  type CharacterId,
  HP_POTION_MAX_STACK,
  getBulletConfigForCharacter,
  FOOLS_ERRAND_ID,
  MapObstacleType,
  isWoodObstacle,
} from '@high-noon/shared'
import { defineQuery, hasComponent } from 'bitecs'
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
import { GroundCrackRenderer } from '../../render/GroundCrackRenderer'
import { BossShockwaveRenderer } from '../../render/BossShockwaveRenderer'
import { BossAttackRenderer } from '../../render/BossAttackRenderer'
import { TrapZoneRenderer } from '../../render/TrapZoneRenderer'
import { MapObstacleRenderer } from '../../render/MapObstacleRenderer'
import { InteractableRenderer } from '../../render/InteractableRenderer'
import { TilemapRenderer, CollisionDebugRenderer } from '../../render/TilemapRenderer'
import { LightingSystem, createMuzzleFlashLight } from '../../lighting'
import { SoundManager } from '../../audio/SoundManager'
import { SOUND_DEFS } from '../../audio/sounds'
import { ParticlePool, FloatingTextPool, ChatBubblePool, KillStreakTracker, emitMovementDust, emitRollDust, emitWoodSplinters, emitRockDebris, emitObstacleHit } from '../../fx'
import { TimeScale } from '../../engine/TimeScale'
import { TumbleweedRenderer } from '../../render/TumbleweedRenderer'
import { NpcRenderer } from '../../render/NpcRenderer'
import { ObjectiveRenderer } from '../../render/ObjectiveRenderer'
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

const enemyAIQuery = defineQuery([Enemy, EnemyAI])
const bulletCountQuery = defineQuery([Bullet])
const bossQuery = defineQuery([Enemy, BossPhase, Health])

const STATE_LABELS = ['IDL', 'CHS', 'TEL', 'ATK', 'REC', 'STN', 'FLE']

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
  private readonly trapZoneRenderer: TrapZoneRenderer
  private readonly mapObstacleRenderer: MapObstacleRenderer
  private readonly interactableRenderer: InteractableRenderer
  private readonly lightingSystem: LightingSystem
  private readonly tilemapRenderer: TilemapRenderer
  private readonly collisionDebugRenderer: CollisionDebugRenderer
  private currentTilemap: Tilemap | null = null
  private readonly sound: SoundManager
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
  private readonly tumbleweedRenderer: TumbleweedRenderer
  private lastProcessedLevel = 0
  private dryFireCooldown = 0
  private paused = false
  private dustAccumulator = 0
  private wasRolling = false

  constructor(gameApp: GameApp, characterId: CharacterId = 'sheriff') {
    this.gameApp = gameApp

    // Input
    this.input = new Input()

    // ECS world + systems
    this.world = createGameWorld(undefined, getCharacterDef(characterId))
    this.world.playerFireMode = 'hitscan'

    // Generate first stage's tilemap from the run config
    const stage0Config = DEFAULT_RUN_STAGES[0]!.mapConfig
    this.tilemap = generateArena(stage0Config, this.world.initialSeed, 0)
    setWorldTilemap(this.world, this.tilemap)
    this.systems = createSystemRegistry()

    // Register simulation systems in canonical order
    registerAllSystems(this.systems)
    this.simulationDriver = new FullWorldSimulationDriver(this.world, this.systems)

    // Renderers
    this.tilemapRenderer = new TilemapRenderer(this.gameApp.layers.background)
    this.tilemapRenderer.render(this.tilemap)
    // Insert building roof overlay above entities so roofs render over players
    const entitiesIdx = this.gameApp.world.getChildIndex(this.gameApp.layers.entities)
    this.gameApp.world.addChildAt(this.tilemapRenderer.getRoofContainer(), entitiesIdx + 1)
    this.lightingSystem = new LightingSystem(this.gameApp.app.renderer, INTERNAL_WIDTH, INTERNAL_HEIGHT)
    // Lightmap composites in RT space (overlay, above worldContainer)
    this.gameApp.overlay.addChild(this.lightingSystem.getLightmapSprite())
    seedHazardLights(this.lightingSystem, this.tilemap)
    this.currentTilemap = this.tilemap

    this.debugRenderer = new DebugRenderer(this.gameApp.layers.ui)
    this.interactableRenderer = new InteractableRenderer(this.gameApp.layers.entities)
    this.spriteRegistry = new SpriteRegistry(this.gameApp.layers.entities)
    this.lastRitesRenderer = new LastRitesRenderer(this.gameApp.layers.entities)
    this.dynamiteRenderer = new DynamiteRenderer(this.gameApp.layers.entities)
    this.groundCrackRenderer = new GroundCrackRenderer(this.gameApp.layers.entities)
    this.bossShockwaveRenderer = new BossShockwaveRenderer(this.gameApp.layers.entities)
    this.bossAttackRenderer = new BossAttackRenderer(this.gameApp.layers.entities)
    this.trapZoneRenderer = new TrapZoneRenderer(this.gameApp.layers.entities)
    this.mapObstacleRenderer = new MapObstacleRenderer(this.gameApp.layers.entities)
    this.playerRenderer = new PlayerRenderer(this.gameApp.layers.entities)
    this.bulletRenderer = new BulletRenderer(this.spriteRegistry)
    this.enemyRenderer = new EnemyRenderer(this.spriteRegistry, this.debugRenderer)
    this.npcRenderer = new NpcRenderer(this.spriteRegistry)
    this.objectiveRenderer = new ObjectiveRenderer(this.spriteRegistry, this.gameApp.layers.entities)
    this.showdownRenderer = new ShowdownRenderer(this.gameApp.layers.entities)
    this.collisionDebugRenderer = new CollisionDebugRenderer(this.gameApp.layers.ui)

    // Debug graphics in entity layer (world space)
    this.gameApp.layers.entities.addChild(this.debugRenderer.getContainer())

    // Spawn player at arena center
    const { x: centerX, y: centerY } = getArenaCenterFromTilemap(this.tilemap)
    spawnPlayer(this.world, centerX, centerY)

    // Start the multi-stage run
    startRun(this.world, DEFAULT_RUN_STAGES)

    this.playerRenderer.sync(this.world)

    // Camera — viewport in world units (RT size / world scale)
    this.camera = new Camera()
    this.camera.setViewport(INTERNAL_WIDTH / WORLD_SCALE, INTERNAL_HEIGHT / WORLD_SCALE)
    const bounds = getPlayableBoundsFromTilemap(this.tilemap)
    this.camera.setBounds(bounds)
    this.camera.snapTo(centerX, centerY)

    // Hit stop
    this.hitStop = new HitStop()

    // Audio
    this.sound = new SoundManager()
    this.sound.loadAll(SOUND_DEFS)

    // Particles
    this.particles = new ParticlePool(this.gameApp.layers.fx)
    this.floatingText = new FloatingTextPool(this.gameApp.layers.ui)
    this.chatBubblePool = new ChatBubblePool(this.gameApp.layers.ui)
    this.timeScale = new TimeScale()
    this.killStreakTracker = new KillStreakTracker()
    this.tumbleweedRenderer = new TumbleweedRenderer(this.gameApp.layers.entities)
    this.gameplayEvents = new GameplayEventBuffer()
    this.gameplayEventProcessor = new GameplayEventProcessor({
      camera: this.camera,
      sound: this.sound,
      particles: this.particles,
      floatingText: this.floatingText,
      playerRenderer: this.playerRenderer,
      hitStop: this.hitStop,
      spawnMuzzleLight: (x, y) => this.lightingSystem.addLight(createMuzzleFlashLight(x, y)),
      killStreakTracker: this.killStreakTracker,
      timeScale: this.timeScale,
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
        toggleDebugOverlay: () => this.debugRenderer.toggle(),
        toggleCollisionDebugOverlay: () => this.collisionDebugRenderer.toggle(),
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
    const eid = this.playerRenderer.getPlayerEntity()
    return eid !== null && hasComponent(this.world, Dead, eid)
  }

  /** Returns current HUD display state */
  getHUDState(): HUDState {
    const playerEid = this.playerRenderer.getPlayerEntity()
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
      items: Array.from(state.items.entries()).map(([itemId, stacks]) => {
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
      }),
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
      boss: (() => {
        const bosses = bossQuery(this.world)
        if (bosses.length === 0) return null
        let totalHP = 0, totalMaxHP = 0, name = 'BOSS', anyAlive = false
        for (const beid of bosses) {
          totalMaxHP += Health.max[beid]!
          const hp = Health.current[beid]!
          if (hp > 0) { anyAlive = true; totalHP += hp }
          name = getBoss(Enemy.type[beid]!)?.displayName ?? name
        }
        if (!anyAlive) return null
        return { name, hp: totalHP, maxHP: totalMaxHP }
      })(),
      campVisitor: this.world.campVisitor
        ? (() => {
            const vDef = getVisitorDef(this.world.campVisitor!.visitorId)
            return {
              visitorId: this.world.campVisitor!.visitorId,
              visitorName: vDef?.name ?? 'Visitor',
              greeting: this.world.campVisitor!.greeting,
              offers: this.world.campVisitor!.offers.map(o => {
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
            }
          })()
        : null,
    }
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
    const playerEid = this.playerRenderer.getPlayerEntity()
    if (playerEid === null) return false
    const success = takeNode(this.world.upgradeState, nodeId, this.world)
    if (success) {
      writeStatsToECS(this.world, playerEid)
      this.sound.play('upgrade_select')
    }
    return success
  }

  handleVisitorPurchase(offerIndex: number): boolean {
    const playerEid = this.playerRenderer.getPlayerEntity()
    if (playerEid === null) return false
    return tryVisitorPurchase(this.world, playerEid, offerIndex)
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

  update(dt: number): void {
    // Stop simulation when local player is dead
    if (this.isPlayerDead()) return

    // Stop simulation when paused
    if (this.paused) return

    // Skip sim tick if hit-stopped
    if (this.hitStop.isFrozen) return

    // Get player entity for position lookups
    const playerEid = this.playerRenderer.getPlayerEntity()

    // Set player world position as aim reference
    if (playerEid !== null) {
      this.input.setReferencePosition(Position.x[playerEid]!, Position.y[playerEid]!)
    }

    // Set camera state for screen→world conversion
    const camPos = this.camera.getPosition()
    const zoom = this.gameApp.width * WORLD_SCALE / INTERNAL_WIDTH
    this.input.setCamera(camPos.x, camPos.y, this.gameApp.width, this.gameApp.height, zoom)

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
      refreshTilemap(this.world.tilemap, this.tilemapRenderer, this.camera, this.lightingSystem)
    }

    // Map obstacle destruction VFX
    if (this.world.obstacleDestructions.length > 0) {
      // Invalidate tilemap render so cleared tiles are updated visually
      this.tilemapRenderer.invalidate()
      if (this.world.tilemap) {
        this.tilemapRenderer.render(this.world.tilemap)
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
    this.enemyRenderer.showdownTargetEid =
      playerEid !== null && hasComponent(this.world, Showdown, playerEid) && Showdown.active[playerEid]! === 1
        ? Showdown.targetEid[playerEid]!
        : NO_TARGET
    this.enemyRenderer.lastRitesZone = this.world.lastRites?.active ? this.world.lastRites : null

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
      narrativeThreadId: this.world.narrative?.threadId ?? null,
    })

    this.dryFireCooldown = Math.max(0, this.dryFireCooldown - dt)
    if (playerEid !== null && prevRounds >= 0 && hasComponent(this.world, Cylinder, playerEid)) {
      const newRounds = Cylinder.rounds[playerEid]!
      const nowReloading = Cylinder.reloading[playerEid]!
      const angle = Player.aimAngle[playerEid]!
      const barrelTip = this.playerRenderer.getBarrelTipFromState(this.world, playerEid)
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
          const visualBulletId = this.bulletRenderer.spawnVisualBullet(
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

    // Wave-clear slow-mo
    if (this.world.waveClearedThisTick) {
      this.timeScale.slowMo(0.3, 0.3)
    }

    // Stage-clear tumbleweeds
    if (this.world.stageCleared) {
      const tmBounds = getPlayableBoundsFromTilemap(this.tilemap)
      this.tumbleweedRenderer.trigger(tmBounds.minX, tmBounds.maxX, tmBounds.minY, tmBounds.maxY)
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

  render(alpha: number, fps: number): void {
    // Compute real delta time for effects
    const now = performance.now()
    const realDt = Math.min((now - this.lastRenderTime) / 1000, 0.25)
    this.lastRenderTime = now

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
    {
      const eid = this.playerRenderer.getPlayerEntity()
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
        this.tilemapRenderer.updateBuildingVisibility(px, py, screenX, screenY)
      }
    }

    // Clear debug graphics
    this.debugRenderer.clear()
    this.collisionDebugRenderer.clear()

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
    this.interactableRenderer.render(interactables, realDt)

    // Apply render time scale for slow-mo effects
    const scaledDt = this.timeScale.update(realDt)

    // Render player with interpolation
    this.playerRenderer.render(this.world, alpha, realDt)

    // Dust clouds from player movement
    {
      const eid = this.playerRenderer.getPlayerEntity()
      if (eid !== null) {
        const isRolling = PlayerState.state[eid] === PlayerStateType.ROLLING
        if (isRolling && !this.wasRolling) {
          emitRollDust(this.particles, Position.x[eid]!, Position.y[eid]!)
        }
        this.wasRolling = isRolling

        const vx = Velocity.x[eid]!
        const vy = Velocity.y[eid]!
        const speed = Math.sqrt(vx * vx + vy * vy)
        if (speed > 50 && !isRolling) {
          this.dustAccumulator += realDt
          if (this.dustAccumulator >= 0.06) {
            this.dustAccumulator = 0
            emitMovementDust(this.particles, Position.x[eid]!, Position.y[eid]!)
          }
        } else {
          this.dustAccumulator = 0
        }
      }
    }

    // Advance and render local-only cosmetic player bullets.
    this.bulletRenderer.updateVisualBullets(realDt)
    this.processVisualBulletImpacts()

    // Render bullets with interpolation
    this.bulletRenderer.render(this.world, alpha, realDt)

    // Render enemies with interpolation
    this.enemyRenderer.render(this.world, alpha, realDt)

    // Render NPCs with interpolation
    this.npcRenderer.render(this.world, alpha)

    // Render objective targets
    this.objectiveRenderer.render(this.world, alpha)

    // Render boss attack telegraphs (below entities)
    this.bossAttackRenderer.render(this.world)

    // Render ground cracks (below entities)
    this.groundCrackRenderer.render(this.world)

    // Render boss shockwave rings
    this.bossShockwaveRenderer.render(this.world)

    // Render trap zones (bear traps, caltrops)
    this.trapZoneRenderer.render(this.world)

    // Render map obstacles (crates, barrels, boulders, etc.)
    this.mapObstacleRenderer.render(this.world)

    // Render dynamite pixel-fuse telegraphs + throw arcs.
    this.dynamiteRenderer.render(this.world, realDt, this.particles)

    // Render showdown mark + line
    const playerEid = this.playerRenderer.getPlayerEntity()
    this.showdownRenderer.render(this.world, playerEid !== null ? [playerEid] : [], alpha, realDt)
    this.lastRitesRenderer.render(this.world, alpha, realDt)

    // Update tumbleweeds
    this.tumbleweedRenderer.update(scaledDt)

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
    const stateCounts = [0, 0, 0, 0, 0, 0, 0]
    for (const eid of aiEnemies) {
      const s = EnemyAI.state[eid]!
      if (s < 7) stateCounts[s] = stateCounts[s]! + 1
    }
    const enemyStates = STATE_LABELS
      .map((label, i) => stateCounts[i]! > 0 ? `${label}:${stateCounts[i]}` : null)
      .filter(Boolean)
      .join(' ')

    const enc = this.world.encounter

    const runState = this.world.run
    const stats: DebugStats = {
      fps,
      tick: this.world.tick,
      entityCount: this.spriteRegistry.count,
      playerState: playerEid !== null
        ? (PLAYER_STATE_NAMES[PlayerState.state[playerEid]!] ?? 'unknown')
        : '(none)',
      enemyCount: this.enemyRenderer.count,
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

    this.debugRenderer.updateStats(stats)
  }

  destroy(): void {
    this.gameplayEvents.clear()
    this.pendingVisualShots.length = 0
    this.particles.destroy()
    this.floatingText.destroy()
    this.sound.destroy()
    window.removeEventListener('keydown', this.handleKeyDown)
    this.input.destroy()
    this.deathPresentation.destroy()
    this.lightingSystem.destroy()
    this.debugRenderer.destroy()
    this.collisionDebugRenderer.destroy()
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
    this.trapZoneRenderer.destroy()
    this.mapObstacleRenderer.destroy()
    this.showdownRenderer.destroy()
    this.tumbleweedRenderer.destroy()
    this.bulletRenderer.destroy()
    this.spriteRegistry.destroy()
  }
}
