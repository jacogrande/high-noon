/**
 * Bullet Renderer
 *
 * Renders bullet entities as sprites with rotation based on velocity.
 * Tracks bullet creation and removal to sync sprites with the ECS world.
 *
 * Enemy bullets render in a dedicated layer above entities and player bullets,
 * with z-ordering so smaller/faster bullets draw on top of bigger/slower ones.
 *
 * Bullets with non-zero accel or drag get fading afterimage trails (3 positions).
 */

import { defineQuery, hasComponent } from 'bitecs'
import type { GameWorld } from '@high-noon/shared'
import { Bullet, Position, Collider, Velocity, CollisionLayer, Enemy, EnemyTier } from '@high-noon/shared'
import type { Container, Texture } from 'pixi.js'
import { Sprite } from 'pixi.js'
import { SpriteRegistry } from './SpriteRegistry'
import { AssetLoader } from '../assets'

// Define query for bullet entities with rendering components
const bulletRenderQuery = defineQuery([Bullet, Position, Collider])

/** Number of trail afterimages per bullet */
const TRAIL_LENGTH = 3
/** Trail alpha values from newest to oldest */
const TRAIL_ALPHA = [0.3, 0.2, 0.1] as const

/** Player bullet tint */
const PLAYER_BULLET_TINT = 0xfff5cf
/** Enemy fodder bullet tint */
const ENEMY_FODDER_TINT = 0xff9966
/** Enemy threat bullet tint */
const ENEMY_THREAT_TINT = 0xff2222

interface CosmeticBullet {
  x: number
  y: number
  prevX: number
  prevY: number
  vx: number
  vy: number
  age: number
  maxLifetime: number
  hasTarget: boolean
  targetX: number
  targetY: number
  impactKind: 'entity' | 'wall'
}

export interface VisualBulletImpact {
  x: number
  y: number
  kind: 'entity' | 'wall'
}

/** Trail position ring buffer for a single bullet */
interface TrailState {
  /** Ring buffer of past positions [x, y, x, y, ...] */
  positions: Float32Array
  /** Current write index into the ring buffer (0..TRAIL_LENGTH-1) */
  head: number
  /** Number of valid entries (grows from 0 to TRAIL_LENGTH) */
  count: number
  /** Trail afterimage sprites */
  sprites: Sprite[]
  /** Tint color inherited from the bullet */
  tint: number
}

const VISUAL_BULLET_DEFAULT_SPEED = 2400
const VISUAL_BULLET_DEFAULT_LIFETIME = 0.65
const VISUAL_BULLET_TARGET_EPSILON = 2

/** Read per-bullet size from ECS (Float32Array defaults to 0; treat as 1.0). */
function getBulletSize(eid: number): number {
  const raw = Bullet.size[eid]!
  return raw > 0 ? raw : 1.0
}

/** Get tint color for a bullet based on ownership. */
function getBulletTint(eid: number, isEnemy: boolean): number {
  if (!isEnemy) return PLAYER_BULLET_TINT
  const ownerId = Bullet.ownerId[eid]!
  return Enemy.tier[ownerId] === EnemyTier.THREAT ? ENEMY_THREAT_TINT : ENEMY_FODDER_TINT
}

/**
 * Bullet renderer - manages bullet visual representation
 */
export class BulletRenderer {
  /** Registry for player bullets (entities layer) */
  private readonly registry: SpriteRegistry
  /** Registry for enemy bullets (enemyBullets layer, above entities) */
  private readonly enemyRegistry: SpriteRegistry
  /** The enemy bullet container for trail sprites (has sortableChildren) */
  private readonly enemyBulletLayer: Container
  private readonly bulletEntities = new Set<number>()
  private readonly playerBullets = new Set<number>()
  private readonly enemyBullets = new Set<number>()
  private readonly currentEntities = new Set<number>()
  private readonly cosmeticBullets = new Map<number, CosmeticBullet>()
  private readonly animState = new Map<number, { frame: number; elapsed: number; frames: Texture[]; fps: number }>()
  private readonly trailState = new Map<number, TrailState>()
  private readonly pendingVisualImpacts: VisualBulletImpact[] = []
  private nextCosmeticId = -1
  readonly removedPositions: Array<{ x: number; y: number }> = []

