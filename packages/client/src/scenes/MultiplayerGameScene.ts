/**
 * MultiplayerGameScene
 *
 * Multiplayer game scene with client-side prediction.
 *
 * Runs a subset of the shared simulation (movement, roll, collision) on the
 * local player for immediate responsiveness. Remote entities are rendered via
 * snapshot interpolation. The server remains authoritative — reconciliation
 * (Epic 5) handles corrections when server state disagrees with prediction.
 */

import { addEntity, addComponent, removeEntity, removeComponent, hasComponent } from 'bitecs'
import {
  createGameWorld,
  createTestArena,
  setWorldTilemap,
  getPlayableBounds,
  getArenaCenter,
  Position,
  Velocity,
  Player,
  PlayerState,
  Collider,
  Health,
  Dead,
  Invincible,
  Bullet,
  Enemy,
  EnemyAI,
  EnemyType,
  EnemyTier,
  CollisionLayer,
  Speed,
  Roll,
  hasButton,
  Button,
  TICK_S,
  PLAYER_RADIUS,
  PLAYER_HP,
  PLAYER_SPEED,
  BULLET_RADIUS,
  SWARMER_RADIUS,
  GRUNT_RADIUS,
  SHOOTER_RADIUS,
  CHARGER_RADIUS,
  createSystemRegistry,
  registerPredictionSystems,
  stepWorld,
  type SystemRegistry,
  type GameWorld,
  type InputState,
  type NetworkInput,
  type WorldSnapshot,
  type PlayerSnapshot,
  type BulletSnapshot,
  type EnemySnapshot,
  type HudData,
} from '@high-noon/shared'
import type { GameApp } from '../engine/GameApp'
import { Input } from '../engine/Input'
import { Camera } from '../engine/Camera'
import { DebugRenderer, type DebugStats } from '../render/DebugRenderer'
import { SpriteRegistry } from '../render/SpriteRegistry'
import { PlayerRenderer } from '../render/PlayerRenderer'
import { BulletRenderer } from '../render/BulletRenderer'
import { EnemyRenderer } from '../render/EnemyRenderer'
import { TilemapRenderer } from '../render/TilemapRenderer'
import { ParticlePool, FloatingTextPool } from '../fx'
import { ClockSync } from '../net/ClockSync'
import { InputBuffer } from '../net/InputBuffer'
import { NetworkClient, type GameConfig } from '../net/NetworkClient'
import { SnapshotBuffer, type InterpolationState } from '../net/SnapshotBuffer'
import type { HUDState } from './GameScene'

const GAME_ZOOM = 2

/** Misprediction smoothing constants */
const SNAP_THRESHOLD = 96    // pixels — teleport if error exceeds this
const EPSILON = 0.5           // pixels — ignore sub-pixel mispredictions
const CORRECTION_SPEED = 15   // exponential decay rate for visual smoothing

/** Enemy radius lookup by EnemyType value */
const ENEMY_RADIUS: Record<number, number> = {
  [EnemyType.SWARMER]: SWARMER_RADIUS,
  [EnemyType.GRUNT]: GRUNT_RADIUS,
  [EnemyType.SHOOTER]: SHOOTER_RADIUS,
  [EnemyType.CHARGER]: CHARGER_RADIUS,
}

/** Enemy tier lookup by EnemyType value */
const ENEMY_TIER: Record<number, number> = {
  [EnemyType.SWARMER]: EnemyTier.FODDER,
  [EnemyType.GRUNT]: EnemyTier.FODDER,
  [EnemyType.SHOOTER]: EnemyTier.THREAT,
  [EnemyType.CHARGER]: EnemyTier.THREAT,
}

export class MultiplayerGameScene {
  private readonly gameApp: GameApp
  private readonly input: Input
  private readonly camera: Camera
  private readonly world: GameWorld
  private readonly debugRenderer: DebugRenderer
  private readonly spriteRegistry: SpriteRegistry
  private readonly playerRenderer: PlayerRenderer
  private readonly bulletRenderer: BulletRenderer
  private readonly enemyRenderer: EnemyRenderer
  private readonly tilemapRenderer: TilemapRenderer
  private readonly particles: ParticlePool
  private readonly floatingText: FloatingTextPool
  private readonly net: NetworkClient
  private readonly clockSync: ClockSync
  private readonly snapshotBuffer: SnapshotBuffer
  private readonly inputBuffer: InputBuffer
  private readonly predictionSystems: SystemRegistry

