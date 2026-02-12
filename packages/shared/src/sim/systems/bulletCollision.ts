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
import { getUpgradeStateForPlayer } from '../upgrade'
import { applyDamage } from './applyDamage'

// Query for bullet entities
const bulletQuery = defineQuery([Bullet, Position, Collider])
const damageableQuery = defineQuery([Health, Position, Collider])

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

function overlapsSweptCircle(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  cx: number,
  cy: number,
  radius: number,
): boolean {
  const radiusSq = radius * radius

  // End-point overlap
  const endDx = endX - cx
  const endDy = endY - cy
  if (endDx * endDx + endDy * endDy <= radiusSq) return true

  // Start-point overlap
  const startDx = startX - cx
  const startDy = startY - cy
  if (startDx * startDx + startDy * startDy <= radiusSq) return true

  // Swept segment overlap
  const segX = endX - startX
  const segY = endY - startY
  const segLenSq = segX * segX + segY * segY
  if (segLenSq <= 0) return false

  let t = ((cx - startX) * segX + (cy - startY) * segY) / segLenSq
  if (t < 0) t = 0
  else if (t > 1) t = 1

  const closestX = startX + segX * t
  const closestY = startY + segY * t
  const dx = closestX - cx
  const dy = closestY - cy
  return dx * dx + dy * dy <= radiusSq
}

function forEachPotentialTarget(
  world: GameWorld,
  localOnly: boolean,
  x: number,
  y: number,
  queryRadius: number,
  callback: (targetEid: number) => void,
): void {
  if (world.spatialHash && !localOnly) {
    forEachInRadius(world.spatialHash, x, y, queryRadius, callback)
    return
  }

  const targets = damageableQuery(world)
  const queryRadiusSq = queryRadius * queryRadius
  for (const targetEid of targets) {
    const dx = Position.x[targetEid]! - x
    const dy = Position.y[targetEid]! - y
    if (dx * dx + dy * dy > queryRadiusSq) continue
    callback(targetEid)
  }
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

  const localOnly = world.simulationScope === 'local-player' && world.localPlayerEid >= 0
  const localOwner = world.localPlayerEid

  const bullets = bulletQuery(world)
  const bulletsToRemove: number[] = []

  for (const eid of bullets) {
    if (localOnly && Bullet.ownerId[eid] !== localOwner) continue

    const x = Position.x[eid]!
    const y = Position.y[eid]!
    const startX = Position.prevX[eid]!
    const startY = Position.prevY[eid]!
    const radius = Collider.radius[eid]!

    // --- Entity collision (checked first) ---
    let hitEntity = false

    const travelX = x - startX
    const travelY = y - startY
    const travelDist = Math.sqrt(travelX * travelX + travelY * travelY)
    const queryRadius = radius + MAX_COLLIDER_RADIUS + travelDist
    // Determine Showdown state for this bullet's owner
    const bulletOwner = Bullet.ownerId[eid]!
    const ownerHasShowdown =
      hasComponent(world, Showdown, bulletOwner) && Showdown.active[bulletOwner] === 1
    const showdownTarget = ownerHasShowdown ? Showdown.targetEid[bulletOwner]! : NO_TARGET

    forEachPotentialTarget(world, localOnly, x, y, queryRadius, (targetEid) => {
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

      // Circle-circle overlap with swept segment to reduce tunneling misses.
      const tx = Position.x[targetEid]!
      const ty = Position.y[targetEid]!
      const minDist = radius + Collider.radius[targetEid]!
      if (!overlapsSweptCircle(startX, startY, x, y, tx, ty, minDist)) return

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
        const ownerState = getUpgradeStateForPlayer(world, bulletOwner)
        damage = clampDamage(damage * ownerState.showdownDamageMultiplier)
      }

      // Fire onBulletHit hooks for player bullets (pierce, JJE bonus, etc.)
      // Keep this server-authoritative to avoid prediction-only gameplay side-effects.
      const isPlayerBullet = Collider.layer[eid]! === CollisionLayer.PLAYER_BULLET
      if (!localOnly && isPlayerBullet && world.hooks.hasHandlers('onBulletHit')) {
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

      // Final Arrangement: 25% damage reduction when player is below 50% HP
      if (hasComponent(world, Player, targetEid) && getUpgradeStateForPlayer(world, targetEid).finalArrangementActive) {
        damage = clampDamage(damage * 0.75)
      }

      if (localOnly) {
        // Prediction path: optimistic HP only; avoid authoritative hooks/credit.
        applyDamage(world, targetEid, {
          amount: damage,
          attackerEid: eid,
          clampToZero: true,
          fireHealthChanged: false,
          trackAttribution: false,
        })
        if (shouldRemoveBullet) bulletsToRemove.push(eid)
        if (shouldStopIteration) hitEntity = true
        return
      }

      // HIT — apply damage through shared authoritative path.
      applyDamage(world, targetEid, {
        amount: damage,
        attackerEid: eid,
        setIframes: true,
      })

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
