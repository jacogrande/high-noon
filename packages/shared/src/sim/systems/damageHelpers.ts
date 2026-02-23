/**
 * Shared combat helpers.
 *
 * - forEachAliveEnemyInRadius: spatial-hash query → Enemy → Health → Dead →
 *   distance check → callback.
 * - damageMapObstacle: apply damage to a map obstacle, emit events, clear tiles
 *   on destruction.
 */

import { defineQuery, hasComponent } from 'bitecs'
import type { GameWorld } from '../world'
import { Enemy, Health, Dead, Position } from '../components'
import { forEachInRadius } from '../SpatialHash'
import { setTile, TileType } from '../tilemap'
import { isWoodObstacle, type MapObstacle } from '../content/maps/mapObstacleDefs'

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

/**
 * Apply damage to a map obstacle at the given array index.
 *
 * Emits hit/destruction events, clears tiles on death, splices the obstacle
 * from the world array, and invalidates the flow field.
 *
 * @returns true if the obstacle was destroyed (removed from array)
 */
export function damageMapObstacle(
  world: GameWorld,
  obstacleIndex: number,
  damage: number,
): boolean {
  const obs = world.mapObstacles[obstacleIndex]!
  const tilemap = world.tilemap!

  obs.hp! -= damage
  world.obstacleHits.push({
    id: obs.id,
    x: obs.x,
    y: obs.y,
    isWood: isWoodObstacle(obs.type),
  })

  if (obs.hp! <= 0) {
    for (const tile of obs.tiles) {
      setTile(tilemap, 0, tile.tileX, tile.tileY, TileType.EMPTY)
    }
    world.obstacleDestructions.push({
      id: obs.id,
      type: obs.type,
      x: obs.x,
      y: obs.y,
    })
    world.mapObstacles.splice(obstacleIndex, 1)
    if (world.flowField) {
      world.flowField.seedKey = ''
    }
    return true
  }

  return false
}
