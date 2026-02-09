/**
 * Movement System
 *
 * Applies velocity to position for all moving entities.
 * Stores previous position for render interpolation.
 */

import { defineQuery, hasComponent } from 'bitecs'
import type { GameWorld } from '../world'
import { Position, Velocity, Bullet, Collider } from '../components'
import { CollisionLayer } from '../prefabs'

// Define query for entities with Position and Velocity
const movingEntitiesQuery = defineQuery([Position, Velocity])
const localPlayerBulletQuery = defineQuery([Bullet, Position, Velocity, Collider])

function stepEntity(eid: number, dt: number): void {
  Position.prevX[eid] = Position.x[eid]!
  Position.prevY[eid] = Position.y[eid]!
  Position.x[eid] = Position.x[eid]! + Velocity.x[eid]! * dt
  Position.y[eid] = Position.y[eid]! + Velocity.y[eid]! * dt
}

/**
 * Movement system - applies velocity to position
 *
 * @param world - The game world
 * @param dt - Delta time in seconds
 */
export function movementSystem(world: GameWorld, dt: number): void {
  if (world.simulationScope === 'local-player' && world.localPlayerEid >= 0) {
    const localEid = world.localPlayerEid

    if (hasComponent(world, Position, localEid) && hasComponent(world, Velocity, localEid)) {
      stepEntity(localEid, dt)
    }

    // Also move locally predicted bullets for immediate fire feedback.
    const bullets = localPlayerBulletQuery(world)
    for (const eid of bullets) {
      if (Collider.layer[eid] !== CollisionLayer.PLAYER_BULLET) continue
      if (Bullet.ownerId[eid] !== localEid) continue
      stepEntity(eid, dt)
    }
    return
  }

  // Query all entities with Position and Velocity
  const entities = movingEntitiesQuery(world)

  for (const eid of entities) {
    stepEntity(eid, dt)
  }
}
