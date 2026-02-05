/**
 * Movement System
 *
 * Applies velocity to position for all moving entities.
 * Stores previous position for render interpolation.
 */

import { defineQuery } from 'bitecs'
import type { GameWorld } from '../world'
import { Position, Velocity } from '../components'

// Define query for entities with Position and Velocity
const movingEntitiesQuery = defineQuery([Position, Velocity])

/**
 * Movement system - applies velocity to position
 *
 * @param world - The game world
 * @param dt - Delta time in seconds
 */
export function movementSystem(world: GameWorld, dt: number): void {
  // Query all entities with Position and Velocity
  const entities = movingEntitiesQuery(world)

  for (const eid of entities) {
    // Store previous position for interpolation
    // Note: Non-null assertions are safe here because entities come from the query,
    // which only returns entities that have these components
    Position.prevX[eid] = Position.x[eid]!
    Position.prevY[eid] = Position.y[eid]!

    // Apply velocity
    Position.x[eid] = Position.x[eid]! + Velocity.x[eid]! * dt
    Position.y[eid] = Position.y[eid]! + Velocity.y[eid]! * dt
  }
}
