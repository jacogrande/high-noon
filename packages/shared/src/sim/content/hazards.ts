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
}

/** Get the flow-field traversal cost for a floor tile type. */
export function getFloorPathfindCost(tileType: number): number {
  return TILE_PATHFIND_COST[tileType] ?? 1
}
