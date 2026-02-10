/**
 * Hazard tile system.
 *
 * Applies damage-over-time from lava to grounded entities.
 */

import { defineQuery, hasComponent } from 'bitecs'
import type { GameWorld } from '../world'
import { Position, Health, Dead, ZPosition } from '../components'
import { JUMP_AIRBORNE_THRESHOLD } from '../content/jump'
import { LAVA_DPS } from '../content/hazards'
import { getFloorTileTypeAt, TileType } from '../tilemap'

const hazardQuery = defineQuery([Position, Health])

export function hazardTileSystem(world: GameWorld, dt: number): void {
  const tilemap = world.tilemap
  if (!tilemap) return

  const entities = hazardQuery(world)
  for (const eid of entities) {
    if (world.simulationScope === 'local-player' && world.localPlayerEid >= 0 && eid !== world.localPlayerEid) {
      continue
    }

    if (hasComponent(world, Dead, eid)) continue

    const z = hasComponent(world, ZPosition, eid) ? ZPosition.z[eid]! : 0
    if (z > JUMP_AIRBORNE_THRESHOLD) continue

    const tileType = getFloorTileTypeAt(tilemap, Position.x[eid]!, Position.y[eid]!)
    if (tileType === TileType.LAVA) {
      Health.current[eid] = Health.current[eid]! - LAVA_DPS * dt
    }
  }
}
