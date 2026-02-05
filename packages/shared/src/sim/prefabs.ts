/**
 * Entity Prefabs
 *
 * Factory functions for creating common entity types with
 * all required components and default values.
 */

import { addEntity, addComponent } from 'bitecs'
import type { GameWorld } from './world'
import {
  Position,
  Velocity,
  Player,
  PlayerState,
  PlayerStateType,
  Speed,
  Collider,
} from './components'
import {
  PLAYER_SPEED,
  PLAYER_RADIUS,
  PLAYER_START_X,
  PLAYER_START_Y,
} from './content/player'

/** Collision layers */
export const CollisionLayer = {
  PLAYER: 1 << 0,
  ENEMY: 1 << 1,
  PLAYER_BULLET: 1 << 2,
  ENEMY_BULLET: 1 << 3,
  WALL: 1 << 4,
} as const

/**
 * Spawn a player entity
 *
 * @param world - The game world
 * @param x - Starting X position (default: center)
 * @param y - Starting Y position (default: center)
 * @param playerId - Player slot ID for multiplayer (0-7)
 * @returns The entity ID
 */
export function spawnPlayer(
  world: GameWorld,
  x = PLAYER_START_X,
  y = PLAYER_START_Y,
  playerId = 0
): number {
  const eid = addEntity(world)

  // Add all player components
  addComponent(world, Position, eid)
  addComponent(world, Velocity, eid)
  addComponent(world, Player, eid)
  addComponent(world, PlayerState, eid)
  addComponent(world, Speed, eid)
  addComponent(world, Collider, eid)

  // Set initial position
  Position.x[eid] = x
  Position.y[eid] = y
  Position.prevX[eid] = x
  Position.prevY[eid] = y

  // Set initial velocity (stationary)
  Velocity.x[eid] = 0
  Velocity.y[eid] = 0

  // Set player data
  Player.id[eid] = playerId
  Player.aimAngle[eid] = 0

  // Set initial state
  PlayerState.state[eid] = PlayerStateType.IDLE

  // Set speed
  Speed.current[eid] = PLAYER_SPEED
  Speed.max[eid] = PLAYER_SPEED

  // Set collider
  Collider.radius[eid] = PLAYER_RADIUS
  Collider.layer[eid] = CollisionLayer.PLAYER

  return eid
}
