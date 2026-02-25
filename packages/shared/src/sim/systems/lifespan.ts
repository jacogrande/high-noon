/**
 * Lifespan System
 *
 * Counts down Lifespan.remaining each tick and tags entities as Dead
 * when their lifespan expires.
 */

import { defineQuery, hasComponent, addComponent } from 'bitecs'
import type { GameWorld } from '../world'
import { Lifespan, Dead } from '../components'

const lifespanQuery = defineQuery([Lifespan])

export function lifespanSystem(world: GameWorld, dt: number): void {
  for (const eid of lifespanQuery(world)) {
    if (hasComponent(world, Dead, eid)) continue
    Lifespan.remaining[eid]! -= dt
    if (Lifespan.remaining[eid]! <= 0) {
      addComponent(world, Dead, eid)
    }
  }
}
