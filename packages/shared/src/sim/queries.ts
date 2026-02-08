/**
 * Shared ECS Queries
 *
 * Common queries used by multiple systems. Defined once to avoid
 * redundant defineQuery() calls across system files.
 */

import { defineQuery, hasComponent } from 'bitecs'
import { Player, Position, Dead } from './components'
import type { GameWorld } from './world'

/** Player entity with position — used by enemy AI, steering, detection, flow field */
export const playerQuery = defineQuery([Player, Position])

/**
 * Per-world cache for getAlivePlayers. Avoids allocating per-call within the
 * same stepWorld tick. Keyed on (tick, aliveCount) so that mid-tick death
 * component additions invalidate correctly.
 */
const _aliveCache = new WeakMap<GameWorld, { tick: number; aliveCount: number; result: number[] }>()

/** Return only alive player entity IDs (no Dead component). Cached per-tick per-world. */
export function getAlivePlayers(world: GameWorld): number[] {
  const all = playerQuery(world)

  // Quick alive count (avoids full array allocation on cache hit)
  let aliveCount = 0
  for (const eid of all) {
    if (!hasComponent(world, Dead, eid)) aliveCount++
  }

  const cached = _aliveCache.get(world)
  if (cached && cached.tick === world.tick && cached.aliveCount === aliveCount) {
    return cached.result
  }

  const alive: number[] = []
  for (const eid of all) {
    if (!hasComponent(world, Dead, eid)) alive.push(eid)
  }

  _aliveCache.set(world, { tick: world.tick, aliveCount, result: alive })
  return alive
}
