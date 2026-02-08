/**
 * Player Input System
 *
 * Converts player input into velocity for movement.
 * Handles diagonal normalization and speed application.
 * Initiates rolls when roll button pressed.
 */

import { defineQuery, hasComponent, addComponent } from 'bitecs'
import type { GameWorld } from '../world'
import { hasButton, Button } from '../../net/input'
import {
  Player,
  PlayerState,
  PlayerStateType,
  Speed,
  Velocity,
  Roll,
} from '../components'

// Define query for player entities
const playerQuery = defineQuery([Player, Velocity, Speed, PlayerState])

/**
 * Player input system - converts input to velocity
 *
 * Movement is instant/snappy per the mechanics doc:
 * "Lean toward instant/snappy... The bullet-hell nature demands precise positioning."
 *
 * Each player entity reads its own input from world.playerInputs.
 *
 * @param world - The game world
 * @param _dt - Delta time (unused - instant acceleration)
 */
export function playerInputSystem(
  world: GameWorld,
  _dt: number,
): void {
  // Query all player entities
  const players = playerQuery(world)

  for (const eid of players) {
    const input = world.playerInputs.get(eid)
    if (!input) {
      Player.rollButtonWasDown[eid] = 0
      continue
    }

    // Update aim angle
    Player.aimAngle[eid] = input.aimAngle

    // Get movement from input (already normalized in Input.ts)
    const moveX = input.moveX
    const moveY = input.moveY

    // Check if player is moving
    const isMoving = moveX !== 0 || moveY !== 0

    // Get current state
    const currentState = PlayerState.state[eid]!
    const isRolling = currentState === PlayerStateType.ROLLING

    // Handle roll initiation
    const wantsRoll = hasButton(input, Button.ROLL)
    const wasRollDown = Player.rollButtonWasDown[eid] === 1
    // Require button re-press: can only roll if button wasn't held last tick
    const canRoll = !isRolling && !hasComponent(world, Roll, eid) && !wasRollDown

    if (wantsRoll && canRoll) {
      // Determine roll direction
      let rollDirX = moveX
      let rollDirY = moveY

      // If not moving, roll in aim direction
      if (!isMoving) {
        rollDirX = Math.cos(input.aimAngle)
        rollDirY = Math.sin(input.aimAngle)
      }

      // Normalize direction (should already be normalized, but be safe)
      const len = Math.sqrt(rollDirX * rollDirX + rollDirY * rollDirY)
      if (len > 0) {
        rollDirX /= len
        rollDirY /= len
      } else {
        // Fallback: roll right if no direction
        rollDirX = 1
        rollDirY = 0
      }

      // Add Roll component (params from upgradeState)
      const us = world.upgradeState
      addComponent(world, Roll, eid)
      Roll.duration[eid] = us.rollDuration
      Roll.elapsed[eid] = 0
      Roll.iframeRatio[eid] = us.rollIframeRatio
      Roll.speedMultiplier[eid] = us.rollSpeedMultiplier
      Roll.directionX[eid] = rollDirX
      Roll.directionY[eid] = rollDirY

      // Set state to rolling
      PlayerState.state[eid] = PlayerStateType.ROLLING

      // Track button state for re-press detection
      Player.rollButtonWasDown[eid] = wantsRoll ? 1 : 0

      // Skip normal movement processing this tick
      continue
    }

    // Update player state (if not rolling)
    if (!isRolling) {
      PlayerState.state[eid] = isMoving
        ? PlayerStateType.MOVING
        : PlayerStateType.IDLE

      // Apply velocity based on current speed
      const speed = Speed.current[eid]!
      Velocity.x[eid] = moveX * speed
      Velocity.y[eid] = moveY * speed
    }

    // Track button state for re-press detection (must be at end of loop)
    Player.rollButtonWasDown[eid] = wantsRoll ? 1 : 0
  }
}
