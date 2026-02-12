/**
 * Predefined obstacle patterns for map generation.
 */

import type { ObstacleTemplate } from './mapConfig'

/** 2x2 wall block */
const BLOCK_2X2: ObstacleTemplate = {
  walls: [
    { dx: 0, dy: 0 }, { dx: 1, dy: 0 },
    { dx: 0, dy: 1 }, { dx: 1, dy: 1 },
  ],
}

/** 3x2 wall block */
const BLOCK_3X2: ObstacleTemplate = {
  walls: [
    { dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 },
    { dx: 0, dy: 1 }, { dx: 1, dy: 1 }, { dx: 2, dy: 1 },
  ],
}

/** L-shape (vertical + branch right) */
const L_SHAPE: ObstacleTemplate = {
  walls: [
    { dx: 0, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: 2 },
    { dx: 1, dy: 2 },
  ],
}

/** 1x2 half-wall (provides cover without full blocking) */
const HALF_WALL_1X2: ObstacleTemplate = {
  walls: [],
  halfWalls: [
    { dx: 0, dy: 0 },
    { dx: 0, dy: 1 },
  ],
}

/** 2x1 half-wall (horizontal) */
const HALF_WALL_2X1: ObstacleTemplate = {
  walls: [],
  halfWalls: [
    { dx: 0, dy: 0 },
    { dx: 1, dy: 0 },
  ],
}

/** T-shape */
const T_SHAPE: ObstacleTemplate = {
  walls: [
    { dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 },
    { dx: 1, dy: 1 },
  ],
}

export const OBSTACLE_TEMPLATES: ObstacleTemplate[] = [
  BLOCK_2X2,
  BLOCK_2X2,   // weighted — more common
  BLOCK_3X2,
  L_SHAPE,
  L_SHAPE,
  HALF_WALL_1X2,
  HALF_WALL_2X1,
  T_SHAPE,
]
