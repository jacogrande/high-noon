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
  setEncounter,
  createTestArena,
  getArenaCenter,
  getPlayableBounds,
  STAGE_1_ENCOUNTER,
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
import { TilemapRenderer, CollisionDebugRenderer } from '../../render/TilemapRenderer'
import { SoundManager } from '../../audio/SoundManager'
import { SOUND_DEFS } from '../../audio/sounds'
import { ParticlePool, FloatingTextPool } from '../../fx'
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
  emitPlayerHitEvent,
  emitShowdownCueEvents,
} from './PlayerPresentationEvents'
import type { HUDState, SkillNodeState, SkillTreeUIData } from '../types'

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
  private readonly showdownRenderer: ShowdownRenderer
  private readonly tilemapRenderer: TilemapRenderer
  private readonly collisionDebugRenderer: CollisionDebugRenderer
  private readonly sound: SoundManager
  private readonly particles: ParticlePool
  private readonly floatingText: FloatingTextPool
  private readonly gameplayEvents: GameplayEventBuffer
  private readonly gameplayEventProcessor: GameplayEventProcessor
  private readonly deathPresentation: DeathSequencePresentation
  private lastRenderTime: number
  private readonly handleKeyDown: (e: KeyboardEvent) => void
  private lastProcessedLevel = 0
  private dryFireCooldown = 0

  constructor(gameApp: GameApp) {
    this.gameApp = gameApp

    // Input
    this.input = new Input()

    // Tilemap
    this.tilemap = createTestArena()

    // ECS world + systems
    this.world = createGameWorld()
    setWorldTilemap(this.world, this.tilemap)
    this.systems = createSystemRegistry()

    // Register all 19 simulation systems in canonical order
    registerAllSystems(this.systems)
    this.simulationDriver = new FullWorldSimulationDriver(this.world, this.systems)

    // Renderers
    this.tilemapRenderer = new TilemapRenderer(this.gameApp.layers.background)
    this.tilemapRenderer.render(this.tilemap)

    this.debugRenderer = new DebugRenderer(this.gameApp.layers.ui)
    this.spriteRegistry = new SpriteRegistry(this.gameApp.layers.entities)
    this.playerRenderer = new PlayerRenderer(this.gameApp.layers.entities)
    this.bulletRenderer = new BulletRenderer(this.spriteRegistry)
    this.enemyRenderer = new EnemyRenderer(this.spriteRegistry, this.debugRenderer)
    this.showdownRenderer = new ShowdownRenderer(this.gameApp.layers.entities)
    this.collisionDebugRenderer = new CollisionDebugRenderer(this.gameApp.layers.ui)

    // Debug graphics in entity layer (world space)
    this.gameApp.layers.entities.addChild(this.debugRenderer.getContainer())

    // Spawn player at arena center
    const { x: centerX, y: centerY } = getArenaCenter()
    spawnPlayer(this.world, centerX, centerY)

    // Start the wave encounter
    setEncounter(this.world, STAGE_1_ENCOUNTER)

    this.playerRenderer.sync(this.world)

    // Zoom
    this.gameApp.world.scale.set(GAME_ZOOM)

    // Camera
    this.camera = new Camera()
    this.camera.setViewport(this.gameApp.width / GAME_ZOOM, this.gameApp.height / GAME_ZOOM)
    const bounds = getPlayableBounds()
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
    this.gameplayEvents = new GameplayEventBuffer()
    this.gameplayEventProcessor = new GameplayEventProcessor({
      camera: this.camera,
      sound: this.sound,
      particles: this.particles,
      floatingText: this.floatingText,
      playerRenderer: this.playerRenderer,
      hitStop: this.hitStop,
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
    const { xp, level } = this.world.upgradeState
    const xpForCurrentLevel = LEVEL_THRESHOLDS[level] ?? 0
    const xpForNextLevel = level < MAX_LEVEL ? LEVEL_THRESHOLDS[level + 1]! : xpForCurrentLevel
    return {
      hp: playerEid !== null ? Health.current[playerEid]! : 0,
      maxHP: playerEid !== null ? Health.max[playerEid]! : 0,
      xp,
      xpForCurrentLevel,
      xpForNextLevel,
      level,
      waveNumber: enc ? enc.currentWave + 1 : 0,
      totalWaves: enc ? enc.definition.waves.length : 0,
      waveStatus: enc ? (enc.completed ? 'completed' : enc.waveActive ? 'active' : 'delay') : 'none',
      cylinderRounds: playerEid !== null && hasComponent(this.world, Cylinder, playerEid)
        ? Cylinder.rounds[playerEid]! : 0,
      cylinderMax: playerEid !== null && hasComponent(this.world, Cylinder, playerEid)
        ? Cylinder.maxRounds[playerEid]! : 0,
      isReloading: playerEid !== null && hasComponent(this.world, Cylinder, playerEid)
        ? Cylinder.reloading[playerEid]! === 1 : false,
      reloadProgress: playerEid !== null && hasComponent(this.world, Cylinder, playerEid)
        ? (Cylinder.reloading[playerEid]! === 1 && Cylinder.reloadTime[playerEid]! > 0
            ? Math.min(1, Cylinder.reloadTimer[playerEid]! / Cylinder.reloadTime[playerEid]!)
            : 0)
        : 0,
      showdownActive: playerEid !== null && hasComponent(this.world, Showdown, playerEid)
        ? Showdown.active[playerEid]! === 1 : false,
      showdownCooldown: playerEid !== null && hasComponent(this.world, Showdown, playerEid)
        ? Showdown.cooldown[playerEid]! : 0,
      showdownCooldownMax: this.world.upgradeState.showdownCooldown,
      showdownTimeLeft: playerEid !== null && hasComponent(this.world, Showdown, playerEid)
        ? Showdown.duration[playerEid]! : 0,
      showdownDurationMax: this.world.upgradeState.showdownDuration,
      pendingPoints: this.world.upgradeState.pendingPoints,
      isDead: this.isPlayerDead(),
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

    emitShowdownCueEvents(this.gameplayEvents, this.world)

    // Set showdown target for enemy tinting
    this.enemyRenderer.showdownTargetEid =
      playerEid !== null && hasComponent(this.world, Showdown, playerEid) && Showdown.active[playerEid]! === 1
        ? Showdown.targetEid[playerEid]!
        : NO_TARGET

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

    // Clear debug graphics
    this.debugRenderer.clear()
    this.collisionDebugRenderer.clear()

    // Render player with interpolation
    this.playerRenderer.render(this.world, alpha, realDt)

    // Render bullets with interpolation
    this.bulletRenderer.render(this.world, alpha)

    // Render enemies with interpolation
    this.enemyRenderer.render(this.world, alpha, realDt)

    // Render showdown mark + line
    const playerEid = this.playerRenderer.getPlayerEntity()
    this.showdownRenderer.render(this.world, playerEid, alpha, realDt)

    // Update particles (visual-only, uses real frame dt)
    this.particles.update(realDt)
    this.floatingText.update(realDt)

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
    this.debugRenderer.destroy()
    this.collisionDebugRenderer.destroy()
    this.tilemapRenderer.destroy()
    this.playerRenderer.destroy()
    this.enemyRenderer.destroy()
    this.showdownRenderer.destroy()
    this.bulletRenderer.destroy()
    this.spriteRegistry.destroy()
  }
}
