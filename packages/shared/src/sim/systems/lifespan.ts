/**
 * Lifespan System
 *
 * Counts down Lifespan.remaining each tick and tags entities as Dead
 * when their lifespan expires.
 */

import { defineQuery, hasComponent, addComponent, removeEntity } from 'bitecs'
import type { GameWorld } from '../world'
import { Lifespan, Dead, Player } from '../components'
import { cleanupEntity } from '../entityCleanup'

const lifespanQuery = defineQuery([Lifespan])

export function lifespanSystem(world: GameWorld, dt: number): void {
  for (const eid of lifespanQuery(world)) {
    if (hasComponent(world, Dead, eid)) continue
    Lifespan.remaining[eid]! -= dt
    if (Lifespan.remaining[eid]! <= 0) {
      if (hasComponent(world, Player, eid)) {
        // Players use Dead for the downed/revive flow
        addComponent(world, Dead, eid)
      } else {
        // Non-player lifespan expiry: remove directly (not a kill — no XP/gold/hooks)
        cleanupEntity(world, eid)
        removeEntity(world, eid)
      }
    }
  }
}
