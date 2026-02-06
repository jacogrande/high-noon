/**
 * Bullet Collision System
 *
 * Handles bullet-specific collision detection:
 * - Bullets vs damageable entities (circle-circle, layer filtering)
 * - Bullets vs walls (tilemap solid tiles)
 * - Calls onCollide callback for effects (explosions, etc.)
 * - Cleans up callback registry when bullets are removed
 *
 * Entity check runs before wall check — if a bullet overlaps both,
 * the entity takes the hit.
 */

import { defineQuery, removeEntity, hasComponent } from 'bitecs'
import type { GameWorld } from '../world'
import { Bullet, Position, Collider, Health, Invincible } from '../components'
import { CollisionLayer } from '../prefabs'
import { isSolidAt } from '../tilemap'

// Query for bullet entities
const bulletQuery = defineQuery([Bullet, Position, Collider])

// Query for entities that can take damage
const damagableQuery = defineQuery([Position, Collider, Health])

/**
 * Check if a bullet on the given layer can damage a target on the given layer.
 * Extend this when adding new entity types (neutral enemies, destructibles, etc.).
 */
function canBulletHitTarget(bulletLayer: number, targetLayer: number): boolean {
  return (
    (bulletLayer === CollisionLayer.PLAYER_BULLET && targetLayer === CollisionLayer.ENEMY) ||
    (bulletLayer === CollisionLayer.ENEMY_BULLET && targetLayer === CollisionLayer.PLAYER)
  )
}

/**
 * Bullet collision system - handles bullet vs entity and bullet vs tilemap collision
 *
 * @param world - The game world
 * @param _dt - Delta time (unused)
 */
export function bulletCollisionSystem(world: GameWorld, _dt: number): void {
  const tilemap = world.tilemap
  if (!tilemap) return

  const bullets = bulletQuery(world)
  const targets = damagableQuery(world)
  const bulletsToRemove: number[] = []

  for (const eid of bullets) {
    const x = Position.x[eid]!
    const y = Position.y[eid]!
    const radius = Collider.radius[eid]!

    // --- Entity collision (checked first) ---
    let hitEntity = false

    for (const targetEid of targets) {
      // Skip owner
      if (targetEid === Bullet.ownerId[eid]) continue
      // Skip invincible entities (roll i-frames)
      if (hasComponent(world, Invincible, targetEid)) continue
      // Skip entities in damage i-frames
      if (Health.iframes[targetEid]! > 0) continue

      // Layer check
      if (!canBulletHitTarget(Collider.layer[eid]!, Collider.layer[targetEid]!)) continue

      // Circle-circle overlap (no sqrt needed)
      const tx = Position.x[targetEid]!
      const ty = Position.y[targetEid]!
      const dx = x - tx
      const dy = y - ty
      const distSq = dx * dx + dy * dy
      const minDist = radius + Collider.radius[targetEid]!
      if (distSq >= minDist * minDist) continue

      // HIT — apply damage
      Health.current[targetEid] = Health.current[targetEid]! - Bullet.damage[eid]!
      Health.iframes[targetEid] = Health.iframeDuration[targetEid]!

      // Call collision callback
      const callback = world.bulletCollisionCallbacks.get(eid)
      if (callback) {
        callback(world, eid, { type: 'entity', hitEntity: targetEid, x, y })
      }

      bulletsToRemove.push(eid)
      hitEntity = true
      break // bullet hits one entity max
    }

    if (hitEntity) continue // skip wall check for this bullet

    // --- Wall collision ---
    // Check if bullet center or edges hit a solid tile
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

  // Remove bullets that hit something
  for (const eid of bulletsToRemove) {
    // Clean up callback registry
    world.bulletCollisionCallbacks.delete(eid)
    // Remove entity
    removeEntity(world, eid)
  }
}
