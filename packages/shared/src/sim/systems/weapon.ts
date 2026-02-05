/**
 * Weapon System
 *
 * Handles firing, cooldown management, and bullet spawning.
 * Players can fire while moving but not while rolling.
 */

import { defineQuery, hasComponent } from 'bitecs'
import type { GameWorld } from '../world'
import { hasButton, Button, type InputState } from '../../net/input'
import {
  Player,
  Position,
  Weapon,
  Roll,
  PlayerState,
  PlayerStateType,
} from '../components'
import { spawnBullet } from '../prefabs'

// Query for entities with weapons (players)
const weaponQuery = defineQuery([Weapon, Position, Player])

/**
 * Weapon system - handles firing and cooldown
 *
 * @param world - The game world
 * @param dt - Delta time in seconds
 * @param input - Current input state
 */
export function weaponSystem(
  world: GameWorld,
  dt: number,
  input?: InputState
): void {
  if (!input) return

  const entities = weaponQuery(world)

  for (const eid of entities) {
    // Decrement cooldown
    const currentCooldown = Weapon.cooldown[eid]!
    if (currentCooldown > 0) {
      Weapon.cooldown[eid] = Math.max(0, currentCooldown - dt)
    }

    // Check if player wants to shoot
    const wantsShoot = hasButton(input, Button.SHOOT)
    if (!wantsShoot) continue

    // Can't shoot while rolling
    const isRolling =
      hasComponent(world, Roll, eid) ||
      PlayerState.state[eid] === PlayerStateType.ROLLING
    if (isRolling) continue

    // Check cooldown
    if (Weapon.cooldown[eid]! > 0) continue

    // Fire the weapon
    const x = Position.x[eid]!
    const y = Position.y[eid]!
    const aimAngle = Player.aimAngle[eid]!

    const bulletSpeed = Weapon.bulletSpeed[eid]!
    const bulletDamage = Weapon.bulletDamage[eid]!
    const bulletRange = Weapon.range[eid]!

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

    // Reset cooldown
    const fireRate = Weapon.fireRate[eid]!
    Weapon.cooldown[eid] = 1 / fireRate
  }
}
