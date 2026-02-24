/**
 * Root Debuff System
 *
 * Prevents all movement while active. Broken by rolling.
 * Decrements duration each tick and removes when expired.
 * Runs after slowDebuffSystem, before enemySteeringSystem.
 */

import { defineQuery, removeComponent } from 'bitecs'
import type { GameWorld } from '../world'
import { Root, Velocity } from '../components'

const rootQuery = defineQuery([Root, Velocity])

export function rootSystem(world: GameWorld, dt: number): void {
  const rooted = rootQuery(world)

  for (const eid of rooted) {
    Root.duration[eid]! -= dt

    if (Root.duration[eid]! <= 0) {
      removeComponent(world, Root, eid)
      continue
    }

    // While rooted: zero velocity (override any steering)
    Velocity.x[eid] = 0
    Velocity.y[eid] = 0
  }
}
