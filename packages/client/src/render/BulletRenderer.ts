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

/**
 * Bullet renderer - manages bullet visual representation
 */
export class BulletRenderer {
  private readonly registry: SpriteRegistry
  private readonly bulletEntities = new Set<number>()
  private readonly playerBullets = new Set<number>()
  private readonly currentEntities = new Set<number>()
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
    this.bulletEntities.clear()
    this.playerBullets.clear()
    this.currentEntities.clear()
    this.removedPositions.length = 0
  }
}
