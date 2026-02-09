/**
 * Spatial Hash System
 *
 * Rebuilds the spatial hash grid each tick from all entities with
 * Position + Collider. Lazy-creates the hash on first call using
 * tilemap dimensions.
 */

import { defineQuery } from 'bitecs'
import type { GameWorld } from '../world'
import { Position, Collider } from '../components'
import { createSpatialHash, rebuildSpatialHash } from '../SpatialHash'

const hashQuery = defineQuery([Position, Collider])

export function spatialHashSystem(world: GameWorld, _dt: number): void {
  if (world.simulationScope === 'local-player') return

  const tilemap = world.tilemap
  if (!tilemap) return

  // Lazy-create hash on first call
  if (!world.spatialHash) {
    const arenaWidth = tilemap.width * tilemap.tileSize
    const arenaHeight = tilemap.height * tilemap.tileSize
    world.spatialHash = createSpatialHash(arenaWidth, arenaHeight, tilemap.tileSize)
  }

  const eids = hashQuery(world)
  rebuildSpatialHash(world.spatialHash, eids, Position.x, Position.y)
}
