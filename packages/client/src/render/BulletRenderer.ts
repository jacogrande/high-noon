/**
 * Bullet Renderer
 *
 * Renders bullet entities as sprites with rotation based on velocity.
 * Tracks bullet creation and removal to sync sprites with the ECS world.
 */

import { defineQuery, hasComponent } from 'bitecs'
import type { GameWorld } from '@high-noon/shared'
import { Bullet, Position, Collider, Velocity, CollisionLayer, Enemy, EnemyTier } from '@high-noon/shared'
import { SpriteRegistry } from './SpriteRegistry'
import { AssetLoader } from '../assets'

// Define query for bullet entities with rendering components
const bulletRenderQuery = defineQuery([Bullet, Position, Collider])

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

const VISUAL_BULLET_DEFAULT_SPEED = 2400
const VISUAL_BULLET_DEFAULT_LIFETIME = 0.65
const VISUAL_BULLET_TARGET_EPSILON = 2

/**
 * Bullet renderer - manages bullet visual representation
 */
export class BulletRenderer {
  private readonly registry: SpriteRegistry
  private readonly bulletEntities = new Set<number>()
  private readonly playerBullets = new Set<number>()
  private readonly currentEntities = new Set<number>()
  private readonly cosmeticBullets = new Map<number, CosmeticBullet>()
  private readonly pendingVisualImpacts: VisualBulletImpact[] = []
  private nextCosmeticId = -1
  readonly removedPositions: Array<{ x: number; y: number }> = []

  constructor(registry: SpriteRegistry) {
    this.registry = registry
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
        const texture = AssetLoader.getBulletTexture()
        const sprite = this.registry.createSprite(eid, texture)
        this.bulletEntities.add(eid)

        // Set initial rotation based on velocity
        const vx = Velocity.x[eid]!
        const vy = Velocity.y[eid]!
        const rotation = Math.atan2(vy, vx)
        this.registry.setRotation(eid, rotation)

        // Track player bullets for removal particles
        if (Collider.layer[eid] === CollisionLayer.PLAYER_BULLET) {
          this.playerBullets.add(eid)
        }

        // Tint and scale enemy bullets by tier
        if (Collider.layer[eid] === CollisionLayer.ENEMY_BULLET) {
          const ownerId = Bullet.ownerId[eid]!
          const isThreat = Enemy.tier[ownerId] === EnemyTier.THREAT
          sprite.tint = isThreat ? 0xff2222 : 0xff9966
          sprite.scale.set(isThreat ? 1.3 : 0.8)
        }
      }
    }

    // Remove sprites for despawned bullets
    for (const eid of this.bulletEntities) {
      if (!currentEntities.has(eid)) {
        // Capture position of removed player bullets for impact particles
        if (this.playerBullets.has(eid)) {
          const displayObj = this.registry.get(eid)
          if (displayObj) {
            this.removedPositions.push({ x: displayObj.x, y: displayObj.y })
          }
          this.playerBullets.delete(eid)
        }
        this.registry.remove(eid)
        this.bulletEntities.delete(eid)
      }
    }
  }

  /**
   * Update bullet sprite positions with interpolation
   *
   * @param world - The game world
   * @param alpha - Interpolation factor (0-1) between previous and current state
   */
  render(world: GameWorld, alpha: number): void {
    for (const eid of this.bulletEntities) {
      // Skip if entity no longer has Bullet component (despawned this frame)
      if (!hasComponent(world, Bullet, eid)) continue

      // Interpolate between previous and current position
      const prevX = Position.prevX[eid]!
      const prevY = Position.prevY[eid]!
      const currX = Position.x[eid]!
      const currY = Position.y[eid]!

      const renderX = prevX + (currX - prevX) * alpha
      const renderY = prevY + (currY - prevY) * alpha

      this.registry.setPosition(eid, renderX, renderY)
    }

    for (const [eid, bullet] of this.cosmeticBullets) {
      const renderX = bullet.prevX + (bullet.x - bullet.prevX) * alpha
      const renderY = bullet.prevY + (bullet.y - bullet.prevY) * alpha
      this.registry.setPosition(eid, renderX, renderY)
    }
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
  ): void {
    for (const eid of this.bulletEntities) {
      if (!hasComponent(world, Bullet, eid)) continue

      const prevX = Position.prevX[eid]!
      const prevY = Position.prevY[eid]!
      const currX = Position.x[eid]!
      const currY = Position.y[eid]!

      let renderX = prevX + (currX - prevX) * alpha
      let renderY = prevY + (currY - prevY) * alpha

      if (localTimelineBullets.has(eid)) {
        renderX += offsetX
        renderY += offsetY
      }

      this.registry.setPosition(eid, renderX, renderY)
    }

    for (const [eid, bullet] of this.cosmeticBullets) {
      const renderX = bullet.prevX + (bullet.x - bullet.prevX) * alpha
      const renderY = bullet.prevY + (bullet.y - bullet.prevY) * alpha
      this.registry.setPosition(eid, renderX, renderY)
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
  ): number {
    const eid = this.nextCosmeticId--
    const texture = AssetLoader.getBulletTexture()
    const sprite = this.registry.createSprite(eid, texture)
    sprite.tint = 0xfff5cf
    sprite.scale.set(0.95, 0.95)
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
      this.registry.remove(eid)
    }
    for (const eid of this.cosmeticBullets.keys()) {
      this.registry.remove(eid)
    }
    this.bulletEntities.clear()
    this.playerBullets.clear()
    this.currentEntities.clear()
    this.cosmeticBullets.clear()
    this.pendingVisualImpacts.length = 0
    this.removedPositions.length = 0
  }
}
