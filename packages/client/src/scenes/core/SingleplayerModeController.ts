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
  type CharacterId,
} from '@high-noon/shared'
import { defineQuery, hasComponent } from 'bitecs'
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
import { InteractableRenderer } from '../../render/InteractableRenderer'
import { TilemapRenderer, CollisionDebugRenderer } from '../../render/TilemapRenderer'
import { LightingSystem, createMuzzleFlashLight } from '../../lighting'
import { SoundManager } from '../../audio/SoundManager'
import { SOUND_DEFS } from '../../audio/sounds'
import { ParticlePool, FloatingTextPool, ChatBubblePool } from '../../fx'
import { NpcRenderer } from '../../render/NpcRenderer'
import { GameplayEventBuffer } from './GameplayEvents'
import { GameplayEventProcessor } from './GameplayEventProcessor'
import { FullWorldSimulationDriver } from './SimulationDriver'
import {
  didTakeDamageFromIframes,
} from './feedbackSignals'
import { syncRenderersAndQueueEvents } from './syncRenderersAndQueueEvents'
import type { SceneModeController } from './SceneModeController'
import { DeathSequencePresentation } from './DeathSequencePresentation'
import { SINGLEPLAYER_PRESENTATION_POLICY } from './PresentationPolicy'
import { createSceneDebugHotkeyHandler } from './SceneDebugHotkeys'
import {
  emitCylinderPresentationEvents,
  emitDynamiteCueEvents,
  emitLastRitesCueEvents,
  emitMeleeSwingEvents,
  emitPlayerHitEvent,
  emitShowdownCueEvents,
} from './PlayerPresentationEvents'
import type { HUDState, SkillNodeState, SkillTreeUIData } from '../types'
import { seedHazardLights } from './SceneLighting'
import { refreshTilemap } from './refreshTilemap'

const GAME_ZOOM = 2