  constructor(registry: SpriteRegistry, enemyBulletLayer: Container) {
    this.registry = registry
    this.enemyBulletLayer = enemyBulletLayer
    this.enemyRegistry = new SpriteRegistry(enemyBulletLayer)
  }

  /** Get the correct registry for an entity based on its collision layer */
  private registryFor(eid: number): SpriteRegistry {
    return this.enemyBullets.has(eid) ? this.enemyRegistry : this.registry
  }

  /**
   * Sync sprites with bullet entities
   * Creates sprites for new bullets, removes for despawned ones
   */
  sync(world: GameWorld): void {
    this.removedPositions.length = 0

    const bullets = bulletRenderQuery(world)

    // Track which entities exist this frame
    const currentEntities = this.currentEntities
    currentEntities.clear()

    for (const eid of bullets) {
      currentEntities.add(eid)

      // Create sprite if doesn't exist
      if (!this.bulletEntities.has(eid)) {
        const isEnemy = Collider.layer[eid] === CollisionLayer.ENEMY_BULLET
        const targetRegistry = isEnemy ? this.enemyRegistry : this.registry

        const spriteId = Bullet.spriteId[eid]!
        const texture = AssetLoader.getBulletTextureById(spriteId)
        const sprite = targetRegistry.createSprite(eid, texture)
        this.bulletEntities.add(eid)

        // Set initial rotation based on velocity
        const vx = Velocity.x[eid]!
        const vy = Velocity.y[eid]!
        const rotation = Math.atan2(vy, vx)
        targetRegistry.setRotation(eid, rotation)

        const bulletSize = getBulletSize(eid)
        const tint = getBulletTint(eid, isEnemy)
        sprite.tint = tint
        sprite.scale.set(bulletSize)

        // Track player vs enemy bullets
        if (isEnemy) {
          this.enemyBullets.add(eid)

          // Z-ordering: smaller/faster bullets render on top (higher zIndex)
          const speed = Math.hypot(vx, vy)
          sprite.zIndex = speed / 100 + (1 / Math.max(bulletSize, 0.1))
        } else {
          this.playerBullets.add(eid)
        }

        // Init trail state for bullets with non-linear trajectories (accel or drag)
        const accel = Bullet.accel[eid]!
        const drag = Bullet.drag[eid]!
        if (accel !== 0 || drag !== 0) {
          const trailSprites: Sprite[] = []
          const container = isEnemy ? this.enemyBulletLayer : this.registry.getContainer()
          for (let i = 0; i < TRAIL_LENGTH; i++) {
            const trailSprite = new Sprite(texture)
            trailSprite.anchor.set(0.5, 0.5)
            trailSprite.tint = tint
            trailSprite.alpha = TRAIL_ALPHA[i]!
            trailSprite.rotation = rotation
            trailSprite.visible = false
            // Trail sprites slightly smaller than the main bullet
            trailSprite.scale.set(bulletSize * (0.85 - i * 0.1))
            container.addChild(trailSprite)
            trailSprites.push(trailSprite)
          }
          this.trailState.set(eid, {
            positions: new Float32Array(TRAIL_LENGTH * 2),
            head: 0,
            count: 0,
            sprites: trailSprites,
            tint,
          })
        }

        // Init animation state for animated bullet sprites
        const anim = AssetLoader.getBulletAnimFrames(spriteId)
        if (anim) {
          this.animState.set(eid, {
            frame: 0,
            elapsed: 0,
            frames: anim.frames,
            fps: anim.fps,
          })
        }
      }
    }

    // Remove sprites for despawned bullets
    for (const eid of this.bulletEntities) {
      if (!currentEntities.has(eid)) {
        const reg = this.registryFor(eid)

        // Capture position of removed player bullets for impact particles
        if (this.playerBullets.has(eid)) {
          const displayObj = reg.get(eid)
          if (displayObj) {
            this.removedPositions.push({ x: displayObj.x, y: displayObj.y })
          }
          this.playerBullets.delete(eid)
        }

        // Clean up enemy bullet tracking
        this.enemyBullets.delete(eid)

        // Clean up trail sprites
        const trail = this.trailState.get(eid)
        if (trail) {
          for (const s of trail.sprites) {
            s.parent?.removeChild(s)
            s.destroy()
          }
          this.trailState.delete(eid)
        }

        reg.remove(eid)
        this.bulletEntities.delete(eid)
        this.animState.delete(eid)
      }
    }
  }

