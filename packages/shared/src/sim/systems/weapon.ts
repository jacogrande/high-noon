/**
 * Weapon System
 *
 * Handles firing for player entities.
 * - `projectile` mode: legacy bullet spawning path.
 * - `hitscan` mode: immediate ray-based resolution for player firearms.
 */

import { defineQuery, hasComponent } from 'bitecs'
import type { GameWorld } from '../world'
import { hasButton, Button } from '../../net/input'
import {
  Player,
  Bullet,
  Position,
  Weapon,
  Cylinder,
  Roll,
  PlayerState,
  PlayerStateType,
  Enemy,
  Dead,
  Collider,
  Health,
  Invincible,
  Showdown,
} from '../components'
import { spawnBullet, CollisionLayer, NO_TARGET } from '../prefabs'
import { clampDamage, FRIENDLY_FIRE_DAMAGE_SCALE } from '../damage'
import { getUpgradeStateForPlayer } from '../upgrade'
import { applyDamage } from './applyDamage'
import { damageMapObstacle } from './damageHelpers'
import { isSolidAt } from '../tilemap'
import { getBulletConfigForCharacter } from '../content/weapons'
import { getOrCreatePlayerStats } from '../stats'

// Query for entities with weapons (players)
const weaponQuery = defineQuery([Weapon, Position, Player])
const enemyTargetQuery = defineQuery([Enemy, Position, Collider, Health])
const playerTargetQuery = defineQuery([Player, Position, Collider, Health])

const MAX_HISTORICAL_HITSCAN_SAMPLES = 16

let nextVirtualBulletId = -1

interface RewoundFireContext {
  originX: number
  originY: number
  rewindSeconds: number
  shotTick: number | null
}

interface HitscanCandidate {
  targetEid: number
  distance: number
  x: number
  y: number
}

interface HitscanPelletResult {
  hit: boolean
  targetEid: number
  hitX: number
  hitY: number
  damageApplied: number
}

function getRewoundFireContext(world: GameWorld, playerEid: number, x: number, y: number, dt: number): RewoundFireContext {
  if (!world.lagCompEnabled || world.lagCompMaxRewindTicks <= 0) {
    return { originX: x, originY: y, rewindSeconds: 0, shotTick: null }
  }

  const shotTick = world.lagCompShotTickByPlayer.get(playerEid)
  if (shotTick === undefined) {
    return { originX: x, originY: y, rewindSeconds: 0, shotTick: null }
  }

  const historicalPos = world.lagCompGetPlayerPosAtTick?.(playerEid, shotTick)
  if (!historicalPos) {
    return { originX: x, originY: y, rewindSeconds: 0, shotTick: null }
  }

  const rewindTicks = Math.max(0, Math.min(world.lagCompMaxRewindTicks, world.tick - shotTick))
  return {
    originX: historicalPos.x,
    originY: historicalPos.y,
    rewindSeconds: rewindTicks * dt,
    shotTick,
  }
}

function rayCircleIntersectionDistance(
  originX: number,
  originY: number,
  dirX: number,
  dirY: number,
  centerX: number,
  centerY: number,
  radius: number,
): number | null {
  const mx = originX - centerX
  const my = originY - centerY
  const b = mx * dirX + my * dirY
  const c = mx * mx + my * my - radius * radius

  if (c > 0 && b > 0) return null

  const discriminant = b * b - c
  if (discriminant < 0) return null

  const sqrtDisc = Math.sqrt(discriminant)
  const nearT = -b - sqrtDisc
  const farT = -b + sqrtDisc
  if (farT < 0) return null

  return nearT >= 0 ? nearT : 0
}

