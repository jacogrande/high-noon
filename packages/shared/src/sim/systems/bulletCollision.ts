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
import type { FriendlyFireMode } from '../../net/lobby'
import { Bullet, Position, Velocity, Collider, Health, Invincible, Showdown, Player, Enemy, EnemyType, FrontArmor, Flying } from '../components'
import { CollisionLayer, MAX_COLLIDER_RADIUS, NO_TARGET, removeBullet } from '../prefabs'
import { clampDamage, FRIENDLY_FIRE_DAMAGE_SCALE } from '../damage'
import { isSolidAt } from '../tilemap'
import { forEachInRadius } from '../SpatialHash'
import { getUpgradeStateForPlayer } from '../upgrade'
import { applyDamage } from './applyDamage'
import { damageMapObstacle } from './damageHelpers'
import { getOrCreatePlayerStats } from '../stats'

/** Upper bound on historical enemy samples during lag-comp overlap checks. */
const MAX_HISTORICAL_OVERLAP_SAMPLES = 16

// Query for bullet entities
const bulletQuery = defineQuery([Bullet, Position, Collider])
const damageableQuery = defineQuery([Health, Position, Collider])

/**
 * Check if a bullet on the given layer can damage a target on the given layer.
 * `friendlyFireMode` controls whether player bullets can hit other players.
 */