  /**
   * Update bullet sprite positions with interpolation
   *
   * @param world - The game world
   * @param alpha - Interpolation factor (0-1) between previous and current state
   */
  render(world: GameWorld, alpha: number, realDt = 0): void {
    this.renderBullets(world, alpha, null, 0, 0, realDt)
  }

  /**
   * Render bullets with optional local-player visual correction offset.
   * Used by multiplayer so local predicted bullets stay aligned with the
   * locally-smoothed player presentation during reconciliation.
   */
  renderWithLocalOffset(
    world: GameWorld,
    alpha: number,
    localTimelineBullets: ReadonlySet<number>,
    offsetX: number,
    offsetY: number,
    realDt = 0,
  ): void {
    this.renderBullets(world, alpha, localTimelineBullets, offsetX, offsetY, realDt)
  }

  /**
   * Shared render implementation for both standard and offset-corrected paths.
   */
  private renderBullets(
    world: GameWorld,
    alpha: number,
    localTimelineBullets: ReadonlySet<number> | null,
    offsetX: number,
    offsetY: number,
    realDt: number,
  ): void {
    for (const eid of this.bulletEntities) {
      // Skip if entity no longer has Bullet component (despawned this frame)
      if (!hasComponent(world, Bullet, eid)) continue

      // Interpolate between previous and current position
      const prevX = Position.prevX[eid]!
      const prevY = Position.prevY[eid]!
      const currX = Position.x[eid]!
      const currY = Position.y[eid]!

      let renderX = prevX + (currX - prevX) * alpha
      let renderY = prevY + (currY - prevY) * alpha

      if (localTimelineBullets?.has(eid)) {
        renderX += offsetX
        renderY += offsetY
      }

      const reg = this.registryFor(eid)
      reg.setPosition(eid, renderX, renderY)

      // Update trail afterimages
      this.updateTrail(eid, renderX, renderY)
    }

    for (const [eid, bullet] of this.cosmeticBullets) {
      const renderX = bullet.prevX + (bullet.x - bullet.prevX) * alpha
      const renderY = bullet.prevY + (bullet.y - bullet.prevY) * alpha
      this.registry.setPosition(eid, renderX, renderY)
    }

    if (realDt > 0) this.updateAnimations(realDt)
  }

  /**
   * Push the current render position into the trail ring buffer and
   * update afterimage sprite positions/visibility.
   */
  private updateTrail(eid: number, renderX: number, renderY: number): void {
    const trail = this.trailState.get(eid)
    if (!trail) return

    // Write current position into ring buffer
    const idx = trail.head * 2
    trail.positions[idx] = renderX
    trail.positions[idx + 1] = renderY
    trail.head = (trail.head + 1) % TRAIL_LENGTH
    if (trail.count < TRAIL_LENGTH) trail.count++

    // Update afterimage sprites (newest trail position = index 0 in sprites)
    for (let i = 0; i < TRAIL_LENGTH; i++) {
      const sprite = trail.sprites[i]!
      if (i >= trail.count) {
        sprite.visible = false
        continue
      }
      // Read from ring buffer: most recent trail entry is (head - 1 - i)
      const ringIdx = ((trail.head - 1 - i + TRAIL_LENGTH) % TRAIL_LENGTH) * 2
      sprite.x = trail.positions[ringIdx]!
      sprite.y = trail.positions[ringIdx + 1]!
      sprite.visible = true
    }
  }

  /**
   * Advance animated bullet frame cycling.
   */
  private updateAnimations(dt: number): void {
    for (const [eid, state] of this.animState) {
      if (state.fps <= 0 || state.frames.length === 0) continue
      state.elapsed += dt
      // Keep elapsed bounded to prevent unbounded growth on long-lived bullets
      const loopDuration = state.frames.length / state.fps
      if (state.elapsed > loopDuration * 2) {
        state.elapsed %= loopDuration
      }
      const newFrame = Math.floor(state.elapsed * state.fps) % state.frames.length
      if (newFrame !== state.frame) {
        state.frame = newFrame
        const reg = this.registryFor(eid)
        reg.setTexture(eid, state.frames[newFrame]!)
      }
    }
  }

