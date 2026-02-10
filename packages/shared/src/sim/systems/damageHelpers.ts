/**
 * Shared combat helper: iterate alive enemies within a radius.
 *
 * Centralizes the repeated pattern of spatial-hash query → Enemy check →
 * Health check → Dead check → distance check → callback.
 */

import { defineQuery, hasComponent } from 'bitecs'
import type { GameWorld } from '../world'
import { Enemy, Health, Dead, Position } from '../components'
import { forEachInRadius } from '../SpatialHash'

const enemyQuery = defineQuery([Enemy, Health, Position])

/**
 * Call `callback` for every alive enemy entity within `radius` of (`cx`, `cy`).
 *
 * @param callback receives (enemyEid, dx, dy, distSq) where dx/dy are
 *                 relative to the center and distSq is their squared length.
 */
export function forEachAliveEnemyInRadius(
  world: GameWorld,
  cx: number,
  cy: number,
  radius: number,
  callback: (enemyEid: number, dx: number, dy: number, distSq: number) => void,
): void {
  const rSq = radius * radius

  const visitEnemy = (eid: number): void => {
    if (!hasComponent(world, Enemy, eid)) return
    if (!hasComponent(world, Health, eid)) return
    if (hasComponent(world, Dead, eid)) return
    if (Health.current[eid]! <= 0) return

    const dx = Position.x[eid]! - cx
    const dy = Position.y[eid]! - cy
    const distSq = dx * dx + dy * dy
    if (distSq > rSq) return
    callback(eid, dx, dy, distSq)
  }

  // In local-player prediction/replay, entity positions can advance for several
  // ticks between authoritative hash rebuilds. Prefer direct ECS scan there.
  if (world.spatialHash && world.simulationScope !== 'local-player') {
    forEachInRadius(world.spatialHash, cx, cy, radius, visitEnemy)
    return
  }

  // Fallback for startup/prediction frames before a spatial hash exists.
  for (const eid of enemyQuery(world)) {
    visitEnemy(eid)
  }
}
