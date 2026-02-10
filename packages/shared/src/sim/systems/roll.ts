/**
 * Roll System
 *
 * Handles the roll/dodge mechanic:
 * - Applies roll velocity (locked direction, boosted speed)
 * - Manages i-frame timing (invincible during first portion)
 * - Ends roll and restores normal state
 *
 * Design based on Enter the Gungeon:
 * - Direction locked at roll start
 * - I-frames for first 50% of roll
 * - Vulnerable during recovery (last 50%)
 * - No cooldown, recovery-based pacing
 */

import { defineQuery, hasComponent, addComponent, removeComponent } from 'bitecs'
import type { GameWorld } from '../world'
import {
  Roll,
  Velocity,
  Speed,
  PlayerState,
  PlayerStateType,
  Invincible,
  Position,
  Collider,
  Bullet,
  Player,
} from '../components'
import { CollisionLayer, MAX_COLLIDER_RADIUS } from '../prefabs'
import { forEachInRadius } from '../SpatialHash'

// Query for entities currently rolling
const rollingQuery = defineQuery([Roll, Velocity, Speed, PlayerState])

// rollDodgedBullets lives on world (world.rollDodgedBullets) to avoid module-level state

/**
 * Roll system - manages roll state and applies roll velocity
 *
 * @param world - The game world
 * @param dt - Delta time in seconds
 */
export function rollSystem(world: GameWorld, dt: number): void {
  const rollingEntities = rollingQuery(world)

  for (const eid of rollingEntities) {
    const duration = Roll.duration[eid]!
    const elapsed = Roll.elapsed[eid]!
    const iframeRatio = Roll.iframeRatio[eid]!
    const speedMultiplier = Roll.speedMultiplier[eid]!
    const dirX = Roll.directionX[eid]!
    const dirY = Roll.directionY[eid]!
    const baseSpeed = Speed.max[eid]!

    // Check if roll is complete
    if (elapsed >= duration) {
      // End roll
      removeComponent(world, Roll, eid)

      // Remove invincibility if still has it
      if (hasComponent(world, Invincible, eid)) {
        removeComponent(world, Invincible, eid)
      }

      // Fire roll end hook (for Grave Dust, Deadweight)
      if (hasComponent(world, Player, eid)) {
        world.hooks.fireRollEnd(world, eid)
      }

      // Clean up dodge tracking
      world.rollDodgedBullets.delete(eid)

      // Restore normal state (will be set by playerInput next tick)
      PlayerState.state[eid] = PlayerStateType.IDLE

      // Stop movement (player input will take over next tick)
      Velocity.x[eid] = 0
      Velocity.y[eid] = 0

      continue
    }

    // Roll is in progress
    // Calculate if we're in i-frame portion
    const iframeEndTime = duration * iframeRatio
    const shouldBeInvincible = elapsed < iframeEndTime
    const isInvincible = hasComponent(world, Invincible, eid)

    // Add/remove Invincible component as needed
    if (shouldBeInvincible && !isInvincible) {
      addComponent(world, Invincible, eid)
    } else if (!shouldBeInvincible && isInvincible) {
      removeComponent(world, Invincible, eid)
    }

    // Detect roll dodges during i-frames (for Second Wind hook)
    if (shouldBeInvincible && hasComponent(world, Player, eid) &&
        world.hooks.hasHandlers('onRollDodge') && world.spatialHash) {
      const px = Position.x[eid]!
      const py = Position.y[eid]!
      const playerRadius = Collider.radius[eid]!
      const queryRadius = playerRadius + MAX_COLLIDER_RADIUS

      let dodged = world.rollDodgedBullets.get(eid)

      forEachInRadius(world.spatialHash, px, py, queryRadius, (bulletEid) => {
        if (!hasComponent(world, Bullet, bulletEid)) return
        if (Collider.layer[bulletEid]! !== CollisionLayer.ENEMY_BULLET) return

        // Skip already-dodged bullets this roll
        if (dodged && dodged.has(bulletEid)) return

        // Circle-circle overlap check
        const bx = Position.x[bulletEid]!
        const by = Position.y[bulletEid]!
        const dx = px - bx
        const dy = py - by
        const distSq = dx * dx + dy * dy
        const minDist = playerRadius + Collider.radius[bulletEid]!
        if (distSq >= minDist * minDist) return

        // Dodge detected!
        if (!dodged) { dodged = new Set(); world.rollDodgedBullets.set(eid, dodged) }
        dodged.add(bulletEid)
        world.hooks.fireRollDodge(world, eid, bulletEid)
      })
    }

    // Apply roll velocity (locked direction, boosted speed)
    const rollSpeed = baseSpeed * speedMultiplier
    Velocity.x[eid] = dirX * rollSpeed
    Velocity.y[eid] = dirY * rollSpeed

    // Increment elapsed time
    Roll.elapsed[eid] = elapsed + dt
  }
}