  /**
   * Spawn a short-lived local-only visual bullet (no simulation/collision).
   */
  spawnVisualBullet(
    x: number,
    y: number,
    angle: number,
    speed = VISUAL_BULLET_DEFAULT_SPEED,
    maxLifetime = VISUAL_BULLET_DEFAULT_LIFETIME,
    spriteId = 0,
    size = 0.95,
  ): number {
    const eid = this.nextCosmeticId--
    const texture = AssetLoader.getBulletTextureById(spriteId)
    const sprite = this.registry.createSprite(eid, texture)
    sprite.tint = PLAYER_BULLET_TINT
    sprite.scale.set(size, size)
    this.registry.setRotation(eid, angle)
    this.registry.setPosition(eid, x, y)

    this.cosmeticBullets.set(eid, {
      x,
      y,
      prevX: x,
      prevY: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      age: 0,
      maxLifetime,
      hasTarget: false,
      targetX: x,
      targetY: y,
      impactKind: 'wall',
    })
    return eid
  }

  /**
   * Bind a local-only visual bullet to an authoritative endpoint.
   * Returns false when the visual bullet was already removed.
   */
  resolveVisualBulletImpact(
    visualBulletId: number,
    targetX: number,
    targetY: number,
    kind: 'entity' | 'wall',
  ): boolean {
    const bullet = this.cosmeticBullets.get(visualBulletId)
    if (!bullet) return false

    bullet.hasTarget = true
    bullet.targetX = targetX
    bullet.targetY = targetY
    bullet.impactKind = kind

    const dx = targetX - bullet.x
    const dy = targetY - bullet.y
    const distance = Math.hypot(dx, dy)
    if (distance > 1e-6) {
      const speed = Math.hypot(bullet.vx, bullet.vy)
      bullet.vx = (dx / distance) * speed
      bullet.vy = (dy / distance) * speed
      this.registry.setRotation(visualBulletId, Math.atan2(bullet.vy, bullet.vx))
    }

    return true
  }

  consumeVisualImpacts(): VisualBulletImpact[] {
    if (this.pendingVisualImpacts.length === 0) return []
    return this.pendingVisualImpacts.splice(0, this.pendingVisualImpacts.length)
  }

  /**
   * Advance local-only visual bullets.
   */
  updateVisualBullets(dt: number): void {
    if (this.cosmeticBullets.size === 0) return

    const toRemove: number[] = []
    for (const [eid, bullet] of this.cosmeticBullets) {
      bullet.prevX = bullet.x
      bullet.prevY = bullet.y
      const speed = Math.hypot(bullet.vx, bullet.vy)
      const stepDistance = speed * dt

      if (bullet.hasTarget) {
        const toTargetX = bullet.targetX - bullet.x
        const toTargetY = bullet.targetY - bullet.y
        const distanceToTarget = Math.hypot(toTargetX, toTargetY)
        if (distanceToTarget <= VISUAL_BULLET_TARGET_EPSILON || stepDistance >= distanceToTarget) {
          bullet.x = bullet.targetX
          bullet.y = bullet.targetY
          this.pendingVisualImpacts.push({
            x: bullet.targetX,
            y: bullet.targetY,
            kind: bullet.impactKind,
          })
          toRemove.push(eid)
          continue
        }
      }

      bullet.x += bullet.vx * dt
      bullet.y += bullet.vy * dt
      bullet.age += dt

      if (bullet.age >= bullet.maxLifetime) {
        toRemove.push(eid)
      }
    }

    for (const eid of toRemove) {
      this.registry.remove(eid)
      this.cosmeticBullets.delete(eid)
    }
  }

  /**
   * Get current bullet count
   */
  get count(): number {
    return this.bulletEntities.size
  }

  /**
   * Clean up all bullet sprites
   */
  destroy(): void {
    for (const eid of this.bulletEntities) {
      this.registryFor(eid).remove(eid)
    }
    for (const eid of this.cosmeticBullets.keys()) {
      this.registry.remove(eid)
    }
    // Clean up trail sprites
    for (const trail of this.trailState.values()) {
      for (const s of trail.sprites) {
        s.parent?.removeChild(s)
        s.destroy()
      }
    }
    this.bulletEntities.clear()
    this.playerBullets.clear()
    this.enemyBullets.clear()
    this.currentEntities.clear()
    this.cosmeticBullets.clear()
    this.animState.clear()
    this.trailState.clear()
    this.pendingVisualImpacts.length = 0
    this.removedPositions.length = 0
    this.enemyRegistry.destroy()
  }
}
