/**
 * Bullet Collision System
 *
 * Handles bullet-specific collision detection:
 * - Bullets despawn when hitting walls (instead of being pushed around)
 * - Calls onCollide callback for effects (explosions, etc.)
 * - Cleans up callback registry when bullets are removed
 *
 * This runs BEFORE the general collision system to handle bullet-wall
 * collisions specially (despawn vs push-out).
 */

import { defineQuery, removeEntity } from 'bitecs'
import type { GameWorld } from '../world'
import { Bullet, Position, Collider } from '../components'
import { isSolidAt } from '../tilemap'

// Query for bullet entities
const bulletQuery = defineQuery([Bullet, Position, Collider])

/**
 * Bullet collision system - handles bullet vs tilemap collision
 *
 * @param world - The game world
 * @param _dt - Delta time (unused)
 */
export function bulletCollisionSystem(world: GameWorld, _dt: number): void {
  const tilemap = world.tilemap
  if (!tilemap) return

  const bullets = bulletQuery(world)
  const bulletsToRemove: number[] = []

  for (const eid of bullets) {
    const x = Position.x[eid]!
    const y = Position.y[eid]!
    const radius = Collider.radius[eid]!

    // Check if bullet center or edges hit a solid tile
    // Check center and 4 cardinal points on the edge
    const hitWall =
      isSolidAt(tilemap, x, y) ||
      isSolidAt(tilemap, x + radius, y) ||
      isSolidAt(tilemap, x - radius, y) ||
      isSolidAt(tilemap, x, y + radius) ||
      isSolidAt(tilemap, x, y - radius)

    if (hitWall) {
      // Call collision callback if registered
      const callback = world.bulletCollisionCallbacks.get(eid)
      if (callback) {
        callback(world, eid, { type: 'wall', x, y })
      }

      // Mark for removal
      bulletsToRemove.push(eid)
    }
  }

  // Remove bullets that hit walls
  for (const eid of bulletsToRemove) {
    // Clean up callback registry
    world.bulletCollisionCallbacks.delete(eid)
    // Remove entity
    removeEntity(world, eid)
  }
}
