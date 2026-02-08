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
  Position,
  Weapon,
  Cylinder,
  Roll,
  PlayerState,
  PlayerStateType,
} from '../components'
import { spawnBullet } from '../prefabs'
import { clampDamage } from '../damage'

// Query for entities with weapons (players)
const weaponQuery = defineQuery([Weapon, Position, Player])

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

    // Check cylinder has rounds
    const hasCylinder = hasComponent(world, Cylinder, eid)
    if (hasCylinder && Cylinder.rounds[eid]! <= 0) continue

    // Check fire cooldown (cylinder-based for players)
    if (hasCylinder && Cylinder.fireCooldown[eid]! > 0) {
      if (wasShootDown) {
        // Hold: must wait for full cooldown to expire
        continue
      }
      // Fresh click: can fire if at least minFireInterval has elapsed since last shot
      const holdCooldown = 1 / world.upgradeState.holdFireRate
      const timeSinceLastShot = holdCooldown - Cylinder.fireCooldown[eid]!
      if (timeSinceLastShot < world.upgradeState.minFireInterval) continue
    }

    // Fire the weapon
    const x = Position.x[eid]!
    const y = Position.y[eid]!
    const aimAngle = Player.aimAngle[eid]!

    const bulletSpeed = Weapon.bulletSpeed[eid]!
    let bulletDamage = Weapon.bulletDamage[eid]!
    const bulletRange = Weapon.range[eid]!

    // Last round bonus: if cylinder has exactly 1 round, apply multiplier
    if (hasCylinder && Cylinder.rounds[eid] === 1) {
      const multiplier = world.upgradeState.lastRoundMultiplier
      bulletDamage = clampDamage(bulletDamage * multiplier)
    }

    // Calculate bullet velocity
    const vx = Math.cos(aimAngle) * bulletSpeed
    const vy = Math.sin(aimAngle) * bulletSpeed

    // Spawn bullet
    spawnBullet(world, {
      x,
      y,
      vx,
      vy,
      damage: bulletDamage,
      range: bulletRange,
      ownerId: eid,
    })

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
      Cylinder.fireCooldown[eid] = 1 / world.upgradeState.holdFireRate
    }
  }
}
