/**
 * Hazard tile constants.
 */

import { TileType } from '../tilemap'

/** Lava damage per second for grounded entities. */
export const LAVA_DPS = 15

/** Mud speed multiplier (0.5x = half speed). */
export const MUD_SPEED_MUL = 0.5

/** Bramble damage per second for grounded entities. */
export const BRAMBLE_DPS = 5

/** Bramble speed multiplier (0.8x). */
export const BRAMBLE_SPEED_MUL = 0.8

/** Brimstone damage per second (Phase 2-3 crossroads hazard). */
export const BRIMSTONE_DPS = 4

/** Darkness damage per second (crossroads arena boundary). */
export const DARKNESS_DPS = 5

/** Darkness speed multiplier (0.2x = near immobile). */
export const DARKNESS_SPEED_MUL = 0.2

/** Cactus contact damage per second for grounded entities. */
export const CACTUS_DPS = 5

/**
 * Traversal cost for lava in flow-field pathing.
 * Normal walkable tiles cost 1.
 */
export const LAVA_PATHFIND_COST = 10

/** Pathfind cost table keyed by TileType. */
const TILE_PATHFIND_COST: Record<number, number> = {
  [TileType.FLOOR]: 1,
  [TileType.LAVA]: 10,
  [TileType.MUD]: 3,
  [TileType.BRAMBLE]: 5,
  [TileType.BRIMSTONE]: 8,
  [TileType.DARKNESS]: 100,
  [TileType.CACTUS]: 3,
}

/** Get the flow-field traversal cost for a floor tile type. */
export function getFloorPathfindCost(tileType: number): number {
  return TILE_PATHFIND_COST[tileType] ?? 1
}
