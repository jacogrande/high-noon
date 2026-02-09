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

/** Per-world cache — reuses a single array per world, invalidated by tick + alive count */
const _aliveCache = new WeakMap<GameWorld, { tick: number; aliveCount: number; result: number[] }>()

/** Return only alive player entity IDs (no Dead component). Cached per-tick per-world. */
export function getAlivePlayers(world: GameWorld): readonly number[] {
  const all = playerQuery(world)

  // Quick alive count to detect mid-tick Dead mutations
  let aliveCount = 0
  for (const eid of all) {
    if (!hasComponent(world, Dead, eid)) aliveCount++
  }

  let entry = _aliveCache.get(world)
  if (entry && entry.tick === world.tick && entry.aliveCount === aliveCount) {
    return entry.result
  }

  if (!entry) {
    entry = { tick: -1, aliveCount: 0, result: [] }
    _aliveCache.set(world, entry)
  }

  entry.tick = world.tick
  entry.aliveCount = aliveCount
  entry.result.length = 0

  for (const eid of all) {
    if (!hasComponent(world, Dead, eid)) entry.result.push(eid)
  }
  return entry.result
}