/** Ray vs AABB intersection — returns entry distance or null if no hit. */
function rayAABBDistance(
  originX: number, originY: number,
  dirX: number, dirY: number,
  minX: number, minY: number,
  maxX: number, maxY: number,
): number | null {
  let tmin = -Infinity
  let tmax = Infinity

  if (dirX !== 0) {
    const t1 = (minX - originX) / dirX
    const t2 = (maxX - originX) / dirX
    tmin = Math.max(tmin, Math.min(t1, t2))
    tmax = Math.min(tmax, Math.max(t1, t2))
  } else if (originX < minX || originX > maxX) {
    return null
  }

  if (dirY !== 0) {
    const t1 = (minY - originY) / dirY
    const t2 = (maxY - originY) / dirY
    tmin = Math.max(tmin, Math.min(t1, t2))
    tmax = Math.min(tmax, Math.max(t1, t2))
  } else if (originY < minY || originY > maxY) {
    return null
  }

  if (tmin > tmax) return null
  return tmin >= 0 ? tmin : tmax >= 0 ? 0 : null
}

function findWallDistance(
  world: GameWorld,
  originX: number,
  originY: number,
  dirX: number,
  dirY: number,
  maxDistance: number,
): number {
  const tilemap = world.tilemap
  if (!tilemap) return maxDistance

  if (isSolidAt(tilemap, originX, originY)) return 0

  const step = Math.max(2, tilemap.tileSize * 0.25)
  for (let d = step; d <= maxDistance; d += step) {
    const x = originX + dirX * d
    const y = originY + dirY * d
    if (isSolidAt(tilemap, x, y)) {
      return d
    }
  }

  return maxDistance
}

function getHistoricalRayDistance(
  world: GameWorld,
  targetEid: number,
  originX: number,
  originY: number,
  dirX: number,
  dirY: number,
  shotTick: number | null,
  currentRadius: number,
): number | null {
  let bestDistance: number | null = rayCircleIntersectionDistance(
    originX,
    originY,
    dirX,
    dirY,
    Position.x[targetEid]!,
    Position.y[targetEid]!,
    currentRadius,
  )

  if (
    shotTick === null ||
    !world.lagCompEnabled ||
    world.simulationScope === 'local-player' ||
    world.lagCompGetEnemyStateAtTick === undefined
  ) {
    return bestDistance
  }

  const endTick = world.tick
  const startTick = Math.max(shotTick, endTick - (MAX_HISTORICAL_HITSCAN_SAMPLES - 1))
  for (let tick = startTick; tick <= endTick; tick++) {
    const historical = world.lagCompGetEnemyStateAtTick(targetEid, tick)
    if (!historical || !historical.alive) continue
    const d = rayCircleIntersectionDistance(
      originX,
      originY,
      dirX,
      dirY,
      historical.x,
      historical.y,
      historical.radius + world.lagCompHistoricalRadiusPadding,
    )
    if (d === null) continue
    if (bestDistance === null || d < bestDistance) {
      bestDistance = d
    }
  }

  return bestDistance
}

