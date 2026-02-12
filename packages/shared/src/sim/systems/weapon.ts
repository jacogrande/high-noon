/**
 * Weapon System
 *
 * Handles firing and bullet spawning for player entities.
 * Uses the Cylinder component for ammo tracking, fire cooldown,
 * and click-vs-hold fire rate differentiation.
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
} from '../components'
import { spawnBullet } from '../prefabs'
import { clampDamage } from '../damage'
import { getUpgradeStateForPlayer } from '../upgrade'

// Query for entities with weapons (players)
const weaponQuery = defineQuery([Weapon, Position, Player])

interface RewoundFireContext {
  originX: number
  originY: number
  rewindSeconds: number
  shotTick: number | null
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
    // Prospector uses melee; bullet weapon path requires cylinder-based firearms.
    if (!hasCylinder) continue
    if (hasCylinder && Cylinder.rounds[eid]! <= 0) continue

    // Check fire cooldown (cylinder-based for players)
    if (hasCylinder && Cylinder.fireCooldown[eid]! > 0) {
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

    // Last round bonus: if cylinder has exactly 1 round, apply multiplier
    if (hasCylinder && Cylinder.rounds[eid] === 1) {
      const multiplier = us.lastRoundMultiplier
      bulletDamage = clampDamage(bulletDamage * multiplier)
    }

    // Pellet spread: split damage across pellets and fan them out
    const pelletCount = Math.max(1, Math.round(us.pelletCount))
    const spreadAngle = us.spreadAngle
    const perPelletDamage = clampDamage(bulletDamage / pelletCount)

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
      })

      if (rewoundFire.rewindSeconds > 0) {
        const catchupX = rewoundFire.originX + vx * rewoundFire.rewindSeconds
        const catchupY = rewoundFire.originY + vy * rewoundFire.rewindSeconds
        Position.prevX[bulletEid] = rewoundFire.originX
        Position.prevY[bulletEid] = rewoundFire.originY
        Position.x[bulletEid] = catchupX
        Position.y[bulletEid] = catchupY

        const dx = catchupX - rewoundFire.originX
        const dy = catchupY - rewoundFire.originY
        const catchupDist = Math.sqrt(dx * dx + dy * dy)
        Bullet.distanceTraveled[bulletEid] = Math.min(Bullet.range[bulletEid]!, catchupDist)
        Bullet.lifetime[bulletEid] = Math.max(0, Bullet.lifetime[bulletEid]! - rewoundFire.rewindSeconds)
      }

      if (rewoundFire.shotTick !== null) {
        world.lagCompBulletShotTick.set(bulletEid, rewoundFire.shotTick)
      }
    }

    // Consume round and set fire cooldown
    if (hasCylinder) {
      Cylinder.rounds[eid] = Cylinder.rounds[eid]! - 1
      Cylinder.firstShotAfterReload[eid] = 0

      // Fire onCylinderEmpty hook when last round consumed
      if (Cylinder.rounds[eid] === 0) {
        world.hooks.fireCylinderEmpty(world, eid)
      }

      // Always set hold-rate cooldown. Click-to-fire advantage is at the
      // gate (rising edge can fire through remaining cooldown early).
      Cylinder.fireCooldown[eid] = 1 / us.holdFireRate
    }
  }
}
