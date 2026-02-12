/**
 * Map generation configuration types and per-stage configs.
 */

import { TileType } from '../../tilemap'
import { OBSTACLE_TEMPLATES } from './obstacleTemplates'

export interface ObstacleTemplate {
  /** Relative tile offsets to place as WALL */
  walls: Array<{ dx: number; dy: number }>
  /** Relative tile offsets to place as HALF_WALL (optional) */
  halfWalls?: Array<{ dx: number; dy: number }>
}

export interface HazardConfig {
  tileType: number
  /** Noise threshold — higher = sparser placement */
  noiseThreshold: number
  /** Size of coarse noise grid cells (in tiles) */
  noiseCellSize: number
  /** Maximum fraction of floor tiles that can be this hazard */
  maxCoverage: number
}

export interface MapConfig {
  width: number
  height: number
  tileSize: number
  /** Radius (in tiles) around center to keep clear for spawning */
  centerClearRadius: number
  obstacles: {
    count: number
    minSpacing: number
    templates: ObstacleTemplate[]
  }
  hazards: HazardConfig[]
}

/** Stage 1: Town — 50x38, sparse lava */
export const STAGE_1_MAP_CONFIG: MapConfig = {
  width: 50,
  height: 38,
  tileSize: 32,
  centerClearRadius: 4,
  obstacles: {
    count: 8,
    minSpacing: 6,
    templates: OBSTACLE_TEMPLATES,
  },
  hazards: [
    { tileType: TileType.LAVA, noiseThreshold: 0.82, noiseCellSize: 8, maxCoverage: 0.04 },
  ],
}

/** Stage 2: Badlands — 54x42 (larger), mud clusters + sparse bramble */
export const STAGE_2_MAP_CONFIG: MapConfig = {
  width: 54,
  height: 42,
  tileSize: 32,
  centerClearRadius: 4,
  obstacles: {
    count: 10,
    minSpacing: 6,
    templates: OBSTACLE_TEMPLATES,
  },
  hazards: [
    { tileType: TileType.MUD, noiseThreshold: 0.68, noiseCellSize: 6, maxCoverage: 0.10 },
    { tileType: TileType.BRAMBLE, noiseThreshold: 0.85, noiseCellSize: 8, maxCoverage: 0.03 },
  ],
}

/** Stage 3: Canyon — 46x36 (tighter), denser lava */
export const STAGE_3_MAP_CONFIG: MapConfig = {
  width: 46,
  height: 36,
  tileSize: 32,
  centerClearRadius: 4,
  obstacles: {
    count: 12,
    minSpacing: 5,
    templates: OBSTACLE_TEMPLATES,
  },
  hazards: [
    { tileType: TileType.LAVA, noiseThreshold: 0.78, noiseCellSize: 7, maxCoverage: 0.06 },
  ],
}

/** Indexed by stage number (0, 1, 2) */
export const STAGE_MAP_CONFIGS: MapConfig[] = [
  STAGE_1_MAP_CONFIG,
  STAGE_2_MAP_CONFIG,
  STAGE_3_MAP_CONFIG,
]