function canBulletHitTarget(bulletLayer: number, targetLayer: number, friendlyFireMode: FriendlyFireMode): boolean {
  if (bulletLayer === CollisionLayer.PLAYER_BULLET && targetLayer === CollisionLayer.ENEMY) return true
  if (bulletLayer === CollisionLayer.ENEMY_BULLET && targetLayer === CollisionLayer.PLAYER) return true
  if (bulletLayer === CollisionLayer.ENEMY_BULLET && targetLayer === CollisionLayer.OBJECTIVE) return true
  // Friendly fire: player bullets can hit other players
  if (bulletLayer === CollisionLayer.PLAYER_BULLET && targetLayer === CollisionLayer.PLAYER && friendlyFireMode !== 'none') return true
  return false
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
  useSpatialHash: boolean,
  x: number,
  y: number,
  queryRadius: number,
  ignoreRadiusFilter: boolean,
  callback: (targetEid: number) => void,
): void {
  if (world.spatialHash && useSpatialHash) {
    forEachInRadius(world.spatialHash, x, y, queryRadius, callback)
    return
  }

  const targets = damageableQuery(world)
  const queryRadiusSq = queryRadius * queryRadius
  for (const targetEid of targets) {
    if (ignoreRadiusFilter) {
      callback(targetEid)
      continue
    }
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
    const sweepStart = world.lagCompBulletSweepStart.get(eid)
    const startX = sweepStart?.x ?? Position.prevX[eid]!
    const startY = sweepStart?.y ?? Position.prevY[eid]!
    const radius = Collider.radius[eid]!

    // --- Entity collision (checked first) ---
    let hitEntity = false

    const travelX = x - startX
    const travelY = y - startY
    const travelDist = Math.sqrt(travelX * travelX + travelY * travelY)
    const queryRadius = radius + MAX_COLLIDER_RADIUS + travelDist
    // Authoritative player-bullet hit checks prefer direct ECS scans so
    // local prediction and server authority do not diverge on stale hashes.
    const useSpatialHash = !localOnly && Collider.layer[eid] !== CollisionLayer.PLAYER_BULLET
    // Determine Showdown state for this bullet's owner
    const bulletOwner = Bullet.ownerId[eid]!
    const ownerHasShowdown =
      hasComponent(world, Showdown, bulletOwner) && Showdown.active[bulletOwner] === 1
    const showdownTarget = ownerHasShowdown ? Showdown.targetEid[bulletOwner]! : NO_TARGET
    const shotTick = world.lagCompBulletShotTick.get(eid)
    const spawnTick = world.lagCompBulletSpawnTick.get(eid)
    const withinHistoricalWindow =
      spawnTick !== undefined
        ? world.tick <= spawnTick
        : shotTick !== undefined && world.tick <= shotTick + 1
    const historicalWindowEndTick =
      spawnTick !== undefined
        ? spawnTick
        : shotTick !== undefined
          ? shotTick + 1
          : world.tick
    const useHistoricalEnemyOverlap =
      !localOnly &&
      world.lagCompEnabled &&
      Collider.layer[eid] === CollisionLayer.PLAYER_BULLET &&
      shotTick !== undefined &&
      withinHistoricalWindow &&
      world.lagCompGetEnemyStateAtTick !== undefined
    const ignoreRadiusFilter = useHistoricalEnemyOverlap && !useSpatialHash

    forEachPotentialTarget(world, useSpatialHash, x, y, queryRadius, ignoreRadiusFilter, (targetEid) => {
      if (hitEntity) return
      if (!hasComponent(world, Health, targetEid)) return
      // Skip owner
      if (targetEid === Bullet.ownerId[eid]) return
      // Skip invincible entities (roll i-frames)
      if (hasComponent(world, Invincible, targetEid)) return
      // Skip entities in damage i-frames
      if (Health.iframes[targetEid]! > 0) return
      // Skip airborne flying enemies (Vulture while circling)
      if (hasComponent(world, Flying, targetEid) && Flying.airborne[targetEid] === 1) return

      // Layer check (friendly fire gated by world setting)
      if (!canBulletHitTarget(Collider.layer[eid]!, Collider.layer[targetEid]!, world.friendlyFireMode)) return

      // Duel zone filtering: only player ↔ duelist damage works during active duel
      const obj = world.objective
      if (obj && obj.type === 'duel' && obj.status === 'active') {
        const bulletIsPlayerBullet = Collider.layer[eid]! === CollisionLayer.PLAYER_BULLET
        const bulletIsEnemyBullet = Collider.layer[eid]! === CollisionLayer.ENEMY_BULLET
        if (bulletIsPlayerBullet && hasComponent(world, Enemy, targetEid) && targetEid !== obj.duelistEid) return
        if (bulletIsEnemyBullet && hasComponent(world, Player, targetEid) && Bullet.ownerId[eid]! !== obj.duelistEid) return
      }

      // Skip already-pierced entities
      const pierceHits = world.bulletPierceHits.get(eid)
      if (pierceHits && pierceHits.has(targetEid)) return

      // Circle-circle overlap with swept segment to reduce tunneling misses.
      const tx = Position.x[targetEid]!
      const ty = Position.y[targetEid]!
      const minDist = radius + Collider.radius[targetEid]!
      let overlaps = overlapsSweptCircle(startX, startY, x, y, tx, ty, minDist)
      if (!overlaps && useHistoricalEnemyOverlap && Collider.layer[targetEid] === CollisionLayer.ENEMY) {
        const endTick = Math.max(shotTick, historicalWindowEndTick)
        const startTick = Math.max(shotTick, endTick - (MAX_HISTORICAL_OVERLAP_SAMPLES - 1))
        for (let historicalTick = startTick; historicalTick <= endTick && !overlaps; historicalTick++) {
          const historical = world.lagCompGetEnemyStateAtTick?.(targetEid, historicalTick)
          if (!historical || !historical.alive) continue
          const historicalMinDist = radius + historical.radius + world.lagCompHistoricalRadiusPadding
          overlaps = overlapsSweptCircle(
            startX,
            startY,
            x,
            y,
            historical.x,
            historical.y,
            historicalMinDist,
          )
        }
      }
      if (!overlaps) return

      // Determine damage and pierce behavior
      let damage = Bullet.damage[eid]!
      let shouldRemoveBullet = true
      let shouldStopIteration = true

      // Friendly fire damage reduction
      if (Collider.layer[eid]! === CollisionLayer.PLAYER_BULLET &&
          Collider.layer[targetEid]! === CollisionLayer.PLAYER &&
          world.friendlyFireMode === 'reduced') {
        damage = clampDamage(damage * FRIENDLY_FIRE_DAMAGE_SCALE)
      }

      // FrontArmor: reduce damage for frontal player bullet hits
      if (hasComponent(world, FrontArmor, targetEid) &&
          Collider.layer[eid]! === CollisionLayer.PLAYER_BULLET) {
        const bulletAngle = Math.atan2(Velocity.y[eid]!, Velocity.x[eid]!)
        const facingAngle = FrontArmor.facingAngle[targetEid]!
        // Bullet hits "from the front" when bullet direction ≈ opposite of facing
        let angleDiff = bulletAngle - (facingAngle + Math.PI)
        // Normalize to [-PI, PI]. +PI maps to -PI which is fine since
        // abs(-PI) > arcHalfAngle (PI/2) so armor won't trigger at the seam.
        angleDiff = ((angleDiff % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI
        if (Math.abs(angleDiff) <= FrontArmor.arcHalfAngle[targetEid]!) {
          damage = clampDamage(damage * FrontArmor.reductionMultiplier[targetEid]!)
        }
      }

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
        // Prediction path: no enemy HP mutation. Server authority drives HP.
        if (shouldRemoveBullet) bulletsToRemove.push(eid)
        if (shouldStopIteration) hitEntity = true
        return
      }

      // Compute normalized bullet travel direction for directional VFX
      const bvx = Velocity.x[eid]!
      const bvy = Velocity.y[eid]!
      const bspeed = Math.sqrt(bvx * bvx + bvy * bvy)
      const hitDirX = bspeed > 0 ? bvx / bspeed : 0
      const hitDirY = bspeed > 0 ? bvy / bspeed : 0

      // HIT — apply damage through shared authoritative path.
      const hitResult = applyDamage(world, targetEid, {
        amount: damage,
        attackerEid: eid,
        setIframes: true,
        dirX: hitDirX,
        dirY: hitDirY,
      })

      // Per-player stats: track damage dealt + hit for player bullets
      if (isPlayerBullet && hasComponent(world, Player, bulletOwner) && hitResult.applied > 0) {
        const ps = getOrCreatePlayerStats(world.playerStats, bulletOwner)
        ps.damageDealt += hitResult.applied
        ps.shotsHit++
      }

      // Store hit direction per-player for camera kick (reuse already-computed unit vector)
      if (Collider.layer[targetEid]! === CollisionLayer.PLAYER) {
        if (bspeed > 0) {
          world.lastPlayerHitDir.set(targetEid, { x: hitDirX, y: hitDirY })
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

    if (hitEntity) {
      // Rewind catch-up sweep start is only used for the first collision step.
      if (sweepStart) {
        world.lagCompBulletSweepStart.delete(eid)
      }
      continue // skip wall check for this bullet
    }

    // --- Destructible trap collision (player bullets only) ---
    if (Collider.layer[eid]! === CollisionLayer.PLAYER_BULLET && world.trapZones.length > 0) {
      let hitTrap = false
      for (let ti = world.trapZones.length - 1; ti >= 0; ti--) {
        const trap = world.trapZones[ti]!
        if (trap.hp === undefined || trap.hp <= 0) continue
        const tdx = x - trap.x
        const tdy = y - trap.y
        const hitDist = radius + trap.radius
        if (tdx * tdx + tdy * tdy > hitDist * hitDist) continue

        trap.hp--
        if (trap.hp <= 0) {
          world.trapZones.splice(ti, 1)
        }
        bulletsToRemove.push(eid)
        hitTrap = true
        break
      }
      if (hitTrap) {
        // Rewind catch-up sweep start is only used for the first collision step.
        if (sweepStart) {
          world.lagCompBulletSweepStart.delete(eid)
        }
        continue
      }
    }

    // --- Map obstacle collision (player + enemy bullets) ---
    if (world.mapObstacles.length > 0) {
      const ts = world.tilemap!.tileSize
      let hitObs = false
      for (let oi = world.mapObstacles.length - 1; oi >= 0; oi--) {
        const obs = world.mapObstacles[oi]!
        if (obs.hp === undefined) continue // indestructible

        // AABB overlap: obstacle world bounds vs bullet position ± radius
        const halfW = (obs.widthTiles * ts) / 2
        const halfH = (obs.heightTiles * ts) / 2
        if (x + radius < obs.x - halfW || x - radius > obs.x + halfW) continue
        if (y + radius < obs.y - halfH || y - radius > obs.y + halfH) continue

        damageMapObstacle(world, oi, 1)
        bulletsToRemove.push(eid)
        hitObs = true
        break
      }
      if (hitObs) {
        if (sweepStart) {
          world.lagCompBulletSweepStart.delete(eid)
        }
        continue
      }
    }

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

    // Rewind catch-up sweep start is only used for the first collision step.
    if (sweepStart) {
      world.lagCompBulletSweepStart.delete(eid)
    }
  }

  // Remove bullets that hit something
  for (const eid of bulletsToRemove) {
    removeBullet(world, eid)
  }
}
