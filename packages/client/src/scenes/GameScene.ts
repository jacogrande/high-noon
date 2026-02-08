/**
 * GameScene - Owns all game state, systems, and renderers.
 *
 * Extracted from Game.tsx to separate game logic from React lifecycle.
 * Does NOT own GameApp or GameLoop — those remain in the React component.
 */

import {
  createGameWorld,
  createSystemRegistry,
  stepWorld,
  spawnPlayer,
  setWorldTilemap,
  setEncounter,
  createTestArena,
  getArenaCenter,
  getPlayableBounds,
  STAGE_1_ENCOUNTER,
  movementSystem,
  playerInputSystem,
  rollSystem,
  showdownSystem,
  cylinderSystem,
  collisionSystem,
  weaponSystem,
  bulletSystem,
  bulletCollisionSystem,
  healthSystem,
  debugSpawnSystem,
  flowFieldSystem,
  enemyDetectionSystem,
  enemyAISystem,
  enemySteeringSystem,
  enemyAttackSystem,
  spatialHashSystem,
  waveSpawnerSystem,
  buffSystem,
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
  hasButton,
  Button,
} from '@high-noon/shared'
import { defineQuery, hasComponent } from 'bitecs'
import { Text, TextStyle, Graphics } from 'pixi.js'
import type { GameApp } from '../engine/GameApp'
import { Input } from '../engine/Input'
import { Camera } from '../engine/Camera'
import { HitStop } from '../engine/HitStop'
import { DebugRenderer, type DebugStats } from '../render/DebugRenderer'
import { SpriteRegistry } from '../render/SpriteRegistry'
import { PlayerRenderer } from '../render/PlayerRenderer'
import { BulletRenderer } from '../render/BulletRenderer'
import { EnemyRenderer } from '../render/EnemyRenderer'
import { ShowdownRenderer } from '../render/ShowdownRenderer'
import { TilemapRenderer, CollisionDebugRenderer } from '../render/TilemapRenderer'
import { SoundManager } from '../audio/SoundManager'
import { SOUND_DEFS } from '../audio/sounds'
import { ParticlePool, FloatingTextPool, emitMuzzleFlash, emitDeathBurst, emitWallImpact, emitEntityImpact, emitLevelUpSparkle } from '../fx'

const GAME_ZOOM = 2

/** Death sequence timing */
const DEATH_ANIM_DURATION = 0.75 // 6 frames at 8 FPS (seconds)
const FADE_DURATION = 1.0         // black fade-in duration (seconds)
const GAME_OVER_DELAY = DEATH_ANIM_DURATION + FADE_DURATION

const enemyAIQuery = defineQuery([Enemy, EnemyAI])
const bulletCountQuery = defineQuery([Bullet])
const STATE_LABELS = ['IDL', 'CHS', 'TEL', 'ATK', 'REC', 'STN', 'FLE']

const PLAYER_STATE_NAMES: Record<number, string> = {
  [PlayerStateType.IDLE]: 'idle',
  [PlayerStateType.MOVING]: 'moving',
  [PlayerStateType.ROLLING]: 'rolling',
}

export interface GameSceneConfig {
  gameApp: GameApp
}

export interface HUDState {
  hp: number
  maxHP: number
  xp: number
  xpForCurrentLevel: number
  xpForNextLevel: number
  level: number
  waveNumber: number
  totalWaves: number
  waveStatus: 'active' | 'delay' | 'completed' | 'none'
  cylinderRounds: number
  cylinderMax: number
  isReloading: boolean
  reloadProgress: number
  showdownActive: boolean
  showdownCooldown: number
  showdownCooldownMax: number
  showdownTimeLeft: number
  showdownDurationMax: number
  pendingPoints: number
  isDead: boolean
}

export type SkillNodeState = 'taken' | 'available' | 'locked' | 'unimplemented'

export interface SkillTreeUIData {
  branches: Array<{
    id: string; name: string; description: string
    nodes: Array<{
      id: string; name: string; description: string; tier: number
      state: SkillNodeState
    }>
  }>
  pendingPoints: number
  level: number
}

