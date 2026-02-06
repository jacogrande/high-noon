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
  spawnSwarmer,
  spawnGrunt,
  spawnShooter,
  spawnCharger,
  setWorldTilemap,
  createTestArena,
  getArenaCenter,
  getPlayableBounds,
  movementSystem,
  playerInputSystem,
  rollSystem,
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
  Bullet,
  type GameWorld,
  type SystemRegistry,
  type Tilemap,
} from '@high-noon/shared'
import { defineQuery, hasComponent } from 'bitecs'
import { Text, TextStyle } from 'pixi.js'
import type { GameApp } from '../engine/GameApp'
import { Input } from '../engine/Input'
import { Camera } from '../engine/Camera'
import { HitStop } from '../engine/HitStop'
import { DebugRenderer, type DebugStats } from '../render/DebugRenderer'
import { SpriteRegistry } from '../render/SpriteRegistry'
import { PlayerRenderer } from '../render/PlayerRenderer'
import { BulletRenderer } from '../render/BulletRenderer'
import { EnemyRenderer } from '../render/EnemyRenderer'
import { TilemapRenderer, CollisionDebugRenderer } from '../render/TilemapRenderer'

const GAME_ZOOM = 2

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
  private readonly tilemapRenderer: TilemapRenderer
  private readonly collisionDebugRenderer: CollisionDebugRenderer
  private readonly gameOverText: Text
  private lastRenderTime: number
  private readonly handleKeyDown: (e: KeyboardEvent) => void

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
    this.systems.register(weaponSystem)
    this.systems.register(debugSpawnSystem)
    this.systems.register(bulletSystem)
    this.systems.register(flowFieldSystem)
    this.systems.register(enemyDetectionSystem)
    this.systems.register(enemyAISystem)
    this.systems.register(enemySteeringSystem)
    this.systems.register(enemyAttackSystem)
    this.systems.register(movementSystem)
    this.systems.register(bulletCollisionSystem)
    this.systems.register(healthSystem)
    this.systems.register(collisionSystem)

    // Renderers
    this.tilemapRenderer = new TilemapRenderer(this.gameApp.layers.background)
    this.tilemapRenderer.render(this.tilemap)

    this.debugRenderer = new DebugRenderer(this.gameApp.layers.ui)
    this.spriteRegistry = new SpriteRegistry(this.gameApp.layers.entities)
    this.playerRenderer = new PlayerRenderer(this.spriteRegistry)
    this.bulletRenderer = new BulletRenderer(this.spriteRegistry)
    this.enemyRenderer = new EnemyRenderer(this.spriteRegistry, this.debugRenderer)
    this.collisionDebugRenderer = new CollisionDebugRenderer(this.gameApp.layers.ui)

    // Debug graphics in entity layer (world space)
    this.gameApp.layers.entities.addChild(this.debugRenderer.getContainer())

    // Spawn player at arena center
    const { x: centerX, y: centerY } = getArenaCenter()
    spawnPlayer(this.world, centerX, centerY)

    // Test enemy spawns (temporary — removed in Phase 5)
    spawnSwarmer(this.world, centerX + 100, centerY - 80)
    spawnSwarmer(this.world, centerX + 120, centerY - 60)
    spawnSwarmer(this.world, centerX + 140, centerY - 40)
    spawnGrunt(this.world, centerX - 100, centerY + 60)
    spawnGrunt(this.world, centerX - 130, centerY + 80)
    spawnShooter(this.world, centerX + 200, centerY + 100)
    spawnCharger(this.world, centerX - 200, centerY - 100)

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
    this.lastRenderTime = performance.now()

    // Game Over text (hidden by default)
    this.gameOverText = new Text({
      text: 'GAME OVER',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 48,
        fill: '#ff0000',
        stroke: { color: '#000000', width: 4 },
      }),
    })
    this.gameOverText.anchor.set(0.5)
    this.gameOverText.visible = false
    this.gameApp.layers.ui.addChild(this.gameOverText)

    // Debug toggle (backtick)
    this.handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Backquote') {
        this.debugRenderer.toggle()
        this.collisionDebugRenderer.toggle()
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

    // Snapshot i-frames before sim step for damage detection
    const prevIframes = playerEid !== null ? Health.iframes[playerEid]! : 0

    // Step the simulation
    stepWorld(this.world, this.systems, inputState)

    // Detect player damage (i-frames went from 0 to >0)
    if (playerEid !== null) {
      const newIframes = Health.iframes[playerEid]!
      if (prevIframes === 0 && newIframes > 0) {
        this.camera.addTrauma(0.15)
        this.hitStop.freeze(0.05)
      }
    }

    // Sync renderers (create/remove sprites)
    this.playerRenderer.sync(this.world)

    // Sync enemy renderer — returns death trauma for camera shake
    const deathTrauma = this.enemyRenderer.sync(this.world)
    if (deathTrauma > 0) {
      this.camera.addTrauma(deathTrauma)
    }

    // Detect new bullets for camera effects
    const prevBulletCount = this.bulletRenderer.count
    this.bulletRenderer.sync(this.world)
    if (this.bulletRenderer.count > prevBulletCount && playerEid !== null) {
      const angle = Player.aimAngle[playerEid]!
      this.camera.addTrauma(0.08)
      this.camera.applyKick(Math.cos(angle), Math.sin(angle), 3)
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
    this.playerRenderer.render(this.world, alpha)

    // Render bullets with interpolation
    this.bulletRenderer.render(this.world, alpha)

    // Render enemies with interpolation
    this.enemyRenderer.render(this.world, alpha)

    // Show Game Over text when local player is dead
    if (this.isPlayerDead()) {
      this.gameOverText.x = this.gameApp.width / 2
      this.gameOverText.y = this.gameApp.height / 2
      this.gameOverText.visible = true
    }

    // Build expanded debug stats
    const playerEid = this.playerRenderer.getPlayerEntity()
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
    }

    this.debugRenderer.updateStats(stats)
  }

  destroy(): void {
    window.removeEventListener('keydown', this.handleKeyDown)
    this.input.destroy()
    this.gameOverText.destroy()
    this.debugRenderer.destroy()
    this.collisionDebugRenderer.destroy()
    this.tilemapRenderer.destroy()
    this.enemyRenderer.destroy()
    this.bulletRenderer.destroy()
    this.spriteRegistry.destroy()
  }
}
