/**
 * Knockback System
 *
 * Applies knockback velocity impulses and ticks down their duration.
 * Knockback overrides normal movement for its brief duration, then
 * the component is removed and AI resumes.
 *
 * Runs for all characters (enemies can be knocked back by any source).
 */

import { defineQuery, removeComponent } from 'bitecs'
import type { GameWorld } from '../world'
import { Knockback, Velocity } from '../components'

const knockbackQuery = defineQuery([Knockback])

export function knockbackSystem(world: GameWorld, dt: number): void {
  const entities = knockbackQuery(world)

  for (const eid of entities) {
    if (Knockback.duration[eid]! > 0) {
      // Override velocity with knockback impulse
      Velocity.x[eid] = Knockback.vx[eid]!
      Velocity.y[eid] = Knockback.vy[eid]!

      Knockback.duration[eid] = Knockback.duration[eid]! - dt
      if (Knockback.duration[eid]! <= 0) {
        // Knockback expired — remove component, velocity will be overwritten by AI steering
        Velocity.x[eid] = 0
        Velocity.y[eid] = 0
        removeComponent(world, Knockback, eid)
      }
    }
  }
}