function getHitscanCandidates(
  world: GameWorld,
  ownerEid: number,
  originX: number,
  originY: number,
  dirX: number,
  dirY: number,
  maxDistance: number,
  shotTick: number | null,
): { candidates: HitscanCandidate[]; wallDistance: number } {
  const wallDistance = findWallDistance(world, originX, originY, dirX, dirY, maxDistance)
  const candidatesByTarget = new Map<number, HitscanCandidate>()

  for (const targetEid of enemyTargetQuery(world)) {
    if (targetEid === ownerEid) continue
    if (Collider.layer[targetEid] !== CollisionLayer.ENEMY) continue
    if (Health.current[targetEid]! <= 0) continue
    if (hasComponent(world, Invincible, targetEid)) continue
    if (Health.iframes[targetEid]! > 0) continue

    const obj = world.objective
    if (obj && obj.type === 'duel' && obj.status === 'active' && targetEid !== obj.duelistEid) {
      continue
    }

    const distance = getHistoricalRayDistance(
      world,
      targetEid,
      originX,
      originY,
      dirX,
      dirY,
      shotTick,
      Collider.radius[targetEid]!,
    )
    if (distance === null) continue
    if (distance > wallDistance || distance > maxDistance) continue

    const x = originX + dirX * distance
    const y = originY + dirY * distance
    const prev = candidatesByTarget.get(targetEid)
    if (!prev || distance < prev.distance) {
      candidatesByTarget.set(targetEid, { targetEid, distance, x, y })
    }
  }

  // Friendly fire: also check player targets when enabled
  if (world.friendlyFireMode !== 'none') {
    for (const targetEid of playerTargetQuery(world)) {
      if (targetEid === ownerEid) continue
      if (Collider.layer[targetEid] !== CollisionLayer.PLAYER) continue
      if (Health.current[targetEid]! <= 0) continue
      if (hasComponent(world, Invincible, targetEid)) continue
      if (Health.iframes[targetEid]! > 0) continue
      if (hasComponent(world, Dead, targetEid)) continue

      const distance = rayCircleIntersectionDistance(
        originX, originY, dirX, dirY,
        Position.x[targetEid]!, Position.y[targetEid]!,
        Collider.radius[targetEid]!,
      )
      if (distance === null) continue
      if (distance > wallDistance || distance > maxDistance) continue

      const x = originX + dirX * distance
      const y = originY + dirY * distance
      const prev = candidatesByTarget.get(targetEid)
      if (!prev || distance < prev.distance) {
        candidatesByTarget.set(targetEid, { targetEid, distance, x, y })
      }
    }
  }

  const candidates = Array.from(candidatesByTarget.values())
  candidates.sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance
    return a.targetEid - b.targetEid
  })

  return { candidates, wallDistance }
}

function extractShootSeq(input: unknown): number {
  if (typeof input !== 'object' || input === null) return 0
  const seq = (input as { shootSeq?: unknown }).shootSeq
  return typeof seq === 'number' && Number.isFinite(seq)
    ? Math.max(0, Math.trunc(seq))
    : 0
}

