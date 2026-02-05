/**
 * Bullet Renderer
 *
 * Renders bullet entities as small yellow circles with interpolation.
 * Tracks bullet creation and removal to sync sprites with the ECS world.
 */

import { defineQuery, hasComponent } from 'bitecs'
import type { GameWorld } from '@high-noon/shared'
import { Bullet, Position, Collider } from '@high-noon/shared'
import { SpriteRegistry } from './SpriteRegistry'

/** Bullet visual color (yellow for visibility) */
const BULLET_COLOR = 0xffff00

// Define query for bullet entities with rendering components
const bulletRenderQuery = defineQuery([Bullet, Position, Collider])

/**
 * Bullet renderer - manages bullet visual representation
 */
export class BulletRenderer {
  private readonly registry: SpriteRegistry
  private readonly bulletEntities = new Set<number>()

  constructor(registry: SpriteRegistry) {
    this.registry = registry
  }

  /**
   * Sync sprites with bullet entities
   * Creates sprites for new bullets, removes for despawned ones
   */
  sync(world: GameWorld): void {
    const bullets = bulletRenderQuery(world)

    // Track which entities exist this frame
    const currentEntities = new Set<number>()

    for (const eid of bullets) {
      currentEntities.add(eid)

      // Create sprite if doesn't exist
      if (!this.bulletEntities.has(eid)) {
        const radius = Collider.radius[eid]!
        this.registry.createCircle(eid, radius, BULLET_COLOR)
        this.bulletEntities.add(eid)
      }
    }

    // Remove sprites for despawned bullets
    for (const eid of this.bulletEntities) {
      if (!currentEntities.has(eid)) {
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
  }
}
