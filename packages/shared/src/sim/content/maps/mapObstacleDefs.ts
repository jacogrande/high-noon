/**
 * Map obstacle content definitions.
 *
 * Defines destructible/indestructible obstacles placed during arena generation.
 * Obstacles stamp WALL or HALF_WALL tiles and track HP in world.mapObstacles[].
 */

/** Obstacle type enum */
export const MapObstacleType = {
  CRATE: 0,
  BARREL: 1,
  BOULDER: 2,
  FALLEN_TREE: 3,
  LOW_WALL: 4,
  FENCE_RAIL: 5,
} as const

export type MapObstacleTypeValue = (typeof MapObstacleType)[keyof typeof MapObstacleType]

/** Runtime obstacle state tracked in world.mapObstacles[] */
export interface MapObstacle {
  id: number
  type: MapObstacleTypeValue
  /** World-space center X */
  x: number
  /** World-space center Y */
  y: number
  /** Tile coordinates this obstacle occupies */
  tiles: Array<{ tileX: number; tileY: number; tileType: number }>
  /** Current HP (undefined = indestructible) */
  hp?: number
  /** Max HP for damage-state rendering */
  maxHp?: number
  /** Whether players can jump over this obstacle */
  jumpable: boolean
  /** Width in tiles */
  widthTiles: number
  /** Height in tiles */
  heightTiles: number
}

/** Obstacle destruction event for client VFX */
export interface ObstacleDestruction {
  id: number
  type: MapObstacleTypeValue
  x: number
  y: number
}

/** Obstacle hit event for client VFX */
export interface ObstacleHit {
  id: number
  x: number
  y: number
  isWood: boolean
}

/** Content definition for a placeable obstacle */
export interface MapObstacleDef {
  type: MapObstacleTypeValue
  name: string
  /** HP (undefined = indestructible) */
  hp?: number
  /** Tile offsets that become WALL */
  walls: Array<{ dx: number; dy: number }>
  /** Tile offsets that become HALF_WALL */
  halfWalls?: Array<{ dx: number; dy: number }>
  /** Whether players can jump over */
  jumpable: boolean
  widthTiles: number
  heightTiles: number
}

export const CRATE_DEF: MapObstacleDef = {
  type: MapObstacleType.CRATE,
  name: 'Crate',
  hp: 3,
  walls: [{ dx: 0, dy: 0 }],
  jumpable: false,
  widthTiles: 1,
  heightTiles: 1,
}

export const BARREL_DEF: MapObstacleDef = {
  type: MapObstacleType.BARREL,
  name: 'Barrel',
  hp: 2,
  walls: [{ dx: 0, dy: 0 }],
  jumpable: false,
  widthTiles: 1,
  heightTiles: 1,
}

export const BOULDER_DEF: MapObstacleDef = {
  type: MapObstacleType.BOULDER,
  name: 'Boulder',
  hp: 5,
  walls: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }],
  jumpable: false,
  widthTiles: 2,
  heightTiles: 1,
}

export const FALLEN_TREE_DEF: MapObstacleDef = {
  type: MapObstacleType.FALLEN_TREE,
  name: 'Fallen Tree',
  // No hp = indestructible
  halfWalls: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 }],
  walls: [],
  jumpable: true,
  widthTiles: 3,
  heightTiles: 1,
}

export const LOW_WALL_DEF: MapObstacleDef = {
  type: MapObstacleType.LOW_WALL,
  name: 'Low Wall',
  hp: 4,
  halfWalls: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }],
  walls: [],
  jumpable: true,
  widthTiles: 2,
  heightTiles: 1,
}

export const FENCE_RAIL_DEF: MapObstacleDef = {
  type: MapObstacleType.FENCE_RAIL,
  name: 'Fence Rail',
  hp: 3,
  halfWalls: [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 }],
  walls: [],
  jumpable: true,
  widthTiles: 3,
  heightTiles: 1,
}

/** Per-stage weighted obstacle pools */
export interface WeightedObstacleDef {
  def: MapObstacleDef
  weight: number
}

/** Stage 1 (Town): crates (common), barrels, low walls, fence rails */
export const STAGE_1_OBSTACLE_POOL: WeightedObstacleDef[] = [
  { def: CRATE_DEF, weight: 3 },
  { def: BARREL_DEF, weight: 2 },
  { def: LOW_WALL_DEF, weight: 1 },
  { def: FENCE_RAIL_DEF, weight: 2 },
]

/** Stage 2 (Badlands): fallen trees (common), barrels, crates, fence rails */
export const STAGE_2_OBSTACLE_POOL: WeightedObstacleDef[] = [
  { def: FALLEN_TREE_DEF, weight: 3 },
  { def: BARREL_DEF, weight: 1 },
  { def: CRATE_DEF, weight: 1 },
  { def: FENCE_RAIL_DEF, weight: 1 },
]

/** Stage 3 (Canyon): boulders (common), crates */
export const STAGE_3_OBSTACLE_POOL: WeightedObstacleDef[] = [
  { def: BOULDER_DEF, weight: 3 },
  { def: CRATE_DEF, weight: 2 },
]

/** Lookup table: obstacle type → whether it uses wood destruction particles.
 *  When adding a new MapObstacleType, add an explicit case here. */
export function isWoodObstacle(type: MapObstacleTypeValue): boolean {
  switch (type) {
    case MapObstacleType.CRATE:
    case MapObstacleType.BARREL:
    case MapObstacleType.LOW_WALL:
    case MapObstacleType.FALLEN_TREE:
    case MapObstacleType.FENCE_RAIL:
      return true
    case MapObstacleType.BOULDER:
      return false
    default: {
      const _exhaustive: never = type
      console.warn('isWoodObstacle: unhandled obstacle type', _exhaustive)
      return false
    }
  }
}