export class GameScene {
  private readonly gameApp: GameApp
  private readonly input: Input
  private readonly camera: Camera
  private readonly hitStop: HitStop
  private readonly world: GameWorld
  private readonly systems: SystemRegistry
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
  private readonly gameOverText: Text
  private readonly fadeOverlay: Graphics
  private deathTime: number | null = null
  private lastRenderTime: number
  private readonly handleKeyDown: (e: KeyboardEvent) => void
  private lastProcessedLevel = 0
  private dryFireCooldown = 0

  private constructor(config: GameSceneConfig) {
    this.gameApp = config.gameApp

    // Input
    this.input = new Input()

    // Tilemap
    this.tilemap = createTestArena()

    // ECS world + systems
    this.world = createGameWorld()
    setWorldTilemap(this.world, this.tilemap)
    this.systems = createSystemRegistry()

    // Register systems in execution order
    this.systems.register(playerInputSystem)
    this.systems.register(rollSystem)
    this.systems.register(showdownSystem)
    this.systems.register(cylinderSystem)
    this.systems.register(weaponSystem)
    this.systems.register(debugSpawnSystem)
    this.systems.register(waveSpawnerSystem)
    this.systems.register(bulletSystem)
    this.systems.register(flowFieldSystem)
    this.systems.register(enemyDetectionSystem)
    this.systems.register(enemyAISystem)
    this.systems.register(spatialHashSystem)
    this.systems.register(enemySteeringSystem)
    this.systems.register(enemyAttackSystem)
    this.systems.register(movementSystem)
    this.systems.register(bulletCollisionSystem)
    this.systems.register(healthSystem)
    this.systems.register(buffSystem)
    this.systems.register(collisionSystem)

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

    this.lastRenderTime = performance.now()

    // Black fade overlay (hidden by default)
    this.fadeOverlay = new Graphics()
    this.fadeOverlay.rect(0, 0, 1, 1)
    this.fadeOverlay.fill(0x000000)
    this.fadeOverlay.alpha = 0
    this.fadeOverlay.visible = false
    this.gameApp.layers.ui.addChild(this.fadeOverlay)

    // Game Over text (hidden by default)
    this.gameOverText = new Text({
      text: 'GAME OVER',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 72,
        fill: '#cc0000',
        stroke: { color: '#000000', width: 6 },
      }),
    })
    this.gameOverText.anchor.set(0.5)
    this.gameOverText.visible = false
    this.gameApp.layers.ui.addChild(this.gameOverText)

    // Debug toggles
    this.handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Backquote') {
        this.debugRenderer.toggle()
        this.collisionDebugRenderer.toggle()
      }
      // P = pause spawns + kill all enemies
      if (e.code === 'KeyP') {
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
    }
    window.addEventListener('keydown', this.handleKeyDown)
  }

  static async create(config: GameSceneConfig): Promise<GameScene> {
    return new GameScene(config)
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
    stepWorld(this.world, this.systems, inputState)

    // Showdown audio cues
    if (this.world.showdownActivatedThisTick) this.sound.play('showdown_activate')
    if (this.world.showdownKillThisTick) this.sound.play('showdown_kill')
    if (this.world.showdownExpiredThisTick) this.sound.play('showdown_expire')

    // Set showdown target for enemy tinting
    this.enemyRenderer.showdownTargetEid =
      playerEid !== null && hasComponent(this.world, Showdown, playerEid) && Showdown.active[playerEid]! === 1
        ? Showdown.targetEid[playerEid]!
        : NO_TARGET

    // Detect player damage (i-frames went from 0 to >0)
    if (playerEid !== null) {
      const newIframes = Health.iframes[playerEid]!
      if (prevIframes === 0 && newIframes > 0) {
        this.camera.addTrauma(0.15)
        this.hitStop.freeze(0.05)
        this.sound.play('player_hit')
        // Directional camera kick toward damage source
        const hdx = this.world.lastPlayerHitDirX
        const hdy = this.world.lastPlayerHitDirY
        if (hdx !== 0 || hdy !== 0) {
          this.camera.applyKick(hdx, hdy, 4)
        }
      }
    }

    // Sync renderers (create/remove sprites)
    this.playerRenderer.sync(this.world)

    // Sync enemy renderer — returns death trauma + per-death data
    const enemySync = this.enemyRenderer.sync(this.world)
    if (enemySync.deathTrauma > 0) {
      this.camera.addTrauma(enemySync.deathTrauma)
      this.sound.play('enemy_die')
    }
    for (const death of enemySync.deaths) {
      emitDeathBurst(this.particles, death.x, death.y, death.color, death.isThreat)
    }
    for (const hit of enemySync.hits) {
      emitEntityImpact(this.particles, hit.x, hit.y, hit.color)
      this.floatingText.spawn(hit.x, hit.y, hit.amount, hit.color)
    }

    // Sync bullet sprites
    this.bulletRenderer.sync(this.world)

    // Bullet removal particles (player bullets only)
    for (const pos of this.bulletRenderer.removedPositions) {
      emitWallImpact(this.particles, pos.x, pos.y)
    }

    // Detect player fire (cylinder rounds decreased)
    if (playerEid !== null && prevRounds >= 0 && hasComponent(this.world, Cylinder, playerEid)) {
      const newRounds = Cylinder.rounds[playerEid]!
      if (newRounds < prevRounds) {
        const angle = Player.aimAngle[playerEid]!
        this.camera.addTrauma(0.15)
        this.camera.applyKick(Math.cos(angle), Math.sin(angle), 5)
        this.sound.play('fire')
        this.playerRenderer.triggerRecoil(playerEid)

        // Emit muzzle flash from barrel tip if available, otherwise from player center
        const barrelTip = this.playerRenderer.getBarrelTipPosition(playerEid)
        if (barrelTip) {
          emitMuzzleFlash(this.particles, barrelTip.x, barrelTip.y, angle)
        } else {
          emitMuzzleFlash(this.particles, Position.x[playerEid]!, Position.y[playerEid]!, angle)
        }
      }
    }

    // Detect reload state transitions
    if (playerEid !== null && hasComponent(this.world, Cylinder, playerEid)) {
      const nowReloading = Cylinder.reloading[playerEid]!
      if (prevReloading === 0 && nowReloading === 1) {
        this.sound.play('reload_start')
      } else if (prevReloading === 1 && nowReloading === 0) {
        this.sound.play('reload_complete')
      }
    }

    // Dry fire: shoot pressed, empty cylinder, not reloading
    this.dryFireCooldown = Math.max(0, this.dryFireCooldown - dt)
    if (playerEid !== null && hasComponent(this.world, Cylinder, playerEid)
        && Cylinder.rounds[playerEid]! === 0 && hasButton(inputState, Button.SHOOT)
        && Cylinder.reloading[playerEid]! === 0 && this.dryFireCooldown <= 0) {
      this.sound.play('dry_fire')
      this.dryFireCooldown = 0.3
    }

    // Level-up detection
    if (this.world.upgradeState.level > this.lastProcessedLevel) {
      this.lastProcessedLevel = this.world.upgradeState.level
      this.sound.play('level_up')
      if (playerEid !== null) {
        emitLevelUpSparkle(this.particles, Position.x[playerEid]!, Position.y[playerEid]!)
      }
    }

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

    // Death sequence: anim → fade to black → GAME OVER text
    if (this.isPlayerDead()) {
      if (this.deathTime === null) {
        this.deathTime = performance.now()
      }

      const elapsed = (performance.now() - this.deathTime) / 1000

      // Phase 2: Fade to black after death animation completes
      if (elapsed > DEATH_ANIM_DURATION) {
        this.fadeOverlay.visible = true
        this.fadeOverlay.scale.set(this.gameApp.width, this.gameApp.height)
        const fadeProgress = Math.min((elapsed - DEATH_ANIM_DURATION) / FADE_DURATION, 1)
        this.fadeOverlay.alpha = fadeProgress
      }

      // Phase 3: Show GAME OVER text after fade completes
      if (elapsed > GAME_OVER_DELAY) {
        this.gameOverText.x = this.gameApp.width / 2
        this.gameOverText.y = this.gameApp.height / 2
        this.gameOverText.visible = true
      }
    }

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
    this.particles.destroy()
    this.floatingText.destroy()
    this.sound.destroy()
    window.removeEventListener('keydown', this.handleKeyDown)
    this.input.destroy()
    this.fadeOverlay.destroy()
    this.gameOverText.destroy()
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