  /** Input sequence counter for network messages */
  private inputSeq = 0

  /** Server EID → client EID maps */
  private readonly playerEntities = new Map<number, number>()
  private readonly bulletEntities = new Map<number, number>()
  private readonly enemyEntities = new Map<number, number>()

  /** Local player identification */
  private myServerEid = -1
  private myClientEid = -1
  private connected = false

  /** Misprediction visual smoothing offset */
  private errorX = 0
  private errorY = 0

  /** HUD data from server */
  private latestHud: HudData | null = null

  /** Previous HP for damage shake detection */
  private prevHP = -1

  /** Disconnect flag for UX overlay */
  private disconnected = false

  /** Previous SHOOT button state for rising-edge kick detection */
  private prevShootDown = false

  private lastRenderTime: number

  /** Reusable maps for interpolation (avoid per-frame allocation) */
  private readonly fromPlayerIndex = new Map<number, PlayerSnapshot>()
  private readonly fromBulletIndex = new Map<number, BulletSnapshot>()
  private readonly fromEnemyIndex = new Map<number, EnemySnapshot>()

  private constructor(gameApp: GameApp) {
    this.gameApp = gameApp
    this.input = new Input()

    // Shadow world — local player is predicted, remote entities populated from snapshots
    this.world = createGameWorld(0)
    const tilemap = createTestArena()
    setWorldTilemap(this.world, tilemap)

    // Renderers
    this.tilemapRenderer = new TilemapRenderer(this.gameApp.layers.background)
    this.tilemapRenderer.render(tilemap)

    this.debugRenderer = new DebugRenderer(this.gameApp.layers.ui)
    this.spriteRegistry = new SpriteRegistry(this.gameApp.layers.entities)
    this.playerRenderer = new PlayerRenderer(this.gameApp.layers.entities)
    this.bulletRenderer = new BulletRenderer(this.spriteRegistry)
    this.enemyRenderer = new EnemyRenderer(this.spriteRegistry, this.debugRenderer)

    // Debug graphics in entity layer (world space)
    this.gameApp.layers.entities.addChild(this.debugRenderer.getContainer())

    // Zoom
    this.gameApp.world.scale.set(GAME_ZOOM)

    // Camera
    this.camera = new Camera()
    this.camera.setViewport(this.gameApp.width / GAME_ZOOM, this.gameApp.height / GAME_ZOOM)
    const bounds = getPlayableBounds()
    this.camera.setBounds(bounds)
    const { x: centerX, y: centerY } = getArenaCenter()
    this.camera.snapTo(centerX, centerY)

    // Particles
    this.particles = new ParticlePool(this.gameApp.layers.fx)
    this.floatingText = new FloatingTextPool(this.gameApp.layers.fx)

    // Network
    this.net = new NetworkClient()
    this.clockSync = new ClockSync()
    this.snapshotBuffer = new SnapshotBuffer()
    this.inputBuffer = new InputBuffer()

    // Prediction systems (movement subset of shared simulation)
    this.predictionSystems = createSystemRegistry()
    registerPredictionSystems(this.predictionSystems)

    this.lastRenderTime = performance.now()
  }

  static async create(gameApp: GameApp): Promise<MultiplayerGameScene> {
    return new MultiplayerGameScene(gameApp)
  }

  get isDisconnected(): boolean { return this.disconnected }

