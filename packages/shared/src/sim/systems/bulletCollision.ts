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

import { defineQuery, hasComponent } from 'bitecs'
import type { GameWorld } from '../world'
import { Bullet, Position, Velocity, Collider, Health, Invincible, Showdown, Player } from '../components'
import { CollisionLayer, MAX_COLLIDER_RADIUS, NO_TARGET, removeBullet } from '../prefabs'
import { clampDamage } from '../damage'
import { isSolidAt } from '../tilemap'
import { forEachInRadius } from '../SpatialHash'

// Query for bullet entities
const bulletQuery = defineQuery([Bullet, Position, Collider])

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
  const bulletsToRemove: number[] = []

  for (const eid of bullets) {
    const x = Position.x[eid]!
    const y = Position.y[eid]!
    const radius = Collider.radius[eid]!

    // --- Entity collision (checked first) ---
    let hitEntity = false

    const queryRadius = radius + MAX_COLLIDER_RADIUS
    if (world.spatialHash) {
      // Determine Showdown state for this bullet's owner
      const bulletOwner = Bullet.ownerId[eid]!
      const ownerHasShowdown =
        hasComponent(world, Showdown, bulletOwner) && Showdown.active[bulletOwner] === 1
      const showdownTarget = ownerHasShowdown ? Showdown.targetEid[bulletOwner]! : NO_TARGET

      forEachInRadius(world.spatialHash, x, y, queryRadius, (targetEid) => {
        if (hitEntity) return
        if (!hasComponent(world, Health, targetEid)) return
        // Skip owner
        if (targetEid === Bullet.ownerId[eid]) return
        // Skip invincible entities (roll i-frames)
        if (hasComponent(world, Invincible, targetEid)) return
        // Skip entities in damage i-frames
        if (Health.iframes[targetEid]! > 0) return

        // Layer check
        if (!canBulletHitTarget(Collider.layer[eid]!, Collider.layer[targetEid]!)) return

        // Skip already-pierced entities
        const pierceHits = world.bulletPierceHits.get(eid)
        if (pierceHits && pierceHits.has(targetEid)) return

        // Circle-circle overlap (no sqrt needed)
        const tx = Position.x[targetEid]!
        const ty = Position.y[targetEid]!
        const dx = x - tx
        const dy = y - ty
        const distSq = dx * dx + dy * dy
        const minDist = radius + Collider.radius[targetEid]!
        if (distSq >= minDist * minDist) return

        // Determine damage and pierce behavior
        let damage = Bullet.damage[eid]!
        let shouldRemoveBullet = true
        let shouldStopIteration = true

        if (ownerHasShowdown && targetEid !== showdownTarget) {
          // Pierce: bullet passes through non-target
          shouldRemoveBullet = false
          shouldStopIteration = false
          let hits = world.bulletPierceHits.get(eid)
          if (!hits) { hits = new Set(); world.bulletPierceHits.set(eid, hits) }
          hits.add(targetEid)
        } else if (ownerHasShowdown && targetEid === showdownTarget) {
          // Target hit: bonus damage, bullet stops
          damage = clampDamage(damage * world.upgradeState.showdownDamageMultiplier)
        }

        // Fire onBulletHit hooks for player bullets (pierce, JJE bonus, etc.)
        const isPlayerBullet = Collider.layer[eid]! === CollisionLayer.PLAYER_BULLET
        if (isPlayerBullet && world.hooks.hasHandlers('onBulletHit')) {
          const hookResult = world.hooks.fireBulletHit(world, eid, targetEid, damage)
          damage = hookResult.damage
          if (hookResult.pierce && shouldRemoveBullet) {
            // Hook requested pierce — track hit entity so we don't hit again
            shouldRemoveBullet = false
            shouldStopIteration = false
            let hits = world.bulletPierceHits.get(eid)
            if (!hits) { hits = new Set(); world.bulletPierceHits.set(eid, hits) }
            hits.add(targetEid)
          }
        }

        // HIT — apply damage
        const oldHP = Health.current[targetEid]!
        Health.current[targetEid] = oldHP - damage
        Health.iframes[targetEid] = Health.iframeDuration[targetEid]!

        // Fire onHealthChanged for player targets
        if (hasComponent(world, Player, targetEid)) {
          world.hooks.fireHealthChanged(world, targetEid, oldHP, Health.current[targetEid]!)
        }

        // Store hit direction per-player for camera kick (bullet travel direction)
        if (Collider.layer[targetEid]! === CollisionLayer.PLAYER) {
          const bvx = Velocity.x[eid]!
          const bvy = Velocity.y[eid]!
          const blen = Math.sqrt(bvx * bvx + bvy * bvy)
          if (blen > 0) {
            world.lastPlayerHitDir.set(targetEid, { x: bvx / blen, y: bvy / blen })
          }
        }

        // Call collision callback
        const callback = world.bulletCollisionCallbacks.get(eid)
        if (callback) {
          callback(world, eid, { type: 'entity', hitEntity: targetEid, x, y })
        }

        if (shouldRemoveBullet) bulletsToRemove.push(eid)
        if (shouldStopIteration) hitEntity = true
      })
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
    removeBullet(world, eid)
  }
}
