/**
 * Health System
 *
 * Decrements i-frame timers and processes entity death.
 * Runs after bulletCollisionSystem (damage applied) and before
 * collisionSystem (dead entities shouldn't get push-out).
 */

import { defineQuery, removeEntity, hasComponent, addComponent } from 'bitecs'
import type { GameWorld } from '../world'
import { Health, Player, Dead } from '../components'

const healthQuery = defineQuery([Health])

export function healthSystem(world: GameWorld, dt: number): void {
  const entities = healthQuery(world)

  for (const eid of entities) {
    // Decrement i-frame timer
    if (Health.iframes[eid]! > 0) {
      Health.iframes[eid] = Math.max(0, Health.iframes[eid]! - dt)
    }

    // Check for death (skip already-dead entities)
    if (Health.current[eid]! <= 0 && !hasComponent(world, Dead, eid)) {
      if (hasComponent(world, Player, eid)) {
        // Player death — tag as dead, keep entity for rendering
        addComponent(world, Dead, eid)
      } else {
        // Non-player death — clean up
        world.bulletCollisionCallbacks.delete(eid)
        removeEntity(world, eid)
      }
    }
  }
}