function resolveHitscanPellet(
  world: GameWorld,
  ownerEid: number,
  originX: number,
  originY: number,
  dirX: number,
  dirY: number,
  baseDamage: number,
  range: number,
  shotTick: number | null,
): HitscanPelletResult {
  const { candidates, wallDistance } = getHitscanCandidates(
    world,
    ownerEid,
    originX,
    originY,
    dirX,
    dirY,
    range,
    shotTick,
  )

  const authoritative = world.simulationScope !== 'local-player'

  // --- Obstacle collision: check if ray hits a destructible obstacle ---
  const effectiveRange = Math.min(range, wallDistance)
  const nearestEntityDist = candidates.length > 0 ? candidates[0]!.distance : Infinity
  const ts = world.tilemap?.tileSize ?? 32
  let obstacleHitDist = Infinity
  let obstacleHitIndex = -1
  for (let oi = 0; oi < world.mapObstacles.length; oi++) {
    const obs = world.mapObstacles[oi]!
    if (obs.hp === undefined) continue
    const halfW = (obs.widthTiles * ts) / 2
    const halfH = (obs.heightTiles * ts) / 2
    const d = rayAABBDistance(
      originX, originY, dirX, dirY,
      obs.x - halfW, obs.y - halfH,
      obs.x + halfW, obs.y + halfH,
    )
    if (d !== null && d <= effectiveRange && d < obstacleHitDist) {
      obstacleHitDist = d
      obstacleHitIndex = oi
    }
  }
  if (obstacleHitIndex >= 0 && obstacleHitDist <= nearestEntityDist) {
    if (authoritative) {
      damageMapObstacle(world, obstacleHitIndex, 1)
    }
    return {
      hit: false,
      targetEid: NO_TARGET,
      hitX: originX + dirX * obstacleHitDist,
      hitY: originY + dirY * obstacleHitDist,
      damageApplied: 0,
    }
  }

  const ownerHasShowdown =
    hasComponent(world, Showdown, ownerEid) && Showdown.active[ownerEid] === 1
  const showdownTarget = ownerHasShowdown ? Showdown.targetEid[ownerEid]! : NO_TARGET

  const hasBulletHooks = authoritative && world.hooks.hasHandlers('onBulletHit')
  const virtualBulletId = nextVirtualBulletId--
  world.hitscanVirtualBulletOwners.set(virtualBulletId, ownerEid)

  let totalDamageApplied = 0
  let firstHitTarget = NO_TARGET
  let firstHitX = originX + dirX * Math.min(range, wallDistance)
  let firstHitY = originY + dirY * Math.min(range, wallDistance)

  for (const candidate of candidates) {
    let damage = baseDamage
    let shouldContinue = false

    if (ownerHasShowdown && candidate.targetEid !== showdownTarget) {
      shouldContinue = true
    } else if (ownerHasShowdown && candidate.targetEid === showdownTarget) {
      const ownerState = getUpgradeStateForPlayer(world, ownerEid)
      damage = clampDamage(damage * ownerState.showdownDamageMultiplier)
    }

    if (hasBulletHooks) {
      const hookResult = world.hooks.fireBulletHit(world, virtualBulletId, candidate.targetEid, damage)
      damage = hookResult.damage
      if (hookResult.pierce) {
        shouldContinue = true
      }
    }

    if (hasComponent(world, Player, candidate.targetEid) && getUpgradeStateForPlayer(world, candidate.targetEid).finalArrangementActive) {
      damage = clampDamage(damage * 0.75)
    }

    // Friendly fire damage reduction for hitscan player-vs-player hits
    if (hasComponent(world, Player, candidate.targetEid) && world.friendlyFireMode === 'reduced') {
      damage = clampDamage(damage * FRIENDLY_FIRE_DAMAGE_SCALE)
    }

    if (authoritative) {
      const result = applyDamage(world, candidate.targetEid, {
        amount: damage,
        attackerEid: ownerEid,
        setIframes: true,
      })
      if (result.applied > 0) {
        totalDamageApplied += result.applied
        if (firstHitTarget === NO_TARGET) {
          firstHitTarget = candidate.targetEid
          firstHitX = candidate.x
          firstHitY = candidate.y
        }
      }
    }

    if (!shouldContinue) break
  }

  world.hookPierceCount.delete(virtualBulletId)
  world.bulletPierceHits.delete(virtualBulletId)
  world.hitscanVirtualBulletOwners.delete(virtualBulletId)

  return {
    hit: firstHitTarget !== NO_TARGET,
    targetEid: firstHitTarget,
    hitX: firstHitX,
    hitY: firstHitY,
    damageApplied: totalDamageApplied,
  }
}

/**
 * Weapon system - handles firing with cylinder-based ammo
 *
 * Each player entity reads its own input from world.playerInputs.
 *
 * @param world - The game world
 * @param dt - Delta time in seconds
 */