const enemyAIQuery = defineQuery([Enemy, EnemyAI])
const bulletCountQuery = defineQuery([Bullet])
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
  private readonly showdownRenderer: ShowdownRenderer
  private readonly lastRitesRenderer: LastRitesRenderer
  private readonly dynamiteRenderer: DynamiteRenderer
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
  private lastRenderTime: number
  private readonly handleKeyDown: (e: KeyboardEvent) => void
  private lastProcessedLevel = 0
  private dryFireCooldown = 0

  constructor(gameApp: GameApp, characterId: CharacterId = 'sheriff') {
    this.gameApp = gameApp

    // Input
    this.input = new Input()

    // ECS world + systems
    this.world = createGameWorld(undefined, getCharacterDef(characterId))

    // Generate first stage's tilemap from the run config
    const stage0Config = DEFAULT_RUN_STAGES[0]!.mapConfig
    this.tilemap = generateArena(stage0Config, this.world.initialSeed, 0)
    setWorldTilemap(this.world, this.tilemap)
    this.systems = createSystemRegistry()

    // Register all 19 simulation systems in canonical order
    registerAllSystems(this.systems)
    this.simulationDriver = new FullWorldSimulationDriver(this.world, this.systems)

    // Renderers
    this.tilemapRenderer = new TilemapRenderer(this.gameApp.layers.background)
    this.tilemapRenderer.render(this.tilemap)
    this.lightingSystem = new LightingSystem(this.gameApp.app.renderer, this.gameApp.width, this.gameApp.height)
    const uiIndex = this.gameApp.stage.getChildIndex(this.gameApp.layers.ui)
    this.gameApp.stage.addChildAt(this.lightingSystem.getLightmapSprite(), uiIndex)
    seedHazardLights(this.lightingSystem, this.tilemap)
    this.currentTilemap = this.tilemap

    this.debugRenderer = new DebugRenderer(this.gameApp.layers.ui)
    this.interactableRenderer = new InteractableRenderer(this.gameApp.layers.entities)
    this.spriteRegistry = new SpriteRegistry(this.gameApp.layers.entities)
    this.lastRitesRenderer = new LastRitesRenderer(this.gameApp.layers.entities)
    this.dynamiteRenderer = new DynamiteRenderer(this.gameApp.layers.entities)
    this.playerRenderer = new PlayerRenderer(this.gameApp.layers.entities)
    this.bulletRenderer = new BulletRenderer(this.spriteRegistry)
    this.enemyRenderer = new EnemyRenderer(this.spriteRegistry, this.debugRenderer)
    this.npcRenderer = new NpcRenderer(this.spriteRegistry)
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

    // Zoom
    this.gameApp.world.scale.set(GAME_ZOOM)

    // Camera
    this.camera = new Camera()
    this.camera.setViewport(this.gameApp.width / GAME_ZOOM, this.gameApp.height / GAME_ZOOM)
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
    this.floatingText = new FloatingTextPool(this.gameApp.layers.fx)
    this.chatBubblePool = new ChatBubblePool(this.gameApp.layers.entities)
    this.gameplayEvents = new GameplayEventBuffer()
    this.gameplayEventProcessor = new GameplayEventProcessor({
      camera: this.camera,
      sound: this.sound,
      particles: this.particles,
      floatingText: this.floatingText,
      playerRenderer: this.playerRenderer,
      hitStop: this.hitStop,
      spawnMuzzleLight: (x, y) => this.lightingSystem.addLight(createMuzzleFlashLight(x, y)),
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
    const shovelCount = this.world.shovelCount
    const interactionPrompt = playerEid !== null
      ? (this.world.interactionPromptByPlayer.get(playerEid) ?? null)
      : null
    return {
      characterId,
      hp: playerEid !== null ? Health.current[playerEid]! : state.maxHP,
      maxHP: playerEid !== null ? Health.max[playerEid]! : state.maxHP,
      xp,
      goldCollected: this.world.goldCollected,
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
        ? (run.completed ? 'completed' : run.transition === 'camp' ? 'camp' : run.transition !== 'none' ? 'clearing' : 'active')
        : 'none',
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
      items: Array.from(state.items.entries()).map(([itemId, stacks]) => {
        const def = getItemDef(itemId)
        return {
          itemId,
          key: def?.key ?? '',
          name: def?.name ?? '???',
          rarity: def?.rarity ?? 'brass',
          stacks,
        }
      }),
    }
  }

  hasPendingPoints(): boolean {
    return this.world.upgradeState.pendingPoints > 0
  }

  isDisconnected(): boolean {
    return false
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

  completeCamp(): void {
    this.world.campComplete = true
  }

  setWorldVisible(visible: boolean): void {
    this.gameApp.world.visible = visible
  }

  update(dt: number): void {
    // Stop simulation when local player is dead
    if (this.isPlayerDead()) return

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
    this.input.setCamera(camPos.x, camPos.y, this.gameApp.width, this.gameApp.height, GAME_ZOOM)

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

    emitShowdownCueEvents(this.gameplayEvents, this.world)
    emitLastRitesCueEvents(this.gameplayEvents, this.world)
    emitDynamiteCueEvents(this.gameplayEvents, this.world, playerEid)

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
      chatBubblePool: this.chatBubblePool,
    })

    this.dryFireCooldown = Math.max(0, this.dryFireCooldown - dt)
    if (playerEid !== null && prevRounds >= 0 && hasComponent(this.world, Cylinder, playerEid)) {
      const newRounds = Cylinder.rounds[playerEid]!
      const nowReloading = Cylinder.reloading[playerEid]!
      const angle = Player.aimAngle[playerEid]!
      const barrelTip = this.playerRenderer.getBarrelTipFromState(this.world, playerEid)
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
        muzzleX: barrelTip?.x ?? Position.x[playerEid]!,
        muzzleY: barrelTip?.y ?? Position.y[playerEid]!,
        fireTrauma: 0.15,
        fireKickStrength: 5,
      })
    }
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

    // Update camera viewport in world coords (handles resize)
    this.camera.setViewport(this.gameApp.width / GAME_ZOOM, this.gameApp.height / GAME_ZOOM)

    // Get interpolated camera state with shake + kick
    const camState = this.camera.getRenderState(alpha, realDt)

    // Apply camera transform to world container
    const halfW = this.gameApp.width / 2
    const halfH = this.gameApp.height / 2
    this.gameApp.world.pivot.set(camState.x, camState.y)
    this.gameApp.world.position.set(halfW, halfH)
    this.gameApp.world.rotation = camState.angle

    this.lightingSystem.updateLights(realDt)
    this.lightingSystem.resize(this.gameApp.width, this.gameApp.height)
    this.lightingSystem.render(camState.x, camState.y, GAME_ZOOM)

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
    }
    this.interactableRenderer.render(interactables, realDt)

    // Render player with interpolation
    this.playerRenderer.render(this.world, alpha, realDt)

    // Render bullets with interpolation
    this.bulletRenderer.render(this.world, alpha)

    // Render enemies with interpolation
    this.enemyRenderer.render(this.world, alpha, realDt)

    // Render NPCs with interpolation
    this.npcRenderer.render(this.world, alpha)

    // Render dynamite pixel-fuse telegraphs + throw arcs.
    this.dynamiteRenderer.render(this.world, realDt, this.particles)

    // Render showdown mark + line
    const playerEid = this.playerRenderer.getPlayerEntity()
    this.showdownRenderer.render(this.world, playerEid !== null ? [playerEid] : [], alpha, realDt)
    this.lastRitesRenderer.render(this.world, alpha, realDt)

    // Update particles (visual-only, uses real frame dt)
    this.particles.update(realDt)
    this.floatingText.update(realDt)
    this.chatBubblePool.update(realDt, this.world)

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
        ? (runState.completed ? 'completed' : runState.transition === 'camp' ? 'camp' : runState.transition !== 'none' ? 'clearing' : 'active')
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
    this.chatBubblePool.destroy()
    this.enemyRenderer.destroy()
    this.lastRitesRenderer.destroy()
    this.dynamiteRenderer.destroy()
    this.showdownRenderer.destroy()
    this.bulletRenderer.destroy()
    this.spriteRegistry.destroy()
  }
}