  /** Returns a promise that resolves once game-config is received */
  async connect(options?: Record<string, unknown>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.net.on('disconnect', () => {
        this.connected = false
        this.disconnected = true
        this.latestHud = null
        console.log('[MP] Disconnected from server')
      })

      this.net.on('hud', (data: HudData) => {
        this.latestHud = data
      })

      this.net.on('pong', (clientTime, serverTime) => {
        this.clockSync.onPong(clientTime, serverTime)
      })

      this.net.on('game-config', (config: GameConfig) => {
        this.myServerEid = config.playerEid
        this.connected = true
        console.log(`[MP] Connected — server playerEid=${config.playerEid}`)
        this.clockSync.start((clientTime) => this.net.sendPing(clientTime))
        resolve()
      })

      this.net.on('snapshot', (snapshot: WorldSnapshot) => {
        this.world.tick = snapshot.tick
        this.applyEntityLifecycle(snapshot)

        // Reconcile local player prediction against server authority
        if (this.myClientEid >= 0) {
          this.reconcileLocalPlayer(snapshot)
        }

        this.snapshotBuffer.push(snapshot)
      })

      this.net.join(options).catch(reject)
    })
  }

  // ===========================================================================
  // Entity Lifecycle — sync ECS shadow world with snapshot data
  // ===========================================================================

  private applyEntityLifecycle(snapshot: WorldSnapshot): void {
    this.applyPlayers(snapshot.players)
    this.applyBullets(snapshot.bullets)
    this.applyEnemies(snapshot.enemies)
  }

  private applyPlayers(players: PlayerSnapshot[]): void {
    const seen = new Set<number>()

    for (const p of players) {
      seen.add(p.eid)
      let clientEid = this.playerEntities.get(p.eid)

      if (clientEid === undefined) {
        // New player entity
        clientEid = addEntity(this.world)
        addComponent(this.world, Position, clientEid)
        addComponent(this.world, Velocity, clientEid)
        addComponent(this.world, Player, clientEid)
        addComponent(this.world, PlayerState, clientEid)
        addComponent(this.world, Collider, clientEid)
        addComponent(this.world, Health, clientEid)

        Collider.radius[clientEid] = PLAYER_RADIUS
        Collider.layer[clientEid] = CollisionLayer.PLAYER
        Health.max[clientEid] = PLAYER_HP

        Position.x[clientEid] = p.x
        Position.y[clientEid] = p.y
        Position.prevX[clientEid] = p.x
        Position.prevY[clientEid] = p.y

        this.playerEntities.set(p.eid, clientEid)

        // Identify local player
        if (p.eid === this.myServerEid) {
          this.myClientEid = clientEid
          this.playerRenderer.localPlayerEid = clientEid
          // Prediction requires Speed component
          addComponent(this.world, Speed, clientEid)
          Speed.current[clientEid] = PLAYER_SPEED
          Speed.max[clientEid] = PLAYER_SPEED
        }
      }

      // Write snapshot data
      Player.aimAngle[clientEid] = p.aimAngle
      PlayerState.state[clientEid] = p.state
      Health.current[clientEid] = p.hp

      // Tag components: Dead, Invincible
      const isDead = (p.flags & 1) !== 0
      if (isDead && !hasComponent(this.world, Dead, clientEid)) {
        addComponent(this.world, Dead, clientEid)
      } else if (!isDead && hasComponent(this.world, Dead, clientEid)) {
        removeComponent(this.world, Dead, clientEid)
      }

      const isInvincible = (p.flags & 2) !== 0
      if (isInvincible && !hasComponent(this.world, Invincible, clientEid)) {
        addComponent(this.world, Invincible, clientEid)
      } else if (!isInvincible && hasComponent(this.world, Invincible, clientEid)) {
        removeComponent(this.world, Invincible, clientEid)
      }
    }

    // Remove departed players
    for (const [serverEid, clientEid] of this.playerEntities) {
      if (!seen.has(serverEid)) {
        removeEntity(this.world, clientEid)
        this.playerEntities.delete(serverEid)
        if (serverEid === this.myServerEid) {
          this.myClientEid = -1
          this.playerRenderer.localPlayerEid = null
        }
      }
    }
  }

  private applyBullets(bullets: BulletSnapshot[]): void {
    const seen = new Set<number>()

    for (const b of bullets) {
      seen.add(b.eid)
      let clientEid = this.bulletEntities.get(b.eid)

      if (clientEid === undefined) {
        // New bullet entity
        clientEid = addEntity(this.world)
        addComponent(this.world, Position, clientEid)
        addComponent(this.world, Velocity, clientEid)
        addComponent(this.world, Bullet, clientEid)
        addComponent(this.world, Collider, clientEid)

        Collider.radius[clientEid] = BULLET_RADIUS
        Collider.layer[clientEid] = b.layer
        Bullet.ownerId[clientEid] = 0 // benign default for v1

        Position.x[clientEid] = b.x
        Position.y[clientEid] = b.y
        Position.prevX[clientEid] = b.x
        Position.prevY[clientEid] = b.y

        this.bulletEntities.set(b.eid, clientEid)
      }

      // Write velocity (used for rotation in BulletRenderer)
      Velocity.x[clientEid] = b.vx
      Velocity.y[clientEid] = b.vy
    }

    // Remove departed bullets
    for (const [serverEid, clientEid] of this.bulletEntities) {
      if (!seen.has(serverEid)) {
        removeEntity(this.world, clientEid)
        this.bulletEntities.delete(serverEid)
      }
    }
  }

  private applyEnemies(enemies: EnemySnapshot[]): void {
    const seen = new Set<number>()

    for (const e of enemies) {
      seen.add(e.eid)
      let clientEid = this.enemyEntities.get(e.eid)

      if (clientEid === undefined) {
        // New enemy entity
        clientEid = addEntity(this.world)
        addComponent(this.world, Position, clientEid)
        addComponent(this.world, Velocity, clientEid)
        addComponent(this.world, Collider, clientEid)
        addComponent(this.world, Health, clientEid)
        addComponent(this.world, Enemy, clientEid)
        addComponent(this.world, EnemyAI, clientEid)

        Enemy.type[clientEid] = e.type
        Enemy.tier[clientEid] = ENEMY_TIER[e.type] ?? EnemyTier.FODDER
        Collider.radius[clientEid] = ENEMY_RADIUS[e.type] ?? 10
        Collider.layer[clientEid] = CollisionLayer.ENEMY

        Position.x[clientEid] = e.x
        Position.y[clientEid] = e.y
        Position.prevX[clientEid] = e.x
        Position.prevY[clientEid] = e.y

        this.enemyEntities.set(e.eid, clientEid)
      }

      // Write snapshot data
      Health.current[clientEid] = e.hp
      EnemyAI.state[clientEid] = e.aiState
    }

    // Remove departed enemies
    for (const [serverEid, clientEid] of this.enemyEntities) {
      if (!seen.has(serverEid)) {
        removeEntity(this.world, clientEid)
        this.enemyEntities.delete(serverEid)
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
    // 1. Find local player in snapshot
    const serverPlayer = snapshot.players.find(p => p.eid === this.myServerEid)
    if (!serverPlayer) return

    // Detect damage for camera shake
    if (this.prevHP >= 0 && serverPlayer.hp < this.prevHP) {
      this.camera.addTrauma(0.15)
    }
    this.prevHP = serverPlayer.hp

    // 2. Save current predicted position
    const oldPredX = Position.x[this.myClientEid]!
    const oldPredY = Position.y[this.myClientEid]!

    // 3. Rewind — accept server's authoritative state
    Position.x[this.myClientEid] = serverPlayer.x
    Position.y[this.myClientEid] = serverPlayer.y
    Position.prevX[this.myClientEid] = serverPlayer.x
    Position.prevY[this.myClientEid] = serverPlayer.y
    Velocity.x[this.myClientEid] = 0
    Velocity.y[this.myClientEid] = 0

    // Strip Roll component — not in snapshot, will be re-derived from input replay
    if (hasComponent(this.world, Roll, this.myClientEid)) {
      removeComponent(this.world, Roll, this.myClientEid)
      this.world.rollDodgedBullets.delete(this.myClientEid)
    }

    // Reset rollButtonWasDown — replay will re-derive edge detection
    Player.rollButtonWasDown[this.myClientEid] = 0

    // 4. Discard acknowledged inputs
    this.inputBuffer.acknowledgeUpTo(serverPlayer.lastProcessedSeq)

    // 5. Replay unacknowledged inputs
    const pending = this.inputBuffer.getPending()
    for (const input of pending) {
      Position.prevX[this.myClientEid] = Position.x[this.myClientEid]!
      Position.prevY[this.myClientEid] = Position.y[this.myClientEid]!
      this.world.playerInputs.set(this.myClientEid, input)
      for (const system of this.predictionSystems.getSystems()) {
        system(this.world, TICK_S)
      }
      this.world.playerInputs.clear()
    }

    // 6. Compute misprediction error
    const newPredX = Position.x[this.myClientEid]!
    const newPredY = Position.y[this.myClientEid]!
    const dx = oldPredX - newPredX
    const dy = oldPredY - newPredY
    const errorMag = Math.sqrt(dx * dx + dy * dy)

    if (errorMag > EPSILON) {
      // Accumulate visual offset for smooth correction
      const newErrorX = this.errorX + dx
      const newErrorY = this.errorY + dy
      const totalMag = Math.sqrt(newErrorX * newErrorX + newErrorY * newErrorY)

      if (totalMag > SNAP_THRESHOLD) {
        // Teleport — accumulated error too large to smooth
        this.errorX = 0
        this.errorY = 0
      } else {
        this.errorX = newErrorX
        this.errorY = newErrorY
      }
    }
  }

  // ===========================================================================
  // Update (60Hz) — capture + send input
  // ===========================================================================

  update(_dt: number): void {
    if (!this.connected) return
    if (this.myClientEid < 0) return

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
    this.inputSeq++
    const networkInput: NetworkInput = { ...inputState, seq: this.inputSeq }
    this.inputBuffer.push(networkInput)
    this.net.sendInput(networkInput)

    // Camera kick on fire (rising edge only — one kick per press)
    const shootDown = hasButton(inputState, Button.SHOOT)
    if (shootDown && !this.prevShootDown) {
      const angle = Player.aimAngle[this.myClientEid]!
      this.camera.applyKick(Math.cos(angle), Math.sin(angle), 5)
    }
    this.prevShootDown = shootDown

    // --- PREDICTION ---
    // Apply input to local player and step prediction systems.
    // stepWorld sets playerInputs, runs systems, clears inputs, increments tick.
    // The tick drift is harmless — interpolateFromBuffer overwrites world.tick each render.
    this.world.playerInputs.set(this.myClientEid, inputState)
    stepWorld(this.world, this.predictionSystems)
  }

  // ===========================================================================
  // Render (variable Hz) — interpolate snapshots + draw
  // ===========================================================================

  render(_loopAlpha: number, fps: number): void {
    const now = performance.now()
    const rawDt = (now - this.lastRenderTime) / 1000
    const realDt = Math.min(rawDt, 0.25)
    this.lastRenderTime = now

    // Interpolate snapshot data into ECS arrays
    const interpState = this.snapshotBuffer.getInterpolationState(
      this.clockSync.isConverged() ? this.clockSync.getServerTime() : undefined
    )
    const alpha = interpState ? this.interpolateFromBuffer(interpState) : 0.5

    // Decay misprediction error (frame-rate independent, tighter clamp to prevent
    // near-instant snap when tab is backgrounded and rawDt spikes)
    if (this.errorX !== 0 || this.errorY !== 0) {
      const smoothDt = Math.min(rawDt, 0.1)
      const factor = 1 - Math.exp(-CORRECTION_SPEED * smoothDt)
      this.errorX *= (1 - factor)
      this.errorY *= (1 - factor)
      // Kill tiny residuals
      if (Math.abs(this.errorX) < 0.1) this.errorX = 0
      if (Math.abs(this.errorY) < 0.1) this.errorY = 0
    }

    // Sync renderers (create/remove sprites from ECS queries)
    this.playerRenderer.sync(this.world)
    this.enemyRenderer.sync(this.world)
    this.bulletRenderer.sync(this.world)

    // Camera follow local player (offset by error for smooth visual tracking)
    if (this.myClientEid >= 0) {
      const worldMouse = this.input.getWorldMousePosition()
      this.camera.update(
        Position.x[this.myClientEid]! + this.errorX,
        Position.y[this.myClientEid]! + this.errorY,
        worldMouse.x,
        worldMouse.y,
        realDt,
      )
    }

    // Update camera viewport (handles resize)
    this.camera.setViewport(this.gameApp.width / GAME_ZOOM, this.gameApp.height / GAME_ZOOM)

    // Get camera render state
    const camState = this.camera.getRenderState(alpha, realDt)

    // Apply camera transform to world container
    const halfW = this.gameApp.width / 2
    const halfH = this.gameApp.height / 2
    this.gameApp.world.pivot.set(camState.x, camState.y)
    this.gameApp.world.position.set(halfW, halfH)
    this.gameApp.world.rotation = camState.angle

    // Clear debug
    this.debugRenderer.clear()

    // Apply visual error offset for local player sprite
    const hasError = this.myClientEid >= 0 && (this.errorX !== 0 || this.errorY !== 0)
    if (hasError) {
      Position.x[this.myClientEid] = Position.x[this.myClientEid]! + this.errorX
      Position.y[this.myClientEid] = Position.y[this.myClientEid]! + this.errorY
    }

    // Render entities
    this.playerRenderer.render(this.world, alpha, realDt)

    // Restore logical position after rendering
    if (hasError) {
      Position.x[this.myClientEid] = Position.x[this.myClientEid]! - this.errorX
      Position.y[this.myClientEid] = Position.y[this.myClientEid]! - this.errorY
    }

    this.bulletRenderer.render(this.world, alpha)
    this.enemyRenderer.render(this.world, alpha, realDt)

    // Update particles
    this.particles.update(realDt)
    this.floatingText.update(realDt)

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
      waveNumber: 0,
      waveStatus: 'none',
      fodderAlive: 0,
      threatAlive: 0,
      fodderBudgetLeft: 0,
      xp: 0,
      level: 0,
      pendingPts: 0,
    }
    this.debugRenderer.updateStats(stats)
  }

  /**
   * Write interpolated snapshot data into ECS arrays.
   * Returns the computed interpolation alpha for renderers.
   */
  private interpolateFromBuffer(interp: InterpolationState): number {
    const { from, to, alpha } = interp

    // Interpolate world.tick for smooth animation cycling
    this.world.tick = Math.round(from.tick + (to.tick - from.tick) * alpha)

    // Build index maps from `from` snapshot (reuse maps, clear instead of alloc)
    this.fromPlayerIndex.clear()
    for (const p of from.players) {
      this.fromPlayerIndex.set(p.eid, p)
    }

    this.fromBulletIndex.clear()
    for (const b of from.bullets) {
      this.fromBulletIndex.set(b.eid, b)
    }

    this.fromEnemyIndex.clear()
    for (const e of from.enemies) {
      this.fromEnemyIndex.set(e.eid, e)
    }

    // Interpolate players
    for (const p of to.players) {
      const clientEid = this.playerEntities.get(p.eid)
      if (clientEid === undefined) continue

      // Skip local player — driven by prediction, not interpolation
      if (clientEid === this.myClientEid) continue

      const prev = this.fromPlayerIndex.get(p.eid)
      const fromX = prev?.x ?? p.x
      const fromY = prev?.y ?? p.y

      Position.prevX[clientEid] = fromX
      Position.prevY[clientEid] = fromY
      Position.x[clientEid] = p.x
      Position.y[clientEid] = p.y
    }

    // Interpolate bullets
    for (const b of to.bullets) {
      const clientEid = this.bulletEntities.get(b.eid)
      if (clientEid === undefined) continue

      const prev = this.fromBulletIndex.get(b.eid)
      const fromX = prev?.x ?? b.x
      const fromY = prev?.y ?? b.y

      Position.prevX[clientEid] = fromX
      Position.prevY[clientEid] = fromY
      Position.x[clientEid] = b.x
      Position.y[clientEid] = b.y
    }

    // Interpolate enemies
    for (const e of to.enemies) {
      const clientEid = this.enemyEntities.get(e.eid)
      if (clientEid === undefined) continue

      const prev = this.fromEnemyIndex.get(e.eid)
      const fromX = prev?.x ?? e.x
      const fromY = prev?.y ?? e.y

      Position.prevX[clientEid] = fromX
      Position.prevY[clientEid] = fromY
      Position.x[clientEid] = e.x
      Position.y[clientEid] = e.y
    }

    return alpha
  }

  // ===========================================================================
  // HUD
  // ===========================================================================

  getHUDState(): HUDState {
    const hud = this.latestHud
    return {
      hp: hud?.hp ?? (this.myClientEid >= 0 ? Health.current[this.myClientEid]! : 0),
      maxHP: hud?.maxHp ?? (this.myClientEid >= 0 ? Health.max[this.myClientEid]! : PLAYER_HP),
      xp: 0,
      xpForCurrentLevel: 0,
      xpForNextLevel: 0,
      level: 0,
      waveNumber: 0,
      totalWaves: 0,
      waveStatus: 'none',
      cylinderRounds: hud?.cylinderRounds ?? 0,
      cylinderMax: hud?.cylinderMax ?? 0,
      isReloading: hud?.isReloading ?? false,
      reloadProgress: hud?.reloadProgress ?? 0,
      showdownActive: hud?.showdownActive ?? false,
      showdownCooldown: hud?.showdownCooldown ?? 0,
      showdownCooldownMax: hud?.showdownCooldownMax ?? 0,
      showdownTimeLeft: hud?.showdownTimeLeft ?? 0,
      showdownDurationMax: hud?.showdownDurationMax ?? 0,
      pendingPoints: 0,
      isDead: this.myClientEid >= 0 && hasComponent(this.world, Dead, this.myClientEid),
    }
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  destroy(): void {
    this.inputBuffer.clear()
    this.clockSync.stop()
    this.net.disconnect()
    this.particles.destroy()
    this.floatingText.destroy()
    this.input.destroy()
    this.debugRenderer.destroy()
    this.tilemapRenderer.destroy()
    this.playerRenderer.destroy()
    this.enemyRenderer.destroy()
    this.bulletRenderer.destroy()
    this.spriteRegistry.destroy()
  }
}