export function weaponSystem(
  world: GameWorld,
  dt: number,
): void {
  const entities = weaponQuery(world)
  world.pendingShotResults.length = 0

  for (const eid of entities) {
    const us = getUpgradeStateForPlayer(world, eid)
    const input = world.playerInputs.get(eid)
    if (!input) {
      Player.shootWasDown[eid] = 0
      continue
    }

    // Check if player wants to shoot
    const wantsShoot = hasButton(input, Button.SHOOT)
    const wasShootDown = Player.shootWasDown[eid] === 1

    // Track shoot button state for next tick
    Player.shootWasDown[eid] = wantsShoot ? 1 : 0

    if (!wantsShoot) continue

    // Can't shoot while rolling
    const isRolling =
      hasComponent(world, Roll, eid) ||
      PlayerState.state[eid] === PlayerStateType.ROLLING
    if (isRolling) continue
    const isJumpLocked =
      PlayerState.state[eid] === PlayerStateType.JUMPING ||
      PlayerState.state[eid] === PlayerStateType.LANDING
    if (isJumpLocked) continue

    // Check cylinder has rounds
    const hasCylinder = hasComponent(world, Cylinder, eid)
    // Prospector uses melee; firearm path requires cylinder-based weapons.
    if (!hasCylinder) continue
    if (Cylinder.rounds[eid]! <= 0) continue

    // Check fire cooldown (cylinder-based for players)
    if (Cylinder.fireCooldown[eid]! > 0) {
      if (wasShootDown) {
        // Hold: must wait for full cooldown to expire
        continue
      }
      // Fresh click: can fire if at least minFireInterval has elapsed since last shot
      const holdCooldown = 1 / us.holdFireRate
      const timeSinceLastShot = holdCooldown - Cylinder.fireCooldown[eid]!
      if (timeSinceLastShot < us.minFireInterval) continue
    }

    // Fire the weapon
    const x = Position.x[eid]!
    const y = Position.y[eid]!
    const aimAngle = Player.aimAngle[eid]!

    const bulletSpeed = Weapon.bulletSpeed[eid]!
    let bulletDamage = Weapon.bulletDamage[eid]!
    const bulletRange = Weapon.range[eid]!
    const rewoundFire = getRewoundFireContext(world, eid, x, y, dt)

    // Deadweight buff: +40% damage on first shot after roll
    if (us.deadweightBuffTimer > 0) {
      bulletDamage = clampDamage(bulletDamage * 1.4)
      us.deadweightBuffTimer = 0
    }

    // Bandolier: first shot after reload deals bonus damage
    if (us.bandolierFirstShotBonus > 0 && Cylinder.firstShotAfterReload[eid] === 1) {
      bulletDamage = clampDamage(bulletDamage * (1 + us.bandolierFirstShotBonus))
      us.bandolierFirstShotBonus = 0
    }

    // Last round bonus: if cylinder has exactly 1 round, apply multiplier
    if (Cylinder.rounds[eid] === 1) {
      const multiplier = us.lastRoundMultiplier
      bulletDamage = clampDamage(bulletDamage * multiplier)
    }

    // Pellet spread: split damage across pellets and fan them out
    const pelletCount = Math.max(1, Math.round(us.pelletCount))
    const spreadAngle = us.spreadAngle
    const perPelletDamage = clampDamage(bulletDamage / pelletCount)

    if (world.playerFireMode === 'hitscan') {
      const centerDirX = Math.cos(aimAngle)
      const centerDirY = Math.sin(aimAngle)
      const missDistance = findWallDistance(
        world,
        rewoundFire.originX,
        rewoundFire.originY,
        centerDirX,
        centerDirY,
        bulletRange,
      )
      const missX = rewoundFire.originX + centerDirX * missDistance
      const missY = rewoundFire.originY + centerDirY * missDistance

      // Track targets hit during this volley so we can suppress i-frames
      // between pellets (otherwise pellet 1 sets i-frames and pellets 2-N
      // skip the target in getHitscanCandidates).
      const volleyHitTargets = new Set<number>()
      const shootSeq = extractShootSeq(input)
      const rewindTicks = rewoundFire.shotTick !== null ? world.tick - rewoundFire.shotTick : 0

      for (let i = 0; i < pelletCount; i++) {
        const angleOffset = pelletCount > 1
          ? spreadAngle * (i / (pelletCount - 1) - 0.5)
          : 0
        const pelletAngle = aimAngle + angleOffset
        const dirX = Math.cos(pelletAngle)
        const dirY = Math.sin(pelletAngle)

        const pellet = resolveHitscanPellet(
          world,
          eid,
          rewoundFire.originX,
          rewoundFire.originY,
          dirX,
          dirY,
          perPelletDamage,
          bulletRange,
          rewoundFire.shotTick,
        )

        if (pellet.hit) {
          volleyHitTargets.add(pellet.targetEid)
          // Clear i-frames so subsequent pellets in this volley can still hit
          if (i < pelletCount - 1) {
            Health.iframes[pellet.targetEid] = 0
          }
          // Per-player stats: hitscan damage + hit
          if (pellet.damageApplied > 0) {
            const ps = getOrCreatePlayerStats(world.playerStats, eid)
            ps.damageDealt += pellet.damageApplied
            ps.shotsHit++
          }
        }

        // Push one result per pellet so each visual bullet gets an impact point
        if (world.simulationScope === 'all') {
          world.pendingShotResults.push({
            shooterEid: eid,
            shootSeq,
            tick: world.tick,
            hit: pellet.hit,
            hitX: pellet.hitX,
            hitY: pellet.hitY,
            targetEid: pellet.targetEid,
            damageApplied: pellet.damageApplied,
            rewindTicks,
            rewindClamped: false,
          })
        }
      }

      // Re-apply i-frames on all targets hit by this volley
      for (const targetEid of volleyHitTargets) {
        Health.iframes[targetEid] = Health.iframeDuration[targetEid]!
      }
    } else {
      const bulletCfg = getBulletConfigForCharacter(us.characterDef.id)
      for (let i = 0; i < pelletCount; i++) {
        // Fan formula: evenly distribute pellets across the spread arc
        const angleOffset = pelletCount > 1
          ? spreadAngle * (i / (pelletCount - 1) - 0.5)
          : 0
        const pelletAngle = aimAngle + angleOffset

        const vx = Math.cos(pelletAngle) * bulletSpeed
        const vy = Math.sin(pelletAngle) * bulletSpeed

        const bulletEid = spawnBullet(world, {
          x: rewoundFire.originX,
          y: rewoundFire.originY,
          vx,
          vy,
          damage: perPelletDamage,
          range: bulletRange,
          ownerId: eid,
          spriteId: bulletCfg.spriteId,
          size: bulletCfg.size,
        })

        if (rewoundFire.rewindSeconds > 0) {
          const catchupX = rewoundFire.originX + vx * rewoundFire.rewindSeconds
          const catchupY = rewoundFire.originY + vy * rewoundFire.rewindSeconds
          Position.prevX[bulletEid] = rewoundFire.originX
          Position.prevY[bulletEid] = rewoundFire.originY
          Position.x[bulletEid] = catchupX
          Position.y[bulletEid] = catchupY
          world.lagCompBulletSweepStart.set(bulletEid, {
            x: rewoundFire.originX,
            y: rewoundFire.originY,
          })

          const dx = catchupX - rewoundFire.originX
          const dy = catchupY - rewoundFire.originY
          const catchupDist = Math.sqrt(dx * dx + dy * dy)
          Bullet.distanceTraveled[bulletEid] = Math.min(Bullet.range[bulletEid]!, catchupDist)
          Bullet.lifetime[bulletEid] = Math.max(0, Bullet.lifetime[bulletEid]! - rewoundFire.rewindSeconds)
        }

        if (rewoundFire.shotTick !== null) {
          world.lagCompBulletShotTick.set(bulletEid, rewoundFire.shotTick)
          world.lagCompBulletSpawnTick.set(bulletEid, world.tick)
        }
      }
    }

    // Consume round and set fire cooldown
    Cylinder.rounds[eid] = Cylinder.rounds[eid]! - 1
    Cylinder.firstShotAfterReload[eid] = 0
    // Count pellets fired (not trigger pulls) so accuracy = shotsHit / shotsFired is correct
    getOrCreatePlayerStats(world.playerStats, eid).shotsFired += pelletCount

    // Fire onCylinderEmpty hook when last round consumed
    if (Cylinder.rounds[eid] === 0) {
      world.hooks.fireCylinderEmpty(world, eid)
    }

    // Always set hold-rate cooldown. Click-to-fire advantage is at the
    // gate (rising edge can fire through remaining cooldown early).
    let fireCooldown = 1 / us.holdFireRate
    // Witching Hour: double fire rate (halve cooldown)
    if (us.witchingHourActive) {
      fireCooldown *= 0.5
    }
    Cylinder.fireCooldown[eid] = fireCooldown
  }
}
