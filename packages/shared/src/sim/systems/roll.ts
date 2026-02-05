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
} from '../components'

// Query for entities currently rolling
const rollingQuery = defineQuery([Roll, Velocity, Speed, PlayerState])

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

    // Apply roll velocity (locked direction, boosted speed)
    const rollSpeed = baseSpeed * speedMultiplier
    Velocity.x[eid] = dirX * rollSpeed
    Velocity.y[eid] = dirY * rollSpeed

    // Increment elapsed time
    Roll.elapsed[eid] = elapsed + dt
  }
}
